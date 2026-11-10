// Older phones: the files a phone downloads must be readable by an older browser engine (no ?. or ??, nothing newer than Chrome 64 syntax),
// the helpers old engines lack get small stand-ins, and a failure to start says so on the screen.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
const PHONE_FILES = ['kreftjs.js', 'templates/app/frontend/kreftjs.js', 'templates/mobile/kreftjs-native.js', 'tools/dev-client.js', 'tools/devtools.js'];
const OPTIONAL_CHAIN = /[A-Za-z_)\]]\?\.[A-Za-z_(\[]/;
const NULLISH = /[^?\\]\?\?[^?=]/;

test('the files a phone downloads use no optional chaining and no ?? (Chrome 80 syntax)', () => {
  for (const f of PHONE_FILES) {
    const src = read(f);
    assert.ok(!OPTIONAL_CHAIN.test(src), f + ' uses ?.');
    assert.ok(!NULLISH.test(src), f + ' uses ??');
  }
  assert.strictEqual(read('kreftjs.js'), read('templates/app/frontend/kreftjs.js'), 'the template copy of the runtime is the same file');
});

function esbuild() {
  try { return require(require.resolve('esbuild', { paths: [root, process.cwd(), ...(process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean)] })); } catch (_) { return null; }
}

test('esbuild finds nothing in those files, or in a real build, that Chrome 64 cannot read', (t) => {
  const esb = esbuild();
  if (!esb) return t.skip('esbuild is not installed');
  const needsLowering = (code) => esb.transformSync(code, { target: 'chrome64', logLevel: 'silent' }).code !== esb.transformSync(code, { target: 'esnext', logLevel: 'silent' }).code;
  for (const f of PHONE_FILES) assert.ok(!needsLowering(read(f)), f + ' needs syntax newer than Chrome 64');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-old-'));
  const run = (args, cwd) => spawnSync(process.execPath, [path.join(root, 'bin', 'kreftjs.js'), ...args], { cwd, encoding: 'utf8' });
  assert.strictEqual(run(['new', 'a1', '--js', '--mobile', '--auth'], dir).status, 0);
  const app = path.join(dir, 'a1');
  const b = run(['build', '--no-minify'], app);
  assert.strictEqual(b.status, 0, b.stdout + b.stderr);
  for (const f of ['app.js', 'main.js']) assert.ok(!needsLowering(fs.readFileSync(path.join(app, 'dist', f), 'utf8')), 'the built ' + f + ' needs syntax newer than Chrome 64');
});

test('the minifier targets ES2018, so a production build cannot bring newer syntax back', () => {
  assert.match(read('bin/build.js'), /target: 'es2018'/);
  assert.match(read('bin/deps.js'), /target: 'es2018'/);
  assert.doesNotMatch(read('bin/build.js') + read('bin/deps.js'), /target: 'es2020'/);
});

test('on an engine without Object.fromEntries, flat, flatMap and matchAll the runtime brings its own', () => {
  const ctx = vm.createContext({ console });
  vm.runInContext('delete Object.fromEntries; delete Array.prototype.flat; delete Array.prototype.flatMap; delete String.prototype.matchAll;', ctx);
  assert.strictEqual(vm.runInContext("typeof Object.fromEntries + typeof [].flat + typeof [].flatMap + typeof ''.matchAll", ctx), 'undefinedundefinedundefinedundefined', 'the stand-in engine really lacks them');
  vm.runInContext(read('kreftjs.js'), ctx);
  const out = JSON.parse(vm.runInContext(`JSON.stringify({
    entries: Object.fromEntries([['a', 1], ['b', 2]]),
    flat: [1, [2, [3, [4]]]].flat(),
    deep: [1, [2, [3, [4]]]].flat(Infinity),
    flatMap: [1, 2].flatMap((x) => [x, x * 10]),
    all: Array.from('a1b22'.matchAll(/\\d+/g)).map((m) => m[0] + '@' + m.index),
    plainRegex: Array.from('x-y-z'.matchAll(/-/)).length,
    enumerable: Object.keys(Array.prototype).length + Object.keys(String.prototype).length
  })`, ctx));
  assert.deepStrictEqual(out.entries, { a: 1, b: 2 });
  assert.deepStrictEqual(out.flat, [1, 2, [3, [4]]]);
  assert.deepStrictEqual(out.deep, [1, 2, 3, 4]);
  assert.deepStrictEqual(out.flatMap, [1, 10, 2, 20]);
  assert.deepStrictEqual(out.all, ['1@1', '22@3']);
  assert.strictEqual(out.plainRegex, 2, 'a non-global regex is made global, as the real matchAll does');
  assert.strictEqual(out.enumerable, 0, 'the stand-ins do not show up in for...in loops');
  // the generated code for `class="a {x}"` no longer uses ??, and still gives the same text
  const code = vm.runInContext("Kreftjs.__internal.interpToExpr('a {x}')", ctx);
  assert.ok(!NULLISH.test(code), 'generated code: ' + code);
  const run = (x) => vm.runInContext('(function (x) { return ' + code + '; })', ctx)(x);
  assert.deepStrictEqual([run('b'), run(null), run(undefined), run(0), run(false)], ['a b', 'a ', 'a ', 'a 0', 'a false']);
});

test('the error box on the dev server keeps every error, the first one first, with where it came from and what to do', () => {
  const src = read('tools/dev-client.js');
  assert.match(src, /const entries = \[\]/);
  assert.match(src, /The first one is usually the cause/);
  assert.match(src, /withWhere\(errorText\(e\.error \|\| e\.message\), e\)/);
  assert.match(src, /Android System WebView/);
  assert.match(src, /Kreftjs is not defined/);
});

test('when kreftjs.js never starts, the native script says so on the screen', () => {
  const added = [];
  const node = () => ({ setAttribute(k, v) { this[k] = v; }, style: {}, appendChild(c) { added.push(c); } });
  const ctx = vm.createContext({ console: { warn() {} }, document: { body: node(), createElement: node, addEventListener() {} }, window: {}, setTimeout });
  ctx.window = ctx;
  vm.runInContext(read('templates/mobile/kreftjs-native.js'), ctx);
  assert.strictEqual(added.length, 1, 'one message');
  assert.match(added[0].textContent, /could not start/);
  assert.match(added[0].textContent, /Android System WebView/);
  assert.strictEqual(added[0].role, 'alert');
});
