/*
 * Electron.js Desktop Support for Kreft
 *
 * Commands:
 *   kreft add electron      Add Electron to this project: config/electron.config.js, electron/, scripts, packages (npm install)
 *   kreft electron:init     The same without installing the packages (alias: kreft make:electron)
 *   kreft electron:dev      Run the app in an Electron desktop window only (hidden server, no browser, no URL)
 *   kreft electron:build    Build the static bundle (kreft build) and make the installers (electron-builder)
 *   kreft electron:config   Check config/electron.config.js and print the final settings (--json)
 *
 * CLI flag:
 *   kreft new my-app --electron
 *
 * Every setting lives in config/electron.config.js (see bin/desktop/). electron/main.js and electron/preload.js are
 * generated bootstrap files that read it: they are not edited.
 */
const fs = require('fs');
const path = require('path');
const { start: spawn, runSync } = require('./win-spawn.js');
const desktop = require('./desktop/config.js');
const adapter = require('./desktop/electron-adapter.js');

function getProjectRoot(start = process.cwd()) {
  const lay = require('./layout.js').layout(start);
  return lay.split ? lay.project : start;
}

const TEMPLATES = adapter.TEMPLATES;

const ELECTRON_VERSION = '^34.2.0';
const BUILDER_VERSION = '^25.1.8';

// A new project's index.html loads Google Fonts: a style sheet from another site that the browser must download before it
// draws anything (about 0.6 s on a first visit, and a failed request when offline). A desktop app does not need it.
// Only the exact links Kreft wrote are removed; returns the file's relative path, or null when there was nothing to remove.
function dropWebFonts(root) {
  const lay = require('./layout.js').layout(root);
  const file = path.join(lay.split ? lay.frontend : root, 'index.html');
  if (!fs.existsSync(file)) return null;
  const html = fs.readFileSync(file, 'utf8');
  const links = /^[ \t]*<link\b[^>\n]*href="https:\/\/fonts\.(?:googleapis|gstatic)\.com[^">\n]*"[^>\n]*>[ \t]*\r?\n/gim;
  const out = html.replace(links, '');
  if (out === html) return null;
  fs.writeFileSync(file, out);
  return path.relative(root, file);
}

// Adds the files and package.json entries. Files that exist are never overwritten, except the generated bootstrap
// (it carries a "kreft-template" line) and an old hand-written main.js, which is saved as .bak first.
function init(args = []) {
  const target = typeof args === 'string' ? args : (args[0] && !args[0].startsWith('-') ? args[0] : process.cwd());
  const root = getProjectRoot(target);
  const pkgFile = path.join(root, 'package.json');
  if (!fs.existsSync(pkgFile)) {
    console.error('  No package.json found. Run this inside a Kreft project.');
    process.exit(1);
  }

  const created = [];
  const notes = adapter.writeBootstrap(root);
  created.push('electron/main.js', 'electron/preload.js');

  // the settings file: created when missing, an existing one is left alone (kreft add asks before it replaces one)
  if (!desktop.configFile(root, 'electron')) {
    const file = path.join(root, 'config', 'electron.config.js');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, desktop.template('electron', desktop.isEsmProject(root)));
    created.unshift('config/electron.config.js');
  }

  const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
  pkg.main = 'electron/main.js';
  pkg.scripts = pkg.scripts || {};
  Object.assign(pkg.scripts, {
    'electron': 'kreft electron',
    'electron:dev': 'kreft electron:dev',
    'electron:build': 'kreft electron:build',
    'electron:build:mac': 'kreft electron:build --mac',
    'electron:build:win': 'kreft electron:build --win',
    'electron:build:linux': 'kreft electron:build --linux',
    'electron:build:all': 'kreft electron:build --mac --win --linux',
  });
  pkg.devDependencies = pkg.devDependencies || {};
  if (!pkg.devDependencies['electron']) pkg.devDependencies['electron'] = ELECTRON_VERSION;
  if (!pkg.devDependencies['electron-builder']) pkg.devDependencies['electron-builder'] = BUILDER_VERSION;
  fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');

  // The app icon: replace build/icon.png with your own (square PNG, 512x512 or bigger)
  if (require('./app-icon.js').ensureIcon(root).made) created.push('build/icon.png  (the app icon: replace it with your own, square PNG 512x512 or bigger)');

  const droppedFonts = dropWebFonts(root);

  console.log(`
  Electron configured for Kreft:
${created.map((f) => '    CREATED  ' + f).join('\n')}
    UPDATED  package.json  (scripts: electron, electron:dev, electron:build)${droppedFonts ? `
    UPDATED  ${droppedFonts}  (removed the Google Fonts links: a desktop app should start without the network; the system fonts are used)` : ''}
${notes.map((n) => '    NOTE     ' + n).join('\n')}

  Every setting (window, menu, DevTools, security, tray, updates, installers) is in config/electron.config.js.
  Next:
    npm install            (install electron & electron-builder)
    kreft electron:dev       (start dev server & launch desktop window)
    kreft electron:build     (build production installer)
`);
}

