/*
 * MCP client (Streamable HTTP): call tools on a remote MCP server from your app.
 *
 *   const { Mcp } = require('kreftjs/server')
 *   const quran = await Mcp.connect('https://mcp.quran.ai')
 *   const tools = await quran.tools()
 *   const out = await quran.call(tools[0].name, { ... })
 *   await quran.close()
 *
 * Options: { headers: { Authorization: 'Bearer …' }, timeout: 30000, maxBytes: 10485760 }
 *
 * Security: only http(s) URLs; redirects are refused (a redirect could carry your Authorization header to another
 * host); a response over maxBytes is cut off. Never pass a URL a visitor typed: the server would then fetch
 * addresses of your choosing for them (SSRF), including your internal network. Use a fixed or allow-listed URL.
 */
class McpClient {
  constructor(url, options = {}) {
    this.url = url;
    this.headers = options.headers || {};
    this.timeout = options.timeout || 30000;
    this.maxBytes = options.maxBytes || 10 * 1024 * 1024;
    let u;
    try { u = new URL(url); } catch (_) { throw new Error('MCP: not a valid URL: ' + url); }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('MCP: only http:// and https:// URLs are allowed');
    this.sessionId = null;
    this.server = null;
    this._id = 0;
  }

  async _post(body) {
    const headers = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...this.headers,
    };
    if (this.sessionId) headers['mcp-session-id'] = this.sessionId;
    const res = await fetch(this.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout),
      redirect: 'error',
    });
    const sid = res.headers.get('mcp-session-id');
    if (sid) this.sessionId = sid;
    if (!res.ok) throw new Error(`MCP ${this.url} answered ${res.status}: ${(await this._readText(res).catch(() => '')).slice(0, 200)}`);
    if (body.id === undefined) return null; // notification
    const text = await this._readText(res);
    const type = res.headers.get('content-type') || '';
    let msg = null;
    if (type.includes('text/event-stream')) {
      for (const block of text.split(/\r?\n\r?\n/)) {
        const data = block.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
        if (!data) continue;
        try {
          const m = JSON.parse(data);
          if (m.id === body.id) { msg = m; break; }
        } catch { /* skip non-JSON events */ }
      }
    } else {
      msg = JSON.parse(text);
    }
    if (!msg) throw new Error('MCP: no response for ' + body.method);
    if (msg.error) throw new Error(`MCP ${body.method}: ${msg.error.message || JSON.stringify(msg.error)}`);
    return msg.result;
  }

  // reads the body but stops at maxBytes, so a hostile or broken server cannot fill the memory
  async _readText(res) {
    const len = Number(res.headers.get('content-length'));
    if (len > this.maxBytes) throw new Error(`MCP: the response is larger than ${this.maxBytes} bytes`);
    if (!res.body) return '';
    const chunks = [];
    let size = 0;
    for await (const chunk of res.body) {
      size += chunk.length;
      if (size > this.maxBytes) { try { await res.body.cancel(); } catch (_) {} throw new Error(`MCP: the response is larger than ${this.maxBytes} bytes`); }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  rpc(method, params = {}) {
    return this._post({ jsonrpc: '2.0', id: ++this._id, method, params });
  }

  async connect() {
    const result = await this.rpc('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'kreftjs', version: require('../../package.json').version },
    });
    this.server = result;
    await this._post({ jsonrpc: '2.0', method: 'notifications/initialized' });
    return this;
  }

  async tools() {
    const all = [];
    let cursor;
    do {
      const r = await this.rpc('tools/list', cursor ? { cursor } : {});
      all.push(...(r.tools || []));
      cursor = r.nextCursor;
    } while (cursor);
    return all;
  }

  /** Calls a tool. Returns structuredContent when present, else the joined text, else the raw result. */
  async call(name, args = {}) {
    const r = await this.rpc('tools/call', { name, arguments: args });
    if (r.isError) throw new Error(`MCP tool ${name} failed: ${(r.content || []).map((c) => c.text).join(' ')}`);
    if (r.structuredContent) return r.structuredContent;
    const text = (r.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
    if (!text) return r;
    try { return JSON.parse(text); } catch { return text; }
  }

  async resources() { return (await this.rpc('resources/list')).resources || []; }
  async readResource(uri) { return this.rpc('resources/read', { uri }); }

  async close() {
    if (!this.sessionId) return;
    try { await fetch(this.url, { method: 'DELETE', headers: { ...this.headers, 'mcp-session-id': this.sessionId }, signal: AbortSignal.timeout(5000), redirect: 'error' }); } catch { /* server may not support it */ }
    this.sessionId = null;
  }
}

const Mcp = {
  connect: (url, options) => new McpClient(url, options).connect(),
};

module.exports = { McpClient, Mcp };
