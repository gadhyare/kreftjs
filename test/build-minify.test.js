// kreft build minifies kreftjs.js when esbuild is installed; --no-minify copies it as it is
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CLI = path.join(__dirname, '..', 'bin', 'kreftjs.js');
const RUNTIME = path.join(__dirname, '..', 'kreftjs.js');
let hasEsbuild = true;
try { require.resolve('esbuild', { paths: [path.join(__dirname, '..'), process.cwd()] }); } catch (_) { hasEsbuild = false; }

function build(...flags) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-minify-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><html><head><base href="/"></head><body><div id="app"></div><script src="kreftjs.js"></script><script>Kreftjs.app("App.kreft").mount("#app")</script></body></html>');
  fs.writeFileSync(path.join(dir, 'App.kreft'), '<view><p>hi</p></view>\n');
  const out = path.join(dir, 'out');
  const r = spawnSync(process.execPath, [CLI, 'build', dir, '--out', out, ...flags], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  return { dir, file: path.join(out, 'kreftjs.js') };
}

test('build --no-minify copies kreftjs.js byte for byte', () => {
  const { dir, file } = build('--no-minify');
  try { assert.strictEqual(fs.readFileSync(file, 'utf8'), fs.readFileSync(RUNTIME, 'utf8')); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('build minifies kreftjs.js when esbuild is installed (and it still defines Kreftjs)', { skip: !hasEsbuild && 'esbuild is not installed' }, () => {
  const { dir, file } = build();
  try {
    const min = fs.readFileSync(file, 'utf8');
    assert.ok(min.length < fs.statSync(RUNTIME).size * 0.6, 'at least 40% smaller');
    assert.match(min, /Kreftjs/);
    assert.doesNotThrow(() => new Function(min), 'the minified file is valid JavaScript');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
