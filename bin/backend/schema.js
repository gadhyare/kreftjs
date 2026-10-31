/*
 * Schema: tables from JavaScript using Schema and Blueprint. The same migration works on
 * SQLite, MySQL / MariaDB and PostgreSQL.
 *
 *   schema.create('posts', (table) => {
 *     table.id()
 *     table.foreignId('user_id').constrained().onDelete('cascade')
 *     table.string('title', 200).unique()
 *     table.text('body').nullable()
 *     table.boolean('published').default(false)
 *     table.timestamps()
 *   })
 */
const singular = (w) => w.replace(/ies$/, 'y').replace(/(ss|sh|ch|x|z)es$/, '$1').replace(/([^s])s$/, '$1');
const plural = (w) => (/[^aeiou]y$/.test(w) ? w.slice(0, -1) + 'ies' : /(s|sh|ch|x|z)$/.test(w) ? w + 'es' : w + 's');

class Column {
  constructor(name, type, opts = {}) {
    Object.assign(this, { name, type, opts, isNullable: false, hasDefault: false, isUnique: false, isIndex: false, isPrimary: false, isUnsigned: false });
  }
  nullable(v = true) { this.isNullable = Boolean(v); return this; }
  notNullable() { this.isNullable = false; return this; }
  notNull() { this.isNullable = false; return this; }
  null() { this.isNullable = true; return this; }
  default(v) { this.hasDefault = true; this.defaultValue = v; return this; }
  defaultValue(v) { return this.default(v); }
  defaultTo(v) { return this.default(v); }
  useCurrent() { this.hasDefault = true; this.defaultValue = CURRENT; return this; }
  defaultToCurrent() { return this.useCurrent(); }
  unique() { this.isUnique = true; return this; }
  index() { this.isIndex = true; return this; }
  primary() { this.isPrimary = true; return this; }
  unsigned() { this.isUnsigned = true; return this; }
  comment() { return this; }
  after() { return this; }
  change() { this.isChange = true; return this; }
  // foreign keys: table.foreignId('user_id').constrained()  →  REFERENCES users(id)
  constrained(table, column = 'id') {
    this.foreign = { table: table || plural(this.name.replace(/_id$/, '')), column, onDelete: null, onUpdate: null };
    return this;
  }
  references(column) { this.foreign = { ...(this.foreign || {}), column }; return this; }
  on(table) { this.foreign = { ...(this.foreign || { column: 'id' }), table }; return this; }
  onDelete(action) { if (this.foreign) this.foreign.onDelete = action; return this; }
  onUpdate(action) { if (this.foreign) this.foreign.onUpdate = action; return this; }
  cascadeOnDelete() { return this.onDelete('cascade'); }
  nullOnDelete() { return this.onDelete('set null'); }
}
const CURRENT = { raw: 'CURRENT_TIMESTAMP' };

