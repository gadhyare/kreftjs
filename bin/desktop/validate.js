/*
 * Checking a configuration against the schema.
 *
 *   validateLayer(runtime, value, source, { lenient })  one layer (a file, the environment, the command line):
 *       unknown option, wrong type, out of range, not allowed in this runtime → an error that says what to do.
 *       lenient (the shared kreftjs.config.json): an option the runtime does not have is dropped with a warning, because
 *       the same shared file serves both runtimes.
 *   crossCheck(runtime, config)  rules that involve several options, and the warnings about unsafe settings.
 *   deepMerge(a, b)             groups merge, everything else (lists, values) is replaced.
 */
const { SCHEMA, appliesTo, defaultOf } = require('./schema.js');

class ConfigError extends Error {
  constructor(errors, runtime) {
    super(format(errors, runtime));
    this.name = 'ConfigError';
    this.errors = errors;
    this.runtime = runtime;
  }
}

function format(errors, runtime) {
  const n = errors.length;
  const lines = errors.map((e) => `  - ${e.path ? e.path + ': ' : ''}${e.message}${e.source ? `\n    (from ${e.source})` : ''}`);
  return `The ${runtime} configuration has ${n} problem${n === 1 ? '' : 's'}:\n${lines.join('\n')}\n`;
}

function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

function closest(word, options) {
  let best = null, score = Infinity;
  for (const o of options) {
    const s = distance(word.toLowerCase(), o.toLowerCase());
    if (s < score) { score = s; best = o; }
  }
  return best && score <= Math.max(2, Math.floor(word.length / 3)) ? best : null;
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const show = (v) => (typeof v === 'string' ? JSON.stringify(v) : Array.isArray(v) || isObj(v) ? JSON.stringify(v) : String(v));
const valuesOf = (n, rt) => (Array.isArray(n.values) ? n.values : n.values[rt]);

function deepMerge(a, b) {
  if (!isObj(a) || !isObj(b)) return b === undefined ? a : b;
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    out[k] = isObj(v) && isObj(a[k]) ? deepMerge(a[k], v) : v;
  }
  return out;
}

// a leaf value → the cleaned value, or pushes errors
function checkValue(n, v, path, rt, ctx) {
  const fail = (message) => { ctx.errors.push({ path, message, source: ctx.source }); return undefined; };
  if (v === null) {
    if (n.nullable) return null;
    return fail(`cannot be null. ${n.doc}`);
  }
  switch (n.kind) {
    case 'bool':
      if (typeof v !== 'boolean') return fail(`expected true or false, got ${show(v)}.`);
      break;
    case 'int':
    case 'number': {
      if (typeof v !== 'number' || !Number.isFinite(v)) return fail(`expected a number, got ${show(v)}.`);
      if (n.kind === 'int' && !Number.isInteger(v)) return fail(`expected a whole number, got ${v}.`);
      if (n.min !== undefined && v < n.min) return fail(`must be at least ${n.min}, got ${v}.`);
      if (n.max !== undefined && v > n.max) return fail(`must be at most ${n.max}, got ${v}.`);
      break;
    }
    case 'string':
      if (typeof v !== 'string') return fail(`expected text, got ${show(v)}.`);
      if (n.pattern && !n.pattern.test(v)) return fail(`${show(v)} is not a valid value. ${n.doc}`);
      break;
    case 'enum': {
      const values = valuesOf(n, rt);
      if (typeof v !== 'string' || !values.includes(v)) {
        const near = typeof v === 'string' ? closest(v, values) : null;
        const other = !Array.isArray(n.values) && Object.entries(n.values).find(([r, list]) => r !== rt && list.includes(v));
        // the shared file serves both runtimes: a value that only the other runtime knows is ignored here
        if (other && ctx.lenient) { ctx.warnings.push({ path, message: `ignored: ${show(v)} is a value for ${other[0] === 'electron' ? 'Electron' : 'Tauri'}; ${rt === 'electron' ? 'Electron' : 'Tauri'} uses ${valuesOf(n, rt).join(', ')}.`, source: ctx.source }); return undefined; }
        return fail(`${show(v)} is not allowed${other ? ` in ${rt} (that value is for ${other[0] === 'electron' ? 'Electron' : 'Tauri'})` : ''}. Use one of: ${values.join(', ')}.${near ? ` Did you mean "${near}"?` : ''}`);
      }
      break;
    }
    case 'list': {
      if (!Array.isArray(v)) return fail(`expected a list like [ … ], got ${show(v)}.`);
      const out = [];
      v.forEach((item, i) => {
        const p = `${path}[${i}]`;
        const itemSchema = n.recursive ? ctx.parent : n.items;
        if (itemSchema.kind === 'group') {
          if (!isObj(item)) { ctx.errors.push({ path: p, message: `expected an object like { … }, got ${show(item)}.`, source: ctx.source }); return; }
          out.push(checkGroup(itemSchema, item, p, rt, { ...ctx, parent: itemSchema, inList: true }));
        } else if (itemSchema.kind === 'enum') {
          const values = valuesOf(itemSchema, rt);
          if (ctx.lenient && typeof item === 'string' && !values.includes(item) && !Array.isArray(itemSchema.values) && Object.values(itemSchema.values).some((l) => l.includes(item))) {
            ctx.warnings.push({ path: p, message: `ignored: ${show(item)} is not available in ${rt === 'electron' ? 'Electron' : 'Tauri'}.`, source: ctx.source });
          } else if (typeof item !== 'string' || !values.includes(item)) {
            const near = typeof item === 'string' ? closest(item, values) : null;
            ctx.errors.push({ path: p, message: `${show(item)} is not allowed. Use one of: ${values.join(', ')}.${near ? ` Did you mean "${near}"?` : ''}`, source: ctx.source });
          } else out.push(item);
        } else if (typeof item !== 'string') {
          ctx.errors.push({ path: p, message: `expected text, got ${show(item)}.`, source: ctx.source });
        } else if (n.itemPattern && !n.itemPattern.test(item)) {
          ctx.errors.push({ path: p, message: `${show(item)} is not valid. Expected ${n.itemHint || 'a different value'}.`, source: ctx.source });
        } else out.push(item);
      });
      return out;
    }
    case 'map':
      if (!isObj(v)) return fail(`expected an object like { … }, got ${show(v)}.`);
      return JSON.parse(JSON.stringify(v));
    default:
      break;
  }
  return v;
}

