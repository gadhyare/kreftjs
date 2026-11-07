const test = require('node:test');
const assert = require('node:assert');
const { connect } = require('../bin/db.js');
const { createDbApi } = require('../bin/db-api.js');

test('db api: credential columns are hidden (and not filterable), credential tables are not opened', async () => {
  const db = await connect('sqlite::memory:');
  await db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY, email TEXT, password TEXT, api_token TEXT, name TEXT); INSERT INTO users(email,password,api_token,name) VALUES('a@b.c','$scrypt$x','tok123','Ann'); CREATE TABLE sessions(id TEXT, payload TEXT);");
  const api = createDbApi(db, {});
  const run = async (url) => {
    const req = { method: 'GET', url, headers: {}, socket: {} };
    const res = { writeHead(s) { this.status = s; }, setHeader() {}, end(b) { this.body = b; } };
    await api(req, res, url.split('?')[0]);
    return res;
  };
  const users = await run('/api/users');
  assert.strictEqual(users.status, 200);
  assert.deepStrictEqual(JSON.parse(users.body), [{ id: 1, email: 'a@b.c', name: 'Ann' }]);
  // filtering by a hidden column would let a visitor guess its value one character at a time: it is ignored
  const probe = JSON.parse((await run('/api/users?password=nope')).body);
  assert.strictEqual(probe.length, 1);
  assert.strictEqual((await run('/api/sessions')).status, 404);
});
