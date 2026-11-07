/*
 * Cache: key-value caching with multiple storage drivers.
 *
 *   await Cache.put('stats', data, 600)                          // 10 minutes
 *   const stats = await Cache.remember('stats', 600, () => loadStats())
 *   await Cache.get('stats', fallback)   Cache.has('stats')   Cache.forget('stats')   Cache.flush()
 *   await Cache.increment('visits')      Cache.rememberForever('settings', fn)   Cache.pull('once')
 *   const lock = await Cache.lock('report', 30); if (lock) { …; await lock.release() }
 *
 * CACHE_STORE in .env: database (the cache table, shared by every process), file (backend/storage/cache)
 * or memory (this process only, gone on restart). Without the cache table, database falls back to memory.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Builder, getConnection } = require('./query.js');
const { parseJson } = require('../safe-json.js');

const nowSec = () => Math.floor(Date.now() / 1000);
const expiry = (seconds) => (seconds == null ? 0 : nowSec() + Math.max(1, Math.floor(seconds instanceof Date ? (seconds - Date.now()) / 1000 : seconds)));

// In-process store with LRU eviction: at most CACHE_MEMORY_MAX entries (default 5000), and under
// memory pressure the memory manager (gc.js) trims the least recently used ones instead of flushing all.
function memoryStore() {
  const map = new Map(); // insertion order = recency: the first key is the least recently used
  const max = Math.max(1, Number(process.env.CACHE_MEMORY_MAX) || 5000);
  const set = (key, entry) => {
    map.delete(key);
    map.set(key, entry);
    while (map.size > max) map.delete(map.keys().next().value);
  };
  const store = {
    async get(key) {
      const e = map.get(key);
      if (!e) return undefined;
      if (e.exp && e.exp <= nowSec()) { map.delete(key); return undefined; }
      map.delete(key); map.set(key, e); // mark as recently used
      return e.value;
    },
    async put(key, value, exp) { set(key, { value, exp }); },
    async add(key, value, exp) { if ((await this.get(key)) !== undefined) return false; set(key, { value, exp }); return true; },
    async forget(key) { return map.delete(key); },
    async flush() { map.clear(); },
    size: () => map.size,
    /** Drops expired entries, then the least recently used `fraction` of what is left. Returns how many went. */
    trim(fraction = 0.5) {
      const before = map.size;
      const now = nowSec();
      for (const [k, e] of map) if (e.exp && e.exp <= now) map.delete(k);
      let drop = Math.ceil(map.size * Math.min(1, Math.max(0, fraction)));
      for (const k of map.keys()) { if (drop-- <= 0) break; map.delete(k); }
      return before - map.size;
    },
  };
  try { require('./gc.js').onMemoryPressure('cache:memory', (fraction) => store.trim(fraction)); } catch (_) {}
  return store;
}
function fileStore(dir) {
  const file = (key) => path.join(dir, crypto.createHash('sha1').update(key).digest('hex'));
  return {
    async get(key) {
      try { const e = parseJson(fs.readFileSync(file(key), 'utf8')); if (e.exp && e.exp <= nowSec()) { fs.rmSync(file(key), { force: true }); return undefined; } return e.value; } catch (_) { return undefined; }
    },
    async put(key, value, exp) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file(key), JSON.stringify({ value, exp })); },
    async add(key, value, exp) {
      if ((await this.get(key)) !== undefined) return false;
      fs.mkdirSync(dir, { recursive: true });
      try { fs.writeFileSync(file(key), JSON.stringify({ value, exp }), { flag: 'wx' }); return true; } catch (_) { return false; }
    },
    async forget(key) { const f = file(key); const had = fs.existsSync(f); fs.rmSync(f, { force: true }); return had; },
    async flush() { fs.rmSync(dir, { recursive: true, force: true }); },
  };
}
function databaseStore() {
  const table = () => new Builder('cache');
  return {
    async get(key) {
      const row = await table().where('key', key).first();
      if (!row) return undefined;
      if (Number(row.expiration) && Number(row.expiration) <= nowSec()) { await table().where('key', key).delete(); return undefined; }
      try { return parseJson(row.value); } catch (_) { return row.value; }
    },
    async put(key, value, exp) { await table().updateOrInsert({ key }, { value: JSON.stringify(value), expiration: exp }); },
    async add(key, value, exp) {
      await table().where('key', key).where('expiration', '>', 0).where('expiration', '<=', nowSec()).delete();
      try { await table().insert({ key, value: JSON.stringify(value), expiration: exp }); return true; } catch (_) { return false; } // the key is taken
    },
    async forget(key) { return (await table().where('key', key).delete()) > 0; },
    async flush() { await table().delete(); },
  };
}

