/*
 * Models and ORM.
 *
 *   // app/Models/Post.js
 *   const { Model } = require('somjs/server')
 *   class Post extends Model {
 *     static fillable = ['title', 'body', 'user_id']
 *     static hidden = []
 *     static casts = { published: 'boolean', meta: 'json' }
 *     static softDeletes = true                       // delete() fills deleted_at; withTrashed(), restore()
 *     static appends = ['excerpt']                    // getExcerptAttribute() goes into the JSON
 *
 *     user() { return this.belongsTo(require('./User')) }
 *     comments() { return this.hasMany(require('./Comment')) }
 *     tags() { return this.belongsToMany(require('./Tag')) }          // the post_tag table
 *
 *     static scopePublished(query) { query.where('published', true) }  // Post.query().published()
 *     getExcerptAttribute() { return String(this.body || '').slice(0, 80) }
 *     setTitleAttribute(value) { return value.trim() }                // when filled
 *     static async creating(post) { post.slug ??= Str.slug(post.title) }   // hooks: creating, created, updating…
 *   }
 *   module.exports = Post
 *
 *   await Post.query().published().with('user', 'comments.author').withCount('comments').paginate(15, page)
 *   await Post.query().whereHas('comments', (q) => q.where('approved', true)).get()
 *   await post.tags().sync([1, 2, 3])
 *   await DB.transaction(async () => { await Post.create(…); await Log.create(…) })
 */
const path = require('path');
const fs = require('fs');
const { Builder, getConnection, Raw } = require('./query.js');
const { Collection } = require('./collection.js');
const { plural } = require('./schema.js');
const { BAD: BAD_KEYS } = require('../safe-json.js');

const snake = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
const studly = (s) => String(s).replace(/(^|[_-])(\w)/g, (_, __, c) => c.toUpperCase());
const singular = (s) => s.replace(/ies$/, 'y').replace(/(ss|sh|ch|x|z)es$/, '$1').replace(/s$/, '');
const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const cls = (M) => {
  if (typeof M === 'string') {
    const app = require('./app.js');
    const resolved = app.find(M, 'model') || app.find(M);
    if (!resolved) throw new Error(`Model "${M}" not found.`);
    return resolved;
  }
  return (M && M.default && typeof M.default === 'function' ? M.default : M);
};

class ModelNotFoundError extends Error {
  constructor(model, id) {
    super(`No query results for model [${model}]${id != null ? ' ' + id : ''}`);
    this.status = 404;
  }
}

// where the project's backend is (for factories); set by som dev / som serve / the som commands
let baseDir = null;
const setBaseDir = (dir) => { baseDir = dir; };
const getBaseDir = () => baseDir;

// the column details of each table (to turn 0/1 into true/false, and to know about created_at)
const tableInfo = new Map();
async function columnsOf(table) {
  const db = getConnection();
  const key = (db.file || db.kind) + '|' + table;
  if (!tableInfo.has(key)) {
    const t = (await db.tables()).find((x) => x.name === table);
    if (t) tableInfo.set(key, t.columns);
    else return [];
  }
  return tableInfo.get(key) || [];
}
async function tableExists(table) {
  const db = getConnection();
  const key = (db.file || db.kind) + '|' + table;
  if (tableInfo.has(key)) return true;
  const t = (await db.tables()).find((x) => x.name === table);
  if (t) {
    tableInfo.set(key, t.columns);
    return true;
  }
  return false;
}
const forgetTables = () => tableInfo.clear();

/* ------------------------------------------------------------------ hooks (model events) */
// static creating(model) on the model, or observers: static observers = [PostObserver] / Post.observe(PostObserver)
// return false from creating, updating, saving, deleting or restoring to stop it
async function fire(C, event, model) {
  const handlers = [];
  if (typeof C[event] === 'function') handlers.push((m) => C[event](m));
  for (const o of [...(C.observers || []), ...(C.__observers || [])]) {
    const inst = typeof o === 'function' ? new o() : o;
    if (typeof inst[event] === 'function') handlers.push((m) => inst[event](m));
  }
  for (const h of handlers) if ((await h(model)) === false) return false;
  return true;
}

/* ------------------------------------------------------------------ a relation's facts, without a parent */
function relationInfo(C, name) {
  const blank = new C();
  if (typeof blank[name] !== 'function') throw new Error(`${C.name} has no relation "${name}". Add a method: ${name}() { return this.hasMany(…) }`);
  const rel = blank[name]();
  if (!rel || !rel.__rel) throw new Error(`${C.name}.${name}() must return a relation (this.hasMany(…), this.belongsTo(…)…).`);
  return rel.__rel;
}
// the SQL that finds the related rows of the outer row: for has(), whereHas(), withCount()
function relatedSubquery(C, name, constrain, select = 'COUNT(*)') {
  const r = relationInfo(C, name);
  const R = r.Related;
  const sub = R.query();
  sub._columns = [new Raw(select)];
  const q = (x) => sub.q(x);
  const parent = C.table;
  if (r.type === 'hasMany' || r.type === 'hasOne') sub.whereColumn(`${R.table}.${r.foreignKey}`, `${parent}.${r.localKey}`);
  else if (r.type === 'belongsTo') sub.whereColumn(`${R.table}.${r.ownerKey}`, `${parent}.${r.foreignKey}`);
  else if (r.type === 'belongsToMany') sub.join(r.pivot, `${r.pivot}.${r.relatedPivotKey}`, `${R.table}.${r.relatedKey}`).whereColumn(`${r.pivot}.${r.foreignPivotKey}`, `${parent}.${r.parentKey}`);
  else if (r.type === 'hasManyThrough') sub.join(r.Through.table, `${r.Through.table}.${r.secondLocalKey}`, `${R.table}.${r.secondKey}`).whereColumn(`${r.Through.table}.${r.firstKey}`, `${parent}.${r.localKey}`);
  if (constrain) constrain(sub);
  void q;
  return sub.toSql();
}

