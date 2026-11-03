/*
 * Small helpers for server code: Hash, Str, Mail and signed URLs.
 *
 *   const { Hash, Str, Mail, Url } = require('somjs/server')
 *
 *   const hashed = Hash.make('secret')        // store this, never the password
 *   Hash.check('secret', hashed)              // true
 *   Str.random(40)                            // 'k3J9…' (letters and digits)
 *   await Mail.send({ to, subject, text })    // printed in the terminal until MAIL_URL is set in .env
 *   Url.signed('/verify-email/5/abc', 60)     // '/verify-email/5/abc?expires=…&signature=…'
 *   Url.check('/verify-email/5/abc', query)   // true while it hasn't expired or been changed
 */
const crypto = require('crypto');

/* ------------------------------------------------------------------ Hash */
// scrypt, built into Node.js: slow on purpose, with its own salt per password
const N = 16384, R = 8, P = 1, LEN = 64, MAX_PASSWORD_BYTES = 1024;
let dummyHashCache = null;
const Hash = {
  make(value) {
    const str = String(value);
    if (Buffer.byteLength(str, 'utf8') > MAX_PASSWORD_BYTES) {
      throw Object.assign(new Error('Password is too long (maximum 1024 bytes).'), { status: 422 });
    }
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(str, salt, LEN, { N, r: R, p: P });
    return `$scrypt$N=${N},r=${R},p=${P}$${salt.toString('base64')}$${key.toString('base64')}`;
  },
  check(value, hashed) {
    if (typeof hashed !== 'string') return false;
    const str = String(value);
    if (Buffer.byteLength(str, 'utf8') > MAX_PASSWORD_BYTES) return false;
    const m = hashed.match(/^\$scrypt\$N=(\d+),r=(\d+),p=(\d+)\$([^$]+)\$([^$]+)$/);
    if (!m) return false;
    const nVal = +m[1], rVal = +m[2], pVal = +m[3];
    if (nVal < 1024 || nVal > 1048576 || (nVal & (nVal - 1)) !== 0 || rVal < 1 || rVal > 32 || pVal < 1 || pVal > 16) return false;
    const want = Buffer.from(m[5], 'base64');
    if (want.length < 16 || want.length > 128) return false;
    const got = crypto.scryptSync(str, Buffer.from(m[4], 'base64'), want.length, { N: nVal, r: rVal, p: pVal, maxmem: 256 * nVal * rVal * 2 });
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  },
  // Constant-time dummy check when a user record does not exist, preventing timing-based email enumeration
  dummyCheck(value) {
    if (!dummyHashCache) dummyHashCache = Hash.make('som-dummy-timing-guard-password');
    return Hash.check(String(value || '').slice(0, 256), dummyHashCache);
  },
  // a quick, unsalted hash for random tokens (they are long and random already)
  sha256: (value) => crypto.createHash('sha256').update(String(value)).digest('hex'),
};

