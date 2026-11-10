// kreft tauri:init (and kreft new --tauri): src-tauri is written, package.json gets the scripts, nothing is overwritten.   Run: npm test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('tauri:init writes src-tauri, adds scripts, and does not overwrite', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-tauri-'));
  const log = console.log;
  try {
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'demo-app', version: '1.2.3' }));
    console.log = () => { };
    const tauri = require(path.join(__dirname, '..', 'bin/tauri.js'));
    tauri.init(tmp);
    console.log = log;

    const conf = JSON.parse(fs.readFileSync(path.join(tmp, 'src-tauri', 'tauri.conf.json'), 'utf8'));
    assert.strictEqual(conf.productName, 'Demo App');
    assert.strictEqual(conf.identifier, 'com.kreftjs.demoapp');
    assert.strictEqual(conf.version, '1.2.3');
    assert.strictEqual(conf.build.frontendDist, '../dist');
    for (const f of ['Cargo.toml', 'build.rs', 'src/main.rs', 'capabilities/default.json']) {
      assert.ok(fs.existsSync(path.join(tmp, 'src-tauri', f)), f);
    }
    assert.match(fs.readFileSync(path.join(tmp, 'src-tauri', 'Cargo.toml'), 'utf8'), /name = "demo-app"/);

    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    assert.strictEqual(pkg.scripts['tauri:build'], 'kreft tauri:build');
    assert.ok(pkg.devDependencies['@tauri-apps/cli']);

    fs.writeFileSync(path.join(tmp, 'src-tauri', 'src', 'main.rs'), '// mine');
    console.log = () => { };
    tauri.init(tmp);
    console.log = log;
    assert.strictEqual(fs.readFileSync(path.join(tmp, 'src-tauri', 'src', 'main.rs'), 'utf8'), '// mine');
  } finally {
    console.log = log;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('the kreft command knows the tauri commands', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'bin/kreftjs.js'), 'utf8');
  for (const c of ['tauri', 'tauri:dev', 'tauri:build', 'tauri:init', 'make:tauri']) assert.ok(src.includes(`'${c}'`) || src.includes(`${c}:`), c);
});

test('an app icon always exists: the project\'s own is kept, otherwise one is written (no missing icons/32x32.png)', () => {
  const { ensureIcon, placeholderPng } = require(path.join(__dirname, '..', 'bin/app-icon.js'));
  const png = placeholderPng(64);
  assert.deepStrictEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'a PNG signature');
  assert.strictEqual(png.readUInt32BE(16), 64, 'width');
  assert.strictEqual(png.readUInt32BE(20), 64, 'height');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-icon-'));
  try {
    const first = ensureIcon(tmp);
    assert.ok(first.made && fs.existsSync(first.file));
    assert.deepStrictEqual([...fs.readFileSync(first.file).subarray(1, 4)], [80, 78, 71]);
    fs.writeFileSync(first.file, 'mine');
    const again = ensureIcon(tmp);
    assert.ok(!again.made);
    assert.strictEqual(fs.readFileSync(again.file, 'utf8'), 'mine', 'the project\'s own icon is never replaced');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('the package ships the logo that init copies as the default icon', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.ok(pkg.files.includes('assets/logo-mark.png'));
});
