/*
 * The backend commands:
 *
 *   som migrate                      run new migrations
 *   som migrate:rollback [--step 2]  undo the last batch (or the last 2 migrations)
 *   som migrate:fresh [--seed]       drop every table, migrate again (and seed)
 *   som migrate:status               which migrations ran
 *   som db:seed [--class PostSeeder] run database/seeders/DatabaseSeeder.js (or another seeder)
 *   som route:list                   the routes in routes/api.js
 *   som make:model Post [-m -f -s -c -p -r] [--route=file] [--auth] [--all]
 *   som make:controller PostController [--api] [--model Post] [--route=file] [--auth]
 *   som make:page Post [--model Post] [--route=file] [--auth]
 *   som make:migration create_posts_table
 *   som make:seeder PostSeeder
 *   som make:factory PostFactory
 *   som make:middleware EnsureIsAdmin
 *
 * Every command takes --db <url> (or DATABASE_URL in .env) and --backend <folder> (default: the project).
 */
const fs = require('fs');
const path = require('path');

function options(args) {
  const o = { _: [], flags: new Set() };
  const valKeys = /^(db|backend|migrations|step|class|model|dir|event|route|routes|route-file|page|folder|subfolder|group|in|path)$/;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--') && a.includes('=')) {
      const idx = a.indexOf('=');
      const k = a.slice(2, idx);
      const v = a.slice(idx + 1);
      o[k] = v;
      if (k === 'route' || k === 'routes' || k === 'route-file') o.route = v;
      if (k === 'folder' || k === 'subfolder' || k === 'in' || k === 'group' || k === 'path') o.folder = v;
      o.flags.add(k);
    } else if (a.startsWith('--')) {
      const k = a.slice(2);
      if (valKeys.test(k) && args[i + 1] && !args[i + 1].startsWith('-')) {
        const v = args[++i];
        o[k] = v;
        if (k === 'route' || k === 'routes' || k === 'route-file') o.route = v;
        if (k === 'folder' || k === 'subfolder' || k === 'in' || k === 'group' || k === 'path') o.folder = v;
      }
      o.flags.add(k);
    } else if (/^-[a-z]+$/i.test(a)) {
      a.slice(1).split('').forEach((f) => o.flags.add(f.toLowerCase()));
    } else {
      o._.push(a);
    }
  }
  return o;
}
function context(o) {
  const deps = require('./deps.js');
  const start = path.resolve(o.dir || '.');
  const lay = require('./layout.js').layout(start);
  const project = lay.split ? lay.project : deps.projectDir(start);
  require('./env.js').loadEnv(project);
  const base = path.resolve(o.backend || (lay.split ? lay.backend : project)); // backend/ in new projects
  return { project, base, frontend: lay.split ? lay.frontend : project };
}
async function withDb(o, ctx, fn) {
  const { readConfig } = require('./som-config.js');
  const config = readConfig(ctx.base);
  const url = o.db || process.env.DATABASE_URL || config.db;
  if (!url) { console.error('  Which database? Set DATABASE_URL in .env (for example sqlite:database/app.db), or add --db.'); process.exit(1); }
  const { connect } = require('./db.js');
  const backend = require('./backend/index.js');
  backend.installAlias();
  let db;
  try {
    db = await connect(url, { root: config.dir || ctx.project });
    backend.setConnection(db);
    require('./backend/model.js').setBaseDir(ctx.base);
    await fn(db, backend);
  } catch (e) {
    console.error('  ' + String(e.message || e).replace(/\n/g, '\n  '));
    process.exitCode = 1;
  } finally { if (db) await db.close(); }
}
const migrationsOf = (o, ctx) => (o.migrations ? path.resolve(o.migrations) : path.join(ctx.base, 'database', 'migrations'));
const green = (s) => (process.stdout.isTTY ? `\x1b[32m${s}\x1b[0m` : s);
const dim = (s) => (process.stdout.isTTY ? `\x1b[2m${s}\x1b[0m` : s);