/* ------------------------------------------------------------------ Str */
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const Str = {
  random(length = 16) {
    let out = '';
    while (out.length < length) {
      for (const b of crypto.randomBytes(length)) {
        if (b < 248 && out.length < length) out += LETTERS[b % 62]; // 248 = 4 × 62: no letter comes up more often
      }
    }
    return out;
  },
  slug: (text, sep = '-') => slug(text, sep),
  uniqueSlug: (target, column, text, sep = '-') => uniqueSlug(target, column, text, sep),
  limit: (text, n = 100, end = '...') => (String(text).length > n ? String(text).slice(0, n).trimEnd() + end : String(text)),
  words: (text, n = 10, end = '...') => { const w = String(text).split(/\s+/); return w.length > n ? w.slice(0, n).join(' ') + end : String(text); },
  camel: (s) => Str.studly(s).replace(/^./, (c) => c.toLowerCase()),
  studly: (s) => String(s).replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : '')).replace(/^./, (c) => c.toUpperCase()),
  snake: (s, sep = '_') => String(s).replace(/([a-z0-9])([A-Z])/g, `$1${sep}$2`).replace(/[-\s_]+/g, sep).toLowerCase(),
  kebab: (s) => Str.snake(s, '-'),
  title: (s) => String(s).toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()),
  ucfirst: (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1),
  plural: (s) => require('./schema.js').plural(String(s)),
  singular: (s) => String(s).replace(/ies$/, 'y').replace(/(ss|sh|ch|x|z)es$/, '$1').replace(/s$/, ''),
  uuid: () => crypto.randomUUID(),
  ulid: () => { const t = Date.now().toString(32).toUpperCase().padStart(10, '0'); return t + Str.random(16).toUpperCase().replace(/[^0-9A-Z]/g, '0'); },
  contains: (s, needles) => [].concat(needles).some((n) => String(s).includes(n)),
  startsWith: (s, needles) => [].concat(needles).some((n) => String(s).startsWith(n)),
  endsWith: (s, needles) => [].concat(needles).some((n) => String(s).endsWith(n)),
  after: (s, search) => { const i = String(s).indexOf(search); return i < 0 ? String(s) : String(s).slice(i + search.length); },
  before: (s, search) => { const i = String(s).indexOf(search); return i < 0 ? String(s) : String(s).slice(0, i); },
  between: (s, a, b) => Str.before(Str.after(s, a), b),
  mask: (s, char = '*', from = 0, length) => { s = String(s); const end = length == null ? s.length : from + length; return s.slice(0, from) + char.repeat(Math.max(0, Math.min(end, s.length) - from)) + s.slice(end); },
  padLeft: (s, n, c = ' ') => String(s).padStart(n, c),
  padRight: (s, n, c = ' ') => String(s).padEnd(n, c),
  squish: (s) => String(s).replace(/\s+/g, ' ').trim(),
  is: (pattern, s) => new RegExp('^' + String(pattern).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$').test(String(s)),
};

/* ------------------------------------------------------------------ the app key */
// APP_KEY in .env signs links. Without one, links work until the server restarts.
let fallbackKey = null;
function appKey() {
  const k = process.env.APP_KEY;
  // In production a missing or weak key is an error, not a warning: sessions and signed links would
  // either break on every restart (each process makes its own key) or rest on a guessable secret.
  const production = process.env.APP_ENV === 'production' || process.env.NODE_ENV === 'production';
  if (k) {
    const buf = k.startsWith('base64:') ? Buffer.from(k.slice(7), 'base64') : Buffer.from(k);
    if (buf.length >= 16) return buf;
    if (production) throw new Error('APP_KEY is shorter than 16 bytes. Run `som key:generate` and put the new key in .env.');
    console.warn('  APP_KEY in .env is shorter than 16 bytes; run `som key:generate` for a 256-bit key.');
    return buf;
  }
  if (production) throw new Error('APP_KEY is not set. Run `som key:generate` and put the key in .env (production needs one that every process shares).');
  if (!fallbackKey) {
    fallbackKey = crypto.randomBytes(32);
    console.warn('  No APP_KEY in .env: signed links stop working when the server restarts.');
  }
  return fallbackKey;
}

/* ------------------------------------------------------------------ Url */
const canonicalSignedTarget = (rawPath, extraParams = {}) => {
  const str = String(rawPath || '/');
  const qIdx = str.indexOf('?');
  const basePath = qIdx < 0 ? str : str.slice(0, qIdx);
  const params = new URLSearchParams(qIdx < 0 ? '' : str.slice(qIdx + 1));
  for (const [k, v] of Object.entries(extraParams)) {
    if (v !== undefined) params.set(k, String(v));
  }
  params.sort();
  const qs = params.toString();
  return basePath + (qs ? '?' + qs : '');
};

