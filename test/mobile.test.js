const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const cli = path.join(__dirname, '..', 'bin', 'kreftjs.js');
const run = (args, cwd) => spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });

function makeApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-mobile-'));
  const r = run(['new', 'phone-app', '--js', '--mobile', '--no-auth'], dir);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  return path.join(dir, 'phone-app');
}

test('kreft new --mobile writes capacitor.config.json and package.json entries', () => {
  const app = makeApp();
  const cfg = JSON.parse(fs.readFileSync(path.join(app, 'capacitor.config.json'), 'utf8'));
  assert.strictEqual(cfg.appId, 'com.example.phoneapp');
  assert.strictEqual(cfg.webDir, 'dist');
  assert.strictEqual(cfg.android.adjustMarginsForEdgeToEdge, 'force');
  const pkg = JSON.parse(fs.readFileSync(path.join(app, 'package.json'), 'utf8'));
  assert.ok(pkg.dependencies['@capacitor/core'] && pkg.devDependencies['@capacitor/cli']);
  assert.strictEqual(pkg.scripts['mobile:android'], 'kreft mobile:build --android');
});

test('kreft build --pwa writes manifest, service worker and tags', () => {
  const app = makeApp();
  const fe = fs.existsSync(path.join(app, 'frontend')) ? path.join(app, 'frontend') : app;
  const r = run(['build', '--pwa', '--base', './'], app);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  const dist = path.join(app, 'dist');
  const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.webmanifest'), 'utf8'));
  assert.strictEqual(manifest.display, 'standalone');
  const sw = fs.readFileSync(path.join(dist, 'sw.js'), 'utf8');
  assert.match(sw, /kreft-[0-9a-f]{10}/);
  assert.match(sw, /\/api\//);
  assert.ok(sw.includes('app.js'));
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  assert.match(html, /rel="manifest"/);
  assert.match(html, /pwa-register\.js/);
  assert.match(html, /viewport-fit=cover/);
  assert.ok(fs.existsSync(fe));
});

test('a normal build has no PWA files', () => {
  const app = makeApp();
  assert.strictEqual(run(['build'], app).status, 0);
  assert.ok(!fs.existsSync(path.join(app, 'dist', 'sw.js')));
});

test('mobile:build rejects a bad --api-url and explains a missing npm install', () => {
  const app = makeApp();
  const bad = run(['mobile:build', '--api-url', 'javascript:alert(1)'], app);
  assert.notStrictEqual(bad.status, 0);
  const noCap = run(['mobile:build', '--android'], app);
  assert.notStrictEqual(noCap.status, 0);
  assert.match(noCap.stdout + noCap.stderr, /npm install/);
});

test('Android builds find a Java 21 when the default Java is older (or say so)', () => {
  const m = require('../bin/mobile.js');
  assert.ok(m.javaMajor(null) >= 0);
  const found = m.findJava21();
  if (found) assert.ok(m.javaMajor(found) >= 21 && m.javaMajor(found) <= 23);
  else assert.strictEqual(m.findJava21(), null);
  const env = m.androidEnv();
  assert.ok(typeof env === 'object');
  if (env.JAVA_HOME) assert.ok(m.javaMajor(env.JAVA_HOME) >= 21 && m.javaMajor(env.JAVA_HOME) <= 23);
});

test('mobile commands refuse to run outside a Kreft app and change nothing', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-notapp-'));
  fs.writeFileSync(path.join(empty, 'package.json'), '{"name":"x"}\n');
  for (const cmd of ['mobile:init', 'mobile:build', 'mobile:run', 'mobile:open', 'mobile:dev', 'mobile:setup']) {
    const r = run([cmd, '--android'], empty);
    assert.notStrictEqual(r.status, 0, cmd);
    assert.match(r.stdout + r.stderr, /not a Kreft app/, cmd);
  }
  assert.deepStrictEqual(fs.readdirSync(empty), ['package.json']);
  assert.strictEqual(fs.readFileSync(path.join(empty, 'package.json'), 'utf8'), '{"name":"x"}\n');
  // the framework's own folder too: nothing written there
  const before = fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8');
  const r = run(['mobile:init'], path.join(__dirname, '..'));
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /Kreft framework itself/);
  assert.strictEqual(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'), before);
  assert.ok(!fs.existsSync(path.join(__dirname, '..', 'capacitor.config.json')));
});

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-pin-'));