/* ------------------------------------------------------------------ queries that give models */
class ModelBuilder extends Builder {
  constructor(model) {
    super(model.table);
    this._model = model;
    this._with = [];          // [{ name, constrain, nested: [...] }]
    this._withCounts = [];
    this._trashed = 'without';
    // scopes: static scopePublished(query, …) → query.published(…)
    for (let C = model; C && C !== Model; C = Object.getPrototypeOf(C)) {
      for (const key of Object.getOwnPropertyNames(C)) {
        if (!/^scope[A-Z]/.test(key) || typeof C[key] !== 'function') continue;
        const name = key[5].toLowerCase() + key.slice(6);
        if (name in this) continue;
        this[name] = function (...args) { model[key](this, ...args); return this; };
      }
    }
  }
  newQuery(table) { return new Builder(table || this._table, this._db); }
  clone() {
    const b = super.clone();
    b._with = [...this._with];
    b._withCounts = [...this._withCounts];
    return b;
  }

  // ---- eager loading: with('user', 'comments.author', { tags: (q) => q.orderBy('name') })
  with(...relations) {
    for (const r of relations.flat()) {
      if (typeof r === 'string') this._addWith(r.split('.'), null);
      else if (r && typeof r === 'object') Object.entries(r).forEach(([name, fn]) => this._addWith(name.split('.'), fn));
    }
    return this;
  }
  _addWith(parts, constrain, list = this._with) {
    const [head, ...rest] = parts;
    let entry = list.find((w) => w.name === head);
    if (!entry) { entry = { name: head, constrain: null, nested: [] }; list.push(entry); }
    if (rest.length) this._addWith(rest, constrain, entry.nested);
    else if (constrain) entry.constrain = constrain;
  }
  // withCount('comments') → each post gets comments_count;  withCount({ 'comments as approved_count': (q) => q.where('approved', true) })
  withCount(...relations) {
    for (const r of relations.flat()) {
      if (typeof r === 'string') this._withCounts.push({ name: r, constrain: null });
      else Object.entries(r).forEach(([name, constrain]) => this._withCounts.push({ name, constrain }));
    }
    return this;
  }
  // has('comments'), has('comments', '>=', 3), whereHas('comments', (q) => q.where('approved', true)), doesntHave('comments')
  has(name, op = '>=', count = 1, bool = 'and', constrain = null) {
    if (!['=', '!=', '<>', '<', '>', '<=', '>='].includes(op)) throw new Error(`Unknown operator "${op}" in has()`);
    const { sql, params } = relatedSubquery(this._model, name, constrain);
    return this._push(bool, `(${sql}) ${op} ?`, [...params, count]);
  }
  orHas(name, op, count) { return this.has(name, op, count, 'or'); }
  whereHas(name, constrain, op = '>=', count = 1) { return this.has(name, op, count, 'and', constrain); }
  orWhereHas(name, constrain, op = '>=', count = 1) { return this.has(name, op, count, 'or', constrain); }
  doesntHave(name) { return this.has(name, '<', 1); }
  whereDoesntHave(name, constrain) { return this.has(name, '<', 1, 'and', constrain); }

  // ---- soft deletes
  withTrashed() { this._trashed = 'with'; return this; }
  onlyTrashed() { this._trashed = 'only'; return this; }
  withoutTrashed() { this._trashed = 'without'; return this; }
  _whereSql() {
    const base = super._whereSql();
    const M = this._model;
    if (!M.softDeletes || this._trashed === 'with') return base;
    const col = `${this.q(M.table)}.${this.db.q(M.deletedAtColumn)}`;
    const cond = this._trashed === 'only' ? `${col} IS NOT NULL` : `${col} IS NULL`;
    return { sql: base.sql ? `(${base.sql}) AND ${cond}` : cond, params: base.params };
  }
  toSql() {
    if (!this._withCounts.length) return super.toSql();
    const b = this.clone();
    b._withCounts = [];
    if (b._columns.length === 1 && b._columns[0] === '*') b._columns = [`${this._model.table}.*`];
    for (const { name, constrain } of this._withCounts) {
      // 'comments as approved_count' names the column itself
      const [, rel, alias] = name.match(/^(\w+)(?:\s+as\s+(\w+))?$/i) || [null, name];
      const { sql, params } = relatedSubquery(this._model, rel, constrain);
      b._columns.push(new Raw(`(${sql}) AS ${this.db.q(alias || snake(rel) + '_count')}`, params));
    }
    return Builder.prototype.toSql.call(b);
  }