class Blueprint {
  constructor(table, kind, creating) {
    Object.assign(this, { table, kind, creating, columns: [], commands: [] });
  }
  add(name, type, opts) { const c = new Column(name, type, opts); this.columns.push(c); return c; }
  // keys
  id(name = 'id') { return this.add(name, 'bigIncrements').primary(); }
  increments(name) { return this.add(name, 'increments').primary(); }
  bigIncrements(name) { return this.add(name, 'bigIncrements').primary(); }
  uuid(name = 'uuid') { return this.add(name, 'uuid'); }
  foreignId(name) { return this.add(name, 'foreignId'); }
  foreignIdFor(model, name) { return this.foreignId(name || singular(model.table || model.name.toLowerCase() + 's') + '_id'); }
  // text
  string(name, length = 255) { return this.add(name, 'string', { length }); }
  char(name, length = 255) { return this.add(name, 'char', { length }); }
  text(name) { return this.add(name, 'text'); }
  mediumText(name) { return this.add(name, 'mediumText'); }
  longText(name) { return this.add(name, 'longText'); }
  enum(name, values) { return this.add(name, 'enum', { values }); }
  json(name) { return this.add(name, 'json'); }
  // numbers
  integer(name) { return this.add(name, 'integer'); }
  tinyInteger(name) { return this.add(name, 'tinyInteger'); }
  smallInteger(name) { return this.add(name, 'smallInteger'); }
  bigInteger(name) { return this.add(name, 'bigInteger'); }
  unsignedInteger(name) { return this.add(name, 'integer').unsigned(); }
  unsignedBigInteger(name) { return this.add(name, 'bigInteger').unsigned(); }
  float(name) { return this.add(name, 'float'); }
  double(name) { return this.add(name, 'double'); }
  decimal(name, precision = 8, scale = 2) { return this.add(name, 'decimal', { precision, scale }); }
  boolean(name) { return this.add(name, 'boolean'); }
  bool(name) { return this.boolean(name); }
  // time
  date(name) { return this.add(name, 'date'); }
  time(name) { return this.add(name, 'time'); }
  dateTime(name) { return this.add(name, 'dateTime'); }
  timestamp(name) { return this.add(name, 'dateTime'); }
  timestamps() { this.timestamp('created_at').nullable(); this.timestamp('updated_at').nullable(); }
  softDeletes(name = 'deleted_at') { return this.timestamp(name).nullable(); }
  rememberToken() { return this.string('remember_token', 100).nullable(); }
  // table parts
  unique(columns, name) { this.commands.push({ type: 'index', unique: true, columns: [].concat(columns), name }); return this; }
  index(columns, name) { this.commands.push({ type: 'index', unique: false, columns: [].concat(columns), name }); return this; }
  foreign(column) {
    const c = new Column(column, 'foreignKeyOnly');
    c.foreign = { column: 'id', table: null };
    this.commands.push({ type: 'foreign', column: c });
    return c;
  }
  // changing a table (schema.table)
  dropColumn(...names) { this.commands.push({ type: 'dropColumn', names: names.flat() }); return this; }
  renameColumn(from, to) { this.commands.push({ type: 'renameColumn', from, to }); return this; }
  dropUnique(name) { this.commands.push({ type: 'dropIndex', name }); return this; }
  dropIndex(name) { this.commands.push({ type: 'dropIndex', name }); return this; }
  dropTimestamps() { return this.dropColumn('created_at', 'updated_at'); }
}

