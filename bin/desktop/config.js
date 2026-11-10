/*
 * Loading the desktop configuration of a project.
 *
 * Order, the last one wins (each layer is checked on its own, then merged):
 *   1. built-in defaults                       (schema.js)
 *   2. shared KreftJS configuration            kreftjs.config.json → "desktop"        (both runtimes; options one runtime lacks are ignored)
 *   3. shared environment                      KREFT_DESKTOP_<GROUP>_<OPTION>          (both runtimes; same leniency)
 *   4. runtime configuration file              config/electron.config.js | config/tauri.config.js   (CommonJS or ESM)
 *   5. runtime environment                     KREFT_ELECTRON_<GROUP>_<OPTION> | KREFT_TAURI_…  and the older ELECTRON_MENU / ELECTRON_DEVTOOLS
 *   6. command line                            --set group.option=value, --menu=hidden|visible|auto, --devtools[=mode], --no-devtools
 */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { SCHEMA, defaultOf, leaves, envName, sharedEnvName, pick } = require('./schema.js');
const { ConfigError, validateLayer, crossCheck, deepMerge, closest, isObj } = require('./validate.js');

const FILE_NAMES = (rt) => ['js', 'cjs', 'mjs'].map((ext) => `${rt}.config.${ext}`);

function projectRoot(start = process.cwd()) {
  const lay = require('../layout.js').layout(start);
  return lay.project || path.resolve(start);
}