  // ---- reading
  async get() {
    const rows = await super.get();
    const models = Collection.from(await Promise.all(rows.map((r) => this._model.hydrate(r))));
    if (this._with.length && models.length) await this._model.eagerLoad(models, this._with);
    return models;
  }
  async find(id) { return Array.isArray(id) ? this.findMany(id) : this.clone().where(`${this._model.table}.${this._model.primaryKey}`, id).first(); }
  async findMany(ids) { return this.clone().whereIn(`${this._model.table}.${this._model.primaryKey}`, ids).get(); }
  async findOrFail(id) {
    const m = await this.find(id);
    if (!m) throw new ModelNotFoundError(this._model.name, id);
    return m;
  }
  async firstOrFail() {
    const m = await this.first();
    if (!m) throw new ModelNotFoundError(this._model.name);
    return m;
  }
  // paginate() and chunk() come from Builder: their rows come through get() above, so they are models too

  // ---- writing many rows at once (direct SQL update, model hooks don't run)
  async update(values) {
    const M = this._model;
    if (M.timestamps && values.updated_at === undefined && (await columnsOf(M.table)).some((c) => c.name === 'updated_at')) values = { ...values, updated_at: now() };
    return super.update(values);
  }
  async delete() {
    const M = this._model;
    if (M.softDeletes) return Builder.prototype.update.call(this, { [M.deletedAtColumn]: now() });
    return super.delete();
  }
  async forceDelete() { return Builder.prototype.delete.call(this); }
  async restore() { const M = this._model; const b = this.clone(); b._trashed = 'only'; return Builder.prototype.update.call(b, { [M.deletedAtColumn]: null }); }
}

/* ------------------------------------------------------------------ the model */
class Model {
  // ---- settings a model can change
  static get table() { return plural(snake(this.name)); }   // Post → posts, BlogPost → blog_posts
  static primaryKey = 'id';
  static fillable = null;      // null: everything except `guarded`
  static guarded = ['id'];
  static hidden = [];
  static visible = null;       // a list: only these go into the JSON
  static appends = [];         // computed values for the JSON: getXAttribute()
  static casts = {};
  static timestamps = true;    // fills created_at / updated_at when the table has them
  static softDeletes = false;  // delete() fills deleted_at instead of removing the row
  static deletedAtColumn = 'deleted_at';
  static perPage = 15;

  // ---- starting a query
  static query() { return new ModelBuilder(this); }
  static all() { return this.query().get(); }
  static find(id) { return this.query().find(id); }
  static findMany(ids) { return this.query().findMany(ids); }
  static findOrFail(id) { return this.query().findOrFail(id); }
  static first() { return this.query().first(); }
  static firstOrFail() { return this.query().firstOrFail(); }
  static count() { return this.query().count(); }
  static exists() { return this.query().exists(); }
  static paginate(perPage = this.perPage, page) { return this.query().paginate(perPage, page); }
  static simplePaginate(perPage = this.perPage, page) { return this.query().simplePaginate(perPage, page); }
  static chunk(size, fn) { return this.query().chunk(size, fn); }
  static pluck(column, key) { return this.query().pluck(column, key); }
  static max(c) { return this.query().max(c); }
  static min(c) { return this.query().min(c); }
  static sum(c) { return this.query().sum(c); }
  static avg(c) { return this.query().avg(c); }
  static with(...r) { return this.query().with(...r); }
  static withCount(...r) { return this.query().withCount(...r); }
  static has(...a) { return this.query().has(...a); }
  static whereHas(...a) { return this.query().whereHas(...a); }
  static doesntHave(...a) { return this.query().doesntHave(...a); }
  static whereDoesntHave(...a) { return this.query().whereDoesntHave(...a); }
  static withTrashed() { return this.query().withTrashed(); }
  static onlyTrashed() { return this.query().onlyTrashed(); }
  static withoutTrashed() { return this.query().withoutTrashed(); }
  static restore() { return this.query().restore(); }
  static select(...c) { return this.query().select(...c); }
  static join(...a) { return this.query().join(...a); }
  static orderBy(c, d) { return this.query().orderBy(c, d); }
  static orderByDesc(c) { return this.query().orderByDesc(c); }
  static latest(c) { return this.query().latest(c); }
  static oldest(c) { return this.query().oldest(c); }
  static inRandomOrder() { return this.query().inRandomOrder(); }
  static limit(n) { return this.query().limit(n); }
  static take(n) { return this.query().take(n); }
  static when(...a) { return this.query().when(...a); }
  static where(...a) { return this.query().where(...a); }
  static orWhere(...a) { return this.query().orWhere(...a); }
  static whereIn(...a) { return this.query().whereIn(...a); }
  static whereNotIn(...a) { return this.query().whereNotIn(...a); }
  static whereNull(c) { return this.query().whereNull(c); }
  static whereNotNull(c) { return this.query().whereNotNull(c); }
  static whereBetween(c, r) { return this.query().whereBetween(c, r); }
  static whereLike(c, v) { return this.query().whereLike(c, v); }
  static whereDate(...a) { return this.query().whereDate(...a); }
  static scope(name, ...args) { const q = this.query(); if (typeof q[name] !== 'function') throw new Error(`${this.name} has no scope "${name}" (static scope${studly(name)}(query) { … })`); return q[name](...args); }
  // observers: Post.observe(PostObserver) → its creating(post), created(post)… run too
  static observe(...observers) { if (!Object.prototype.hasOwnProperty.call(this, '__observers')) this.__observers = []; this.__observers.push(...observers.flat()); }

