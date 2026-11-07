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
  for (const cmd of ['mobile:init', 'mobile:build', 'mobile:run', 'mobile:open', 'mobile:dev']) {
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
