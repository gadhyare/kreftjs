/*
 * Tauri Desktop Support for Kreft (Tauri 2)
 *
 * Commands:
 *   kreft add tauri      Add Tauri to this project: config/tauri.config.js, src-tauri/, scripts, packages (npm install)
 *   kreft tauri:init     The same without installing the packages (alias: kreft make:tauri)
 *   kreft tauri:dev      Run the app in a Tauri window (hidden dev server, no browser)   (alias: kreft tauri)
 *   kreft tauri:build    Build the static bundle (kreft build) and make the installers (tauri build)
 *   kreft tauri:sync     Write src-tauri/ from config/tauri.config.js (dev and build do it by themselves)
 *   kreft tauri:config   Check config/tauri.config.js and print the final settings (--json)
 *
 * CLI flag:
 *   kreft new my-app --tauri
 *
 * Tauri uses the system web view instead of shipping a browser, so installers are small. It needs Rust (https://rustup.rs).
 * Every setting is in config/tauri.config.js. tauri.conf.json, the capabilities and src/kreft_generated.rs are written
 * from it (see bin/desktop/tauri-adapter.js): they are not edited.
 */
const fs = require('fs');
const path = require('path');
const { start: spawn, runSync } = require('./win-spawn.js');
const desktop = require('./desktop/config.js');
const adapter = require('./desktop/tauri-adapter.js');
const { defaultOf, SCHEMA } = require('./desktop/schema.js');

function getProjectRoot(start = process.cwd()) {
  const lay = require('./layout.js').layout(start);
  return lay.split ? lay.project : start;
}

const TAURI_CLI_VERSION = '^2.0.0';

// Adds the files and package.json entries. Files that exist are never overwritten (the generated ones are written again
// by tauri:dev and tauri:build, from config/tauri.config.js).
function init(args = []) {
  const target = typeof args === 'string' ? args : (args[0] && !args[0].startsWith('-') ? args[0] : process.cwd());
  const root = getProjectRoot(target);
  const pkgFile = path.join(root, 'package.json');
  if (!fs.existsSync(pkgFile)) {
    console.error('  No package.json found. Run this inside a Kreft project.');
    process.exit(1);
  }
  const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
  const created = [];

  if (!desktop.configFile(root, 'tauri')) {
    const file = path.join(root, 'config', 'tauri.config.js');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, desktop.template('tauri', desktop.isEsmProject(root)));
    created.push('config/tauri.config.js');
  }

  // The native files. On a first run they come from the default settings; tauri:dev and tauri:build write them again from the real file.
  const fresh = !fs.existsSync(path.join(root, 'src-tauri', 'tauri.conf.json'));
  let notes = [];
  if (fresh) {
    const c = desktop.derive(defaultOf(SCHEMA, 'tauri'), pkg);
    notes = adapter.sync(root, c);
    created.push('src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml', 'src-tauri/src/main.rs', 'src-tauri/src/kreft_generated.rs', 'src-tauri/capabilities/default.json');
  }

  // The icon source: replace build/icon.png with your own (square PNG, 1024x1024 is best). `tauri icon` makes every size from it.
  if (require('./app-icon.js').ensureIcon(root).made) created.push('build/icon.png');

  pkg.scripts = pkg.scripts || {};
  pkg.scripts['tauri'] = 'kreft tauri';
  pkg.scripts['tauri:dev'] = 'kreft tauri:dev';
  pkg.scripts['tauri:build'] = 'kreft tauri:build';
  pkg.devDependencies = pkg.devDependencies || {};
  if (!pkg.devDependencies['@tauri-apps/cli']) pkg.devDependencies['@tauri-apps/cli'] = TAURI_CLI_VERSION;
  fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');

  console.log(`
  Tauri configured for Kreft:
${created.map((f) => '    CREATED  ' + f).join('\n') || '    (already set up, nothing overwritten)'}
    UPDATED  package.json  (scripts: tauri, tauri:dev, tauri:build)
${notes.map((n) => '    NOTE     ' + n).join('\n')}

  Every setting (window, menu, DevTools, security, tray, updates, installers) is in config/tauri.config.js.
  Next:
    Install Rust            https://rustup.rs  (Tauri compiles a small Rust program)
    npm install             (installs @tauri-apps/cli)
    kreft tauri:dev         (start the dev server & open the desktop window)
    kreft tauri:build       (build the installers)
`);
}

