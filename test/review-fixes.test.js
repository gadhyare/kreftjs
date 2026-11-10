'use strict';
// Found by a review of the changes, each one reproduced before it was fixed: signing material and reports in the website build, a changed shared
// dependency judged, the server address built into an app, Tauri on Windows, and the options of electron:build.   Run: npm test
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const root = path.join(__dirname, '..');
const KREFT = path.join(root, 'bin', 'kreftjs.js');
const tmp = (t, prefix = 'kreft-review-') => { const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };
const write = (dir, rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
const files = (dir) => { const out = []; const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else out.push(path.relative(dir, f).split(path.sep).join('/')); } }; walk(dir); return out.sort(); };

// ---- 1. signing material and reports never go into the website ---------------------------------------------------------------------------

test('the website build never copies signing keys, native projects, release files, reports or the Capacitor config (a project with index.html at the top)', t => {
  const dir = tmp(t);
  write(dir, 'index.html', '<!doctype html><title>x</title><div id="app"></div><script src="kreftjs.js"></script>');
  fs.copyFileSync(path.join(root, 'kreftjs.js'), path.join(dir, 'kreftjs.js'));
  write(dir, 'package.json', '{"name":"flat","version":"1.0.0"}');
  write(dir, 'assets/logo.txt', 'public');
  write(dir, 'android/keystore.properties', 'storePassword=SECRETPASS\nkeyPassword=SECRETPASS\n');
  write(dir, 'android/upload-keystore.jks', 'KEY');
  write(dir, 'android/app/build.gradle', 'x');
  write(dir, 'ios/App/App.xcodeproj/project.pbxproj', 'x');
  write(dir, 'release/android/app-1.apk', 'apk');
  write(dir, 'build/signing/release.keystore', 'KEY2');            // signing material in a folder with another name
  write(dir, 'certs/upload.jks', 'KEY3');
  write(dir, 'keystore.properties', 'storePassword=SECRETPASS2');   // at the top
  write(dir, '.kreft/security/latest.json', '{"private":"package metadata"}');
  write(dir, 'capacitor.config.json', '{"appId":"com.acme.x","server":{"url":"http://192.168.1.5:8000"}}');
  write(dir, '.env', 'APP_KEY=secret');
  const r = cp.spawnSync(process.execPath, [KREFT, 'build'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const built = files(path.join(dir, 'dist'));
  for (const leaked of built.filter((f) => /keystore|\.jks$|^android\/|^ios\/|^release\/|^\.kreft\/|capacitor\.config|^\.env/.test(f))) assert.fail('this must not be in dist/: ' + leaked);
  assert.ok(built.includes('assets/logo.txt'), 'real website files are still copied');
  assert.ok(built.includes('index.html'));
  const all = built.map((f) => fs.readFileSync(path.join(dir, 'dist', f), 'utf8')).join('\n');
  assert.ok(!/SECRETPASS|192\.168\.1\.5|package metadata|APP_KEY=secret/.test(all), 'no secret text anywhere in the build');
});

// ---- 2. a changed shared dependency is judged ----------------------------------------------------------------------------------------------

test('a shared dependency that the new package changes is judged, even though an existing package also uses it', () => {
  const { judgedLocations } = require('../bin/security/scope.js');
  const integ = (n) => 'sha512-' + Buffer.alloc(64, n).toString('base64');
  const e = (v, x = {}) => ({ version: v, resolved: `https://registry.npmjs.org/p/-/p-${v}.tgz`, integrity: integ(v.length + (x.mark || 0)), ...x });
  const previous = { packages: { '': {}, 'node_modules/oldpkg': e('1.0.0', { dependencies: { shared: '^1' } }), 'node_modules/shared': e('1.0.0') } };
  const lock = { packages: { '': {}, 'node_modules/oldpkg': e('1.0.0', { dependencies: { shared: '^1 || ^2' } }), 'node_modules/example': e('1.0.0', { dependencies: { shared: '^2' } }), 'node_modules/shared': { ...e('2.0.0'), integrity: integ(5) } } };
  const manifest = { dependencies: { oldpkg: '1.0.0' } };
  const j = judgedLocations(lock, { requested: ['example'], manifest, previousLock: previous });
  assert.ok(j.has('node_modules/shared'), 'shared 1.0.0 became 2.0.0: new code, judged');
  assert.ok(j.has('node_modules/example'));
  assert.ok(!j.has('node_modules/oldpkg'), 'the unchanged existing package is not');
  // the same bytes at another place of the tree are not new
  const moved = { packages: { '': {}, 'node_modules/shared': { ...lock.packages['node_modules/shared'] } } };
  const movedPrev = { packages: { '': {}, 'node_modules/a/node_modules/shared': { ...lock.packages['node_modules/shared'] } } };
  assert.ok(!judgedLocations({ packages: { ...moved.packages, 'node_modules/example': e('1.0.0', { dependencies: { shared: '^2' } }) } }, { requested: ['example'], manifest: {}, previousLock: movedPrev }).has('node_modules/shared'), 'a package that only moved is not judged');
  // a package that was not in the old lockfile at all is new, even if an existing root reaches it now
  const fresh = judgedLocations(lock, { requested: ['example'], manifest, previousLock: { packages: { '': {}, 'node_modules/oldpkg': e('1.0.0') } } });
  assert.ok(fresh.has('node_modules/shared'), 'not in the old lockfile: new');
});

// ---- 3. the server address built into the app is the one that was decided -------------------------------------------------------------------

test('a PUBLIC_API_URL left in the terminal cannot replace the address given to a release, and is named when it is the problem', t => {
  const R = require('../bin/release.js');
  const dir = tmp(t);
  write(dir, '.env', 'PUBLIC_API_URL=https://from-env.example\n');
  const saved = process.env.PUBLIC_API_URL;
  t.after(() => { if (saved === undefined) delete process.env.PUBLIC_API_URL; else process.env.PUBLIC_API_URL = saved; });
  delete process.env.PUBLIC_API_URL;
  assert.deepEqual(R.currentApiUrl(dir), { url: 'https://from-env.example', source: 'PUBLIC_API_URL in your .env' });
  process.env.PUBLIC_API_URL = 'http://old-test.example:8000';
  assert.deepEqual(R.currentApiUrl(dir), { url: 'http://old-test.example:8000', source: 'the PUBLIC_API_URL variable of this terminal' }, 'the terminal wins, as it does when the site is built');
  fs.mkdirSync(path.join(dir, 'android'));
  write(dir, 'android/keystore.properties', 'x=1');
  const problems = R.preflight(dir, R.parseArgs(['--android']));
  assert.match(problems[0], /not https.*comes from the PUBLIC_API_URL variable of this terminal/s);
  assert.deepEqual(R.preflight(dir, R.parseArgs(['--android', '--api-url', 'https://api.real.example'])), [], 'an address given on the command line is what counts');
  assert.deepEqual(R.preflight(dir, R.parseArgs(['--android', '--no-api-url'])), []);
  const step = R.plan('android', dir, R.parseArgs(['--android', '--api-url', 'https://api.real.example']))[0];
  assert.equal(step.apiUrl, 'https://api.real.example');
  assert.equal(R.plan('android', dir, R.parseArgs(['--android', '--no-api-url']))[0].apiUrl, null);
  const src = fs.readFileSync(path.join(root, 'bin', 'release.js'), 'utf8');
  assert.match(src, /process\.env\.PUBLIC_API_URL = s\.noApi \? '' : \(s\.apiUrl \|\| ''\);/, 'the build is run with the decided address in the environment');
  assert.match(src, /PUBLIC_API_URL: s\.noApi \? '' : \(s\.apiUrl \|\| ''\)/, 'and so is the HarmonyOS build');
});

test('the finished build is checked: a release is not signed when the address inside it is not the one decided', t => {
  const R = require('../bin/release.js');
  const dir = tmp(t);
  assert.equal(R.verifyBuiltApiUrl(dir, 'https://a.example'), null, 'no build to look at: nothing to check');
  write(dir, 'dist/app.js', 'x={"PUBLIC_API_URL":"https://a.example","PUBLIC_X":"1"}');
  assert.equal(R.builtApiUrl(dir), 'https://a.example');
  assert.equal(R.verifyBuiltApiUrl(dir, 'https://a.example'), null);
  assert.match(R.verifyBuiltApiUrl(dir, 'https://b.example'), /contains the server address "https:\/\/a\.example", not https:\/\/b\.example.*Nothing was signed/);
  assert.match(R.verifyBuiltApiUrl(dir, null), /but you asked for none.*Nothing was signed/);
  write(dir, 'dist/app.js', 'x={"PUBLIC_API_URL":""}');
  assert.equal(R.verifyBuiltApiUrl(dir, null), null, 'no address, none wanted');
  assert.equal(R.verifyBuiltApiUrl(dir, ''), null);
  write(dir, 'dist/app.js', 'x={}');
  assert.equal(R.verifyBuiltApiUrl(dir, null), null, 'no key at all counts as no address');
  assert.match(R.verifyBuiltApiUrl(dir, 'https://a.example'), /contains the server address "\(none\)"/);
});

test('kreft mobile:build --api-url puts its address in the environment too, and says when the terminal had another one', t => {
  const dir = tmp(t);
  write(dir, 'package.json', '{"name":"x"}');
  const out = [];
  const log = console.log; console.log = (...a) => out.push(a.join(' '));
  const saved = process.env.PUBLIC_API_URL;
  t.after(() => { console.log = log; if (saved === undefined) delete process.env.PUBLIC_API_URL; else process.env.PUBLIC_API_URL = saved; });
  process.env.PUBLIC_API_URL = 'http://stale.example';
  const mobile = require('../bin/mobile.js');
  // setApiUrl is not exported; the build command is what calls it, so look at what it does with the environment
  const src = fs.readFileSync(path.join(root, 'bin', 'mobile.js'), 'utf8');
  console.log = log;
  assert.match(src, /process\.env\.PUBLIC_API_URL !== url\) console\.log\(`  Note: this terminal has PUBLIC_API_URL=/);
  assert.match(src, /process\.env\.PUBLIC_API_URL = url;/);
  assert.equal(typeof mobile.build, 'function');
});

// ---- 4. Tauri on Windows ------------------------------------------------------------------------------------------------------------------

test('tauri dev passes its settings as a file path, which Windows accepts, and the file holds the dev address', t => {
  const { devConfigFile } = require('../bin/tauri.js');
  const c = devConfigFile(8123);
  t.after(c.remove);
  assert.ok(fs.existsSync(c.file));
  assert.deepEqual(JSON.parse(fs.readFileSync(c.file, 'utf8')), { build: { devUrl: 'http://localhost:8123', beforeDevCommand: '' } });
  assert.doesNotMatch(c.file, /["{}]/, 'no quote or brace in the argument');
  // the real Windows argument check of win-spawn, with the platform set to Windows
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'win32' });
  try {
    const { prepare } = require('../bin/win-spawn.js');
    assert.doesNotThrow(() => prepare('C:\\app\\node_modules\\.bin\\tauri.cmd', ['dev', '--config', c.file], {}), 'the file path is accepted');
    assert.throws(() => prepare('C:\\app\\node_modules\\.bin\\tauri.cmd', ['dev', '--config', JSON.stringify({ build: { devUrl: 'http://localhost:8123' } })], {}), /not allowed/, 'the JSON text was what Windows refused');
  } finally { Object.defineProperty(process, 'platform', platform); }
  c.remove();
  assert.equal(fs.existsSync(c.file), false, 'the file is removed when tauri dev ends');
  const src = fs.readFileSync(path.join(root, 'bin', 'tauri.js'), 'utf8');
  assert.match(src, /spawn\(bin, \['dev', '--config', devConfig\.file\]/);
  assert.match(src, /const stopServer = \(\) => \{ devConfig\.remove\(\);/);
});

// ---- 5. electron:build keeps every option with its value -------------------------------------------------------------------------------------

test('electron:build sends each option with its value to electron-builder, and only the site options to the site build', () => {
  const { splitBuildArgs } = require('../bin/electron.js');
  assert.deepEqual(splitBuildArgs(['--mac', '--publish', 'never', '--arm64']), { builder: ['--mac', '--publish', 'never', '--arm64'], site: [] });
  assert.deepEqual(splitBuildArgs(['--publish=never', '--win']), { builder: ['--publish=never', '--win'], site: [] });
  assert.deepEqual(splitBuildArgs(['-p', 'always', '--linux']), { builder: ['-p', 'always', '--linux'], site: [] });
  assert.deepEqual(splitBuildArgs(['--prepackaged', 'dist-electron/mac', '--mac']), { builder: ['--prepackaged', 'dist-electron/mac', '--mac'], site: [] });
  assert.deepEqual(splitBuildArgs(['-c.mac.identity=null', '--mac']), { builder: ['-c.mac.identity=null', '--mac'], site: [] });
  assert.deepEqual(splitBuildArgs(['--no-minify', '--mac', '--publish', 'never', '--out', 'site']), { builder: ['--mac', '--publish', 'never'], site: ['--no-minify', '--out', 'site'] }, 'a site option and its value stay together');
  assert.deepEqual(splitBuildArgs(['--publish']), { builder: ['--publish'], site: [] }, 'a flag with no value left is not given the next flag');
  assert.deepEqual(splitBuildArgs(['--publish', '--mac']), { builder: ['--publish', '--mac'], site: [] });
  assert.deepEqual(splitBuildArgs([]), { builder: [], site: [] });
  // the target that follows a platform flag belongs to electron-builder (it used to be passed to the site build)
  assert.deepEqual(splitBuildArgs(['--win', 'nsis']), { builder: ['--win', 'nsis'], site: [] }, '--win nsis');
  assert.deepEqual(splitBuildArgs(['--mac', 'dmg']), { builder: ['--mac', 'dmg'], site: [] }, '--mac dmg');
  assert.deepEqual(splitBuildArgs(['--linux', 'AppImage', 'deb']), { builder: ['--linux', 'AppImage', 'deb'], site: [] }, 'several targets');
  assert.deepEqual(splitBuildArgs(['--win', 'nsis', '--x64']), { builder: ['--win', 'nsis', '--x64'], site: [] }, 'a target and an arch flag');
  assert.deepEqual(splitBuildArgs(['--win', 'nsis', '--out', 'public']), { builder: ['--win', 'nsis'], site: ['--out', 'public'] }, 'a site option still stops the target list');
  const src = fs.readFileSync(path.join(root, 'bin', 'electron.js'), 'utf8');
  assert.match(src, /\.\.\.split\.site\]/);
  assert.match(src, /\.\.\.split\.builder\]/);
  assert.doesNotMatch(src, /builderFlags/, 'the old filter that lost the values is gone');
});

// ---- 6. Electron permissions are granted to the app's own pages only ----------------------------------------------------------------------

test('electron: a permission is granted only to a page of the app, and the check is the one navigation uses', () => {
  const src = fs.readFileSync(path.join(root, 'templates', 'desktop', 'electron-main.js'), 'utf8');
  assert.match(src, /const isAppUrl = \(target\) =>/);
  assert.match(src, /setPermissionRequestHandler\(\(web, permission, callback, details\) => callback\(allow\.has\(permission\) && isAppUrl\(asker\(web, details\)\)\)\)/);
  assert.match(src, /setPermissionCheckHandler\(\(web, permission, origin, details\) => allow\.has\(permission\) && isAppUrl\(asker\(web, details, origin\)\)\)/);
  assert.match(src, /wc\.on\('will-navigate', \(event, target\) => \{\s*if \(isAppUrl\(target\)\) return;/);
  assert.match(src, /web\.getURL\(\)/, 'a file:// app (packaged) is judged by the page address, since its origin is just "file://"');
});

// ---- 7. Tauri: the window only goes to the app and to the origins that were allowed ----------------------------------------------------------

test('tauri: the generated window refuses navigation outside the app and webview.allowedNavigation', () => {
  const cfg = require('../bin/desktop/config.js');
  const adapter = require('../bin/desktop/tauri-adapter.js');
  const src = fs.readFileSync(path.join(root, 'bin', 'desktop', 'tauri-adapter.js'), 'utf8');
  assert.match(src, /\.on_navigation\(move \|url\| navigation_allowed\(&app_origins, url\)\)/);
  assert.match(src, /const ALLOWED_NAVIGATION: &\[&str\] = &\[\$\{/);
  assert.match(src, /fn navigation_allowed\(origins: &\[String\], url: &tauri::Url\) -> bool/);
  assert.match(src, /#\[cfg\(debug_assertions\)\]\s*if let Some\(dev\) = app\.config\(\)\.build\.dev_url/, 'the dev server is allowed in debug builds only');
  assert.equal(typeof adapter, 'object');
  assert.ok(cfg);
});

// ---- 8. Electron's own install script (the app binary) -----------------------------------------------------------------------------------

test('electron:init allows Electron\'s install script for npm, and electron:dev downloads the app when npm did not', t => {
  const E = require('../bin/electron.js');
  const dir = tmp(t);
  const log = console.log;
  const quiet = (fn) => { console.log = () => {}; try { return fn(); } finally { console.log = log; } };
  const pkg = () => JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  write(dir, 'package.json', JSON.stringify({ name: 'x', allowScripts: { esbuild: true } }));
  write(dir, 'index.html', '<!doctype html><div id="app"></div>');
  quiet(() => E.init(dir));
  assert.equal(pkg().allowScripts.electron, undefined, 'nothing is guessed before electron is installed (npm ignores version ranges)');
  assert.equal(E.approveElectronScript(dir), false);
  write(dir, 'node_modules/electron/package.json', '{"name":"electron","version":"34.5.8"}');
  assert.equal(E.approveElectronScript(dir), true);
  assert.deepEqual(pkg().allowScripts, { esbuild: true, 'electron@34.5.8': true }, 'the installed version, next to what was there');
  assert.equal(E.approveElectronScript(dir), false, 'once');
  write(dir, 'package.json', JSON.stringify({ name: 'x', allowScripts: { electron: false } }));
  assert.equal(E.approveElectronScript(dir), false);
  assert.equal(pkg().allowScripts.electron, false, 'a decision of the developer is not overwritten');
  fs.rmSync(path.join(dir, 'node_modules'), { recursive: true });

  assert.deepEqual(E.ensureElectronBinary(dir), { ok: false, reason: 'missing' }, 'electron is not installed at all');
  write(dir, 'node_modules/electron/install.js', '');
  const calls = [];
  const fake = (cmd, args) => { calls.push(args[0]); write(dir, 'node_modules/electron/path.txt', 'bin/app'); write(dir, 'node_modules/electron/dist/bin/app', 'x'); return { status: 0 }; };
  assert.deepEqual(quiet(() => E.ensureElectronBinary(dir, fake)), { ok: true, downloaded: true });
  assert.equal(calls.length, 1);
  assert.deepEqual(E.ensureElectronBinary(dir, fake), { ok: true, downloaded: false }, 'already there: nothing is run');
  assert.equal(calls.length, 1);
  fs.rmSync(path.join(dir, 'node_modules/electron/dist'), { recursive: true });
  assert.deepEqual(quiet(() => E.ensureElectronBinary(dir, () => ({ status: 1 }))), { ok: false, reason: 'failed' });
});

// ---- 9. the fixes of the second review ---------------------------------------------------------------------------------------------------

test('electron: redirects and frame navigations are held to the same rule, and a frame of unknown address gets no permission', () => {
  const src = fs.readFileSync(path.join(root, 'templates', 'desktop', 'electron-main.js'), 'utf8');
  assert.match(src, /wc\.on\('will-redirect', \(event, target\) => \{ if \(event\.isMainFrame !== false && !isAppUrl\(target\)\) event\.preventDefault\(\); \}\)/);
  assert.doesNotMatch(src, /will-frame-navigate/, 'a frame inside the page (a video, a map) is not blocked');
  assert.match(src, /details\.isMainFrame === false\) return ''/);
});

test('release: an old build is not taken for the new one, a missing apksigner is said, a failed keystore write leaves nothing', () => {
  const src = fs.readFileSync(path.join(root, 'bin', 'release.js'), 'utf8');
  assert.match(src, /fs\.rmSync\(path\.join\(root, 'android', 'app', 'build', 'outputs', \.\.\.d\)/, 'old outputs are removed before the build');
  assert.doesNotMatch(src, /mtimeMs < startedAt/, 'file age is not used: Gradle leaves unchanged outputs alone');
  assert.match(src, /signature NOT checked: apksigner was not found/);
  assert.match(src, /fs\.rmSync\(jks, \{ force: true \}\);\s*return \{ problem: `could not write android\/keystore\.properties/, 'the keystore is removed when its password cannot be saved');
});

test('install: the reports folder cannot lead outside through a link, and a cut-off promotion is repaired', t => {
  const dir = tmp(t), outside = tmp(t, 'kreft-outside-');
  fs.symlinkSync(outside, path.join(dir, '.kreft'));
  write(dir, 'package.json', '{"name":"x"}');
  write(dir, 'kreftjs.config.json', '{"security":{"reports":{"enabled":true,"directory":".kreft/security"}}}');
  const { install } = require('../bin/security/install.js');
  return assert.rejects(() => install(['left-pad'], { project: dir, dryRun: true }), /inside the project/).then(() => {
    // the backup of the old node_modules comes back when the project has none
    fs.rmSync(path.join(dir, '.kreft'));
    write(dir, '.kreft-node-modules-999999-2/pkg/index.js', 'old');
    return install(['left-pad'], { project: dir, dryRun: true }).catch(() => {}).then(() => {
      assert.ok(fs.existsSync(path.join(dir, 'node_modules', 'pkg', 'index.js')), 'the old tree was put back');
    });
  });
});

test('the website build skips Kreft\'s own hidden folders, and the install report names skipped scripts', t => {
  const { renderStatus } = require('../bin/security/install.js');
  const text = renderStatus({ status: 'installed', skippedScripts: ['electron@34.5.8', 'sharp@0.33.0'], requested: [], packages: [] });
  assert.match(text, /Install scripts were not run \(by design\) for: electron@34\.5\.8, sharp@0\.33\.0.*npm rebuild <name>/);
  const dir = tmp(t);
  write(dir, 'index.html', '<!doctype html><title>x</title><div id="app"></div><script src="kreftjs.js"></script>');
  fs.copyFileSync(path.join(root, 'kreftjs.js'), path.join(dir, 'kreftjs.js'));
  write(dir, '.kreft-node-modules-1-2/x.js', 'old');
  write(dir, '.kreft-security-stage-ab/package.json', '{}');
  const r = cp.spawnSync(process.execPath, [KREFT, 'build'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(files(path.join(dir, 'dist')).filter((f) => f.startsWith('.kreft')), []);
});

// ---- 10. the external review of 0.0.39 ------------------------------------------------------------------------------------------------------

test('vite plugin: the module it writes for a component is valid module code (no "with" in strict mode)', t => {
  const dir = tmp(t);
  const plugin = require('../tools/vite-plugin-kreftjs.js').default();
  write(dir, 'C.kreft', '<view><h1>{{ n }}</h1><button @click="n++">+</button></view>\n<script>\nlet n = state(1)\n</script>\n');
  const out = plugin.transform(fs.readFileSync(path.join(dir, 'C.kreft'), 'utf8'), path.join(dir, 'C.kreft'));
  write(dir, 'out.mjs', out.code);
  const r = cp.spawnSync(process.execPath, ['--check', path.join(dir, 'out.mjs')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('build: an output folder that would contain the app, the backend or the project is refused before anything is deleted', t => {
  const dir = tmp(t);
  const made = cp.spawnSync(process.execPath, [KREFT, 'new', 'app', '--js', '--db', 'sqlite'], { cwd: dir, encoding: 'utf8', input: '' });
  assert.equal(made.status, 0, made.stderr);
  const app = path.join(dir, 'app');
  for (const out of ['.', '..', 'frontend', 'backend']) {
    const before = files(app).length;
    const r = cp.spawnSync(process.execPath, [KREFT, 'build', '--out', out], { cwd: app, encoding: 'utf8' });
    assert.notEqual(r.status, 0, `--out ${out}`);
    assert.equal(files(app).length, before, `--out ${out} deleted nothing`);
  }
});

for (const [label, rel] of [['kreftjs.js', 'kreftjs.js'], ['the copy in the app template', 'templates/app/frontend/kreftjs.js']]) {
  test(`${label}: a watched object reports changes made inside it, and stopping a watcher runs its cleanup`, async () => {
    const K = require('../' + rel);
    const calls = [];
    global.window = global;
    global.__calls = calls;
    const def = await K.compile(`<view><p>x</p></view>
<script>
state data = { a: { b: 1 }, list: [1] }
on start { window.__bump = () => { data.a.b++ }; window.__push = () => { data.list.push(2) } }
watch data { window.__calls.push("deep") }
watch data.a.b { window.__calls.push("prim") }
</script>`, 'T.kreft');
    def.init({}, {});
    const wait = () => new Promise((r) => setTimeout(r, 30));
    await wait(); global.__bump(); await wait(); global.__push(); await wait();
    assert.deepEqual(calls, ['deep', 'prim', 'deep'], 'the object watcher hears the change inside it and the push; the plain one hears its own value');
    delete global.window; delete global.__calls; delete global.__bump; delete global.__push;

    const r = K.signal(1);
    let cleaned = 0;
    const stop = K.watch(() => r.value, (v, o, onCleanup) => { onCleanup(() => cleaned++); }, { immediate: true });
    stop();
    assert.equal(cleaned, 1);
    stop();
    assert.equal(cleaned, 1, 'only once');
  });
}

test('vscode formatter: spaces inside <pre>, <textarea> and multi-line template literals are kept', () => {
  const { formatKreft } = require('../editors/vscode/extension.js');
  const out = formatKreft('<view>\n<div>\n<pre>\n   keep   this\n\n      spaced\n</pre>\n<p>x</p>\n</div>\n</view>\n<script>\nstate msg = `a\n   b\n\n  c`\nstate n = 1\n</script>\n');
  assert.ok(out.includes('<pre>\n   keep   this\n\n      spaced\n</pre>'), out);
  assert.ok(out.includes('state msg = `a\n   b\n\n  c`\nstate n = 1'), out);
  assert.match(out, /\n {4}<p>x<\/p>\n {2}<\/div>\n<\/view>/, 'the lines after a <pre> are indented as before');
  const plain = '<view>\n  <div>\n    <p>x</p>\n  </div>\n</view>\n';
  assert.equal(formatKreft(plain), plain);
});

test('kreft add electron / tauri: the whole tree is checked against security.deniedPackages (by name or version, direct or not) before anything is installed', t => {
  const dir = tmp(t);
  write(dir, 'package.json', '{"name":"x","version":"1.0.0"}');
  write(dir, 'index.html', '<!doctype html><div id="app"></div>');
  const run = () => cp.spawnSync(process.execPath, [KREFT, 'add', 'electron', '--no-install'], { cwd: dir, encoding: 'utf8', timeout: 200000 });
  for (const rule of ['electron', 'tar']) {   // a package named here, and one that only comes with electron-builder
    write(dir, 'kreftjs.config.json', JSON.stringify({ security: { deniedPackages: [rule] } }));
    const r = run();
    assert.notEqual(r.status, 0, rule);
    assert.match(r.stderr, new RegExp(`${rule}@\\d+\\.\\d+\\.\\d+ is in security\\.deniedPackages`), r.stderr.slice(0, 300));
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).devDependencies, undefined, 'package.json was not touched');
    assert.equal(fs.existsSync(path.join(dir, 'electron')), false);
  }
});

test('desktop add: the checked manifest covers every dependency section, and an address must start with the registry', () => {
  const { judgeLock, manifestFor } = require('../bin/desktop/add.js');
  const m = manifestFor({ name: 'x', dependencies: { a: '1.0.0' }, devDependencies: { electron: '^30.0.0' }, optionalDependencies: { b: '1.0.0' } }, ['electron', 'tauri']);
  assert.deepEqual(Object.keys(m.dependencies), ['a'], 'the project\'s own dependencies are part of what is checked and installed');
  assert.deepEqual(m.optionalDependencies, { b: '1.0.0' });
  assert.equal(m.devDependencies.electron, '^30.0.0', 'a range the project already has is kept, as init keeps it');
  assert.ok(m.devDependencies['electron-builder'] && m.devDependencies['@tauri-apps/cli']);
  const reg = new Set(['https://registry.npmjs.org/']);
  const pkg = (resolved, extra = {}) => ({ version: '1.0.0', resolved, integrity: 'sha512-AAAA', ...extra });
  const lock = { packages: { '': {}, 'node_modules/ok': pkg('https://registry.npmjs.org/ok/-/ok-1.0.0.tgz'), 'node_modules/evil': pkg('https://evil.example/ok.tgz'), 'node_modules/trick': pkg('https://registry.npmjs.org.evil.example/t.tgz'), 'node_modules/noint': pkg('https://registry.npmjs.org/n/-/n-1.0.0.tgz', { integrity: undefined }), 'node_modules/lnk': { version: '1.0.0', link: true, resolved: 'file:../x' }, 'node_modules/a/node_modules/old': pkg('https://registry.npmjs.org/old/-/old-1.0.0.tgz') } };
  const problems = judgeLock(lock, ['old@1.0.0'], reg);
  assert.equal(problems.length, 5, problems.join('\n'));
  assert.ok(problems.some((x) => /^evil@/.test(x)) && problems.some((x) => /^trick@/.test(x)) && problems.some((x) => /^noint@.*no integrity/.test(x)) && problems.some((x) => /^lnk@/.test(x)));
  assert.ok(problems.some((x) => /^old@1\.0\.0 is in security\.deniedPackages/.test(x)), 'a rule by exact version covers a package deep in the tree');
  assert.ok(!problems.some((x) => /^ok@/.test(x)));
});
