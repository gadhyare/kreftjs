/*
 * Collections: a powerful Array wrapper with fluent data-manipulation helpers.
 * a real array (map, filter, for…of and JSON all work as usual).
 *
 *   const posts = await Post.all()
 *   posts.pluck('title')                 posts.where('published', true)      posts.sortByDesc('likes')
 *   posts.groupBy('user_id')             posts.keyBy('id')                    posts.sum('likes')
 *   collect([1, 2, 3]).chunk(2)          posts.first()  posts.isEmpty()       posts.unique('user_id')
 */
const isBadKey = (k) => k === '__proto__' || k === 'constructor' || k === 'prototype';
const get = (item, key) => (typeof key === 'function' ? key(item) : key == null ? item : String(key).split('.').reduce((o, k) => (o == null || isBadKey(k) ? undefined : o[k]), item));
const compare = (a, op, b) => {
  switch (op) {
    case '=': case '==': return a == b; // eslint-disable-line eqeqeq
    case '===': return a === b;
    case '!=': case '<>': return a != b; // eslint-disable-line eqeqeq
    case '!==': return a !== b;
    case '<': return a < b;
    case '>': return a > b;
    case '<=': return a <= b;
    case '>=': return a >= b;
    default: throw new Error(`Unknown operator "${op}"`);
  }
};

class Collection extends Array {
  static make(items = []) { return Collection.from(items); }

  all() { return Array.from(this); }
  toArray() { return Array.from(this, (x) => (x && typeof x.toJSON === 'function' ? x.toJSON() : x)); }
  count() { return this.length; }
  isEmpty() { return this.length === 0; }
  isNotEmpty() { return this.length > 0; }

  first(fn) { return fn ? this.find(fn) ?? null : this[0] ?? null; }
  last(fn) { const list = fn ? this.filter(fn) : this; return list[list.length - 1] ?? null; }
  firstWhere(key, op, value) { return this.where(key, op, value).first(); }
  pluck(key, by) {
    if (by) return Object.fromEntries(this.map((x) => [get(x, by), get(x, key)]).filter(([k]) => !isBadKey(String(k))));
    return Collection.from(this, (x) => get(x, key));
  }
  where(key, op, value) {
    if (value === undefined) { value = op; op = '='; }
    return this.filter((x) => compare(get(x, key), op, value));
  }
  whereIn(key, values) { const set = new Set(values); return this.filter((x) => set.has(get(x, key))); }
  whereNotIn(key, values) { const set = new Set(values); return this.filter((x) => !set.has(get(x, key))); }
  whereNull(key) { return this.filter((x) => get(x, key) == null); }
  whereNotNull(key) { return this.filter((x) => get(x, key) != null); }
  reject(fn) { return this.filter((x, i) => !fn(x, i)); }
  contains(key, value) {
    if (typeof key === 'function') return this.some(key);
    if (value === undefined) return this.includes(key);
    return this.some((x) => get(x, key) == value); // eslint-disable-line eqeqeq
  }

  sum(key) { return this.reduce((t, x) => t + (Number(get(x, key)) || 0), 0); }
  avg(key) { return this.length ? this.sum(key) / this.length : null; }
  average(key) { return this.avg(key); }
  min(key) { const v = this.map((x) => get(x, key)).filter((x) => x != null); return v.length ? v.reduce((a, b) => (b < a ? b : a)) : null; }
  max(key) { const v = this.map((x) => get(x, key)).filter((x) => x != null); return v.length ? v.reduce((a, b) => (b > a ? b : a)) : null; }

  sortBy(key, desc = false) {
    const out = Collection.from(this);
    out.sort((a, b) => { const x = get(a, key), y = get(b, key); return (x > y ? 1 : x < y ? -1 : 0) * (desc ? -1 : 1); });
    return out;
  }
  sortByDesc(key) { return this.sortBy(key, true); }
  groupBy(key) {
    const out = {};
    this.forEach((x) => {
      const k = String(get(x, key));
      if (isBadKey(k)) return;
      if (!Object.prototype.hasOwnProperty.call(out, k)) out[k] = new Collection();
      out[k].push(x);
    });
    return out;
  }
  keyBy(key) { return Object.fromEntries(this.map((x) => [get(x, key), x]).filter(([k]) => !isBadKey(String(k)))); }
  countBy(key) {
    const out = {};
    this.forEach((x) => {
      const k = String(get(x, key));
      if (isBadKey(k)) return;
      out[k] = (Object.prototype.hasOwnProperty.call(out, k) ? out[k] : 0) + 1;
    });
    return out;
  }
  mapWithKeys(fn) { return Object.fromEntries(this.map((x, i) => Object.entries(fn(x, i))[0]).filter((e) => e && !isBadKey(String(e[0])))); }
  unique(key) {
    const seen = new Set();
    return this.filter((x) => { const k = key ? get(x, key) : x; if (seen.has(k)) return false; seen.add(k); return true; });
  }
  chunk(size) {
    size = Math.floor(Number(size));
    const out = new Collection();
    if (!size || size < 1) return out;
    for (let i = 0; i < this.length; i += size) out.push(Collection.from(this.slice(i, i + size)));
    return out;
  }
  take(n) { return Collection.from(n < 0 ? this.slice(n) : this.slice(0, n)); }
  skip(n) { return Collection.from(this.slice(n)); }
  partition(fn) { return Collection.of(this.filter(fn), this.filter((x, i) => !fn(x, i))); }
  implode(glue = ', ', key) { return (key ? this.map((x) => get(x, key)) : this).join(glue); }
  each(fn) { for (let i = 0; i < this.length; i++) if (fn(this[i], i) === false) break; return this; }
  tap(fn) { fn(this); return this; }
  pipe(fn) { return fn(this); }
  random() { return this.length ? this[Math.floor(Math.random() * this.length)] : null; }
  shuffle() { const out = Collection.from(this); for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; } return out; }
  only(...keys) { keys = keys.flat(); return this.map((x) => Object.fromEntries(keys.map((k) => [k, get(x, k)]))); }
  except(...keys) { keys = new Set(keys.flat()); return this.map((x) => Object.fromEntries(Object.entries(x && x.toJSON ? x.toJSON() : x).filter(([k]) => !keys.has(k)))); }
  toJSON() { return this.toArray(); }
}

const collect = (items = []) => Collection.from(items);

module.exports = { Collection, collect };