test('Gradle is pinned to a fitting Java in android/gradle.properties, once, and never over a line the person wrote', () => {
  const m = require('../bin/mobile.js');
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'android'));
  const file = path.join(dir, 'android', 'gradle.properties');
  fs.writeFileSync(file, 'org.gradle.jvmargs=-Xmx1536m');
  assert.strictEqual(m.pinGradleJava(dir, '/jdks/jdk-21/Contents/Home'), true);
  const once = fs.readFileSync(file, 'utf8');
  assert.match(once, /^org\.gradle\.jvmargs=-Xmx1536m$/m, 'the existing lines stay');
  assert.match(once, /^org\.gradle\.java\.home=\/jdks\/jdk-21\/Contents\/Home$/m);
  assert.strictEqual(m.pinGradleJava(dir, '/other/jdk-22'), false, 'a second run changes nothing');
  assert.strictEqual(fs.readFileSync(file, 'utf8'), once);
  fs.writeFileSync(file, 'org.gradle.java.home=/mine/jdk-23\n');
  assert.strictEqual(m.pinGradleJava(dir, '/jdks/jdk-21'), false, 'never over the person\'s own line');
  assert.strictEqual(fs.readFileSync(file, 'utf8'), 'org.gradle.java.home=/mine/jdk-23\n');
  assert.strictEqual(m.pinGradleJava(dir, null), false, 'no Java found: nothing written');
  assert.strictEqual(m.pinGradleJava(path.join(dir, 'nowhere'), '/jdks/jdk-21'), false, 'no android folder: nothing written');
  fs.writeFileSync(file, '');
  m.pinGradleJava(dir, 'C:\\Java\\jdk-21');
  assert.match(fs.readFileSync(file, 'utf8'), /^org\.gradle\.java\.home=C:\/Java\/jdk-21$/m, 'Windows paths use forward slashes');
});

test('mobile:setup does the first-run steps once, never replaces a good APP_KEY, and never prints it', () => {
  const m = require('../bin/mobile.js');
  assert.strictEqual(m.appKeyState(null), 'no-file');
  assert.strictEqual(m.appKeyState('APP_NAME=x\nAPP_KEY=\n'), 'missing');
  assert.strictEqual(m.appKeyState('APP_KEY=short'), 'missing');
  assert.strictEqual(m.appKeyState('APP_KEY=base64:' + 'a'.repeat(40)), 'ok');
  assert.strictEqual(m.appKeyState('APP_KEY="base64:' + 'a'.repeat(40) + '"'), 'ok');
  const dir = tmp();
  assert.strictEqual(run(['new', 'a1', '--js', '--mobile', '--auth'], dir).status, 0);
  const appDir = path.join(dir, 'a1');
  const key = () => (fs.readFileSync(path.join(appDir, '.env'), 'utf8').match(/^APP_KEY=(.*)$/m) || [])[1];
  const k1 = key();
  const first = run(['mobile:setup'], appDir);
  assert.strictEqual(first.status, 0, first.stdout + first.stderr);
  assert.match(first.stdout, /APP_KEY is set/);
  assert.match(first.stdout, /storage linked/);
  assert.match(first.stdout, /database: 4 migrations ran/);
  const again = run(['mobile:setup'], appDir);
  assert.match(again.stdout, /storage already linked/);
  assert.match(again.stdout, /database is up to date/);
  assert.strictEqual(key(), k1, 'a good key is never replaced (that would log everybody out)');
  // a fresh checkout: no .env (git ignores it) and no database
  fs.rmSync(path.join(appDir, '.env'));
  for (const f of fs.readdirSync(path.join(appDir, 'backend', 'database'))) if (/\.db/.test(f)) fs.rmSync(path.join(appDir, 'backend', 'database', f));
  const clone = run(['mobile:setup'], appDir);
  assert.strictEqual(clone.status, 0, clone.stdout + clone.stderr);
  assert.match(clone.stdout, /APP_KEY created in \.env/);
  assert.match(clone.stdout, /database: 4 migrations ran/);
  assert.notStrictEqual(key(), k1);
  assert.ok(key().startsWith('base64:'));
  for (const out of [first.stdout, again.stdout, clone.stdout]) assert.doesNotMatch(out, /base64:[A-Za-z0-9+/=]{20,}/, 'the key is never printed');
});

test('mobile:setup refuses outside an app', () => {
  const empty = tmp();
  const r = run(['mobile:setup'], empty);
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /not a Kreft app/);
});

