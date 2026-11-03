// Som.js → Kreft: the new names work and the old ones still do
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const Module = require('node:module');

const ROOT = path.join(__dirname, '..');
const Kreftjs = require(path.join(ROOT, 'kreftjs.js'));
const { legacyMarkup, prepareTemplate } = Kreftjs.__internal;

test('Kreftjs: the runtime is 3.0.0, Kreft and Som are the same object and compileSom is Kreftjs.compile', () => {
  assert.strictEqual(Kreftjs.version, '3.0.0');
  assert.strictEqual(globalThis.Kreftjs, Kreftjs);
  assert.strictEqual(globalThis.Kreft, Kreftjs);
  assert.strictEqual(globalThis.Som, Kreftjs);
  assert.strictEqual(typeof Kreftjs.compile, 'function');
  assert.strictEqual(Kreftjs.compileSom, Kreftjs.compile);
});

test('templates: s- directives and <som-…> tags are read as k- and <kreft-…>', () => {
  const html = '<som-view s-if="a > b" s-on:click="go()" @click="x" title="s-if stays"></som-view><p>use s-if here</p><template s-each="u in us"><som-link to="/">s-key</som-link></template>';
  assert.strictEqual(legacyMarkup(html),
    '<kreft-view k-if="a > b" k-on:click="go()" @click="x" title="s-if stays"></kreft-view><p>use s-if here</p><template k-each="u in us"><kreft-link to="/">s-key</kreft-link></template>');
  // already new: untouched, and the {for} blocks come out with the new names
  assert.strictEqual(legacyMarkup('<kreft-view k-if="a"></kreft-view>'), '<kreft-view k-if="a"></kreft-view>');
  assert.match(prepareTemplate('{for u in us key u.id}<b>{u}</b>{/for}'), /<template k-each="u in us" k-key="u\.id">/);
  // an unknown <som-…> element is not one of ours
  assert.strictEqual(legacyMarkup('<som-other s-x="1"></som-other>'), '<som-other k-x="1"></som-other>');
});

test('require(): kreftjs/server and the earlier names all reach server.js', () => {
  const { installAlias } = require(path.join(ROOT, 'bin/backend/index.js'));
  installAlias();
  for (const name of ['kreftjs/server', '@kreftjs/server', 'kreft/server', '@kreft/server', 'somjs/server', 'som/server', '@somjs/server']) {
    assert.strictEqual(Module._resolveFilename(name, module), path.join(ROOT, 'server.js'), name);
  }
});

test('package: kreftjs 3.0.0 with `kreftjs`, `kreft` and `som` commands', () => {
  const pkg = require(path.join(ROOT, 'package.json'));
  assert.strictEqual(pkg.name, 'kreftjs');
  assert.strictEqual(pkg.version, '3.0.0');
  assert.strictEqual(pkg.main, 'kreftjs.js');
  assert.deepStrictEqual(pkg.bin, { kreftjs: 'bin/kreftjs.js', kreft: 'bin/kreftjs.js', som: 'bin/kreftjs.js' });
  for (const f of pkg.files) assert.ok(require('node:fs').existsSync(path.join(ROOT, f)), `${f} is listed in "files" and exists`);
});

test('settings: kreftjs.config.json wins; kreft.config.json and som.config.json are read when it is missing', () => {
  const fs = require('node:fs'), os = require('node:os');
  const { readConfig } = require(path.join(ROOT, 'bin/kreftjs-config.js'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kreftjs-config-'));
  fs.writeFileSync(path.join(dir, 'package.json'), '{}');
  fs.writeFileSync(path.join(dir, 'som.config.json'), '{"db":"sqlite:old.db"}');
  assert.strictEqual(readConfig(dir).db, 'sqlite:old.db');
  fs.writeFileSync(path.join(dir, 'kreft.config.json'), '{"db":"sqlite:mid.db"}');
  assert.strictEqual(readConfig(dir).db, 'sqlite:mid.db');
  fs.writeFileSync(path.join(dir, 'kreftjs.config.json'), '{"db":"sqlite:new.db"}');
  assert.strictEqual(readConfig(dir).db, 'sqlite:new.db');
  fs.rmSync(dir, { recursive: true, force: true });
});
