// On Windows .cmd programs need a shell (Node 20.12+: "spawnSync npm.cmd EINVAL"); other systems start them directly
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { prepare, runSync } = require(path.join(__dirname, '..', 'bin', 'win-spawn.js'));

const onPlatform = (name, fn) => {
  const real = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: name });
  try { return fn(); } finally { Object.defineProperty(process, 'platform', real); }
};

test('Windows: npm.cmd runs through a shell, with arguments quoted', () => {
  const p = onPlatform('win32', () => prepare('npm.cmd', ['install', '--save-dev', 'esbuild@^0.25', 'my pkg'], { stdio: 'inherit' }));
  assert.strictEqual(p.options.shell, true);
  assert.deepStrictEqual(p.args, ['install', '--save-dev', '"esbuild@^0.25"', '"my pkg"']);
  assert.strictEqual(p.options.stdio, 'inherit');
});

test('Windows: a .cmd path with spaces is quoted', () => {
  const p = onPlatform('win32', () => prepare('C:\\My App\\node_modules\\.bin\\electron-builder.cmd', ['--win'], {}));
  assert.strictEqual(p.cmd, '"C:\\My App\\node_modules\\.bin\\electron-builder.cmd"');
  assert.strictEqual(p.options.shell, true);
});

test('Windows: an argument that could start another command is refused', () => {
  const r = onPlatform('win32', () => runSync('npm.cmd', ['install', 'lodash & calc']));
  assert.strictEqual(r.status, 1);
  assert.match(String(r.error.message), /not allowed/);
});

test('other systems: programs start directly, without a shell', () => {
  const p = onPlatform('linux', () => prepare('npm', ['install', 'a b'], {}));
  assert.strictEqual(p.cmd, 'npm');
  assert.deepStrictEqual(p.args, ['install', 'a b']);
  assert.notStrictEqual(p.options.shell, true);
});