  // ---- making rows
  static async create(attributes = {}) {
    const m = new this();
    m.fill(attributes);
    await m.save();
    return m;
  }
  static async createMany(list = []) { const out = new Collection(); for (const a of list) out.push(await this.create(a)); return out; }
  static async firstOrNew(match, extra = {}) { return (await this.where(match).first()) || new this({ ...match, ...extra }); }
  static async firstOrCreate(match, extra = {}) {
    return (await this.where(match).first()) || this.create({ ...match, ...extra });
  }
  static async updateOrCreate(match, values) {
    const m = await this.where(match).first();
    if (m) { await m.update(values); return m; }
    return this.create({ ...match, ...values });
  }
  static async destroy(...ids) {
    let n = 0;
    for (const m of await this.query().whereIn(this.primaryKey, ids.flat()).get()) if (await m.delete()) n++;
    return n;
  }
  // factories: User.factory().count(10).create()  (database/factories/UserFactory.js)
  static factory(count) {
    const { Factory } = require('./factory.js');
    const f = Factory.for(this);
    return count ? f.count(count) : f;
  }

  // a database row → a model (with casts applied)
  static async hydrate(row) {
    const m = new this();
    const cols = await columnsOf(this.table);
    const pivot = {};
    for (const [k, v] of Object.entries(row)) {
      if (k.startsWith('pivot_')) { pivot[k.slice(6)] = v; continue; }
      if (k === '__som_parent') continue;
      m[k] = castOut(this, k, v, cols);
    }
    if (Object.keys(pivot).length) Object.defineProperty(m, 'pivot', { value: pivot, enumerable: false, writable: true, configurable: true });
    if (row.__som_parent !== undefined) Object.defineProperty(m, '__som_parent', { value: row.__som_parent, enumerable: false, writable: true, configurable: true });
    m.__exists = true;
    m.syncOriginal();
    return m;
  }

  constructor(attributes) {
    Object.defineProperty(this, '__exists', { value: false, writable: true, enumerable: false });
    Object.defineProperty(this, '__relations', { value: {}, writable: true, enumerable: false });
    Object.defineProperty(this, '__original', { value: {}, writable: true, enumerable: false });
    Object.defineProperty(this, '__extraHidden', { value: null, writable: true, enumerable: false });
    Object.defineProperty(this, 'wasRecentlyCreated', { value: false, writable: true, enumerable: false });
    if (attributes) this.fill(attributes);
  }
  get exists() { return this.__exists; }
  get trashed() { const C = this.constructor; return Boolean(C.softDeletes && this[C.deletedAtColumn]); }

  // fill({ … }): only fillable keys; setXAttribute(value) mutators run here
  fill(attributes = {}) {
    const C = this.constructor;
    for (const [k, v] of Object.entries(attributes)) {
      if (BAD_KEYS.has(k)) continue;
      const allowed = C.fillable ? C.fillable.includes(k) : !(C.guarded || []).includes(k) && !(C.guarded || []).includes('*');
      if (allowed) this.setAttribute(k, v);
    }
    return this;
  }
  forceFill(attributes = {}) { for (const [k, v] of Object.entries(attributes)) if (!BAD_KEYS.has(k)) this.setAttribute(k, v); return this; }
  setAttribute(key, value) {
    const mutator = this[`set${studly(key)}Attribute`];
    this[key] = typeof mutator === 'function' ? mutator.call(this, value) : value;
    return this;
  }
  getAttribute(key) {
    const accessor = this[`get${studly(key)}Attribute`];
    return typeof accessor === 'function' ? accessor.call(this) : this[key];
  }
  // the columns to write: own values, not relations
  attributes() {
    const out = {};
    for (const k of Object.keys(this)) if (!(k in this.__relations)) out[k] = this[k];
    return out;
  }
  // what changed since it was read: isDirty(), isDirty('title'), getDirty(), getOriginal('title')
  syncOriginal() { this.__original = JSON.parse(JSON.stringify(this.attributes())); return this; }
  getOriginal(key) { return key ? this.__original[key] : { ...this.__original }; }
  getDirty() {
    const out = {};
    for (const [k, v] of Object.entries(this.attributes())) if (JSON.stringify(v) !== JSON.stringify(this.__original[k])) out[k] = v;
    return out;
  }
  isDirty(...keys) { const d = this.getDirty(); return keys.length ? keys.flat().some((k) => k in d) : Object.keys(d).length > 0; }
  isClean(...keys) { return !this.isDirty(...keys); }

