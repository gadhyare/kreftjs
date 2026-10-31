/*
 * Model factories: rows for tests and seeders.
 *
 *   // database/factories/UserFactory.js
 *   const { Factory, Hash } = require('somjs/server')
 *   const User = require('../../app/Models/User')
 *   module.exports = Factory.define(User, (fake) => ({
 *     name: fake.name(),
 *     email: fake.unique().email(),
 *     password: Hash.make('password'),
 *   }))
 *     .state('admin', { is_admin: true })              // User.factory().admin().create()
 *
 *   await User.factory().count(10).create()
 *   await User.factory().state({ is_admin: true }).create({ name: 'Maxamuud' })
 *   const draft = await Post.factory().make()          // not saved
 *   await Post.factory().count(3).for(user).create()   // user_id filled in
 *   await User.factory().has(Post.factory().count(3), 'posts').create()
 */
const { fake } = require('./fake.js');
const { Collection } = require('./collection.js');

const definitions = new Map(); // Model → { define, states }

class Factory {
  static define(Model, define) {
    if (Model && Model.default) Model = Model.default;
    const def = { Model, define, states: {} };
    definitions.set(Model, def);
    const api = {
      state(name, values) { def.states[name] = values; return api; },
      Model,
    };
    return api;
  }
  static for(Model) {
    if (Model && Model.default) Model = Model.default;
    let def = definitions.get(Model);
    if (!def) {
      const { factoryFile } = require('./model.js');
      const file = factoryFile(Model.name);
      if (file) { require(file); def = definitions.get(Model); }
    }
    if (!def) throw new Error(`No factory for ${Model.name}. Make one: som make:factory ${Model.name}Factory`);
    return new Factory(def);
  }
  constructor(def) {
    this.def = def;
    this.n = null;
    this.states = [];
    this.parents = [];
    this.children = [];
    this.seq = null;
    // named states become methods: User.factory().admin()
    for (const name of Object.keys(def.states)) if (!(name in this)) this[name] = () => this.state(def.states[name]);
  }
  clone() { const f = new Factory(this.def); Object.assign(f, { n: this.n, states: [...this.states], parents: [...this.parents], children: [...this.children], seq: this.seq }); return f; }
  count(n) { const f = this.clone(); f.n = n; return f; }
  state(values) { const f = this.clone(); f.states.push(values); return f; }
  // sequence({ role: 'a' }, { role: 'b' }): row 1 gets the first, row 2 the second, then again
  sequence(...values) { const f = this.clone(); f.seq = values; return f; }
  // for(user) or for(user, 'author_id'): belongs to that model
  for(parent, key) { const f = this.clone(); f.parents.push({ parent, key }); return f; }
  // has(Post.factory().count(3), 'posts'): made after each row, through the relation
  has(child, relationName) { const f = this.clone(); f.children.push({ child, relationName }); return f; }

  attributes(i, extra) {
    let attrs = { ...this.def.define(fake, i) };
    for (const [k, v] of Object.entries(attrs)) {
      if (typeof v === 'function') attrs[k] = v(attrs, fake, i);
    }
    for (const s of this.states) attrs = { ...attrs, ...(typeof s === 'function' ? s(attrs, fake) : s) };
    if (this.seq) { const s = this.seq[i % this.seq.length]; attrs = { ...attrs, ...(typeof s === 'function' ? s(i) : s) }; }
    for (const { parent, key } of this.parents) {
      const k = key || require('./model.js').snake(parent.constructor.name) + '_id';
      attrs[k] = parent[parent.constructor.primaryKey];
    }
    return { ...attrs, ...(extra || {}) };
  }
  // raw(): just the values
  raw(extra) { return this.n == null ? this.attributes(0, extra) : Array.from({ length: this.n }, (_, i) => this.attributes(i, extra)); }
  // make(): models, not saved
  async make(extra) {
    const one = (i) => new this.def.Model().forceFill(this.attributes(i, extra));
    return this.n == null ? one(0) : Collection.from(Array.from({ length: this.n }, (_, i) => one(i)));
  }
  // create(): saved (hooks run); fields that aren't fillable are still set
  async create(extra) {
    const made = new Collection();
    for (let i = 0; i < (this.n == null ? 1 : this.n); i++) {
      const m = new this.def.Model().forceFill(this.attributes(i, extra));
      await m.save();
      for (const { child, relationName } of this.children) {
        const name = relationName || require('./model.js').singular(child.def.Model.table) + 's';
        const rel = m[name]();
        const key = rel.__rel.foreignKey;
        await child.state({ [key]: m[rel.__rel.localKey] }).create();
      }
      made.push(m);
    }
    return this.n == null ? made[0] : made;
  }
}

module.exports = { Factory };
