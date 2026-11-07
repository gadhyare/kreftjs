/*
 * The backend commands:
 *
 *   kreft migrate                      run new migrations
 *   kreft migrate:rollback [--step 2]  undo the last batch (or the last 2 migrations)
 *   kreft migrate:fresh [--seed]       drop every table, migrate again (and seed)
 *   kreft migrate:status               which migrations ran
 *   kreft db:seed [--class PostSeeder] run database/seeders/DatabaseSeeder.js (or another seeder)
 *   kreft route:list                   the routes in routes/api.js
 *   kreft make:model Post [-m -f -s -c -p -r] [--route=file] [--auth] [--all]
 *   kreft make:controller PostController [--api] [--model Post] [--route=file] [--auth]
 *   kreft make:page Post [--model Post] [--route=file] [--auth]
 *   kreft make:migration create_posts_table
 *   kreft make:seeder PostSeeder
 *   kreft make:factory PostFactory
 *   kreft make:middleware EnsureIsAdmin
 *
 * Every command takes --db <url> (or DATABASE_URL in .env) and --backend <folder> (default: the project).
 */
const fs = require('fs');
const path = require('path');

// Component files are .kreft; projects from the 0.0.x betas have .kreftjs. A path asked for as .kreft
// also tries .kreftjs, so every command keeps working in an older project.
const altExts = (f) => (/\.kreft$/.test(f) ? [f, f.replace(/\.kreft$/, '.kreftjs')] : [f]);
const existingKreft = (f) => altExts(f).find((x) => fs.existsSync(x)) || f;

