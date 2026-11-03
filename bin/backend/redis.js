/*
 * Redis client and connection manager for Som.js.
 *
 *   const { Redis } = require('somjs/server')
 *
 *   await Redis.set('visits', 10)
 *   const visits = await Redis.get('visits')
 *   await Redis.incr('visits')
 *   await Redis.expire('visits', 3600)
 *
 *   // Hashes
 *   await Redis.hset('user:1', { name: 'Ali', role: 'admin' })
 *   const user = await Redis.hgetall('user:1')
 *
 *   // Pub/Sub
 *   await Redis.subscribe('notifications', (msg) => console.log('Notice:', msg))
 *   await Redis.publish('notifications', JSON.stringify({ text: 'Hello' }))
 *
 *   // Connection manager & named connections
 *   const cacheRedis = Redis.connection('cache')
 *
 * Configured via .env:
 *   REDIS_URL=redis://default:secret@127.0.0.1:6379/0
 *   or:
 *   REDIS_HOST=127.0.0.1
 *   REDIS_PORT=6379
 *   REDIS_PASSWORD=
 *   REDIS_DB=0
 *   REDIS_PREFIX=som:
 *
 * Zero mandatory dependencies: works out of the box with Node's native net module (RESP protocol).
 * Seamlessly wraps ioredis or redis npm packages when installed.
 */
const net = require('net');
const tls = require('tls');
const EventEmitter = require('events');

function parseRedisUrl(urlStr) {
  if (!urlStr) return {};
  try {
    const u = new URL(urlStr);
    const config = {
      host: u.hostname || '127.0.0.1',
      port: Number(u.port) || 6379,
      password: u.password ? decodeURIComponent(u.password) : undefined,
      username: u.username && u.username !== 'default' ? decodeURIComponent(u.username) : undefined,
      tls: u.protocol === 'rediss:',
    };
    if (u.pathname && u.pathname.length > 1) {
      const db = parseInt(u.pathname.slice(1), 10);
      if (!Number.isNaN(db)) config.db = db;
    }
    return config;
  } catch (_) {
    return {};
  }
}

function resolveConfig(options = {}) {
  const fromEnvUrl = parseRedisUrl(process.env.REDIS_URL);
  return {
    host: options.host || fromEnvUrl.host || process.env.REDIS_HOST || '127.0.0.1',
    port: Number(options.port || fromEnvUrl.port || process.env.REDIS_PORT || 6379),
    password: options.password !== undefined ? options.password : (fromEnvUrl.password || process.env.REDIS_PASSWORD || null),
    username: options.username !== undefined ? options.username : (fromEnvUrl.username || process.env.REDIS_USERNAME || null),
    db: Number(options.db !== undefined ? options.db : (fromEnvUrl.db !== undefined ? fromEnvUrl.db : (process.env.REDIS_DB || 0))),
    prefix: options.prefix !== undefined ? options.prefix : (process.env.REDIS_PREFIX || ''),
    tls: options.tls !== undefined ? Boolean(options.tls) : Boolean(fromEnvUrl.tls || process.env.REDIS_TLS === 'true'),
    connectTimeout: Number(options.connectTimeout || 5000),
  };
}

// Low-level lightweight RESP (Redis Serialization Protocol) parser & serializer
const MAX_RESP_BUFFER = 64 * 1024 * 1024; // 64 MB cap against unbounded memory growth
const MAX_RESP_ARRAY_ITEMS = 1048576;
const isBadKey = (k) => k === '__proto__' || k === 'constructor' || k === 'prototype';

class RespParser {
  static serialize(args) {
    let out = '*' + args.length + '\r\n';
    for (const arg of args) {
      const str = arg === null || arg === undefined ? '' : String(arg);
      out += '$' + Buffer.byteLength(str) + '\r\n' + str + '\r\n';
    }
    return out;
  }

