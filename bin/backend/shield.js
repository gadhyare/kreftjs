/*
 * Kreft Shield: automatic protection against floods and abuse from a single address.
 *
 *   SHIELD=true          in .env turns it on (off by default). Changes to .env apply without a restart.
 *
 * What it does, per visitor address (the same req.ip() that throttle uses, so TRUSTED_PROXIES applies):
 *   1. Rate limit: more than SHIELD_MAX_REQUESTS (300) in SHIELD_WINDOW_SEC (10) seconds → 429 + Retry-After.
 *      Responses that look like probing (401, 403, 404, 405) count SHIELD_ERROR_WEIGHT (5) times, so scanners
 *      and password guessers hit the limit sooner than normal visitors.
 *   2. Concurrency: more than SHIELD_MAX_CONCURRENT (60) requests of one address in flight at once → 429.
 *   3. Ban: SHIELD_STRIKES (3) rate-limit hits within SHIELD_STRIKE_WINDOW_MIN (10) minutes → the address is
 *      refused for SHIELD_BAN_MINUTES (15), doubling at every repeat (up to 24 hours). Banned requests are
 *      answered with a bare 429 before any work is done.
 *   4. Connections: more than SHIELD_MAX_CONNECTIONS (100) open sockets from one address are closed at once, which
 *      stops slow-connection floods (slowloris) that never finish a request. Needs Shield.watch(server) (kreft does it).
 *   5. Overload: when the event loop lags by more than SHIELD_MAX_LAG_MS (300), limits shrink to a quarter
 *      so the server keeps answering instead of falling over.
 *
 * Never limited: SHIELD_ALLOW="1.2.3.4,5.6.7.8" and, unless SHIELD_LOCAL=true, this computer (127.0.0.1, ::1).
 * Bans live in memory: a restart clears them. For a flood bigger than one process can absorb, put a firewall
 * or CDN in front; the Shield protects the application, it does not replace network-level DDoS protection.
 *
 *   const { Shield } = require('kreftjs/server')
 *   Shield.bans()  Shield.unban('1.2.3.4')  Shield.ban('1.2.3.4', 60)  Shield.status()  Shield.on('ban', fn)
 */
const { EventEmitter } = require('events');

const events = new EventEmitter();
const ips = new Map(); // address → { windowStart, count, struck, strikes: [ms], level, lastBanAt, bannedUntil, inflight, last }
const MAX_ENTRIES = 100000;
const DAY = 86400000;

let cfgAt = 0;
let cfg = null;
let lagMonitor = null;
let lagMs = 0;
let timers = [];
let warnedProxy = false;
const conns = new Map(); // direct socket address → open connections
const stats = { blocked: 0, limited: 0, bans: 0 };

const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
const flag = (v) => ['true', '1', 'on', 'yes'].includes(String(v || '').trim().toLowerCase());

function config() {
  const now = Date.now();
  if (cfg && now - cfgAt < 2000) return cfg;
  const e = process.env;
  cfg = {
    enabled: flag(e.SHIELD),
    maxRequests: num(e.SHIELD_MAX_REQUESTS, 300),
    windowMs: num(e.SHIELD_WINDOW_SEC, 10) * 1000,
    errorWeight: num(e.SHIELD_ERROR_WEIGHT, 5),
    maxConcurrent: num(e.SHIELD_MAX_CONCURRENT, 60),
    maxConnections: num(e.SHIELD_MAX_CONNECTIONS, 100),
    strikes: num(e.SHIELD_STRIKES, 3),
    strikeWindowMs: num(e.SHIELD_STRIKE_WINDOW_MIN, 10) * 60000,
    banMs: num(e.SHIELD_BAN_MINUTES, 15) * 60000,
    maxLagMs: num(e.SHIELD_MAX_LAG_MS, 300),
    local: flag(e.SHIELD_LOCAL),
    allow: new Set(String(e.SHIELD_ALLOW || '').split(',').map((x) => x.trim().replace(/^::ffff:/, '')).filter(Boolean)),
  };
  cfgAt = now;
  return cfg;
}

const isLoopback = (ip) => ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
const normalize = (ip) => String(ip || '').replace(/^::ffff:/, '');

// One IPv6 customer owns a whole /64 (billions of addresses): counting single addresses would let an attacker
// rotate through them and never be limited. IPv6 visitors are counted by their /64 prefix, IPv4 by address.
function keyOf(ip) {
  if (!ip.includes(':')) return ip;
  const s = ip.split('%')[0];
  if (s.includes('.')) return ip; // an embedded IPv4 form: leave as is
  const dbl = s.includes('::');
  const [h, t] = s.split('::');
  const head = h ? h.split(':') : [];
  const tail = dbl && t ? t.split(':') : [];
  const fill = dbl ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (!dbl && head.length !== 8)) return ip;
  const groups = [...head, ...Array(fill).fill('0'), ...tail].map((x) => parseInt(x, 16));
  if (groups.length !== 8 || groups.some((x) => Number.isNaN(x))) return ip;
  return groups.slice(0, 4).map((x) => x.toString(16)).join(':') + '::/64';
}