function options(args) {
  const flatArgs = (Array.isArray(args) ? args.flat(Infinity) : []).map((x) => (typeof x === 'string' ? x : String(x ?? '')));
  const o = { _: [], flags: new Set() };
  const valKeys = /^(db|backend|migrations|step|class|model|dir|event|route|routes|route-file|page|folder|subfolder|group|in|path|file|url|urls)$/;
  for (let i = 0; i < flatArgs.length; i++) {
    const a = flatArgs[i];
    if (a.startsWith('--') && a.includes('=')) {
      const idx = a.indexOf('=');
      const k = a.slice(2, idx);
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      const v = a.slice(idx + 1);
      o[k] = v;
      if (k === 'route' || k === 'routes' || k === 'route-file') o.route = v;
      if (k === 'folder' || k === 'subfolder' || k === 'in' || k === 'group' || k === 'path') o.folder = v;
      if (k === 'file' || k === 'path') o.file = v;
      o.flags.add(k);
    } else if (a.startsWith('--')) {
      const k = a.slice(2);
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      if (valKeys.test(k) && args[i + 1] && !args[i + 1].startsWith('-')) {
        const v = args[++i];
        o[k] = v;
        if (k === 'route' || k === 'routes' || k === 'route-file') o.route = v;
        if (k === 'folder' || k === 'subfolder' || k === 'in' || k === 'group' || k === 'path') o.folder = v;
        if (k === 'file' || k === 'path') o.file = v;
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
  const { readConfig } = require('./kreftjs-config.js');
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
const red = (s) => (process.stdout.isTTY ? `\x1b[31m${s}\x1b[0m` : s);
const yellow = (s) => (process.stdout.isTTY ? `\x1b[33m${s}\x1b[0m` : s);
const dim = (s) => (process.stdout.isTTY ? `\x1b[2m${s}\x1b[0m` : s);

/* ------------------------------------------------------------------ database commands */
const commands = {
  async migrate(args) {
    const o = options(args), ctx = context(o);
    const targetFile = o.file || (o._.length && !o._[0].startsWith('-') ? o._[0] : null);
    await withDb(o, ctx, async (db, b) => {
      const ran = await b.migrator.migrate(db, migrationsOf(o, ctx), (f) => console.log(`  ${green('DONE')}  ${f}`), { file: targetFile });
      console.log(ran.length ? `\n  ${ran.length} migration${ran.length === 1 ? '' : 's'} ran.` : '  Nothing to migrate.');
      if (o.flags.has('seed')) await runSeed(db, b, ctx, o.class);
    });
  },
  async 'migrate:rollback'(args) {
    const o = options(args), ctx = context(o);
    const targetFile = o.file || (o._.length && !o._[0].startsWith('-') ? o._[0] : null);
    await withDb(o, ctx, async (db, b) => {
      const undone = await b.migrator.rollback(db, migrationsOf(o, ctx), (f) => console.log(`  ${green('UNDONE')}  ${f}`), {
        steps: parseInt(o.step, 10) || 0,
        file: targetFile,
      });
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
  'migrate:file': (args) => commands.migrate(args),
  'migrate:undo': (args) => commands['migrate:rollback'](args),
  async 'route:list'(args) {
    const o = options(args), ctx = context(o);
    const b = require('./backend/index.js');
    const handler = b.createBackend(ctx.base, { log: console });
    if (!handler) return console.log('  No routes/api.js in ' + ctx.base);
    if (typeof handler.ready === 'function') await handler.ready();
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
  console.log(`  No database/seeders/${className || 'DatabaseSeeder'}.js. Make one with:  kreft make:seeder ${className || 'DatabaseSeeder'}`);
}

/* ------------------------------------------------------------------ make:… */
const pascal = (s) => s.replace(/(^|[-_\s])(\w)/g, (_, __, c) => c.toUpperCase()).replace(/[^\w]/g, '');
// 'User/ProfileController', 'user\\profile-controller' or 'User.ProfileController' → { dirs: ['User'], name: 'ProfileController' }
// (folders are made when they don't exist yet, e.g. kreft make:controller User/ProfileController)
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

// a project with a tsconfig.json (or --ts flag) gets TypeScript files from kreftjs make:* (import/export instead of require)
function isTsProject(file) {
  if (process.argv.includes('--ts') || process.argv.includes('--typescript')) return true;
  if (process.argv.includes('--js') || process.argv.includes('--javascript')) return false;
  for (let dir = path.dirname(file); ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'tsconfig.json'))) return true;
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
  webRoutes: (name) => `// The ${name} pages. index.html loads it: Kreftjs.router({ routes: ['routes/web.kreft', 'routes/${name}.kreft'] })
// Route.view(address, page) · .name() · .title() · .layout() · .middleware()   — see routes/web.kreft

Route.prefix('/${name}').name('${name}.').middleware('auth').group(() => {
  // Route.view('/', 'pages/${name}/Index.kreft').name('index').title('${name[0].toUpperCase() + name.slice(1)}')
})
`,
  apiRoutes: (name) => `// The ${name} API, a route file of its own. routes/api.js loads it with require('./${name}'), so every address starts with /api.
const { Route } = require('kreftjs/server')

Route.prefix('/${name}').middleware('auth').group(() => {
  // Route.get('/', [${name[0].toUpperCase() + name.slice(1)}Controller, 'index'])
})
`,
  model: (name) => `const { Model } = require('kreftjs/server')

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
  controller: (name, model, modelReq) => model ? `const { abort, response, slug } = require('kreftjs/server')
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
    // only the columns listed in static fillable on the model are taken: never req.all(), or a visitor could send
    // { "is_admin": true } and have it saved
    const data = req.only(...(${model}.fillable || abort(500, 'Set static fillable on the ${model} model first (the columns a visitor may fill).')))
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
    const data = req.only(...(${model}.fillable || abort(500, 'Set static fillable on the ${model} model first (the columns a visitor may fill).')))
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
` : `const { abort, response } = require('kreftjs/server')

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
    if (create) return `// kreft migrate runs up(); kreft migrate:rollback runs down()
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
    return `// kreft migrate runs up(); kreft migrate:rollback runs down()
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
  seeder: (name, model, modelReq) => `const { Seeder, DB } = require('kreftjs/server')
${model ? `const ${model} = require('${modelReq || '../../app/Models/' + model}')\n` : ''}
// kreft db:seed --class ${name}  (or this.call(${name}) from DatabaseSeeder)
class ${name} extends Seeder {
  async run() {
${model ? `    // await ${model}.factory().count(10).create()\n    // await ${model}.create({ … })\n` : name === 'DatabaseSeeder' ? '    // await this.call([UserSeeder, PostSeeder])\n' : "    // await DB.table('posts').insert({ … })\n"}  }
}

module.exports = ${name}
`,
  middleware: (name) => `const { abort } = require('kreftjs/server')

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
  request: (name, rulesObj, isTs = false) => {
    let rulesStr = '';
    if (rulesObj && Object.keys(rulesObj).length) {
      rulesStr = Object.entries(rulesObj)
        .map(([k, v]) => `      ${k}: '${v}',`)
        .join('\n');
    } else {
      rulesStr = `      // title: 'required|string|max:255',\n      // body: 'required|string',`;
    }
    if (isTs) {
      return `import { FormRequest } from 'kreftjs/server'

export default class ${name} extends FormRequest {
  /**
   * Determine if the user is authorized to make this request.
   */
  authorize(): boolean {
    return true
  }

  /**
   * Get the validation rules that apply to the request.
   */
  rules(): Record<string, string | string[]> {
    return {
${rulesStr}
    }
  }

  /**
   * Custom error messages.
   */
  messages(): Record<string, string> {
    return {}
  }
}
`;
    }
    return `const { FormRequest } = require('kreftjs/server')

class ${name} extends FormRequest {
  /**
   * Determine if the user is authorized to make this request.
   */
  authorize() {
    return true
  }

  /**
   * Get the validation rules that apply to the request.
   */
  rules() {
    return {
${rulesStr}
    }
  }

  /**
   * Custom error messages.
   */
  messages() {
    return {}
  }
}

module.exports = ${name}
`;
  },
  resource: (name, isTs = false) => {
    if (isTs) {
      return `import { JsonResource } from 'kreftjs/server'

export default class ${name} extends JsonResource {
  toArray(req: any) {
    return {
      id: this.id,
      created_at: this.created_at,
      updated_at: this.updated_at,
    }
  }
}
`;
    }
    return `const { JsonResource } = require('kreftjs/server')

class ${name} extends JsonResource {
  toArray(req) {
    return {
      id: this.id,
      created_at: this.created_at,
      updated_at: this.updated_at,
    }
  }
}

module.exports = ${name}
`;
  },
  rule: (name, isTs = false) => {
    if (isTs) {
      return `// In rules: { code: ['required', new ${name}()] }
export default class ${name} {
  passes(attribute: string, value: any, data: any): boolean {
    return true
  }

  message(): string {
    return 'The :attribute is invalid.'
  }
}
`;
    }
    return `// In rules: { code: ['required', new ${name}()] }
class ${name} {
  passes(attribute, value, data) {
    return true
  }

  message() {
    return 'The :attribute is invalid.'
  }
}

module.exports = ${name}
`;
  },
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

    return `const { Factory } = require('kreftjs/server')
const ${model} = require('${modelReq || '../../app/Models/' + model}')

// await ${model}.factory().count(10).create()
module.exports = Factory.define(${model}, (fake) => ({
${fields}
}))
`;
  },
  page: (name, endpoint, dirs = [], isTs = false) => `<!-- frontend/pages/${[...dirs, name].join('/')}.kreft -->
layout 'layouts/app.kreft'
${isTs ? `
interface ${name}Item {
  id: number
  title?: string
  name?: string
  body?: string
  description?: string
  created_at?: string
  updated_at?: string
  [key: string]: any
}
` : ''}
state items${isTs ? `: ${name}Item[]` : ''} = []
state loading${isTs ? ': boolean' : ''} = true
state error${isTs ? ': string' : ''} = ''
state notice${isTs ? ': string' : ''} = ''
state search${isTs ? ': string' : ''} = ''
state sortBy${isTs ? ': string' : ''} = 'newest'
state selected${isTs ? `: ${name}Item | null` : ''} = null
state showCreate${isTs ? ': boolean' : ''} = false
state showEdit${isTs ? ': boolean' : ''} = false
state form = { title: '', body: '' }
state editForm${isTs ? ': { id: number | null; title: string; body: string }' : ''} = { id: null, title: '', body: '' }

derive filteredItems${isTs ? `: ${name}Item[]` : ''} = items.filter(i => {
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

    <p k-if="notice" class="p-3 bg-subtle border border-border text-sm flex justify-between items-center">
      <span>{notice}</span>
      <button class="text-muted hover:text-foreground text-xs" @click="notice = ''">✕</button>
    </p>

    <p k-if="error" class="p-3 bg-red-500/10 border border-red-500/30 text-red-500 text-sm flex justify-between items-center">
      <span>{error}</span>
      <button class="text-xs" @click="error = ''">✕</button>
    </p>

    <div class="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
      <div class="relative flex-1">
        <input type="search" k-model="search" placeholder="Search records by title, body, ID…" class="w-full px-3 py-2 bg-subtle border border-border text-sm outline-none focus:border-foreground" />
      </div>
      <div class="flex items-center gap-2">
        <label class="text-xs text-muted whitespace-nowrap">Sort:</label>
        <select k-model="sortBy" class="px-3 py-2 bg-subtle border border-border text-sm outline-none">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="az">A-Z</option>
          <option value="za">Z-A</option>
        </select>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2 border border-border bg-subtle overflow-hidden">
        <div k-if="loading" class="p-8 text-center text-muted text-sm">
          Loading ${plural(snake(name)).replace(/_/g, ' ')}…
        </div>

        <div k-elif="!filteredItems.length" class="p-8 text-center text-muted text-sm">
          No records match the filter criteria.
        </div>

        <table k-else class="w-full text-left text-sm border-collapse">
          <thead>
            <tr class="border-b border-border bg-card text-xs text-muted">
              <th class="p-3">ID</th>
              <th class="p-3">Title / Record</th>
              <th class="p-3">Date</th>
              <th class="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr k-each="item in filteredItems" class="border-b border-border/50 hover:bg-card/50 cursor-pointer" @click="selectItem(item)">
              <td class="p-3 font-mono text-xs">{item.id}</td>
              <td class="p-3">
                <div class="font-medium">{item.title || item.name || 'Untitled'}</div>
                <div k-if="item.body || item.description" class="text-xs text-muted line-clamp-1">
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
        <div k-if="!selected" class="text-center py-12 text-muted text-sm">
          <p class="font-medium text-foreground mb-1">No Record Selected</p>
          <p class="text-xs">Select any row from the table to view or inspect its full data.</p>
        </div>

        <div k-else class="space-y-4">
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
            <div k-if="selected.created_at" class="text-muted">
              Created: <code>{selected.created_at}</code>
            </div>
            <div k-if="selected.updated_at" class="text-muted">
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
    <div k-if="showCreate" class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div class="bg-card border border-border w-full max-w-lg p-6 space-y-4">
        <div class="flex justify-between items-center pb-2 border-b border-border">
          <h3 class="text-lg font-bold">Create New ${name}</h3>
          <button class="text-muted hover:text-foreground text-sm" @click="closeCreate">✕</button>
        </div>

        <div class="space-y-3 text-sm">
          <div>
            <label class="block text-xs text-muted mb-1">Title / Name</label>
            <input type="text" k-model="form.title" placeholder="Enter title…" class="w-full px-3 py-2 bg-subtle border border-border outline-none" />
          </div>
          <div>
            <label class="block text-xs text-muted mb-1">Content / Description</label>
            <textarea k-model="form.body" rows="4" placeholder="Enter description…" class="w-full px-3 py-2 bg-subtle border border-border outline-none"></textarea>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-2 border-t border-border">
          <button class="btn btn-secondary text-xs" @click="closeCreate">Cancel</button>
          <button class="btn btn-primary text-xs" @click="createItem">Save</button>
        </div>
      </div>
    </div>

    <!-- Edit Modal -->
    <div k-if="showEdit" class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div class="bg-card border border-border w-full max-w-lg p-6 space-y-4">
        <div class="flex justify-between items-center pb-2 border-b border-border">
          <h3 class="text-lg font-bold">Edit ${name} #{editForm.id}</h3>
          <button class="text-muted hover:text-foreground text-sm" @click="closeEdit">✕</button>
        </div>

        <div class="space-y-3 text-sm">
          <div>
            <label class="block text-xs text-muted mb-1">Title / Name</label>
            <input type="text" k-model="editForm.title" class="w-full px-3 py-2 bg-subtle border border-border outline-none" />
          </div>
          <div>
            <label class="block text-xs text-muted mb-1">Content / Description</label>
            <textarea k-model="editForm.body" rows="4" class="w-full px-3 py-2 bg-subtle border border-border outline-none"></textarea>
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
      write(routeFile, isTs ? "import { Route } from 'kreftjs/server'\n\n" : "const { Route } = require('kreftjs/server')\n\n");
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
    if (text.includes("require('kreftjs/server')") || text.includes("from 'kreftjs/server'")) {
      text = text.replace(/((?:const \{[^}]+\} = require\('(?:kreftjs|kreft)\/server'\)|import \{[^}]+\} from '(?:kreftjs|kreft)\/server')[^\n]*\n)/, `$1${requireLine}`);
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
  const layoutFile = existingKreft(path.join(ctx.frontend, 'layouts', 'app.kreft'));
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
  const routeName = route ? String(route).replace(/\.(kreftjs|kreft|js)$/, '').replace(/^[\\/]+/, '') : 'web';
  const routeBaseName = routeName.split(/[\\/]/).pop();
  const fileTargetName = routeBaseName === 'api' ? 'web' : routeBaseName;
  const routeFile = existingKreft(path.join(ctx.frontend, 'routes', fileTargetName + '.kreft'));

  if (!fs.existsSync(routeFile)) {
    write(routeFile, stubs.webRoutes(fileTargetName));
  }

  const endpoint = '/' + [...(dirs.length ? dirs.map((d) => snake(d).replace(/_/g, '-')) : []), plural(snake(name)).replace(/_/g, '-')].join('/');
  const pageRel = `pages/${[...dirs, name].join('/')}.kreft`;
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

function cleanUpEmptyDirs(filePath, stopDirs) {
  let dir = path.dirname(filePath);
  while (dir && dir !== '.' && dir !== '/' && dir !== path.dirname(dir)) {
    const base = path.basename(dir);
    if (stopDirs.has(base)) break;
    try {
      const items = fs.readdirSync(dir);
      if (items.length === 0) {
        fs.rmdirSync(dir);
        dir = path.dirname(dir);
      } else {
        break;
      }
    } catch (_) {
      break;
    }
  }
}

function removeApiRoute(ctx, name, dirs, { route, dryRun = false }) {
  const routeName = route ? String(route).replace(/\.(js|ts)$/, '').replace(/^[\\/]+/, '') : 'api';
  const routeBaseName = routeName.split(/[\\/]/).pop();
  const routeFiles = [
    path.join(ctx.base, 'routes', routeBaseName + '.js'),
    path.join(ctx.base, 'routes', routeBaseName + '.ts'),
    path.join(ctx.project, 'routes', routeBaseName + '.js'),
    path.join(ctx.project, 'routes', routeBaseName + '.ts')
  ];
  if (routeBaseName !== 'api') {
    routeFiles.push(
      path.join(ctx.base, 'routes', 'api.js'),
      path.join(ctx.base, 'routes', 'api.ts')
    );
  }
  const seenFiles = new Set();
  const removals = [];

  const endpoints = new Set([
    [...(dirs.length ? dirs.map((d) => snake(d).replace(/_/g, '-')) : []), plural(snake(name)).replace(/_/g, '-')].join('/'),
    plural(snake(name)).replace(/_/g, '-')
  ]);
  const controllerName = `${name}Controller`;

  for (const f of routeFiles) {
    if (!f || seenFiles.has(f) || !fs.existsSync(f)) continue;
    seenFiles.add(f);

    const origText = fs.readFileSync(f, 'utf8');
    const lines = origText.split('\n');

    const filteredLines = lines.filter((line) => {
      const trimmed = line.trim();
      const isRoute = trimmed.startsWith('Route.') || trimmed.includes('Route.apiResource(');
      if (isRoute) {
        for (const ep of endpoints) {
          if (line.includes(`'${ep}'`) || line.includes(`"${ep}"`)) {
            return false;
          }
        }
        if (line.includes(controllerName)) {
          return false;
        }
      }
      return true;
    });

    const controllerUsedElsewhere = new RegExp(`\\b${controllerName}\\b`).test(
      filteredLines.filter((l) => !l.includes('require(') && !l.includes('import ')).join('\n')
    );

    let finalLines = filteredLines;
    if (!controllerUsedElsewhere) {
      finalLines = filteredLines.filter((line) => {
        const trimmed = line.trim();
        if ((trimmed.startsWith('const ') || trimmed.startsWith('let ') || trimmed.startsWith('var ') || trimmed.startsWith('import ')) &&
            line.includes(controllerName)) {
          return false;
        }
        return true;
      });
    }

    const newText = finalLines.join('\n').replace(/\n{3,}/g, '\n\n');
    if (newText !== origText) {
      const epStr = Array.from(endpoints)[0];
      const desc = `Route.apiResource('${epStr}', ${controllerName})`;
      removals.push({
        file: f,
        desc,
        apply: () => fs.writeFileSync(f, newText)
      });
    }
  }

  return removals;
}

function removeWebRoute(ctx, name, dirs, { route, dryRun = false }) {
  const routeName = route ? String(route).replace(/\.(kreftjs|kreft|js)$/, '').replace(/^[\\/]+/, '') : 'web';
  const routeBaseName = routeName.split(/[\\/]/).pop();
  const fileTargetName = routeBaseName === 'api' ? 'web' : routeBaseName;
  const routeFiles = [
    path.join(ctx.frontend, 'routes', fileTargetName + '.kreft'),
    path.join(ctx.project, 'frontend', 'routes', fileTargetName + '.kreft'),
    path.join(ctx.frontend, 'routes', 'web.kreft'),
    path.join(ctx.project, 'frontend', 'routes', 'web.kreft'),
    path.join(ctx.project, 'routes', fileTargetName + '.kreft'),
    path.join(ctx.project, 'routes', 'web.kreft')
  ].flatMap(altExts);

  const seenFiles = new Set();
  const removals = [];

  const ep1 = '/' + [...(dirs.length ? dirs.map((d) => snake(d).replace(/_/g, '-')) : []), plural(snake(name)).replace(/_/g, '-')].join('/');
  const ep2 = '/' + plural(snake(name)).replace(/_/g, '-');
  const pageRel1 = `pages/${[...dirs, name].join('/')}.kreft`;
  const pageRel2 = `pages/${name}.kreft`;
  const routeNameTag1 = [...dirs.map(snake), plural(snake(name)).replace(/_/g, '-')].join('.');
  const routeNameTag2 = plural(snake(name)).replace(/_/g, '-');

  const matchTargets = [ep1, ep2, ep1.replace(/^\//, ''), ep2.replace(/^\//, ''), ...altExts(pageRel1), ...altExts(pageRel2), routeNameTag1, routeNameTag2];

  for (const f of routeFiles) {
    if (!f || seenFiles.has(f) || !fs.existsSync(f)) continue;
    seenFiles.add(f);

    const origText = fs.readFileSync(f, 'utf8');
    const lines = origText.split('\n');

    const filteredLines = lines.filter((line) => {
      if (!line.includes('Route.view(')) return true;
      for (const target of matchTargets) {
        if (line.includes(`'${target}'`) || line.includes(`"${target}"`)) {
          return false;
        }
      }
      return true;
    });

    const newText = filteredLines.join('\n').replace(/\n{3,}/g, '\n\n');
    if (newText !== origText) {
      const desc = `Route.view('${ep1}', '${pageRel1}')`;
      removals.push({
        file: f,
        desc,
        apply: () => fs.writeFileSync(f, newText)
      });
    }
  }

  return removals;
}

function removeSidebarLink(ctx, name, dirs, { dryRun = false }) {
  const layoutFiles = [
    path.join(ctx.frontend, 'layouts', 'app.kreft'),
    path.join(ctx.project, 'frontend', 'layouts', 'app.kreft'),
    path.join(ctx.project, 'layouts', 'app.kreft')
  ].flatMap(altExts);

  const seenFiles = new Set();
  const removals = [];

  const routeNameTag1 = [...dirs.map(snake), plural(snake(name)).replace(/_/g, '-')].join('.');
  const routeNameTag2 = plural(snake(name)).replace(/_/g, '-');
  const ep1 = '/' + [...(dirs.length ? dirs.map((d) => snake(d).replace(/_/g, '-')) : []), plural(snake(name)).replace(/_/g, '-')].join('/');
  const ep2 = '/' + plural(snake(name)).replace(/_/g, '-');

  const matchTags = [routeNameTag1, routeNameTag2, ep1, ep2];

  for (const f of layoutFiles) {
    if (!f || seenFiles.has(f) || !fs.existsSync(f)) continue;
    seenFiles.add(f);

    const origText = fs.readFileSync(f, 'utf8');
    const lines = origText.split('\n');

    const filteredLines = lines.filter((line) => {
      if (!line.includes('to:')) return true;
      for (const tag of matchTags) {
        if (line.includes(`'${tag}'`) || line.includes(`"${tag}"`)) {
          return false;
        }
      }
      return true;
    });

    const newText = filteredLines.join('\n');
    if (newText !== origText) {
      removals.push({
        file: f,
        desc: `Sidebar: { to: '${routeNameTag1}' }`,
        apply: () => fs.writeFileSync(f, newText)
      });
    }
  }

  return removals;
}

const pass = (o) => [
  ...(o.backend ? ['--backend', o.backend] : []),
  ...(o.dir ? ['--dir', o.dir] : []),
  ...(o.route ? ['--route', o.route] : []),
  ...(o.flags.has('auth') ? ['--auth'] : []),
];

function introspectModelRules(ctx, modelName, requestName = '') {
  if (!modelName) return null;
  const { dirs, name } = nested(modelName);
  const candidates = [
    ctx && ctx.base ? path.join(ctx.base, 'app', 'Models', ...dirs, name + '.js') : null,
    ctx && ctx.base ? path.join(ctx.base, 'app', 'Models', ...dirs, name + '.ts') : null,
    ctx && ctx.base ? path.join(ctx.base, 'app', ...dirs, name + '.js') : null,
    ctx && ctx.base ? path.join(ctx.base, 'app', ...dirs, name + '.ts') : null,
    path.join(process.cwd(), 'app', 'Models', ...dirs, name + '.js'),
    path.join(process.cwd(), 'app', 'Models', ...dirs, name + '.ts'),
    path.join(process.cwd(), 'demo', 'app', 'Models', ...dirs, name + '.js'),
  ].filter(Boolean);
  let modelFile = candidates.find((f) => fs.existsSync(f));
  if (!modelFile) return null;

  try {
    const text = fs.readFileSync(modelFile, 'utf8');
    const fillableMatch = text.match(/fillable\s*=\s*\[([\s\S]*?)\]/);
    if (!fillableMatch) return null;
    const rawItems = fillableMatch[1].match(/['"`]([\w-]+)['"`]/g);
    if (!rawItems || !rawItems.length) return null;
    const fields = rawItems.map((s) => s.replace(/['"`]/g, ''));

    const casts = {};
    const castsMatch = text.match(/casts\s*=\s*\{([\s\S]*?)\}/);
    if (castsMatch) {
      const castPairs = castsMatch[1].matchAll(/['"`]?(\w+)['"`]?\s*:\s*['"`](\w+)['"`]/g);
      for (const m of castPairs) casts[m[1]] = m[2].toLowerCase();
    }

    const isUpdate = /Update/i.test(requestName);
    const prefix = isUpdate ? 'sometimes|' : 'required|';
    const rules = {};

    for (const field of fields) {
      const cast = casts[field] || '';
      if (cast === 'boolean' || cast === 'bool') {
        rules[field] = `${prefix}boolean`;
      } else if (cast === 'integer' || cast === 'int') {
        rules[field] = `${prefix}integer`;
      } else if (cast === 'float' || cast === 'decimal' || cast === 'real' || cast === 'double') {
        rules[field] = `${prefix}numeric`;
      } else if (cast === 'json' || cast === 'array') {
        rules[field] = `${prefix}array`;
      } else if (cast === 'date' || cast === 'datetime') {
        rules[field] = `${prefix}date`;
      } else if (/email/i.test(field)) {
        rules[field] = `${prefix}string|email|max:255`;
      } else if (/password/i.test(field)) {
        rules[field] = `${prefix}string|min:8`;
      } else if (/url/i.test(field)) {
        rules[field] = `${prefix}url`;
      } else if (/phone|mobile/i.test(field)) {
        rules[field] = `${prefix}string|max:30`;
      } else if (/body|description|content|notes|text/i.test(field)) {
        rules[field] = `${prefix}string`;
      } else {
        rules[field] = `${prefix}string|max:255`;
      }
    }
    return rules;
  } catch (_) {
    return null;
  }
}

const make = {
  model(args) {
    const o = options(args), ctx = context(o);
    let { dirs, name, rel } = nested(o._[0]);
    if (!name) return console.error('  kreft make:model Post [-m -f -s -c -p -r] [--route=file] [--auth] [--all] [--folder=Admin]   (Shop/Product: app/Models/Shop/Product.js)');
    const all = o.flags.has('a') || o.flags.has('all');
    const auth = o.flags.has('auth');
    const hasRoute = all || o.flags.has('r') || o.flags.has('route') || Boolean(o.route);

    // Support placing all auxiliary files (controllers, pages, routes) in a specific folder [except model]:
    // e.g. kreft make:model Post --all --folder=Admin
    //      kreft make:model Post --all Admin
    //      kreft make:model Admin/Post --all --flat-model
    const targetFolder = o.folder || o.subfolder || o['in'] || o.group || o.path || (o._[1] && !o._[1].startsWith('-') ? o._[1] : null);
    const flatModel = o.flags.has('flat-model') || o.flags.has('except-model') || o.flags.has('no-model-dir') || Boolean(targetFolder);

    const modelDirs = flatModel ? [] : dirs;
    const modelRel = [...modelDirs, name].join('/');
    const otherDirs = targetFolder ? targetFolder.split(/[\\/]/).filter(Boolean) : dirs;

    write(path.join(ctx.base, 'app', 'Models', ...modelDirs, name + '.js'), stubs.model(name));
    if (all || o.flags.has('m') || o.flags.has('migration')) make.migration([`create_${plural(snake(name))}_table`, ...pass(o)]);
    if (all || o.flags.has('f') || o.flags.has('factory')) make.factory([`${name}Factory`, '--model', modelRel, ...pass(o)]);
    if (all || o.flags.has('s') || o.flags.has('seed') || o.flags.has('seeder')) make.seeder([`${name}Seeder`, '--model', modelRel, ...pass(o)]);
    if (all || o.flags.has('req') || o.flags.has('request') || o.flags.has('requests')) {
      make.request([[...otherDirs, `Store${name}Request`].join('/'), '--model', modelRel, ...pass(o)]);
      make.request([[...otherDirs, `Update${name}Request`].join('/'), '--model', modelRel, ...pass(o)]);
    }
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
    if (!name) return console.error('  kreft make:controller PostController [--api] [--model Post] [--route=file] [--auth]');
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
    if (!name) return console.error('  kreft make:page Post [--model Post] [--route=file] [--auth]');
    const m = o.model ? nested(o.model) : { dirs, name };
    const modelDirs = m.dirs && m.dirs.length ? m.dirs : dirs;
    const endpoint = [...(modelDirs.length ? modelDirs.map((d) => snake(d).replace(/_/g, '-')) : []), plural(snake(m.name)).replace(/_/g, '-')].join('/');
    const auth = o.flags.has('auth');
    const hasRoute = o.flags.has('r') || o.flags.has('route') || Boolean(o.route);

    const pageFile = path.join(ctx.frontend, 'pages', ...dirs, name + '.kreft');
    const isTs = isTsProject(pageFile);
    if (write(pageFile, stubs.page(name, endpoint, dirs, isTs))) {
      if (hasRoute) {
        addWebRoute(ctx, name, dirs, { route: o.route, auth });
      } else {
        console.log(dim(`  Add to frontend/routes/web.kreft:  Route.view('/${endpoint}', 'pages/${[...dirs, name].join('/')}.kreft')${auth ? ".middleware('auth')" : ''}`));
      }
    }
  },
  factory(args) {
    const o = options(args), ctx = context(o);
    let { dirs, name } = nested(o._[0]);
    if (!name) return console.error('  kreft make:factory PostFactory [--model Post]');
    if (!name.endsWith('Factory')) name += 'Factory';
    const m = o.model ? nested(o.model) : { dirs: [], name: name.replace(/Factory$/, '') };
    const modelReq = '../../app/Models/' + [...m.dirs, m.name].join('/');
    write(path.join(ctx.base, 'database', 'factories', ...dirs, name + '.js'), stubs.factory(name, m.name, modelReq));
  },
  migration(args) {
    const o = options(args), ctx = context(o);
    const name = snake(o._[0] || '').replace(/[^a-z0-9_]/g, '_');
    if (!name) return console.error('  kreft make:migration create_posts_table');
    const dir = migrationsOf(o, ctx);
    write(path.join(dir, `${nextStamp(dir)}_${name}.js`), stubs.migration(name));
  },
  seeder(args) {
    const o = options(args), ctx = context(o);
    let { dirs, name } = nested(o._[0]);
    if (!name) return console.error('  kreft make:seeder PostSeeder');
    if (!/Seeder$/.test(name)) name += 'Seeder';
    const m = o.model ? nested(o.model) : null;
    const modelReq = m ? up(2 + dirs.length) + ['app', 'Models', ...m.dirs, m.name].join('/') : null;
    write(path.join(ctx.base, 'database', 'seeders', ...dirs, name + '.js'), stubs.seeder(name, m ? m.name : null, modelReq));
  },
  middleware(args) {
    const o = options(args), ctx = context(o);
    const { dirs, name } = nested(o._[0]);
    if (!name) return console.error('  kreft make:middleware EnsureIsAdmin');
    write(path.join(ctx.base, 'app', 'Http', 'Middleware', ...dirs, name + '.js'), stubs.middleware(name));
    if (dirs.length) console.log(dim(`  In a folder, give it a name in app/Http/Kernel.js:  aliases: { '${snake(name).replace(/_/g, '-')}': 'Middleware/${[...dirs, name].join('/')}.js' }`));
  },
  request(args) {
    const o = options(args), ctx = context(o);
    let { dirs, name } = nested(o._[0]);
    if (!name) return console.error('  kreft make:request StorePostRequest [--model Post]');
    if (!/Request$/.test(name)) name += 'Request';
    const reqDir = path.join(ctx.base, 'app', 'Http', 'Requests');
    if (!fs.existsSync(reqDir)) fs.mkdirSync(reqDir, { recursive: true });
    const isTs = isTsProject(path.join(reqDir, ...dirs, name + '.js'));
    const ext = isTs ? '.ts' : '.js';
    const filePath = path.join(reqDir, ...dirs, name + ext);
    const rulesObj = introspectModelRules(ctx, o.model, name);
    if (write(filePath, stubs.request(name, rulesObj, isTs))) {
      console.log(dim(`  In controller:  const data = await ${name}.validate(req)`));
    }
  },
  resource(args) {
    const o = options(args), ctx = context(o);
    let { dirs, name } = nested(o._[0]);
    if (!name) return console.error('  kreft make:resource PostResource');
    if (!/Resource$/.test(name)) name += 'Resource';
    const resDir = path.join(ctx.base, 'app', 'Http', 'Resources');
    if (!fs.existsSync(resDir)) fs.mkdirSync(resDir, { recursive: true });
    const isTs = isTsProject(path.join(resDir, ...dirs, name + '.js'));
    const ext = isTs ? '.ts' : '.js';
    const filePath = path.join(resDir, ...dirs, name + ext);
    if (write(filePath, stubs.resource(name, isTs))) {
      console.log(dim(`  In controller:  return new ${name}(item)`));
    }
  },
  rule(args) {
    const o = options(args), ctx = context(o);
    let { dirs, name } = nested(o._[0]);
    if (!name) return console.error('  kreft make:rule Uppercase');
    const ruleDir = path.join(ctx.base, 'app', 'Rules');
    if (!fs.existsSync(ruleDir)) fs.mkdirSync(ruleDir, { recursive: true });
    const isTs = isTsProject(path.join(ruleDir, ...dirs, name + '.js'));
    const ext = isTs ? '.ts' : '.js';
    const filePath = path.join(ruleDir, ...dirs, name + ext);
    if (write(filePath, stubs.rule(name, isTs))) {
      console.log(dim(`  In rules:  { field: ['required', new ${name}()] }`));
    }
  },
  lang(args) {
    const o = options(args), ctx = context(o);
    const locale = (o._[0] || '').toLowerCase().trim();
    if (!locale || /[\/\\]|\.\./.test(locale)) {
      console.error('  kreft make:lang <locale>   (e.g. kreft make:lang ar)');
      return;
    }
    // Place in project root lang/ (matching standard Laravel 9/10/11) or backend/lang/ if already existing
    const rootLang = path.join(ctx.project || ctx.base, 'lang');
    const backendLang = path.join(ctx.base, 'lang');
    const targetBase = fs.existsSync(backendLang) && !fs.existsSync(rootLang) ? backendLang : rootLang;
    const langDir = path.join(targetBase, locale);
    if (!fs.existsSync(langDir)) fs.mkdirSync(langDir, { recursive: true });

    const isAr = locale === 'ar';

    // 1. auth.json
    const authPath = path.join(langDir, 'auth.json');
    if (!fs.existsSync(authPath)) {
      const authData = isAr ? {
        failed: 'بيانات الاعتماد هذه غير متطابقة مع سجلاتنا.',
        password: 'كلمة المرور المدخلة غير صحيحة.',
        throttle: 'محاولات تسجيل دخول كثيرة جداً. يرجى المحاولة بعد :seconds ثانية.'
      } : {
        failed: 'These credentials do not match our records.',
        password: 'The provided password is incorrect.',
        throttle: 'Too many login attempts. Please try again in :seconds seconds.'
      };
      write(authPath, JSON.stringify(authData, null, 2) + '\n');
    }

    // 2. pagination.json
    const pagPath = path.join(langDir, 'pagination.json');
    if (!fs.existsSync(pagPath)) {
      const pagData = isAr ? {
        previous: '&laquo; السابق',
        next: 'التالي &raquo;'
      } : {
        previous: '&laquo; Previous',
        next: 'Next &raquo;'
      };
      write(pagPath, JSON.stringify(pagData, null, 2) + '\n');
    }

    // 3. passwords.json
    const passPath = path.join(langDir, 'passwords.json');
    if (!fs.existsSync(passPath)) {
      const passData = isAr ? {
        reset: 'تمت إعادة تعيين كلمة المرور بنجاح.',
        sent: 'تم إرسال رابط تعيين كلمة المرور إلى بريدك الإلكتروني.',
        throttled: 'يرجى الانتظار قبل إعادة المحاولة.',
        token: 'رمز إعادة تعيين كلمة المرور هذا غير صالح.',
        user: 'لا يمكننا العثور على مستخدم بعنوان البريد الإلكتروني هذا.'
      } : {
        reset: 'Your password has been reset.',
        sent: 'We have emailed your password reset link.',
        throttled: 'Please wait before retrying.',
        token: 'This password reset token is invalid.',
        user: "We can't find a user with that email address."
      };
      write(passPath, JSON.stringify(passData, null, 2) + '\n');
    }

    // 4. messages.json
    const msgPath = path.join(langDir, 'messages.json');
    if (!fs.existsSync(msgPath)) {
      const msgData = isAr ? {
        welcome: 'أهلاً بك في Kreft',
        hello: 'مرحباً، :name',
        items: '{0} لا توجد عناصر|{1} عنصر واحد|{2} عنصران|[3,10] :count عناصر|[11,*] :count عنصراً'
      } : {
        welcome: 'Welcome to Kreft',
        hello: 'Hello, :name',
        items: '{0} No items|{1} One item|[2,*] :count items'
      };
      write(msgPath, JSON.stringify(msgData, null, 2) + '\n');
    }

    // 5. validation.json
    const valPath = path.join(langDir, 'validation.json');
    if (!fs.existsSync(valPath)) {
      const valData = isAr ? {
        required: 'حقل :attribute مطلوب.',
        email: 'يجب أن يكون :attribute عنوان بريد إلكتروني صالح.',
        min: {
          string: 'يجب أن يحتوي :attribute على :min أحرف على الأقل.',
          numeric: 'يجب أن تكون قيمة :attribute على الأقل :min.',
          array: 'يجب أن يحتوي :attribute على الأقل على :min عناصر.'
        },
        max: {
          string: 'يجب ألا يتجاوز :attribute :max أحرف.',
          numeric: 'يجب ألا تتجاوز قيمة :attribute :max.',
          array: 'يجب ألا يحتوي :attribute على أكثر من :max عناصر.'
        },
        confirmed: 'تأكيد :attribute غير متطابق.',
        attributes: {
          email: 'البريد الإلكتروني',
          password: 'كلمة المرور',
          name: 'الاسم',
          title: 'العنوان'
        }
      } : {
        required: 'The :attribute field is required.',
        email: 'The :attribute field must be a valid email address.',
        min: {
          string: 'The :attribute field must be at least :min characters.',
          numeric: 'The :attribute field must be at least :min.',
          array: 'The :attribute field must have at least :min items.'
        },
        max: {
          string: 'The :attribute field must not be greater than :max characters.',
          numeric: 'The :attribute field must not be greater than :max.',
          array: 'The :attribute field must not have more than :max items.'
        },
        confirmed: 'The :attribute confirmation does not match.',
        attributes: {
          email: 'email address',
          password: 'password',
          name: 'name',
          title: 'title'
        }
      };
      write(valPath, JSON.stringify(valData, null, 2) + '\n');
    }

    // 6. Root string translation: lang/<locale>.json
    const rootJsonPath = path.join(targetBase, `${locale}.json`);
    if (!fs.existsSync(rootJsonPath)) {
      const rootStrings = isAr ? {
        'Sign In': 'تسجيل الدخول',
        'Sign Up': 'إنشاء حساب جديد',
        'Dashboard': 'لوحة التحكم',
        'Profile': 'الملف الشخصي',
        'Logout': 'تسجيل الخروج',
        'Save': 'حفظ',
        'Cancel': 'إلغاء'
      } : {
        'Sign In': 'Sign In',
        'Sign Up': 'Sign Up',
        'Dashboard': 'Dashboard',
        'Profile': 'Profile',
        'Logout': 'Logout',
        'Save': 'Save',
        'Cancel': 'Cancel'
      };
      write(rootJsonPath, JSON.stringify(rootStrings, null, 2) + '\n');
    }

    console.log(dim(`  Laravel-compatible translations created in ${path.relative(process.cwd(), targetBase)}/${locale}/ & ${locale}.json`));
    console.log(dim(`  Use in backend:  __('auth.failed') or __('Sign In')`));
    console.log(dim(`  Use in frontend: { __('auth.failed') } or { t('Sign In') }`));
  },
};
// kreft make:errors — the error pages (errors/404.kreft, 403, 500…)
make.errors = function (args) {
  const o = options(args), ctx = context(o);
  const from = path.join(__dirname, '..', 'templates', 'errors');
  const to = path.resolve(o.dir || ctx.frontend, o._[0] || 'errors');
  for (const f of fs.readdirSync(from).sort()) write(path.join(to, f), fs.readFileSync(path.join(from, f), 'utf8'));
  // turn them on in the router, if index.html doesn't yet
  const index = path.join(o.dir ? path.resolve(o.dir) : ctx.frontend, 'index.html');
  if (fs.existsSync(index)) {
    const html = fs.readFileSync(index, 'utf8');
    if (!/errors\s*:/.test(html) && /(?:Kreftjs|Kreft)\.router\(\{/.test(html)) {
      fs.writeFileSync(index, html.replace(/(?:Kreftjs|Kreft)\.router\(\{/, (m) => `${m}\n      errors: '${path.relative(path.dirname(index), to).split(path.sep).join('/')}', // error pages: errors/404.kreft, abort(403) → errors/403.kreft`));
      console.log(`  ${green('UPDATED')}  ${path.relative(process.cwd(), index) || 'index.html'}  (errors: '${path.relative(path.dirname(index), to).split(path.sep).join('/')}' in Kreftjs.router)`);
    }
  }
};

// kreft make:routes admin        → frontend/routes/admin.kreft (pages), listed in Kreftjs.router({ routes: […] }) in index.html
// kreft make:routes admin --api  → backend/routes/admin.js (API), loaded by routes/api.js
make.routes = function (args) {
  const o = options(args), ctx = context(o);
  const name = String(o._[0] || '').replace(/\.(kreftjs|kreft|js)$/, '').replace(/[^\w-]/g, '');
  if (!name) return console.error('  kreft make:routes admin        (pages)\n  kreft make:routes admin --api  (API)');
  if (o.flags.has('api')) {
    const file = path.join(ctx.base, 'routes', name + '.js');
    if (!write(file, stubs.apiRoutes(name))) return;
    const api = require('./backend/typescript.js').findFile(path.join(ctx.base, 'routes', 'api')) || path.join(ctx.base, 'routes', 'api.js');
    if (fs.existsSync(api) && name !== 'api') {
      const text = fs.readFileSync(api, 'utf8');
      const isTs = api.endsWith('.ts');
      if (!text.includes(`require('./${name}')`) && !text.includes(`import './${name}'`)) {
        const updated = isTs
          ? text.replace(/(import \{[^}]*Route[^}]*\} from ['"](?:kreftjs|kreft)\/server['"][^\n]*\n)/, `$1\n// ${name} routes (routes/${name}.ts)\nimport './${name}'\n`)
          : text.replace(/(const \{ Route \} = require\('(?:kreftjs|kreft)\/server'\)\n)/, `$1\n// ${name} routes (routes/${name}.js)\nrequire('./${name}')\n`);
        fs.writeFileSync(api, updated !== text ? updated : text + `\n${isTs ? `import './${name}'` : `require('./${name}')`}\n`);
        console.log(`  ${green('UPDATED')}  ${path.relative(process.cwd(), api)}  (${isTs ? `import './${name}'` : `require('./${name}')`})`);
      }
    }
    return;
  }
  const file = path.join(ctx.frontend, 'routes', name + '.kreft');
  if (!write(file, stubs.webRoutes(name))) return;
  const index = path.join(ctx.frontend, 'index.html');
  if (!fs.existsSync(index)) return;
  const html = fs.readFileSync(index, 'utf8');
  const entry = `'routes/${name}.kreft'`;
  if (html.includes(entry)) return;
  let next = html;
  if (/routes:\s*\[\s*'routes\//.test(html)) next = html.replace(/(routes:\s*\[[^\]]*?)(\s*\])/, (_, list, end) => `${list.replace(/,\s*$/, '')}, ${entry}${end}`);
  else if (/routes:\s*'routes\/[^']+'/.test(html)) next = html.replace(/routes:\s*('routes\/[^']+')/, (_, first) => `routes: [${first}, ${entry}]`);
  if (next === html) return console.log(`  Add ${entry} to the routes in Kreftjs.router({ routes: [...] }) in index.html.`);
  fs.writeFileSync(index, next);
  console.log(`  ${green('UPDATED')}  ${path.relative(process.cwd(), index)}  (${entry} in Kreftjs.router)`);
};

// kreft make:admin you@example.com      → that user may open the admin panel (/admin)
// kreft make:admin you@example.com --remove
commands['make:admin'] = async function (args) {
  const o = options(args), ctx = context(o);
  const email = String(o._[0] || '').trim().toLowerCase(); // Register keeps emails in lowercase
  if (!email) return console.error('  kreft make:admin you@example.com   (--remove takes the rights away)');
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

async function removeModel(args) {
  const o = options(args);
  const ctx = context(o);

  let rawPositional = [...o._];
  if (rawPositional[0] && rawPositional[0].toLowerCase() === 'model') {
    rawPositional.shift();
  }

  const ARTIFACT_KEYWORDS = new Set([
    'all',
    'controller', 'controllers', 'c',
    'request', 'requests', 'req',
    'route', 'routes', 'r',
    'migration', 'migrations', 'm',
    'seeder', 'seeders', 'seed', 's',
    'factory', 'factories', 'f',
    'page', 'pages', 'p',
    'model', 'models'
  ]);

  const positionalTokens = new Set();
  let targetModelName = o.model || null;
  let positionalFolder = null;

  for (const token of rawPositional) {
    const lower = token.toLowerCase();
    if (ARTIFACT_KEYWORDS.has(lower)) {
      positionalTokens.add(lower);
    } else if (!targetModelName) {
      targetModelName = token;
    } else if (!positionalFolder && !o.folder) {
      positionalFolder = token;
    }
  }

  if (!targetModelName) {
    console.error('  Usage: kreft remove:model <Name> [--all] [--controller] [--request] [--route] [--migration] [--seeder] [--factory] [--page] [--folder=Folder]');
    console.error('         kreft remove model <Name> [options]');
    console.error('         kreft:remove model <Name> [options]');
    return;
  }

  const { dirs, name } = nested(targetModelName);
  const targetFolder = o.folder || o.subfolder || o['in'] || o.group || o.path || positionalFolder;
  const otherDirs = targetFolder ? targetFolder.split(/[\\/]/).filter(Boolean) : dirs;
  const flatModel = o.flags.has('flat-model') || o.flags.has('except-model') || o.flags.has('no-model-dir') || Boolean(targetFolder);
  const modelDirs = flatModel ? [] : dirs;

  const wantsAll = o.flags.has('a') || o.flags.has('all') || positionalTokens.has('all');
  const wantsController = wantsAll || o.flags.has('c') || o.flags.has('controller') || o.flags.has('controllers') || positionalTokens.has('controller') || positionalTokens.has('controllers') || positionalTokens.has('c');
  const wantsRequest = wantsAll || o.flags.has('req') || o.flags.has('request') || o.flags.has('requests') || positionalTokens.has('request') || positionalTokens.has('requests') || positionalTokens.has('req');
  const wantsRoute = wantsAll || o.flags.has('r') || o.flags.has('route') || o.flags.has('routes') || positionalTokens.has('route') || positionalTokens.has('routes') || positionalTokens.has('r');
  const wantsMigration = wantsAll || o.flags.has('m') || o.flags.has('migration') || o.flags.has('migrations') || positionalTokens.has('migration') || positionalTokens.has('migrations') || positionalTokens.has('m');
  const wantsSeeder = wantsAll || o.flags.has('s') || o.flags.has('seed') || o.flags.has('seeder') || o.flags.has('seeders') || positionalTokens.has('seeder') || positionalTokens.has('seeders') || positionalTokens.has('seed') || positionalTokens.has('s');
  const wantsFactory = wantsAll || o.flags.has('f') || o.flags.has('factory') || o.flags.has('factories') || positionalTokens.has('factory') || positionalTokens.has('factories') || positionalTokens.has('f');
  const wantsPage = wantsAll || o.flags.has('p') || o.flags.has('page') || o.flags.has('pages') || positionalTokens.has('page') || positionalTokens.has('pages') || positionalTokens.has('p');

  const anySpecific = wantsController || wantsRequest || wantsRoute || wantsMigration || wantsSeeder || wantsFactory || wantsPage;
  const wantsModel = wantsAll || o.flags.has('model') || positionalTokens.has('model') || positionalTokens.has('models') || !anySpecific;

  const dryRun = o.flags.has('dry-run') || o.flags.has('d');
  const force = o.flags.has('force') || o.flags.has('f') || o.flags.has('yes') || o.flags.has('y');

  // Collect candidate files to delete
  const filesToDelete = new Set();
  const checkFile = (p) => {
    for (const f of altExts(p || '')) if (f && fs.existsSync(f)) filesToDelete.add(f);
  };

  // 1. Model
  if (wantsModel) {
    checkFile(path.join(ctx.base, 'app', 'Models', ...modelDirs, `${name}.js`));
    checkFile(path.join(ctx.base, 'app', 'Models', ...modelDirs, `${name}.ts`));
    if (dirs.length) {
      checkFile(path.join(ctx.base, 'app', 'Models', ...dirs, `${name}.js`));
      checkFile(path.join(ctx.base, 'app', 'Models', ...dirs, `${name}.ts`));
      checkFile(path.join(ctx.project, 'app', 'Models', ...dirs, `${name}.js`));
      checkFile(path.join(ctx.project, 'app', 'Models', ...dirs, `${name}.ts`));
    }
    checkFile(path.join(ctx.base, 'app', 'Models', `${name}.js`));
    checkFile(path.join(ctx.base, 'app', 'Models', `${name}.ts`));
    checkFile(path.join(ctx.project, 'app', 'Models', `${name}.js`));
    checkFile(path.join(ctx.project, 'app', 'Models', `${name}.ts`));
  }

  // 2. Controller
  if (wantsController) {
    checkFile(path.join(ctx.base, 'app', 'Http', 'Controllers', ...otherDirs, `${name}Controller.js`));
    checkFile(path.join(ctx.base, 'app', 'Http', 'Controllers', ...otherDirs, `${name}Controller.ts`));
    if (dirs.length && dirs.join('/') !== otherDirs.join('/')) {
      checkFile(path.join(ctx.base, 'app', 'Http', 'Controllers', ...dirs, `${name}Controller.js`));
      checkFile(path.join(ctx.base, 'app', 'Http', 'Controllers', ...dirs, `${name}Controller.ts`));
    }
    checkFile(path.join(ctx.base, 'app', 'Http', 'Controllers', `${name}Controller.js`));
    checkFile(path.join(ctx.base, 'app', 'Http', 'Controllers', `${name}Controller.ts`));
    checkFile(path.join(ctx.project, 'app', 'Http', 'Controllers', ...otherDirs, `${name}Controller.js`));
    checkFile(path.join(ctx.project, 'app', 'Http', 'Controllers', ...dirs, `${name}Controller.js`));
    checkFile(path.join(ctx.project, 'app', 'Http', 'Controllers', `${name}Controller.js`));
  }

  // 3. Requests
  if (wantsRequest) {
    for (const prefix of ['Store', 'Update']) {
      checkFile(path.join(ctx.base, 'app', 'Http', 'Requests', ...otherDirs, `${prefix}${name}Request.js`));
      checkFile(path.join(ctx.base, 'app', 'Http', 'Requests', ...otherDirs, `${prefix}${name}Request.ts`));
      if (dirs.length && dirs.join('/') !== otherDirs.join('/')) {
        checkFile(path.join(ctx.base, 'app', 'Http', 'Requests', ...dirs, `${prefix}${name}Request.js`));
        checkFile(path.join(ctx.base, 'app', 'Http', 'Requests', ...dirs, `${prefix}${name}Request.ts`));
      }
      checkFile(path.join(ctx.base, 'app', 'Http', 'Requests', `${prefix}${name}Request.js`));
      checkFile(path.join(ctx.base, 'app', 'Http', 'Requests', `${prefix}${name}Request.ts`));
      checkFile(path.join(ctx.project, 'app', 'Http', 'Requests', ...otherDirs, `${prefix}${name}Request.js`));
      checkFile(path.join(ctx.project, 'app', 'Http', 'Requests', ...dirs, `${prefix}${name}Request.js`));
      checkFile(path.join(ctx.project, 'app', 'Http', 'Requests', `${prefix}${name}Request.js`));
    }
  }

  // 4. Factory
  if (wantsFactory) {
    checkFile(path.join(ctx.base, 'database', 'factories', `${name}Factory.js`));
    checkFile(path.join(ctx.base, 'database', 'factories', `${name}Factory.ts`));
    if (dirs.length) {
      checkFile(path.join(ctx.base, 'database', 'factories', ...dirs, `${name}Factory.js`));
      checkFile(path.join(ctx.base, 'database', 'factories', ...dirs, `${name}Factory.ts`));
    }
    checkFile(path.join(ctx.project, 'database', 'factories', `${name}Factory.js`));
    checkFile(path.join(ctx.project, 'database', 'factories', `${name}Factory.ts`));
  }

  // 5. Seeder
  if (wantsSeeder) {
    checkFile(path.join(ctx.base, 'database', 'seeders', `${name}Seeder.js`));
    checkFile(path.join(ctx.base, 'database', 'seeders', `${name}Seeder.ts`));
    if (dirs.length) {
      checkFile(path.join(ctx.base, 'database', 'seeders', ...dirs, `${name}Seeder.js`));
      checkFile(path.join(ctx.base, 'database', 'seeders', ...dirs, `${name}Seeder.ts`));
    }
    checkFile(path.join(ctx.project, 'database', 'seeders', `${name}Seeder.js`));
    checkFile(path.join(ctx.project, 'database', 'seeders', `${name}Seeder.ts`));
  }

  // 6. Page
  if (wantsPage) {
    checkFile(path.join(ctx.frontend, 'pages', ...otherDirs, `${name}.kreft`));
    if (dirs.length && dirs.join('/') !== otherDirs.join('/')) {
      checkFile(path.join(ctx.frontend, 'pages', ...dirs, `${name}.kreft`));
    }
    checkFile(path.join(ctx.frontend, 'pages', `${name}.kreft`));
    checkFile(path.join(ctx.project, 'frontend', 'pages', ...otherDirs, `${name}.kreft`));
    checkFile(path.join(ctx.project, 'frontend', 'pages', ...dirs, `${name}.kreft`));
    checkFile(path.join(ctx.project, 'frontend', 'pages', `${name}.kreft`));
    checkFile(path.join(ctx.project, 'pages', ...otherDirs, `${name}.kreft`));
    checkFile(path.join(ctx.project, 'pages', ...dirs, `${name}.kreft`));
    checkFile(path.join(ctx.project, 'pages', `${name}.kreft`));
  }

  // 7. Migration
  if (wantsMigration) {
    const migrationDirs = new Set([
      migrationsOf(o, ctx),
      path.join(ctx.base, 'database', 'migrations'),
      path.join(ctx.project, 'database', 'migrations')
    ]);
    const pluralSnake = plural(snake(name));
    const singularSnake = snake(name);
    const migPattern = new RegExp(`^\\d{4}_\\d{2}_\\d{2}_\\d{6}_create_(${pluralSnake}|${singularSnake})_table\\.(js|ts|sql)$`);
    const fallbackPattern = new RegExp(`_create_(${pluralSnake}|${singularSnake})_table\\.(js|ts|sql)$`);

    for (const mDir of migrationDirs) {
      if (!fs.existsSync(mDir)) continue;
      try {
        const files = fs.readdirSync(mDir);
        for (const file of files) {
          if (migPattern.test(file) || fallbackPattern.test(file)) {
            checkFile(path.join(mDir, file));
          }
        }
      } catch (_) {}
    }
  }

  // 8. Routes
  let routeRemovals = [];
  if (wantsRoute || wantsController) {
    // a deleted controller must not stay required by routes/api.js (that would break every /api route, login too)
    routeRemovals.push(...removeApiRoute(ctx, name, otherDirs, { route: o.route, dryRun }));
    if (dirs.length && dirs.join('/') !== otherDirs.join('/')) {
      routeRemovals.push(...removeApiRoute(ctx, name, dirs, { route: o.route, dryRun }));
    }
  }
  if (wantsRoute) {
    routeRemovals.push(...removeWebRoute(ctx, name, otherDirs, { route: o.route, dryRun }));
    if (dirs.length && dirs.join('/') !== otherDirs.join('/')) {
      routeRemovals.push(...removeWebRoute(ctx, name, dirs, { route: o.route, dryRun }));
    }
    routeRemovals.push(...removeSidebarLink(ctx, name, otherDirs, { dryRun }));
    if (dirs.length && dirs.join('/') !== otherDirs.join('/')) {
      routeRemovals.push(...removeSidebarLink(ctx, name, dirs, { dryRun }));
    }
  }

  const seenRouteFileDescs = new Set();
  routeRemovals = routeRemovals.filter((r) => {
    const key = `${r.file}::${r.desc}`;
    if (seenRouteFileDescs.has(key)) return false;
    seenRouteFileDescs.add(key);
    return true;
  });

  const totalItems = filesToDelete.size + routeRemovals.length;
  if (totalItems === 0) {
    console.log(`  No matching files or routes found for ${name}.`);
    return;
  }

  if (dryRun) {
    for (const f of filesToDelete) {
      console.log(`  ${yellow('WOULD DELETE')}  ${path.relative(process.cwd(), f)}`);
    }
    for (const r of routeRemovals) {
      console.log(`  ${yellow('WOULD REMOVE')}  ${path.relative(process.cwd(), r.file)}  (${r.desc})`);
    }
    console.log(`\n  ${totalItems} item${totalItems === 1 ? '' : 's'} would be removed (dry-run).`);
    return;
  }

  if (!force && process.stdin.isTTY && process.stdout.isTTY) {
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise((resolve) => {
      console.log(`\n  Remove ${totalItems} item${totalItems === 1 ? '' : 's'} for ${name}:`);
      for (const f of filesToDelete) console.log(`    - ${path.relative(process.cwd(), f)}`);
      for (const r of routeRemovals) console.log(`    - ${path.relative(process.cwd(), r.file)} (${r.desc})`);
      rl.question('\n  Are you sure? [y/N]: ', (ans) => {
        rl.close();
        resolve(String(ans || '').trim().toLowerCase());
      });
    });
    if (answer !== 'y' && answer !== 'yes') {
      console.log('  Removal cancelled.');
      return;
    }
  }

  const stopDirs = new Set(['app', 'backend', 'frontend', 'database', 'Models', 'Controllers', 'Requests', 'factories', 'seeders', 'migrations', 'pages', 'routes', 'views', '.']);

  let count = 0;
  for (const f of filesToDelete) {
    try {
      fs.unlinkSync(f);
      cleanUpEmptyDirs(f, stopDirs);
      console.log(`  ${red('DELETED')}  ${path.relative(process.cwd(), f)}`);
      count++;
    } catch (e) {
      console.error(`  Failed to delete ${path.relative(process.cwd(), f)}: ${e.message}`);
    }
  }

  for (const r of routeRemovals) {
    try {
      r.apply();
      console.log(`  ${red('REMOVED')}  ${path.relative(process.cwd(), r.file)}  (${r.desc})`);
      count++;
    } catch (e) {
      console.error(`  Failed to update ${path.relative(process.cwd(), r.file)}: ${e.message}`);
    }
  }

  console.log(`\n  ${count} item${count === 1 ? '' : 's'} removed.`);
}

const remove = {
  model: removeModel
};

commands['remove:model'] = remove.model;
commands['kreft:remove:model'] = remove.model;
commands['remove'] = async function (args) {
  const o = options(args);
  const first = (o._[0] || '').toLowerCase();
  if (first === 'model') {
    return await remove.model(args);
  }
  if (first && typeof remove[first] === 'function') {
    return await remove[first](args);
  }
  return await remove.model(args);
};
commands['kreft:remove'] = commands['remove'];

module.exports = { commands, stubs, make, remove, helpers: { options, context, withDb, write, nested, green, red, yellow, dim, migrationsOf, nextStamp, up, pascal, runSeed } };
// the rest of the commands (queues, schedule, cache, tinker, make:job …) add themselves here
require('./artisan-more.js');