  static parse(buffer, start = 0) {
    if (buffer.length <= start) return { complete: false, offset: start };
    const prefix = String.fromCharCode(buffer[start]);
    const crlf = buffer.indexOf('\r\n', start);
    if (crlf === -1) return { complete: false, offset: start };

    // Simple String: +OK\r\n
    if (prefix === '+') {
      const val = buffer.toString('utf8', start + 1, crlf);
      return { complete: true, value: val, offset: crlf + 2 };
    }

    // Error: -ERR message\r\n
    if (prefix === '-') {
      const msg = buffer.toString('utf8', start + 1, crlf);
      const err = new Error(msg);
      return { complete: true, error: err, offset: crlf + 2 };
    }

    // Integer: :1000\r\n
    if (prefix === ':') {
      const num = Number(buffer.toString('utf8', start + 1, crlf));
      return { complete: true, value: num, offset: crlf + 2 };
    }

    // Bulk String: $6\r\nfoobar\r\n or $-1\r\n (null)
    if (prefix === '$') {
      const len = parseInt(buffer.toString('utf8', start + 1, crlf), 10);
      if (len === -1) return { complete: true, value: null, offset: crlf + 2 };
      if (!Number.isInteger(len) || len < -1 || len > MAX_RESP_BUFFER) {
        return { complete: true, error: new Error(`Invalid RESP bulk string length: ${len}`), offset: crlf + 2 };
      }
      const strStart = crlf + 2;
      const strEnd = strStart + len;
      if (buffer.length < strEnd + 2) return { complete: false, offset: start };
      const val = buffer.toString('utf8', strStart, strEnd);
      return { complete: true, value: val, offset: strEnd + 2 };
    }

    // Array: *2\r\n... or *-1\r\n (null)
    if (prefix === '*') {
      const count = parseInt(buffer.toString('utf8', start + 1, crlf), 10);
      if (count === -1) return { complete: true, value: null, offset: crlf + 2 };
      if (!Number.isInteger(count) || count < -1 || count > MAX_RESP_ARRAY_ITEMS) {
        return { complete: true, error: new Error(`Invalid RESP array length: ${count}`), offset: crlf + 2 };
      }
      let offset = crlf + 2;
      const items = [];
      for (let i = 0; i < count; i++) {
        const item = RespParser.parse(buffer, offset);
        if (!item.complete) return { complete: false, offset: start };
        if (item.error) items.push(item.error);
        else items.push(item.value);
        offset = item.offset;
      }
      return { complete: true, value: items, offset };
    }

    // Fallback: raw line
    return { complete: true, value: buffer.toString('utf8', start, crlf), offset: crlf + 2 };
  }
}

