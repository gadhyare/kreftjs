/*
 * Kreft database layer — one small interface over SQLite, MySQL / MariaDB and PostgreSQL.
 *
 *   sqlite:database/app.db         (or just a file name ending in .db / .sqlite / .sqlite3)
 *   mysql://user:password@localhost:3306/shop
 *   postgres://user:password@localhost:5432/shop
 *
 * SQLite is built into Node.js 22.5+ — nothing to install.
 * MySQL needs `npm i mysql2` and PostgreSQL needs `npm i pg`, in your project.
 *
 * Every adapter gives:
 *   db.kind                       'sqlite' | 'mysql' | 'postgres'
 *   await db.query(sql, params)   rows, with ? placeholders in every dialect
 *   await db.run(sql, params)     { changes, insertId }
 *   await db.tables()             [{ name, key, columns: [{ name, type, required, auto, text, bool }] }]
 *   db.q(name)                    a quoted identifier
 *   await db.transaction(fn)      fn(trx) with the same interface; COMMIT when it returns, ROLLBACK when it throws
 *   await db.close()
 */
const path = require('path');
const fs = require('fs');

function parseUrl(url) {
  if (!url) throw new Error('No database given. Use for example: --db sqlite:database/app.db');
  if (/^sqlite:/i.test(url)) return { kind: 'sqlite', file: url.replace(/^sqlite:(\/\/)?/i, '') || ':memory:' };
  if (/\.(db|sqlite3?)$/i.test(url) || url === ':memory:') return { kind: 'sqlite', file: url };
  const m = url.match(/^(mysql|mariadb|postgres|postgresql|pg):\/\//i);
  if (!m) throw new Error(`Unknown database "${url}". Use sqlite:file.db, mysql://… or postgres://…`);
  return { kind: /^(mysql|mariadb)$/i.test(m[1]) ? 'mysql' : 'postgres', url: url.replace(/^(mariadb|pg|postgresql):/i, (x) => (/^mariadb/i.test(x) ? 'mysql:' : 'postgres:')) };
}

// load a driver from the project first (that's where `npm i mysql2` puts it), then from here
function driver(name, root) {
  const paths = [root || process.cwd(), process.cwd(), __dirname];
  try { return require(require.resolve(name, { paths })); }
  catch (_) { throw new Error(`To use this database, install its driver in your project:\n\n    kreft add ${name}\n`); }
}

const TEXT = /char|text|clob|string|uuid|enum|json/i;
// a Date is stored as UTC 'YYYY-MM-DD HH:MM:SS' on every database (what the models read back as UTC)
const dateOut = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
const BOOL = /^bool/i;

// a missing table nearly always means a migration has not been run yet, so say so
const MISSING_TABLE = /no such table|doesn't exist|does not exist|ER_NO_SUCH_TABLE/i;
function hintMissingTable(e) {
  if (e && typeof e.message === 'string' && MISSING_TABLE.test(e.message) && /table|relation/i.test(e.message) && !e.message.includes('kreft migrate')) {
    e.message += '\n  Hint: the table is missing. Run `kreft migrate` to create it.';
  }
  return e;
}

async function connect(url, { root } = {}) {
  const cfg = parseUrl(url);
  const db = cfg.kind === 'sqlite' ? await sqlite(cfg, root) : cfg.kind === 'mysql' ? await mysql(cfg, root) : await postgres(cfg, root);
  for (const m of ['query', 'run']) {
    const fn = db[m];
    if (typeof fn === 'function') db[m] = async (...a) => { try { return await fn.apply(db, a); } catch (e) { throw hintMissingTable(e); } };
  }
  return db;
}

/* ---------------------------------------------------------------- SQLite (node:sqlite) */
function sqlite(cfg, root) {
  let DatabaseSync;
  // node:sqlite prints an "experimental" warning once; Kreft users don't need to see it
  const emit = process.emitWarning;
  process.emitWarning = (w, ...a) => (String(w).includes('SQLite') ? undefined : emit.call(process, w, ...a));
  try { ({ DatabaseSync } = require('node:sqlite')); }
  catch (_) { throw new Error(`SQLite needs Node.js 22.5 or newer (you have ${process.version}).`); }
  finally { process.emitWarning = emit; }
  const file = cfg.file === ':memory:' ? ':memory:' : path.resolve(root || process.cwd(), cfg.file);
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const conn = new DatabaseSync(file);
  conn.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;');
  const bind = (params = []) => params.map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v === undefined ? null : v instanceof Date ? dateOut(v) : v));
  const db = {
    kind: 'sqlite', file,
    q: (n) => '"' + String(n).replace(/\0/g, '').replace(/"/g, '""') + '"',
    async query(sql, params) { return conn.prepare(sql).all(...bind(params)); },
    async run(sql, params) {
      const r = conn.prepare(sql).run(...bind(params));
      return { changes: Number(r.changes), insertId: r.lastInsertRowid == null ? null : Number(r.lastInsertRowid) };
    },
    async exec(sql) { conn.exec(sql); },
    // The engine itself decides what a query may read, however the SQL is written (quoted names, parentheses, aliases):
    // decide(table, column) returns 'deny' (the statement fails), 'null' (that column reads as NULL) or anything else (allowed).
    // Returns a function that removes the guard, or null when this Node.js has no authorizer. The guard is connection-wide,
    // so it must be removed before anything else can run on the connection (use it around one synchronous statement).
    guardReads(decide) {
      let constants;
      try { ({ constants } = require('node:sqlite')); } catch (_) { return null; }
      if (typeof conn.setAuthorizer !== 'function' || !constants) return null;
      conn.setAuthorizer((code, table, column) => {
        if (code !== constants.SQLITE_READ) return constants.SQLITE_OK;
        const verdict = decide(String(table || ''), String(column || ''));
        return verdict === 'deny' ? constants.SQLITE_DENY : verdict === 'null' ? constants.SQLITE_IGNORE : constants.SQLITE_OK;
      });
      return () => conn.setAuthorizer(null);
    },
    // one connection: nested transactions become savepoints
    async transaction(fn) {
      const depth = (db.__depth = (db.__depth || 0) + 1);
      const sp = 'kreft_sp_' + depth;
      conn.exec(depth === 1 ? 'BEGIN' : `SAVEPOINT ${sp}`);
      try {
        const r = await fn(db);
        conn.exec(depth === 1 ? 'COMMIT' : `RELEASE ${sp}`);
        return r;
      } catch (e) {
        conn.exec(depth === 1 ? 'ROLLBACK' : `ROLLBACK TO ${sp}`);
        throw e;
      } finally { db.__depth = depth - 1; }
    },
    async tables() {
      const names = conn.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name);
      return names.map((name) => {
        const cols = conn.prepare(`PRAGMA table_info(${db.q(name)})`).all();
        const pks = cols.filter((c) => c.pk > 0);
        const key = pks.length === 1 ? pks[0].name : null;
        return {
          name, key,
          columns: cols.map((c) => {
            const auto = c.name === key && /^integer$/i.test(c.type); // INTEGER PRIMARY KEY gets its own id
            return { name: c.name, type: c.type || '', required: !!c.notnull && c.dflt_value == null && !auto, nullable: !c.notnull && !c.pk, auto, text: TEXT.test(c.type || '') || !c.type, bool: BOOL.test(c.type || '') };
          }),
        };
      });
    },
    async close() { conn.close(); },
  };
  return db;
}