function help() {
  console.log(`
  Desktop apps with Tauri (installers are small: the system web view is used, no browser is shipped)

    kreft add tauri       Add Tauri to this project: config/tauri.config.js, src-tauri/, scripts, packages
        --force           Replace an existing config/tauri.config.js (without it, you are asked; never replaced silently)
        --no-install      Do not run npm install
    kreft tauri:init      Like add, without npm install (alias: kreft make:tauri)
    kreft tauri:dev       Open the app in a desktop window (alias: kreft tauri); --port N to choose the dev port
        --devtools[=detach]  Open DevTools at start    --no-devtools   Do not
        --menu=hidden|visible                         The window menu
        --set group.option=value                      Change any setting for this run, like --set window.width=1000
    kreft tauri:build     Build and make installers for this computer's system
                          (--debug, --bundles dmg|app|nsis|msi|deb|rpm|appimage, --target <rust-triple>)
    kreft tauri:sync      Write src-tauri/ from config/tauri.config.js (dev and build do it by themselves)
    kreft tauri:config    Check config/tauri.config.js and print the final settings (--json for machines)

  Settings    config/tauri.config.js: app, window, menu, contextMenu, devtools, webview, security, tray, notifications,
              updates, packaging. Last wins: defaults, kreftjs.config.json ("desktop"), the file, environment
              (KREFT_TAURI_WINDOW_WIDTH=1000), command line (--set window.width=1000).
              tauri.conf.json, the capabilities and src/kreft_generated.rs are written from it: do not edit them.
              Options this file lacks go in advanced.tauriConf.

  You need
    Rust and Cargo          https://rustup.rs
    Linux only              webkit2gtk and a few libraries: https://tauri.app/start/prerequisites/
    Windows                 WebView2 (already in Windows 10/11) and the Visual Studio C++ build tools

  Files
    config/tauri.config.js      your settings
    src-tauri/src/main.rs       your Rust code (optional); it calls kreft_generated::apply
    build/icon.png              the app icon (square PNG, 1024x1024 best); the sizes are made from it

  In the page, window.__TAURI__ exists only inside the Tauri window.
`);
}

function resolveTauriBinary(root) {
  const local = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'tauri.cmd' : 'tauri');
  return fs.existsSync(local) ? local : null;
}

function hasCargo() {
  const r = runSync('cargo', ['--version'], { stdio: 'ignore' });
  return !r.error && r.status === 0;
}

// Rust is often installed but not on this terminal's PATH: rustup puts it in ~/.cargo/bin, and Homebrew's rustup is "keg-only"
// (/opt/homebrew/opt/rustup/bin) so a terminal started before the PATH line was added cannot see it. Look in those places
// and, when cargo is there, add the folder to the PATH of this command (and of tauri, which starts cargo).
function findRust() {
  if (hasCargo()) return true;
  const exe = process.platform === 'win32' ? 'cargo.exe' : 'cargo';
  const dirs = [
    path.join(require('os').homedir(), '.cargo', 'bin'),
    '/opt/homebrew/opt/rustup/bin',
    '/usr/local/opt/rustup/bin',
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ];
  for (const d of dirs) {
    if (fs.existsSync(path.join(d, exe))) {
      process.env.PATH = d + path.delimiter + process.env.PATH;
      if (hasCargo()) { console.log(`  Using Rust from ${d} (it is not on this terminal's PATH).`); return true; }
    }
  }
  return false;
}

