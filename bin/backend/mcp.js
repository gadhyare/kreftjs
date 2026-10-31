/*
 * Som.js Native MCP (Model Context Protocol) Engine
 *
 * Implements the open standard Model Context Protocol (v2024-11-05) natively.
 * Gives AI assistants (Claude Desktop, Cursor, Zed, Antigravity, VS Code, OpenAI)
 * instant, rich contextual access to Som.js routes, models, database schemas,
 * live logs, artisan actions, and server health.
 *
 * Far superior to Next.js by providing full-stack introspection out-of-the-box!
 */
const { DB } = require('./query.js');
const http = require('./http.js');

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'somjs-mcp-server';
const SERVER_VERSION = require('../../package.json').version;

class McpServer {
  constructor(options = {}) {
    this.baseDir = options.baseDir || process.cwd();
    this.tools = new Map();
    this.resources = new Map();
    this.prompts = new Map();
    this.registerDefaults();
  }

  registerTool(name, schema, handler) {
    this.tools.set(name, { name, ...schema, handler });
    return this;
  }

  registerResource(uri, name, mimeType, handler) {
    this.resources.set(uri, { uri, name, mimeType, handler });
    return this;
  }

  registerDefaults() {
    // 1. Tool: query_database - allows AI agents to inspect table rows safely
    this.registerTool('query_database', {
      description: 'Run a read-only SELECT SQL query on the application database.',
      inputSchema: {
        type: 'object',
        properties: {
          sql: { type: 'string', description: 'SELECT SQL query string' },
          limit: { type: 'number', description: 'Max rows to fetch (default 20, max 100)' },
        },
        required: ['sql'],
      },
    }, async ({ sql, limit = 20 }) => {
      const cleanSql = String(sql || '').trim();
      if (!/^select\s/i.test(cleanSql)) {
        throw new Error('Only read-only SELECT queries are permitted via MCP.');
      }
      // Block dangerous commands, file access, attachment, and subshell executions
      const DANGEROUS_SQL_RE = /\b(attach|detach|load_extension|writefile|readfile|pg_read|pg_write|sys_eval|xp_cmdshell|into\s+outfile|into\s+dumpfile)\b/i;
      if (DANGEROUS_SQL_RE.test(cleanSql)) {
        throw new Error('Access denied: Dangerous SQL functions or file operations are prohibited in MCP.');
      }
      const cappedLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
      const results = await DB.select(cleanSql.replace(/;+\s*$/, '') + ` LIMIT ${cappedLimit}`);
      
      // Automatically sanitize sensitive credentials before returning to AI assistants
      const SENSITIVE_KEYS = new Set(['password', 'password_hash', 'remember_token', 'token', 'secret', 'two_factor_secret', 'two_factor_recovery_codes', 'api_key']);
      const sanitized = results.map((row) => {
        if (!row || typeof row !== 'object') return row;
        const copy = { ...row };
        for (const k in copy) {
          if (SENSITIVE_KEYS.has(k.toLowerCase()) || /(_hash|_secret|_token)$/i.test(k)) {
            copy[k] = '******** [REDACTED]';
          }
        }
        return copy;
      });

      return {
        content: [{ type: 'text', text: JSON.stringify(sanitized, null, 2) }],
      };
    });

    // 2. Tool: list_routes - list all active HTTP API and web routes
    this.registerTool('list_routes', {
      description: 'List all registered backend HTTP routes, methods, paths, and middlewares.',
      inputSchema: { type: 'object', properties: {} },
    }, async () => {
      const routes = http.createRouter().list().map((r) => ({
        methods: r.methods,
        uri: r.uri,
        name: r.routeName || null,
        action: typeof r.action === 'function' ? '(closure)' : r.action,
        middlewares: r.middlewares,
      }));
      return {
        content: [{ type: 'text', text: JSON.stringify(routes, null, 2) }],
      };
    });

    // 3. Tool: server_health & memory stats
    this.registerTool('server_health', {
      description: 'Get live Som.js server memory usage, garbage collector state, and uptime.',
      inputSchema: { type: 'object', properties: {} },
    }, async () => {
      const gc = require('./gc.js');
      const stats = {
        uptimeSeconds: Math.floor(process.uptime()),
        memory: gc.getMemoryStats(),
        nodeVersion: process.version,
        platform: process.platform,
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }],
      };
    });

    // 4. Resource: som://routes
    this.registerResource('som://routes', 'Active Som.js Routes', 'application/json', async () => {
      const routes = http.createRouter().list();
      return JSON.stringify(routes, null, 2);
    });

    // 5. Resource: som://schema
    this.registerResource('som://schema', 'Database Schema', 'application/json', async () => {
      try {
        const migrator = require('./migrator.js');
        const tables = await migrator.listTables();
        return JSON.stringify(tables, null, 2);
      } catch (err) {
        return JSON.stringify({ error: err.message }, null, 2);
      }
    });
  }

  async handleMessage(reqObj) {
    if (!reqObj || typeof reqObj !== 'object') {
      return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } };
    }
    const { id, method, params } = reqObj;

    try {
      switch (method) {
        case 'initialize':
          return {
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: PROTOCOL_VERSION,
              capabilities: {
                tools: { listChanged: false },
                resources: { subscribe: false, listChanged: false },
                prompts: { listChanged: false },
              },
              serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
            },
          };

        case 'notifications/initialized':
          return null; // Notifications have no return value

        case 'tools/list':
          return {
            jsonrpc: '2.0',
            id,
            result: {
              tools: Array.from(this.tools.values()).map(({ name, description, inputSchema }) => ({
                name,
                description,
                inputSchema,
              })),
            },
          };

        case 'tools/call': {
          const tool = this.tools.get(params && params.name);
          if (!tool) {
            return { jsonrpc: '2.0', id, error: { code: -32601, message: `Tool not found: ${params && params.name}` } };
          }
          const output = await tool.handler(params.arguments || {});
          return { jsonrpc: '2.0', id, result: output };
        }

        case 'resources/list':
          return {
            jsonrpc: '2.0',
            id,
            result: {
              resources: Array.from(this.resources.values()).map(({ uri, name, mimeType }) => ({
                uri,
                name,
                mimeType,
              })),
            },
          };

        case 'resources/read': {
          const res = this.resources.get(params && params.uri);
          if (!res) {
            return { jsonrpc: '2.0', id, error: { code: -32602, message: `Resource not found: ${params && params.uri}` } };
          }
          const content = await res.handler();
          return {
            jsonrpc: '2.0',
            id,
            result: {
              contents: [{ uri: res.uri, mimeType: res.mimeType, text: content }],
            },
          };
        }

        case 'ping':
          return { jsonrpc: '2.0', id, result: {} };

        default:
          return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
      }
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32603, message: err.message || 'Internal error' },
      };
    }
  }

  // HTTP SSE Transport Handler: handles /mcp (JSON-RPC) or /mcp/sse
  async handleHttpRequest(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Validate Origin to prevent Cross-Origin exploitation (DNS rebinding / malicious browser tabs)
    const origin = req.headers.origin;
    const allowedOrigin = process.env.MCP_ALLOWED_ORIGIN;
    let isOriginAllowed = false;
    if (!origin) {
      // Direct agent/CLI calls (e.g., curl, IDE local proxies) have no Origin header
      isOriginAllowed = true;
    } else if (allowedOrigin === '*' || allowedOrigin === origin) {
      isOriginAllowed = true;
    } else {
      try {
        const u = new URL(origin);
        // Allow localhost / 127.0.0.1 / [::1] on any port
        if (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]') {
          isOriginAllowed = true;
        }
      } catch (_) {}
    }

    if (isOriginAllowed && origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    if (origin && !isOriginAllowed) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Forbidden: Origin not allowed' } }));
    }

    // Optional MCP Token authentication (via Bearer token or SOM_MCP_TOKEN / MCP_TOKEN)
    const requiredToken = process.env.MCP_TOKEN || process.env.SOM_MCP_TOKEN;
    if (requiredToken) {
      const authHeader = req.headers.authorization || '';
      const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
      const providedToken = tokenMatch ? tokenMatch[1] : null;
      if (providedToken !== requiredToken) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Unauthorized: Invalid or missing MCP_TOKEN' } }));
      }
    }

    if (req.method === 'GET') {
      // Return server capabilities and documentation
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({
        status: 'online',
        server: SERVER_NAME,
        version: SERVER_VERSION,
        protocol: PROTOCOL_VERSION,
        tools: Array.from(this.tools.keys()),
        resources: Array.from(this.resources.keys()),
      }, null, 2));
    }

    if (req.method === 'POST') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', async () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          const response = await this.handleMessage(body);
          if (response === null) {
            res.writeHead(204);
            return res.end();
          }
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(response));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }));
        }
      });
      return;
    }

    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
  }

  // Stdio Transport: runs Som.js as a stdio MCP server for Claude Desktop / AI IDEs
  listenStdio() {
    process.stdin.setEncoding('utf8');
    let buffer = '';

    process.stdin.on('data', async (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep remainder

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const reqObj = JSON.parse(trimmed);
          const response = await this.handleMessage(reqObj);
          if (response) {
            process.stdout.write(JSON.stringify(response) + '\n');
          }
        } catch (e) {
          process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n');
        }
      }
    });
  }
}

let defaultMcpInstance = null;
function getMcpServer(options) {
  if (!defaultMcpInstance) defaultMcpInstance = new McpServer(options);
  return defaultMcpInstance;
}

module.exports = {
  McpServer,
  getMcpServer,
};