const Url = {
  // the address of the app, for links in emails: APP_URL in .env
  to(path = '/') {
    const base = (process.env.APP_URL || 'http://localhost:8000').replace(/\/+$/, '');
    return base + '/' + String(path).replace(/^\/+/, '');
  },
  // a link that only works unchanged and, with minutes, until it expires
  signed(path, minutes = null) {
    const extra = minutes != null ? { expires: Math.floor(Date.now() / 1000) + Number(minutes) * 60 } : {};
    const target = canonicalSignedTarget(path, extra);
    return `${target}${target.includes('?') ? '&' : '?'}signature=${sign(target)}`;
  },
  // check(path, { expires, signature, …the rest of the query })
  check(path, query = {}) {
    const { signature, ...rest } = query || {};
    if (!signature || typeof signature !== 'string') return false;
    const target = canonicalSignedTarget(path, rest);
    const want = Buffer.from(sign(target));
    const got = Buffer.from(String(signature));
    if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return false;
    if (rest.expires !== undefined) {
      const exp = Number(rest.expires);
      if (!Number.isFinite(exp) || exp * 1000 <= Date.now()) return false;
    }
    return true;
  },
};
const sign = (text) => crypto.createHmac('sha256', appKey()).update(text).digest('hex');

/* ------------------------------------------------------------------ Mail */
// MAIL_URL=smtp://user:password@smtp.example.com:587 in .env (and npm i nodemailer) sends real email.
// Without it, the email is printed in the terminal (log driver).
let transport = null;
const cleanMailHeader = (v) => (v == null ? v : String(v).replace(/[\r\n\0]+/g, ' ').trim());
const Mail = {
  async send({ to, subject = '', text = '', html, from, cc, bcc, replyTo, attachments } = {}) {
    from = cleanMailHeader(from || process.env.MAIL_FROM || `"${String(process.env.APP_NAME || 'App').replace(/[\r\n"\\]+/g, '')}" <hello@example.com>`);
    to = cleanMailHeader(to);
    cc = cleanMailHeader(cc);
    bcc = cleanMailHeader(bcc);
    replyTo = cleanMailHeader(replyTo);
    subject = cleanMailHeader(subject);
    if (process.env.MAIL_URL) {
      if (!transport) {
        let nodemailer;
        try { nodemailer = require(require.resolve('nodemailer', { paths: [process.cwd()] })); } catch (_) {
          throw new Error('MAIL_URL is set: install the mailer with  som add nodemailer');
        }
        transport = nodemailer.createTransport(process.env.MAIL_URL);
      }
      return transport.sendMail({ from, to, cc, bcc, replyTo, subject, text, html, attachments });
    }
    const line = '  ' + '─'.repeat(60);
    console.log(`\n${line}\n  Email to ${to}: ${subject}\n${line}\n${String(text).replace(/^/gm, '  ')}\n${line}\n  (set MAIL_URL in .env to send real email)\n`);
    Mail.sent.push({ to, subject, text, html, from, at: new Date() });
    if (Mail.sent.length > 50) Mail.sent.shift();
    return { logged: true };
  },
  // the last emails that were printed (handy in tests)
  sent: [],
};

/* ------------------------------------------------------------------ Crypt */
// Crypt.encryptString('secret') → a string only this app (its APP_KEY) can read back, and notice if changed
const Crypt = {
  encryptString(value) {
    const key = crypto.createHash('sha256').update(appKey()).digest();
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
    const data = Buffer.concat([c.update(String(value), 'utf8'), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), data]).toString('base64url');
  },
  decryptString(payload) {
    try {
      const buf = Buffer.from(String(payload), 'base64url');
      if (buf.length < 28) throw new Error('Payload too short.');
      const key = crypto.createHash('sha256').update(appKey()).digest();
      const d = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12), { authTagLength: 16 });
      d.setAuthTag(buf.subarray(12, 28));
      return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
    } catch (_) { throw Object.assign(new Error('The payload is invalid.'), { status: 400 }); }
  },
  encrypt: (value) => Crypt.encryptString(JSON.stringify(value)),
  decrypt: (payload) => require('../safe-json.js').parseJson(Crypt.decryptString(payload)),
};