function entry(ip, now) {
  let e = ips.get(ip);
  if (!e) {
    if (ips.size >= MAX_ENTRIES) prune(true);
    e = { windowStart: now, count: 0, struck: false, strikes: [], level: 0, lastBanAt: 0, bannedUntil: 0, inflight: 0, last: now };
    ips.set(ip, e);
  }
  e.last = now;
  return e;
}

// Drops addresses that are idle and not banned. `hard` also drops the oldest when the table is full.
function prune(hard = false) {
  const now = Date.now();
  for (const [ip, e] of ips) {
    if (e.bannedUntil > now || e.inflight > 0) continue;
    if (now - e.last > 10 * 60000 && (!e.lastBanAt || now - e.lastBanAt > DAY)) ips.delete(ip);
  }
  if (hard && ips.size >= MAX_ENTRIES) {
    for (const [ip, e] of ips) { if (e.bannedUntil <= now && e.inflight === 0) { ips.delete(ip); if (ips.size < MAX_ENTRIES * 0.9) break; } }
  }
}

function ensureRunning() {
  if (timers.length) return;
  try {
    const { monitorEventLoopDelay } = require('perf_hooks');
    lagMonitor = monitorEventLoopDelay({ resolution: 20 });
    lagMonitor.enable();
  } catch (_) { lagMonitor = null; }
  const t1 = setInterval(() => {
    if (lagMonitor) { lagMs = lagMonitor.percentile(99) / 1e6; lagMonitor.reset(); }
    const c = config();
    if (c.enabled && lagMs > c.maxLagMs && !ensureRunning.warned) {
      ensureRunning.warned = true;
      console.warn(`  [Kreft Shield] The server is overloaded (event loop lag ${Math.round(lagMs)} ms): per-address limits are cut to a quarter.`);
    } else if (lagMs <= c.maxLagMs) ensureRunning.warned = false;
  }, 5000);
  const t2 = setInterval(() => prune(), 60000);
  timers = [t1, t2];
  timers.forEach((t) => t.unref && t.unref());
  try { require('./gc.js').onMemoryPressure('shield', () => { const before = ips.size; prune(true); return before - ips.size; }); } catch (_) {}
}

function banEntry(ip, e, ms, reason) {
  const now = Date.now();
  e.bannedUntil = now + ms;
  e.lastBanAt = now;
  e.level++;
  e.strikes = [];
  stats.bans++;
  const info = { ip, minutes: Math.round(ms / 60000), reason, until: new Date(e.bannedUntil).toISOString(), level: e.level };
  console.warn(`  [Kreft Shield] Banned ${ip} for ${info.minutes} min (${reason}).`);
  events.emit('ban', info);
  return info;
}

function refuse(res, seconds, why) {
  stats.blocked++;
  try {
    res.writeHead(429, { 'Retry-After': String(Math.max(1, Math.ceil(seconds))), 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'close' });
    res.end(why);
  } catch (_) { try { res.destroy(); } catch (__) {} }
  return true;
}

/**
 * Call first for every request. Returns true when it already answered (the request must stop there).
 */