  async save() {
    const C = this.constructor;
    const creating = !this.__exists;
    if ((await fire(C, 'saving', this)) === false) return false;
    if ((await fire(C, creating ? 'creating' : 'updating', this)) === false) return false;
    if (!(await tableExists(C.table))) {
      throw new Error(`Table "${C.table}" does not exist in the database. Run "som migrate" to create it.`);
    }
    const cols = await columnsOf(C.table);
    const has = (c) => cols.some((x) => x.name === c);
    const source = creating ? this.attributes() : this.getDirty();
    const values = {};
    for (const [k, v] of Object.entries(source)) if (!cols.length || has(k)) values[k] = castIn(C, k, v);
    const q = new Builder(C.table);
    if (!creating) {
      delete values[C.primaryKey];
      if (!Object.keys(values).length) { await fire(C, 'saved', this); return this; } // nothing changed
      if (C.timestamps && has('updated_at')) values.updated_at = now();
      await q.where(C.primaryKey, this[C.primaryKey]).update(values);
    } else {
      if (C.timestamps && has('updated_at') && values.updated_at == null) values.updated_at = now();
      if (C.timestamps && has('created_at') && values.created_at == null) values.created_at = now();
      const id = await q.insert(values);
      if (id != null && this[C.primaryKey] == null) this[C.primaryKey] = id;
      this.__exists = true;
      this.wasRecentlyCreated = true;
    }
    await this.refresh(); // defaults the database filled in, in their real types
    await fire(C, creating ? 'created' : 'updated', this);
    await fire(C, 'saved', this);
    return this;
  }
  async update(attributes = {}) { this.fill(attributes); return this.save(); }
  async touch() { const C = this.constructor; if ((await columnsOf(C.table)).some((c) => c.name === 'updated_at')) { await new Builder(C.table).where(C.primaryKey, this[C.primaryKey]).update({ updated_at: now() }); await this.refresh(); } return this; }
  async increment(column, by = 1) { const C = this.constructor; await new Builder(C.table).where(C.primaryKey, this[C.primaryKey]).increment(column, by); return this.refresh(); }
  async decrement(column, by = 1) { return this.increment(column, -by); }
  async delete() {
    const C = this.constructor;
    if (!this.__exists) return false;
    if ((await fire(C, 'deleting', this)) === false) return false;
    if (C.softDeletes) {
      await new Builder(C.table).where(C.primaryKey, this[C.primaryKey]).update({ [C.deletedAtColumn]: now() });
      await this.refresh();
    } else {
      await new Builder(C.table).where(C.primaryKey, this[C.primaryKey]).delete();
      this.__exists = false;
    }
    await fire(C, 'deleted', this);
    return true;
  }
  async forceDelete() {
    const C = this.constructor;
    if ((await fire(C, 'deleting', this)) === false) return false;
    await new Builder(C.table).where(C.primaryKey, this[C.primaryKey]).delete();
    this.__exists = false;
    await fire(C, 'forceDeleted', this);
    await fire(C, 'deleted', this);
    return true;
  }
  async restore() {
    const C = this.constructor;
    if (!C.softDeletes) return false;
    if ((await fire(C, 'restoring', this)) === false) return false;
    await new Builder(C.table).where(C.primaryKey, this[C.primaryKey]).update({ [C.deletedAtColumn]: null });
    await this.refresh();
    await fire(C, 'restored', this);
    return true;
  }
  async refresh() {
    const C = this.constructor;
    const row = await new Builder(C.table).where(C.primaryKey, this[C.primaryKey]).first();
    if (row) {
      const fresh = await C.hydrate(row);
      Object.keys(this).forEach((k) => { if (!(k in this.__relations)) delete this[k]; }); // keep the table's column order
      Object.keys(fresh).forEach((k) => (this[k] = fresh[k]));
      this.syncOriginal();
    }
    return this;
  }
  async fresh(...relations) { const C = this.constructor; const q = C.query().withTrashed(); if (relations.length) q.with(...relations); return q.find(this[C.primaryKey]); }
  replicate(...except) { const C = this.constructor; const skip = new Set([C.primaryKey, 'created_at', 'updated_at', ...except.flat()]); const copy = new C(); for (const [k, v] of Object.entries(this.attributes())) if (!skip.has(k)) copy[k] = v; return copy; }
  is(other) { return !!other && other.constructor === this.constructor && other[this.constructor.primaryKey] === this[this.constructor.primaryKey]; }
  isNot(other) { return !this.is(other); }
  async load(...relations) { const b = this.constructor.query().with(...relations); await this.constructor.eagerLoad([this], b._with); return this; }
  async loadCount(...relations) {
    const C = this.constructor;
    const row = await C.query().withCount(...relations).where(`${C.table}.${C.primaryKey}`, this[C.primaryKey]).withTrashed().first();
    relations.flat().forEach((r) => { const k = snake(typeof r === 'string' ? r : Object.keys(r)[0]) + '_count'; if (row) this[k] = row[k]; });
    return this;
  }

  // ---- what goes back to the browser: no hidden columns, plus `appends`
  makeHidden(...keys) { this.__extraHidden = { ...(this.__extraHidden || {}), hide: [...((this.__extraHidden || {}).hide || []), ...keys.flat()] }; return this; }
  makeVisible(...keys) { this.__extraHidden = { ...(this.__extraHidden || {}), show: [...((this.__extraHidden || {}).show || []), ...keys.flat()] }; return this; }
  toJSON() {
    const C = this.constructor;
    const extra = this.__extraHidden || {};
    const hidden = new Set([...(C.hidden || []), ...(extra.hide || [])].filter((k) => !(extra.show || []).includes(k)));
    const out = {};
    for (const k of Object.keys(this)) {
      if (hidden.has(k)) continue;
      if (C.visible && !C.visible.includes(k) && !(k in this.__relations)) continue;
      out[k] = this[k];
    }
    for (const k of C.appends || []) if (!hidden.has(k)) out[k] = this.getAttribute(k);
    if (this.pivot) out.pivot = this.pivot;
    return out;
  }