function redisStore() {
  const { Redis } = require('./redis.js');
  const redis = Redis.connection('cache');
  return {
    async get(key) {
      const v = await redis.get(key);
      if (v == null) return undefined;
      try { return parseJson(v); } catch (_) { return v; }
    },
    async put(key, value, exp) {
      const val = JSON.stringify(value);
      if (exp && exp > 0) {
        const ttl = Math.max(1, exp - nowSec());
        await redis.set(key, val, 'EX', ttl);
      } else {
        await redis.set(key, val);
      }
    },
    async add(key, value, exp) {
      const val = JSON.stringify(value);
      if (exp && exp > 0) {
        const ttl = Math.max(1, exp - nowSec());
        const res = await redis.set(key, val, 'EX', ttl, 'NX');
        return res === 'OK' || res === 1 || res === true;
      }
      const res = await redis.set(key, val, 'NX');
      return res === 'OK' || res === 1 || res === true;
    },
    async forget(key) {
      const deleted = await redis.del(key);
      return Number(deleted) > 0;
    },
    async flush() {
      await redis.flushdb();
    },
  };
}

const stores = {};
let hasTable = null;
async function store(name) {
  name = name || (process.env.CACHE_STORE || process.env.CACHE_DRIVER || 'database').toLowerCase();
  if (name === 'database') {
    if (hasTable === null) { try { hasTable = (await getConnection().tables()).some((t) => t.name === 'cache'); } catch (_) { hasTable = false; } }
    if (!hasTable) name = 'memory';
  }
  if (!stores[name]) {
    const base = require('./app.js').baseDir() || process.cwd();
    stores[name] = name === 'file' ? fileStore(path.join(base, 'storage', 'cache'))
      : name === 'database' ? databaseStore()
      : name === 'redis' ? redisStore()
      : memoryStore();
  }
  return stores[name];
}

function makeCache(storeName) {
  const prefix = process.env.CACHE_PREFIX || '';
  const k = (key) => prefix + key;
  const Cache = {
    store: (name) => makeCache(name),
    async get(key, fallback = null) { const v = await (await store(storeName)).get(k(key)); return v === undefined ? (typeof fallback === 'function' ? fallback() : fallback) : v; },
    async has(key) { return (await (await store(storeName)).get(k(key))) !== undefined; },
    async missing(key) { return !(await Cache.has(key)); },
    async put(key, value, seconds) { await (await store(storeName)).put(k(key), value, expiry(seconds)); return true; },
    set(key, value, seconds) { return Cache.put(key, value, seconds); },
    async add(key, value, seconds) { return (await store(storeName)).add(k(key), value, expiry(seconds)); },
    forever(key, value) { return Cache.put(key, value, null); },
    async remember(key, seconds, fn) {
      const s = await store(storeName);
      const v = await s.get(k(key));
      if (v !== undefined) return v;
      const fresh = await fn();
      await s.put(k(key), fresh, expiry(seconds));
      return fresh;
    },
    rememberForever(key, fn) { return Cache.remember(key, null, fn); },
    async pull(key, fallback = null) { const v = await Cache.get(key, fallback); await Cache.forget(key); return v; },
    async forget(key) { return (await store(storeName)).forget(k(key)); },
    async increment(key, by = 1) { const v = Number(await Cache.get(key, 0)) + by; await Cache.put(key, v); return v; },
    decrement(key, by = 1) { return Cache.increment(key, -by); },
    async flush() { await (await store(storeName)).flush(); return true; },
    // an atomic lock: only one process gets it until it is released or expires
    // Supports:
    //   const lock = await Cache.lock('report', 30); if (lock) { ...; await lock.release(); }
    //   await Cache.lock('report', 30, async () => { ... })
    //   await Cache.lock('report', 30).get(async () => { ... })
    //   await Cache.lock('report', 30).block(5, async () => { ... })
    lock(name, seconds = 10, callback = null) {
      const owner = crypto.randomUUID();
      const lockKey = 'lock:' + name;
      const release = async () => {
        if ((await Cache.get(lockKey)) === owner) await Cache.forget(lockKey);
      };
      const tryAcquire = async () => {
        const ok = await (await store(storeName)).add(k(lockKey), owner, expiry(seconds));
        if (!ok) return null;
        return { owner, release, forceRelease: () => Cache.forget(lockKey) };
      };
      const get = async (fn) => {
        const acquired = await tryAcquire();
        if (!acquired) return typeof fn === 'function' ? false : null;
        if (typeof fn !== 'function') return acquired;
        try { return await fn(acquired); } finally { await release(); }
      };
      const block = async (waitSeconds = 5, fn = null) => {
        const deadline = Date.now() + Math.max(0, Number(waitSeconds) || 0) * 1000;
        let acquired = await tryAcquire();
        while (!acquired && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 50));
          acquired = await tryAcquire();
        }
        if (!acquired) throw new Error(`Could not acquire lock "${name}" within ${waitSeconds}s.`);
        if (typeof fn !== 'function') return acquired;
        try { return await fn(acquired); } finally { await release(); }
      };
      const promise = typeof callback === 'function' ? get(callback) : tryAcquire();
      promise.get = get;
      promise.block = block;
      promise.release = release;
      promise.forceRelease = () => Cache.forget(lockKey);
      return promise;
    },
  };
  return Cache;
}
const Cache = makeCache();
const forget = () => { hasTable = null; for (const key of Object.keys(stores)) delete stores[key]; };

module.exports = { Cache, forget };