function checkGroup(g, value, path, rt, ctx) {
  if (!isObj(value)) { ctx.errors.push({ path, message: `expected an object like { … }, got ${show(value)}.`, source: ctx.source }); return undefined; }
  const out = {};
  const here = Object.entries(g.fields).filter(([, f]) => appliesTo(f, rt)).map(([k]) => k);
  for (const [key, v] of Object.entries(value)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    const p = path ? `${path}.${key}` : key;
    const field = g.fields[key];
    if (!field) {
      const near = closest(key, here);
      ctx.errors.push({ path: p, message: `unknown option${near ? `. Did you mean "${near}"?` : ''} The options${path ? ` in ${path}` : ''} are: ${here.join(', ')}.`, source: ctx.source });
      continue;
    }
    if (!appliesTo(field, rt)) {
      const message = `is not supported by ${rt === 'electron' ? 'Electron' : 'Tauri'}. ${field.hint || ''}`.trim();
      if (ctx.lenient) ctx.warnings.push({ path: p, message: `ignored: ${message}`, source: ctx.source });
      else ctx.errors.push({ path: p, message, source: ctx.source });
      continue;
    }
    if (field.kind === 'group') {
      const sub = checkGroup(field, v, p, rt, { ...ctx, parent: field });
      if (sub !== undefined) out[key] = sub;
      continue;
    }
    const before = ctx.errors.length;
    const val = checkValue(field, v, p, rt, { ...ctx, parent: g });
    if (field.requiredValue && field.requiredValue[rt] !== undefined && val !== undefined && val !== field.requiredValue[rt] && ctx.errors.length === before) {
      if (ctx.lenient) ctx.warnings.push({ path: p, message: `ignored: ${field.requiredValue.hint}`, source: ctx.source });
      else ctx.errors.push({ path: p, message: field.requiredValue.hint, source: ctx.source });
      continue;
    }
    if (val !== undefined) out[key] = val;
  }
  // an entry inside a list gets every option, so the code that reads it needs no checks
  if (ctx.inList) for (const [k, f] of Object.entries(g.fields)) if (!(k in out) && f.kind !== 'group') out[k] = defaultOf({ kind: 'group', fields: { [k]: f } }, rt)[k];
  return out;
}

function validateLayer(runtime, value, source, opts = {}) {
  const ctx = { errors: [], warnings: [], source, lenient: Boolean(opts.lenient), parent: SCHEMA };
  if (value === undefined || value === null) return { value: {}, errors: [], warnings: [] };
  const clean = checkGroup(SCHEMA, value, '', runtime, ctx) || {};
  return { value: clean, errors: ctx.errors, warnings: ctx.warnings };
}

// ---- rules over the merged result -----------------------------------------------------------------------------------

function walkMenu(items, visit, trail = 'menu.template') {
  (items || []).forEach((it, i) => {
    const p = `${trail}[${i}]`;
    visit(it, p);
    if (Array.isArray(it.submenu)) walkMenu(it.submenu, visit, p + '.submenu');
  });
}

