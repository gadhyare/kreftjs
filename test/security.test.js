// Regression tests for the MCP endpoint's authentication and the HTML cleaner.   Run: npm test
const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ENV_KEYS = ['NODE_ENV', 'APP_ENV', 'MCP_TOKEN', 'SOM_MCP_TOKEN', 'APP_KEY', 'MCP_ALLOWED_ORIGIN'];

function request({ remote = '127.0.0.1', headers = {} } = {}) {
  const req = new EventEmitter();
  req.method = 'POST';
  req.url = '/mcp';
  req.headers = { host: 'localhost:8000', 'content-type': 'application/json', ...headers };
  req.socket = { remoteAddress: remote };
  process.nextTick(() => { req.emit('data', Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }))); req.emit('end'); });
  return req;
}

// runs handleHttpRequest with the given environment and returns the HTTP status
async function mcpStatus(env, opts) {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, env);
  try {
    const { getMcpServer } = require(path.join(ROOT, 'bin/backend/mcp.js'));
    const res = { status: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, writeHead(s) { this.status = s; }, write() {}, end() { this.finished = true; } };
    await getMcpServer({ baseDir: ROOT }).handleHttpRequest(request(opts), res);
    if (!res.finished) await new Promise((ok) => setTimeout(ok, 100));
    return res.status;
  } finally {
    for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}

test('MCP: a remote address without a token is refused', async () => {
  assert.strictEqual(await mcpStatus({}, { remote: '203.0.113.7', headers: { host: 'example.com' } }), 403);
  assert.strictEqual(await mcpStatus({}, { remote: '203.0.113.7' }), 403);
});

test('MCP: a loopback client behind a proxy or with a foreign Host is refused', async () => {
  assert.strictEqual(await mcpStatus({}, { headers: { 'x-forwarded-for': '203.0.113.7' } }), 403);
  assert.strictEqual(await mcpStatus({}, { headers: { host: 'evil.example' } }), 403);
});

test('MCP: a direct local client works in development without a token', async () => {
  assert.strictEqual(await mcpStatus({}, {}), 200);
});

test('MCP: production without MCP_TOKEN is off, whichever variable says production', async () => {
  assert.strictEqual(await mcpStatus({ NODE_ENV: 'production' }, {}), 403);
  assert.strictEqual(await mcpStatus({ APP_ENV: 'production' }, { remote: '203.0.113.7' }), 403);
});

test('MCP: the APP_KEY is never accepted as the token', async () => {
  const env = { NODE_ENV: 'production', APP_KEY: 'base64:MASTERKEY' };
  assert.strictEqual(await mcpStatus(env, { headers: { authorization: 'Bearer base64:MASTERKEY' } }), 403);
});

test('MCP: MCP_TOKEN must be sent as a Bearer token', async () => {
  const env = { NODE_ENV: 'production', MCP_TOKEN: 's3cret-token' };
  assert.strictEqual(await mcpStatus(env, { remote: '203.0.113.7' }), 401);
  assert.strictEqual(await mcpStatus(env, { remote: '203.0.113.7', headers: { authorization: 'Bearer wrong' } }), 401);
  assert.strictEqual(await mcpStatus(env, { remote: '203.0.113.7', headers: { authorization: 'Bearer s3cret-token' } }), 200);
});

// no document here, so this is the text-based cleaner; the DOM-based one runs in the browser
test('cleanHtml: event handlers are removed, including ones glued to a closing quote', () => {
  const { cleanHtml } = require(path.join(ROOT, 'som.js'));
  const attack = [
    '<img src="x"onerror=alert(1)>', "<img src='x'onerror=alert(1)>", '<a href="x"onclick=alert(1)>c</a>',
    '<img src=x/onerror=alert(1)>', '<img src=x onerror=alert(1)>', '<img src=x ONERROR = alert(1)>',
  ];
  for (const html of attack) assert.doesNotMatch(cleanHtml(html), /on(error|click)\s*=/i, html);
});

test('cleanHtml: dangerous elements and addresses are removed', () => {
  const { cleanHtml } = require(path.join(ROOT, 'som.js'));
  assert.strictEqual(cleanHtml('<svg><script>alert(1)</script></svg>'), '');
  assert.strictEqual(cleanHtml('<iframe srcdoc="<b>x</b>"></iframe>'), '');
  assert.match(cleanHtml('<a href="jav&#x61;script:alert(1)">x</a>'), /href="#"/);
  assert.match(cleanHtml('<a href="data:text/html;base64,AAAA">x</a>'), /href="#"/);
});

test('cleanHtml: ordinary markup is kept', () => {
  const { cleanHtml } = require(path.join(ROOT, 'som.js'));
  const ok = '<p>Hello <b>world</b> <a href="https://example.com/">link</a></p>';
  assert.strictEqual(cleanHtml(ok), ok);
});

