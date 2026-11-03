/*
 * The query builder and the DB facade.
 *
 *   await DB.table('posts').where('published', true).orderBy('id', 'desc').limit(10).get()
 *   await DB.table('posts').join('users', 'users.id', '=', 'posts.user_id').select('posts.*', 'users.name as author').get()
 *   await DB.table('orders').select('status').selectRaw('COUNT(*) AS total').groupBy('status').having('total', '>', 5).get()
 *   await DB.transaction(async () => { … every query in here is one transaction … })
 *   await DB.select('SELECT * FROM posts WHERE id = ?', [5])
 *
 * Values always travel as ? parameters, never inside the SQL text.
 */
const { AsyncLocalStorage } = require('async_hooks');
const { Collection } = require('./collection.js');

const OPS = new Set(['=', '!=', '<>', '<', '>', '<=', '>=', 'like', 'not like', 'ilike']);

let connection = null;
const tx = new AsyncLocalStorage(); // inside DB.transaction(): the transaction's connection
function setConnection(db) { connection = db; }
function getConnection() {
  const inTx = tx.getStore();
  if (inTx) return inTx;
  if (!connection) throw Object.assign(new Error('No database. Set DATABASE_URL in .env (for example sqlite:database/app.db), or start with --db.'), { status: 500 });
  return connection;
}
// DB.raw('COUNT(*)') — a piece of SQL used as it is (never put user input in it)
class Raw { constructor(sql, params = []) { this.sql = sql; this.params = params; } toString() { return this.sql; } }
const raw = (sql, params) => new Raw(sql, params);

class Builder {
  constructor(table, db) {
    this._db = db || null;
    this._table = table;
    this._wheres = [];   // { bool: 'and'|'or', sql, params }
    this._joins = [];    // { sql, params }
    this._orders = [];
    this._groups = [];
    this._havings = [];
    this._columns = ['*'];
    this._distinct = false;
    this._limit = null;
    this._offset = null;
    this._unlimited = false;
  }
  withoutLimit() { this._unlimited = true; return this; }
  get db() { return this._db || getConnection(); }
  q(name) {
    if (name instanceof Raw) return name.sql;
    if (name === '*') return '*';
    const s = String(name).trim();
    if (/[\0\r\n;'"`\\]/.test(s)) throw new Error('Invalid characters in SQL identifier');
    const as = s.match(/^([a-zA-Z0-9_.*]+)\s+as\s+([a-zA-Z0-9_]+)$/i); // 'users.name as author'
    if (as) return `${this.q(as[1])} AS ${this.db.q(as[2])}`;
    if (!/^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_*]+)*$/.test(s)) throw new Error(`Invalid SQL identifier "${s}"`);
    return s.split('.').map((p) => (p === '*' ? p : this.db.q(p))).join('.');
  }
  clone() {
    const b = Object.create(Object.getPrototypeOf(this));
    Object.assign(b, this, { _wheres: [...this._wheres], _joins: [...this._joins], _orders: [...this._orders], _groups: [...this._groups], _havings: [...this._havings], _columns: [...this._columns] });
    return b;
  }
  newQuery(table) { return new Builder(table || this._table, this._db); }

  // ---- what to read
  select(...columns) { this._columns = columns.flat(); return this; }
  addSelect(...columns) { if (this._columns.length === 1 && this._columns[0] === '*') this._columns = [`${this._table}.*`]; this._columns.push(...columns.flat()); return this; }
  selectRaw(sql, params = []) { if (this._columns.length === 1 && this._columns[0] === '*') this._columns = [`${this._table}.*`]; this._columns.push(raw(sql, params)); return this; }
  distinct() { this._distinct = true; return this; }

  // ---- joins: join('users', 'users.id', '=', 'posts.user_id') or join('users', 'users.id', 'posts.user_id')
  _join(type, table, a, op, b) {
    if (b === undefined) { b = op; op = '='; }
    if (!OPS.has(String(op).toLowerCase())) throw new Error(`Unknown operator "${op}" in join()`);
    this._joins.push({ sql: `${type} JOIN ${this.q(table)} ON ${this.q(a)} ${op} ${this.q(b)}`, params: [] });
    return this;
  }
  join(table, a, op, b) { return this._join('INNER', table, a, op, b); }
  leftJoin(table, a, op, b) { return this._join('LEFT', table, a, op, b); }
  rightJoin(table, a, op, b) { return this._join('RIGHT', table, a, op, b); }
  crossJoin(table) { this._joins.push({ sql: `CROSS JOIN ${this.q(table)}`, params: [] }); return this; }

