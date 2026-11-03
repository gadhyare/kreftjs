// The Kreft names: the runtime, the server entry, the package and the settings files
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const Module = require('node:module');

const ROOT = path.join(__dirname, '..');
const Kreftjs = require(path.join(ROOT, 'kreftjs.js'));
const { prepareTemplate } = Kreftjs.__internal;
const pkg = require(path.join(ROOT, 'package.json'));

test('Kreftjs: the runtime has the package version, and Kreft is the same object', () => {
  assert.strictEqual(Kreftjs.version, pkg.version);
  assert.strictEqual(globalThis.Kreftjs, Kreftjs);
  assert.strictEqual(globalThis.Kreft, Kreftjs);
  assert.strictEqual(typeof Kreftjs.compile, 'function');
});

test('templates: {for} blocks come out as k-each, and finished markup is left alone', () => {
  assert.match(prepareTemplate('{for u in us key u.id}<b>{u}</b>{/for}'), /<template k-each="u in us" k-key="u\.id">/);
  const html = '<kreft-view k-if="a"></kreft-view>';
  assert.strictEqual(prepareTemplate(html), html);
});

test('require(): kreftjs/server and the earlier kreft names reach server.js', () => {
  const { installAlias } = require(path.join(ROOT, 'bin/backend/index.js'));
  installAlias();
  for (const name of ['kreftjs/server', '@kreftjs/server', 'kreft/server', '@kreft/server']) {
    assert.strictEqual(Module._resolveFilename(name, module), path.join(ROOT, 'server.js'), name);
  }
});

test('package: kreftjs with the `kreftjs` and `kreft` commands', () => {
  assert.strictEqual(pkg.name, 'kreftjs');
  assert.strictEqual(pkg.main, 'kreftjs.js');
  assert.deepStrictEqual(pkg.bin, { kreftjs: 'bin/kreftjs.js', kreft: 'bin/kreftjs.js' });
  for (const f of pkg.files) assert.ok(require('node:fs').existsSync(path.join(ROOT, f)), `${f} is listed in "files" and exists`);
});

test('settings: kreftjs.config.json wins; kreft.config.json is read when it is missing', () => {
  const fs = require('node:fs'), os = require('node:os');
  const { readConfig } = require(path.join(ROOT, 'bin/kreftjs-config.js'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kreftjs-config-'));
  fs.writeFileSync(path.join(dir, 'package.json'), '{}');
  fs.writeFileSync(path.join(dir, 'kreft.config.json'), '{"db":"sqlite:mid.db"}');
  assert.strictEqual(readConfig(dir).db, 'sqlite:mid.db');
  fs.writeFileSync(path.join(dir, 'kreftjs.config.json'), '{"db":"sqlite:new.db"}');
  assert.strictEqual(readConfig(dir).db, 'sqlite:new.db');
  fs.rmSync(dir, { recursive: true, force: true });
});
