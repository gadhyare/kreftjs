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

function migrationFiles(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let list = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      list = list.concat(migrationFiles(full, base));
    } else if (/\.(sql|c?js|[mc]?ts)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      const rel = path.relative(base, full).replace(/\\/g, '/');
      list.push(rel);
    }
  }
  return list.sort((a, b) => {
    const baseA = path.basename(a);
    const baseB = path.basename(b);
    return baseA.localeCompare(baseB) || a.localeCompare(b);
  });
}

function findTargetMigration(allFiles, file) {
  if (!file) return null;
  const target = String(file).replace(/\\/g, '/').replace(/^(\.\/)?database\/migrations\//, '').trim();
  let matched = allFiles.filter((f) => f === target || f === target + '.js' || f === target + '.ts' || f === target + '.sql');
  if (!matched.length) {
    matched = allFiles.filter((f) => path.basename(f) === target || path.basename(f) === target + '.js' || path.basename(f) === target + '.ts' || path.basename(f) === target + '.sql');
  }
  if (!matched.length) {
    const prefix = target.replace(/\/$/, '') + '/';
    matched = allFiles.filter((f) => f.startsWith(prefix));
  }
  if (!matched.length) {
    matched = allFiles.filter((f) => f.includes(target));
  }
  return matched;
}

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

// runs every migration that hasn't run yet (or a specific file/subfolder); returns their names
async function migrate(db, dir, log = () => {}, { sqlLog, file } = {}) {
  if (!fs.existsSync(dir)) return [];
  setConnection(db);
  await ensureTable(db);
  const rows = await db.query(`SELECT name FROM ${TABLE}`);
  const done = new Set(rows.map((r) => r.name));
  const doneBases = new Set(rows.map((r) => path.basename(r.name)));
  const isDone = (f) => done.has(f) || doneBases.has(path.basename(f));

  const allFiles = migrationFiles(dir);
  let pending = allFiles;

  if (file) {
    const matched = findTargetMigration(allFiles, file);
    if (!matched || !matched.length) {
      throw new Error(`Migration file "${file}" not found in ${dir} or its subfolders.`);
    }
    pending = matched;
  }

  pending = pending.filter((f) => !isDone(f));
  if (!pending.length) return [];

  const batch = Number((await db.query(`SELECT MAX(batch) AS b FROM ${TABLE}`))[0].b || 0) + 1;
  const ran = [];
  for (const f of pending) {
    const filePath = path.join(dir, f);
    try {
      if (f.endsWith('.sql')) await db.exec(fs.readFileSync(filePath, 'utf8'));
      else await runJs(db, filePath, 'up', sqlLog);
    } catch (e) { throw new Error(`Migration ${f} failed: ${e.message}`); }
    await db.run(`INSERT INTO ${TABLE} (name, ran_at, batch) VALUES (?, ?, ?)`, [f, new Date().toISOString(), batch]);
    log(f);
    ran.push(f);
  }
  forgetTables();
  return ran;
}

// undoes the last batch, or the last `steps` migrations, or a specific migration file
async function rollback(db, dir, log = () => {}, { steps = 0, file } = {}) {
  setConnection(db);
  await ensureTable(db);
  const rows = await db.query(`SELECT name, batch FROM ${TABLE} ORDER BY batch DESC, name DESC`);
  if (!rows.length) return [];

  let toRollback = [];

  if (file) {
    const target = String(file).replace(/\\/g, '/').replace(/^(\.\/)?database\/migrations\//, '').trim();
    let matchedRows = rows.filter((r) => r.name === target || r.name === target + '.js' || r.name === target + '.ts' || r.name === target + '.sql');
    if (!matchedRows.length) {
      matchedRows = rows.filter((r) => path.basename(r.name) === target || path.basename(r.name) === target + '.js' || path.basename(r.name) === target + '.ts' || path.basename(r.name) === target + '.sql');
    }
    if (!matchedRows.length) {
      const prefix = target.replace(/\/$/, '') + '/';
      matchedRows = rows.filter((r) => r.name.startsWith(prefix));
    }
    if (!matchedRows.length) {
      matchedRows = rows.filter((r) => r.name.includes(target));
    }

    if (!matchedRows.length) {
      const allFiles = migrationFiles(dir);
      const onDisk = findTargetMigration(allFiles, file);
      if (onDisk && onDisk.length) {
        throw new Error(`Migration "${file}" has not been run yet, so it cannot be rolled back.`);
      }
      throw new Error(`Migration "${file}" not found in database or ${dir}.`);
    }
    toRollback = matchedRows;
  } else if (steps > 0) {
    toRollback = rows.slice(0, parseInt(steps, 10));
  } else {
    const maxBatch = rows[0].batch;
    toRollback = maxBatch == null ? [] : rows.filter((r) => r.batch === maxBatch);
  }

  const undone = [];
  const allDirFiles = migrationFiles(dir);

  for (const { name } of toRollback) {
    let filePath = path.join(dir, name);
    if (!fs.existsSync(filePath)) {
      const diskMatch = allDirFiles.find((f) => f === name || path.basename(f) === path.basename(name));
      if (diskMatch) filePath = path.join(dir, diskMatch);
    }

    if (name.endsWith('.sql') || !fs.existsSync(filePath)) {
      log(`${name} (can't be undone: no down(); only forgotten)`);
    } else if (!(await runJs(db, filePath, 'down'))) {
      log(`${name} (has no down(); only forgotten)`);
    } else {
      log(name);
    }
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
  const ranBases = new Map(rows.map((r) => [path.basename(r.name), r.batch]));
  return migrationFiles(dir).map((f) => {
    const isRan = ran.has(f) || ranBases.has(path.basename(f));
    const batch = ran.get(f) ?? ranBases.get(path.basename(f)) ?? null;
    return { name: f, ran: isRan, batch };
  });
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
  constructor() {
    this.__pending = [];
  }
  // await this.call(UserSeeder) or this.call([UserSeeder, PostSeeder])
  call(seeders) {
    const run = async () => {
      for (let S of [].concat(seeders)) {
        if (typeof S === 'string') {
          const seedersDir = path.resolve(Seeder.baseDir || process.cwd(), 'database', 'seeders');
          const file = require('./typescript.js').findFile(path.join(seedersDir, S.replace(/\\/g, '/')));
          if (file) S = require(file);
        }
        if (S && S.default) S = S.default; // a TypeScript seeder: export default class …
        const s = typeof S === 'function' ? new S() : S;
        if (Seeder.log && s && s.constructor) Seeder.log(s.constructor.name);
        if (s && typeof s.run === 'function') {
          const res = s.run();
          if (res && typeof res.then === 'function') await res;
          if (s.__pending && s.__pending.length) {
            await Promise.all(s.__pending);
          }
        }
      }
    };
    const p = run();
    if (!this.__pending) this.__pending = [];
    this.__pending.push(p);
    Seeder.pendingCalls.add(p);
    p.finally(() => Seeder.pendingCalls.delete(p));
    return p;
  }
  static call(seeders) {
    return new Seeder().call(seeders);
  }
  async run() {}

  // Explicit check for model fillable inside seeders
  checkFillable(ModelClass, attributes) {
    if (!ModelClass || !ModelClass.fillable) return true;
    for (const k of Object.keys(attributes || {})) {
      if (!ModelClass.fillable.includes(k)) {
        throw new Error(`[MassAssignmentException] Field "${k}" is not fillable on model [${ModelClass.name || ModelClass.table}]. Add "${k}" to static fillable = [${ModelClass.fillable.map((x) => "'" + x + "'").join(', ')}] or use forceFill().`);
      }
    }
    return true;
  }
}
Seeder.log = null;
Seeder.isSeeding = false;
Seeder.pendingCalls = new Set();
Seeder.baseDir = null;

async function seed(db, baseDir, { className = 'DatabaseSeeder', log = () => {} } = {}) {
  if (!className || typeof className !== 'string' || className.includes('\0') || className.includes('..') || !/^[A-Za-z0-9_\\/-]+$/.test(className)) {
    return false;
  }
  setConnection(db);
  const seedersDir = path.resolve(baseDir, 'database', 'seeders');
  const file = require('./typescript.js').findFile(path.join(seedersDir, className.replace(/\\/g, '/')));
  if (!file || !path.resolve(file).startsWith(seedersDir + path.sep)) return false;
  forgetProjectFiles(baseDir); // the seeders and the models they use are read fresh each time
  let S = require(file);
  if (S && S.default) S = S.default;
  Seeder.log = log;
  Seeder.isSeeding = true;
  Seeder.baseDir = baseDir;
  if (!Seeder.pendingCalls) Seeder.pendingCalls = new Set();
  const { Factory } = require('./factory.js');
  const factoryDirs = [
    path.resolve(baseDir, 'database', 'factories'),
    path.resolve(baseDir, 'backend', 'database', 'factories'),
  ];
  const addedGlobals = [];
  for (const fdir of factoryDirs) {
    if (fs.existsSync(fdir)) {
      try {
        const files = fs.readdirSync(fdir);
        for (const f of files) {
          if (f.endsWith('.js') || f.endsWith('.cjs') || f.endsWith('.ts')) {
            const baseName = path.basename(f, path.extname(f));
            try {
              const exp = require(path.join(fdir, f));
              const fVal = exp && exp.default ? exp.default : exp;
              if (typeof fVal === 'function' || (fVal && typeof fVal === 'object')) {
                if (!(baseName in global)) {
                  global[baseName] = fVal;
                  addedGlobals.push(baseName);
                }
              }
            } catch (_) {}
          }
        }
      } catch (_) {}
    }
  }
  try {
    log(className);
    const s = typeof S === 'function' ? new S() : S;
    const res = s.run();
    if (res && typeof res.then === 'function') await res;
    // Await all pending calls and creations (e.g. if the user omitted `await` in DatabaseSeeder or a seeder)
    while (
      (s && s.__pending && s.__pending.length > 0) ||
      (Seeder.pendingCalls && Seeder.pendingCalls.size > 0) ||
      (Factory.pendingCreations && Factory.pendingCreations.size > 0)
    ) {
      if (s && s.__pending && s.__pending.length > 0) {
        const p = s.__pending.splice(0);
        await Promise.all(p);
      }
      if (Seeder.pendingCalls && Seeder.pendingCalls.size > 0) {
        await Promise.all(Array.from(Seeder.pendingCalls));
      }
      if (Factory.pendingCreations && Factory.pendingCreations.size > 0) {
        await Promise.all(Array.from(Factory.pendingCreations));
      }
    }
  } finally {
    Seeder.log = null;
    Seeder.isSeeding = false;
    Seeder.pendingCalls.clear();
    if (Factory.pendingCreations) Factory.pendingCreations.clear();
    for (const k of addedGlobals) {
      delete global[k];
    }
  }
  return true;
}
// clears the project's own files (app/, routes/, database/) from require's cache
function forgetProjectFiles(baseDir) {
  let realBase = baseDir;
  try { realBase = fs.realpathSync(baseDir); } catch (_) {}
  const dirs = ['app', 'routes', 'database'].flatMap((d) => [
    path.join(baseDir, d) + path.sep,
    path.join(realBase, d) + path.sep,
  ]);
  Object.keys(require.cache).forEach((k) => {
    let realK = k;
    try { realK = fs.realpathSync(k); } catch (_) {}
    if (dirs.some((d) => k.startsWith(d) || realK.startsWith(d)) && !k.includes(path.sep + 'node_modules' + path.sep)) {
      delete require.cache[k];
    }
  });
}

async function listTables(db) {
  const conn = db || require('./query.js').getConnection();
  return conn.tables();
}

module.exports = { migrate, rollback, status, dropAll, listTables, Seeder, seed, migrationFiles, findTargetMigration, forgetProjectFiles };