  // ---- where
  _push(bool, sql, params = []) { this._wheres.push({ bool, sql, params }); return this; }
  where(column, op, value, bool = 'and') {
    if (typeof column === 'function') { // where((q) => q.where(…).orWhere(…))  →  ( … )
      const sub = this.newQuery();
      column(sub);
      const { sql, params } = sub._whereSql();
      return sql ? this._push(bool, `(${sql})`, params) : this;
    }
    if (column && typeof column === 'object' && !(column instanceof Raw)) { // where({ status: 'live', user_id: 2 })
      Object.entries(column).forEach(([k, v]) => this.where(k, '=', v, bool));
      return this;
    }
    if (value === undefined) { value = op; op = '='; }
    op = String(op).toLowerCase();
    if (!OPS.has(op)) throw new Error(`Unknown operator "${op}" in where()`);
    if (value === null) return this._push(bool, `${this.q(column)} IS ${op === '=' ? '' : 'NOT '}NULL`);
    if (value instanceof Raw) return this._push(bool, `${this.q(column)} ${op.toUpperCase()} ${value.sql}`, value.params);
    if (op === 'ilike' && this.db.kind !== 'postgres') return this._push(bool, `LOWER(${this.q(column)}) LIKE LOWER(?)`, [value]);
    return this._push(bool, `${this.q(column)} ${op.toUpperCase()} ?`, [value]);
  }
  orWhere(column, op, value) { return this.where(column, op, value, 'or'); }
  whereNot(column, value) { return this.where(column, '!=', value); }
  whereColumn(a, op, b, bool = 'and') {
    if (b === undefined) { b = op; op = '='; }
    if (!OPS.has(String(op).toLowerCase())) throw new Error(`Unknown operator "${op}" in whereColumn()`);
    return this._push(bool, `${this.q(a)} ${op} ${this.q(b)}`);
  }
  whereIn(column, values, bool = 'and', not = false) {
    if (values instanceof Builder) { const { sql, params } = values.toSql(); return this._push(bool, `${this.q(column)} ${not ? 'NOT ' : ''}IN (${sql})`, params); }
    values = [...values];
    if (!values.length) return this._push(bool, not ? '1 = 1' : '1 = 0');
    return this._push(bool, `${this.q(column)} ${not ? 'NOT ' : ''}IN (${values.map(() => '?').join(', ')})`, values);
  }
  whereNotIn(column, values) { return this.whereIn(column, values, 'and', true); }
  orWhereIn(column, values) { return this.whereIn(column, values, 'or'); }
  orWhereNotIn(column, values) { return this.whereIn(column, values, 'or', true); }
  whereNull(column, bool = 'and') { return this._push(bool, `${this.q(column)} IS NULL`); }
  whereNotNull(column, bool = 'and') { return this._push(bool, `${this.q(column)} IS NOT NULL`); }
  orWhereNull(column) { return this.whereNull(column, 'or'); }
  orWhereNotNull(column) { return this.whereNotNull(column, 'or'); }
  whereBetween(column, [a, b], bool = 'and', not = false) { return this._push(bool, `${this.q(column)} ${not ? 'NOT ' : ''}BETWEEN ? AND ?`, [a, b]); }
  whereNotBetween(column, range) { return this.whereBetween(column, range, 'and', true); }
  orWhereBetween(column, range) { return this.whereBetween(column, range, 'or'); }
  whereLike(column, value) { return this.where(column, 'ilike', value); } // without caring about case
  orWhereLike(column, value) { return this.where(column, 'ilike', value, 'or'); }
  // dates and parts of them, the same way on every database
  whereDate(column, op, value) { if (value === undefined) { value = op; op = '='; } return this._datePart('date', column, op, value); }
  whereYear(column, op, value) { if (value === undefined) { value = op; op = '='; } return this._datePart('year', column, op, value); }
  whereMonth(column, op, value) { if (value === undefined) { value = op; op = '='; } return this._datePart('month', column, op, value); }
  _datePart(part, column, op, value) {
    if (!OPS.has(String(op).toLowerCase())) throw new Error(`Unknown operator "${op}"`);
    const c = this.q(column), k = this.db.kind;
    const sql = part === 'date' ? (k === 'postgres' ? `CAST(${c} AS DATE)` : `DATE(${c})`)
      : k === 'sqlite' ? `CAST(strftime('${part === 'year' ? '%Y' : '%m'}', ${c}) AS INTEGER)`
        : k === 'postgres' ? `EXTRACT(${part.toUpperCase()} FROM ${c})` : `${part.toUpperCase()}(${c})`;
    return this._push('and', `${sql} ${op} ?`, [part === 'date' && value instanceof Date ? value.toISOString().slice(0, 10) : value]);
  }
  whereExists(fn, bool = 'and', not = false) {
    const sub = typeof fn === 'function' ? (() => { const b = this.newQuery(); fn(b); return b; })() : fn;
    const { sql, params } = sub.toSql();
    return this._push(bool, `${not ? 'NOT ' : ''}EXISTS (${sql})`, params);
  }
  whereNotExists(fn) { return this.whereExists(fn, 'and', true); }
  whereRaw(sql, params = []) { return this._push('and', `(${sql})`, params); }
  orWhereRaw(sql, params = []) { return this._push('or', `(${sql})`, params); }
  when(condition, fn, otherwise) { if (condition) fn(this, condition); else if (otherwise) otherwise(this); return this; }
  unless(condition, fn, otherwise) { return this.when(!condition, fn, otherwise); }
  tap(fn) { fn(this); return this; }