  // ---- notifications: user.notify(new InvoicePaid(invoice)), user.notifications(), user.unreadNotifications()
  async notify(notification) { return require('./notifications.js').Notification.send(this, notification); }
  async notifyNow(notification) { return require('./notifications.js').sendNow(this, notification); }
  notifications() {
    const C = this.constructor;
    const q = new Builder('notifications').where('notifiable_type', C.name).where('notifiable_id', this[C.primaryKey]).orderBy('created_at', 'desc');
    const get = q.get.bind(q);
    q.get = async () => (await get()).map((n) => ({ ...n, data: typeof n.data === 'string' ? safeJson(n.data) : n.data }));
    return q;
  }
  unreadNotifications() { return this.notifications().whereNull('read_at'); }

  // ---- relations
  hasMany(Related, foreignKey, localKey) {
    Related = cls(Related);
    const C = this.constructor;
    foreignKey = foreignKey || snake(C.name) + '_id';
    localKey = localKey || C.primaryKey;
    return relation(Related.query().where(`${Related.table}.${foreignKey}`, this[localKey] ?? null), { type: 'hasMany', Related, foreignKey, localKey, parent: this });
  }
  hasOne(Related, foreignKey, localKey) {
    const r = this.hasMany(Related, foreignKey, localKey);
    r.__rel.type = 'hasOne';
    return r;
  }
  belongsTo(Related, foreignKey, ownerKey) {
    Related = cls(Related);
    foreignKey = foreignKey || snake(Related.name) + '_id';
    ownerKey = ownerKey || Related.primaryKey;
    return relation(Related.query().where(`${Related.table}.${ownerKey}`, this[foreignKey] ?? null), { type: 'belongsTo', Related, foreignKey, ownerKey, parent: this });
  }
  // many-to-many through a pivot table: posts ↔ tags through post_tag (the two names, singular, a–z)
  belongsToMany(Related, pivot, foreignPivotKey, relatedPivotKey, parentKey, relatedKey) {
    Related = cls(Related);
    const C = this.constructor;
    pivot = pivot || [snake(C.name), snake(Related.name)].sort().join('_');
    foreignPivotKey = foreignPivotKey || snake(C.name) + '_id';
    relatedPivotKey = relatedPivotKey || snake(Related.name) + '_id';
    parentKey = parentKey || C.primaryKey;
    relatedKey = relatedKey || Related.primaryKey;
    const rel = { type: 'belongsToMany', Related, pivot, foreignPivotKey, relatedPivotKey, parentKey, relatedKey, parent: this, pivotColumns: [], pivotTimestamps: false };
    const b = Related.query()
      .join(pivot, `${pivot}.${relatedPivotKey}`, `${Related.table}.${relatedKey}`)
      .where(`${pivot}.${foreignPivotKey}`, this[parentKey] ?? null)
      .select(`${Related.table}.*`, `${pivot}.${foreignPivotKey} as pivot_${foreignPivotKey}`, `${pivot}.${relatedPivotKey} as pivot_${relatedPivotKey}`);
    return pivotRelation(relation(b, rel));
  }
  // countries → users → posts: country.posts() with this.hasManyThrough(Post, User)
  hasManyThrough(Related, Through, firstKey, secondKey, localKey, secondLocalKey) {
    Related = cls(Related);
    Through = cls(Through);
    const C = this.constructor;
    firstKey = firstKey || snake(C.name) + '_id';            // on the through table, pointing here
    secondKey = secondKey || snake(Through.name) + '_id';     // on the related table, pointing to through
    localKey = localKey || C.primaryKey;
    secondLocalKey = secondLocalKey || Through.primaryKey;
    const b = Related.query()
      .join(Through.table, `${Through.table}.${secondLocalKey}`, `${Related.table}.${secondKey}`)
      .where(`${Through.table}.${firstKey}`, this[localKey] ?? null)
      .select(`${Related.table}.*`);
    return relation(b, { type: 'hasManyThrough', Related, Through, firstKey, secondKey, localKey, secondLocalKey, parent: this });
  }

