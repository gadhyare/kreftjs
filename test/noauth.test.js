// kreftjs new --no-auth: a project without login, register, profile and users; --auth keeps them
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CLI = path.join(__dirname, '..', 'bin', 'kreftjs.js');
const make = (name, ...flags) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-noauth-'));
  const r = spawnSync(process.execPath, [CLI, 'new', name, '--js', ...flags], { cwd: dir, encoding: 'utf8', input: '' });
  assert.strictEqual(r.status, 0, r.stderr);
  return { dir, app: path.join(dir, name) };
};
const read = (app, rel) => fs.readFileSync(path.join(app, rel), 'utf8');
const has = (app, rel) => fs.existsSync(path.join(app, rel));

test('new --no-auth: no sign-in pages, routes, models or users table', () => {
  const { dir, app } = make('plain', '--no-auth');
  try {
    for (const rel of ['frontend/pages/auth', 'frontend/pages/Profile.kreft', 'frontend/pages/Dashboard.kreft', 'frontend/layouts/guest.kreft',
      'backend/routes/auth.js', 'backend/app/Models/User.js', 'backend/app/Http/Controllers/Auth', 'backend/config/auth.js']) {
      assert.ok(!has(app, rel), rel + ' should be gone');
    }
    assert.ok(!fs.readdirSync(path.join(app, 'backend/database/migrations')).some((f) => /users/.test(f)));
    for (const rel of ['frontend/index.html', 'frontend/routes/web.kreft', 'frontend/layouts/app.kreft', 'frontend/layouts/docs.kreft', 'frontend/pages/Home.kreft', 'backend/routes/api.js']) {
      assert.ok(!/\$store\.auth|auth\.user|require\('\.\/auth'\)|middleware\('auth'/.test(read(app, rel)), rel + ' still mentions auth');
    }
    assert.ok(has(app, 'frontend/pages/Home.kreft') && has(app, 'frontend/docs/Docs.kreft'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('new --no-auth --db sqlite: the Todos example stays and is open', () => {
  const { dir, app } = make('todos', '--no-auth', '--db', 'sqlite');
  try {
    assert.ok(has(app, 'frontend/pages/Todos.kreft'));
    assert.ok(/apiResource\('todos'/.test(read(app, 'backend/routes/api.js')));
    assert.ok(!/middleware\('auth'/.test(read(app, 'backend/routes/api.js')));
    assert.ok(/\/todos/.test(read(app, 'frontend/routes/web.kreft')));
    assert.ok(/TodoSeeder/.test(read(app, 'backend/database/seeders/DatabaseSeeder.js')));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('new (and --auth) keeps the sign-in pages', () => {
  const { dir, app } = make('full', '--auth');
  try {
    for (const rel of ['frontend/pages/auth/Login.kreft', 'backend/routes/auth.js', 'backend/app/Models/User.js']) assert.ok(has(app, rel), rel);
    assert.ok(/\$store\.auth/.test(read(app, 'frontend/pages/Home.kreft')));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