  // ---- group and order
  groupBy(...columns) { this._groups.push(...columns.flat()); return this; }
  having(column, op, value, bool = 'and') {
    if (value === undefined) { value = op; op = '='; }
    if (!OPS.has(String(op).toLowerCase())) throw new Error(`Unknown operator "${op}" in having()`);
    this._havings.push({ bool, sql: `${this.q(column)} ${op} ?`, params: [value] });
    return this;
  }
  orHaving(column, op, value) { return this.having(column, op, value, 'or'); }
  havingRaw(sql, params = []) { this._havings.push({ bool: 'and', sql: `(${sql})`, params }); return this; }
  orderBy(column, direction = 'asc') {
    const dir = String(direction).toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    this._orders.push({ sql: `${this.q(column)} ${dir}`, params: [] });
    return this;
  }
  orderByDesc(column) { return this.orderBy(column, 'desc'); }
  orderByRaw(sql, params = []) { this._orders.push({ sql, params }); return this; }
  latest(column = 'created_at') { return this.orderBy(column, 'desc'); }
  oldest(column = 'created_at') { return this.orderBy(column, 'asc'); }
  inRandomOrder() { this._orders.push({ sql: this.db.kind === 'mysql' ? 'RAND()' : 'RANDOM()', params: [] }); return this; }
  reorder() { this._orders = []; return this; }
  limit(n) { this._limit = Math.max(0, parseInt(n, 10) || 0); return this; }
  take(n) { return this.limit(n); }
  offset(n) { this._offset = Math.max(0, parseInt(n, 10) || 0); return this; }
  skip(n) { return this.offset(n); }
  forPage(page, perPage = 15) { return this.offset((Math.max(1, page) - 1) * perPage).limit(perPage); }