/* ------------------------------------------------------------------ Log */
// Log.info('Order placed', { id }) → the terminal and storage/logs/som.log (LOG_LEVEL in .env: debug, info, warning, error)
const LEVELS = { debug: 0, info: 1, notice: 2, warning: 3, error: 4, critical: 5 };
let logDir = null;
function getLogDir() {
  if (logDir) return logDir;
  try {
    const base = require('./app.js').baseDir() || process.cwd();
    return require('path').join(base, 'storage', 'logs');
  } catch (_) {
    return require('path').join(process.cwd(), 'storage', 'logs');
  }
}
const Log = {
  setDirectory(dir) { logDir = dir; },
  getDirectory() { return getLogDir(); },
  path() { return require('path').join(getLogDir(), 'som.log'); },
  write(level, message, context) {
    if (LEVELS[level] < (LEVELS[(process.env.LOG_LEVEL || 'debug').toLowerCase()] ?? 0)) return;
    const time = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const envName = String(process.env.APP_ENV || process.env.NODE_ENV || 'local').replace(/[\r\n\x00-\x1f\x7f]+/g, '');
    const safeMsg = String(message ?? '').replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
    const ctxStr = context && Object.keys(context).length ? ' ' + JSON.stringify(context).replace(/[\r\n\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '') : '';
    const line = `[${time}] ${envName}.${level.toUpperCase()}: ${safeMsg}${ctxStr}`;
    if (process.env.LOG_CHANNEL !== 'file') (level === 'error' || level === 'critical' ? console.error : console.log)('  ' + line);
    if (process.env.LOG_CHANNEL !== 'stderr') {
      const dir = getLogDir();
      try {
        require('fs').mkdirSync(dir, { recursive: true });
        require('fs').appendFileSync(require('path').join(dir, 'som.log'), line + '\n');
      } catch (_) { /* no place to write */ }
    }
  },
  clear() {
    const f = require('path').join(getLogDir(), 'som.log');
    try { if (require('fs').existsSync(f)) require('fs').writeFileSync(f, ''); return true; } catch (_) { return false; }
  },
};
for (const level of Object.keys(LEVELS)) Log[level] = (message, context) => Log.write(level, message, context);

/* ------------------------------------------------------------------ Lang (i18n & l10n) */
// Laravel-compatible translation from the [lang] folder:
//   lang/en/auth.json         → __('auth.failed')
//   lang/en/messages.json     → __('messages.welcome', { name: 'Maxamuud' })
//   lang/en.json              → __('Sign In')
//   Pluralization             → transChoice('messages.items', 5) or trans_choice(...)
const langHelper = require('../lang.js');
let langDir = null;
let diskScanned = false;
const memoryTranslations = new Map();

function ensureDiskLoaded() {
  if (diskScanned) return;
  const dirs = langDir ? [langDir, ...langHelper.findLangDirs()] : langHelper.findLangDirs();
  const diskData = langHelper.scanLangDir(dirs);
  for (const [loc, dict] of Object.entries(diskData)) {
    const existing = memoryTranslations.get(loc) || {};
    memoryTranslations.set(loc, { ...existing, ...dict });
  }
  diskScanned = true;
}

const Lang = {
  setDirectory(dir) {
    langDir = dir;
    diskScanned = false;
  },
  getDirectory() {
    return langDir || (langHelper.findLangDirs()[0] || null);
  },
  locale: () => Lang.current || process.env.APP_LOCALE || 'en',
  setLocale(l) { Lang.current = l ? String(l).trim() : null; },
  fallbackLocale: () => Lang._fallback || process.env.APP_FALLBACK_LOCALE || 'en',
  setFallbackLocale(l) { Lang._fallback = l ? String(l).trim() : null; },
  translations(locale, dict) {
    if (!dict && typeof locale === 'object') {
      for (const [l, d] of Object.entries(locale)) Lang.translations(l, d);
      return Lang;
    }
    if (!locale) return Lang;
    const loc = String(locale).toLowerCase();
    const existing = memoryTranslations.get(loc) || {};
    memoryTranslations.set(loc, { ...existing, ...dict });
    return Lang;
  },
  all(locale = Lang.locale()) {
    ensureDiskLoaded();
    const loc = String(locale || Lang.locale()).toLowerCase();
    return memoryTranslations.get(loc) || {};
  },
  dir(locale = Lang.locale()) { return langHelper.dir(locale); },
  isRtl(locale = Lang.locale()) { return langHelper.isRtl(locale); },
  get(key, replace = {}, locale = Lang.locale()) {
    ensureDiskLoaded();
    const loc = String(locale || Lang.locale()).toLowerCase();
    const fallback = String(Lang.fallbackLocale()).toLowerCase();
    const strKey = String(key || '');

    const lookupInDict = (dict, k) => {
      if (!dict || typeof dict !== 'object') return undefined;
      // 1. Direct exact key match (JSON translation string, e.g. __('Sign In') or __('auth.failed'))
      if (dict[k] !== undefined && !['__proto__', 'constructor', 'prototype'].includes(k)) return dict[k];
      // 2. Group and nested path match: 'auth.failed' -> dict['auth']['failed']
      const parts = k.split('.');
      let cur = dict;
      for (const p of parts) {
        if (!p || ['__proto__', 'constructor', 'prototype'].includes(p) || cur == null || typeof cur !== 'object') return undefined;
        cur = cur[p];
      }
      return cur;
    };

    let text = lookupInDict(memoryTranslations.get(loc), strKey);
    if (text === undefined && loc !== fallback) text = lookupInDict(memoryTranslations.get(fallback), strKey);
    if (text === undefined) return key;
    if (typeof text !== 'string') return text;

    return langHelper.replacePlaceholders(text, replace);
  },
  choice(key, number, replace = {}, locale = Lang.locale()) {
    const raw = Lang.get(key, {}, locale);
    const chosen = langHelper.choose(raw, number, locale);
    const fullReplace = { count: number, ...replace };
    return langHelper.replacePlaceholders(chosen, fullReplace);
  },
  has(key, locale = Lang.locale()) {
    return Lang.get(key, {}, locale) !== key;
  },
  formatNumber(n, options, locale = Lang.locale()) {
    return new Intl.NumberFormat(locale, options).format(n);
  },
  formatCurrency(amount, currency = 'USD', locale = Lang.locale()) {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
  },
  formatDate(date, options, locale = Lang.locale()) {
    return new Intl.DateTimeFormat(locale, options).format(date instanceof Date ? date : new Date(date));
  },
};
const __ = (key, replace, locale) => Lang.get(key, replace, locale);
const trans = (key, replace, locale) => Lang.get(key, replace, locale);
const transChoice = (key, number, replace, locale) => Lang.choice(key, number, replace, locale);
const trans_choice = transChoice;

/* ------------------------------------------------------------------ Http (a client for other APIs) */
// const res = await Http.withToken(t).get('https://api.example.com/users', { page: 2 });  res.ok  res.status  res.json()
function makeHttp(opts = { headers: {}, timeout: 30000 }) {
  const send = async (method, url, data) => {
    let full = (opts.baseUrl ? opts.baseUrl.replace(/\/+$/, '') + '/' + String(url).replace(/^\/+/, '') : url);
    const init = { method, headers: { Accept: 'application/json', ...opts.headers }, signal: AbortSignal.timeout(opts.timeout) };
    if (method === 'GET' || method === 'DELETE') { if (data) full += (full.includes('?') ? '&' : '?') + new URLSearchParams(data); }
    else if (data !== undefined) { init.body = opts.asForm ? new URLSearchParams(data) : JSON.stringify(data); init.headers['Content-Type'] = opts.asForm ? 'application/x-www-form-urlencoded' : 'application/json'; }
    const r = await fetch(full, init);
    const text = await r.text();
    const res = { status: r.status, ok: r.ok, successful: r.ok, failed: !r.ok, headers: Object.fromEntries(r.headers), body: () => text, json: () => { try { return JSON.parse(text); } catch (_) { return null; } } };
    if (opts.throwOnError && !r.ok) throw Object.assign(new Error(`HTTP ${r.status} from ${full}`), { status: r.status, response: res });
    return res;
  };
  const with_ = (more) => makeHttp({ ...opts, ...more, headers: { ...opts.headers, ...(more.headers || {}) } });
  return {
    get: (url, query) => send('GET', url, query),
    post: (url, data) => send('POST', url, data),
    put: (url, data) => send('PUT', url, data),
    patch: (url, data) => send('PATCH', url, data),
    delete: (url, query) => send('DELETE', url, query),
    withToken: (token, type = 'Bearer') => with_({ headers: { Authorization: `${type} ${token}` } }),
    withHeaders: (headers) => with_({ headers }),
    baseUrl: (baseUrl) => with_({ baseUrl }),
    timeout: (seconds) => with_({ timeout: seconds * 1000 }),
    asForm: () => with_({ asForm: true }),
    throw: () => with_({ throwOnError: true }),
  };
}
const Http = makeHttp();

// env('APP_NAME', 'My app') and now()
const env = (key, fallback = null) => {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  return ({ true: true, false: false, null: null, '(true)': true, '(false)': false })[v] ?? v;
};
const now = () => new Date();

/* ------------------------------------------------------------------ TOTP (two-factor codes) */
// The 6-digit codes of authenticator apps (Google Authenticator, 1Password, Authy…), RFC 6238.
//   const secret = TOTP.secret()                       // store it encrypted: Crypt.encryptString(secret)
//   TOTP.url(secret, user.email)                       // otpauth://… for the app (a link or a QR code)
//   TOTP.verify(secret, '123456')                      // true within ±30 seconds
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const base32 = {
  encode(buf) { let bits = '', out = ''; for (const b of buf) bits += b.toString(2).padStart(8, '0'); for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)]; return out; },
  decode(str) { let bits = ''; for (const c of String(str).toUpperCase().replace(/[^A-Z2-7]/g, '')) bits += B32.indexOf(c).toString(2).padStart(5, '0'); const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); },
};
const usedTotpCodes = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, exp] of usedTotpCodes) if (exp < now) usedTotpCodes.delete(k);
}, 60000).unref();