/* ------------------------------------------------------------------ database commands */
const commands = {
  async migrate(args) {
    const o = options(args), ctx = context(o);
    await withDb(o, ctx, async (db, b) => {
      const ran = await b.migrator.migrate(db, migrationsOf(o, ctx), (f) => console.log(`  ${green('DONE')}  ${f}`));
      console.log(ran.length ? `\n  ${ran.length} migration${ran.length === 1 ? '' : 's'} ran.` : '  Nothing to migrate.');
      if (o.flags.has('seed')) await runSeed(db, b, ctx, o.class);
    });
  },
  async 'migrate:rollback'(args) {
    const o = options(args), ctx = context(o);
    await withDb(o, ctx, async (db, b) => {
      const undone = await b.migrator.rollback(db, migrationsOf(o, ctx), (f) => console.log(`  ${green('UNDONE')}  ${f}`), { steps: parseInt(o.step, 10) || 0 });
      if (!undone.length) console.log('  Nothing to roll back.');
    });
  },
  async 'migrate:fresh'(args) {
    const o = options(args), ctx = context(o);
    await withDb(o, ctx, async (db, b) => {
      const dropped = await b.migrator.dropAll(db);
      console.log(`  Dropped ${dropped.length} table${dropped.length === 1 ? '' : 's'}.`);
      await b.migrator.migrate(db, migrationsOf(o, ctx), (f) => console.log(`  ${green('DONE')}  ${f}`));
      if (o.flags.has('seed')) await runSeed(db, b, ctx, o.class);
    });
  },
  async 'migrate:status'(args) {
    const o = options(args), ctx = context(o);
    await withDb(o, ctx, async (db, b) => {
      const list = await b.migrator.status(db, migrationsOf(o, ctx));
      if (!list.length) return console.log('  No migrations in database/migrations.');
      list.forEach((m) => console.log(`  ${m.ran ? green('Ran    ') : 'Pending'}  ${m.name}${m.ran ? dim('  batch ' + m.batch) : ''}`));
    });
  },
  async 'db:seed'(args) {
    const o = options(args), ctx = context(o);
    await withDb(o, ctx, (db, b) => runSeed(db, b, ctx, o.class));
  },
  async 'route:list'(args) {
    const o = options(args), ctx = context(o);
    const b = require('./backend/index.js');
    const handler = b.createBackend(ctx.base, { log: console });
    if (!handler) return console.log('  No routes/api.js in ' + ctx.base);
    const rows = handler.routes().map((r) => ({
      method: r.methods.filter((m) => m !== 'HEAD').join('|'),
      uri: ('api' + r.uri).replace(/\/$/, ''),
      name: r.routeName || '',
      action: actionName(r.action),
      middleware: r.middlewares.map((m) => (typeof m === 'string' ? m : m.name || 'fn')).join(', '),
    }));
    const w = (k) => Math.max(k.length, ...rows.map((r) => r[k].length));
    console.log('');
    rows.forEach((r) => console.log(`  ${r.method.padEnd(w('method'))}  ${r.uri.padEnd(w('uri'))}  ${dim(r.name.padEnd(w('name')))}  ${r.action}${r.middleware ? dim('  [' + r.middleware + ']') : ''}`));
    console.log(`\n  ${rows.length} route${rows.length === 1 ? '' : 's'}\n`);
  },
  update: (args) => require('./update.js')(args),
  add: (args) => require('./add.js')(args),
  install: (args) => require('./add.js')(args),
  i: (args) => require('./add.js')(args),
};
function actionName(a) {
  if (Array.isArray(a)) return `${(typeof a[0] === 'string' ? a[0] : a[0].name) || 'Controller'}@${a[1]}`;
  if (typeof a === 'string') return a;
  return a.name ? a.name + '()' : 'Closure';
}
async function runSeed(db, b, ctx, className) {
  const ok = await b.migrator.seed(db, ctx.base, { className: className || 'DatabaseSeeder', log: (n) => console.log(`  ${green('SEEDING')}  ${n}`) });
  if (ok) return console.log('  Seeded.');
  // an older project: database/seed.sql
  const sql = path.join(ctx.base, 'database', 'seed.sql');
  if (!className && fs.existsSync(sql)) { await db.exec(fs.readFileSync(sql, 'utf8')); return console.log('  Seeded from database/seed.sql'); }
  console.log(`  No database/seeders/${className || 'DatabaseSeeder'}.js. Make one with:  som make:seeder ${className || 'DatabaseSeeder'}`);
}

/* ------------------------------------------------------------------ make:… */
const pascal = (s) => s.replace(/(^|[-_\s])(\w)/g, (_, __, c) => c.toUpperCase()).replace(/[^\w]/g, '');
// 'User/ProfileController', 'user\\profile-controller' or 'User.ProfileController' → { dirs: ['User'], name: 'ProfileController' }
// (folders are made when they don't exist yet, e.g. som make:controller User/ProfileController)
function nested(raw) {
  const parts = String(raw || '').split(/[\\/]+/).map((p) => pascal(p)).filter(Boolean);
  const name = parts.pop() || '';
  return { dirs: parts, name, rel: [...parts, name].join('/') };
}
const up = (n) => '../'.repeat(n);
const snake = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
const { plural } = require('./backend/schema.js');
// a time stamp later than every migration already there, so files keep their order even within one second
function nextStamp(dir) {
  let t = new Date();
  const last = (fs.existsSync(dir) ? fs.readdirSync(dir) : []).map((f) => f.match(/^(\d{4})_(\d\d)_(\d\d)_(\d\d)(\d\d)(\d\d)_/)).filter(Boolean)
    .map((m) => new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime()).sort((a, b) => b - a)[0];
  if (last != null && last >= t.getTime() - (t.getTime() % 1000)) t = new Date(last + 1000);
  return stamp(t);
}
const stamp = (d = new Date()) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}_${p(d.getMonth() + 1)}_${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };

// a project with a tsconfig.json gets TypeScript files from som make:* (import/export instead of require)
function isTsProject(file) {
  for (let dir = path.dirname(file); ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return fs.existsSync(path.join(dir, 'tsconfig.json'));
    if (dir === path.dirname(dir)) return false;
  }
}
function write(file, content, base) {
  if (file.endsWith('.js') && isTsProject(file)) { file = file.replace(/\.js$/, '.ts'); content = require('./to-ts.js').toTs(content); }
  const rel = path.relative(process.cwd(), file) || file;
  if (fs.existsSync(file)) { console.error(`  ${rel} already exists.`); process.exitCode = 1; return false; }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  console.log(`  ${green('CREATED')}  ${rel}`);
  return true;
}