/* ------------------------------------------------------------------ medium findings */
async function mcpQuery(sql) {
  const { getMcpServer } = require(path.join(ROOT, 'bin/backend/mcp.js'));
  const r = await getMcpServer({ baseDir: ROOT }).handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'query_database', arguments: { sql } } });
  return r;
}

test('MCP query_database: names, tables and tricks that reach credentials are refused, rows are masked', async () => {
  const { connect } = require(path.join(ROOT, 'bin/db.js'));
  const { setConnection } = require(path.join(ROOT, 'bin/backend/query.js'));
  const db = await connect('sqlite::memory:');
  setConnection(db);
  await db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY, name TEXT, password TEXT, bio TEXT)");
  await db.run('INSERT INTO users(name,password,bio) VALUES(?,?,?)', ['ann', '$scrypt$N=1,r=1,p=1$AAAA$BBBB', 'my hash is $scrypt$N=1,r=1,p=1$CCCC$DDDD ok']);
  const refused = async (sql) => { const r = await mcpQuery(sql); assert.match(JSON.stringify(r), /Access denied|Only read-only/, sql + ' -> ' + JSON.stringify(r).slice(0, 200)); };
  await refused('SELECT password AS p FROM users');
  await refused('SELECT json_object("a", password) FROM users');
  await refused('SELECT * FROM personal_access_tokens');
  await refused("SELECT * FROM users; DROP TABLE users");
  await refused("SELECT load_file('/etc/passwd')");
  await refused("SELECT pg_read_file('/etc/passwd')");
  await refused('SELECT * INTO copy_of_users FROM users');
  await refused('SELECT randomblob(1000000000)');

  const ok = JSON.stringify(await mcpQuery('SELECT * FROM users'));
  assert.doesNotMatch(ok, /BBBB|DDDD/, 'hashes must be masked by column and by shape');
  assert.match(ok, /REDACTED/);
  assert.match(ok, /ann/);
  await db.exec('DROP TABLE users');
});

test('db-api: a hidden column can not be used to sort', async () => {
  const { connect } = require(path.join(ROOT, 'bin/db.js'));
  const { createDbApi } = require(path.join(ROOT, 'bin/db-api.js'));
  const db = await connect('sqlite::memory:');
  await db.exec('CREATE TABLE users(id INTEGER PRIMARY KEY, name TEXT, secret TEXT)');
  for (const [n, s] of [['a', 'm'], ['b', 'z'], ['c', 'a']]) await db.run('INSERT INTO users(name,secret) VALUES(?,?)', [n, s]);
  const api = createDbApi(db, { tables: { users: { hidden: ['secret'] } }, log: { error() {} } });
  const get = (url) => new Promise((ok) => api({ url, method: 'GET', on() {} }, { writeHead() {}, end: (b) => ok(JSON.parse(b)) }, url.split('?')[0]));
  const ids = async (q) => (await get('/api/users' + q)).map((r) => r.id).join(',');
  assert.strictEqual(await ids('?_sort=secret'), await ids(''));
  assert.strictEqual(await ids('?_sort=-secret'), await ids(''));
  assert.strictEqual(await ids('?_sort=-name'), '3,2,1'); // a visible column still sorts
});