function crossCheck(runtime, c) {
  const errors = [], warnings = [];
  const e = (path, message) => errors.push({ path, message });
  const w = (path, message) => warnings.push({ path, message });
  const win = c.window;

  if (win.minWidth > win.width) e('window.minWidth', `is ${win.minWidth}, larger than window.width (${win.width}). Lower minWidth or raise width.`);
  if (win.minHeight > win.height) e('window.minHeight', `is ${win.minHeight}, larger than window.height (${win.height}). Lower minHeight or raise height.`);
  if (win.maxWidth !== null && win.maxWidth < win.width) e('window.maxWidth', `is ${win.maxWidth}, smaller than window.width (${win.width}).`);
  if (win.maxHeight !== null && win.maxHeight < win.height) e('window.maxHeight', `is ${win.maxHeight}, smaller than window.height (${win.height}).`);
  if ((win.x === null) !== (win.y === null)) e('window.x', 'x and y go together: set both, or neither.');
  if (win.transparent && win.frame) w('window.transparent', 'a transparent window usually needs frame: false, or the title bar stays opaque.');

  const ids = new Set();
  walkMenu(c.menu.template, (it, p) => {
    if (it.type === 'separator') return;
    if (it.role) {
      if (it.label || it.id || it.submenu) w(p, 'has a role, so its label, id and submenu are ignored.');
      return;
    }
    if (!it.label) e(p, 'needs a label, a role, or type: "separator".');
    if (Array.isArray(it.submenu)) return;
    if (!it.id) e(p, `"${it.label}" needs an id (the name the page receives when it is clicked), or a role.`);
    else if (ids.has(it.id)) e(p, `the id "${it.id}" is used twice. Menu ids must be unique.`);
    else ids.add(it.id);
  });
  if (c.menu.template && c.menu.visibility === 'hidden') w('menu.template', 'a menu template is set but menu.visibility is "hidden": it is never shown. Set menu.visibility to "visible".');

  const tids = new Set();
  if (c.tray.enabled) {
    c.tray.menu.forEach((it, i) => {
      const p = `tray.menu[${i}]`;
      if (it.type === 'separator') return;
      if (!it.label) e(p, 'needs a label, or type: "separator".');
      if (it.action === 'emit') {
        if (!it.id) e(p, `"${it.label || ''}" has action "emit", so it needs an id.`);
        else if (tids.has(it.id)) e(p, `the id "${it.id}" is used twice.`);
        else tids.add(it.id);
      }
    });
    if (c.tray.closeToTray && !c.tray.menu.some((it) => it.action === 'quit')) e('tray.menu', 'closeToTray hides the window, so the tray menu needs an entry with action "quit"; otherwise the app cannot be closed.');
  }

  if (c.updates.enabled) {
    if (!c.updates.url) e('updates.url', 'updates are enabled but there is no url. Set updates.url to the https address of your update files, or set updates.enabled to false.');
    else if (/^http:\/\//i.test(c.updates.url)) {
      if (runtime === 'tauri') e('updates.url', 'must start with https:// (Tauri refuses plain http for updates).');
      else w('updates.url', 'starts with http://. Updates should come over https://.');
    }
    if (runtime === 'tauri' && !c.updates.pubkey) e('updates.pubkey', 'Tauri checks the signature of every update. Make a key with "npx tauri signer generate -w ~/.tauri/myapp.key" and put the public key here.');
  }

  if (c.packaging.tauri && c.packaging.tauri.targets && c.packaging.tauri.targets.length === 0) e('packaging.tauri.targets', 'is empty. List at least one installer, or use null for all.');
  if (runtime === 'electron') {
    const p = c.packaging.electron;
    for (const os of ['mac', 'win', 'linux']) if (!p[os].length) w(`packaging.electron.${os}`, `is empty: "kreft electron:build --${os}" would make nothing.`);
    const s = c.security;
    if (!s.contextIsolation) w('security.contextIsolation', 'is off. The page can then change what the preload script exposes. Turn it on unless you know why not.');
    if (!s.sandbox) w('security.sandbox', 'is off. A bug in the page can then reach the operating system more easily.');
    if (s.nodeIntegration) w('security.nodeIntegration', 'is on. Any script that runs on the page can then run programs on the computer. Keep it off and expose named functions in electron/preload.js.');
    if (!s.webSecurity) w('security.webSecurity', 'is off. Pages can read data from other sites. Keep it on.');
    if (s.allowRunningInsecureContent) w('security.allowRunningInsecureContent', 'is on. An https page may load http scripts. Keep it off.');
    if (s.nodeIntegration && s.contextIsolation === false) w('security', 'Node.js access and no context isolation together are the most dangerous combination.');
  }
  if (c.devtools.production) w('devtools.production', `DevTools are allowed in the installed app. Anyone can open them and read the page's data. Turn it off for releases.${runtime === 'tauri' ? ' Tauri also builds with its "devtools" feature then, which makes release builds larger.' : ''}`);
  return { errors, warnings };
}

module.exports = { ConfigError, validateLayer, crossCheck, deepMerge, format, closest, isObj };
