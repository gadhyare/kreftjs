/*
 * The app's own classes, found by folder (auto-discovery and namespace indexing):
 *   app/Models, app/Jobs, app/Events, app/Listeners, app/Mail, app/Notifications, app/Policies,
 *   app/Console/Commands, app/Observers, app/Http/Controllers, app/Http/Middleware
 * Queued jobs, listeners, mails and notifications are stored by class name and found again here.
 */
const fs = require('fs');
const path = require('path');
const { EXTS } = require('./typescript.js');

const state = { baseDir: null, index: new Map(), booted: false };
const unwrap = (m) => (m && m.default ? m.default : m);

function scan(dir, kind, out, subPath = '') {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      scan(full, kind, out, subPath ? `${subPath}/${e.name}` : e.name);
      continue;
    }
    const ext = path.extname(e.name);
    if (!EXTS.includes(ext) || e.name.endsWith('.d.ts')) continue;
    const baseName = path.basename(e.name, ext);
    const relName = subPath ? `${subPath}/${baseName}` : baseName;
    const nsBackslash = relName.replace(/\//g, '\\');
    const nsForward = relName;

    out.set(`${kind}:${baseName}`, full);
    if (!out.has(baseName)) out.set(baseName, full);

    if (subPath) {
      out.set(`${kind}:${nsBackslash}`, full);
      out.set(`${kind}:${nsForward}`, full);
      out.set(nsBackslash, full);
      out.set(nsForward, full);
    }

    // Index full PHP namespace paths:
    // e.g. App\Models\User, App\Http\Controllers\Admin\UserController
    const folderName = kind === 'command' ? 'Console\\Commands' : kind.startsWith('http_') ? `Http\\${kind.slice(5).charAt(0).toUpperCase() + kind.slice(6)}s` : `${kind.charAt(0).toUpperCase() + kind.slice(1)}s`;
    const fullNamespaceBack = `App\\${folderName}\\${nsBackslash}`;
    const fullNamespaceFwd = fullNamespaceBack.replace(/\\/g, '/');
    out.set(fullNamespaceBack, full);
    out.set(fullNamespaceFwd, full);
  }
}

const KINDS = {
  Models: 'model',
  Jobs: 'job',
  Events: 'event',
  Listeners: 'listener',
  Mail: 'mail',
  Notifications: 'notification',
  Policies: 'policy',
  Observers: 'observer',
  'Console/Commands': 'command',
  'Http/Controllers': 'http_controller',
  'Http/Middleware': 'http_middleware',
};

// boot(baseDir): index the classes, register listeners, observers and policies (again after a change)
function boot(baseDir) {
  state.baseDir = baseDir;
  state.index = new Map();
  for (const [folder, kind] of Object.entries(KINDS)) scan(path.join(baseDir, 'app', ...folder.split('/')), kind, state.index);
  require('./model.js').setBaseDir(baseDir);
  require('./support.js').Log.setDirectory(path.join(baseDir, 'storage', 'logs'));
  require('./support.js').Lang.setDirectory(path.join(baseDir, 'lang'));
  const { Event } = require('./events.js');
  Event.reset();
  for (const file of filesOf('listener')) {
    let L;
    try { L = unwrap(require(file)); } catch (e) { console.error(`  Error in ${path.relative(process.cwd(), file)}: ${e.message}`); continue; }
    if (L && L.event) for (const ev of [].concat(L.event)) Event.listen(ev, L);
  }
  // app/Policies/PostPolicy.js guards the Post model (Gate.authorize('update', post))
  const gate = require('./gate.js');
  gate.Gate.resetPolicies();
  for (const file of filesOf('policy')) {
    const name = path.basename(file, path.extname(file));
    gate.Gate.policyFile(name.replace(/Policy$/, ''), file);
  }
  // app/Providers/*.js: boot() runs now
  const pdir = path.join(baseDir, 'app', 'Providers');
  if (fs.existsSync(pdir)) for (const f of fs.readdirSync(pdir).sort()) {
    if (!EXTS.includes(path.extname(f)) || f.endsWith('.d.ts')) continue;
    try { const P = unwrap(require(path.join(pdir, f))); const p = typeof P === 'function' ? new P() : P; if (p && typeof p.boot === 'function') p.boot(); }
    catch (e) { console.error(`  Error in app/Providers/${f}: ${e.message}`); }
  }
  state.booted = true;
  return state;
}
function filesOf(kind) { return [...state.index].filter(([k]) => k.startsWith(kind + ':')).map(([, f]) => f); }
function find(name, kind) {
  if (!name || typeof name !== 'string') return null;
  const normal = name.replace(/\\/g, '/').replace(/^\/+/, '');
  const backslash = normal.replace(/\//g, '\\');
  const key = kind ? `${kind}:${name}` : name;
  let file = state.index.get(key)
    || state.index.get(name)
    || state.index.get(normal)
    || state.index.get(backslash);

  if (!file && state.baseDir) {
    const rel = normal.replace(/^App\//i, '');
    const { findFile } = require('./typescript.js');
    file = findFile(path.join(state.baseDir, 'app', rel))
      || (kind === 'model' ? findFile(path.join(state.baseDir, 'app', 'Models', rel)) : null)
      || (kind === 'http_controller' ? findFile(path.join(state.baseDir, 'app', 'Http', 'Controllers', rel)) : null);
  }
  return file ? unwrap(require(file)) : null;
}
const baseDir = () => state.baseDir;

module.exports = { boot, find, filesOf, baseDir, unwrap, state };