class NativeRedisClient extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = resolveConfig(config);
    this.socket = null;
    this.connecting = false;
    this.connected = false;
    this.queue = [];
    this.buffer = Buffer.alloc(0);
    this.subscriptions = new Map(); // channel -> Set<fn>
    this.autoReconnect = true;
    this.reconnectTimer = null;
    this.on('error', () => {}); // default handler prevents unhandled error crashes
  }

  async connect() {
    if (this.connected) return this;
    if (this.connecting) {
      return new Promise((resolve, reject) => {
        this.once('ready', () => resolve(this));
        this.once('error', reject);
      });
    }

    this.connecting = true;
    return new Promise((resolve, reject) => {
      const onSocketReady = async () => {
        s.setTimeout(0);
        this.socket = s;

        // Complete AUTH and SELECT before marking connected = true to prevent command interleaving
        try {
          if (this.config.password) {
            if (this.config.username) await this._sendOnSocket('AUTH', this.config.username, this.config.password);
            else await this._sendOnSocket('AUTH', this.config.password);
          }
          if (this.config.db && this.config.db > 0) {
            await this._sendOnSocket('SELECT', this.config.db);
          }
          this.connecting = false;
          this.connected = true;
          this.emit('ready');
          resolve(this);
        } catch (err) {
          this.destroy();
          reject(err);
        }
      };

      const s = this.config.tls
        ? tls.connect({ host: this.config.host, port: this.config.port, servername: this.config.host }, onSocketReady)
        : net.createConnection({ host: this.config.host, port: this.config.port }, onSocketReady);

      s.setTimeout(this.config.connectTimeout);
      s.on('timeout', () => {
        s.destroy(new Error(`Redis connection timed out after ${this.config.connectTimeout}ms`));
      });

      s.on('data', (chunk) => this._onData(chunk));

      s.on('error', (err) => {
        this.emit('error', err);
        if (this.connecting) {
          this.connecting = false;
          reject(err);
        }
      });

      s.on('close', () => {
        this.connected = false;
        this.connecting = false;
        this.socket = null;
        this.emit('close');
        this._flushQueue(new Error('Connection to Redis closed'));
        if (this.autoReconnect) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = setTimeout(() => this.connect().catch(() => {}), 1000);
        }
      });
    });
  }

  _onData(chunk) {
    if (this.buffer.length + chunk.length > MAX_RESP_BUFFER) {
      this.buffer = Buffer.alloc(0);
      const err = new Error('Redis response buffer exceeded maximum size limit');
      this.emit('error', err);
      this._flushQueue(err);
      if (this.socket) this.socket.destroy(err);
      return;
    }
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length > 0) {
      const res = RespParser.parse(this.buffer, 0);
      if (!res.complete) break;
      if (!Number.isInteger(res.offset) || res.offset <= 0) {
        this.buffer = Buffer.alloc(0);
        break;
      }
      this.buffer = this.buffer.slice(res.offset);

      // Pub/Sub messages: ['message', channel, payload]
      if (Array.isArray(res.value) && res.value[0] === 'message' && res.value.length === 3) {
        const [, chan, msg] = res.value;
        this.emit('message', chan, msg);
        const handlers = this.subscriptions.get(chan);
        if (handlers) handlers.forEach((fn) => { try { fn(msg, chan); } catch (_) {} });
        continue;
      }

      const pending = this.queue.shift();
      if (pending) {
        if (res.error) pending.reject(res.error);
        else pending.resolve(res.value);
      }
    }
  }

  _flushQueue(err) {
    while (this.queue.length > 0) {
      const p = this.queue.shift();
      p.reject(err);
    }
  }

  _sendOnSocket(cmd, ...args) {
    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject });
      try {
        const payload = RespParser.serialize([cmd, ...args]);
        this.socket.write(payload);
      } catch (err) {
        const p = this.queue.pop();
        if (p) p.reject(err);
      }
    });
  }

  async call(cmd, ...args) {
    if (!this.connected) await this.connect();
    return this._sendOnSocket(cmd, ...args);
  }

  async eval(script, numKeys = 0, ...args) {
    return this.call('EVAL', script, numKeys, ...args);
  }

  async pipeline(fn) {
    const commands = [];
    const pipe = new Proxy({}, {
      get: (_, method) => (...args) => {
        commands.push({ method, args });
        return pipe;
      },
    });
    if (typeof fn === 'function') await fn(pipe);
    const results = [];
    for (const c of commands) {
      if (typeof this[c.method] === 'function') {
        results.push(await this[c.method](...c.args));
      } else {
        results.push(await this.call(String(c.method).toUpperCase(), ...c.args));
      }
    }
    return results;
  }

  // Key operations
  async get(key) { return this.call('GET', this.config.prefix + key); }
  async set(key, value, ...args) { return this.call('SET', this.config.prefix + key, value, ...args); }
  async setex(key, seconds, value) { return this.call('SETEX', this.config.prefix + key, seconds, value); }
  async setnx(key, value) { return this.call('SETNX', this.config.prefix + key, value); }
  async del(...keys) {
    if (keys.length === 0) return 0;
    const pref = keys.flat().map((k) => this.config.prefix + k);
    return this.call('DEL', ...pref);
  }
  async exists(...keys) {
    if (keys.length === 0) return 0;
    const pref = keys.flat().map((k) => this.config.prefix + k);
    return this.call('EXISTS', ...pref);
  }
  async expire(key, seconds) { return this.call('EXPIRE', this.config.prefix + key, seconds); }
  async ttl(key) { return this.call('TTL', this.config.prefix + key); }
  async incr(key) { return this.call('INCR', this.config.prefix + key); }
  async decr(key) { return this.call('DECR', this.config.prefix + key); }
  async incrby(key, amount) { return this.call('INCRBY', this.config.prefix + key, amount); }
  async decrby(key, amount) { return this.call('DECRBY', this.config.prefix + key, amount); }

  // Hashes
  async hget(key, field) { return this.call('HGET', this.config.prefix + key, field); }
  async hset(key, field, value) {
    if (typeof field === 'object' && field !== null && value === undefined) {
      const args = [];
      for (const [k, v] of Object.entries(field)) args.push(k, v == null ? '' : String(v));
      return this.call('HSET', this.config.prefix + key, ...args);
    }
    return this.call('HSET', this.config.prefix + key, field, value == null ? '' : String(value));
  }
  async hdel(key, ...fields) { return this.call('HDEL', this.config.prefix + key, ...fields.flat()); }
  async hexists(key, field) { return this.call('HEXISTS', this.config.prefix + key, field); }
  async hgetall(key) {
    const arr = await this.call('HGETALL', this.config.prefix + key);
    if (!Array.isArray(arr)) return {};
    const obj = {};
    for (let i = 0; i < arr.length; i += 2) {
      if (!isBadKey(arr[i])) obj[arr[i]] = arr[i + 1];
    }
    return obj;
  }
  async hkeys(key) { return this.call('HKEYS', this.config.prefix + key); }
  async hvals(key) { return this.call('HVALS', this.config.prefix + key); }
  async hlen(key) { return this.call('HLEN', this.config.prefix + key); }

  // Lists
  async lpush(key, ...values) { return this.call('LPUSH', this.config.prefix + key, ...values.flat()); }
  async rpush(key, ...values) { return this.call('RPUSH', this.config.prefix + key, ...values.flat()); }
  async lpop(key) { return this.call('LPOP', this.config.prefix + key); }
  async rpop(key) { return this.call('RPOP', this.config.prefix + key); }
  async llen(key) { return this.call('LLEN', this.config.prefix + key); }
  async lrange(key, start = 0, stop = -1) { return this.call('LRANGE', this.config.prefix + key, start, stop); }

  // Sets
  async sadd(key, ...members) { return this.call('SADD', this.config.prefix + key, ...members.flat()); }
  async srem(key, ...members) { return this.call('SREM', this.config.prefix + key, ...members.flat()); }
  async smembers(key) { return this.call('SMEMBERS', this.config.prefix + key); }
  async sismember(key, member) { return this.call('SISMEMBER', this.config.prefix + key, member); }

  // Sorted Sets
  async zadd(key, score, member) { return this.call('ZADD', this.config.prefix + key, score, member); }
  async zrangebyscore(key, min, max, ...options) { return this.call('ZRANGEBYSCORE', this.config.prefix + key, min, max, ...options); }
  async zrem(key, ...members) { return this.call('ZREM', this.config.prefix + key, ...members.flat()); }

  // Pub/Sub
  async publish(channel, message) { return this.call('PUBLISH', channel, message); }
  async subscribe(channel, handler) {
    if (!this.subscriptions.has(channel)) this.subscriptions.set(channel, new Set());
    if (handler) this.subscriptions.get(channel).add(handler);
    return this.call('SUBSCRIBE', channel);
  }
  async unsubscribe(channel, handler) {
    if (handler && this.subscriptions.has(channel)) {
      this.subscriptions.get(channel).delete(handler);
      if (this.subscriptions.get(channel).size === 0) {
        this.subscriptions.delete(channel);
        return this.call('UNSUBSCRIBE', channel);
      }
    } else {
      this.subscriptions.delete(channel);
      return this.call('UNSUBSCRIBE', channel);
    }
  }

  // Server management
  async ping(msg = 'PONG') { return this.call('PING', msg); }
  async flushdb() { return this.call('FLUSHDB'); }
  async flushall() { return this.call('FLUSHALL'); }
  async keys(pattern = '*') { return this.call('KEYS', this.config.prefix + pattern); }

  destroy() {
    this.autoReconnect = false;
    clearTimeout(this.reconnectTimer);
    if (this.socket) {
      try { this.socket.destroy(); } catch (_) {}
      this.socket = null;
    }
    this.connected = false;
    this.connecting = false;
  }
  quit() { return this.destroy(); }
}

