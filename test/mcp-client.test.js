const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { Mcp, McpClient } = require('../bin/backend/mcp-client.js');

const listen = (handler) => new Promise((resolve) => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => resolve(s)); });
const reply = (res, id, result) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id, result })}\n\n`); };

test('connects, lists and calls over Streamable HTTP (SSE reply)', async () => {
  const s = await listen((req, res) => {
    let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
      const m = JSON.parse(b);
      if (m.id === undefined) { res.writeHead(202); return res.end(); }
      if (m.method === 'initialize') return reply(res, m.id, { serverInfo: { name: 'fake' } });
      if (m.method === 'tools/list') return reply(res, m.id, { tools: [{ name: 'echo' }] });
      if (m.method === 'tools/call') return reply(res, m.id, { content: [{ type: 'text', text: JSON.stringify({ said: m.params.arguments.q }) }] });
    });
  });
  const c = await Mcp.connect(`http://127.0.0.1:${s.address().port}`);
  assert.strictEqual(c.server.serverInfo.name, 'fake');
  assert.deepStrictEqual((await c.tools()).map((t) => t.name), ['echo']);
  assert.deepStrictEqual(await c.call('echo', { q: 'hi' }), { said: 'hi' });
  s.close();
});

test('refuses non-http URLs, redirects and oversized responses', async () => {
  assert.throws(() => new McpClient('file:///etc/passwd'), /only http/);
  assert.throws(() => new McpClient('not a url'), /valid URL/);

  const redirecting = await listen((req, res) => { res.writeHead(302, { location: 'http://127.0.0.1:1/' }); res.end(); });
  await assert.rejects(Mcp.connect(`http://127.0.0.1:${redirecting.address().port}`));
  redirecting.close();

  const huge = await listen((req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.write('x'.repeat(2000)); res.end('x'.repeat(2000)); });
  await assert.rejects(Mcp.connect(`http://127.0.0.1:${huge.address().port}`, { maxBytes: 1000 }), /larger than/);
  huge.close();
});
