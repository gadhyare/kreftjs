// A generated app's cookie login: the XSRF cookie is derived from the login (a planted cookie fails), and the demo
// seeder (an admin with the password "password") refuses to run in production.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const CLI = path.join(__dirname, '..', 'bin', 'kreftjs.js');
const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('cookie login: planted XSRF cookie is refused, the derived one works; seeder refuses production', { timeout: 90000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-csrf-'));
  let server;
  try {
    const made = spawnSync(process.execPath, [CLI, 'new', 'app', '--js', '--auth', '--db', 'sqlite'], { cwd: dir, encoding: 'utf8', input: '' });
    assert.strictEqual(made.status, 0, made.stderr);
    const app = path.join(dir, 'app');

    const seed = spawnSync(process.execPath, [CLI, 'db:seed'], { cwd: app, encoding: 'utf8', env: { ...process.env, APP_ENV: 'production', NODE_ENV: 'production', APP_KEY: 'base64:' + Buffer.alloc(32, 7).toString('base64') } });
    assert.match(seed.stdout + seed.stderr, /refuses to run in production/);

    const port = await freePort();
    server = spawn(process.execPath, [CLI, 'dev', '--port', String(port), '--seed'], { cwd: app, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + '/api/user'); break; } catch (_) { await sleep(200); } }

    const jar = {};
    const keep = (res) => { for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); } };
    const cookie = (extra = {}) => Object.entries({ ...jar, ...extra }).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ');

    const login = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'test@example.com', password: 'password' }) });
    assert.strictEqual(login.status, 200);
    keep(login);
    assert.ok(jar.kreft_session && jar['XSRF-TOKEN'], 'session and XSRF cookies are set');

    // an attacker who can only plant a cookie: header equals the planted cookie, but is not derived from the session
    const forged = 'planted-by-an-attacker-0123456789abcdef';
    const bad = await fetch(base + '/api/logout', { method: 'POST', headers: { cookie: cookie({ 'XSRF-TOKEN': forged }), 'x-xsrf-token': forged } });
    assert.strictEqual(bad.status, 419);
    // no header at all
    assert.strictEqual((await fetch(base + '/api/logout', { method: 'POST', headers: { cookie: cookie() } })).status, 419);
    // still signed in after the refused attempts
    assert.strictEqual((await fetch(base + '/api/user', { headers: { cookie: cookie() } })).status, 200);
    // the real token (what the page reads from its own cookie) works
    const ok = await fetch(base + '/api/logout', { method: 'POST', headers: { cookie: cookie(), 'x-xsrf-token': jar['XSRF-TOKEN'] } });
    assert.strictEqual(ok.status, 204);
  } finally {
    if (server) server.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('login: a form another web site submits is refused, the same site and JSON clients still work', { timeout: 90000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-loginform-'));
  let server;
  try {
    const made = spawnSync(process.execPath, [CLI, 'new', 'app', '--js', '--auth', '--db', 'sqlite'], { cwd: dir, encoding: 'utf8', input: '' });
    assert.strictEqual(made.status, 0, made.stderr);
    const app = path.join(dir, 'app');
    const port = await freePort();
    server = spawn(process.execPath, [CLI, 'dev', '--port', String(port), '--seed'], { cwd: app, stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 100; i++) { try { await fetch(base + '/api/user'); break; } catch (_) { await sleep(200); } }
    const form = (headers) => fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers }, body: 'email=test%40example.com&password=password' });
    const evil = await form({ origin: 'https://evil.example' });
    assert.strictEqual(evil.status, 403, 'a form from another site');
    assert.deepStrictEqual(evil.headers.getSetCookie(), [], 'no session is created for it');
    // the same host on another port is another program
    const otherPort = await form({ origin: `http://127.0.0.1:${port + 1}` });
    assert.strictEqual(otherPort.status, 403, 'the same host on another port is another program');
    const alias = await form({ origin: `http://localhost:${port}` });
    assert.strictEqual(alias.status, 200, 'localhost and 127.0.0.1 on the same port are one server');
    const same = await form({ origin: base });
    assert.strictEqual(same.status, 200, 'the same site');
    const plain = await form({});
    assert.strictEqual(plain.status, 200, 'no Origin: a script or curl');
    const json = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://app.example' }, body: JSON.stringify({ email: 'test@example.com', password: 'password' }) });
    assert.strictEqual(json.status, 200, 'JSON clients of another origin are for CORS to decide, as before');
  } finally {
    if (server) server.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