const stubs = {
  webRoutes: (name) => `// The ${name} pages. index.html loads it: Som.router({ routes: ['routes/web.som', 'routes/${name}.som'] })
// Route.view(address, page) · .name() · .title() · .layout() · .middleware()   — see routes/web.som

Route.prefix('/${name}').name('${name}.').middleware('auth').group(() => {
  // Route.view('/', 'pages/${name}/Index.som').name('index').title('${name[0].toUpperCase() + name.slice(1)}')
})
`,
  apiRoutes: (name) => `// The ${name} API, a route file of its own. routes/api.js loads it with require('./${name}'), so every address starts with /api.
const { Route } = require('somjs/server')

Route.prefix('/${name}').middleware('auth').group(() => {
  // Route.get('/', [${name[0].toUpperCase() + name.slice(1)}Controller, 'index'])
})
`,
  model: (name) => `const { Model } = require('somjs/server')

// The ${plural(snake(name))} table. ${name}.all(), ${name}.find(id), ${name}.where(…).get(), ${name}.create({…})
class ${name} extends Model {
  // static table = '${plural(snake(name))}'
  // static fillable = ['title', 'body']   // only these columns may be filled by create() and update()
  static hidden = []            // never sent back as JSON (like passwords)
  static casts = {}             // { published: 'boolean', meta: 'json' }

  // relations:
  // user() { return this.belongsTo(require('./User')) }
  // comments() { return this.hasMany(require('./Comment')) }
}

module.exports = ${name}
`,
  controller: (name, model, modelReq) => model ? `const { abort, response, slug } = require('somjs/server')
const ${model} = require('${modelReq || '../../Models/' + model}')

// Route.apiResource('${plural(snake(model)).replace(/_/g, '-')}', ${name})  in routes/api.js
class ${name} {
  // GET /api/${plural(snake(model))}
  async index(req) {
    return ${model}.latest('id').get()
  }

  // POST /api/${plural(snake(model))}
  async store(req) {
    // const data = await req.validate({ title: 'required|max:200' })
    const data = req.all()
    // if (data.title && !data.slug) data.slug = await slug.unique(${model}, 'slug', data.title)
    return response(await ${model}.create(data), 201)
  }

  // GET /api/${plural(snake(model))}/{id}
  async show(req, id) {
    return ${model}.findOrFail(id)
  }

  // PUT or PATCH /api/${plural(snake(model))}/{id}
  async update(req, id) {
    const ${snake(model)} = await ${model}.findOrFail(id)
    // const data = await req.validate({ title: 'sometimes|required|max:200' })
    const data = req.all()
    return ${snake(model)}.update(data)
  }

  // DELETE /api/${plural(snake(model))}/{id}
  async destroy(req, id) {
    const ${snake(model)} = await ${model}.findOrFail(id)
    await ${snake(model)}.delete()
    // nothing returned: 204 No Content
  }
}

module.exports = ${name}
` : `const { abort, response } = require('somjs/server')

// In routes/api.js:  Route.get('/something', [${name}, 'index'])
class ${name} {
  async index(req) {
    return { message: 'Hello from ${name}' }
  }
}

module.exports = ${name}
`,
  migration: (name) => {
    const create = name.match(/^create_(\w+?)_table$/);
    const change = name.match(/^\w+_(?:to|from|in)_(\w+?)_table$/);
    if (create) return `// som migrate runs up(); som migrate:rollback runs down()
module.exports = {
  up(schema) {
    schema.create('${create[1]}', (table) => {
      table.id()
      table.timestamps()
    })
  },

  down(schema) {
    schema.dropIfExists('${create[1]}')
  },
}
`;
    const t = change ? change[1] : 'table_name';
    return `// som migrate runs up(); som migrate:rollback runs down()
module.exports = {
  up(schema) {
    schema.table('${t}', (table) => {
      // table.string('column').nullable()
    })
  },

  down(schema) {
    schema.table('${t}', (table) => {
      // table.dropColumn('column')
    })
  },
}
`;
  },
  seeder: (name, model, modelReq) => `const { Seeder, DB } = require('somjs/server')
${model ? `const ${model} = require('${modelReq || '../../app/Models/' + model}')\n` : ''}
// som db:seed --class ${name}  (or this.call(${name}) from DatabaseSeeder)
class ${name} extends Seeder {
  async run() {
${model ? `    // await ${model}.create({ … })\n` : name === 'DatabaseSeeder' ? '    // await this.call([UserSeeder, PostSeeder])\n' : "    // await DB.table('posts').insert({ … })\n"}  }
}

module.exports = ${name}
`,
  middleware: (name) => `const { abort } = require('somjs/server')

// Use it in routes/api.js: Route.middleware('${name.replace(/Middleware$/, '').replace(/^[A-Z]/, (c) => c.toLowerCase())}').group(() => { … })
// Arguments after a colon arrive after next: 'role:admin' → handle(req, next, 'admin')
class ${name} {
  async handle(req, next) {
    // before the controller: check something, or stop with abort(403)
    const response = await next(req)
    // after the controller: response.header('X-Something', 'yes')
    return response
  }
}

module.exports = ${name}
`,
  factory: (name, model, modelReq) => {
    const m = (model || '').toLowerCase();
    let fields = '';
    if (m.includes('category') || m.includes('section') || m.includes('department')) {
      fields = `  name: fake.unique().category(),
  slug: (attrs) => fake.slug(attrs.name),
  description: fake.sentence(),
  is_active: true,`;
    } else if (m.includes('tag')) {
      fields = `  name: fake.unique().tag(),
  slug: (attrs) => fake.slug(attrs.name),`;
    } else if (m.includes('product') || m.includes('item')) {
      fields = `  name: fake.product(),
  slug: (attrs) => fake.slug(attrs.name),
  sku: fake.sku('PRD'),
  price: fake.price(10, 499),
  description: fake.paragraph(),
  is_active: true,`;
    } else if (m.includes('post') || m.includes('article') || m.includes('blog') || m.includes('news')) {
      fields = `  title: fake.sentence(),
  slug: (attrs) => fake.slug(attrs.title),
  content: fake.paragraphs(3),
  is_published: true,`;
    } else if (m.includes('brand') || m.includes('company')) {
      fields = `  name: fake.unique().brand(),
  slug: (attrs) => fake.slug(attrs.name),
  is_active: true,`;
    } else if (m.includes('user') || m.includes('customer') || m.includes('author') || m.includes('member')) {
      fields = `  name: fake.name(),
  email: fake.unique().email(),
  password: 'password',`;
    } else {
      fields = `  name: fake.name(),
  slug: (attrs) => fake.slug(attrs.name),
  is_active: true,`;
    }

    return `const { Factory } = require('somjs/server')
const ${model} = require('${modelReq || '../../app/Models/' + model}')