const TOTP = {
  secret: (bytes = 20) => base32.encode(crypto.randomBytes(bytes)),
  code(secret, at = Date.now()) {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
    const h = crypto.createHmac('sha1', base32.decode(secret)).update(counter).digest();
    const o = h[h.length - 1] & 0xf;
    return String(((h.readUInt32BE(o) & 0x7fffffff) % 1000000)).padStart(6, '0');
  },
  verify(secret, code, window = 1, { replayProtection = true } = {}) {
    const given = String(code || '').replace(/\s/g, '');
    if (!/^\d{6}$/.test(given)) return false;
    const nowMs = Date.now();
    for (let w = -window; w <= window; w++) {
      const slotTime = nowMs + w * 30000;
      const want = TOTP.code(secret, slotTime);
      if (crypto.timingSafeEqual(Buffer.from(want), Buffer.from(given))) {
        if (replayProtection) {
          const slot = Math.floor(slotTime / 1000 / 30);
          const key = crypto.createHash('sha256').update(`${secret}:${slot}:${given}`).digest('hex');
          if (usedTotpCodes.has(key)) return false;
          if (usedTotpCodes.size >= 10000) usedTotpCodes.delete(usedTotpCodes.keys().next().value);
          usedTotpCodes.set(key, nowMs + (window + 2) * 30000);
        }
        return true;
      }
    }
    return false;
  },
  url: (secret, label, issuer = process.env.APP_NAME || 'App') => `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`,
  // ten one-time codes for when the phone is lost: 'a1b2c-d3e4f'
  recoveryCodes: (n = 8) => Array.from({ length: n }, () => `${Str.random(5).toLowerCase()}-${Str.random(5).toLowerCase()}`),
};