function resolveElectronBinary(root) {
  // 1. Resolve native Electron executable directly from node_modules/electron
  // This bypasses npm's cli.js wrapper which noisily prints "...exited with signal SIGINT" on exit
  try {
    const pkgDir = path.join(root, 'node_modules', 'electron');
    if (fs.existsSync(pkgDir)) {
      const execPath = require(pkgDir);
      if (typeof execPath === 'string' && fs.existsSync(execPath)) return execPath;
    }
  } catch (_) {}

  try {
    const pathTxt = path.join(root, 'node_modules', 'electron', 'path.txt');
    if (fs.existsSync(pathTxt)) {
      const rel = fs.readFileSync(pathTxt, 'utf8').trim();
      const direct = path.join(root, 'node_modules', 'electron', 'dist', rel);
      if (fs.existsSync(direct)) return direct;
    }
  } catch (_) {}

  const local = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron');
  if (fs.existsSync(local)) return local;
  return 'electron';
}

// npm asks the project which install scripts may run (allowScripts). Electron's downloads the app binary, so the version that is
// installed is allowed, the way `npm approve-scripts` writes it (an exact version: npm ignores ranges). A later version is a new decision.
// An entry the developer wrote, even false, stays as it is. Returns true when package.json was changed.
function approveElectronScript(root) {
  let installed;
  try { installed = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', 'electron', 'package.json'), 'utf8')).version; } catch (_) { return false; }
  if (!/^\d+\.\d+\.\d+$/.test(String(installed))) return false;
  const file = path.join(root, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!pkg.allowScripts || typeof pkg.allowScripts !== 'object' || Array.isArray(pkg.allowScripts)) pkg.allowScripts = {};
  if (Object.keys(pkg.allowScripts).some((k) => k === 'electron' || k.startsWith('electron@'))) return false;
  pkg.allowScripts[`electron@${installed}`] = true;
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
  return true;
}

// Electron downloads its app binary in its install script. Where npm did not run that script (a newer npm that asks first,
// --ignore-scripts, a failed download), the first start would end in "Electron failed to install correctly". Run it here.
function ensureElectronBinary(root, run = runSync) {
  const dir = path.join(root, 'node_modules', 'electron');
  const installer = path.join(dir, 'install.js');
  if (!fs.existsSync(installer)) return { ok: false, reason: 'missing' };
  const pathTxt = path.join(dir, 'path.txt');
  const have = () => { try { return fs.existsSync(path.join(dir, 'dist', fs.readFileSync(pathTxt, 'utf8').trim())); } catch (_) { return false; } };
  if (have()) return { ok: true, downloaded: false };
  console.log('  Downloading the Electron app (npm did not run its install script)…');
  const r = run(process.execPath, [installer], { cwd: dir, stdio: 'inherit' });
  if (r.error || r.status || !have()) return { ok: false, reason: 'failed' };
  return { ok: true, downloaded: true };
}

function resolveBuilderBinary(root) {
  const local = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder');
  if (fs.existsSync(local)) return local;
  return 'electron-builder';
}

// The first port from `start` that nothing listens on. The dev server would move to the next free port on its own, but the
// window would not know it and could open another app that already uses 8000.
function freePort(start) {
  const net = require('net');
  return new Promise((resolve) => {
    const tryPort = (port, left) => {
      const probe = net.createServer();
      probe.once('error', () => (left > 0 ? tryPort(port + 1, left - 1) : resolve(start)));
      probe.once('listening', () => probe.close(() => resolve(port)));
      probe.listen(port, '127.0.0.1');
    };
    tryPort(start, 20);
  });
}

function help() {
  console.log(`
  Kreft + Electron: your app as a desktop program (Windows, macOS, Linux)

  Commands
    kreft add electron            Add desktop support to this app: config/electron.config.js, electron/, scripts, packages
        --force                   Replace an existing config/electron.config.js (without it, you are asked; never replaced silently)
        --no-install              Do not run npm install
    kreft new <name> --electron   A new app with desktop support
    kreft electron:init           Like add, without npm install (alias: kreft make:electron)
                                  Files that exist are never overwritten (the generated electron/main.js is brought up to date).
    kreft electron                Open the app in its own window: no browser, no URL (alias: kreft electron:dev)
        --devtools[=right|bottom|left|detach]   Open DevTools at start    --no-devtools   Do not
        --menu=hidden|visible|auto              The window menu
        --set group.option=value  Change any setting for this run, like --set window.width=1000
        --port <number>           Private port for the hidden dev server (default: the next free one)
    kreft electron:build          Build the app (kreft build --base ./) and make installers in dist-electron/
        --mac --win --linux       Choose the systems (more electron-builder flags work: --arm64, --x64, --dir)
    kreft electron:config         Check config/electron.config.js and print the final settings (--json for machines)
    npm run electron:build:mac    .dmg and .zip
    npm run electron:build:win    NSIS installer and portable .exe
    npm run electron:build:linux  AppImage, .deb and .rpm
    npm run electron:build:all    All three
    kreft electron:help           This text

  Settings        config/electron.config.js: app, window, menu, contextMenu, devtools, webview, security, tray,
                  notifications, updates, packaging. Last wins: defaults, kreftjs.config.json ("desktop"), the file,
                  environment (KREFT_ELECTRON_WINDOW_WIDTH=1000), command line (--set window.width=1000).
  Window menu     hidden by default. menu.visibility: 'visible' | 'auto' (Alt shows it). From a page: kreftDesktop.setMenu('visible')
                  (macOS always keeps one app menu with Quit and an Edit menu)
  DevTools        allowed while you work, closed at start (devtools.openOnStart), not in the installed app (devtools.production)
                  F12 or Ctrl+Shift+I toggles them where they are allowed
  App icon        build/icon.png, a square PNG of 512x512 or more (.icns and .ico are made from it)
  From a page     if (Kreftjs.isElectron) kreftDesktop.getInfo(), minimize(), maximize(), close(), notify(),
                  showMessageBox(), showOpenDialog(), showSaveDialog(), openDevTools(), onMenu(), onTray()

  Good to know
    - Build each system on that system. On a Mac, .deb and .rpm fail: build them on Linux.
    - npm run build makes the website (paths start at /). electron:build makes the desktop build (--base ./).
    - The packaged app has no backend: frontend-only apps work, full-stack ones (login, database) need a server.
    - Unsigned apps show a warning on macOS and Windows: https://www.electron.build/code-signing
    - Errors: "Electron is not installed locally" -> kreft add -D electron
              "electron-builder is not installed" -> kreft add -D electron-builder
              White window in the app -> run electron:build again (it needs --base ./)

  Full guide: docs/README.md, "Desktop apps with Electron" and "Desktop configuration"
`);
}

// kreft electron:config: check the file and show the result
async function configCommand(args = []) {
  const root = getProjectRoot();
  const r = await desktop.resolveOrExit('electron', root, { args, quiet: false });
  if (args.includes('--json')) { console.log(JSON.stringify(r.config, null, 2)); return; }
  console.log(`  Electron configuration is valid.\n  Layers used (last wins): defaults${r.layers.length ? ', ' + r.layers.join(', ') : ''}\n`);
  console.log(JSON.stringify(r.config, null, 2));
}

function dev(args = []) {
  if (['help', '--help', '-h'].includes(args[0])) return help();
  const asked = args.findIndex((a) => a === '--port' || a === '-p');
  if (asked >= 0 && Number(args[asked + 1])) return startDev(args, Number(args[asked + 1]));
  return freePort(Number(process.env.PORT) || 8000).then((port) => startDev(args, port));
}

async function startDev(args, port) {
  const root = getProjectRoot();
  if (!fs.existsSync(path.join(root, 'electron', 'main.js'))) {
    console.log('  Electron files not found. Initializing…');
    init();
  }
  // check config/electron.config.js (and the environment and flags) and give the window the result
  const r = await desktop.resolveOrExit('electron', root, { args, mode: 'development' });
  adapter.writeBootstrap(root);
  adapter.writeRuntimeFiles(root, r.config);

  // Load .env if present
  try { require('./env.js').load(root); } catch (_) {}

  const ensured = ensureElectronBinary(root);
  if (ensured.reason === 'failed') {
    console.error('\n  The Electron app could not be downloaded. Check your internet connection, then run:\n    node node_modules/electron/install.js\n  or:  npm rebuild electron\n');
    process.exit(1);
  }
  const bin = resolveElectronBinary(root);
  const serverArgs = r.rest.filter((a, i, all) => a !== '--port' && a !== '-p' && all[i - 1] !== '--port' && all[i - 1] !== '-p');
  serverArgs.push('--port', String(port));

  // 1. Start dev server child process
  console.log('  Starting the Kreft desktop window…');
  const kreftCli = path.join(__dirname, 'kreftjs.js');
  const server = spawn(process.execPath, [kreftCli, 'dev', ...serverArgs], {
    cwd: root,
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, PORT: String(port), KREFT_ELECTRON: 'true', BROWSER: 'none' },
  });

  // 2. Launch Electron after small pause
  let electronProcess = null;
  setTimeout(() => {
    electronProcess = spawn(bin, ['.'], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'development', PORT: String(port) },
    });

    electronProcess.on('exit', (code) => {
      if (server && !server.killed) {
        try { server.kill('SIGTERM'); } catch (_) {}
      }
      process.exit(code || 0);
    });

    electronProcess.on('error', (err) => {
      if (err.code === 'ENOENT') {
        console.error('\n  Electron is not installed locally. Run:  kreft add -D electron\n');
      } else {
        console.error('  Electron launch error: ' + err.message);
      }
      if (server && !server.killed) {
        try { server.kill('SIGTERM'); } catch (_) {}
      }
      process.exit(1);
    });
  }, 1000);

  const cleanup = () => {
    if (electronProcess && !electronProcess.killed) {
      try { electronProcess.kill('SIGTERM'); } catch (_) {}
    }
    if (server && !server.killed) {
      try { server.kill('SIGTERM'); } catch (_) {}
    }
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

// The options of `kreft electron:build` that belong to electron-builder, and the rest, which belong to `kreft build` (the site).
// An option that takes a value (--publish never) goes with its value, whichever side it is on.
// --mac / --win / --linux take optional targets that electron-builder reads too (--win nsis, --mac dmg zip),
// so the words that follow them go to electron-builder, not to the site build.
const BUILDER_PLATFORM = /^--(mac|win|linux)$/;
const BUILDER_FLAG = /^--(dir|x64|arm64|ia32|armv7l|universal)$/;
const BUILDER_WITH_VALUE = /^(--publish|-p|--prepackaged|--pd|--projectDir)$/;
const BUILDER_INLINE = /^(--publish=.+|-p=.+|--prepackaged=.+|--pd=.+|--projectDir=.+|-c\.[^=\s]+=.*|--config\.[^=\s]+=.*)$/;
function splitBuildArgs(args = []) {
  const builder = [], site = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (BUILDER_PLATFORM.test(a)) {
      builder.push(a);
      // the targets that follow belong to electron-builder too: --win nsis, --mac dmg zip, --linux AppImage deb
      while (args[i + 1] !== undefined && !String(args[i + 1]).startsWith('-')) builder.push(args[++i]);
    } else if (BUILDER_FLAG.test(a) || BUILDER_INLINE.test(a)) builder.push(a);
    else if (BUILDER_WITH_VALUE.test(a)) {
      builder.push(a);
      if (args[i + 1] !== undefined && !String(args[i + 1]).startsWith('-')) builder.push(args[++i]);
    } else site.push(a);
  }
  return { builder, site };
}

