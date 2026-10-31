/*
 * The Som.js backend: routes/api.js, controllers, models, migrations, seeders, middleware.
 *
 *   routes/api.js                         Route.get(…), Route.apiResource(…), Route.middleware(…).group(…)
 *   app/Http/Controllers/PostController.js
 *   app/Http/Middleware/Authenticate.js   'auth' in a route finds Authenticate.js (or Auth.js)
 *   app/Models/Post.js
 *   database/migrations/*.js              som migrate, som migrate:rollback, som migrate:fresh --seed
 *   database/seeders/DatabaseSeeder.js    som db:seed
 *
 * In your files:  const { Route, Model, DB, abort, response } = require('somjs/server')
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const http = require('./http.js');
const { Model, ModelBuilder, ModelNotFoundError, setBaseDir } = require('./model.js');
const { DB, Builder, raw, setConnection } = require('./query.js');
const { Collection, collect } = require('./collection.js');
const { Factory } = require('./factory.js');
const { fake } = require('./fake.js');
const migrator = require('./migrator.js');
const { createSchema } = require('./schema.js');

// require('somjs/server') works in a project even when Som.js is only installed globally
const SERVER_ENTRY = path.join(__dirname, '..', '..', 'server.js');
let aliased = false;
function installAlias() {
  if (aliased) return;
  aliased = true;
  const original = Module._resolveFilename;
  require('./typescript.js').registerTypeScript(process.cwd()); // .ts files in routes/, app/, database/
  Module._resolveFilename = function (request, ...rest) {
    if (request === 'somjs/server' || request === 'som/server' || request === '@somjs/server') return SERVER_ENTRY;
    return original.call(this, request, ...rest);
  };
}

const Route = http.createRouter();

const pascal = (s) => s.replace(/(^|[-_\s])(\w)/g, (_, __, c) => c.toUpperCase());
const exists = (f) => { try { return fs.statSync(f).isFile(); } catch (_) { return false; } };
const { findFile } = require('./typescript.js'); // name → name.js, .cjs or .ts
const { pathToFileURL } = require('url');
const loadModule = (file) => {
  try {
    let m = require(file);
    return m && m.default ? m.default : m;
  } catch (err) {
    if (err && err.code === 'ERR_REQUIRE_ESM') {
      let cached = null;
      const esmPromise = import(pathToFileURL(file).href).then((mod) => {
        cached = mod && mod.default ? mod.default : mod;
        return cached;
      });
      return new Proxy(() => {}, {
        get(_, prop) {
          if (prop === 'then') return esmPromise.then.bind(esmPromise);
          return cached ? cached[prop] : undefined;
        },
        apply(_, thisArg, args) {
          if (cached && typeof cached === 'function') return Reflect.apply(cached, thisArg, args);
          throw new Error(`ESM module "${file}" must be resolved asynchronously.`);
        },
        construct(_, args) {
          if (cached && typeof cached === 'function') return Reflect.construct(cached, args);
          throw new Error(`ESM module "${file}" must be resolved asynchronously.`);
        }
      });
    }
    throw err;
  }
};

const loadModuleAsync = async (file) => {
  try {
    let m = require(file);
    return m && m.default ? m.default : m;
  } catch (err) {
    if (err && err.code === 'ERR_REQUIRE_ESM') {
      const mod = await import(pathToFileURL(file).href);
      return mod && mod.default ? mod.default : mod;
    }
    throw err;
  }
};

// the HTTP side: answers /api/... from routes/api.js
function createBackend(baseDir, { db = null, production = false, log = console, prefix = '/api' } = {}) {
  const { startAutoGarbageCollector } = require('./gc.js');
  startAutoGarbageCollector({ thresholdMB: Number(process.env.AUTO_GC_THRESHOLD_MB) || 200, log: !production && process.env.VERBOSE_GC === '1' });
  installAlias();
  setBaseDir(baseDir);
  if (db) setConnection(db);
  const routesFile = findFile(path.join(baseDir, 'routes', 'api'));
  if (!routesFile) return null;
  const watchDirs = ['app', 'routes'].map((d) => path.join(baseDir, d));
  let signature = '', loadError = null, checkedAt = 0, kernel = { middleware: [], aliases: {} };

  const filesIn = (dir, out = []) => {
    if (!fs.existsSync(dir)) return out;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) filesIn(full, out); else if (/\.(c?js|[mc]?ts|json)$/.test(e.name)) out.push(full + ':' + fs.statSync(full).mtimeMs);
    }
    return out;
  };
  async function load() {
    migrator.forgetProjectFiles(baseDir);
    Route.reset();
    loadError = null;
    try {
      require('./app.js').boot(baseDir); // listeners, policies, jobs, mails… found by folder
      const kfile = findFile(path.join(baseDir, 'app', 'Http', 'Kernel'));
      kernel = kfile ? { middleware: [], aliases: {}, ...(await loadModuleAsync(kfile)) } : { middleware: [], aliases: {} };
      const fn = await loadModuleAsync(routesFile);
      if (typeof fn === 'function') fn(Route); // module.exports = (Route) => { … } works too
    } catch (e) {
      loadError = e;
      log.error(`\n  Error in your backend: ${e.stack || e}\n`);
    }
  }
  let loadingPromise = null;
  async function fresh() {
    if (production && signature) return;
    if (Date.now() - checkedAt < 300 && signature) return;
    checkedAt = Date.now();
    const sig = watchDirs.map((d) => filesIn(d).join('|')).join('#');
    if (sig !== signature) {
      signature = sig;
      loadingPromise = load();
      await loadingPromise;
    } else if (loadingPromise) {
      await loadingPromise;
    }
  }

  // 'auth' → app/Http/Middleware/Authenticate.js or Auth.js; 'role:admin' → handle(req, next, 'admin')
  async function resolveMiddleware(m) {
    if (typeof m !== 'string') return { fn: m, args: [] };
    const cut = m.indexOf(':'); // 'abilities:posts:read,posts:write' → name 'abilities', args ['posts:read', 'posts:write']
    const name = cut < 0 ? m : m.slice(0, cut), argText = cut < 0 ? '' : m.slice(cut + 1);
    const args = argText ? argText.split(',') : [];
    const alias = kernel.aliases && kernel.aliases[name];
    if (alias) {
      if (typeof alias === 'string') {
        const target = path.resolve(baseDir, 'app', 'Http', alias.replace(/\.(c?js|[mc]?ts)$/, ''));
        if (!target.startsWith(path.resolve(baseDir, 'app', 'Http'))) throw new Error(`Forbidden middleware path traversal in alias "${name}".`);
        return { fn: await loadModuleAsync(findFile(target) || path.resolve(baseDir, 'app', 'Http', alias)), args };
      }
      return { fn: alias, args };
    }
    if (http.builtIn[name]) return { fn: http.builtIn[name], args };
    const dir = path.join(baseDir, 'app', 'Http', 'Middleware');
    const p = pascal(name);
    // Standard middleware alias names: 'auth', 'guest', 'verified', 'password.confirm'
    const known = { auth: 'Authenticate', guest: 'RedirectIfAuthenticated', verified: 'EnsureEmailIsVerified', 'password.confirm': 'RequirePassword', admin: 'EnsureIsAdmin', role: 'EnsureHasRole', abilities: 'CheckAbilities', ability: 'CheckForAnyAbility' }[name];
    const names = [name, p, p + 'Middleware', known].filter(Boolean);
    const file = names.map((n) => findFile(path.join(dir, n))).find(Boolean);
    if (!file) throw new Error(`No middleware "${name}". Make it with:  som make:middleware ${p}`);
    if (!path.resolve(file).startsWith(path.resolve(baseDir, 'app'))) throw new Error(`Forbidden middleware path.`);
    return { fn: await loadModuleAsync(file), args };
  }
  async function callMiddleware(mw, req, next) {
    const { fn, args } = await resolveMiddleware(mw);
    let handler;
    if (typeof fn === 'function' && /^class\s/.test(Function.prototype.toString.call(fn))) { const o = new fn(); handler = o.handle.bind(o); }
    else if (typeof fn === 'function') handler = fn;
    else if (fn && typeof fn.handle === 'function') handler = fn.handle.bind(fn);
    else throw new Error(`Middleware "${mw}" must be a function or have handle(req, next).`);
    return http.toResponse(await handler(req, next, ...args));
  }
  async function resolveController(cname, ns = '') {
    // Prevent directory traversal attacks like ../../../etc/passwd
    let rel = String(cname || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (rel.includes('..')) throw new Error(`Invalid controller name "${cname}": directory traversal detected.`);
    rel = rel.replace(/^App\/Http\/Controllers\//i, '');
    if (ns) {
      const cleanNs = String(ns || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/^App\/Http\/Controllers\//i, '');
      if (cleanNs.includes('..')) throw new Error(`Invalid namespace "${ns}": directory traversal detected.`);
      if (cleanNs && !rel.toLowerCase().startsWith(cleanNs.toLowerCase() + '/')) {
        rel = `${cleanNs}/${rel}`;
      }
    }
    const resolvedPath = path.resolve(baseDir, 'app', 'Http', 'Controllers', rel);
    const appHttpDir = path.resolve(baseDir, 'app');
    if (!resolvedPath.startsWith(appHttpDir)) throw new Error(`Forbidden controller path for "${cname}".`);
    const file = findFile(resolvedPath) || findFile(path.resolve(baseDir, 'app', rel));
    if (!file || !path.resolve(file).startsWith(appHttpDir)) throw new Error(`No controller "${cname}". Looked for ${rel} in app/Http/Controllers/.`);
    return await loadModuleAsync(file);
  }

  // [PostController, 'show'], ['Admin\\UserController', 'index'], 'Admin\\UserController@index', or a function
  async function resolveAction(action, ns = '') {
    if (typeof action === 'function' && !/^class\s/.test(Function.prototype.toString.call(action))) return { fn: action, self: null };
    let Controller, method;
    if (Array.isArray(action)) {
      [Controller, method] = action;
      if (typeof Controller === 'string') Controller = await resolveController(Controller, ns);
    } else if (typeof action === 'string') {
      const [cname, m] = action.split('@');
      Controller = await resolveController(cname, ns);
      method = m || '__invoke';
    } else if (typeof action === 'function') {
      Controller = action;
      method = '__invoke';
    }
    const self = typeof Controller === 'function' && /^class\s/.test(Function.prototype.toString.call(Controller))
      ? new Controller()
      : (typeof Controller === 'function' ? Controller : Controller);
    const fn = typeof self === 'function' && method === '__invoke'
      ? self
      : (self && typeof self[method] === 'function' ? self[method] : null);
    if (!fn) throw new Error(`${(Controller && Controller.name) || 'The controller'} has no method ${method}().`);
    return { fn, self };
  }

  const MAX_BODY = (Number(process.env.MAX_BODY_KB) || 5120) * 1024; // MAX_BODY_KB in .env (default 5 MB)
// every API answer: not to be guessed as another file type, framed by other sites, or cached with someone's data
const SECURITY_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin', 'Cross-Origin-Resource-Policy': 'same-origin' };
  const { safeObjectFromEntries, parseJson } = require('../safe-json.js');
  const readBody = (req) => new Promise((resolve, reject) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return resolve({});
    const chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new http.HttpError(413, 'The body is too large.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      const type = req.headers['content-type'] || '';
      if (/multipart\/form-data/i.test(type)) { // uploads: fields go in the body, files in req.files
        try { const { fields, files } = require('./storage.js').parseMultipart(buf, type); return resolve({ __files: files, ...fields }); }
        catch (e) { return reject(new http.HttpError(400, e.message)); }
      }
      const raw = buf.toString('utf8');
      if (!raw) return resolve({});
      if (/json/.test(type)) { try { return resolve(parseJson(raw)); } catch (_) { return reject(new http.HttpError(400, 'Send valid JSON.')); } }
      if (/x-www-form-urlencoded/.test(type)) return resolve(safeObjectFromEntries(new URLSearchParams(raw)));
      resolve({ body: raw });
    });
    req.on('error', reject);
  });
  const send = (res, r) => {
    if (res.headersSent || res.writableEnded) return;
    const status = r.statusCode || 200;
    const noBody = status === 204 || status === 304 || r.body === undefined;
    const isHtml = typeof r.body === 'string' && (r.headers && r.headers['Content-Type'] && r.headers['Content-Type'].includes('text/html'));
    const contentType = isHtml ? r.headers['Content-Type'] : (noBody ? undefined : 'application/json; charset=utf-8');
    const headers = { ...(contentType ? { 'Content-Type': contentType } : {}), 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...r.headers };
    res.writeHead(status, headers);
    res.end(noBody ? '' : (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)));
  };
  const errorResponse = (e, req = null) => {
    if (e instanceof http.ValidationError) return http.response({ message: e.message, errors: e.errors }, 422);
    if (e instanceof ModelNotFoundError) return http.response({ message: e.message }, 404);
    if (e instanceof http.HttpError) return http.response({ message: e.message }, e.status, (e.extra && e.extra.headers) || {});
    // a database rule said no: unique or foreign key
    const msg = String(e && e.message || e);
    if (/UNIQUE constraint|Duplicate entry|duplicate key/i.test(msg)) return http.response({ message: 'This value is already taken.' }, 409);
    if (/FOREIGN KEY constraint|foreign key constraint/i.test(msg)) return http.response({ message: 'A related row is missing, or other rows still use this one.' }, 409);

    const { Log } = require('./support.js');
    Log.error(msg, {
      url: req ? req.url : undefined,
      method: req ? req.method : undefined,
      stack: e && e.stack,
    });

    const status = e && e.status >= 400 && e.status < 600 ? e.status : 500;
    const wantsHtml = req && req.headers && req.headers.accept && req.headers.accept.includes('text/html');

    if (!production && wantsHtml) {
      const { renderErrorPage } = require('./error-page.js');
      return http.response(renderErrorPage(e, req, { status }), status, { 'Content-Type': 'text/html; charset=utf-8' });
    }

    if (!production) {
      const { parseStack } = require('./error-page.js');
      const frames = parseStack(e && e.stack);
      return http.response({
        message: msg,
        exception: e && e.name || 'Error',
        file: frames[0] ? frames[0].file : undefined,
        line: frames[0] ? frames[0].line : undefined,
        trace: frames.slice(0, 10),
      }, status);
    }

    return http.response({ message: 'Server error.' }, status);
  };

  // answers the request and returns true, or returns false when no route matches (so other handlers can try)
  async function handler(req, res, urlPath) {
    await fresh();
    if (!(urlPath === prefix || urlPath.startsWith(prefix + '/'))) return false;
    const sub = urlPath.slice(prefix.length) || '/';
    if (loadError) { send(res, errorResponse(loadError, req)); return true; }
    const method = req.method.toUpperCase();
    const routes = Route.list();
    let match = null, params = null;
    for (const r of [...routes.filter((x) => !x.isFallback), ...routes.filter((x) => x.isFallback)]) {
      const p = r.match(sub);
      if (!p) continue;
      if (r.methods.includes(method)) { match = r; params = p; break; }
      if (!match) match = false; // the address exists, with another method
    }
    if (!match) {
      if (match === false) { send(res, http.response({ message: `The ${method} method is not supported for this route.` }, 405)); return true; }
      return false;
    }
    const url = new URL(req.url, 'http://x');
    let request;
    try {
      const body = await readBody(req);
      const files = body && body.__files; if (files) delete body.__files;
      request = new http.Request(req, res, { path: urlPath, query: safeObjectFromEntries(url.searchParams), body, params });
      request.files = files || {};
      request.routeEntry = match;
      const middleware = [...(kernel.middleware || []), ...match.middlewares];
      const { fn, self } = await resolveAction(match.action, match.namespace);
      const run = async (i, r) => {
        if (i < middleware.length) return callMiddleware(middleware[i], r, (next) => run(i + 1, next || r));
        return http.toResponse(await fn.call(self, r, ...Object.values(params)));
      };
      send(res, await run(0, request));
    } catch (e) {
      send(res, errorResponse(e));
    }
    return true;
  }
  handler.routes = () => Route.list();
  // may this request have a protected file (the admin panel)? Runs the middleware named in app/Http/Kernel.js
  // (`admin: ['auth', 'admin']` by default) the same way a route would. → { ok: true } or { status: 401 | 403 … }
  handler.allows = async (req, names) => {
    await fresh();
    if (loadError) return { status: 500 };
    names = names || (kernel.admin && kernel.admin.middleware) || kernel.adminMiddleware || ['auth', 'admin'];
    const url = new URL(req.url, 'http://x');
    const request = new http.Request(req, null, { path: url.pathname, query: safeObjectFromEntries(url.searchParams), body: {}, params: {} });
    const run = async (i, r) => (i < names.length ? callMiddleware(names[i], r, (next) => run(i + 1, next || r)) : http.response({ ok: true }));
    try {
      const r = await run(0, request);
      return r.statusCode < 400 ? { ok: true } : { status: r.statusCode };
    } catch (e) {
      if (!(e instanceof http.HttpError)) log.error(`  ${e && e.stack || e}`);
      return { status: e instanceof http.HttpError ? e.status : 500 };
    }
  };
  handler.reload = () => { signature = ''; fresh(); };
  fresh();
  return handler;
}

module.exports = {
  Route, Model, ModelBuilder, DB, Builder, raw, Collection, collect, Factory, fake, Seeder: migrator.Seeder,
  Request: http.Request, Response: http.Response, response: http.response, noContent: http.noContent,
  abort: http.abort, abortIf: http.abortIf, abortUnless: http.abortUnless, HttpError: http.HttpError, ValidationError: http.ValidationError,
  slug: require('./support.js').slug, uniqueSlug: require('./support.js').uniqueSlug,
  ModelNotFoundError, createSchema, setConnection,
  castIn: require('./model.js').castIn, castOut: require('./model.js').castOut,
  VerifyCsrfToken: http.VerifyCsrfToken, csrf: http.builtIn.csrf, generateCsrfToken: http.generateCsrfToken, verifyCsrfToken: http.verifyCsrfToken,
  ...require('./namespace.js'), // use, namespace
  ...require('./support.js'), // Hash, Str, slug, uniqueSlug, Url, Crypt, Log, Lang, __, Http, env, now
  ...require('./mail.js'),    // Mail (Mail.to(…).send(new WelcomeMail(user))), Mailable
  ...require('./events.js'),  // Event, event
  Job: require('./queue.js').Job, dispatch: require('./queue.js').dispatch, dispatchSync: require('./queue.js').dispatchSync,
  ...require('./notifications.js'), // Notification
  ...require('./cache.js'),   // Cache
  ...require('./redis.js'),   // Redis
  Storage: require('./storage.js').Storage, UploadedFile: require('./storage.js').UploadedFile,
  ...require('./gate.js'),    // Gate
  ...require('./form.js'),    // FormRequest, JsonResource, ResourceCollection
  Schedule: require('./schedule.js').Schedule,
  Command: require('./command.js').Command,
  QR: require('./qr.js').QR,
  ...require('./gc.js'),
  ...require('./mcp.js'),
  ...require('./config.js'), // config, Config, ConfigRepository
  ...require('./html.js'),   // cleanHtml, sanitizeHtml, stripTags, escapeHtml, e, unescapeHtml, SafeHtml, html
  // for the som command
  createBackend, installAlias, migrator,
};