// Connection pool / manager
const connections = new Map();

function createConnection(name = 'default', options = {}) {
  // If user installed ioredis, support wrapping it if opted
  try {
    const IORedis = require('ioredis');
    if (IORedis) {
      const cfg = resolveConfig(options);
      const client = new IORedis({
        host: cfg.host,
        port: cfg.port,
        password: cfg.password,
        db: cfg.db,
        keyPrefix: cfg.prefix,
        lazyConnect: true,
      });
      return client;
    }
  } catch (_) {
    // Fall back to Som native lightweight RESP client
  }
  return new NativeRedisClient(options);
}

function connection(name = 'default', options = {}) {
  if (!connections.has(name)) {
    connections.set(name, createConnection(name, options));
  }
  return connections.get(name);
}

// Proxy wrapper for convenient top-level Redis calls: await Redis.get('foo')
const Redis = new Proxy(
  {
    connection,
    client: (name = 'default') => connection(name),
    closeAll: () => {
      for (const [name, conn] of connections.entries()) {
        try { if (conn.destroy) conn.destroy(); else if (conn.quit) conn.quit(); } catch (_) {}
      }
      connections.clear();
    },
  },
  {
    get(target, prop) {
      if (prop in target) return target[prop];
      const conn = connection('default');
      if (typeof conn[prop] === 'function') {
        return (...args) => conn[prop](...args);
      }
      return conn[prop];
    },
  }
);

module.exports = { Redis, NativeRedisClient, RespParser, resolveConfig };
