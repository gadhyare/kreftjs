// Security: Android signing material and native/release folders never reach the built site.
// In a flat layout (no frontend/ folder) they sit at the app root, next to index.html, where a naive copy would publish
// the keystore and its plaintext password with the website.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CLI = path.join(__dirname, '..', 'bin', 'kreftjs.js');

function flatProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-secrets-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><html><head><base href="/"></head><body><div id="app"></div><script src="kreftjs.js"></script><script>Kreftjs.app("App.kreft").mount("#app")</script></body></html>');
  fs.writeFileSync(path.join(dir, 'App.kreft'), '<view><p>hi</p></view>\n');
  // what `kreft mobile:release --android --create-keystore` writes
  fs.mkdirSync(path.join(dir, 'android'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'android', 'keystore.properties'), 'storeFile=../upload-keystore.jks\nstorePassword=secret123\nkeyAlias=upload\nkeyPassword=secret123\n');
  fs.writeFileSync(path.join(dir, 'android', 'upload-keystore.jks'), 'JKS-BYTES');
  // release artifacts, and a stray keystore outside android/ (defence in depth)
  fs.mkdirSync(path.join(dir, 'release', 'android'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'release', 'android', 'app.apk'), 'APK');
  fs.mkdirSync(path.join(dir, 'certs'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'certs', 'other.keystore'), 'KEYSTORE');
  return dir;
}

function build(dir) {
  const out = path.join(dir, 'dist');
  const r = spawnSync(process.execPath, [CLI, 'build', dir, '--out', out], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  return out;
}

function allFiles(root) {
  const out = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else out.push(f); } };
  walk(root);
  return out;
}

test('build never copies signing material or native/release folders into dist (flat layout)', () => {
  const dir = flatProject();
  try {
    const dist = build(dir);
    assert.ok(fs.existsSync(path.join(dist, 'index.html')), 'the site was built');
    const files = allFiles(dist).map((f) => path.relative(dist, f));
    assert.ok(!files.some((f) => f.split(path.sep)[0] === 'android'), 'no android/ folder in dist');
    assert.ok(!files.some((f) => f.split(path.sep)[0] === 'release'), 'no release/ folder in dist');
    assert.ok(!files.some((f) => f.split(path.sep)[0] === 'certs'), 'a stray keystore folder is skipped too');
    assert.ok(!files.some((f) => /keystore\.properties$|\.(jks|keystore)$/i.test(f)), 'no signing files anywhere in dist');
    assert.ok(!fs.readFileSync(path.join(dist, 'app.js'), 'utf8').includes('secret123'), 'the password is not in the built JS');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('build still copies ordinary assets next to index.html', () => {
  const dir = flatProject();
  try {
    fs.writeFileSync(path.join(dir, 'logo.svg'), '<svg/>');
    fs.mkdirSync(path.join(dir, 'img'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'img', 'a.png'), 'PNG');
    const dist = build(dir);
    assert.ok(fs.existsSync(path.join(dist, 'logo.svg')), 'svg copied');
    assert.ok(fs.existsSync(path.join(dist, 'img', 'a.png')), 'nested asset copied');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
