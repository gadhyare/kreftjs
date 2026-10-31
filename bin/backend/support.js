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
const N = 16384, R = 8, P = 1, LEN = 64;
const Hash = {
  make(value) {
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(String(value), salt, LEN, { N, r: R, p: P });
    return `$scrypt$N=${N},r=${R},p=${P}$${salt.toString('base64')}$${key.toString('base64')}`;
  },
  check(value, hashed) {
    if (typeof hashed !== 'string') return false;
    const m = hashed.match(/^\$scrypt\$N=(\d+),r=(\d+),p=(\d+)\$([^$]+)\$([^$]+)$/);
    if (!m) return false;
    const want = Buffer.from(m[5], 'base64');
    const got = crypto.scryptSync(String(value), Buffer.from(m[4], 'base64'), want.length, { N: +m[1], r: +m[2], p: +m[3], maxmem: 256 * +m[1] * +m[2] * 2 });
    return got.length === want.length && crypto.timingSafeEqual(got, want);
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
  if (k) return k.startsWith('base64:') ? Buffer.from(k.slice(7), 'base64') : Buffer.from(k);
  if (!fallbackKey) {
    fallbackKey = crypto.randomBytes(32);
    console.warn('  No APP_KEY in .env: signed links stop working when the server restarts.');
  }
  return fallbackKey;
}

/* ------------------------------------------------------------------ Url */
const Url = {
  // the address of the app, for links in emails: APP_URL in .env
  to(path = '/') {
    const base = (process.env.APP_URL || 'http://localhost:8000').replace(/\/+$/, '');
    return base + '/' + String(path).replace(/^\/+/, '');
  },
  // a link that only works unchanged and, with minutes, until it expires
  signed(path, minutes = null) {
    const sep = path.includes('?') ? '&' : '?';
    const withExpiry = minutes ? `${path}${sep}expires=${Math.floor(Date.now() / 1000) + minutes * 60}` : path;
    return `${withExpiry}${withExpiry.includes('?') ? '&' : '?'}signature=${sign(withExpiry)}`;
  },
  // check(path, { expires, signature, …the rest of the query })
  check(path, query = {}) {
    const { signature, ...rest } = query;
    if (!signature) return false;
    const qs = Object.keys(rest).length ? '?' + new URLSearchParams(rest).toString() : '';
    const want = Buffer.from(sign(path + qs));
    const got = Buffer.from(String(signature));
    if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return false;
    return !rest.expires || Number(rest.expires) * 1000 > Date.now();
  },
};
const sign = (text) => crypto.createHmac('sha256', appKey()).update(text).digest('hex');

/* ------------------------------------------------------------------ Mail */
// MAIL_URL=smtp://user:password@smtp.example.com:587 in .env (and npm i nodemailer) sends real email.
// Without it, the email is printed in the terminal (log driver).
let transport = null;
const Mail = {
  async send({ to, subject = '', text = '', html, from, cc, bcc, replyTo, attachments } = {}) {
    from = from || process.env.MAIL_FROM || `"${process.env.APP_NAME || 'App'}" <hello@example.com>`;
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
    const c = crypto.createCipheriv('aes-256-gcm', key, iv);
    const data = Buffer.concat([c.update(String(value), 'utf8'), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), data]).toString('base64url');
  },
  decryptString(payload) {
    try {
      const buf = Buffer.from(String(payload), 'base64url');
      const key = crypto.createHash('sha256').update(appKey()).digest();
      const d = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
      d.setAuthTag(buf.subarray(12, 28));
      return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
    } catch (_) { throw Object.assign(new Error('The payload is invalid.'), { status: 400 }); }
  },
  encrypt: (value) => Crypt.encryptString(JSON.stringify(value)),
  decrypt: (payload) => JSON.parse(Crypt.decryptString(payload)),
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
    if (LEVELS[level] < LEVELS[(process.env.LOG_LEVEL || 'debug').toLowerCase()] ?? 0) return;
    const time = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const envName = process.env.APP_ENV || process.env.NODE_ENV || 'local';
    const ctxStr = context && Object.keys(context).length ? ' ' + JSON.stringify(context) : '';
    const line = `[${time}] ${envName}.${level.toUpperCase()}: ${message}${ctxStr}`;
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

/* ------------------------------------------------------------------ Lang */
// backend/lang/en/messages.json { "welcome": "Welcome, :name" } → __('messages.welcome', { name: 'Maxamuud' })
let langDir = null;
const langCache = new Map();
const Lang = {
  setDirectory(dir) { langDir = dir; langCache.clear(); },
  locale: () => Lang.current || process.env.APP_LOCALE || 'en',
  setLocale(l) { Lang.current = l; },
  get(key, replace = {}, locale = Lang.locale()) {
    const [file, ...rest] = String(key).split('.');
    const read = (loc) => {
      if (!loc || !file || /[\/\\]|\.\./.test(file) || /[\/\\]|\.\./.test(loc) || ['__proto__', 'constructor', 'prototype'].includes(file)) return undefined;
      const k = loc + '/' + file;
      if (!langCache.has(k)) {
        let data = null;
        if (langDir) {
          try {
            const targetPath = require('path').resolve(langDir, loc, file + '.json');
            if (targetPath.startsWith(require('path').resolve(langDir))) {
              data = JSON.parse(require('fs').readFileSync(targetPath, 'utf8'));
            }
          } catch (_) { /* none */ }
        }
        langCache.set(k, data);
      }
      const data = langCache.get(k);
      return data ? rest.reduce((o, p) => (o == null || ['__proto__', 'constructor', 'prototype'].includes(p) ? undefined : o[p]), data) : undefined;
    };
    let text = read(locale);
    if (text === undefined) text = read(process.env.APP_FALLBACK_LOCALE || 'en');
    if (text === undefined) return key;
    return String(text).replace(/:(\w+)/g, (m, name) => (replace[name] !== undefined ? replace[name] : m));
  },
  has: (key, locale) => Lang.get(key, {}, locale) !== key,
};
const __ = (key, replace, locale) => Lang.get(key, replace, locale);

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
const TOTP = {
  secret: (bytes = 20) => base32.encode(crypto.randomBytes(bytes)),
  code(secret, at = Date.now()) {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
    const h = crypto.createHmac('sha1', base32.decode(secret)).update(counter).digest();
    const o = h[h.length - 1] & 0xf;
    return String(((h.readUInt32BE(o) & 0x7fffffff) % 1000000)).padStart(6, '0');
  },
  verify(secret, code, window = 1) {
    const given = String(code || '').replace(/\s/g, '');
    if (!/^\d{6}$/.test(given)) return false;
    for (let w = -window; w <= window; w++) {
      const want = TOTP.code(secret, Date.now() + w * 30000);
      if (crypto.timingSafeEqual(Buffer.from(want), Buffer.from(given))) return true;
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
const SEO = {
  renderTags(options = {}) {
    const o = typeof options === 'string' ? { title: options } : options;
    const tags = [];
    if (o.title) tags.push(`<title>${o.title}</title>`);
    if (o.description) tags.push(`<meta name="description" content="${String(o.description).replace(/"/g, '&quot;')}">`);
    if (o.keywords) tags.push(`<meta name="keywords" content="${Array.isArray(o.keywords) ? o.keywords.join(', ') : o.keywords}">`);
    if (o.author) tags.push(`<meta name="author" content="${o.author}">`);
    if (o.robots) tags.push(`<meta name="robots" content="${o.robots}">`);
    if (o.canonical) tags.push(`<link rel="canonical" href="${o.canonical}">`);

    // OpenGraph
    const og = o.og || o.openGraph || {};
    const ogTitle = og.title || o.title;
    const ogDesc = og.description || o.description;
    const ogImage = og.image || o.image;
    const ogUrl = og.url || o.canonical;
    const ogType = og.type || 'website';
    const ogSite = og.siteName || og.site_name || o.siteName || o.site_name;

    if (ogTitle) tags.push(`<meta property="og:title" content="${String(ogTitle).replace(/"/g, '&quot;')}">`);
    if (ogDesc) tags.push(`<meta property="og:description" content="${String(ogDesc).replace(/"/g, '&quot;')}">`);
    if (ogImage) tags.push(`<meta property="og:image" content="${ogImage}">`);
    if (ogUrl) tags.push(`<meta property="og:url" content="${ogUrl}">`);
    if (ogType) tags.push(`<meta property="og:type" content="${ogType}">`);
    if (ogSite) tags.push(`<meta property="og:site_name" content="${String(ogSite).replace(/"/g, '&quot;')}">`);

    // Twitter
    const tw = o.twitter || {};
    const twCard = tw.card || (ogImage ? 'summary_large_image' : 'summary');
    const twTitle = tw.title || ogTitle;
    const twDesc = tw.description || ogDesc;
    const twImage = tw.image || ogImage;

    if (twCard) tags.push(`<meta name="twitter:card" content="${twCard}">`);
    if (twTitle) tags.push(`<meta name="twitter:title" content="${String(twTitle).replace(/"/g, '&quot;')}">`);
    if (twDesc) tags.push(`<meta name="twitter:description" content="${String(twDesc).replace(/"/g, '&quot;')}">`);
    if (twImage) tags.push(`<meta name="twitter:image" content="${twImage}">`);
    if (tw.site) tags.push(`<meta name="twitter:site" content="${tw.site}">`);
    if (tw.creator) tags.push(`<meta name="twitter:creator" content="${tw.creator}">`);

    // JSON-LD Schema
    if (o.schema || o.jsonLd) {
      const s = o.schema || o.jsonLd;
      tags.push(`<script type="application/ld+json">${typeof s === 'string' ? s : JSON.stringify(s)}</script>`);
    }

    return tags.join('\n');
  },
  sitemap(routes = [], { baseUrl = 'http://localhost' } = {}) {
    const cleanBase = baseUrl.replace(/\/+$/, '');
    const date = new Date().toISOString().slice(0, 10);
    const urls = routes.map((r) => {
      const path = typeof r === 'string' ? r : r.path || '/';
      const loc = `${cleanBase}${path.startsWith('/') ? path : '/' + path}`;
      const changefreq = (typeof r === 'object' && r.changefreq) || 'weekly';
      const priority = (typeof r === 'object' && r.priority) || (path === '/' ? '1.0' : '0.8');
      return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${date}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
    });
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
  },
  robots({ allow = '/', disallow = [], sitemapUrl = null } = {}) {
    const lines = ['User-agent: *'];
    if (allow) lines.push(`Allow: ${allow}`);
    for (const d of [].concat(disallow || [])) if (d) lines.push(`Disallow: ${d}`);
    if (sitemapUrl) lines.push(`\nSitemap: ${sitemapUrl}`);
    return lines.join('\n') + '\n';
  },
};

module.exports = { Hash, Str, slug, uniqueSlug, Url, Mail, Crypt, Log, Lang, __, Http, env, now, appKey, TOTP, SEO };