  // with('user', 'comments.author'): one query per relation for all the models
  static async eagerLoad(models, list) {
    for (const w of list) {
      if (typeof models[0][w.name] !== 'function' && !(w.name in models[0].__relations)) throw new Error(`${this.name} has no relation "${w.name}". Add a method: ${w.name}() { return this.hasMany(…) }`);
      const r = relationInfo(this, w.name);
      const R = r.Related;
      let found;
      const q = R.query();
      if (w.constrain) w.constrain(q);
      if (r.type === 'belongsTo') {
        const ids = [...new Set(models.map((m) => m[r.foreignKey]).filter((v) => v != null))];
        found = ids.length ? await q.whereIn(`${R.table}.${r.ownerKey}`, ids).get() : new Collection();
        models.forEach((m) => setRelation(m, w.name, found.find((f) => keyEq(f[r.ownerKey], m[r.foreignKey])) || null));
      } else if (r.type === 'belongsToMany') {
        const ids = [...new Set(models.map((m) => m[r.parentKey]).filter((v) => v != null))];
        q.join(r.pivot, `${r.pivot}.${r.relatedPivotKey}`, `${R.table}.${r.relatedKey}`).whereIn(`${r.pivot}.${r.foreignPivotKey}`, ids);
        if (q._columns.length === 1 && q._columns[0] === '*') q._columns = [`${R.table}.*`];
        q.addSelect(`${r.pivot}.${r.foreignPivotKey} as pivot_${r.foreignPivotKey}`, `${r.pivot}.${r.relatedPivotKey} as pivot_${r.relatedPivotKey}`, ...pivotSelects(r));
        found = ids.length ? await q.get() : new Collection();
        models.forEach((m) => setRelation(m, w.name, found.filter((f) => f.pivot && keyEq(f.pivot[r.foreignPivotKey], m[r.parentKey]))));
      } else if (r.type === 'hasManyThrough') {
        const ids = [...new Set(models.map((m) => m[r.localKey]).filter((v) => v != null))];
        q.join(r.Through.table, `${r.Through.table}.${r.secondLocalKey}`, `${R.table}.${r.secondKey}`).whereIn(`${r.Through.table}.${r.firstKey}`, ids);
        if (q._columns.length === 1 && q._columns[0] === '*') q._columns = [`${R.table}.*`];
        q.addSelect(`${r.Through.table}.${r.firstKey} as __som_parent`);
        found = ids.length ? await q.get() : new Collection();
        models.forEach((m) => setRelation(m, w.name, found.filter((f) => keyEq(f.__som_parent, m[r.localKey]))));
      } else {
        const ids = [...new Set(models.map((m) => m[r.localKey]).filter((v) => v != null))];
        found = ids.length ? await q.whereIn(`${R.table}.${r.foreignKey}`, ids).get() : new Collection();
        models.forEach((m) => {
          const mine = found.filter((f) => keyEq(f[r.foreignKey], m[r.localKey]));
          setRelation(m, w.name, r.type === 'hasOne' ? mine[0] || null : mine);
        });
      }
      if (w.nested.length && found && found.length) await R.eagerLoad(found, w.nested);
    }
  }
}
const keyEq = (a, b) => a != null && b != null && String(a) === String(b);
const pivotSelects = (r) => [...r.pivotColumns, ...(r.pivotTimestamps ? ['created_at', 'updated_at'] : [])].map((c) => `${r.pivot}.${c} as pivot_${c}`);

// a relation is a query with a little more: post.comments().create({...}) fills in post_id
function relation(builder, rel) {
  builder.__rel = rel;
  if (rel.type === 'hasMany' || rel.type === 'hasOne') {
    builder.create = (attributes = {}) => rel.Related.create({ ...attributes, [rel.foreignKey]: rel.parent[rel.localKey] });
    builder.createMany = async (list) => { const out = new Collection(); for (const a of list) out.push(await builder.create(a)); return out; };
    builder.make = (attributes = {}) => new rel.Related({ ...attributes, [rel.foreignKey]: rel.parent[rel.localKey] });
    builder.save = async (model) => { model[rel.foreignKey] = rel.parent[rel.localKey]; return model.save(); };
  }
  if (rel.type === 'belongsTo') {
    // comment.post().associate(post) then comment.save()
    builder.associate = (model) => { rel.parent[rel.foreignKey] = model ? model[rel.ownerKey] : null; return rel.parent; };
    builder.dissociate = () => { rel.parent[rel.foreignKey] = null; return rel.parent; };
  }
  return builder;
}
// post.tags().attach(3), .attach([1, 2], { role: 'x' }), .detach(2), .detach(), .sync([1, 2]), .toggle([2, 3])
function pivotRelation(b) {
  const r = b.__rel;
  const ids = (v) => [].concat(v).map((x) => (x && typeof x === 'object' ? x[r.relatedKey] : x));
  const pivotQ = () => new Builder(r.pivot).where(r.foreignPivotKey, r.parent[r.parentKey]);
  b.withPivot = (...columns) => { r.pivotColumns.push(...columns.flat()); b.addSelect(...columns.flat().map((c) => `${r.pivot}.${c} as pivot_${c}`)); return b; };
  b.withTimestamps = () => { r.pivotTimestamps = true; b.addSelect(`${r.pivot}.created_at as pivot_created_at`, `${r.pivot}.updated_at as pivot_updated_at`); return b; };
  b.wherePivot = (column, op, value) => b.where(`${r.pivot}.${column}`, op, value);
  b.attach = async (value, extra = {}) => {
    const stamp = r.pivotTimestamps ? { created_at: now(), updated_at: now() } : {};
    const list = Array.isArray(value) || typeof value !== 'object' || value === null || value[r.relatedKey] !== undefined
      ? ids(value).map((id) => [id, extra])
      : Object.entries(value).map(([id, more]) => [id, { ...extra, ...more }]); // attach({ 1: { role: 'x' }, 2: {} })
    for (const [id, more] of list) await new Builder(r.pivot).insert({ [r.foreignPivotKey]: r.parent[r.parentKey], [r.relatedPivotKey]: id, ...stamp, ...more });
  };
  b.detach = async (value) => { const q = pivotQ(); if (value !== undefined) q.whereIn(r.relatedPivotKey, ids(value)); return q.delete(); };
  b.sync = async (value, detaching = true) => {
    const want = ids(value).map(String);
    const have = (await pivotQ().pluck(r.relatedPivotKey)).map(String);
    const attached = want.filter((id) => !have.includes(id));
    const detached = detaching ? have.filter((id) => !want.includes(id)) : [];
    if (detached.length) await pivotQ().whereIn(r.relatedPivotKey, detached).delete();
    if (attached.length) await b.attach(attached);
    return { attached, detached };
  };
  b.syncWithoutDetaching = (value) => b.sync(value, false);
  b.toggle = async (value) => {
    const have = new Set((await pivotQ().pluck(r.relatedPivotKey)).map(String));
    const add = ids(value).map(String).filter((id) => !have.has(id));
    const remove = ids(value).map(String).filter((id) => have.has(id));
    if (remove.length) await pivotQ().whereIn(r.relatedPivotKey, remove).delete();
    if (add.length) await b.attach(add);
    return { attached: add, detached: remove };
  };
  b.updateExistingPivot = (id, values) => pivotQ().where(r.relatedPivotKey, id).update(values);
  return b;
}
function setRelation(model, name, value) {
  model.__relations[name] = true;
  // shadow the method with the loaded value, so post.comments is the list
  Object.defineProperty(model, name, { value, enumerable: true, writable: true, configurable: true });
}