  // ---- SQL
  _whereSql() {
    if (!this._wheres.length) return { sql: '', params: [] };
    const params = [];
    const sql = this._wheres.map((w, i) => { params.push(...w.params); return (i ? w.bool.toUpperCase() + ' ' : '') + w.sql; }).join(' ');
    return { sql, params };
  }
  _from() {
    const params = [];
    let sql = this.q(this._table);
    this._joins.forEach((j) => { sql += ' ' + j.sql; params.push(...j.params); });
    return { sql, params };
  }
  _tail() {
    let sql = '';
    const params = [];
    if (this._groups.length) sql += ' GROUP BY ' + this._groups.map((g) => this.q(g)).join(', ');
    if (this._havings.length) {
      sql += ' HAVING ' + this._havings.map((h, i) => { params.push(...h.params); return (i ? h.bool.toUpperCase() + ' ' : '') + h.sql; }).join(' ');
    }
    if (this._orders.length) { sql += ' ORDER BY ' + this._orders.map((o) => { params.push(...o.params); return o.sql; }).join(', '); }
    if (this._limit != null) sql += ' LIMIT ' + this._limit;
    if (this._offset) sql += (this._limit == null ? (this.db.kind === 'mysql' ? ' LIMIT 18446744073709551615' : this.db.kind === 'sqlite' ? ' LIMIT -1' : '') : '') + ' OFFSET ' + this._offset;
    return { sql, params };
  }
  _select() {
    const params = [];
    const cols = this._columns.map((c) => { if (c instanceof Raw) { params.push(...c.params); return c.sql; } return this.q(c); }).join(', ');
    return { sql: `SELECT ${this._distinct ? 'DISTINCT ' : ''}${cols}`, params };
  }
  toSql() {
    const s = this._select(), f = this._from(), w = this._whereSql(), t = this._tail();
    return { sql: `${s.sql} FROM ${f.sql}${w.sql ? ' WHERE ' + w.sql : ''}${t.sql}`, params: [...s.params, ...f.params, ...w.params, ...t.params] };
  }