// one column → its SQL for this database
function columnSql(c, kind, q) {
  const T = {
    sqlite: { bigIncrements: 'INTEGER', increments: 'INTEGER', foreignId: 'INTEGER', integer: 'INTEGER', tinyInteger: 'INTEGER', smallInteger: 'INTEGER', bigInteger: 'INTEGER', float: 'REAL', double: 'REAL', decimal: 'NUMERIC', boolean: 'BOOLEAN', date: 'DATE', time: 'TIME', dateTime: 'DATETIME', text: 'TEXT', mediumText: 'TEXT', longText: 'TEXT', json: 'TEXT', uuid: 'VARCHAR(36)' },
    mysql: { bigIncrements: 'BIGINT UNSIGNED', increments: 'INT UNSIGNED', foreignId: 'BIGINT UNSIGNED', integer: 'INT', tinyInteger: 'TINYINT', smallInteger: 'SMALLINT', bigInteger: 'BIGINT', float: 'FLOAT', double: 'DOUBLE', decimal: 'DECIMAL', boolean: 'BOOLEAN', date: 'DATE', time: 'TIME', dateTime: 'DATETIME', text: 'TEXT', mediumText: 'MEDIUMTEXT', longText: 'LONGTEXT', json: 'JSON', uuid: 'CHAR(36)' },
    postgres: { bigIncrements: 'BIGSERIAL', increments: 'SERIAL', foreignId: 'BIGINT', integer: 'INTEGER', tinyInteger: 'SMALLINT', smallInteger: 'SMALLINT', bigInteger: 'BIGINT', float: 'REAL', double: 'DOUBLE PRECISION', decimal: 'DECIMAL', boolean: 'BOOLEAN', date: 'DATE', time: 'TIME', dateTime: 'TIMESTAMP', text: 'TEXT', mediumText: 'TEXT', longText: 'TEXT', json: 'JSONB', uuid: 'UUID' },
  }[kind];
  let type;
  if (c.type === 'string' || c.type === 'enum') type = `VARCHAR(${c.opts.length || 255})`;
  else if (c.type === 'char') type = `CHAR(${c.opts.length || 255})`;
  else if (c.type === 'decimal') type = `${T.decimal}(${c.opts.precision}, ${c.opts.scale})`;
  else type = T[c.type];
  if (!type) throw new Error(`Unknown column type "${c.type}" for ${c.name}`);
  if (c.isUnsigned && kind === 'mysql' && !/UNSIGNED/.test(type) && /INT|DECIMAL|DOUBLE|FLOAT/.test(type)) type += ' UNSIGNED';

  const auto = c.type === 'bigIncrements' || c.type === 'increments';
  let sql = `${q(c.name)} ${type}`;
  if (auto) {
    sql += kind === 'sqlite' ? ' PRIMARY KEY AUTOINCREMENT' : kind === 'mysql' ? ' AUTO_INCREMENT PRIMARY KEY' : ' PRIMARY KEY';
    return sql;
  }
  if (c.isPrimary) sql += ' PRIMARY KEY';
  sql += c.isNullable ? ' NULL' : ' NOT NULL';
  if (c.hasDefault) sql += ' DEFAULT ' + literal(c.defaultValue, kind);
  if (c.isUnique) sql += ' UNIQUE';
  if (c.type === 'enum') sql += ` CHECK (${q(c.name)} IN (${c.opts.values.map((v) => literal(v, kind)).join(', ')}))`;
  return sql;
}
const ALLOWED_FK_ACTIONS = new Set(['CASCADE', 'SET NULL', 'RESTRICT', 'NO ACTION', 'SET DEFAULT']);

