/*
 * Whole pages for crawlers and link previews: the server answers them with the page already drawn.
 *
 * A search engine or a chat app that does not run JavaScript would see an empty <div id="app">. For those
 * visitors the server opens the page in a simulated browser (the same one `kreftjs build --prerender` uses),
 * waits until its data has loaded, and answers with the result. Everyone else gets the normal page.
 *
 *   KREFT_SSR=bots   (default) crawlers and link-preview bots only
 *   KREFT_SSR=all    every visitor (the browser then starts Kreft on top of the drawn page)
 *   KREFT_SSR=off    never
 *   KREFT_SSR_TTL    seconds a drawn page is kept (default 300)
 *
 * Needs jsdom (npm i -D jsdom). Without it, or when a page fails or is too slow, the normal page is sent.
 * If the app answers with its 404 page (errors/404.kreftjs), the response status is 404 too.
 *
 * The simulated browser asks this same server, so its requests carry a secret User-Agent (new on every start):
 * the server never draws them again, and lets them through the HTTPS redirect.
 */
const crypto = require('crypto');

const BOT = /bot\b|crawl|spider|slurp|facebookexternalhit|facebot|embedly|whatsapp|telegram|twitterbot|linkedinbot|pinterest|discord|slack|skype|vkshare|w3c_validator|lighthouse|bingpreview|google-inspectiontool|duckduckgo|yandex|baidu|applebot|petalbot|semrush|ahrefs|mj12/i;
const MAX_ACTIVE = 2;        // pages drawn at the same time
const MAX_WAITING = 20;      // requests waiting for their turn; more than that get the normal page
const WAIT_MS = 15000;       // the longest a request waits for its turn
const DRAW_MS = 15000;       // the longest one page may take
const FAILED_MS = 30000;     // a page that failed is not tried again for this long
const MAX_CACHED = 200;

// '/posts/café 1' → '/posts/caf%C3%A9%201' (the address the server saw was already decoded)
const encodePath = (p) => p.split('/').map((s) => encodeURIComponent(s)).join('/');
const decode = (p) => { try { return decodeURIComponent(p); } catch (_) { return p; } };
const trimSlash = (p) => (p.length > 1 ? p.replace(/\/+$/, '') : p);

function create({ root, origin, log = () => { }, cached = true }) {
  const mode = String((process.env.KREFT_SSR || process.env.SOM_SSR) || 'bots').toLowerCase();
  const ttl = cached ? (Number((process.env.KREFT_SSR_TTL || process.env.SOM_SSR_TTL)) || 300) * 1000 : 0; // kreftjs dev: always the latest files
  const userAgent = 'kreft-ssr/' + crypto.randomBytes(16).toString('hex');
  const cache = new Map();    // address → { at, html, status }
  const failed = new Map();   // address → when it failed
  const inflight = new Map(); // address → the promise of the page being drawn (a second request waits for it)
  const waiting = [];
  let active = 0, jsdom, unavailable = false;

  function load() {
    if (jsdom || unavailable) return jsdom;
    try { jsdom = require('./prerender.js').loadJsdom(root); } catch (_) {
      unavailable = true;
      if (mode !== 'off') log('  SSR for crawlers needs jsdom: kreftjs add -D jsdom (crawlers get the normal page until then)');
    }
    return jsdom;
  }

  // the simulated browser itself (its requests are never drawn, and are let through the HTTPS redirect)
  const isInternal = (req) => req.headers['user-agent'] === userAgent;

  // should this request get a drawn page?
  function wants(req) {
    if (mode === 'off' || req.method !== 'GET' || isInternal(req)) return false;
    return mode === 'all' || BOT.test(String(req.headers['user-agent'] || ''));
  }

  function acquire() {
    if (active < MAX_ACTIVE) { active++; return Promise.resolve(true); }
    if (waiting.length >= MAX_WAITING) return Promise.resolve(false);
    return new Promise((ok) => {
      const w = { ok, timer: setTimeout(() => { waiting.splice(waiting.indexOf(w), 1); ok(false); }, WAIT_MS) };
      waiting.push(w);
    });
  }
  function release() {
    const next = waiting.shift();
    if (next) { clearTimeout(next.timer); next.ok(true); } // the slot passes on
    else active--;
  }

  async function draw(urlPath, search) {
    const jsdomModule = load();
    const { JSDOM } = jsdomModule;
    const { createRenderer, compose } = require('./prerender.js');
    const base = origin();
    const render = createRenderer({ jsdom: jsdomModule, origin: base, basePath: '/', maxWait: 5000, userAgent, external: false });
    const encoded = encodePath(urlPath) + search;
    const [page, res] = await Promise.all([
      render(encoded),
      fetch(base + encoded, { headers: { 'User-Agent': userAgent, Accept: 'text/html' } }),
    ]);
    if (res.status !== 200 || !page.html || !page.id) return null; // not a page of the app (or a 404 from seo.js: the plain shell is enough)
    if (!page.errorStatus && trimSlash(decode(page.path)) !== trimSlash(urlPath)) return null; // the router sent it elsewhere
    const doc = compose(JSDOM, await res.text(), page, urlPath);
    return { html: '<!doctype html>\n' + doc.documentElement.outerHTML + '\n', status: page.errorStatus || 200 };
  }

  // { html, status } for a page address, or null (send the normal page)
  async function render(urlPath, search = '') {
    if (!load()) return null;
    const key = urlPath + search;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit;
    if (failed.has(key) && Date.now() - failed.get(key) < FAILED_MS) return hit || null;
    if (inflight.has(key)) return inflight.get(key);

    const job = (async () => {
      if (!(await acquire())) return hit || null; // too many waiting: the normal page
      let timer;
      try {
        const out = await Promise.race([
          draw(urlPath, search),
          new Promise((_, no) => { timer = setTimeout(() => no(new Error('took longer than ' + DRAW_MS / 1000 + ' s')), DRAW_MS); }),
        ]);
        if (!out) { failed.set(key, Date.now()); return null; }
        const entry = { at: Date.now(), ...out };
        cache.delete(key);
        cache.set(key, entry);
        if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value);
        return entry;
      } catch (e) {
        failed.set(key, Date.now());
        log('  SSR ' + key + ': ' + String(e && e.message || e).split('\n')[0]);
        return hit || null;
      } finally {
        clearTimeout(timer);
        release();
        if (failed.size > MAX_CACHED) failed.delete(failed.keys().next().value);
      }
    })();
    inflight.set(key, job);
    try { return await job; } finally { inflight.delete(key); }
  }

  return { wants, render, isInternal, clear: () => { cache.clear(); failed.clear(); } };
}

module.exports = { create, BOT, encodePath };
