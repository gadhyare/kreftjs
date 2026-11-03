/*
 * Routes, controllers, requests, responses and middleware.
 *
 *   // routes/api.js   (every address here starts with /api)
 *   const { Route } = require('somjs/server')
 *   const PostController = require('../app/Http/Controllers/PostController')
 *
 *   Route.get('/hello', (req) => ({ hello: req.input('name', 'world') }))
 *   Route.apiResource('posts', PostController)                 // index, store, show, update, destroy
 *   Route.middleware('auth').group(() => {
 *     Route.delete('/posts/{post}', [PostController, 'destroy'])
 *   })
 *   Route.prefix('admin').middleware(['auth', 'throttle:60,1']).group(() => { … })
 */
const crypto = require('crypto');
const { validate } = require('../../som.js');
const { getConnection } = require('./query.js');

/* ------------------------------------------------------------------ errors and responses */
class HttpError extends Error {
  constructor(status, message, extra) {
    super(message || defaultMessage(status));
    this.status = status;
    this.extra = extra || null;
  }
}
class ValidationError extends HttpError {
  constructor(errors) {
    const first = Object.values(errors)[0];
    super(422, (first && first[0]) || 'The given data was invalid.');
    this.errors = errors;
  }
}
const defaultMessage = (s) => ({ 400: 'Bad request.', 401: 'Unauthenticated.', 403: 'This action is unauthorized.', 404: 'Not found.', 405: 'Method not allowed.', 409: 'Conflict.', 419: 'Page expired.', 422: 'The given data was invalid.', 429: 'Too many attempts.', 500: 'Server error.', 503: 'Service unavailable.' }[s] || 'Error');
// abort(404) / abort(403, 'Only the owner can do this.')  — stops right there
function abort(status, message, extra) { throw new HttpError(status, message, extra); }
const abortIf = (cond, status, message) => { if (cond) abort(status, message); };
const abortUnless = (cond, status, message) => { if (!cond) abort(status, message); };

const same = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (!a || !b) return false;
  // Use fixed-length SHA-256 hashes to prevent timing leaks of secret length
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
};

class Response {
  constructor(body, status = 200, headers = {}) {
    this.body = body;
    this.statusCode = status;
    this.headers = {};
    if (headers) {
      for (const [k, v] of Object.entries(headers)) this.header(k, v);
    }
  }
  status(code) { this.statusCode = code; return this; }
  header(name, value) {
    if (/[\r\n]/.test(String(name)) || /[\r\n]/.test(String(value))) {
      throw new Error('Invalid newline characters in HTTP header.');
    }
    this.headers[name] = value;
    return this;
  }
  withHeaders(h) {
    if (h) Object.entries(h).forEach(([k, v]) => this.header(k, v));
    return this;
  }
  json(body, status) { this.body = body; if (status) this.statusCode = status; return this; }
  // response(user).cookie('name', 'value', { maxAge: 3600, httpOnly: true })  — HttpOnly, SameSite=Lax and Path=/ by default
  cookie(name, value, { maxAge, path = '/', httpOnly = true, sameSite = process.env.SESSION_SAME_SITE || 'Lax', secure = cookieSecure(), domain } = {}) {
    if (/[\r\n;=]/.test(String(name))) throw new Error('Invalid characters in cookie name.');
    if (/[\r\n;]/.test(String(path)) || /[\r\n;]/.test(String(sameSite)) || (domain && /[\r\n;]/.test(String(domain)))) {
      throw new Error('Invalid characters in cookie attributes.');
    }
    const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, `SameSite=${sameSite}`];
    if (maxAge != null) parts.push(`Max-Age=${Math.floor(maxAge)}`);
    if (httpOnly) parts.push('HttpOnly');
    if (secure) parts.push('Secure');
    if (domain) parts.push(`Domain=${domain}`);
    const list = [].concat(this.headers['Set-Cookie'] || []);
    list.push(parts.join('; '));
    this.headers['Set-Cookie'] = list;
    return this;
  }
  withoutCookie(name, { path = '/' } = {}) { return this.cookie(name, '', { maxAge: 0, path }); }
}
// cookies are Secure when the app runs on https (APP_URL), in production, or SESSION_SECURE_COOKIE=true
const cookieSecure = () => {
  if (process.env.SESSION_SECURE_COOKIE != null) return process.env.SESSION_SECURE_COOKIE === 'true';
  const isProd = process.env.APP_ENV === 'production' || process.env.NODE_ENV === 'production';
  return isProd || /^https:/i.test(process.env.APP_URL || '');
};
// response(data, 201) / response().json(data) / response().noContent()
function response(body, status = 200, headers = {}) { return new Response(body, status, headers); }
response.json = (body, status = 200, headers = {}) => new Response(body, status, headers);
response.noContent = () => new Response(undefined, 204);
const noContent = () => new Response(undefined, 204);
const toResponse = (v) => (v instanceof Response ? v : v === undefined ? new Response(undefined, 204) : new Response(v, 200));