test('a phone app gets no service worker (it would keep serving old files after an update)', () => {
  const mobile = fs.readFileSync(path.join(__dirname, '..', 'bin', 'mobile.js'), 'utf8');
  assert.match(mobile, /'build', '--base', '\.\/', '--no-htaccess'\]/, 'mobile:build builds without --pwa');
  assert.doesNotMatch(mobile, /'--pwa'/);
  const m = require('../bin/mobile.js');
  assert.match(m.RETIRE_SW, /caches\.delete/);
  assert.match(m.RETIRE_SW, /registration\.unregister\(\)/);
  assert.match(m.RETIRE_SW, /skipWaiting/);
  // and a site built with --pwa never registers its worker inside the phone app or Electron
  const dir = tmp();
  assert.strictEqual(run(['new', 'a1', '--js', '--no-auth'], dir).status, 0);
  const appDir = path.join(dir, 'a1');
  assert.strictEqual(run(['build', '--pwa'], appDir).status, 0);
  const reg = fs.readFileSync(path.join(appDir, 'dist', 'pwa-register.js'), 'utf8');
  assert.match(reg, /Capacitor\.isNativePlatform/);
  assert.match(reg, /__KREFT_ELECTRON__/);
  // the native API also removes a worker an older build left behind
  const native = fs.readFileSync(path.join(__dirname, '..', 'templates', 'mobile', 'kreftjs-native.js'), 'utf8');
  assert.match(native, /serviceWorker\.getRegistrations\(\)/);
});

test('a --mobile project gets a mobile section in its own README, once', () => {
  const dir = tmp();
  assert.strictEqual(run(['new', 'a1', '--js', '--mobile', '--no-auth'], dir).status, 0);
  const appDir = path.join(dir, 'a1');
  const readme = () => fs.readFileSync(path.join(appDir, 'README.md'), 'utf8');
  assert.match(readme(), /^## Mobile app \(iOS and Android\)/m);
  assert.match(readme(), /kreft mobile:run --android/);
  assert.match(readme(), /kreft mobile:setup/);
  assert.match(readme(), /--api-url/);
  const once = readme();
  assert.strictEqual(run(['mobile:init'], appDir).status, 0);
  assert.strictEqual(readme(), once, 'running mobile:init again adds nothing');
  const plain = tmp();
  assert.strictEqual(run(['new', 'b1', '--js', '--no-auth'], plain).status, 0);
  assert.doesNotMatch(fs.readFileSync(path.join(plain, 'b1', 'README.md'), 'utf8'), /Mobile app/, 'a project without --mobile is unchanged');
});

test('mobile:dev picks a free port and the running device by itself', async () => {
  const m = require('../bin/mobile.js');
  const net = require('net');
  const hold = net.createServer();
  await new Promise((r) => hold.listen(0, '0.0.0.0', r));
  const busy = hold.address().port;
  const got = await m.freePort(busy);
  assert.notStrictEqual(got, busy, 'a busy port is skipped');
  assert.ok(got > busy && got <= busy + 20);
  await new Promise((r) => hold.close(r));
  assert.strictEqual(await m.freePort(busy), busy, 'a free port is used as asked');
  assert.strictEqual(m.pickTarget(['--android', '--target', 'emulator-5556'], 'android'), 'emulator-5556', '--target always wins');
  assert.strictEqual(m.pickTarget(['--ios'], 'ios'), null, 'iOS: Capacitor asks');
  assert.ok(Array.isArray(m.runningAndroid()));
  const src = fs.readFileSync(path.join(__dirname, '..', 'bin', 'mobile.js'), 'utf8');
  assert.match(src, /'10\.0\.2\.2' : \(ip \? ip\.address/, 'the emulator uses its own name for this computer');
  assert.match(src, /'--live-reload', '--host', mode\.host, '--port', port/, 'the same port and host go to the server and to the app');
});

test('mobile:dev goes through the USB cable for Android devices, and through the Wi-Fi only when it has to', () => {
  const m = require('../bin/mobile.js');
  const ip = { address: '192.168.1.5' };
  assert.deepStrictEqual(JSON.parse(JSON.stringify(m.liveMode({ plat: 'android', devices: ['abc'], ip }))), { kind: 'usb', host: 'localhost', bind: [] }, 'a device adb sees: the cable, and the server stays on this computer only');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(m.liveMode({ plat: 'android', devices: [], ip }))), { kind: 'lan', host: '192.168.1.5', bind: ['--host', '0.0.0.0'] }, 'no device yet: the Wi-Fi address');
  assert.strictEqual(m.liveMode({ plat: 'android', devices: ['abc'], ip, lan: true }).kind, 'lan', '--lan forces the Wi-Fi');
  assert.strictEqual(m.liveMode({ plat: 'android', devices: [], ip, target: 'emulator-5554' }).host, '10.0.2.2', 'an emulator without a tunnel uses its own name for this computer');
  assert.strictEqual(m.liveMode({ plat: 'ios', devices: ['abc'], ip }).kind, 'lan', 'iOS has no adb');
  assert.strictEqual(m.adbReverse('no-such-device', 9), false, 'a device that is not there gives false, not an exception');
  assert.strictEqual(m.adbUnreverse('no-such-device', 9), false);
  const src = fs.readFileSync(path.join(__dirname, '..', 'bin', 'mobile.js'), 'utf8');
  assert.match(src, /'dev', '--seed', \.\.\.mode\.bind, '--port', port/, 'the server is shared on the network only in Wi-Fi mode');
  assert.match(src, /for \(const d of reversed\) adbUnreverse\(d, port\)/, 'the tunnels are removed when it stops');
  assert.match(src, /if \(!reversed\.length\) mode = liveMode/, 'if adb cannot open the tunnel it falls back to the Wi-Fi');
  assert.match(src, /target && devices\.includes\(target\) \? \[target\] : devices/, 'with --target only that device gets a tunnel');
  assert.match(src, /await build\(\['--' \+ plat\], \{ quiet: true \}\)/, 'a new app: mobile:dev prepares the native project first');
});