// Checks shared by dev and build. Returns the tauri binary, or exits with a clear message.
function prepare(root, c) {
  if (!fs.existsSync(path.join(root, 'src-tauri', 'tauri.conf.json'))) {
    console.log('  Tauri files not found. Initializing…');
    init(root);
  }
  // write src-tauri/ from config/tauri.config.js: tauri.conf.json, capabilities, kreft_generated.rs, the Cargo features
  for (const n of adapter.sync(root, c)) console.warn('  Note: ' + n);
  const bin = resolveTauriBinary(root);
  if (!bin) {
    console.error('\n  The Tauri command line is not installed. Run:  npm install   (or: kreft add -D @tauri-apps/cli)\n');
    process.exit(1);
  }
  if (!findRust()) {
    console.error(`
  Rust is not installed (cargo was not found).
    Install it:        https://rustup.rs   (or on a Mac: brew install rustup && rustup default stable)
    Then open a new terminal. If you installed it already, add it to your PATH:
      rustup from rustup.rs:   export PATH="$HOME/.cargo/bin:$PATH"
      rustup from Homebrew:    export PATH="/opt/homebrew/opt/rustup/bin:$PATH"   (put the line in ~/.zshrc)
    Check:             cargo --version
`);
    process.exit(1);
  }
  // Every icon size is made from the app icon. Tauri refuses to compile when one of the sizes in tauri.conf.json is missing
  // (for example "failed to open icon …/icons/32x32.png"), so all of them are checked, not only one.
  const icons = path.join(root, 'src-tauri', 'icons');
  const need = ['32x32.png', '128x128.png', '128x128@2x.png', 'icon.icns', 'icon.ico'];
  if (need.some((f) => !fs.existsSync(path.join(icons, f)))) {
    let source = path.resolve(root, c.packaging.icon);
    let made = false;
    if (!fs.existsSync(source)) {
      if (path.relative(root, source).split(path.sep).join('/') !== 'build/icon.png') {
        console.error(`\n  packaging.icon points to ${c.packaging.icon}, which does not exist. Fix the path in config/tauri.config.js.\n`);
        process.exit(1);
      }
      ({ file: source, made } = require('./app-icon.js').ensureIcon(root));
    }
    console.log(`  Making the app icons from ${path.relative(root, source)}${made ? ' (a default one was written; replace it with your own)' : ''}…`);
    const r = runSync(bin, ['icon', source], { cwd: root, stdio: 'inherit' });
    if (r.error || r.status) {
      console.error(`\n  Could not make the app icons. Check that ${path.relative(root, source)} is a square PNG, then run:  npx tauri icon ${path.relative(root, source)}\n`);
      process.exit(1);
    }
  }
  return bin;
}

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

function dev(args = []) {
  if (['help', '--help', '-h'].includes(args[0])) return help();
  const asked = args.findIndex((a) => a === '--port' || a === '-p');
  if (asked >= 0 && Number(args[asked + 1])) return startDev(args, Number(args[asked + 1]));
  return freePort(Number(process.env.PORT) || 8000).then((port) => startDev(args, port));
}

// The settings `tauri dev` is given on top of tauri.conf.json: where the dev server is, and nothing to start (Kreft starts it).
// Returns the path of a JSON file (tauri takes a file as well as JSON text) and a function that removes it.
function devConfigFile(port) {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'kreft-tauri-'));
  const file = path.join(dir, 'dev.conf.json');
  fs.writeFileSync(file, JSON.stringify({ build: { devUrl: `http://localhost:${port}`, beforeDevCommand: '' } }));
  return { file, remove: () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* gone */ } } };
}

