// Starts the real Electron and Tauri apps and checks what they DO, not what the configuration says: is the menu hidden, are DevTools
// closed at start / refused in production, are the window settings and the security defaults in effect, which layer wins, and do
// production builds work on this system.
//
// It downloads Electron (about 100 MB, once), compiles Rust (a few minutes, once) and opens windows, so it is not part of `npm test`.
//   Run:  npm run test:desktop
// Needs: Node, a screen (on Linux: a display or xvfb-run), Rust for the Tauri part. A part whose tools are missing is skipped.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const ON = process.env.KREFT_TEST_DESKTOP === '1';
const skip = ON ? false : 'set KREFT_TEST_DESKTOP=1 (npm run test:desktop)';
const NO_DISPLAY = process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY ? 'no display (use xvfb-run)' : false;
const KREFT = path.join(__dirname, '..', 'bin', 'kreftjs.js');
const cfg = require('../bin/desktop/config.js');
const adapterE = require('../bin/desktop/electron-adapter.js');
const adapterT = require('../bin/desktop/tauri-adapter.js');

const HOME_CARGO = path.join(os.homedir(), '.cargo', 'bin');
const ENV = { ...process.env, PATH: [process.env.PATH, HOME_CARGO, '/opt/homebrew/opt/rustup/bin'].join(path.delimiter), CARGO_HTTP_TIMEOUT: '120', CARGO_NET_RETRY: '6' };
const hasCargo = !cp.spawnSync('cargo', ['--version'], { env: ENV }).error;

let dir = null;
const sh = (args, opts = {}) => cp.spawnSync(process.execPath, [KREFT, ...args], { cwd: dir, env: ENV, encoding: 'utf8', ...opts });
const write = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
const config = (rt, obj) => write(`config/${rt}.config.js`, 'module.exports = ' + JSON.stringify(obj));