  // ---- reading
  async get() {
    const { sql, params } = this.toSql();
    const rows = await this.db.query(sql, params);
    const maxWarn = Number(process.env.MAX_QUERY_ROWS) || 10000;
    const isCliOrMigrate = (process.env.KREFT_CLI || process.env.SOM_CLI) === '1' || process.argv.some((a) => /artisan|migrate|seed/i.test(a));
    const hardLimit = this._unlimited || isCliOrMigrate ? 0 : (Number(process.env.HARD_QUERY_LIMIT) || (process.env.NODE_ENV === 'production' ? 50000 : 0));
    if (rows && rows.length >= maxWarn && this._limit == null && !this._unlimited) {
      console.warn(`[Kreft Query Warning] Query on "${this._table}" returned ${rows.length} rows without an explicit limit(). Consider using paginate(), chunk(), or limit() to prevent high memory usage.`);
      if (hardLimit > 0 && rows.length > hardLimit) {
        throw Object.assign(new Error(`Query on table "${this._table}" exceeded HARD_QUERY_LIMIT (${hardLimit} rows). Use chunk(), explicit pagination, or .withoutLimit().`), { status: 500 });
      }
    }
    return Collection.from(rows);
  }
  async first() { const rows = await this.clone().limit(1).get(); return rows[0] || null; }
  async firstOrFail() { const r = await this.first(); if (!r) throw Object.assign(new Error('No query results.'), { status: 404 }); return r; }
  async sole() { const rows = await this.clone().limit(2).get(); if (rows.length !== 1) throw Object.assign(new Error(rows.length ? 'More than one row matches.' : 'No query results.'), { status: rows.length ? 500 : 404 }); return rows[0]; }
  async find(id, key = 'id') { return this.clone().where(key, id).first(); }
  async value(column) { const row = await this.clone().select(column).first(); return row ? row[String(column).split('.').pop()] : null; }
  // pluck('title') → ['A', 'B'];  pluck('title', 'id') → { 1: 'A', 2: 'B' }
  async pluck(column, key) {
    const col = String(column).split('.').pop(), k = key && String(key).split('.').pop();
    const rows = await this.clone().select(...[column, key].filter(Boolean)).get();
    return key ? Object.fromEntries(rows.map((r) => [r[k], r[col]]).filter(([kn]) => !/^(?:__proto__|constructor|prototype)$/.test(String(kn)))) : Collection.from(rows.map((r) => r[col]));
  }
  async exists() { return !!(await this.clone().reorder().limit(1).first()); }
  async doesntExist() { return !(await this.exists()); }
  async _aggregate(fn, column = '*') {
    const f = this._from(), w = this._whereSql();
    const base = this._groups.length || this._distinct
      ? (() => { const inner = this.clone(); inner._orders = []; inner._limit = null; inner._offset = null; const s = inner.toSql(); return { sql: `SELECT ${fn}(${column === '*' ? '*' : this.db.q(String(column).split('.').pop())}) AS ${this.db.q('aggregate')} FROM (${s.sql}) kreft_sub`, params: s.params }; })()
      : { sql: `SELECT ${fn}(${column === '*' ? '*' : this.q(column)}) AS ${this.db.q('aggregate')} FROM ${f.sql}${w.sql ? ' WHERE ' + w.sql : ''}`, params: [...f.params, ...w.params] };
    const rows = await this.db.query(base.sql, base.params);
    const v = rows[0] ? rows[0].aggregate : null;
    return v == null ? (fn === 'COUNT' ? 0 : null) : Number(v);
  }
  count(column) { return this._aggregate('COUNT', column); }
  max(column) { return this._aggregate('MAX', column); }
  min(column) { return this._aggregate('MIN', column); }
  sum(column) { return this._aggregate('SUM', column).then((v) => v || 0); }
  avg(column) { return this._aggregate('AVG', column); }
  average(column) { return this.avg(column); }
  // Pagination shape: { data, total, per_page, current_page, last_page, from, to }
  async paginate(perPage = 15, page = 1) {
    perPage = Math.max(1, Math.min(1000, parseInt(perPage, 10) || 15));
    page = Math.max(1, parseInt(page, 10) || 1);
    const counter = this.clone(); counter._orders = [];
    const total = await counter.count();
    const data = await this.clone().forPage(page, perPage).get();
    return { data, total, per_page: perPage, current_page: page, last_page: Math.max(1, Math.ceil(total / perPage)), from: total ? (page - 1) * perPage + 1 : null, to: total ? (page - 1) * perPage + data.length : null };
  }
  // no total (one query less): { data, per_page, current_page, has_more }
  async simplePaginate(perPage = 15, page = 1) {
    perPage = Math.max(1, Math.min(1000, parseInt(perPage, 10) || 15));
    page = Math.max(1, parseInt(page, 10) || 1);
    const rows = await this.clone().offset((page - 1) * perPage).limit(perPage + 1).get();
    return { data: Collection.from(rows.slice(0, perPage)), per_page: perPage, current_page: page, has_more: rows.length > perPage };
  }
  // chunk(100, async (rows) => { … }) — big tables a piece at a time; return false to stop
  async chunk(size, fn) {
    size = Math.max(1, parseInt(size, 10) || 100);
    let page = 1;
    for (;;) {
      const rows = await this.clone().forPage(page, size).get();
      if (!rows.length) return true;
      if ((await fn(rows, page)) === false) return false;
      if (rows.length < size) return true;
      page++;
    }
  }
  async each(fn, size = 100) { return this.chunk(size, async (rows) => { for (const r of rows) if ((await fn(r)) === false) return false; }); }

  // ---- writing
  async insert(values) {
    const rows = [].concat(values);
    if (!rows.length) return null;
    const db = this.db;
    const firstKeys = Object.keys(rows[0] || {});
    const canBatch = rows.length > 1
      && firstKeys.length > 0
      && rows.every((r) => {
        const k = Object.keys(r || {});
        return k.length === firstKeys.length && k.every((col, i) => col === firstKeys[i]);
      });

    if (canBatch) {
      const colsSql = firstKeys.map((k) => this.q(k)).join(', ');
      const rowPlaceholder = `(${firstKeys.map(() => '?').join(', ')})`;
      const chunkSize = Math.max(1, Math.floor(900 / firstKeys.length));
      let lastId = null;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const slice = rows.slice(i, i + chunkSize);
        const placeholders = slice.map(() => rowPlaceholder).join(', ');
        const sql = `INSERT INTO ${this.q(this._table)} (${colsSql}) VALUES ${placeholders}${db.kind === 'postgres' ? ' RETURNING *' : ''}`;
        const params = slice.flatMap((row) => firstKeys.map((k) => row[k]));
        const r = await db.run(sql, params);
        lastId = r.insertId != null ? r.insertId : r.rows && r.rows.length ? r.rows[r.rows.length - 1].id ?? null : lastId;
      }
      return lastId;
    }