/* ------------------------------------------------------------------ the request */
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const getPath = (obj, key) => {
  const parts = String(key).split('.');
  let o = obj;
  for (const k of parts) {
    if (o == null || BAD_KEYS.has(k)) return undefined;
    o = o[k];
  }
  return o;
};

class Request {
  constructor(raw = {}, res = {}, { path = '', query = {}, body = {}, params = {} } = {}) {
    Object.assign(this, { raw, res, path, query, body: body || {}, params });
    this.method = (raw.method || 'GET').toUpperCase();
    this.headers = raw.headers || {};
    this.user = null;          // middleware like auth can put the user here
    this._validated = null;
  }
  get url() { return this.raw.url; }
  // the visitor's address. X-Forwarded-For is only believed from a proxy you trust (TRUSTED_PROXIES in .env:
  // "*" or "10.0.0.1,10.0.0.2"); anyone else could send a fake one to dodge throttle.
  // A proxy adds the address it saw to the END of the list, so the list is read from the right: the first
  // address that isn't one of your proxies is the visitor. The left side is whatever the visitor wrote.
  // With "*", TRUSTED_PROXY_HOPS (default 1) says how many proxies stand in front of the app.
  ip() {
    const strip = (a) => String(a).replace(/^::ffff:/, '');
    const direct = (this.raw.socket && this.raw.socket.remoteAddress) || '';
    const trusted = String(process.env.TRUSTED_PROXIES || '').split(',').map((x) => x.trim()).filter(Boolean);
    const any = trusted.includes('*');
    const isProxy = (a) => any || trusted.includes(a) || trusted.includes(strip(a));
    if (!isProxy(direct)) return direct;
    const list = String(this.raw.headers['x-forwarded-for'] || '').split(',').map((x) => x.trim()).filter(Boolean);
    const valid = (a) => a.length <= 45 && /^[0-9a-fA-F:.]+$/.test(a);
    let hops = any ? Math.max(1, parseInt(process.env.TRUSTED_PROXY_HOPS, 10) || 1) - 1 : Infinity;
    for (let i = list.length - 1; i >= 0; i--) {
      if (!valid(list[i])) return direct;
      if (!any && isProxy(list[i])) continue;
      if (any && hops-- > 0) continue;
      return list[i];
    }
    return direct;
  }
  header(name, fallback = null) { const v = this.raw.headers[String(name).toLowerCase()]; return v == null ? fallback : v; }
  cookie(name, fallback = null) {
    const m = String(this.header('cookie', '')).split(/;\s*/).find((c) => c.slice(0, c.indexOf('=')) === name);
    if (!m) return fallback;
    try { return decodeURIComponent(m.slice(m.indexOf('=') + 1)); } catch (_) { return fallback; }
  }
  bearerToken() { const m = String(this.header('authorization', '')).match(/^Bearer\s+(.+)$/i); return m ? m[1].trim() : null; }
  route(name, fallback = null) { return this.params[name] ?? fallback; }
  all() { return { ...this.query, ...(isPlain(this.body) ? this.body : {}), ...(this.files || {}) }; }
  // uploads (multipart/form-data): req.file('avatar') → an UploadedFile (store(), extension(), size…)
  file(name) { const f = (this.files || {})[name]; return Array.isArray(f) ? f[0] : f || null; }
  hasFile(name) { return Boolean(this.file(name)); }
  // policies and gates: await req.authorize('update', post) (403 when not allowed), await req.can('delete', post)
  can(ability, ...args) { return require('./gate.js').Gate.forUser(this.user).allows(ability, ...args); }
  cannot(ability, ...args) { return require('./gate.js').Gate.forUser(this.user).denies(ability, ...args); }
  authorize(ability, ...args) { return require('./gate.js').Gate.forUser(this.user).authorize(ability, ...args); }
  input(key, fallback = null) { if (key == null) return this.all(); const v = getPath(this.all(), key); return v === undefined ? fallback : v; }
  has(key) { return [].concat(key).every((k) => getPath(this.all(), k) !== undefined); }
  filled(key) { return [].concat(key).every((k) => { const v = getPath(this.all(), k); return v != null && String(v).trim() !== ''; }); }
  missing(key) { return !this.has(key); }
  only(...keys) { const all = this.all(); return Object.fromEntries(keys.flat().filter((k) => k in all).map((k) => [k, all[k]])); }
  except(...keys) { const drop = keys.flat(); return Object.fromEntries(Object.entries(this.all()).filter(([k]) => !drop.includes(k))); }
  boolean(key, fallback = false) { const v = this.input(key); return v == null ? fallback : ['1', 'true', 'on', 'yes', true, 1].includes(v); }
  integer(key, fallback = 0) { const n = parseInt(this.input(key), 10); return Number.isNaN(n) ? fallback : n; }
  string(key, fallback = '') { const v = this.input(key); return v == null ? fallback : String(v); }
  clean(key, options) {
    const { cleanHtml } = require('./html.js');
    const v = this.input(key);
    return v == null ? '' : cleanHtml(String(v), options);
  }
  strip(key) {
    const { stripTags } = require('./html.js');
    const v = this.input(key);
    return v == null ? '' : stripTags(String(v));
  }
  html(key, options) {
    const { SafeHtml } = require('./html.js');
    const clean = this.clean(key, options);
    return SafeHtml.raw(clean);
  }
  slug(key, sep = '-') { const { slug } = require('./support.js'); return slug(this.input(key), sep); }
  async uniqueSlug(target, column, key, sep = '-') { const { uniqueSlug } = require('./support.js'); return uniqueSlug(target, column, this.input(key), sep); }
  isMethod(m) { return this.method === String(m).toUpperCase(); }
  expectsJson() { return /json/.test(this.header('accept', '')); }