function literal(v, kind) {
  if (v === CURRENT || (v && v.raw)) return v.raw;
  if (v === null) return 'NULL';
  if (typeof v === 'boolean') return kind === 'sqlite' ? (v ? '1' : '0') : v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') v = JSON.stringify(v);
  const s = String(v);
  if (kind === 'mysql') {
    return "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "''") + "'";
  }
  return "'" + s.replace(/'/g, "''") + "'";
}
function foreignSql(c, q) {
  const f = c.foreign;
  let sql = `FOREIGN KEY (${q(c.name)}) REFERENCES ${q(f.table)} (${q(f.column || 'id')})`;
  if (f.onDelete) {
    const act = String(f.onDelete).toUpperCase().trim();
    if (ALLOWED_FK_ACTIONS.has(act)) sql += ' ON DELETE ' + act;
  }
  if (f.onUpdate) {
    const act = String(f.onUpdate).toUpperCase().trim();
    if (ALLOWED_FK_ACTIONS.has(act)) sql += ' ON UPDATE ' + act;
  }
  return sql;
}

// the statements for one Blueprint
function compile(bp, db) {
  const q = db.q, kind = db.kind, out = [];
  const indexName = (cols, unique) => `${bp.table}_${cols.join('_')}_${unique ? 'unique' : 'index'}`;
  const indexes = [
    ...bp.columns.filter((c) => c.isIndex).map((c) => ({ unique: false, columns: [c.name] })),
    ...bp.commands.filter((c) => c.type === 'index'),
  ];
  const foreigns = [...bp.columns.filter((c) => c.foreign && c.foreign.table), ...bp.commands.filter((c) => c.type === 'foreign').map((c) => c.column)];
  if (bp.creating) {
    const lines = bp.columns.map((c) => '  ' + columnSql(c, kind, q));
    foreigns.forEach((c) => lines.push('  ' + foreignSql(c, q)));
    out.push(`CREATE TABLE ${q(bp.table)} (\n${lines.join(',\n')}\n)`);
  } else {
    for (const c of bp.columns) {
      if (c.isChange) {
        if (kind === 'sqlite') throw new Error('SQLite can\'t change a column in place. Add a new column, copy the data, then drop the old one.');
        out.push(kind === 'mysql' ? `ALTER TABLE ${q(bp.table)} MODIFY ${columnSql(c, kind, q)}` : `ALTER TABLE ${q(bp.table)} ALTER COLUMN ${q(c.name)} TYPE ${columnSql(c, kind, q).split(' ').slice(1).join(' ').replace(/ (NOT NULL|NULL).*$/, '')}`);
        continue;
      }
      let sql = `ALTER TABLE ${q(bp.table)} ADD COLUMN ${columnSql(c, kind, q)}`;
      if (c.foreign && c.foreign.table && kind === 'sqlite') sql += ` REFERENCES ${q(c.foreign.table)} (${q(c.foreign.column || 'id')})` + (c.foreign.onDelete ? ' ON DELETE ' + c.foreign.onDelete.toUpperCase() : '');
      out.push(sql);
      if (c.foreign && c.foreign.table && kind !== 'sqlite') out.push(`ALTER TABLE ${q(bp.table)} ADD ${foreignSql(c, q)}`);
    }
    for (const cmd of bp.commands) {
      if (cmd.type === 'dropColumn') cmd.names.forEach((n) => out.push(`ALTER TABLE ${q(bp.table)} DROP COLUMN ${q(n)}`));
      if (cmd.type === 'renameColumn') out.push(`ALTER TABLE ${q(bp.table)} RENAME COLUMN ${q(cmd.from)} TO ${q(cmd.to)}`);
      if (cmd.type === 'dropIndex') out.push(kind === 'mysql' ? `DROP INDEX ${q(cmd.name)} ON ${q(bp.table)}` : `DROP INDEX ${q(cmd.name)}`);
      if (cmd.type === 'foreign' && kind !== 'sqlite') out.push(`ALTER TABLE ${q(bp.table)} ADD ${foreignSql(cmd.column, q)}`);
    }
  }
  for (const ix of indexes) {
    const name = ix.name || indexName(ix.columns, ix.unique);
    out.push(`CREATE ${ix.unique ? 'UNIQUE ' : ''}INDEX ${q(name)} ON ${q(bp.table)} (${ix.columns.map(q).join(', ')})`);
  }
  return out;
}

// the `schema` a migration gets. Each call waits for the one before, so `await` is optional:
// schema.create('users', …); schema.create('posts', …) runs sequentially in that order.
function createSchema(db, log = null) {
  let chain = Promise.resolve();
  const queue = (fn) => (chain = chain.then(fn));
  const run = (statements) => queue(async () => { for (const s of statements) { if (log) log(s); await db.exec(s); } });
  const build = (table, fn, creating) => { const bp = new Blueprint(table, db.kind, creating); fn(bp); return compile(bp, db); };
  return {
    create: (table, fn) => run(build(table, fn, true)),
    table: (table, fn) => run(build(table, fn, false)),
    drop: (table) => run([`DROP TABLE ${db.q(table)}`]),
    dropIfExists: (table) => run([`DROP TABLE IF EXISTS ${db.q(table)}`]),
    rename: (from, to) => run([`ALTER TABLE ${db.q(from)} RENAME TO ${db.q(to)}`]),
    hasTable: (table) => queue(async () => (await db.tables()).some((t) => t.name === table)),
    hasColumn: (table, column) => queue(async () => { const t = (await db.tables()).find((x) => x.name === table); return !!t && t.columns.some((c) => c.name === column); }),
    raw: (sql) => run([sql]),
    toSql: (table, fn, creating = true) => build(table, fn, creating), // the SQL, without running it
    done: () => chain,
  };
}

module.exports = { createSchema, Blueprint, plural, singular, CURRENT };