async function startDev(args, port) {
  const root = getProjectRoot();
  const r = await desktop.resolveOrExit('tauri', root, { args, mode: 'development' });
  const bin = prepare(root, r.config);
  try { require('./env.js').load(root); } catch (_) {}

  const serverArgs = r.rest.filter((a, i, all) => a !== '--port' && a !== '-p' && all[i - 1] !== '--port' && all[i - 1] !== '-p');
  serverArgs.push('--port', String(port));

  console.log('  Starting the Kreft desktop window (Tauri)…');
  const server = spawn(process.execPath, [path.join(__dirname, 'kreftjs.js'), 'dev', ...serverArgs], {
    cwd: root,
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, PORT: String(port), KREFT_TAURI: 'true', BROWSER: 'none' },
  });

  // The dev server is already ours, so Tauri has nothing to start; only the address is told to it. The setting goes in a small file:
  // a JSON text as an argument has quotes in it, and Windows (where tauri is a .cmd program) refuses those.
  const devConfig = devConfigFile(port);
  const tauri = spawn(bin, ['dev', '--config', devConfig.file], {
    cwd: root,
    stdio: 'inherit',
    detached: process.platform !== 'win32', // its own process group, so the whole tree (cli, cargo, the window) can be stopped together
    env: { ...process.env, KREFT_TAURI: 'true' },
  });

  const stopServer = () => { devConfig.remove(); if (!server.killed) { try { server.kill('SIGTERM'); } catch (_) {} } };
  tauri.on('exit', (code) => { stopServer(); process.exit(code || 0); });
  tauri.on('error', (err) => { console.error('  Tauri launch error: ' + err.message); stopServer(); process.exit(1); });
  // Same as pressing Ctrl-C in the terminal: SIGINT to the whole group. The 'exit' handler above ends this process; the timer is a fallback.
  const cleanup = () => {
    try {
      if (process.platform === 'win32') runSync('taskkill', ['/pid', String(tauri.pid), '/T', '/F'], { stdio: 'ignore' });
      else process.kill(-tauri.pid, 'SIGINT');
    } catch (_) {}
    stopServer();
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

async function build(args = []) {
  const root = getProjectRoot();
  // check the settings first: a mistake should stop the build before it spends minutes compiling
  const r = await desktop.resolveOrExit('tauri', root, { args, mode: 'production' });
  if (!r.config.security.csp) console.warn('  Note: security.csp is not set, so the installed app has no Content-Security-Policy. Set it in config/tauri.config.js for releases, like "default-src \'self\'" (add the sites your app uses).');
  const bin = prepare(root, r.config);
  args = r.rest;
  const tauriFlags = /^(--debug|--ci|--verbose|--no-bundle)$/;
  const withValue = /^(--bundles|--target|--features|--config)$/;
  const forTauri = [];
  const forBuild = [];
  for (let i = 0; i < args.length; i++) {
    if (tauriFlags.test(args[i])) forTauri.push(args[i]);
    else if (withValue.test(args[i])) { forTauri.push(args[i]); if (args[i + 1] !== undefined) forTauri.push(args[++i]); }
    else forBuild.push(args[i]);
  }

  console.log('\n  Step 1: Building Kreft static bundle with relative base (./)…');
  const buildProc = spawn(process.execPath, [path.join(__dirname, 'kreftjs.js'), 'build', '--base', './', ...forBuild], {
    cwd: root,
    stdio: 'inherit',
  });
  buildProc.on('exit', (code) => {
    if (code !== 0) {
      console.error('  Build failed with code ' + code);
      process.exit(code || 1);
    }
    console.log('\n  Step 2: Packaging the desktop app with Tauri (the first build compiles Rust and takes a few minutes)…');
    const pack = spawn(bin, ['build', ...forTauri], { cwd: root, stdio: 'inherit' });
    pack.on('error', (err) => { console.error('  Packaging error: ' + err.message); process.exit(1); });
    pack.on('exit', (c) => {
      if (!c && !forTauri.includes('--no-bundle')) console.log(`\n  Installers are in src-tauri/target/${forTauri.includes('--debug') ? 'debug' : 'release'}/bundle/`);
      process.exit(c || 0);
    });
  });
}

// kreft tauri:sync: write src-tauri/ from the settings without running anything
async function sync(args = []) {
  const root = getProjectRoot();
  const r = await desktop.resolveOrExit('tauri', root, { args, mode: 'development' });
  for (const n of adapter.sync(root, r.config)) console.warn('  Note: ' + n);
  console.log('  src-tauri/ is written from config/tauri.config.js.');
}

// kreft tauri:config: check the file and show the result
async function configCommand(args = []) {
  const root = getProjectRoot();
  const r = await desktop.resolveOrExit('tauri', root, { args });
  if (args.includes('--json')) { console.log(JSON.stringify(r.config, null, 2)); return; }
  console.log(`  Tauri configuration is valid.\n  Layers used (last wins): defaults${r.layers.length ? ', ' + r.layers.join(', ') : ''}\n`);
  console.log(JSON.stringify(r.config, null, 2));
}

module.exports = { TAURI_CLI_VERSION, init, help, dev, run: dev, build, sync, config: configCommand, devConfigFile };