  // Localization
  locale() {
    if (this._locale) return this._locale;
    // 1. Query parameter ?lang= or ?locale=
    const q = this.query && (this.query.lang || this.query.locale);
    if (q && typeof q === 'string') {
      this._locale = q.toLowerCase().trim();
      return this._locale;
    }
    // 2. Cookie locale / lang / som_locale
    const c = this.cookie('locale') || this.cookie('lang') || this.cookie('som_locale');
    if (c && typeof c === 'string') {
      this._locale = c.toLowerCase().trim();
      return this._locale;
    }
    // 3. Accept-Language header (e.g. ar,en-US;q=0.9,en;q=0.8)
    const al = this.header('accept-language');
    if (al && typeof al === 'string') {
      const parsed = al.split(',')
        .map((part) => {
          const [tag, qVal] = part.trim().split(';q=');
          return { tag: tag.trim(), q: qVal ? parseFloat(qVal) : 1.0 };
        })
        .filter((item) => item.tag && !isNaN(item.q))
        .sort((a, b) => b.q - a.q);
      if (parsed.length > 0) {
        this._locale = parsed[0].tag;
        return this._locale;
      }
    }
    // 4. Fallback to Lang.locale()
    const { Lang } = require('./support.js');
    this._locale = Lang.locale();
    return this._locale;
  }
  setLocale(l) {
    this._locale = l ? String(l).trim() : null;
    return this;
  }

  // CSRF token helpers
  csrfToken() {
    if (this._csrfToken) return this._csrfToken;
    const cookieToken = this.cookie('XSRF-TOKEN') || this.cookie('som_xsrf');
    if (cookieToken) {
      this._csrfToken = cookieToken;
      return this._csrfToken;
    }
    this._csrfToken = crypto.randomBytes(20).toString('hex');
    return this._csrfToken;
  }
  hasValidCsrfToken() {
    const SAFE = ['GET', 'HEAD', 'OPTIONS'];
    if (SAFE.includes(this.method)) return true;
    const candidate = this.header('x-csrf-token')
      || this.header('x-xsrf-token')
      || this.header('csrf-token')
      || this.input('_token')
      || this.input('csrf_token');
    const expected = this.cookie('XSRF-TOKEN') || this.cookie('som_xsrf') || this._csrfToken;
    return same(candidate, expected);
  }