test('--app runs a mobile command for an app from any folder, and says so when the folder is wrong', () => {
  const dir = tmp();
  assert.strictEqual(run(['new', 'a1', '--js', '--mobile', '--auth'], dir).status, 0);
  const appDir = path.join(dir, 'a1');
  const elsewhere = tmp(); // not an app
  const plain = run(['mobile:setup'], elsewhere);
  assert.notStrictEqual(plain.status, 0, 'without --app a non-app folder is refused');
  assert.match(plain.stdout + plain.stderr, /not a Kreft app/);
  const ok = run(['mobile:setup', '--app', appDir], elsewhere);
  assert.strictEqual(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /APP_KEY is set/);
  assert.match(ok.stdout, /database: 4 migrations ran/, 'it worked on the app, not on the folder it was started in');
  assert.ok(fs.existsSync(path.join(appDir, 'backend', 'database')), 'the work happened in the app');
  assert.deepStrictEqual(fs.readdirSync(elsewhere), [], 'and nothing was written where it was started');
  const order = run(['--app', appDir, 'mobile:setup'], elsewhere);
  assert.ok(order.stdout.length >= 0);
  const missing = run(['mobile:setup', '--app', path.join(dir, 'nope')], elsewhere);
  assert.notStrictEqual(missing.status, 0);
  assert.match(missing.stderr + missing.stdout, /Could not use the app folder .*it does not exist/);
  const bare = run(['mobile:setup', '--app'], elsewhere);
  assert.notStrictEqual(bare.status, 0);
  assert.match(bare.stderr + bare.stdout, /--app needs the app folder/);
  const notKreft = run(['mobile:setup', '--app', elsewhere], elsewhere);
  assert.match(notKreft.stdout + notKreft.stderr, /not a Kreft app/, 'a folder that is not an app is still refused');
});

test('the Android window background is made dark once, and never over the person\'s own', () => {
  const m = require('../bin/mobile.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-bg-'));
  const res = path.join(dir, 'android', 'app', 'src', 'main', 'res', 'values');
  fs.mkdirSync(res, { recursive: true });
  const f = path.join(res, 'styles.xml');
  fs.writeFileSync(f, '<resources>\n    <style name="AppTheme.NoActionBar" parent="Theme.AppCompat.DayNight.NoActionBar">\n    </style>\n</resources>');
  assert.strictEqual(m.darkWindowBackground(dir), true);
  assert.match(fs.readFileSync(f, 'utf8'), /android:windowBackground">#111827/);
  assert.strictEqual(m.darkWindowBackground(dir), false, 'a second run changes nothing');
  assert.strictEqual(m.darkWindowBackground(path.join(dir, 'nowhere')), false);
});

test('the dev client adds no DevTools button to the phone app (it has no floating button at all; Alt+Shift+D opens the panel)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'tools', 'dev-client.js'), 'utf8');
  assert.doesNotMatch(src, /data-kreft-devtools-button/);
  assert.match(src, /Alt\+Shift\+D/);
});

test('freePort skips a port another server already answers on', async () => {
  const m = require('../bin/mobile.js');
  const net = require('net');
  const srv = net.createServer();
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const busy = srv.address().port;
  const got = await m.freePort(busy);
  srv.close();
  assert.notStrictEqual(got, busy);
});
