/*
 * Your own server code, with any Node.js library.
 *
 *   server/hello.js          →  /api/hello
 *   server/users/[id].js     →  /api/users/5          (ctx.params.id === '5')
 *   server/index.js          →  /api
 *
 *   // server/hello.js — CommonJS (module.exports) or ES modules (export) both work
 *   const bcrypt = require('bcryptjs')                 // any package from npm
 *   exports.get = async (ctx) => ({ hello: ctx.query.name || 'world' })
 *   exports.post = async (ctx) => {
 *     ctx.validate(ctx.body, { email: 'required|email' })   // 422 with structured validation errors when it fails
 *     const rows = await ctx.db.query('SELECT * FROM users WHERE email = ?', [ctx.body.email])
 *     return ctx.reply(201, { created: true })
 *   }
 *
 * Export get, post, put, patch and del (delete is a reserved word), or one `handle` for every method.
 * What you return goes back as JSON (nothing → 204). ctx.fail(status, message or { field: [...] })
 * stops with an error. ctx.res is Node's response, if you need it (stream, a file, a redirect).
 * kreftjs dev picks up changes to these files by itself.
 */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { validate } = require('../kreftjs.js');

const MAX_BODY = 5 * 1024 * 1024;

class Reply { constructor(status, data, headers) { this.status = status; this.data = data; this.headers = headers || {}; } }
class Fail extends Error {
  constructor(status, detail) {
    const errors = detail && typeof detail === 'object' && !Array.isArray(detail) ? detail : null;
    super(errors ? Object.values(errors)[0][0] || 'Invalid.' : String(detail || 'Error'));
    this.status = status;
    this.errors = errors;
  }
}

function createServerRoutes(dir, { db = null, production = false, prefix = '/api', log = console } = {}) {
  const isProd = Boolean(production || process.env.APP_ENV === 'production' || process.env.NODE_ENV === 'production');
  let routes = [], scannedAt = 0;
  require('./backend/typescript.js').registerTypeScript(dir);
  const scan = () => {
    const out = [];
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) { if (!e.name.startsWith('_') && e.name !== 'node_modules') walk(full); continue; }
        if (!/\.(c|m)?(js|ts)$/.test(e.name) || e.name.endsWith('.d.ts') || e.name.startsWith('_')) continue; // _helpers.js are not routes
        const rel = path.relative(dir, full).split(path.sep).join('/').replace(/\.(c|m)?(js|ts)$/, '').replace(/(^|\/)index$/, '');
        const keys = [];
        const pattern = rel.split('/').filter(Boolean).map((part) => {
          const m = part.match(/^\[(\.\.\.)?(\w+)\]$/);
          if (!m) return part.replace(/[.*+?^${}()|\\]/g, '\\$&');
          keys.push(m[2]);
          return m[1] ? '(.+)' : '([^/]+)';
        }).join('/');
        out.push({ file: full, keys, regex: new RegExp('^' + (pattern ? '/' + pattern : '') + '/?$'), dynamic: keys.length });
      }
    };
    if (fs.existsSync(dir)) walk(dir);
    return out.sort((a, b) => a.dynamic - b.dynamic); // /users/me before /users/[id]
  };
  const list = () => {
    // kreftjs dev looks for new files twice a second at most; kreftjs serve reads the folder once
    if (!scannedAt || (!production && Date.now() - scannedAt > 500)) { routes = scan(); scannedAt = Date.now(); }
    return routes;
  };
  const loaded = new Map();
  async function load(file) {
    const mtime = fs.statSync(file).mtimeMs;
    const hit = loaded.get(file);
    if (hit && (production || hit.mtime === mtime)) return hit.mod;
    delete require.cache[require.resolve(file)]; // so a changed CommonJS or TypeScript file is read again
    let mod;
    if (/\.[mc]?ts$/i.test(file)) {
      mod = require(file);
    } else {
      mod = await import(pathToFileURL(file).href + (production ? '' : '?t=' + mtime));
    }
    const m = mod.default && typeof mod.default === 'object' && !mod.get && !mod.post && !mod.handle ? { ...mod.default } : mod;
    loaded.set(file, { mtime, mod: m });
    return m;
  }
  const readBody = (req) => new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new Fail(413, 'The body is too large.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const type = req.headers['content-type'] || '';
      if (!raw) return resolve(null);
      const { safeObjectFromEntries, parseJson } = require('./safe-json.js');
      if (/json/.test(type)) { try { return resolve(parseJson(raw)); } catch (_) { return reject(new Fail(400, 'Send valid JSON.')); } }
      if (/x-www-form-urlencoded/.test(type)) return resolve(safeObjectFromEntries(new URLSearchParams(raw)));
      resolve(raw);
    });
    req.on('error', reject);
  });
  const send = (res, status, data, headers = {}) => {
    if (res.headersSent) return;
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin', ...headers });
    res.end(data === undefined ? '' : JSON.stringify(data));
  };

  // answers the request and returns true, or returns false when no file matches
  async function handler(req, res, urlPath) {
    const sub = urlPath.slice(prefix.length) || '/';
    const route = list().find((r) => r.regex.test(sub === '/' ? '' : sub.replace(/\/$/, '')) || r.regex.test(sub));
    if (!route) return false;
    const method = req.method.toUpperCase();
    try {
      const mod = await load(route.file);
      const fn = mod[{ GET: 'get', POST: 'post', PUT: 'put', PATCH: 'patch', DELETE: 'del', HEAD: 'get', OPTIONS: 'options' }[method]]
        || (method === 'DELETE' && (mod.destroy || mod.remove)) || mod.handle || (typeof mod.default === 'function' ? mod.default : null);
      if (!fn) { send(res, 405, { message: `${method} is not supported here.` }); return true; }
      const m = (sub === '/' ? '' : sub.replace(/\/$/, '')).match(route.regex) || sub.match(route.regex);
      const { safeObjectFromEntries } = require('./safe-json.js');
      const params = safeObjectFromEntries(route.keys.map((k, i) => [k, m[i + 1]])); // the path is decoded already
      const url = new URL(req.url, 'http://x');
      const ctx = {
        method, params, req, res, db, env: process.env,
        path: urlPath,
        query: safeObjectFromEntries(url.searchParams),
        headers: req.headers,
        body: ['GET', 'HEAD', 'DELETE'].includes(method) ? null : await readBody(req),
        reply: (status, data, headers) => new Reply(status, data, headers),
        fail: (status, detail) => { throw new Fail(status, detail); },
        validate(data, rules, options) {
          const errors = validate(data || {}, rules, options);
          if (Object.keys(errors).length) throw new Fail(422, errors);
          return data;
        },
      };
      const result = await fn(ctx);
      if (res.headersSent || res.writableEnded) return true; // the route answered by itself
      if (result instanceof Reply) send(res, result.status, result.data, result.headers);
      else if (result === undefined) send(res, 204);
      else send(res, 200, result);
    } catch (e) {
      if (e instanceof Fail || (e && typeof e.status === 'number' && e.status >= 400 && e.status < 600)) {
        send(res, e.status, { message: e.message, ...(e.errors ? { errors: e.errors } : {}) });
      } else {
        log.error(`  Error in ${path.relative(process.cwd(), route.file)}: ${e && e.stack || e}`);
        send(res, 500, { message: isProd ? 'Server error.' : String(e && e.message || e) });
      }
    }
    return true;
  }
  handler.routes = () => list().map((r) => path.relative(dir, r.file));
  return handler;
}

module.exports = { createServerRoutes };