    let lastId = null;
    for (const row of rows) {
      const keys = Object.keys(row || {});
      let sql;
      if (!keys.length) {
        sql = db.kind === 'mysql'
          ? `INSERT INTO ${this.q(this._table)} () VALUES ()`
          : `INSERT INTO ${this.q(this._table)} DEFAULT VALUES${db.kind === 'postgres' ? ' RETURNING *' : ''}`;
      } else {
        sql = `INSERT INTO ${this.q(this._table)} (${keys.map((k) => this.q(k)).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})${db.kind === 'postgres' ? ' RETURNING *' : ''}`;
      }
      const r = await db.run(sql, keys.map((k) => row[k]));
      lastId = r.insertId != null ? r.insertId : r.rows && r.rows[0] ? r.rows[0].id ?? null : null;
    }
    return lastId; // the new id (of the last row)
  }
  insertGetId(values) { return this.insert(values); }
  async update(values) {
    const keys = Object.keys(values);
    if (!keys.length) return 0;
    const w = this._whereSql();
    const sets = keys.map((k) => (values[k] instanceof Raw ? `${this.q(k)} = ${values[k].sql}` : `${this.q(k)} = ?`));
    const params = keys.flatMap((k) => (values[k] instanceof Raw ? values[k].params : [values[k]]));
    const sql = `UPDATE ${this.q(this._table)} SET ${sets.join(', ')}${w.sql ? ' WHERE ' + w.sql : ''}`;
    return (await this.db.run(sql, [...params, ...w.params])).changes;
  }
  async updateOrInsert(match, values = {}) {
    const q = this.clone().where(match);
    if (await q.exists()) { await q.update(values); return false; }
    await this.insert({ ...match, ...values });
    return true;
  }
  async increment(column, by = 1, extra = {}) {
    const w = this._whereSql();
    const keys = Object.keys(extra);
    const sets = [`${this.q(column)} = ${this.q(column)} + ?`, ...keys.map((k) => `${this.q(k)} = ?`)];
    return (await this.db.run(`UPDATE ${this.q(this._table)} SET ${sets.join(', ')}${w.sql ? ' WHERE ' + w.sql : ''}`, [by, ...keys.map((k) => extra[k]), ...w.params])).changes;
  }
  decrement(column, by = 1, extra) { return this.increment(column, -by, extra); }
  async delete() {
    const w = this._whereSql();
    return (await this.db.run(`DELETE FROM ${this.q(this._table)}${w.sql ? ' WHERE ' + w.sql : ''}`, w.params)).changes;
  }
  async truncate() {
    const k = this.db.kind;
    if (k === 'sqlite') return this.db.run(`DELETE FROM ${this.q(this._table)}`);
    return this.db.exec(`TRUNCATE TABLE ${this.q(this._table)}${k === 'postgres' ? ' RESTART IDENTITY CASCADE' : ''}`);
  }
}

// DB.table('posts')…  DB.select(sql, params)  DB.statement(sql)  DB.transaction(fn)  DB.raw(sql)
const DB = {
  table: (name) => new Builder(name),
  query: (name) => new Builder(name),
  raw,
  select: async (sql, params = []) => Collection.from(await getConnection().query(sql, params)),
  selectOne: async (sql, params = []) => (await getConnection().query(sql, params))[0] || null,
  insert: (sql, params = []) => getConnection().run(sql, params),
  update: async (sql, params = []) => (await getConnection().run(sql, params)).changes,
  delete: async (sql, params = []) => (await getConnection().run(sql, params)).changes,
  statement: (sql, params) => (params ? getConnection().run(sql, params) : getConnection().exec(sql)),
  // DB.transaction(async (trx) => { await Order.create(…); await Stock.decrement(…) })
  // everything inside, models too, uses the transaction; an error undoes all of it
  async transaction(fn) {
    const conn = getConnection();
    if (!conn.transaction) return fn(conn);
    return conn.transaction((trx) => tx.run(trx, () => fn(trx)));
  },
  get connection() { return getConnection(); },
};

module.exports = { Builder, DB, Raw, raw, setConnection, getConnection };