  // req.validate({ title: 'required|max:200', email: 'required|email|unique:users,email' })
  // → only the checked fields, or a 422 answer with { message, errors }
  async validate(rules, messages, names) {
    const data = this.all();
    const plain = {}, db = {}, custom = {}, fileRules = {};
    const { UploadedFile } = require('./storage.js');
    for (const [field, r] of Object.entries(rules)) {
      const list = (Array.isArray(r) ? r : String(r).split('|')).flatMap((x) => (typeof x === 'string' && x.includes('|') ? x.split('|') : [x]));
      const strings = list.filter((x) => typeof x === 'string');
      custom[field] = list.filter((x) => typeof x !== 'string'); // Rule objects and (attribute, value, fail) functions
      const isFile = data[field] instanceof UploadedFile || (Array.isArray(data[field]) && data[field][0] instanceof UploadedFile) || strings.some((x) => /^(file|image|mimes|mimetypes)\b/.test(x));
      if (isFile) { fileRules[field] = strings.filter((x) => /^(file|image|mimes|mimetypes|max|min|size)\b/.test(x)); }
      plain[field] = strings.filter((x) => !/^(unique|exists):/.test(x) && !(isFile && /^(file|image|mimes|mimetypes|max|min|size)\b/.test(x))).join('|');
      db[field] = strings.filter((x) => /^(unique|exists):/.test(x));
    }
    const errors = validate(data, plain, { messages, names });
    const label = (field) => (names && names[field]) || field.replace(/_/g, ' ');
    const addError = (field, msg) => (errors[field] = errors[field] || []).push(msg);
    // files: file, image, mimes:jpg,png, mimetypes:image/*, max:2048 (KB), min, size
    for (const [field, list] of Object.entries(fileRules)) {
      if (errors[field]) continue;
      const files = [].concat(data[field] == null ? [] : data[field]);
      for (const f of files) {
        if (!(f instanceof UploadedFile)) { addError(field, `The ${label(field)} field must be a file.`); break; }
        for (const rule of list) {
          const [name, arg = ''] = rule.split(':');
          const kb = f.size / 1024;
          if (name === 'image' && !f.isImage()) addError(field, `The ${label(field)} field must be an image.`);
          else if (name === 'mimes' && !arg.split(',').map((x) => x.trim().toLowerCase()).includes(f.extension())) addError(field, `The ${label(field)} field must be a file of type: ${arg.split(',').join(', ')}.`);
          else if (name === 'mimetypes' && !arg.split(',').some((t) => (t.endsWith('/*') ? f.type.startsWith(t.slice(0, -1)) : f.type === t))) addError(field, `The ${label(field)} field must be a file of type: ${arg}.`);
          else if (name === 'max' && kb > Number(arg)) addError(field, `The ${label(field)} field must not be greater than ${arg} kilobytes.`);
          else if (name === 'min' && kb < Number(arg)) addError(field, `The ${label(field)} field must be at least ${arg} kilobytes.`);
          else if (name === 'size' && Math.round(kb) !== Number(arg)) addError(field, `The ${label(field)} field must be ${arg} kilobytes.`);
        }
        if (errors[field]) break;
      }
    }
    // your own rules: { passes(attribute, value, data) { … }, message() { … } } or (attribute, value, fail) => { … }
    for (const [field, list] of Object.entries(custom)) {
      if (errors[field] || data[field] == null || data[field] === '') continue;
      for (const rule of list) {
        if (typeof rule === 'function' && !/^class\s/.test(Function.prototype.toString.call(rule))) {
          let failed = null;
          await rule(field, data[field], (msg) => { failed = msg; }, data);
          if (failed) { addError(field, String(failed).replace(':attribute', label(field))); break; }
        } else {
          const r = typeof rule === 'function' ? new rule() : rule;
          if (!(await r.passes(field, data[field], data))) { addError(field, String(typeof r.message === 'function' ? r.message() : r.message || 'The :attribute is invalid.').replace(':attribute', label(field))); break; }
        }
      }
    }
    for (const [field, checks] of Object.entries(db)) {
      if (errors[field] || data[field] == null || data[field] === '') continue;
      for (const check of checks) {
        const [, kind, args] = check.match(/^(unique|exists):(.*)$/);
        const [table, column = field, ignore, idColumn = 'id'] = args.split(',').map((s) => s.trim());
        const conn = getConnection();
        let sql = `SELECT 1 FROM ${conn.q(table)} WHERE ${conn.q(column)} = ?`;
        const params = [data[field]];
        if (kind === 'unique' && ignore && ignore !== 'NULL') { sql += ` AND ${conn.q(idColumn)} != ?`; params.push(ignore); }
        const found = (await conn.query(sql + ' LIMIT 1', params)).length > 0;
        const label = (names && names[field]) || field.replace(/_/g, ' ');
        if (kind === 'unique' && found) (errors[field] = errors[field] || []).push(`The ${label} has already been taken.`);
        if (kind === 'exists' && !found) (errors[field] = errors[field] || []).push(`The selected ${label} is invalid.`);
      }
    }
    if (Object.keys(errors).length) throw new ValidationError(errors);
    this._validated = Object.fromEntries(Object.keys(rules).filter((k) => data[k] !== undefined).map((k) => [k, data[k]]));
    return this._validated;
  }
  validated() { return this._validated || {}; }
}
const isPlain = (v) => v && typeof v === 'object' && !Array.isArray(v);

