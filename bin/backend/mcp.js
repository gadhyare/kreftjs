/*
 * Kreft Native MCP (Model Context Protocol) Engine
 *
 * Implements the open standard Model Context Protocol (v2024-11-05) natively.
 * Gives AI assistants (Claude Desktop, Cursor, Zed, Antigravity, VS Code, OpenAI)
 * instant, rich contextual access to Kreft routes, models, database schemas,
 * live logs, artisan actions, and server health.
 *
 * Far superior to Next.js by providing full-stack introspection out-of-the-box!
 */
const { DB } = require('./query.js');
const http = require('./http.js');

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'kreft-mcp-server';
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
      const cleanSql = String(sql || '').trim().replace(/;+\s*$/, '');
      if (!/^select\s/i.test(cleanSql)) {
        throw new Error('Only read-only SELECT queries are permitted via MCP.');
      }
      // Reject multi-statement queries and SQL comment injections
      if (cleanSql.includes(';') || /--|\/\*/.test(cleanSql)) {
        throw new Error('Access denied: Multiple SQL statements or SQL comments are prohibited in MCP.');
      }
      // What is checked below is the SQL without its 'string literals', so a value can't hide or fake a name
      const code = cleanSql.replace(/'(?:[^']|'')*'/g, "''");
      // SQLite reads 'name' in single quotes as a table or column name where a name is expected (users.'password', FROM 'sessions').
      // Such a name is judged like any other: it is looked at as it is written, not removed with the string literals.
      const NAME_SPOTS = /(?:\.\s*|\b(?:from|join|using|table|into|update|as)[\s(]*)'((?:[^']|'')*)'/gi;
      const asNames = [...cleanSql.matchAll(NAME_SPOTS)].map((m) => m[1]);
      // a name in a FROM list after a comma (FROM users, 'sessions'): a quoted text before any WHERE / GROUP / ORDER is a name
      for (const m of cleanSql.matchAll(/,\s*'((?:[^']|'')*)'/g)) { if (/\bfrom\b/i.test(cleanSql.slice(0, m.index)) && !/\b(where|group|order|having|limit|union)\b/i.test(cleanSql.slice(0, m.index))) asNames.push(m[1]); }
      const quotedNames = asNames.join(' ');
      // Mutations, files, sleeping, locks, and statements that make something new (SELECT … INTO)
      const DANGEROUS_SQL_RE = /\b(insert|update|delete|drop|alter|create|truncate|replace|grant|revoke|pragma|attach|detach|vacuum|reindex|analyze|copy|call|exec|execute|into|set_config|set|load_file|load_extension|writefile|readfile|edit|fts3_tokenizer|lo_\w+|dblink\w*|pg_(?:read|write|ls|sleep|terminate|cancel|reload|stat)\w*|sys_eval|xp_cmdshell|sleep|benchmark|randomblob|zeroblob|generate_series|for\s+(?:update|share|no\s+key\s+update|key\s+share)|lock|outfile|dumpfile)\b/i;
      if (DANGEROUS_SQL_RE.test(code)) {
        throw new Error('Access denied: Dangerous SQL functions, mutations, or file operations are prohibited in MCP.');
      }
      // Credentials stay out of reach whatever they are renamed to (SELECT password AS p …)
      const SECRET_NAME_RE = /(password|passwd|secret|token|api_?key|private_?key|recovery_?code|credential|salt|hash|authentication)/i;
      const SECRET_TABLE_RE = /\b(personal_access_tokens|password_reset_tokens|password_resets|sessions|failed_jobs|jobs)\b/i;
      if (SECRET_TABLE_RE.test(code) || SECRET_TABLE_RE.test(quotedNames)) {
        throw new Error('Access denied: this table holds credentials or queued payloads and is not readable via MCP.');
      }
      // The database server's own accounts, sessions and settings are not the app's data (mysql.user holds account hashes,
      // processlist other people's SQL): the app's tables and information_schema.tables / columns are what MCP is for
      const SERVER_INTERNALS_RE = /\b(?:mysql|performance_schema|sys)["`]?\s*\.|\binformation_schema["`]?\s*\.\s*["`]?(?:processlist|user_privileges|schema_privileges|table_privileges|column_privileges|user_attributes|innodb_\w+)|\b(?:pg_authid|pg_shadow|pg_roles|pg_auth_members|pg_user_mappings?|pg_stat_activity|pg_stat_ssl|pg_hba_file_rules|pg_file_settings|pg_settings)\b/i;
      if (SERVER_INTERNALS_RE.test(code) || SERVER_INTERNALS_RE.test(quotedNames)) {
        throw new Error('Access denied: the database server\'s own accounts, sessions and settings are not readable via MCP.');
      }
      if (SECRET_NAME_RE.test(code) || SECRET_NAME_RE.test(quotedNames)) {
        throw new Error('Access denied: columns holding credentials cannot be named in MCP queries (SELECT * hides them).');
      }
      // Whole rows packed into one value (to_json(users), row(…)) would carry hidden columns along
      if (/\b(to_jsonb?|row_to_json|array_to_json|json_agg|jsonb_agg|json_build\w*|jsonb_build\w*|json_object\w*|jsonb_object\w*|json_group\w*|json_array\w*|row|xmlelement|xmlforest|query_to_xml|table_to_xml)\s*\(/i.test(code)) {
        throw new Error('Access denied: building JSON or XML from whole rows is not allowed in MCP.');
      }
      const cappedLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));

      // Run it inside a transaction that is always undone, with a time limit: even a statement the checks
      // above did not foresee can't leave a change behind or keep the database busy for long.
      const UNDO = new Error('undo');
      const limitMs = Math.max(500, Number(process.env.MCP_QUERY_TIMEOUT_MS) || 5000);
      let results = [];
      let timer;
      const guarded = DB.transaction(async () => {
        // SQLite: the engine refuses the credential tables and reads the credential columns as NULL, whatever the SQL looks like.
        // (The guard is on only while the statement runs, in this same turn: nothing else can use the connection meanwhile.)
        const conn = require('./query.js').getConnection();
        const release = typeof conn.guardReads === 'function' ? conn.guardReads((table, column) => {
          if (SECRET_TABLE_RE.test(table) || /^(?:sqlite_master|sqlite_schema|sqlite_temp_master)$/i.test(table) && /sql/i.test(column)) return 'deny';
          if (column && SECRET_NAME_RE.test(column)) return 'null';
          return 'ok';
        }) : null;
        // Reading the text of a query is not enough to keep credentials out (SQL can be written in too many ways). Without a
        // protection that the database engine itself enforces, this tool is off, and the other MCP tools stay available.
        // For MySQL / PostgreSQL: connect MCP with a database user that can read only the tables it should see (or views), then
        // set MCP_DATABASE_RESTRICTED=true to say so.
        if (!release && process.env.MCP_DATABASE_RESTRICTED !== 'true') {
          throw new Error('query_database is turned off: this database has no read protection enforced by the engine itself (SQLite on Node.js 24 or newer has it). Use a database user that can read only the tables MCP may see, then set MCP_DATABASE_RESTRICTED=true.');
        }
        let pending;
        try { pending = DB.select(cleanSql + ` LIMIT ${cappedLimit}`); } finally { if (release) release(); }
        results = await pending;
        throw UNDO;
      }).catch((e) => { if (e !== UNDO) throw e; });
      const timedOut = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Query stopped: it took longer than ${limitMs} ms.`)), limitMs); });
      try { await Promise.race([guarded, timedOut]); } finally { clearTimeout(timer); }

      // Credentials are masked by column name, and also by what the value looks like (a hash, a token, a JSON text)
      const SENSITIVE_KEY_RE = /(password|passwd|secret|token|api_?key|private_?key|recovery_?code|hash|salt|credential|authentication)/i;
      const HASH_RE = /\$(?:scrypt|2[abxy]|argon2\w*|pbkdf2\S*)\$[^\s"']+/gi;
      const MASK = '******** [REDACTED]';
      const mask = (v, key) => {
        if (key != null && SENSITIVE_KEY_RE.test(String(key))) return MASK;
        if (typeof v === 'string') {
          const t = v.trim();
          if ((t[0] === '{' || t[0] === '[') && t.length < 1000000) {
            try { return JSON.stringify(mask(JSON.parse(t))); } catch (_) { /* not JSON: treated as text */ }
          }
          return v.replace(HASH_RE, MASK);
        }
        if (Array.isArray(v)) return v.map((x) => mask(x));
        if (v && typeof v === 'object' && !Buffer.isBuffer(v) && !(v instanceof Date)) {
          const out = {};
          for (const k of Object.keys(v)) out[k] = mask(v[k], k);
          return out;
        }
        return v;
      };
      const sanitized = results.map((row) => mask(row));

      return {
        content: [{ type: 'text', text: JSON.stringify(sanitized, null, 2) }],
      };
    });

    // 2. Tool: list_routes - list all active HTTP API and web routes
    this.registerTool('list_routes', {
      description: 'List all registered backend HTTP routes, methods, paths, and middlewares.',
      inputSchema: { type: 'object', properties: {} },
    }, async () => {
      const { Route } = require('./index.js');
      const routes = Route.list().map((r) => ({
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
      description: 'Get live Kreft server memory usage, garbage collector state, and uptime.',
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

    // 3b. Tool: memory_report - GC runs, evictions, trend, leak suspicion, alerts, recent samples
    this.registerTool('memory_report', {
      description: 'Memory Manager report: heap trend, GC and cache-eviction counts, leak suspicion, recent alerts and samples.',
      inputSchema: { type: 'object', properties: {} },
    }, async () => ({
      content: [{ type: 'text', text: JSON.stringify(require('./gc.js').getMemoryReport(), null, 2) }],
    }));

    // 3c. Tool: shield_status - the abuse shield: banned addresses, counters, limits
    this.registerTool('shield_status', {
      description: 'Kreft Shield (SHIELD=true): whether it is on, its limits, counters, event-loop lag and the currently banned addresses.',
      inputSchema: { type: 'object', properties: {} },
    }, async () => {
      const { Shield } = require('./shield.js');
      return { content: [{ type: 'text', text: JSON.stringify({ ...Shield.status(), bans: Shield.bans() }, null, 2) }] };
    });

    // 4. Resource: kreft://routes
    const routesResource = async () => {
      const { Route } = require('./index.js');
      const routes = Route.list();
      return JSON.stringify(routes, null, 2);
    };
    this.registerResource('kreft://routes', 'Active Kreft Routes', 'application/json', routesResource);

    // 5. Resource: kreft://schema
    const schemaResource = async () => {
      try {
        const migrator = require('./migrator.js');
        const tables = await migrator.listTables();
        return JSON.stringify(tables, null, 2);
      } catch (err) {
        return JSON.stringify({ error: err.message }, null, 2);
      }
    };
    this.registerResource('kreft://schema', 'Database Schema', 'application/json', schemaResource);
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
      res.setHeader('Vary', 'Origin');
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

    // MCP Token authentication. The endpoint can read the whole database, so:
    //  - with MCP_TOKEN set, every request must carry it (never the APP_KEY: that is the master secret);
    //  - in production, no MCP_TOKEN means the endpoint is off;
    //  - in development without a token, only a direct local client is let in (not a remote address,
    //    not a request that came through a proxy or tunnel, not a foreign Host name).
    const remoteAddr = String(req.socket && req.socket.remoteAddress || '');
    const isLoopback = remoteAddr === '127.0.0.1' || remoteAddr === '::1' || remoteAddr === '::ffff:127.0.0.1';
    const viaProxy = ['x-forwarded-for', 'x-forwarded-host', 'forwarded', 'x-real-ip'].some((h) => req.headers[h] !== undefined);
    const hostName = String(req.headers.host || '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
    const isLocalHost = hostName === 'localhost' || hostName === '127.0.0.1' || hostName === '::1';
    const isProd = process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production';
    const requiredToken = process.env.MCP_TOKEN || process.env.KREFT_MCP_TOKEN || null;
    const deny = (status, message) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32000, message } }));
    };

    if (isProd && !requiredToken) return deny(403, 'Forbidden: MCP endpoint disabled in production without MCP_TOKEN');

    if (requiredToken) {
      const authHeader = req.headers.authorization || '';
      const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
      const providedToken = tokenMatch ? tokenMatch[1].trim() : null;
      if (!providedToken || !http.same(providedToken, requiredToken)) return deny(401, 'Unauthorized: Invalid or missing MCP_TOKEN');
    } else if (!isLoopback || viaProxy || !isLocalHost) {
      return deny(403, 'Forbidden: set MCP_TOKEN in .env to use MCP from a remote address, a proxy or a tunnel');
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
      const MAX_MCP_BODY = 1024 * 1024; // 1 MB max payload
      const chunks = [];
      let size = 0;
      let aborted = false;
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_MCP_BODY) {
          aborted = true;
          res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Payload too large (max 1 MB)' } }));
          req.destroy();
          return;
        }
        chunks.push(c);
      });
      req.on('end', async () => {
        if (aborted) return;
        try {
          const { parseJson } = require('../safe-json.js');
          const body = parseJson(Buffer.concat(chunks).toString('utf8'));
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

  // Stdio Transport: runs Kreft as a stdio MCP server for Claude Desktop / AI IDEs
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