function readPackage(root) {
  try { return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')); } catch (_) { return {}; }
}

const isEsmProject = (root) => readPackage(root).type === 'module';

function configFile(root, runtime) {
  for (const name of FILE_NAMES(runtime)) {
    const f = path.join(root, 'config', name);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

// config/<runtime>.config.js: CommonJS (module.exports) or ESM (export default), an object or a function that returns one
async function loadFile(file, ctx) {
  const rel = path.relative(process.cwd(), file) || file;
  let mod;
  try {
    const esm = file.endsWith('.mjs') || (file.endsWith('.js') && isEsmProject(path.dirname(path.dirname(file))));
    if (esm) mod = await import(pathToFileURL(file).href + '?t=' + Date.now());
    else { delete require.cache[require.resolve(file)]; mod = require(file); }
  } catch (e) {
    const hint = /Unexpected token 'export'|Cannot use import statement/.test(e.message)
      ? ` The file uses "export default" but this project is CommonJS. Use "module.exports = { … }", or rename the file to .mjs, or set "type": "module" in package.json.`
      : /module is not defined|exports is not defined|require is not defined/.test(e.message)
        ? ` The file uses module.exports but this project is ESM ("type": "module"). Use "export default { … }", or rename the file to .cjs.`
        : '';
    throw new ConfigError([{ path: '', message: `${rel} could not be loaded: ${e.message}.${hint}` }], ctx.runtime);
  }
  // an ES module namespace (export default), or a transpiled one (exports.default); anything else is the value itself
  let value = mod;
  if (mod && typeof mod === 'object' && 'default' in mod && (Object.prototype.toString.call(mod) === '[object Module]' || mod.__esModule)) value = mod.default;
  if (typeof value === 'function') {
    try { value = await value(ctx); } catch (e) { throw new ConfigError([{ path: '', message: `the function exported by ${rel} threw: ${e.message}` }], ctx.runtime); }
  }
  if (!isObj(value)) throw new ConfigError([{ path: '', message: `${rel} must export an object (or a function that returns one), not ${value === undefined ? 'nothing' : typeof value}.` }], ctx.runtime);
  return value;
}

// ---- environment and command line -----------------------------------------------------------------------------------

function coerce(n, raw) {
  const s = String(raw).trim();
  if (s === 'null' && n.nullable) return null;
  switch (n.kind) {
    case 'bool': return /^(true|1|yes|on)$/i.test(s) ? true : /^(false|0|no|off)$/i.test(s) ? false : raw;
    case 'int': case 'number': return s !== '' && Number.isFinite(Number(s)) ? Number(s) : raw;
    case 'list': {
      if (s.startsWith('[')) { try { return JSON.parse(s); } catch (_) { return raw; } }
      return s === '' ? [] : s.split(',').map((x) => x.trim());
    }
    case 'map': { try { return JSON.parse(s); } catch (_) { return raw; } }
    default: return raw;
  }
}

function setPath(obj, parts, value) {
  let o = obj;
  parts.slice(0, -1).forEach((k) => { o[k] = isObj(o[k]) ? o[k] : {}; o = o[k]; });
  o[parts[parts.length - 1]] = value;
  return obj;
}

function nodeAt(parts) {
  let n = SCHEMA;
  for (const k of parts) {
    if (!n || n.kind !== 'group' || !n.fields[k]) return null;
    n = n.fields[k];
  }
  return n;
}

function legacyEnv(runtime, env) {
  const out = [];
  if (runtime !== 'electron') return out;
  const menu = env.ELECTRON_MENU;
  if (menu) {
    const map = { show: 'visible', auto: 'auto', hide: 'hidden', visible: 'visible', hidden: 'hidden' };
    out.push({ source: 'environment variable ELECTRON_MENU', value: { menu: { visibility: map[String(menu).toLowerCase()] || menu } } });
  }
  const dt = env.ELECTRON_DEVTOOLS ?? env.KREFT_ELECTRON_DEVTOOLS;
  if (dt !== undefined && dt !== '') {
    const name = env.ELECTRON_DEVTOOLS !== undefined ? 'ELECTRON_DEVTOOLS' : 'KREFT_ELECTRON_DEVTOOLS';
    const v = String(dt).trim().toLowerCase();
    const off = ['false', '0', 'hide', 'off', 'no'].includes(v);
    const mode = ['bottom', 'left', 'detach', 'undocked'].includes(v) ? (v === 'undocked' ? 'detach' : v) : 'right';
    out.push({ source: `environment variable ${name}`, value: { devtools: off ? { openOnStart: false } : { openOnStart: true, mode } } });
  }
  return out;
}

function envLayers(runtime, env) {
  const shared = [], own = [];
  for (const [p, n] of leaves()) {
    const sn = sharedEnvName(p), rn = envName(runtime, p);
    if (env[sn] !== undefined && env[sn] !== '') shared.push({ source: `environment variable ${sn}`, value: setPath({}, p, coerce(n, env[sn])) });
    if (env[rn] !== undefined && env[rn] !== '') own.push({ source: `environment variable ${rn}`, value: setPath({}, p, coerce(n, env[rn])) });
  }
  return { shared, own: [...legacyEnv(runtime, env), ...own] };
}

// the --set options and the short flags of the dev and build commands; returns { layers, rest } where rest is what is left
function cliLayers(runtime, args = []) {
  const layers = [], rest = [], errors = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--set' || a.startsWith('--set=')) {
      const spec = a === '--set' ? args[++i] : a.slice(6);
      const eq = spec ? spec.indexOf('=') : -1;
      if (eq < 1) { errors.push({ path: '--set', message: `expected --set group.option=value, got ${JSON.stringify(spec || '')}. Example: --set window.width=1000` }); continue; }
      const parts = spec.slice(0, eq).split('.');
      const n = nodeAt(parts);
      const raw = spec.slice(eq + 1);
      let value = n ? coerce(n, raw) : raw;
      if (!n) { try { value = JSON.parse(raw); } catch (_) { /* text */ } }
      layers.push({ source: `command line (--set ${spec})`, value: setPath({}, parts, value) });
    } else if (a.startsWith('--menu=') || a === '--menu') {
      const v = a === '--menu' ? args[++i] : a.slice(7);
      layers.push({ source: `command line (${a === '--menu' ? '--menu ' + v : a})`, value: { menu: { visibility: { show: 'visible', hide: 'hidden' }[v] || v } } });
    } else if (a === '--devtools' || a.startsWith('--devtools=')) {
      const mode = a.includes('=') ? a.split('=')[1] : '';
      const m = mode === 'undocked' ? 'detach' : mode;
      layers.push({ source: `command line (${a})`, value: { devtools: { openOnStart: true, ...(m && !['true', '1'].includes(m) ? { mode: m } : {}) } } });
    } else if (a === '--no-devtools') {
      layers.push({ source: 'command line (--no-devtools)', value: { devtools: { openOnStart: false } } });
    } else rest.push(a);
  }
  return { layers, rest, errors };
}

// ---- values that come from package.json ---------------------------------------------------------------------------

const slug = (s) => String(s || 'app').replace(/^@[^/]+\//, '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'app';
const title = (s) => String(s || 'Kreft Desktop').replace(/^@[^/]+\//, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const git = (k) => { try { return require('child_process').execSync('git config ' + k, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (_) { return ''; } };

function authorText(a) {
  if (!a) return '';
  if (typeof a === 'string') return a;
  return a.email ? `${a.name || ''} <${a.email}>`.trim() : a.name || '';
}

function derive(c, pkg) {
  const a = c.app;
  a.name = a.name || pkg.productName || title(pkg.name);
  a.id = a.id || `com.kreftjs.${slug(pkg.name)}`;
  a.version = a.version || pkg.version || '0.1.0';
  a.description = a.description || pkg.description || a.name;
  a.author = a.author || authorText(pkg.author) || `${git('user.name') || a.name} <${git('user.email') || 'you@example.com'}>`;
  a.homepage = a.homepage || pkg.homepage || 'https://kreftjs.com';
  a.copyright = a.copyright || `Copyright © ${new Date().getFullYear()} ${a.author.replace(/\s*<.*>/, '')}`;
  c.window.title = c.window.title || a.name;
  c.tray.tooltip = c.tray.tooltip || a.name;
  return c;
}

// ---- putting it together ------------------------------------------------------------------------------------------

async function resolve(runtime, root = projectRoot(), opts = {}) {
  const env = opts.env || process.env;
  const ctx = { runtime, mode: opts.mode || 'development', platform: process.platform, env };
  const errors = [], warnings = [], layers = [];
  let config = defaultOf(SCHEMA, runtime);
  const add = (source, value, lenient) => {
    const r = validateLayer(runtime, value, source, { lenient });
    errors.push(...r.errors); warnings.push(...r.warnings);
    config = deepMerge(config, r.value);
    layers.push(source);
  };

  const shared = require('../kreftjs-config.js').readConfig(root);
  if (isObj(shared.desktop)) add('kreftjs.config.json ("desktop")', shared.desktop, true);
  const envs = envLayers(runtime, env);
  envs.shared.forEach((l) => add(l.source, l.value, true));

  const file = opts.file !== undefined ? opts.file : configFile(root, runtime);
  if (file) {
    const value = await loadFile(file, ctx);
    add(path.relative(root, file).split(path.sep).join('/'), value, false);
  }
  envs.own.forEach((l) => add(l.source, l.value, false));
  const cli = cliLayers(runtime, opts.args || []);
  errors.push(...cli.errors);
  cli.layers.forEach((l) => add(l.source, l.value, false));

  derive(config, readPackage(root));
  const cross = crossCheck(runtime, config);
  errors.push(...cross.errors); warnings.push(...cross.warnings);
  if (errors.length) throw new ConfigError(errors, runtime);
  return { config, warnings, layers, file, rest: cli.rest, root };
}

function printWarnings(warnings, runtime) {
  if (!warnings.length) return;
  console.warn(`\n  ${runtime === 'electron' ? 'Electron' : 'Tauri'} configuration notes:`);
  for (const w of warnings) console.warn(`    - ${w.path ? w.path + ': ' : ''}${w.message}`);
  console.warn('');
}

// runs resolve() and reports a ConfigError as a plain message (a stack trace helps nobody here)
async function resolveOrExit(runtime, root, opts) {
  try {
    const r = await resolve(runtime, root, opts);
    if (!opts || !opts.quiet) printWarnings(r.warnings, runtime);
    return r;
  } catch (e) {
    if (e instanceof ConfigError) { console.error('\n' + e.message); process.exit(1); }
    throw e;
  }
}

// ---- the commented config file written by `kreft add electron` / `kreft add tauri` ---------------------------------------

function template(runtime, esm = false) {
  const E = runtime === 'electron';
  const name = E ? 'Electron' : 'Tauri';
  const cls = E ? 'ElectronConfig' : 'TauriConfig';
  const head = `/**
 * ${name} settings for this app. Edit the values, save, and run \`kreft ${runtime}:dev\` again.
 * Nothing in ${E ? 'electron/' : 'src-tauri/'} needs to be edited: it reads this file.
 *
 * What is used, in this order (the last one wins):
 *   built-in defaults → kreftjs.config.json ("desktop") → this file → environment variables → command line
 * Environment: ${E ? 'KREFT_ELECTRON_WINDOW_WIDTH=1000' : 'KREFT_TAURI_WINDOW_WIDTH=1000'} · command line: --set window.width=1000
 * Every option, with what it does: ${'https://kreftjs.com/docs#desktop-configuration'}
 * Run \`kreft ${runtime}:config\` to see the final result, and to check this file for mistakes.
 */
`;
  const body = `{
  // ---- the app -----------------------------------------------------------------------------------------------
  app: {
    name: null,            // the name people see; null: from package.json
    id: null,              // reverse domain, like 'com.acme.notes'; null: com.kreftjs.<name>. Cannot change after you publish.
    version: null,         // null: the "version" in package.json
    description: null,
    author: null,
    homepage: null,
    copyright: null,
  },

  // ---- the main window ---------------------------------------------------------------------------------------
  window: {
    title: null,           // null: the app name
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    maxWidth: null,
    maxHeight: null,
    x: null,               // set x and y together, or leave both null
    y: null,
    center: true,
    resizable: true,
    fullscreen: false,
    maximized: false,
    alwaysOnTop: false,
    frame: true,           // false: no title bar and border
    transparent: false,
    backgroundColor: '#ffffff',
    theme: 'system',       // 'system' | 'light' | 'dark'
    skipTaskbar: false,${E ? `
    showOnReady: true,     // show the window when the page is ready (no white flash)` : ''}
  },

  // ---- the native application menu ---------------------------------------------------------------------------
  menu: {
    visibility: 'hidden', // 'hidden' | 'visible'${E ? " | 'auto' (hidden until Alt is pressed; Windows and Linux)" : ''}
    template: null,        // your own menu; see the docs. Needs visibility: 'visible'.
    //   [{ label: 'File', submenu: [{ label: 'New', id: 'file-new', accelerator: 'CmdOrCtrl+N' }, { type: 'separator' }, { role: 'quit' }] }]
    //   The page hears a click with: window.kreftDesktop.onMenu((id) => …)${E ? '' : '  (Tauri: window.__TAURI__.event.listen(\'kreft:menu\', …))'}
  },

  // ---- the right-click menu ----------------------------------------------------------------------------------
  contextMenu: {
    enabled: true,${E ? `
    items: ['copy', 'cut', 'paste', 'selectAll'],
    inspectElement: true,  // "Inspect element", where DevTools are allowed` : ''}
  },

  // ---- developer tools ---------------------------------------------------------------------------------------
  devtools: {
    development: true,     // allowed while you work
    production: false,     // not in the installed app
    openOnStart: false,    // closed until you press F12 (or Ctrl+Shift+I); true: open at startup
    mode: '${E ? 'right' : 'detach'}',${E ? "         // 'right' | 'bottom' | 'left' | 'detach'" : "        // Tauri opens DevTools in their own window"}
    shortcut: true,
  },

  // ---- the web page inside the window ------------------------------------------------------------------------
  webview: {
    zoomFactor: 1,
    userAgent: null,${E ? `
    spellcheck: false,
    backgroundThrottling: true,` : ''}
    openExternalLinksInBrowser: true,
    allowedNavigation: [], // other origins the window may go to, like 'https://login.acme.com'
  },

  // ---- security: the defaults are the safe ones --------------------------------------------------------------
  security: {
    csp: null,             // a Content-Security-Policy, like "default-src 'self'"
    blockNewWindows: true,${E ? `
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
    permissions: [],       // browser permissions the page may get: 'geolocation', 'media', …` : `
    capabilities: [],      // extra permissions for the window, like 'dialog:default' ('core:default' is always there)
    globalTauri: true,     // window.__TAURI__`}
  },

  // ---- the tray icon -----------------------------------------------------------------------------------------
  tray: {
    enabled: false,
    icon: null,            // a PNG file in the project; null: the app icon
    tooltip: null,
    closeToTray: false,    // closing the window keeps the app in the tray
    clickAction: 'toggle', // 'toggle' | 'show' | 'none'
    menu: [
      { label: 'Show', action: 'show' },
      { type: 'separator' },
      { label: 'Quit', action: 'quit' },
      // { label: 'Sync now', action: 'emit', id: 'sync' },   // the page hears: kreftDesktop.onTray((id) => …)
    ],
  },

  // ---- notifications -----------------------------------------------------------------------------------------
  notifications: {
    enabled: false,         // true: the page may show system notifications (Tauri adds its notification plugin)
  },

  // ---- updates -----------------------------------------------------------------------------------------------
  updates: {
    enabled: false,
    url: null,             // the https folder with your update files
    channel: 'latest',
    checkOnStart: true,${E ? `
    autoDownload: false,   // needs: kreft add electron-updater` : `
    pubkey: null,          // the public key of "npx tauri signer generate"`}
  },

  // ---- installers --------------------------------------------------------------------------------------------
  packaging: {
    icon: 'build/icon.png', // a square PNG, 1024×1024 is best
    category: null,${E ? `
    electron: {
      outputDir: 'dist-electron',
      mac: ['dmg', 'zip'],
      win: ['nsis', 'portable'],
      linux: ['AppImage', 'deb', 'rpm'],
      asar: true,
      compression: 'normal',
      files: ['dist/**/*', 'electron/**/*', 'package.json'],
      extraResources: [],
    },` : `
    tauri: {
      targets: null,        // null: all that fit this system; or ['app', 'dmg', 'nsis', 'msi', 'deb', 'rpm', 'appimage']
      resources: [],
      macMinimumSystemVersion: '10.15',
      windowsWebviewInstall: 'downloadBootstrapper',
    },`}
  },

  // ---- a way out: merged last into the native configuration --------------------------------------------------
  advanced: {
    ${E ? 'builder: {},          // electron-builder options this file does not have' : 'tauriConf: {},        // tauri.conf.json options this file does not have'}
  },
}`;
  const typed = `/** @type {import('kreftjs/desktop').${cls}} */\n`;
  return esm
    ? `${head}\n${typed}export default ${body}\n`
    : `${head}\n${typed}module.exports = ${body}\n`;
}

// Writes config/<runtime>.config.js. An existing file is never replaced without a yes: asked on a terminal, refused otherwise
// unless `force` is given. Returns { file, state: 'created' | 'kept' | 'replaced' }.
async function ensureConfigFile(root, runtime, { force = false, confirm = null } = {}) {
  const existing = configFile(root, runtime);
  const esm = isEsmProject(root);
  const target = existing || path.join(root, 'config', `${runtime}.config.${esm ? 'js' : 'js'}`);
  if (existing) {
    let yes = force;
    if (!yes && confirm) yes = await confirm(`  ${path.relative(root, existing)} already exists. Replace it with the default settings? Your changes will be lost. [y/N] `);
    if (!yes) return { file: existing, state: 'kept' };
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, template(runtime, esm));
  return { file: target, state: existing ? 'replaced' : 'created' };
}

module.exports = { resolve, resolveOrExit, printWarnings, ensureConfigFile, template, configFile, projectRoot, readPackage, isEsmProject, cliLayers, envLayers, coerce, derive, title, slug, FILE_NAMES, ConfigError, pick, closest };