test('Request.ip(): X-Forwarded-For is read from the right, so the visitor can not choose it', () => {
  const { Request } = require(path.join(ROOT, 'bin/backend/http.js'));
  const ip = (direct, xff, env) => {
    const saved = { P: process.env.TRUSTED_PROXIES, H: process.env.TRUSTED_PROXY_HOPS };
    process.env.TRUSTED_PROXIES = env.proxies || ''; process.env.TRUSTED_PROXY_HOPS = env.hops || '';
    try {
      const r = Object.create(Request.prototype, { raw: { value: { socket: { remoteAddress: direct }, headers: xff ? { 'x-forwarded-for': xff } : {} } } });
      return r.ip();
    } finally { for (const [k, v] of [['TRUSTED_PROXIES', saved.P], ['TRUSTED_PROXY_HOPS', saved.H]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
  };
  assert.strictEqual(ip('10.0.0.1', '1.2.3.4, 198.51.100.9', { proxies: '10.0.0.1' }), '198.51.100.9');
  assert.strictEqual(ip('10.0.0.1', '198.51.100.9, 10.0.0.2', { proxies: '10.0.0.1,10.0.0.2' }), '198.51.100.9');
  assert.strictEqual(ip('203.0.113.5', '1.2.3.4', { proxies: '10.0.0.1' }), '203.0.113.5'); // not from a proxy: header ignored
  assert.strictEqual(ip('10.0.0.1', '1.2.3.4, 198.51.100.9', { proxies: '*' }), '198.51.100.9');
  assert.strictEqual(ip('10.0.0.1', '9.9.9.9, 198.51.100.9, 172.16.0.3', { proxies: '*', hops: '2' }), '198.51.100.9');
  assert.strictEqual(ip('10.0.0.1', 'not-an-ip', { proxies: '*' }), '10.0.0.1');
});

test('APP_KEY: production refuses a missing or short key', () => {
  const { appKey } = require(path.join(ROOT, 'bin/backend/support.js'));
  const saved = { E: process.env.NODE_ENV, A: process.env.APP_ENV, K: process.env.APP_KEY };
  try {
    delete process.env.APP_ENV; process.env.NODE_ENV = 'production';
    delete process.env.APP_KEY;
    assert.throws(() => appKey(), /APP_KEY is not set/);
    process.env.APP_KEY = 'short';
    assert.throws(() => appKey(), /shorter than 16/);
    process.env.APP_KEY = 'base64:' + Buffer.alloc(32, 7).toString('base64');
    assert.strictEqual(appKey().length, 32);
    delete process.env.NODE_ENV; process.env.APP_ENV = 'production'; delete process.env.APP_KEY;
    assert.throws(() => appKey(), /APP_KEY is not set/);
  } finally { for (const [k, v] of [['NODE_ENV', saved.E], ['APP_ENV', saved.A], ['APP_KEY', saved.K]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
});

/* ------------------------------------------------------------------ the project template's auth */
// loads the template's own middleware and models against an in-memory database with its real migrations
async function templateAuth() {
  const Module = require('node:module');
  const origResolve = Module._resolveFilename;
  Module._resolveFilename = function (request, ...rest) {
    if (request === 'somjs/server') return path.join(ROOT, 'server.js');
    return origResolve.call(this, request, ...rest);
  };
  const { connect } = require(path.join(ROOT, 'bin/db.js'));
  const { setConnection } = require(path.join(ROOT, 'bin/backend/query.js'));
  const migrator = require(path.join(ROOT, 'bin/backend/migrator.js'));
  const db = await connect('sqlite::memory:');
  setConnection(db);
  await migrator.migrate(db, path.join(ROOT, 'templates/app/backend/database/migrations'));
  const app = path.join(ROOT, 'templates/app/backend/app');
  return { db, app, Authenticate: require(path.join(app, 'Http/Middleware/Authenticate.js')), User: require(path.join(app, 'Models/User.js')) };
}

test('Authenticate: an API token can only use the methods its abilities allow, on every route', async () => {
  const { Authenticate, User } = await templateAuth();
  const user = await User.create({ name: 'Ada', email: 'ada@example.com', password: 'x' });
  const readOnly = (await user.createToken('read only', { type: 'api', abilities: ['read'] })).plainTextToken;
  const full = (await user.createToken('full', { type: 'api', abilities: ['*'] })).plainTextToken;
  const call = async (method, bearer) => {
    const req = { method, header: () => null, cookie: () => null, bearerToken: () => bearer, ip: () => '127.0.0.1' };
    try { await new Authenticate().handle(req, async () => ({ withHeaders() {}, cookie() {} })); return 200; } catch (e) { return e.status; }
  };
  assert.strictEqual(await call('GET', readOnly), 200);
  assert.strictEqual(await call('DELETE', readOnly), 403);
  assert.strictEqual(await call('PATCH', readOnly), 403);
  assert.strictEqual(await call('POST', readOnly), 403);
  assert.strictEqual(await call('DELETE', full), 200);
});

test('server cleanHtml: a tag it can not read is turned into text, not passed through', () => {
  const { cleanHtml } = require(path.join(ROOT, 'bin/backend/html.js'));
  for (const html of ['<img src="x"onerror=alert(1)>', '<a href="x"onclick=alert(1)>c</a>', '<img src=x onerror=alert(1)//', '<img src="x"/onerror=alert(1)>']) {
    assert.doesNotMatch(cleanHtml(html), /<[^>]*\bon\w+\s*=/i, html);
  }
  // an attribute VALUE that looks like a handler is only text inside quotes
  assert.strictEqual(cleanHtml('<img src=x/onerror=alert(1)>'), '<img src="x/onerror=alert(1)" />');
  // normal markup and plain text keep working
  assert.strictEqual(cleanHtml('<ul><li>a</li></ul>'), '<ul><li>a</li></ul>');
  assert.strictEqual(cleanHtml('<a href="https://e.com/" target="_blank">l</a>'), '<a href="https://e.com/" target="_blank" rel="noopener noreferrer">l</a>');
  assert.strictEqual(cleanHtml('1 < 2'), '1 &lt; 2');
});
