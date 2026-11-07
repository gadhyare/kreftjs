const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { Shield } = require('../bin/backend/shield.js');

function serve(status = 200) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (Shield.guard(req, res)) return;
      res.statusCode = status; res.end('ok');
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}
const get = (port) => new Promise((resolve, reject) => {
  http.get({ port, host: '127.0.0.1', agent: false }, (r) => { r.resume(); r.on('end', () => resolve(r.statusCode)); }).on('error', reject);
});
const setEnv = (o) => { for (const [k, v] of Object.entries(o)) { if (v == null) delete process.env[k]; else process.env[k] = v; } };
const KEYS = ['SHIELD', 'SHIELD_LOCAL', 'SHIELD_MAX_REQUESTS', 'SHIELD_STRIKES', 'SHIELD_WINDOW_SEC', 'SHIELD_ALLOW', 'SHIELD_ERROR_WEIGHT'];
const clean = () => { setEnv(Object.fromEntries(KEYS.map((k) => [k, null]))); Shield.reset(); };

test('off by default: nothing is limited', async () => {
  clean();
  const s = await serve();
  for (let i = 0; i < 30; i++) assert.strictEqual(await get(s.address().port), 200);
  s.close();
});

test('loopback is exempt unless SHIELD_LOCAL=true', async () => {
  clean(); setEnv({ SHIELD: 'true', SHIELD_MAX_REQUESTS: '5' });
  const s = await serve();
  for (let i = 0; i < 20; i++) assert.strictEqual(await get(s.address().port), 200);
  s.close(); clean();
});

test('flood: 429 over the limit, then a ban after repeated hits; unban lets it back', async () => {
  clean(); setEnv({ SHIELD: 'true', SHIELD_LOCAL: 'true', SHIELD_MAX_REQUESTS: '5', SHIELD_STRIKES: '1', SHIELD_WINDOW_SEC: '60' });
  const s = await serve(); const port = s.address().port;
  const codes = [];
  for (let i = 0; i < 8; i++) codes.push(await get(port));
  assert.deepStrictEqual(codes.slice(0, 5), [200, 200, 200, 200, 200]);
  assert.strictEqual(codes[5], 429);
  assert.strictEqual(Shield.bans().length, 1);
  assert.strictEqual(Shield.bans()[0].ip, '127.0.0.1');
  assert.strictEqual(await get(port), 429, 'still banned');
  assert.ok(Shield.unban('127.0.0.1'));
  assert.strictEqual(await get(port), 200);
  s.close(); clean();
});

test('probing weighs more: 404s trip the limit early', async () => {
  clean(); setEnv({ SHIELD: 'true', SHIELD_LOCAL: 'true', SHIELD_MAX_REQUESTS: '10', SHIELD_ERROR_WEIGHT: '5', SHIELD_STRIKES: '99', SHIELD_WINDOW_SEC: '60' });
  const s = await serve(404); const port = s.address().port;
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push(await get(port));
  assert.deepStrictEqual(codes, [404, 404, 429, 429]); // 1st + 5 = 6, 2nd + 5 = 11 > 10 on the 3rd
  s.close(); clean();
});

test('SHIELD_ALLOW exempts an address', async () => {
  clean(); setEnv({ SHIELD: 'true', SHIELD_LOCAL: 'true', SHIELD_ALLOW: '127.0.0.1', SHIELD_MAX_REQUESTS: '5' });
  const s = await serve();
  for (let i = 0; i < 20; i++) assert.strictEqual(await get(s.address().port), 200);
  s.close(); clean();
});

test('IPv6 visitors are counted by /64, so rotating addresses does not dodge the limit', () => {
  const { _keyOf } = require('../bin/backend/shield.js');
  assert.strictEqual(_keyOf('2001:db8:1:2:aaaa:bbbb:cccc:dddd'), '2001:db8:1:2::/64');
  assert.strictEqual(_keyOf('2001:db8:1:2::1'), '2001:db8:1:2::/64');
  assert.strictEqual(_keyOf('2001:db8:1:2:ffff::9'), '2001:db8:1:2::/64');
  assert.strictEqual(_keyOf('2001:db8::5'), '2001:db8:0:0::/64');
  assert.strictEqual(_keyOf('203.0.113.9'), '203.0.113.9');
  assert.strictEqual(_keyOf('not-an-ip:'), 'not-an-ip:');
});

test('connection cap: sockets over SHIELD_MAX_CONNECTIONS are closed (slowloris)', async () => {
  const net = require('node:net');
  clean(); setEnv({ SHIELD: 'true', SHIELD_LOCAL: 'true', SHIELD_MAX_CONNECTIONS: '3' });
  const server = http.createServer((req, res) => res.end('ok'));
  Shield.watch(server);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const open = () => new Promise((resolve) => { const s = net.connect(port, '127.0.0.1'); s.on('connect', () => resolve(s)); s.on('error', () => {}); });
  const socks = [];
  for (let i = 0; i < 5; i++) socks.push(await open());
  await new Promise((r) => setTimeout(r, 100));
  const closed = socks.filter((s) => s.destroyed || s.readyState !== 'open').length;
  assert.strictEqual(closed, 2, 'two sockets over the cap of 3 are dropped');
  socks.forEach((s) => s.destroy());
  server.close(); clean();
});