/* ---------------------------------------------------------------- MySQL / MariaDB (mysql2) */
async function mysql(cfg, root) {
  const m = driver('mysql2/promise', root);
  const pool = m.createPool({ uri: cfg.url, connectionLimit: 10, dateStrings: true, supportBigNumbers: true, bigNumberStrings: false });
  const conv = (params = []) => params.map((v) => (v instanceof Date ? dateOut(v) : v !== null && typeof v === 'object' && !Buffer.isBuffer(v) ? JSON.stringify(v) : v === undefined ? null : v));
  const db = {
    kind: 'mysql',
    q: (n) => '`' + String(n).replace(/\0/g, '').replace(/`/g, '``') + '`',
    async query(sql, params) { const [rows] = await pool.query(sql, conv(params)); return rows; },
    async run(sql, params) { const [r] = await pool.query(sql, conv(params)); return { changes: r.affectedRows, insertId: r.insertId || null }; },
    // a transaction keeps one connection from the pool until it ends
    async transaction(fn) {
      const c = await pool.getConnection();
      const trx = {
        ...db, __trx: true,
        async query(sql, params) { const [rows] = await c.query(sql, conv(params)); return rows; },
        async run(sql, params) { const [r] = await c.query(sql, conv(params)); return { changes: r.affectedRows, insertId: r.insertId || null }; },
        async exec(sql) { for (const stmt of splitSql(sql)) await c.query(stmt); },
        async transaction(inner) { // nested: a savepoint
          const sp = 'kreft_sp_' + Math.random().toString(36).slice(2, 8);
          await c.query(`SAVEPOINT ${sp}`);
          try { const r = await inner(trx); await c.query(`RELEASE SAVEPOINT ${sp}`); return r; } catch (e) { await c.query(`ROLLBACK TO SAVEPOINT ${sp}`); throw e; }
        },
      };
      await c.beginTransaction();
      try { const r = await fn(trx); await c.commit(); return r; }
      catch (e) { await c.rollback(); throw e; }
      finally { c.release(); }
    },
    async exec(sql) {
      const c = await pool.getConnection();
      try { for (const stmt of splitSql(sql)) await c.query(stmt); } finally { c.release(); }
    },
    async tables() {
      const cols = await db.query(
        `SELECT table_name AS t, column_name AS c, data_type AS type, column_type AS ctype, is_nullable AS nullable,
                column_default AS dflt, extra, column_key AS ckey
           FROM information_schema.columns WHERE table_schema = DATABASE() ORDER BY table_name, ordinal_position`);
      return group(cols, (r) => {
        const auto = /auto_increment/i.test(r.extra || '');
        return { name: r.c, type: r.type, key: r.ckey === 'PRI', required: r.nullable === 'NO' && r.dflt == null && !auto && !/DEFAULT_GENERATED|GENERATED/i.test(r.extra || ''),
          nullable: r.nullable === 'YES', auto, text: TEXT.test(r.type), bool: /^tinyint\(1\)/i.test(r.ctype || '') };
      });
    },
    async close() { await pool.end(); },
  };
  return db;
}

/* ---------------------------------------------------------------- PostgreSQL (pg) */
async function postgres(cfg, root) {
  const pg = driver('pg', root);
  // the same values as SQLite and MySQL give: big ids as numbers (when they fit), times as written ('2026-10-28 21:05:00')
  const base = pg.types;
  const types = { getTypeParser: (oid, format) => {
    if (oid === 20) return (v) => { const n = Number(v); return Number.isSafeInteger(n) ? n : v; };   // BIGINT / BIGSERIAL
    if (oid === 1114 || oid === 1082 || oid === 1083) return (v) => v;                                // TIMESTAMP, DATE, TIME
    return base.getTypeParser(oid, format);
  } };
  const pool = new pg.Pool({ connectionString: cfg.url, max: 10, types });
  // write ? placeholders everywhere; turn them into $1, $2 … here (not inside quotes)
  const numbered = (sql) => { let i = 0; return sql.replace(/'(?:[^']|'')*'|"(?:[^"]|"")*"|\?/g, (m) => (m === '?' ? '$' + ++i : m)); };
  const conv = (params = []) => params.map((v) => (v instanceof Date ? dateOut(v) : v !== null && typeof v === 'object' && !Buffer.isBuffer(v) ? JSON.stringify(v) : v === undefined ? null : v));
  const db = {
    kind: 'postgres',
    q: (n) => '"' + String(n).replace(/\0/g, '').replace(/"/g, '""') + '"',
    async query(sql, params) { return (await pool.query(numbered(sql), conv(params))).rows; },
    async run(sql, params) { const r = await pool.query(numbered(sql), conv(params)); return { changes: r.rowCount, insertId: null, rows: r.rows }; },
    async exec(sql) { await pool.query(sql); },
    async transaction(fn) {
      const c = await pool.connect();
      const trx = {
        ...db, __trx: true,
        async query(sql, params) { return (await c.query(numbered(sql), conv(params))).rows; },
        async run(sql, params) { const r = await c.query(numbered(sql), conv(params)); return { changes: r.rowCount, insertId: null, rows: r.rows }; },
        async exec(sql) { await c.query(sql); },
        async transaction(inner) {
          const sp = 'kreft_sp_' + Math.random().toString(36).slice(2, 8);
          await c.query(`SAVEPOINT ${sp}`);
          try { const r = await inner(trx); await c.query(`RELEASE SAVEPOINT ${sp}`); return r; } catch (e) { await c.query(`ROLLBACK TO SAVEPOINT ${sp}`); throw e; }
        },
      };
      await c.query('BEGIN');
      try { const r = await fn(trx); await c.query('COMMIT'); return r; }
      catch (e) { await c.query('ROLLBACK'); throw e; }
      finally { c.release(); }
    },
    async tables() {
      const cols = await db.query(
        `SELECT c.table_name AS t, c.column_name AS c, c.data_type AS type, c.is_nullable AS nullable, c.column_default AS dflt,
                c.is_identity AS ident, c.is_generated AS gen,
                EXISTS (SELECT 1 FROM information_schema.table_constraints tc
                          JOIN information_schema.key_column_usage k ON k.constraint_name = tc.constraint_name AND k.table_schema = tc.table_schema
                         WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = c.table_schema AND tc.table_name = c.table_name AND k.column_name = c.column_name) AS pk
           FROM information_schema.columns c
           JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema AND t.table_type = 'BASE TABLE'
          WHERE c.table_schema = current_schema() ORDER BY c.table_name, c.ordinal_position`);
      return group(cols, (r) => {
        const auto = r.ident === 'YES' || /^nextval\(/i.test(r.dflt || '');
        return { name: r.c, type: r.type, key: r.pk, required: r.nullable === 'NO' && r.dflt == null && !auto && r.gen !== 'ALWAYS', nullable: r.nullable === 'YES', auto, text: TEXT.test(r.type), bool: BOOL.test(r.type) };
      });
    },
    async close() { await pool.end(); },
  };
  return db;
}

function group(rows, column) {
  const map = new Map();
  rows.forEach((r) => {
    const t = r.t || r.TABLE_NAME;
    if (!map.has(t)) map.set(t, []);
    map.get(t).push(column(r));
  });
  return [...map].map(([name, cols]) => {
    const keys = cols.filter((c) => c.key);
    return { name, key: keys.length === 1 ? keys[0].name : null, columns: cols.map(({ key, ...c }) => c) };
  });
}

// split a .sql file into statements (for MySQL, which runs one at a time); respects quotes and comments
function splitSql(sql) {
  const out = [];
  let cur = '', i = 0;
  while (i < sql.length) {
    const c = sql[i], n = sql[i + 1];
    if (c === '-' && n === '-') { const e = sql.indexOf('\n', i); i = e < 0 ? sql.length : e; continue; }
    if (c === '/' && n === '*') { const e = sql.indexOf('*/', i + 2); i = e < 0 ? sql.length : e + 2; continue; }
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < sql.length && sql[j] !== c) j += sql[j] === '\\' ? 2 : 1;
      cur += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === ';') { if (cur.trim()) out.push(cur.trim()); cur = ''; i++; continue; }
    cur += c;
    i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/* ---------------------------------------------------------------- migrations
 * database/migrations/001_create_posts.sql, 002_add_likes.sql …  run once each, in name order,
 * remembered in the table kreft_migrations .
 * database/seed.sql fills in starting data.
 */
async function migrate(db, dir, log = () => {}) {
  if (!fs.existsSync(dir)) return [];
  const idType = db.kind === 'postgres' ? 'TEXT' : 'VARCHAR(255)';
  await db.exec(`CREATE TABLE IF NOT EXISTS kreft_migrations (name ${idType} PRIMARY KEY, ran_at ${idType} NOT NULL)`);
  const done = new Set((await db.query('SELECT name FROM kreft_migrations')).map((r) => r.name));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const ran = [];
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    try { await db.exec(sql); }
    catch (e) { throw new Error(`Migration ${f} failed: ${e.message}`); }
    await db.run('INSERT INTO kreft_migrations (name, ran_at) VALUES (?, ?)', [f, new Date().toISOString()]);
    log(f);
    ran.push(f);
  }
  return ran;
}

module.exports = { connect, parseUrl, migrate, splitSql };
