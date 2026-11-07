// Video streaming: byte ranges (206), 416, HEAD, ETag, and the routes' response.stream()
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const { sendFile, parseRange } = require(path.join(__dirname, '..', 'bin', 'backend', 'stream.js'));
const { response } = require(path.join(__dirname, '..', 'bin', 'backend', 'http.js'));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-stream-'));
const file = path.join(dir, 'clip.mp4');
const data = Buffer.from('0123456789abcdefghij'); // 20 bytes
fs.writeFileSync(file, data);

const get = (server, headers = {}, method = 'GET') => new Promise((resolve, reject) => {
  const { port } = server.address();
  const r = http.request({ port, method, headers }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
  });
  r.on('error', reject);
  r.end();
});

test('parseRange', () => {
  assert.deepStrictEqual(parseRange('bytes=0-4', 20), { start: 0, end: 4 });
  assert.deepStrictEqual(parseRange('bytes=5-', 20), { start: 5, end: 19 });
  assert.deepStrictEqual(parseRange('bytes=-5', 20), { start: 15, end: 19 });
  assert.deepStrictEqual(parseRange('bytes=10-999', 20), { start: 10, end: 19 });
  assert.strictEqual(parseRange('bytes=20-30', 20), false);
  assert.strictEqual(parseRange('bytes=9-2', 20), false);
  assert.strictEqual(parseRange(undefined, 20), null);
  assert.strictEqual(parseRange('items=1-2', 20), null);
});

test('sendFile answers whole files, ranges, bad ranges and HEAD', async () => {
  const server = http.createServer((req, res) => sendFile(req, res, file));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const full = await get(server);
    assert.strictEqual(full.status, 200);
    assert.strictEqual(full.headers['content-type'], 'video/mp4');
    assert.strictEqual(full.headers['accept-ranges'], 'bytes');
    assert.strictEqual(full.body, data.toString());

    const part = await get(server, { Range: 'bytes=5-9' });
    assert.strictEqual(part.status, 206);
    assert.strictEqual(part.headers['content-range'], 'bytes 5-9/20');
    assert.strictEqual(part.headers['content-length'], '5');
    assert.strictEqual(part.body, '56789');

    const tail = await get(server, { Range: 'bytes=-3' });
    assert.strictEqual(tail.body, 'hij');

    const bad = await get(server, { Range: 'bytes=50-60' });
    assert.strictEqual(bad.status, 416);
    assert.strictEqual(bad.headers['content-range'], 'bytes */20');

    const head = await get(server, {}, 'HEAD');
    assert.strictEqual(head.status, 200);
    assert.strictEqual(head.headers['content-length'], '20');
    assert.strictEqual(head.body, '');

    const again = await get(server, { 'If-None-Match': full.headers.etag });
    assert.strictEqual(again.status, 304);
  } finally { server.close(); }
});

test('a missing file is a 404, not a crash', async () => {
  const server = http.createServer((req, res) => sendFile(req, res, path.join(dir, 'nope.mp4')));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try { assert.strictEqual((await get(server)).status, 404); } finally { server.close(); }
});

test('response.stream() marks the response for the server', () => {
  const r = response.stream(file, { download: true });
  assert.strictEqual(r.streamFile.file, file);
  assert.strictEqual(r.streamFile.download, true);
});