// await ${model}.factory().count(10).create()
module.exports = Factory.define(${model}, (fake) => ({
${fields}
}))
`;
  },
  page: (name, endpoint, dirs = []) => `<!-- frontend/pages/${[...dirs, name].join('/')}.som -->
layout 'layouts/app.som'

state items = []
state loading = true
state error = ''
state notice = ''
state search = ''
state sortBy = 'newest'
state selected = null
state showCreate = false
state showEdit = false
state form = { title: '', body: '' }
state editForm = { id: null, title: '', body: '' }

derive filteredItems = items.filter(i => {
  if (!search) return true
  const q = search.toLowerCase()
  return (i.title || i.name || '').toLowerCase().includes(q) || (i.body || i.description || '').toLowerCase().includes(q) || String(i.id).includes(q)
}).sort((a, b) => {
  if (sortBy === 'oldest') return a.id - b.id
  if (sortBy === 'az') return (a.title || a.name || '').localeCompare(b.title || b.name || '')
  if (sortBy === 'za') return (b.title || b.name || '').localeCompare(a.title || a.name || '')
  return b.id - a.id
})

on start {
  await loadData()
}

action loadData() {
  loading = true
  error = ''
  try {
    const res = await api.get('/api/${endpoint}')
    items = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : [])
  } catch (e) {
    error = e.message || 'Failed to load records'
  } finally {
    loading = false
  }
}

action selectItem(item) {
  selected = item
}

action closeDetail() {
  selected = null
}

action openCreate() {
  form = { title: '', body: '' }
  showCreate = true
}

action closeCreate() {
  showCreate = false
}

action createItem() {
  error = ''
  try {
    const created = await api.post('/api/${endpoint}', form)
    items = [created, ...items]
    notice = 'Created successfully'
    showCreate = false
  } catch (e) {
    error = e.message || 'Failed to create'
  }
}

action openEdit(item) {
  editForm = { id: item.id, title: item.title || item.name || '', body: item.body || item.description || '' }
  showEdit = true
}

action closeEdit() {
  showEdit = false
}

action updateItem() {
  error = ''
  try {
    const updated = await api.patch('/api/${endpoint}/' + editForm.id, editForm)
    items = items.map(x => x.id === editForm.id ? { ...x, ...updated } : x)
    if (selected && selected.id === editForm.id) selected = { ...selected, ...updated }
    notice = 'Updated successfully'
    showEdit = false
  } catch (e) {
    error = e.message || 'Failed to update'
  }
}

action removeItem(item) {
  if (!confirm('Are you sure you want to delete this record?')) return
  error = ''
  try {
    await api.delete('/api/${endpoint}/' + item.id)
    items = items.filter(x => x.id !== item.id)
    if (selected && selected.id === item.id) selected = null
    notice = 'Deleted successfully'
  } catch (e) {
    error = e.message || 'Failed to delete'
  }
}