async function build(args = []) {
  // --all is a Kreft shortcut for --mac --win --linux (electron-builder has no such flag)
  if (args.includes('--all')) args = [...args.filter((a) => a !== '--all'), ...['--mac', '--win', '--linux'].filter((p) => !args.includes(p))];
  const root = getProjectRoot();
  if (!fs.existsSync(path.join(root, 'electron', 'main.js'))) {
    console.log('  Electron files not found. Initializing…');
    init();
  }

  // check the settings first: a mistake should stop the build before it spends minutes
  const r = await desktop.resolveOrExit('electron', root, { args, mode: 'production' });
  if (!r.config.security.csp) console.warn('  Note: security.csp is not set, so the installed app has no Content-Security-Policy. Set it in config/electron.config.js for releases, like "default-src \'self\'" (add the sites your app uses).');
  adapter.writeBootstrap(root);
  adapter.writeRuntimeFiles(root, r.config);
  const pkg = desktop.readPackage(root);
  if (pkg.build) console.log('  Note: the "build" block in package.json is ignored. The installers are made from config/electron.config.js.');

  // 1. Build Kreft frontend for desktop with relative base
  console.log('\n  Step 1: Building Kreft static bundle with relative base (./)…');
  const kreftCli = path.join(__dirname, 'kreftjs.js');
  const split = splitBuildArgs(r.rest);
  const buildProc = spawn(process.execPath, [kreftCli, 'build', '--base', './', ...split.site], {
    cwd: root,
    stdio: 'inherit',
  });

  buildProc.on('exit', (code) => {
    if (code !== 0) {
      console.error('  Build failed with code ' + code);
      process.exit(code || 1);
    }

    // 2. Run electron-builder
    console.log('\n  Step 2: Packaging desktop executable with electron-builder…');
    const builderBin = resolveBuilderBinary(root);
    const packProc = spawn(builderBin, ['--config', 'electron/builder.config.json', ...split.builder], {
      cwd: root,
      stdio: 'inherit',
    });

    packProc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        console.error('\n  electron-builder is not installed. Run:  kreft add -D electron-builder\n');
      } else {
        console.error('  Packaging error: ' + err.message);
      }
      process.exit(1);
    });

    packProc.on('exit', (c) => process.exit(c || 0));
  });
}

module.exports = {
  ELECTRON_VERSION,
  BUILDER_VERSION,
  init,
  ensureElectronBinary,
  approveElectronScript,
  help,
  dev,
  run: dev,
  build,
  config: configCommand,
  splitBuildArgs,
  TEMPLATES,
};