// casts: database value ↔ JavaScript value
function castOut(C, key, v, cols) {
  const cast = (C.casts || {})[key] || ((cols.find((c) => c.name === key) || {}).bool ? 'boolean' : null);
  if (v == null || !cast) return v;
  const [kind, arg] = String(cast).split(':');
  switch (kind) {
    case 'boolean': case 'bool': return v === true || v === 1 || v === '1' || v === 't' || v === 'true';
    case 'integer': case 'int': return parseInt(v, 10);
    case 'float': case 'double': case 'real': return Number(v);
    case 'decimal': return arg ? Number(v).toFixed(Number(arg)) : Number(v);
    case 'json': case 'array': case 'object': case 'collection': { const val = typeof v === 'string' ? safeJson(v) : v; return kind === 'collection' && Array.isArray(val) ? Collection.from(val) : val; }
    case 'date': return v instanceof Date ? v.toISOString().slice(0, 10) : v;
    // stored as UTC: 2026-10-29T08:30:00.000Z (new Date(…) reads it right in any time zone)
    case 'datetime': case 'timestamp': return toIso(v);
    case 'string': return String(v);
    case 'safe_html': case 'html': { const { SafeHtml } = require('./html.js'); return SafeHtml.raw(String(v)); }
    case 'escape_html': case 'escape': { const { escapeHtml } = require('./html.js'); return escapeHtml(String(v)); }
    case 'strip_html': case 'strip_tags': { const { stripTags } = require('./html.js'); return stripTags(String(v)); }
    default: return v;
  }
}
function castIn(C, key, v) {
  const cast = String((C.casts || {})[key] || '').split(':')[0];
  if (v == null) return v;
  if (['safe_html', 'html'].includes(cast)) { const { cleanHtml } = require('./html.js'); return cleanHtml(String(v)); }
  if (['escape_html', 'escape'].includes(cast)) { const { escapeHtml } = require('./html.js'); return escapeHtml(String(v)); }
  if (['strip_html', 'strip_tags'].includes(cast)) { const { stripTags } = require('./html.js'); return stripTags(String(v)); }
  if (['json', 'array', 'object', 'collection'].includes(cast) && typeof v !== 'string') return JSON.stringify(v);
  if (v instanceof Date) return v.toISOString().slice(0, 19).replace('T', ' ');
  if ((cast === 'datetime' || cast === 'timestamp') && typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v)) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 19).replace('T', ' ');
  }
  if (v instanceof Raw) return v;
  if (typeof v === 'object' && !Buffer.isBuffer(v)) return JSON.stringify(v);
  return v;
}
function toIso(v) {
  if (v instanceof Date) return v.toISOString();
  const m = String(v).match(/^(\d{4}-\d\d-\d\d)[ T](\d\d:\d\d:\d\d(?:\.\d+)?)(Z|[+-]\d\d:?\d\d)?$/);
  if (!m) return v;
  const d = new Date(`${m[1]}T${m[2]}${m[3] || 'Z'}`);
  return Number.isNaN(d.getTime()) ? v : d.toISOString();
}
const safeJson = (s) => { try { return JSON.parse(s); } catch (_) { return s; } };

// where a factory file is: database/factories/UserFactory.js (or .ts)
function factoryFile(name) {
  if (!baseDir) return null;
  for (const ext of ['.js', '.cjs', '.ts']) {
    const f = path.join(baseDir, 'database', 'factories', name + 'Factory' + ext);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

module.exports = { Model, ModelBuilder, ModelNotFoundError, forgetTables, snake, studly, singular, setBaseDir, getBaseDir, factoryFile, castIn, castOut };