/* ------------------------------------------------------------------ the route list */
class RouteEntry {
  constructor(methods, uri, action, group) {
    this.methods = methods;
    this.uri = join(group.prefix, uri);
    this.action = action;
    this.middlewares = [...group.middleware];
    this.groupName = group.name || '';   // Route.name('admin.').group(…): the start of each route's name
    this.namespace = group.namespace || ''; // Route.namespace('Admin').group(…): controller namespace
    this.routeName = '';
    this.wheres = {};
    this.compile();
  }
  middleware(...m) { this.middlewares.push(...m.flat()); return this; }
  withoutMiddleware(...m) { const drop = m.flat(); this.middlewares = this.middlewares.filter((x) => !drop.includes(x)); return this; }
  name(n) { this.routeName = this.groupName + n; return this; }
  where(param, regex) { if (typeof param === 'object') Object.assign(this.wheres, param); else this.wheres[param] = regex; this.compile(); return this; }
  whereNumber(param) { return this.where(param, '[0-9]+'); }
  compile() {
    this.keys = [];
    const pattern = this.uri.replace(/\/$/, '').split('/').map((part) => {
      const m = part.match(/^\{(\w+)(\?)?\}$/) || part.match(/^:(\w+)(\?)?$/);
      if (!m) return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      this.keys.push(m[1]);
      const inner = this.wheres[m[1]] ? this.wheres[m[1]].replace(/^\^|\$$/g, '') : '[^/]+';
      return m[2] ? `__OPT__(${inner})` : `(${inner})`;
    }).join('/').replace(/\/__OPT__(\([^)]*\))/g, '(?:/$1)?');
    this.regex = new RegExp('^' + (pattern || '') + '/?$', 'i');
  }
  match(path) {
    const m = path.match(this.regex);
    if (!m) return null;
    const params = {};
    this.keys.forEach((k, i) => { if (m[i + 1] !== undefined) params[k] = decodeURIComponent(m[i + 1]); });
    return params;
  }
}
const join = (prefix, uri) => ('/' + [prefix, uri].map((s) => String(s || '').replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/')).replace(/\/+/g, '/');
const singularize = (w) => w.replace(/ies$/, 'y').replace(/(ss|sh|ch|x|z)es$/, '$1').replace(/([^s])s$/, '$1');

function createRouter() {
  let routes = [];
  let stack = [{ prefix: '', middleware: [], name: '', namespace: '' }];
  const current = () => stack[stack.length - 1];
  const add = (methods, uri, action) => { const r = new RouteEntry(methods, uri, action, current()); routes.push(r); return r; };

  // Route.prefix('admin').middleware('auth').name('admin.').namespace('Admin').group(() => …)
  class Pending {
    constructor(attrs = {}) { this.attrs = { prefix: '', middleware: [], name: '', namespace: '', ...attrs }; }
    prefix(p) { this.attrs.prefix = join(this.attrs.prefix, p); return this; }
    middleware(...m) { this.attrs.middleware.push(...m.flat()); return this; }
    name(n) { this.attrs.name += n; return this; }
    namespace(ns) {
      const clean = String(ns || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
      this.attrs.namespace = this.attrs.namespace ? `${this.attrs.namespace}/${clean}` : clean;
      return this;
    }
    group(fn) {
      const top = current();
      const groupNamespace = [top.namespace, this.attrs.namespace].filter(Boolean).join('/').replace(/\/+/g, '/');
      stack.push({
        prefix: join(top.prefix, this.attrs.prefix),
        middleware: [...top.middleware, ...this.attrs.middleware],
        name: top.name + this.attrs.name,
        namespace: groupNamespace,
      });
      try { fn(Route); } finally { stack.pop(); }
      return Route;
    }
    // a single route with these settings: Route.middleware('auth').get(…)
    get(u, a) { return this.group(() => add(['GET', 'HEAD'], u, a)) && routes[routes.length - 1]; }
    post(u, a) { return this.group(() => add(['POST'], u, a)) && routes[routes.length - 1]; }
    put(u, a) { return this.group(() => add(['PUT'], u, a)) && routes[routes.length - 1]; }
    patch(u, a) { return this.group(() => add(['PATCH'], u, a)) && routes[routes.length - 1]; }
    delete(u, a) { return this.group(() => add(['DELETE'], u, a)) && routes[routes.length - 1]; }
    apiResource(n, C, o) { let out; this.group(() => (out = Route.apiResource(n, C, o))); return out; }
    csrfCookie(uri) { return this.group(() => Route.csrfCookie(uri)); }
  }

  const Route = {
    get: (uri, action) => add(['GET', 'HEAD'], uri, action),
    post: (uri, action) => add(['POST'], uri, action),
    put: (uri, action) => add(['PUT'], uri, action),
    patch: (uri, action) => add(['PATCH'], uri, action),
    delete: (uri, action) => add(['DELETE'], uri, action),
    options: (uri, action) => add(['OPTIONS'], uri, action),
    any: (uri, action) => add(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], uri, action),
    match: (methods, uri, action) => add(methods.map((m) => m.toUpperCase()), uri, action),
    // GET /api/csrf-cookie: sets the XSRF-TOKEN cookie for client-side API calls
    csrfCookie: (uri = '/csrf-cookie') => add(['GET', 'HEAD'], uri, (req) => {
      const token = req.csrfToken();
      return response.noContent().cookie('XSRF-TOKEN', token, { httpOnly: false, sameSite: process.env.SESSION_SAME_SITE || 'Lax', secure: cookieSecure(), path: '/' });
    }),
    // posts → GET /posts, POST /posts, GET /posts/{post}, PUT|PATCH /posts/{post}, DELETE /posts/{post}
    apiResource(name, Controller, { only, except, parameter } = {}) {
      const param = parameter || singularize(name.split('/').pop()).replace(/-/g, '_');
      const all = [
        ['index', ['GET', 'HEAD'], name],
        ['store', ['POST'], name],
        ['show', ['GET', 'HEAD'], `${name}/{${param}}`],
        ['update', ['PUT', 'PATCH'], `${name}/{${param}}`],
        ['destroy', ['DELETE'], `${name}/{${param}}`],
      ].filter(([m]) => (!only || only.includes(m)) && (!except || !except.includes(m)));
      const made = all.map(([method, verbs, uri]) => {
        const entry = add(verbs, uri, [Controller, method]);
        entry._action = method;
        return entry.name(`${name.replace(/\//g, '.')}.${method}`);
      });
      const api = {
        middleware: (...m) => { made.forEach((r) => r.middleware(...m)); return api; },
        name: (n) => {
          const prefix = String(n || '').replace(/\.+$/, '');
          made.forEach((r) => {
            const action = r._action || (r.as || '').split('.').pop();
            r.name(prefix ? `${prefix}.${action}` : action);
          });
          return api;
        },
        names: (n) => {
          if (typeof n === 'string') return api.name(n);
          if (n && typeof n === 'object') {
            made.forEach((r) => {
              const action = r._action || (r.as || '').split('.').pop();
              if (n[action]) r.name(n[action]);
            });
          }
          return api;
        },
        only: (...methods) => {
          const keep = methods.flat();
          for (let i = routes.length - 1; i >= 0; i--) {
            const r = routes[i];
            if (made.includes(r)) {
              const action = r._action || (r.as || '').split('.').pop();
              if (!keep.includes(action)) {
                routes.splice(i, 1);
                const mIdx = made.indexOf(r);
                if (mIdx !== -1) made.splice(mIdx, 1);
              }
            }
          }
          return api;
        },
        except: (...methods) => {
          const drop = methods.flat();
          for (let i = routes.length - 1; i >= 0; i--) {
            const r = routes[i];
            if (made.includes(r)) {
              const action = r._action || (r.as || '').split('.').pop();
              if (drop.includes(action)) {
                routes.splice(i, 1);
                const mIdx = made.indexOf(r);
                if (mIdx !== -1) made.splice(mIdx, 1);
              }
            }
          }
          return api;
        },
        routes: made,
      };
      return api;
    },
    resource(name, Controller, options) { return Route.apiResource(name, Controller, options); },
    prefix: (p) => new Pending().prefix(p),
    middleware: (...m) => new Pending().middleware(...m),
    name: (n) => new Pending().name(n),
    namespace: (ns) => new Pending().namespace(ns),
    // Route.group({ prefix: 'admin', middleware: ['auth'], as: 'admin.', namespace: 'Admin' }, () => …)
    group(attrs, fn) {
      if (typeof attrs === 'function') return new Pending().group(attrs);
      const p = new Pending();
      if (attrs.prefix) p.prefix(attrs.prefix);
      if (attrs.middleware) p.middleware(attrs.middleware);
      if (attrs.as || attrs.name) p.name(attrs.as || attrs.name);
      if (attrs.namespace) p.namespace(attrs.namespace);
      return p.group(fn);
    },
    fallback: (action) => { const r = add(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'], '{any?}', action).where('any', '.*'); r.isFallback = true; return r; },
    // url for a named route: Route.url('posts.show', { post: 5 })  →  /api/posts/5
    url(name, params = {}) {
      const r = routes.find((x) => x.routeName === name);
      if (!r) throw new Error(`No route named "${name}".`);
      return '/api' + r.uri.replace(/\{(\w+)\??\}/g, (_, k) => encodeURIComponent(params[k] ?? '')).replace(/\/+$/, '');
    },
    list: () => routes,
    reset() { routes = []; stack = [{ prefix: '', middleware: [], name: '', namespace: '' }]; },
  };
  return Route;
}

/* ------------------------------------------------------------------ built-in middleware */
class VerifyCsrfToken {
  constructor(options = {}) {
    this.except = options.except || [];
  }
  async handle(req, next, ...args) {
    const SAFE = ['GET', 'HEAD', 'OPTIONS'];
    const method = req.method.toUpperCase();
    const isSafe = SAFE.includes(method);
    const exceptList = [...this.except, ...args];
    const isExempt = exceptList.some((pattern) => {
      if (!pattern) return false;
      const cleanPattern = String(pattern).replace(/\/+$/, '').replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      const re = new RegExp('^' + cleanPattern + '/?$', 'i');
      return re.test(req.path) || re.test(req.path.replace(/^\/api/, ''));
    });

    if (!isSafe && !isExempt) {
      const candidate = req.header('x-csrf-token')
        || req.header('x-xsrf-token')
        || req.header('csrf-token')
        || req.input('_token')
        || req.input('csrf_token');
      const expected = req.cookie('XSRF-TOKEN') || req.cookie('som_xsrf') || req._csrfToken;
      const bearer = req.bearerToken();
      const hasCookieAuth = Boolean(req.cookie('som_session') || req.cookie('XSRF-TOKEN') || req.cookie('som_xsrf'));

      // If accessing via session/cookies or standard browser form requests, enforce CSRF:
      if (hasCookieAuth || !bearer) {
        if (!candidate || !expected || !same(candidate, expected)) {
          abort(419, 'CSRF token mismatch. Reload the page and try again.');
        }
      }
    }

    const token = req.cookie('XSRF-TOKEN') || req.csrfToken();
    const res = toResponse(await next(req));
    if (!req.cookie('XSRF-TOKEN')) {
      res.cookie('XSRF-TOKEN', token, { httpOnly: false, sameSite: process.env.SESSION_SAME_SITE || 'Lax', secure: cookieSecure(), path: '/' });
    }
    return res;
  }
}

// Where to send a plain-HTTP visitor: the same address over https. The Host header is whatever the visitor
// wrote (and a cache may keep the answer for others), so the app's own APP_URL host is used when there is one;
// otherwise the header must look like a host name, or null (answer 400).
function httpsRedirectTarget(req) {
  let host = '';
  try { if (process.env.APP_URL) host = new URL(process.env.APP_URL).host; } catch (_) { /* no usable APP_URL */ }
  if (!host) host = String(req.headers.host || '').trim();
  if (!/^(?:[a-z0-9]([a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*|\[[0-9a-f:.]+\])(?::\d{1,5})?$/i.test(host)) return null;
  const url = String(req.url || '/');
  if (!url.startsWith('/') || url.startsWith('//')) return `https://${host}/`;
  return `https://${host}${url}`;
}

// Is the machine that opened this connection one whose X-Forwarded-* headers can be believed? This computer (nginx,
// Caddy … next to the app), or a proxy listed in TRUSTED_PROXIES in .env ("*" or "10.0.0.1,10.0.0.2"; same list as req.ip()).
function isTrustedProxy(req) {
  const strip = (a) => String(a).replace(/^::ffff:/, '');
  const direct = strip((req.socket && req.socket.remoteAddress) || '');
  if (direct === '127.0.0.1' || direct === '::1') return true;
  const trusted = String(process.env.TRUSTED_PROXIES || '').split(',').map((x) => strip(x.trim())).filter(Boolean);
  return trusted.includes('*') || trusted.includes(direct);
}

const generateCsrfToken = () => crypto.randomBytes(20).toString('hex');
const verifyCsrfToken = (token, expected) => same(token, expected);

const hits = new Map();
setInterval(() => { const t = Date.now(); for (const [k, v] of hits) if (v.reset < t) hits.delete(k); }, 60000).unref();
const builtIn = {
  // can:update,post — the route's {post} is read as a Post (app/Models/Post) and checked against PostPolicy;
  // can:create,Post — checked against the class; can:edit-settings — a Gate.define() ability
  async can(req, next, ability, ...params) {
    const app = require('./app.js');
    const args = [];
    for (const p of params) {
      if (req.params && req.params[p] !== undefined) {
        const M = app.find(p.replace(/(^|_)(\w)/g, (_, __, c) => c.toUpperCase()), 'model');
        args.push(M ? await M.findOrFail(req.params[p]) : req.params[p]);
      } else { const M = app.find(p, 'model'); args.push(M || p); }
    }
    await require('./gate.js').Gate.forUser(req.user).authorize(ability, ...args);
    return next(req);
  },
  // throttle:60,1  →  60 requests a minute, per visitor and route
  async throttle(req, next, max = '60', minutes = '1') {
    max = parseInt(max, 10) || 60;
    const windowMs = (parseFloat(minutes) || 1) * 60000;
    // each limit counts on its own: the 120-a-minute for the whole API doesn't use up a route's 6-a-minute
    const key = req.ip() + '|' + (req.routeEntry ? req.routeEntry.methods.join(',') + ' ' + req.routeEntry.uri : req.path) + '|' + max + '/' + windowMs;
    const t = Date.now();
    let h = hits.get(key);
    if (!h || h.reset < t) {
      if (!h && hits.size >= 20000) hits.delete(hits.keys().next().value);
      h = { count: 0, reset: t + windowMs };
      hits.set(key, h);
    }
    h.count++;
    const left = Math.max(0, max - h.count);
    if (h.count > max) {
      const retry = Math.ceil((h.reset - t) / 1000);
      throw new HttpError(429, 'Too Many Attempts.', { headers: { 'Retry-After': String(retry), 'X-RateLimit-Limit': String(max), 'X-RateLimit-Remaining': '0' } });
    }
    const res = await next(req);
    return res.withHeaders({ 'X-RateLimit-Limit': String(max), 'X-RateLimit-Remaining': String(left) });
  },
  // CSRF protection middleware: Route.middleware('csrf') or VerifyCsrfToken
  async csrf(req, next, ...args) {
    return new VerifyCsrfToken().handle(req, next, ...args);
  },
  async verifyCsrfToken(req, next, ...args) {
    return new VerifyCsrfToken().handle(req, next, ...args);
  },
  // Set locale from request (query, cookie, accept-language header)
  async setLocale(req, next) {
    const loc = req.locale();
    const { Lang } = require('./support.js');
    const prev = Lang.locale();
    Lang.setLocale(loc);
    try {
      return await next(req);
    } finally {
      Lang.setLocale(prev);
    }
  },
};

module.exports = {
  cookieSecure, createRouter, Request, Response, response, noContent, abort, abortIf, abortUnless,
  HttpError, ValidationError, toResponse, builtIn, singularize,
  VerifyCsrfToken, csrf: builtIn.csrf, httpsRedirectTarget, isTrustedProxy, generateCsrfToken, verifyCsrfToken, same,
};