<view>
  <div class="page p-6 max-w-7xl mx-auto space-y-6">
    <header class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-border">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">${name}</h1>
        <p class="text-xs text-muted mt-1">Search, filter, view details, create and edit ${plural(snake(name)).replace(/_/g, ' ')}</p>
      </div>
      <div class="flex items-center gap-2">
        <button class="btn btn-secondary text-xs" @click="loadData">Refresh</button>
        <button class="btn btn-primary text-xs" @click="openCreate">+ New ${name}</button>
      </div>
    </header>

    <p s-if="notice" class="p-3 bg-subtle border border-border text-sm flex justify-between items-center">
      <span>{notice}</span>
      <button class="text-muted hover:text-foreground text-xs" @click="notice = ''">✕</button>
    </p>

    <p s-if="error" class="p-3 bg-red-500/10 border border-red-500/30 text-red-500 text-sm flex justify-between items-center">
      <span>{error}</span>
      <button class="text-xs" @click="error = ''">✕</button>
    </p>

    <div class="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
      <div class="relative flex-1">
        <input type="search" s-model="search" placeholder="Search records by title, body, ID…" class="w-full px-3 py-2 bg-subtle border border-border text-sm outline-none focus:border-foreground" />
      </div>
      <div class="flex items-center gap-2">
        <label class="text-xs text-muted whitespace-nowrap">Sort:</label>
        <select s-model="sortBy" class="px-3 py-2 bg-subtle border border-border text-sm outline-none">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="az">A-Z</option>
          <option value="za">Z-A</option>
        </select>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2 border border-border bg-subtle overflow-hidden">
        <div s-if="loading" class="p-8 text-center text-muted text-sm">
          Loading ${plural(snake(name)).replace(/_/g, ' ')}…
        </div>

        <div s-elif="!filteredItems.length" class="p-8 text-center text-muted text-sm">
          No records match the filter criteria.
        </div>

        <table s-else class="w-full text-left text-sm border-collapse">
          <thead>
            <tr class="border-b border-border bg-card text-xs text-muted">
              <th class="p-3">ID</th>
              <th class="p-3">Title / Record</th>
              <th class="p-3">Date</th>
              <th class="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr s-each="item in filteredItems" class="border-b border-border/50 hover:bg-card/50 cursor-pointer" @click="selectItem(item)">
              <td class="p-3 font-mono text-xs">{item.id}</td>
              <td class="p-3">
                <div class="font-medium">{item.title || item.name || 'Untitled'}</div>
                <div s-if="item.body || item.description" class="text-xs text-muted line-clamp-1">
                  {item.body || item.description}
                </div>
              </td>
              <td class="p-3 text-xs text-muted whitespace-nowrap">
                {item.created_at ? item.created_at.slice(0, 10) : '-'}
              </td>
              <td class="p-3 text-right whitespace-nowrap space-x-1" @click.stop="">
                <button class="btn btn-xs btn-ghost" @click="selectItem(item)">View</button>
                <button class="btn btn-xs btn-ghost" @click="openEdit(item)">Edit</button>
                <button class="btn btn-xs btn-ghost text-red-500" @click="removeItem(item)">Delete</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="border border-border bg-card p-5 h-fit">
        <div s-if="!selected" class="text-center py-12 text-muted text-sm">
          <p class="font-medium text-foreground mb-1">No Record Selected</p>
          <p class="text-xs">Select any row from the table to view or inspect its full data.</p>
        </div>

        <div s-else class="space-y-4">
          <div class="flex justify-between items-start pb-3 border-b border-border">
            <div>
              <span class="font-mono text-xs text-muted">ID: {selected.id}</span>
              <h2 class="text-lg font-bold">{selected.title || selected.name || 'Record'}</h2>
            </div>
            <button class="text-muted hover:text-foreground text-xs" @click="closeDetail">✕</button>
          </div>

          <div class="space-y-2 text-xs">
            <div>
              <span class="text-muted block mb-1">Full Content / Details:</span>
              <div class="p-3 bg-subtle border border-border whitespace-pre-wrap font-sans">
                {selected.body || selected.description || JSON.stringify(selected, null, 2)}
              </div>
            </div>
            <div s-if="selected.created_at" class="text-muted">
              Created: <code>{selected.created_at}</code>
            </div>
            <div s-if="selected.updated_at" class="text-muted">
              Updated: <code>{selected.updated_at}</code>
            </div>
          </div>

          <div class="flex gap-2 pt-3 border-t border-border">
            <button class="btn btn-secondary text-xs flex-1" @click="openEdit(selected)">Edit</button>
            <button class="btn btn-ghost text-red-500 text-xs" @click="removeItem(selected)">Delete</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Create Modal -->
    <div s-if="showCreate" class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div class="bg-card border border-border w-full max-w-lg p-6 space-y-4">
        <div class="flex justify-between items-center pb-2 border-b border-border">
          <h3 class="text-lg font-bold">Create New ${name}</h3>
          <button class="text-muted hover:text-foreground text-sm" @click="closeCreate">✕</button>
        </div>

        <div class="space-y-3 text-sm">
          <div>
            <label class="block text-xs text-muted mb-1">Title / Name</label>
            <input type="text" s-model="form.title" placeholder="Enter title…" class="w-full px-3 py-2 bg-subtle border border-border outline-none" />
          </div>
          <div>
            <label class="block text-xs text-muted mb-1">Content / Description</label>
            <textarea s-model="form.body" rows="4" placeholder="Enter description…" class="w-full px-3 py-2 bg-subtle border border-border outline-none"></textarea>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-2 border-t border-border">
          <button class="btn btn-secondary text-xs" @click="closeCreate">Cancel</button>
          <button class="btn btn-primary text-xs" @click="createItem">Save</button>
        </div>
      </div>
    </div>

    <!-- Edit Modal -->
    <div s-if="showEdit" class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div class="bg-card border border-border w-full max-w-lg p-6 space-y-4">
        <div class="flex justify-between items-center pb-2 border-b border-border">
          <h3 class="text-lg font-bold">Edit ${name} #{editForm.id}</h3>
          <button class="text-muted hover:text-foreground text-sm" @click="closeEdit">✕</button>
        </div>

        <div class="space-y-3 text-sm">
          <div>
            <label class="block text-xs text-muted mb-1">Title / Name</label>
            <input type="text" s-model="editForm.title" class="w-full px-3 py-2 bg-subtle border border-border outline-none" />
          </div>
          <div>
            <label class="block text-xs text-muted mb-1">Content / Description</label>
            <textarea s-model="editForm.body" rows="4" class="w-full px-3 py-2 bg-subtle border border-border outline-none"></textarea>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-2 border-t border-border">
          <button class="btn btn-secondary text-xs" @click="closeEdit">Cancel</button>
          <button class="btn btn-primary text-xs" @click="updateItem">Update</button>
        </div>
      </div>
    </div>
  </div>
</view>
`,
};

function addApiRoute(ctx, name, dirs, { route, auth }) {
  const routeName = route ? String(route).replace(/\.(js|ts)$/, '').replace(/^[\\/]+/, '') : 'api';
  const routeBaseName = routeName.split(/[\\/]/).pop();
  let routeFile = path.join(ctx.base, 'routes', routeBaseName + '.js');
  if (isTsProject(routeFile)) routeFile = routeFile.replace(/\.js$/, '.ts');

  const isTs = isTsProject(routeFile);
  if (!fs.existsSync(routeFile)) {
    if (routeBaseName !== 'api') {
      write(routeFile, stubs.apiRoutes(routeBaseName));
      const mainApi = path.join(ctx.base, 'routes', isTs ? 'api.ts' : 'api.js');
      if (fs.existsSync(mainApi)) {
        const mainText = fs.readFileSync(mainApi, 'utf8');
        const loadStmt = isTs ? `import './${routeBaseName}'\n` : `require('./${routeBaseName}')\n`;
        if (!mainText.includes(routeBaseName)) {
          fs.writeFileSync(mainApi, mainText + `\n// ${routeBaseName} routes\n${loadStmt}`);
          console.log(`  ${green('UPDATED')}  ${path.relative(process.cwd(), mainApi)}  (${loadStmt.trim()})`);
        }
      }
    } else {
      write(routeFile, isTs ? "import { Route } from 'somjs/server'\n\n" : "const { Route } = require('somjs/server')\n\n");
    }
  }

  const endpoint = [...(dirs.length ? dirs.map((d) => snake(d).replace(/_/g, '-')) : []), plural(snake(name)).replace(/_/g, '-')].join('/');
  const controllerName = `${name}Controller`;
  const controllerRel = [...dirs, controllerName].join('/');
  let text = fs.readFileSync(routeFile, 'utf8');

  if (text.includes(`apiResource('${endpoint}'`) || text.includes(`apiResource("${endpoint}"`)) {
    return;
  }

  const requireLine = isTs
    ? `import ${controllerName} from '../app/Http/Controllers/${controllerRel}'\n`
    : `const ${controllerName} = require('../app/Http/Controllers/${controllerRel}')\n`;

  if (!text.includes(controllerName)) {
    if (text.includes("require('somjs/server')") || text.includes("from 'somjs/server'")) {
      text = text.replace(/((?:const \{[^}]+\} = require\('somjs\/server'\)|import \{[^}]+\} from 'somjs\/server')[^\n]*\n)/, `$1${requireLine}`);
    } else {
      text = requireLine + text;
    }
  }

  const routeLine = `Route.apiResource('${endpoint}', ${controllerName})${auth ? ".middleware('auth')" : ''}\n`;
  text = text.trimEnd() + '\n' + routeLine;
  fs.writeFileSync(routeFile, text);
  console.log(`  ${green('UPDATED')}  ${path.relative(process.cwd(), routeFile)}  (Route.apiResource('${endpoint}', ${controllerName})${auth ? ".middleware('auth')" : ''})`);
}