const makeSlug = (text, sep = '-') => {
  const escapedSep = String(sep).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, sep)
    .replace(new RegExp(`^${escapedSep}+|${escapedSep}+$`, 'g'), '');
};

const uniqueSlug = async (target, column, text, sep = '-') => {
  const base = makeSlug(text, sep);
  if (!base) return '';
  const { Builder } = require('./query.js');
  const table = typeof target === 'string' ? target : (target && target.table ? target.table : String(target));
  const query = new Builder(table);
  const rows = await query.where(column, 'like', `${base}%`).select(column).get();
  const existing = new Set(rows.map((r) => r[column]));
  if (!existing.has(base)) return base;
  let counter = 1;
  while (existing.has(`${base}${sep}${counter}`)) {
    counter++;
  }
  return `${base}${sep}${counter}`;
};

const slug = Object.assign(
  (text, sep = '-') => makeSlug(text, sep),
  {
    unique: uniqueSlug,
  }
);

/* ------------------------------------------------------------------ SEO */
const escAttr = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const SEO = {
  renderTags(options = {}) {
    const o = typeof options === 'string' ? { title: options } : options;
    const tags = [];
    if (o.title) tags.push(`<title>${escAttr(o.title)}</title>`);
    if (o.description) tags.push(`<meta name="description" content="${escAttr(o.description)}">`);
    if (o.keywords) tags.push(`<meta name="keywords" content="${escAttr(Array.isArray(o.keywords) ? o.keywords.join(', ') : o.keywords)}">`);
    if (o.author) tags.push(`<meta name="author" content="${escAttr(o.author)}">`);
    if (o.robots) tags.push(`<meta name="robots" content="${escAttr(o.robots)}">`);
    if (o.canonical) tags.push(`<link rel="canonical" href="${escAttr(o.canonical)}">`);
    const alts = Array.isArray(o.alternates) ? o.alternates : Object.entries(o.alternates || {}).map(([hreflang, href]) => ({ hreflang, href }));
    for (const { hreflang, href } of alts) if (hreflang && href) tags.push(`<link rel="alternate" hreflang="${escAttr(hreflang)}" href="${escAttr(href)}">`);

    // OpenGraph
    const og = o.og || o.openGraph || {};
    const ogTitle = og.title || o.title;
    const ogDesc = og.description || o.description;
    const ogImage = og.image || o.image;
    const ogUrl = og.url || o.canonical;
    const ogType = og.type || 'website';
    const ogSite = og.siteName || og.site_name || o.siteName || o.site_name;

    if (ogTitle) tags.push(`<meta property="og:title" content="${escAttr(ogTitle)}">`);
    if (ogDesc) tags.push(`<meta property="og:description" content="${escAttr(ogDesc)}">`);
    if (ogImage) tags.push(`<meta property="og:image" content="${escAttr(ogImage)}">`);
    if (ogUrl) tags.push(`<meta property="og:url" content="${escAttr(ogUrl)}">`);
    if (ogType) tags.push(`<meta property="og:type" content="${escAttr(ogType)}">`);
    if (ogSite) tags.push(`<meta property="og:site_name" content="${escAttr(ogSite)}">`);

    // Twitter
    const tw = o.twitter || {};
    const twCard = tw.card || (ogImage ? 'summary_large_image' : 'summary');
    const twTitle = tw.title || ogTitle;
    const twDesc = tw.description || ogDesc;
    const twImage = tw.image || ogImage;

    if (twCard) tags.push(`<meta name="twitter:card" content="${escAttr(twCard)}">`);
    if (twTitle) tags.push(`<meta name="twitter:title" content="${escAttr(twTitle)}">`);
    if (twDesc) tags.push(`<meta name="twitter:description" content="${escAttr(twDesc)}">`);
    if (twImage) tags.push(`<meta name="twitter:image" content="${escAttr(twImage)}">`);
    if (tw.site) tags.push(`<meta name="twitter:site" content="${escAttr(tw.site)}">`);
    if (tw.creator) tags.push(`<meta name="twitter:creator" content="${escAttr(tw.creator)}">`);

    // JSON-LD Schema
    if (o.schema || o.jsonLd) {
      const s = o.schema || o.jsonLd;
      const rawJson = typeof s === 'string' ? s : JSON.stringify(s);
      const safeJson = String(rawJson).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
      tags.push(`<script type="application/ld+json">${safeJson}</script>`);
    }

    return tags.join('\n');
  },
  // routes: '/path' or { path, lastmod, changefreq, priority }. A lastmod is only written when you give one:
  // a date that is always "today" tells search engines nothing and teaches them to ignore it.
  sitemap(routes = [], { baseUrl = 'http://localhost' } = {}) {
    const cleanBase = baseUrl.replace(/\/+$/, '');
    const seen = new Set();
    const urls = [];
    for (const r of routes) {
      const path = typeof r === 'string' ? r : r.path || '/';
      if (/[:*]/.test(path)) continue; // a pattern, not an address
      const loc = `${cleanBase}${path.startsWith('/') ? path : '/' + path}`;
      if (seen.has(loc)) continue;
      seen.add(loc);
      const o = typeof r === 'object' ? r : {};
      const alts = Array.isArray(o.alternates) ? o.alternates : Object.entries(o.alternates || {}).map(([hreflang, href]) => ({ hreflang, href }));
      for (const a of alts) { if (a.href && !/^https?:\/\//.test(a.href)) a.href = cleanBase + (a.href.startsWith('/') ? a.href : '/' + a.href); }
      const lastmod = o.lastmod instanceof Date ? o.lastmod.toISOString().slice(0, 10) : typeof o.lastmod === 'string' ? o.lastmod.replace(/^(\d{4}-\d{2}-\d{2})[ T].*$/, '$1') : o.lastmod; // a database date like 2026-01-02 10:00:00 becomes 2026-01-02
      urls.push(`  <url>\n    <loc>${escAttr(loc)}</loc>` +
        (lastmod ? `\n    <lastmod>${escAttr(lastmod)}</lastmod>` : '') +
        (o.changefreq ? `\n    <changefreq>${escAttr(o.changefreq)}</changefreq>` : '') +
        (o.priority != null ? `\n    <priority>${escAttr(o.priority)}</priority>` : '') +
        alts.filter((a) => a.hreflang && a.href).map((a) => `\n    <xhtml:link rel="alternate" hreflang="${escAttr(a.hreflang)}" href="${escAttr(a.href)}"/>`).join('') +
        '\n  </url>');
    }
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`;
  },
  robots({ allow = '/', disallow = [], sitemapUrl = null } = {}) {
    const lines = ['User-agent: *'];
    if (allow) lines.push(`Allow: ${allow}`);
    for (const d of [].concat(disallow || [])) if (d) lines.push(`Disallow: ${d}`);
    if (sitemapUrl) lines.push(`\nSitemap: ${sitemapUrl}`);
    return lines.join('\n') + '\n';
  },
};

module.exports = { Hash, Str, slug, uniqueSlug, Url, Mail, Crypt, Log, Lang, __, trans, transChoice, trans_choice, Http, env, now, appKey, TOTP, SEO };