function guard(req, res) {
  const c = config();
  if (!c.enabled) return false;
  ensureRunning();
  let ip;
  try { ip = normalize(require('./http.js').Request.prototype.ip.call({ raw: req })); } catch (_) { ip = normalize(req.socket && req.socket.remoteAddress); }
  if (!ip) return false;
  // Behind a proxy that is not in TRUSTED_PROXIES every visitor looks like the proxy: one address (all users would
  // share one limit and one ban) or, for a proxy on this computer, loopback (which is never limited). Say so once.
  if (!warnedProxy && req.headers['x-forwarded-for'] && ip === normalize(req.socket && req.socket.remoteAddress)) {
    warnedProxy = true;
    console.warn(`  [Kreft Shield] Requests carry X-Forwarded-For, but ${ip} is not in TRUSTED_PROXIES, so the real visitor address is unknown and the Shield cannot tell visitors apart. Behind nginx, Caddy or a CDN, set TRUSTED_PROXIES in .env.`);
  }
  if (c.allow.has(ip) || (isLoopback(ip) && !c.local)) return false;

  const now = Date.now();
  const key = keyOf(ip);
  const e = entry(key, now);

  if (e.bannedUntil > now) return refuse(res, (e.bannedUntil - now) / 1000, 'Too many requests. Try again later.');
  if (e.bannedUntil && e.bannedUntil <= now) e.bannedUntil = 0;
  if (e.level && e.lastBanAt && now - e.lastBanAt > DAY) e.level = 0;

  if (now - e.windowStart >= c.windowMs) { e.windowStart = now; e.count = 0; e.struck = false; }
  e.strikes = e.strikes.filter((t) => now - t < c.strikeWindowMs);

  const overloaded = lagMs > c.maxLagMs;
  const limit = Math.max(5, Math.floor(c.maxRequests / (overloaded ? 4 : 1)));
  const concurrent = Math.max(3, Math.floor(c.maxConcurrent / (overloaded ? 4 : 1)));
  e.count++;

  const overRate = e.count > limit;
  const overConc = e.inflight >= concurrent;
  if (overRate || overConc) {
    stats.limited++;
    if (!e.struck) {
      e.struck = true;
      e.strikes.push(now);
      if (e.strikes.length >= c.strikes) {
        const ms = Math.min(DAY, c.banMs * 2 ** e.level);
        banEntry(key, e, ms, `${e.strikes.length} rate-limit hits in ${Math.round(c.strikeWindowMs / 60000)} min`);
        return refuse(res, ms / 1000, 'Too many requests. Try again later.');
      }
    }
    return refuse(res, (e.windowStart + c.windowMs - now) / 1000, 'Too many requests. Slow down.');
  }

  e.inflight++;
  let done = false;
  const finish = () => { if (done) return; done = true; e.inflight = Math.max(0, e.inflight - 1); };
  res.once('close', finish);
  res.once('finish', () => {
    // probing (wrong login, missing pages, forbidden) costs more, so scanners trip the limit early
    const s = res.statusCode;
    if (s === 401 || s === 403 || s === 404 || s === 405) e.count += c.errorWeight - 1;
    finish();
  });
  return false;
}

const Shield = {
  guard,
  enabled: () => config().enabled,
  on: (event, fn) => { events.on(event, fn); return Shield; },
  off: (event, fn) => { events.off(event, fn); return Shield; },
  /**
   * Caps open connections per direct address (call once on the http.Server). Connections from this computer or from a
   * proxy in TRUSTED_PROXIES are not capped here: they carry many visitors, and the request limits tell those apart.
   */
  watch(server) {
    server.on('connection', (sock) => {
      const c = config();
      if (!c.enabled) return;
      const ip = normalize(sock.remoteAddress);
      const trusted = String(process.env.TRUSTED_PROXIES || '').split(',').map((x) => normalize(x.trim())).filter(Boolean);
      if (!ip || c.allow.has(ip) || (isLoopback(ip) && !c.local) || trusted.includes('*') || trusted.includes(ip)) return;
      const key = keyOf(ip);
      const n = (conns.get(key) || 0) + 1;
      if (n > c.maxConnections) { stats.blocked++; sock.destroy(); return; }
      conns.set(key, n);
      sock.once('close', () => { const m = (conns.get(key) || 1) - 1; if (m <= 0) conns.delete(key); else conns.set(key, m); });
    });
    return Shield;
  },
  /** Currently banned addresses. */
  bans() {
    const now = Date.now();
    const out = [];
    for (const [ip, e] of ips) if (e.bannedUntil > now) out.push({ ip, until: new Date(e.bannedUntil).toISOString(), level: e.level, secondsLeft: Math.ceil((e.bannedUntil - now) / 1000) });
    return out;
  },
  ban(ip, minutes = 60, reason = 'manual') { const a = keyOf(normalize(ip)); return banEntry(a, entry(a, Date.now()), minutes * 60000, reason); },
  unban(ip) {
    const e = ips.get(keyOf(normalize(ip)));
    if (!e) return false;
    e.bannedUntil = 0; e.level = 0; e.strikes = []; e.count = 0; e.struck = false;
    return true;
  },
  status() {
    const c = config();
    return { enabled: c.enabled, tracked: ips.size, banned: Shield.bans().length, ...stats, eventLoopLagMs: Math.round(lagMs), overloaded: lagMs > c.maxLagMs, limits: { maxRequests: c.maxRequests, windowSec: c.windowMs / 1000, maxConcurrent: c.maxConcurrent, strikes: c.strikes, banMinutes: c.banMs / 60000 } };
  },
  /** For tests: forget everything and stop the timers. */
  reset() {
    ips.clear(); conns.clear(); warnedProxy = false; cfg = null; lagMs = 0; stats.blocked = stats.limited = stats.bans = 0;
    timers.forEach(clearInterval); timers = [];
    if (lagMonitor) { try { lagMonitor.disable(); } catch (_) {} lagMonitor = null; }
  },
};

module.exports = { Shield, _keyOf: keyOf };