function addSidebarLink(ctx, routeNameTag, label) {
  const layoutFile = path.join(ctx.frontend, 'layouts', 'app.som');
  if (!fs.existsSync(layoutFile)) return;
  let text = fs.readFileSync(layoutFile, 'utf8');
  if (text.includes(`'${routeNameTag}'`) || text.includes(`"${routeNameTag}"`)) return;

  const newLink = `    { to: '${routeNameTag}', label: '${label}', icon: 'panel' },\n`;
  const mgmtMatch = text.match(/(label:\s*['"]Management['"][^[]*links:\s*\[[\s\S]*?)(\n\s*\]\s*\},?)/);
  if (mgmtMatch) {
    text = text.replace(mgmtMatch[0], mgmtMatch[1].trimEnd() + '\n' + newLink + mgmtMatch[2].trimStart());
    fs.writeFileSync(layoutFile, text);
    console.log(`  ${green('UPDATED')}  ${path.relative(process.cwd(), layoutFile)}  (Sidebar: { to: '${routeNameTag}', label: '${label}' })`);
  }
}

function addWebRoute(ctx, name, dirs, { route, auth }) {
  const routeName = route ? String(route).replace(/\.(som|js)$/, '').replace(/^[\\/]+/, '') : 'web';
  const routeBaseName = routeName.split(/[\\/]/).pop();
  const fileTargetName = routeBaseName === 'api' ? 'web' : routeBaseName;
  const routeFile = path.join(ctx.frontend, 'routes', fileTargetName + '.som');

  if (!fs.existsSync(routeFile)) {
    write(routeFile, stubs.webRoutes(fileTargetName));
  }

  const endpoint = '/' + [...(dirs.length ? dirs.map((d) => snake(d).replace(/_/g, '-')) : []), plural(snake(name)).replace(/_/g, '-')].join('/');
  const pageRel = `pages/${[...dirs, name].join('/')}.som`;
  let text = fs.readFileSync(routeFile, 'utf8');

  if (text.includes(`'${endpoint}'`) || text.includes(`"${endpoint}"`)) {
    return;
  }

  const routeNameTag = [...dirs.map(snake), plural(snake(name)).replace(/_/g, '-')].join('.');
  const routeLine = `Route.view('${endpoint}', '${pageRel}').name('${routeNameTag}')${auth ? ".middleware('auth')" : ''}\n`;
  text = text.trimEnd() + '\n' + routeLine;
  fs.writeFileSync(routeFile, text);
  console.log(`  ${green('UPDATED')}  ${path.relative(process.cwd(), routeFile)}  (Route.view('${endpoint}', '${pageRel}')${auth ? ".middleware('auth')" : ''})`);
  addSidebarLink(ctx, routeNameTag, plural(name));
}

const pass = (o) => [
  ...(o.backend ? ['--backend', o.backend] : []),
  ...(o.dir ? ['--dir', o.dir] : []),
  ...(o.route ? ['--route', o.route] : []),
  ...(o.flags.has('auth') ? ['--auth'] : []),
];

const make = {
  model(args) {
    const o = options(args), ctx = context(o);
    let { dirs, name, rel } = nested(o._[0]);
    if (!name) return console.error('  som make:model Post [-m -f -s -c -p -r] [--route=file] [--auth] [--all] [--folder=Admin]   (Shop/Product: app/Models/Shop/Product.js)');
    const all = o.flags.has('a') || o.flags.has('all');
    const auth = o.flags.has('auth');
    const hasRoute = all || o.flags.has('r') || o.flags.has('route') || Boolean(o.route);

    // Support placing all auxiliary files (controllers, pages, routes) in a specific folder [except model]:
    // e.g. som make:model Post --all --folder=Admin
    //      som make:model Post --all Admin
    //      som make:model Admin/Post --all --flat-model
    const targetFolder = o.folder || o.subfolder || o['in'] || o.group || o.path || (o._[1] && !o._[1].startsWith('-') ? o._[1] : null);
    const flatModel = o.flags.has('flat-model') || o.flags.has('except-model') || o.flags.has('no-model-dir') || Boolean(targetFolder);

    const modelDirs = flatModel ? [] : dirs;
    const modelRel = [...modelDirs, name].join('/');
    const otherDirs = targetFolder ? targetFolder.split(/[\\/]/).filter(Boolean) : dirs;

    write(path.join(ctx.base, 'app', 'Models', ...modelDirs, name + '.js'), stubs.model(name));
    if (all || o.flags.has('m') || o.flags.has('migration')) make.migration([`create_${plural(snake(name))}_table`, ...pass(o)]);
    if (all || o.flags.has('f') || o.flags.has('factory')) make.factory([`${name}Factory`, '--model', modelRel, ...pass(o)]);
    if (all || o.flags.has('s') || o.flags.has('seed') || o.flags.has('seeder')) make.seeder([`${name}Seeder`, '--model', modelRel, ...pass(o)]);
    if (all || o.flags.has('c') || o.flags.has('controller') || o.flags.has('api')) {
      make.controller([[...otherDirs, `${name}Controller`].join('/'), '--model', modelRel, ...(hasRoute ? ['-r'] : []), ...pass(o)]);
    } else if (hasRoute) {
      addApiRoute(ctx, name, otherDirs, { route: o.route, auth });
    }
    if (all || o.flags.has('p') || o.flags.has('page')) {
      make.page([[...otherDirs, name].join('/'), '--model', modelRel, ...(hasRoute ? ['-r'] : []), ...pass(o)]);
    }
  },
  controller(args) {
    const o = options(args), ctx = context(o);
    let { dirs, name } = nested(o._[0]);
    if (!name) return console.error('  som make:controller PostController [--api] [--model Post] [--route=file] [--auth]');
    if (!/Controller$/.test(name)) name += 'Controller';
    const m = o.model ? nested(o.model) : o.flags.has('api') || o.flags.has('resource') ? { dirs: [], name: name.replace(/Controller$/, '') } : null;
    const model = m ? m.name : null;
    const modelReq = m ? up(2 + dirs.length) + ['Models', ...m.dirs, m.name].join('/') : null;
    const rel = [...dirs, name].join('/');
    const auth = o.flags.has('auth');
    const hasRoute = o.flags.has('r') || o.flags.has('route') || Boolean(o.route);

    if (write(path.join(ctx.base, 'app', 'Http', 'Controllers', ...dirs, name + '.js'), stubs.controller(name, model, modelReq))) {
      if (hasRoute && model) {
        addApiRoute(ctx, model, dirs, { route: o.route, auth });
      } else {
        const isTs = isTsProject(path.join(ctx.base, 'app'));
        const routeExt = isTs ? 'routes/api.ts' : 'routes/api.js';
        const importHint = isTs ? `import ${name} from '../app/Http/Controllers/${rel}'` : `const ${name} = require('../app/Http/Controllers/${rel}')`;
        const resHint = model ? (isTs
          ? `Route.apiResource('${plural(snake(model)).replace(/_/g, '-')}', ${name})${auth ? ".middleware('auth')" : ''}`
          : `Route.apiResource('${plural(snake(model)).replace(/_/g, '-')}', require('../app/Http/Controllers/${rel}'))${auth ? ".middleware('auth')" : ''}`) : '';
        console.log(dim(model
          ? `  Add to ${routeExt}:  ${isTs ? importHint + '\n  ' : ''}${resHint}`
          : `  In ${routeExt}:  ${importHint}`));
      }
    }
  },
  page(args) {
    const o = options(args), ctx = context(o);
    let { dirs, name } = nested(o._[0]);
    if (!name) return console.error('  som make:page Post [--model Post] [--route=file] [--auth]');
    const m = o.model ? nested(o.model) : { dirs, name };
    const modelDirs = m.dirs && m.dirs.length ? m.dirs : dirs;
    const endpoint = [...(modelDirs.length ? modelDirs.map((d) => snake(d).replace(/_/g, '-')) : []), plural(snake(m.name)).replace(/_/g, '-')].join('/');
    const auth = o.flags.has('auth');
    const hasRoute = o.flags.has('r') || o.flags.has('route') || Boolean(o.route);

    const pageFile = path.join(ctx.frontend, 'pages', ...dirs, name + '.som');
    if (write(pageFile, stubs.page(name, endpoint, dirs))) {
      if (hasRoute) {
        addWebRoute(ctx, name, dirs, { route: o.route, auth });
      } else {
        console.log(dim(`  Add to frontend/routes/web.som:  Route.view('/${endpoint}', 'pages/${[...dirs, name].join('/')}.som')${auth ? ".middleware('auth')" : ''}`));
      }
    }
  },
  factory(args) {
    const o = options(args), ctx = context(o);
    let { dirs, name } = nested(o._[0]);
    if (!name) return console.error('  som make:factory PostFactory [--model Post]');
    if (!name.endsWith('Factory')) name += 'Factory';
    const m = o.model ? nested(o.model) : { dirs: [], name: name.replace(/Factory$/, '') };
    const modelReq = '../../app/Models/' + [...m.dirs, m.name].join('/');
    write(path.join(ctx.base, 'database', 'factories', ...dirs, name + '.js'), stubs.factory(name, m.name, modelReq));
  },
  migration(args) {
    const o = options(args), ctx = context(o);
    const name = snake(o._[0] || '').replace(/[^a-z0-9_]/g, '_');
    if (!name) return console.error('  som make:migration create_posts_table');
    const dir = migrationsOf(o, ctx);
    write(path.join(dir, `${nextStamp(dir)}_${name}.js`), stubs.migration(name));
  },
  seeder(args) {
    const o = options(args), ctx = context(o);
    let { dirs, name } = nested(o._[0]);
    if (!name) return console.error('  som make:seeder PostSeeder');
    if (!/Seeder$/.test(name)) name += 'Seeder';
    const m = o.model ? nested(o.model) : null;
    const modelReq = m ? up(2 + dirs.length) + ['app', 'Models', ...m.dirs, m.name].join('/') : null;
    write(path.join(ctx.base, 'database', 'seeders', ...dirs, name + '.js'), stubs.seeder(name, m ? m.name : null, modelReq));
  },
  middleware(args) {
    const o = options(args), ctx = context(o);
    const { dirs, name } = nested(o._[0]);
    if (!name) return console.error('  som make:middleware EnsureIsAdmin');
    write(path.join(ctx.base, 'app', 'Http', 'Middleware', ...dirs, name + '.js'), stubs.middleware(name));
    if (dirs.length) console.log(dim(`  In a folder, give it a name in app/Http/Kernel.js:  aliases: { '${snake(name).replace(/_/g, '-')}': 'Middleware/${[...dirs, name].join('/')}.js' }`));
  },
};
// som make:errors — the error pages (errors/404.som, 403, 500…)
make.errors = function (args) {
  const o = options(args), ctx = context(o);
  const from = path.join(__dirname, '..', 'templates', 'errors');
  const to = path.resolve(o.dir || ctx.frontend, o._[0] || 'errors');
  for (const f of fs.readdirSync(from).sort()) write(path.join(to, f), fs.readFileSync(path.join(from, f), 'utf8'));
  // turn them on in the router, if index.html doesn't yet
  const index = path.join(o.dir ? path.resolve(o.dir) : ctx.frontend, 'index.html');
  if (fs.existsSync(index)) {
    const html = fs.readFileSync(index, 'utf8');
    if (!/errors\s*:/.test(html) && /Som\.router\(\{/.test(html)) {
      fs.writeFileSync(index, html.replace(/Som\.router\(\{/, (m) => `${m}\n      errors: '${path.relative(path.dirname(index), to).split(path.sep).join('/')}', // error pages: errors/404.som, abort(403) → errors/403.som`));
      console.log(`  ${green('UPDATED')}  ${path.relative(process.cwd(), index) || 'index.html'}  (errors: '${path.relative(path.dirname(index), to).split(path.sep).join('/')}' in Som.router)`);
    }
  }
};

// som make:routes admin        → frontend/routes/admin.som (pages), listed in Som.router({ routes: […] }) in index.html
// som make:routes admin --api  → backend/routes/admin.js (API), loaded by routes/api.js
make.routes = function (args) {
  const o = options(args), ctx = context(o);
  const name = String(o._[0] || '').replace(/\.(som|js)$/, '').replace(/[^\w-]/g, '');
  if (!name) return console.error('  som make:routes admin        (pages)\n  som make:routes admin --api  (API)');
  if (o.flags.has('api')) {
    const file = path.join(ctx.base, 'routes', name + '.js');
    if (!write(file, stubs.apiRoutes(name))) return;
    const api = require('./backend/typescript.js').findFile(path.join(ctx.base, 'routes', 'api')) || path.join(ctx.base, 'routes', 'api.js');
    if (fs.existsSync(api) && name !== 'api') {
      const text = fs.readFileSync(api, 'utf8');
      if (!text.includes(`require('./${name}')`)) {
        fs.writeFileSync(api, text.replace(/(const \{ Route \} = require\('somjs\/server'\)\n)/, `$1\n// ${name} routes (routes/${name}.js)\nrequire('./${name}')\n`));
        console.log(`  ${green('UPDATED')}  ${path.relative(process.cwd(), api)}  (require('./${name}'))`);
      }
    }
    return;
  }
  const file = path.join(ctx.frontend, 'routes', name + '.som');
  if (!write(file, stubs.webRoutes(name))) return;
  const index = path.join(ctx.frontend, 'index.html');
  if (!fs.existsSync(index)) return;
  const html = fs.readFileSync(index, 'utf8');
  const entry = `'routes/${name}.som'`;
  if (html.includes(entry)) return;
  let next = html;
  if (/routes:\s*\[\s*'routes\//.test(html)) next = html.replace(/(routes:\s*\[[^\]]*?)(\s*\])/, (_, list, end) => `${list.replace(/,\s*$/, '')}, ${entry}${end}`);
  else if (/routes:\s*'routes\/[^']+'/.test(html)) next = html.replace(/routes:\s*('routes\/[^']+')/, (_, first) => `routes: [${first}, ${entry}]`);
  if (next === html) return console.log(`  Add ${entry} to the routes in Som.router({ routes: [...] }) in index.html.`);
  fs.writeFileSync(index, next);
  console.log(`  ${green('UPDATED')}  ${path.relative(process.cwd(), index)}  (${entry} in Som.router)`);
};

// som make:admin you@example.com      → that user may open the admin panel (/admin)
// som make:admin you@example.com --remove
commands['make:admin'] = async function (args) {
  const o = options(args), ctx = context(o);
  const email = String(o._[0] || '').trim().toLowerCase(); // Register keeps emails in lowercase
  if (!email) return console.error('  som make:admin you@example.com   (--remove takes the rights away)');
  await withDb(o, ctx, async (db) => {
    const value = o.flags.has('remove') ? 0 : 1;
    const r = await db.run(`UPDATE ${db.q('users')} SET ${db.q('is_admin')} = ? WHERE LOWER(${db.q('email')}) = ?`, [db.kind === 'postgres' ? Boolean(value) : value, email]);
    if (r.changes) {
      console.log(`  ${green('DONE')}  ${email} ${value ? 'is an admin now: open /admin (reload it if it is open)' : 'is not an admin any more'}`);
      return;
    }
    const rows = await db.query(`SELECT ${db.q('email')} FROM ${db.q('users')} ORDER BY ${db.q('id')} LIMIT 20`);
    console.error(`  No user with the email ${email}.${rows.length ? ' The users are:\n' + rows.map((x) => '    ' + x.email).join('\n') : ' There are no users yet: register first.'}`);
    process.exitCode = 1;
  });
};

make.electron = function (args) {
  return require('./electron.js').init(args);
};

make.vite = function (args) {
  return require('./vite.js').init(args);
};

Object.entries(make).forEach(([k, fn]) => { commands['make:' + k] = fn; });

module.exports = { commands, stubs, make, helpers: { options, context, withDb, write, nested, green, dim, migrationsOf, nextStamp, up, pascal, runSeed } };
// the rest of the commands (queues, schedule, cache, tinker, make:job …) add themselves here
require('./artisan-more.js');
