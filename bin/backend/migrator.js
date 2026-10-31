/*
 * Database migrations and seeders.
 *
 *   database/migrations/2026_10_28_120000_create_posts_table.js
 *     exports: { up(schema) { schema.create('posts', (table) => { table.id(); table.string('title'); table.timestamps() }) },
 *                down(schema) { schema.dropIfExists('posts') } }
 *   (plain .sql files work too: they run once, but can't be rolled back)
 *
 *   database/seeders/DatabaseSeeder.js
 *     class DatabaseSeeder extends Seeder { async run() { await this.call([UserSeeder, PostSeeder]) } }
 *
 * Each migration runs once; the ones that ran together are a batch, and migrate:rollback undoes the last batch.
 */
const fs = require('fs');
const path = require('path');
const { createSchema } = require('./schema.js');
const { setConnection } = require('./query.js');
const { forgetTables } = require('./model.js');

const TABLE = 'som_migrations';

async function ensureTable(db) {
  const text = db.kind === 'postgres' ? 'TEXT' : 'VARCHAR(255)';
  await db.exec(`CREATE TABLE IF NOT EXISTS ${TABLE} (name ${text} PRIMARY KEY, ran_at ${text} NOT NULL, batch INTEGER)`);
  // made by an older Som.js, without batches
  const t = (await db.tables()).find((x) => x.name === TABLE);
  if (t && !t.columns.some((c) => c.name === 'batch')) await db.exec(`ALTER TABLE ${TABLE} ADD COLUMN batch INTEGER`);
}
const migrationFiles = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.(sql|c?js|[mc]?ts)$/.test(f) && !f.endsWith('.d.ts')).sort() : []);

function loadMigration(file) {
  delete require.cache[require.resolve(file)];
  let m = require(file);
  if (m && m.default) m = m.default;
  if (typeof m === 'function') m = /^class\s/.test(Function.prototype.toString.call(m)) ? new m() : { up: m };
  return m;
}
async function runJs(db, file, direction, log) {
  const m = loadMigration(file);
  if (!m || typeof m[direction] !== 'function') {
    if (direction === 'down') return false;
    throw new Error(`${path.basename(file)} has no up(). Export { up(schema) { … }, down(schema) { … } }.`);
  }
  const schema = createSchema(db, log);
  await m[direction](schema, db);
  await schema.done();
  return true;
}

// runs every migration that hasn't run yet; returns their names
async function migrate(db, dir, log = () => {}, { sqlLog } = {}) {
  if (!fs.existsSync(dir)) return [];
  setConnection(db);
  await ensureTable(db);
  const done = new Set((await db.query(`SELECT name FROM ${TABLE}`)).map((r) => r.name));
  const pending = migrationFiles(dir).filter((f) => !done.has(f));
  if (!pending.length) return [];
  const batch = Number((await db.query(`SELECT MAX(batch) AS b FROM ${TABLE}`))[0].b || 0) + 1;
  const ran = [];
  for (const f of pending) {
    const file = path.join(dir, f);
    try {
      if (f.endsWith('.sql')) await db.exec(fs.readFileSync(file, 'utf8'));
      else await runJs(db, file, 'up', sqlLog);
    } catch (e) { throw new Error(`Migration ${f} failed: ${e.message}`); }
    await db.run(`INSERT INTO ${TABLE} (name, ran_at, batch) VALUES (?, ?, ?)`, [f, new Date().toISOString(), batch]);
    log(f);
    ran.push(f);
  }
  forgetTables();
  return ran;
}

// undoes the last batch (or the last `steps` migrations)
async function rollback(db, dir, log = () => {}, { steps = 0 } = {}) {
  setConnection(db);
  await ensureTable(db);
  let rows;
  if (steps > 0) rows = await db.query(`SELECT name FROM ${TABLE} ORDER BY batch DESC, name DESC LIMIT ${parseInt(steps, 10)}`);
  else {
    const b = (await db.query(`SELECT MAX(batch) AS b FROM ${TABLE}`))[0].b;
    rows = b == null ? [] : await db.query(`SELECT name FROM ${TABLE} WHERE batch = ? ORDER BY name DESC`, [b]);
  }
  const undone = [];
  for (const { name } of rows) {
    const file = path.join(dir, name);
    if (name.endsWith('.sql') || !fs.existsSync(file)) log(`${name} (can't be undone: no down(); only forgotten)`);
    else if (!(await runJs(db, file, 'down'))) log(`${name} (has no down(); only forgotten)`);
    else log(name);
    await db.run(`DELETE FROM ${TABLE} WHERE name = ?`, [name]);
    undone.push(name);
  }
  forgetTables();
  return undone;
}

async function status(db, dir) {
  await ensureTable(db);
  const rows = await db.query(`SELECT name, batch FROM ${TABLE}`);
  const ran = new Map(rows.map((r) => [r.name, r.batch]));
  return migrationFiles(dir).map((f) => ({ name: f, ran: ran.has(f), batch: ran.get(f) ?? null }));
}

// every table goes (for migrate:fresh)
async function dropAll(db, log = () => {}) {
  const names = (await db.tables()).map((t) => t.name);
  if (db.kind === 'sqlite') await db.exec('PRAGMA foreign_keys = OFF');
  if (db.kind === 'mysql') await db.exec('SET FOREIGN_KEY_CHECKS = 0');
  try {
    for (const n of names) { await db.exec(`DROP TABLE IF EXISTS ${db.q(n)}${db.kind === 'postgres' ? ' CASCADE' : ''}`); log(n); }
  } finally {
    if (db.kind === 'sqlite') await db.exec('PRAGMA foreign_keys = ON');
    if (db.kind === 'mysql') await db.exec('SET FOREIGN_KEY_CHECKS = 1');
  }
  forgetTables();
  return names;
}

/* ------------------------------------------------------------------ seeders */
class Seeder {
  // await this.call(UserSeeder) or this.call([UserSeeder, PostSeeder])
  async call(seeders) {
    for (let S of [].concat(seeders)) {
      if (S && S.default) S = S.default; // a TypeScript seeder: export default class …
      const s = typeof S === 'function' ? new S() : S;
      if (Seeder.log) Seeder.log(s.constructor.name);
      await s.run();
    }
  }
  async run() {}
}
Seeder.log = null;

async function seed(db, baseDir, { className = 'DatabaseSeeder', log = () => {} } = {}) {
  setConnection(db);
  const seedersDir = path.join(baseDir, 'database', 'seeders');
  const file = require('./typescript.js').findFile(path.join(seedersDir, className));
  if (!file) return false;
  forgetProjectFiles(baseDir); // the seeders and the models they use are read fresh each time
  let S = require(file);
  if (S && S.default) S = S.default;
  Seeder.log = log;
  try {
    log(className);
    const s = typeof S === 'function' ? new S() : S;
    await s.run();
  } finally { Seeder.log = null; }
  return true;
}
// clears the project's own files (app/, routes/, database/) from require's cache
function forgetProjectFiles(baseDir) {
  const dirs = ['app', 'routes', 'database'].map((d) => path.join(baseDir, d) + path.sep);
  Object.keys(require.cache).forEach((k) => { if (dirs.some((d) => k.startsWith(d)) && !k.includes(path.sep + 'node_modules' + path.sep)) delete require.cache[k]; });
}

module.exports = { migrate, rollback, status, dropAll, Seeder, seed, migrationFiles, forgetProjectFiles };