test('setup: a project with both runtimes installed', { skip, timeout: 600000 }, () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-desktop-rt-'));
  const parent = dir;
  let r = cp.spawnSync(process.execPath, [KREFT, 'new', 'rtapp'], { cwd: parent, env: ENV, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  dir = path.join(parent, 'rtapp');
  r = sh(['add', 'electron', 'tauri'], { timeout: 540000 });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.ok(fs.existsSync(path.join(dir, 'node_modules', 'electron')), 'electron is installed');
  assert.ok(fs.existsSync(path.join(dir, 'node_modules', '.bin', 'tauri')), '@tauri-apps/cli is installed');
});

// ---- Electron ---------------------------------------------------------------------------------------------------------------

async function electronState(mode, { file, env = {}, args = [] } = {}) {
  if (file !== undefined) config('electron', file);
  const { config: c } = await cfg.resolve('electron', dir, { env: { ...process.env, ...env }, args, mode });
  adapterE.writeBootstrap(dir);
  adapterE.writeRuntimeFiles(dir, c);
  const out = path.join(dir, 'selftest-electron.json');
  fs.rmSync(out, { force: true });
  const bin = require(path.join(dir, 'node_modules', 'electron'));
  const p = cp.spawnSync(bin, ['.'], { cwd: dir, env: { ...process.env, ...env, KREFT_DESKTOP_SELFTEST: out, KREFT_DESKTOP_SELFTEST_MODE: mode }, timeout: 60000, encoding: 'utf8' });
  assert.ok(fs.existsSync(out), 'the app wrote its state. exit=' + p.status + ' ' + (p.stderr || '').slice(-400));
  return JSON.parse(fs.readFileSync(out, 'utf8'));
}

const mac = process.platform === 'darwin';

test('electron (development, defaults): the menu is hidden, DevTools are allowed but closed, the security flags are safe', { skip: skip || NO_DISPLAY, timeout: 120000 }, async () => {
  const s = await electronState('development', { file: {} });
  if (mac) assert.deepStrictEqual(s.appMenu.length, 2, 'macOS keeps only the app menu and Edit: ' + s.appMenu);
  else assert.deepStrictEqual([s.appMenu, s.menuBarVisible], [null, false]);
  assert.strictEqual(s.devToolsAllowed, true);
  assert.strictEqual(s.devToolsOpened, false, 'closed at start');
  assert.strictEqual(s.devToolsOpenedAfterToggle, true, 'F12 opens them');
  assert.deepStrictEqual(s.webPreferences, { contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, allowRunningInsecureContent: false });
  assert.deepStrictEqual([s.window.width, s.window.height, s.window.resizable, s.window.fullscreen, s.window.alwaysOnTop], [1200, 800, true, false, false]);
  assert.strictEqual(s.tray, false);
});

test('electron (production, defaults): DevTools are off and cannot be opened', { skip: skip || NO_DISPLAY, timeout: 120000 }, async () => {
  const s = await electronState('production', { file: {} });
  assert.strictEqual(s.devToolsAllowed, false);
  assert.strictEqual(s.devToolsOpened, false);
  assert.strictEqual(s.devToolsOpenedAfterToggle, false, 'F12 does nothing');
});

test('electron: openOnStart opens DevTools only where they are allowed', { skip: skip || NO_DISPLAY, timeout: 180000 }, async () => {
  assert.strictEqual((await electronState('development', { file: { devtools: { openOnStart: true } } })).devToolsOpened, true);
  assert.strictEqual((await electronState('production', { file: { devtools: { openOnStart: true } } })).devToolsOpened, false, 'production is off, so it stays closed');
  const p = await electronState('production', { file: { devtools: { production: true, openOnStart: true } } });
  assert.deepStrictEqual([p.devToolsAllowed, p.devToolsOpened], [true, true], 'unless production DevTools are turned on');
});

test('electron: window settings, menu, tray and security overrides are in effect in the real window', { skip: skip || NO_DISPLAY, timeout: 180000 }, async () => {
  const s = await electronState('development', { file: {
    window: { width: 900, height: 650, minWidth: 600, minHeight: 400, resizable: false, alwaysOnTop: true, title: 'Window title' },
    menu: { visibility: 'visible', template: [{ label: 'File', submenu: [{ label: 'New', id: 'file-new' }, { role: 'quit' }] }, { label: 'Help', submenu: [{ label: 'About', id: 'about' }] }] },
    tray: { enabled: true },
    security: { sandbox: false },
  } });
  assert.deepStrictEqual([s.window.width, s.window.height, s.window.resizable, s.window.alwaysOnTop], [900, 650, false, true]);
  if (mac) assert.ok(s.appMenu.includes('File') && s.appMenu.includes('Help'), 'your own menu: ' + s.appMenu);
  else assert.strictEqual(s.menuBarVisible, true);
  assert.strictEqual(s.tray, true);
  assert.strictEqual(s.webPreferences.sandbox, false);
  assert.strictEqual(s.webPreferences.contextIsolation, true, 'the settings you did not change stay safe');
});

test('electron: a permission is granted to the app\'s own page and refused to any other page', { skip: skip || NO_DISPLAY, timeout: 180000 }, async () => {
  // the page is served from another process: electronState waits for the app with a blocking call
  const srv = cp.spawn(process.execPath, ['-e', "const s=require('http').createServer((_q,r)=>{r.setHeader('content-type','text/html');r.end('<title>app</title><p>app</p>')}).listen(0,'127.0.0.1',()=>console.log(s.address().port))"], { stdio: ['ignore', 'pipe', 'inherit'] });
  const port = await new Promise((r) => srv.stdout.once('data', (d) => r(Number(String(d).trim()))));
  const url = `http://127.0.0.1:${port}/`;
  try {
    const s = await electronState('development', { file: { notifications: { enabled: true }, webview: { allowedNavigation: [new URL(url).origin] } }, env: { KREFT_DESKTOP_SELFTEST_PROBE_URL: url } });
    assert.strictEqual(s.permissionFromForeignPage, 'denied', 'a page that is not the app gets nothing');
    assert.strictEqual(s.permissionFromAppPage, 'granted', 'the app\'s own page gets what is allowed');
  } finally { srv.kill(); }
});

test('electron: the layers win in the order defaults < file < environment < command line, in the real window', { skip: skip || NO_DISPLAY, timeout: 180000 }, async () => {
  const w = (s) => s.window.width;
  assert.strictEqual(w(await electronState('development', { file: { window: { width: 1000 } } })), 1000, 'file');
  assert.strictEqual(w(await electronState('development', { file: { window: { width: 1000 } }, env: { KREFT_ELECTRON_WINDOW_WIDTH: '950' } })), 950, 'environment beats the file');
  assert.strictEqual(w(await electronState('development', { file: { window: { width: 1000 } }, env: { KREFT_ELECTRON_WINDOW_WIDTH: '950' }, args: ['--set', 'window.width=920'] })), 920, 'command line beats the environment');
  const legacy = await electronState('development', { file: {}, env: { ELECTRON_MENU: 'show', ELECTRON_DEVTOOLS: 'right' } });
  assert.strictEqual(legacy.devToolsOpened, true, 'ELECTRON_DEVTOOLS still works');
  if (mac) assert.ok(legacy.appMenu.length > 2, 'and ELECTRON_MENU');
});

test('electron: a production build is made, runs, contains the checked configuration, and has no hook for the test state', { skip: skip || NO_DISPLAY, timeout: 600000 }, () => {
  config('electron', { app: { name: 'Rt App' } });
  const r = sh(['electron:build', '--dir'], { timeout: 540000 });
  assert.strictEqual(r.status, 0, (r.stdout + r.stderr).slice(-1500));
  const out = path.join(dir, 'dist-electron');
  const find = { darwin: () => { const d = fs.readdirSync(out).find((n) => n.startsWith('mac')); return path.join(out, d, 'Rt App.app', 'Contents', 'MacOS', 'Rt App'); }, linux: () => path.join(out, 'linux-unpacked', 'rtapp'), win32: () => path.join(out, 'win-unpacked', 'Rt App.exe') }[process.platform];
  const exe = find();
  assert.ok(fs.existsSync(exe), 'the packaged app exists: ' + exe);
  const resources = mac ? path.join(path.dirname(path.dirname(exe)), 'Resources') : path.join(path.dirname(exe), 'resources');
  const listing = cp.spawnSync(process.execPath, [path.join(dir, 'node_modules', '@electron', 'asar', 'bin', 'asar.js'), 'list', path.join(resources, 'app.asar')], { encoding: 'utf8' });
  if (listing.status === 0) {
    assert.match(listing.stdout, /electron[/\\]kreft\.resolved\.json/);
    assert.match(listing.stdout, /dist[/\\]index\.html/);
    assert.doesNotMatch(listing.stdout, /config[/\\]electron\.config/, 'your settings file is not shipped; the checked result is');
  }
  const probe = path.join(dir, 'should-not-exist.json');
  const child = cp.spawn(exe, [], { env: { ...process.env, KREFT_DESKTOP_SELFTEST: probe }, stdio: 'ignore' });
  return new Promise((resolve) => setTimeout(() => {
    const alive = child.exitCode === null;
    try { child.kill(); } catch (_) { /* gone */ }
    assert.ok(alive, 'the packaged app is still running after 6 seconds');
    assert.ok(!fs.existsSync(probe), 'an installed app ignores the test hook');
    resolve();
  }, 6000));
});

// ---- Tauri -----------------------------------------------------------------------------------------------------------------

function tauriState(obj, extra = []) {
  config('tauri', obj);
  const b = sh(['tauri:build', '--debug', '--no-bundle', ...extra], { timeout: 900000 });
  assert.strictEqual(b.status, 0, (b.stdout + b.stderr).slice(-2500));
  const out = path.join(dir, 'selftest-tauri.json');
  fs.rmSync(out, { force: true });
  const exe = path.join(dir, 'src-tauri', 'target', 'debug', 'rtapp' + (process.platform === 'win32' ? '.exe' : ''));
  const p = cp.spawnSync(exe, [], { cwd: dir, env: { ...process.env, KREFT_DESKTOP_SELFTEST: out }, timeout: 60000, encoding: 'utf8' });
  assert.ok(fs.existsSync(out), 'the app wrote its state. exit=' + p.status + ' ' + (p.stderr || '').slice(-400));
  return JSON.parse(fs.readFileSync(out, 'utf8'));
}

const tauriSkip = skip || NO_DISPLAY || (hasCargo ? false : 'Rust is not installed');

test('tauri (development build, defaults): the menu is hidden, DevTools are closed at start and open with F12, the window is 1200 x 800', { skip: tauriSkip, timeout: 1200000 }, () => {
  const s = tauriState({});
  if (mac) assert.strictEqual(s.appMenu, 2, 'macOS keeps only the app menu and Edit');
  else assert.strictEqual(s.menuVisible, false);
  assert.strictEqual(s.devToolsOpenAtStart, false, 'closed at start');
  assert.strictEqual(s.devToolsOpenAfterToggle, true, 'the shortcut opens them in a development build');
  assert.deepStrictEqual([s.width, s.height, s.resizable, s.fullscreen, s.decorated, s.windowCount, s.tray], [1200, 800, true, false, true, 1, false]);
  assert.strictEqual(s.title, 'Rtapp');
  const cargo = fs.readFileSync(path.join(dir, 'src-tauri', 'Cargo.toml'), 'utf8');
  assert.match(cargo, /tauri = \{ version = "2", features = \[\] \}/, 'no devtools feature, so a release build has none');
});

test('tauri: the window refuses to navigate to a site that is not the app', { skip: tauriSkip, timeout: 1200000 }, () => {
  const s = tauriState({});
  assert.ok(s.urlBefore, 'the window has an address');
  assert.strictEqual(s.urlAfterForeignNavigation, s.urlBefore, 'a script that sends the window to https://example.com is refused');
});

test('tauri: window settings, menu, tray, notifications and updates are in effect in the real window', { skip: tauriSkip, timeout: 1200000 }, () => {
  const s = tauriState({
    window: { title: 'Window title', width: 900, height: 650, minWidth: 600, minHeight: 400, resizable: false },
    menu: { visibility: 'visible', template: [{ label: 'File', submenu: [{ label: 'New', id: 'file-new' }, { role: 'quit' }] }, { label: 'Help', submenu: [{ label: 'About', id: 'about' }] }] },
    devtools: { openOnStart: true },
    tray: { enabled: true },
    notifications: { enabled: true },
    updates: { enabled: true, url: 'https://example.com/{{target}}/{{current_version}}', pubkey: 'dW50cnVzdGVkIGNvbW1lbnQ6IHRlc3Q=' },
  });
  assert.strictEqual(s.title, 'Window title');
  assert.strictEqual(s.width, 900);
  assert.strictEqual(s.resizable, false);
  assert.strictEqual(s.appMenu, 2, 'your menu has two top-level entries');
  if (!mac) assert.strictEqual(s.menuVisible, true);
  assert.strictEqual(s.devToolsOpenAtStart, true);
  assert.strictEqual(s.tray, true);
  const caps = JSON.parse(fs.readFileSync(path.join(dir, 'src-tauri', 'capabilities', 'default.json'), 'utf8'));
  assert.deepStrictEqual(caps.permissions, ['core:default', 'notification:default', 'updater:default']);
});

test('tauri: the command line and environment win over the file (checked in the generated window)', { skip: tauriSkip, timeout: 1200000 }, () => {
  const s = tauriState({ window: { width: 1000 } }, ['--set', 'window.width=930']);
  assert.strictEqual(s.width, 930);
});

test('tauri: a production (release) build compiles with the safe defaults and without the devtools feature', { skip: tauriSkip, timeout: 1800000 }, () => {
  config('tauri', {});
  let r = sh(['tauri:build', '--no-bundle'], { timeout: 1700000 });
  assert.strictEqual(r.status, 0, (r.stdout + r.stderr).slice(-2500));
  const exe = path.join(dir, 'src-tauri', 'target', 'release', 'rtapp' + (process.platform === 'win32' ? '.exe' : ''));
  assert.ok(fs.existsSync(exe), 'the release binary exists');
  assert.doesNotMatch(fs.readFileSync(path.join(dir, 'src-tauri', 'Cargo.toml'), 'utf8'), /"devtools"/);
  const probe = path.join(dir, 'should-not-exist-tauri.json');
  const child = cp.spawn(exe, [], { cwd: dir, env: { ...process.env, KREFT_DESKTOP_SELFTEST: probe }, stdio: 'ignore' });
  return new Promise((resolve) => setTimeout(() => {
    const alive = child.exitCode === null;
    try { child.kill(); } catch (_) { /* gone */ }
    assert.ok(alive, 'the release app is running after 6 seconds');
    assert.ok(!fs.existsSync(probe), 'a release build has no test hook');
    resolve();
  }, 6000));
});

test('tauri: a release build with everything on (tray, plugins, production DevTools) compiles', { skip: tauriSkip, timeout: 1800000 }, () => {
  config('tauri', {
    menu: { visibility: 'visible', template: [{ label: 'File', submenu: [{ label: 'New', id: 'n' }, { role: 'quit' }] }] },
    contextMenu: { enabled: false }, devtools: { production: true, openOnStart: true }, webview: { zoomFactor: 1.2 },
    tray: { enabled: true, icon: 'build/icon.png', closeToTray: true }, notifications: { enabled: true },
    updates: { enabled: true, url: 'https://example.com/{{target}}', pubkey: 'dW50cnVzdGVkIGNvbW1lbnQ6IHRlc3Q=' },
  });
  const r = sh(['tauri:sync']);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  const c = cp.spawnSync('cargo', ['check', '--release'], { cwd: path.join(dir, 'src-tauri'), env: ENV, encoding: 'utf8', timeout: 1700000 });
  assert.strictEqual(c.status, 0, (c.stdout + c.stderr).slice(-2500));
  void adapterT;
});

test('cleanup', { skip }, () => {
  if (dir) fs.rmSync(path.dirname(dir), { recursive: true, force: true });
});
