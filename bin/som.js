#!/usr/bin/env node
/*
 * The som command
 *
 *   som new my-app            create a new Som.js project
 *   som dev                   run the dev server in this folder (http://localhost:8000)
 *   som dev --port 3000       another port
 *   som dev ./site            another folder
 *   som build                 build this folder for production into ./dist
 *   som vscode                install colors and snippets for .som files in VS Code
 *   som serve dist            run the built app in production (with --db: its database API)
 *   som db migrate            run new database/migrations/*.sql   (also: seed, tables, sql "…")
 *   som help                  show this help
 *
 * No dependencies — only Node.js.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const pkg = require('../package.json');

// Auto-enable V8 exposed GC if --gc is requested or AUTO_GC=1
if (require.main === module && (process.argv.includes('--gc') || process.env.AUTO_GC === '1') && typeof global.gc !== 'function') {
  const { spawn } = require('child_process');
  const child = spawn(process.execPath, ['--expose-gc', ...process.argv.slice(1)], {
    stdio: 'inherit',
    env: process.env,
  });
  child.on('exit', (code, sig) => {
    if (sig) process.kill(process.pid, sig);
    else process.exit(code ?? 0);
  });
  return;
}

const rawArgs = process.argv.slice(2).filter((a) => a !== '--gc');
const [command = 'help', ...rest] = rawArgs;

const commands = {
  ...require('./artisan.js').commands,
  'link:storage': (a) => require('./artisan.js').commands['storage:link'](a),
  'unlink:storage': (a) => require('./artisan.js').commands['storage:unlink'](a),
  sitemap: (a) => require('./artisan.js').commands['sitemap'](a),
  electron: (a) => require('./electron.js').run(a),
  'electron:dev': (a) => require('./electron.js').dev(a),
  'electron:build': (a) => require('./electron.js').build(a),
  'electron:init': (a) => require('./electron.js').init(a),
  'make:electron': (a) => require('./electron.js').init(a),
  vite: (a) => require('./vite.js').dev(a),
  'vite:dev': (a) => require('./vite.js').dev(a),
  'vite:build': (a) => require('./vite.js').build(a),
  'vite:preview': (a) => require('./vite.js').preview(a),
  'vite:init': (a) => require('./vite.js').init(a),
  'make:vite': (a) => require('./vite.js').init(a),
  mcp: (a) => {
    const { getMcpServer } = require('./backend/mcp.js');
    console.error(`  Som.js MCP Server listening on stdio (Model Context Protocol)...`);
    getMcpServer().listenStdio();
  },
  redis: redisPingCommand,
  'redis:ping': redisPingCommand,
  add: (args) => require('./add.js')(args),
  install: (args) => require('./add.js')(args),
  i: (args) => require('./add.js')(args),
  new: createProject, dev: devServer, serve: (a) => devServer(a, { production: true }), db: dbCommand, vscode: installVscode, build: (args) => require('./build.js')(args), update: (args) => require('./update.js')(args), upgrade: (args) => require('./update.js')(args), help, '--help': help, '-h': help, '--version': version, '-v': version
};
if (commands[command]) commands[command](rest);
else if (command && !command.startsWith('-')) {
  // your own commands: app/Console/Commands (som make:command SendReport)
  require('./artisan-more.js').runCustom(command, rest).then((found) => { if (!found) unknown(); }, (e) => { console.error('  ' + (e.stack || e)); process.exitCode = 1; });
} else unknown();

/* ------------------------------------------------------------------ help */
function help() {
  console.log(`
  Som.js ${pkg.version}

  Usage:
    som new <name>          Create a new project in a folder called <name>, with login, register,
                            password reset, email verification and profile pages (on SQLite)
        --db <kind>         …on another database (sqlite, mysql or postgres), plus a Todos example
        --redis             …configure Redis for caching, background queues and pub/sub
        --ui <library>      …with a CSS library from a CDN: tailwind, bootstrap, bulma or pico
        --ts                …use TypeScript across frontend (.som, .ts) and backend (.ts)
        --js                …use JavaScript (default when non-interactive)
        --electron          …with Electron desktop app support (main.js, preload.js, packaging)
        --vite              …with Vite.js bundling & instant HMR (vite.config.js, npm run vite)
    som dev [folder]        Start the dev server (default: this folder)
        --port <number>     Port to use (default: 8000, or the next free one)
        --host <address>    Who may open it (default: 127.0.0.1, only this computer; 0.0.0.0: your network)
        --api <file.json>   Serve a REST API from a JSON file at /api (GET, POST, PUT, PATCH, DELETE)
        --delay <ms>        Wait this long before each API answer, to see loading states
        --no-save           Keep API changes in memory only (by default they are written to the file)
        --no-hot            Turn off hot reload, the error overlay and the DevTools button
        --migrations <dir>  Where the migrations are (default: database/migrations)
        --seed              Seed a new database (when migrations ran for the first time)
        --backend <dir>     Where routes/, app/ and database/ are (default: the project)
        --server <dir>      Your own Node.js code for /api (default: server/): server/hello.js → /api/hello
        --db <database>     Serve the tables of a database at /api (new migrations run first):
                              sqlite:database/app.db   (built in, nothing to install)
                              mysql://user:pass@localhost:3306/shop   (som add mysql2)
                              postgres://user:pass@localhost:5432/shop  (som add pg)
    som serve [folder]      Run a built app for real users (folder: dist). Same --port and --db;
                            only the tables listed in som.config.json are served

  Bundler & Dev Server (Vite.js):
    som vite                Start Vite dev server and proxy backend API (alias: som vite:dev)
    som vite:dev            Start Vite dev server with instant HMR and backend proxy
    som vite:build          Build production bundle with Vite and Rollup
    som vite:preview        Preview production build locally with Vite
    som vite:init           Add Vite configuration to an existing project (alias: som make:vite)

  Desktop (Electron.js):
    som electron            Start dev server and launch desktop window (alias: som electron:dev)
    som electron:dev        Start dev server and launch desktop window
    som electron:build      Build static bundle and package desktop app with electron-builder
    som electron:init       Add Electron support to an existing project (alias: som make:electron)

  The backend (som list shows every command, yours too):
    som key:generate        Set the application encryption key in .env (--show: print only)
    som migrate             Run new migrations in database/migrations (.js or .sql)
    som migrate:rollback    Undo the last batch of migrations (--step 2: the last two)
    som migrate:fresh       Drop every table and migrate again (--seed: then seed)
    som migrate:status      Which migrations ran
    som db:seed             Run database/seeders/DatabaseSeeder.js (--class PostSeeder: another one)
    som route:list          The routes in routes/api.js
    som storage:link        Connect public/storage to storage/app/public (--force) (alias: som link:storage)
    som storage:unlink      Remove the storage link (alias: som unlink:storage)
    som sitemap             Generate public/sitemap.xml and robots.txt
    som log                 Tail recent log entries from storage/logs/som.log (--lines 50, --level error)
    som log:clear           Clear the log file
    som make:model Post     app/Models/Post.js (-m -f -s -c -p -r, --route=file, --auth, --all)
    som make:controller PostController (--api, --model Post, -r, --route=file, --auth)
    som make:request StorePostRequest  app/Http/Requests/StorePostRequest.js (--model Post)
    som make:resource PostResource     app/Http/Resources/PostResource.js
    som make:rule Uppercase            app/Rules/Uppercase.js
    som make:page Post      frontend/pages/Post.som (--model Post, -r, --route=file, --auth)
    som make:factory PostFactory database/factories/PostFactory.js (--model Post)
    som make:migration create_posts_table
    som make:seeder PostSeeder
    som make:middleware EnsureIsAdmin
    som make:job SendWelcomeEmail      app/Jobs/SendWelcomeEmail.js
    som make:event OrderShipped        app/Events/OrderShipped.js
    som make:listener SendShipmentNotice app/Listeners/SendShipmentNotice.js (--event OrderShipped)
    som make:mail WelcomeMail          app/Mail/WelcomeMail.js
    som make:notification InvoicePaid  app/Notifications/InvoicePaid.js
    som make:policy PostPolicy         app/Policies/PostPolicy.js (--model Post)
    som make:observer PostObserver     app/Observers/PostObserver.js (--model Post)
    som make:command SendReport        app/Console/Commands/SendReport.js (--command report:send)
    som make:errors         The error pages in errors/ (401, 403, 404, 419, 429, 500, 503…)
    som make:admin <email>  Let that user open the admin panel at /admin (--remove: take it away)
    som make:routes admin   A new route file for pages: frontend/routes/admin.som (--api: backend/routes/admin.js)
    som db tables           List tables and columns
    som db sql "<SQL>"      Run one SQL statement and print the result
    som build [folder]      Build for production (default: this folder)
        --out <folder>      Where to write it (default: dist)
        --base <path>       Change the <base href> (for example /)
        --prerender [paths] Also save every page as ready HTML (needs: npm i -D jsdom)
        --include <folder>  Also copy this folder into the output (for example docs)
    som add <packages...>   Install npm packages with strict security gatekeeper (alias: som install, som i)
        -D, --dev           Install as devDependency
        -y, --yes           Auto-confirm unverified community packages in CI/CD
        --dry-run, --check  Inspect package security report without installing
        --allow-scripts     Permit postinstall lifecycle scripts (default: sandboxed with --ignore-scripts)
        --force             Bypass redundancy blocks, typosquat traps and security warnings
    som update [packages]   Update project packages (npm update) and Som runtime files
        --latest            Upgrade packages to their latest versions
        --check             Check for outdated packages (npm outdated)
        --core              Update only Som.js runtime files (som.js, som.d.ts, server.d.ts)
        --npm               Update only npm dependencies
    som vscode              Install .som colors and snippets in VS Code (also Cursor, VSCodium)

  Examples:
    som new shop
    cd shop
    npm run dev
    som update
    npm run build
`);
}
function version() { console.log(pkg.version); }
function unknown() {
  console.error(`  Unknown command "${command}".`);
  help();
  process.exit(1);
}

/* ------------------------------------------------------------------ som new */
async function createProject(args) {
  let name = null, dbKind = null, ui = null, ts = false, langChosen = false, electron = false, vite = false, redis = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--ts' || args[i] === '--typescript') { ts = true; langChosen = true; }
    else if (args[i] === '--js' || args[i] === '--javascript') { ts = false; langChosen = true; }
    else if (args[i] === '--electron' || args[i] === '--desktop') electron = true;
    else if (args[i] === '--vite') vite = true;
    else if (args[i] === '--redis') redis = true;
    else if (args[i] === '--db') dbKind = (args[++i] || 'sqlite').toLowerCase();
    else if (args[i] === '--ui') ui = (args[++i] || '').toLowerCase();
    else name = name || args[i];
  }
  if (dbKind === 'mariadb') dbKind = 'mysql';
  if (dbKind === 'pg' || dbKind === 'postgresql') dbKind = 'postgres';
  if (dbKind && !['sqlite', 'mysql', 'postgres'].includes(dbKind)) {
    console.error('  --db can be sqlite, mysql or postgres.');
    process.exit(1);
  }
  if (ui && !uiKits()[ui]) {
    console.error(`  --ui can be ${Object.keys(uiKits()).join(', ')}. Any other library: add its <link> or <script> to index.html.`);
    process.exit(1);
  }
  if (!name) {
    console.error('  Give the project a name:  som new my-app  (or: som new my-app --ts)');
    process.exit(1);
  }
  const target = path.resolve(name);
  if (fs.existsSync(target) && fs.readdirSync(target).length) {
    console.error(`  The folder "${name}" already exists and is not empty.`);
    process.exit(1);
  }
  if (!langChosen && process.stdin.isTTY && process.stdout.isTTY) {
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise((resolve) => {
      console.log(`\n  Creating ${name} — choose your language:`);
      console.log('    1) JavaScript (default)');
      console.log('    2) TypeScript (--ts)\n');
      rl.question('  Language [1/2]: ', (ans) => { rl.close(); resolve(String(ans || '').trim().toLowerCase()); });
    });
    if (answer === '2' || answer === 'ts' || answer === 'typescript') ts = true;
  }
  const template = path.join(__dirname, '..', 'templates', 'app');
  copyFolder(template, target);
  // frontend/: everything the browser gets. backend/: routes/api.js, app/, database/ (never served)
  const front = path.join(target, 'frontend');
  copyFolder(path.join(__dirname, '..', 'templates', 'errors'), path.join(front, 'errors')); // error pages
  fs.copyFileSync(path.join(__dirname, '..', 'som.js'), path.join(front, 'som.js'));
  fs.copyFileSync(path.join(__dirname, '..', 'som.d.ts'), path.join(front, 'som.d.ts')); // editor hints
  fs.copyFileSync(path.join(__dirname, '..', 'server.d.ts'), path.join(target, 'backend', 'server.d.ts')); // hints for require('somjs/server')
  // the documentation pages, in their own folder: docs/Docs.som, its Markdown reader and the README.<lang>.md files
  copyFolder(path.join(__dirname, '..', 'docs'), path.join(front, 'docs'));

  const projectName = path.basename(target).toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  const projectPkg = {
    name: projectName,
    version: '0.1.0',
    private: true,
    scripts: {
      dev: 'som dev --seed', start: 'som dev --seed', build: 'som build', preview: 'som dev dist', serve: 'som serve dist',
      migrate: 'som migrate', 'db:seed': 'som db:seed', 'migrate:fresh': 'som migrate:fresh --seed',
    },
  };
  // .env: the project's own settings (from .env.example, with its name filled in)
  const example = path.join(target, '.env.example');
  let envContent = fs.readFileSync(example, 'utf8')
    .replace(/^# Settings for this app.*\n# .env is never/m, '# Settings for this app.\n# This file is never')
    .replace('APP_NAME="My app"', () => `APP_NAME="${path.basename(target).replace(/"/g, '')}"`)
    .replace(/^APP_KEY=$/m, () => `APP_KEY=base64:${require('crypto').randomBytes(32).toString('base64')}`);
  if (redis) {
    envContent = envContent
      .replace(/^QUEUE_CONNECTION=database/m, 'QUEUE_CONNECTION=redis')
      .replace(/^CACHE_STORE=database/m, 'CACHE_STORE=redis')
      .replace(/^# REDIS_URL=redis:\/\/127.0.0.1:6379\/0/m, 'REDIS_URL=redis://127.0.0.1:6379/0');
  }
  fs.writeFileSync(path.join(target, '.env'), envContent);
  if (dbKind) addDatabase(target, dbKind, projectName);
  if (ts) toTypeScript(target, projectPkg);
  if (ui) addUiKit(target, ui);
  // backend/ and .env are for this user only (on macOS and Linux): other accounts on the computer can't read them
  if (process.platform !== 'win32') {
    const lock = (dir) => { fs.chmodSync(dir, 0o700); for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) lock(f); else fs.chmodSync(f, 0o600); } };
    try { lock(path.join(target, 'backend')); fs.chmodSync(path.join(target, '.env'), 0o600); } catch (_) { /* a file system without permissions */ }
  }
  fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify(projectPkg, null, 2) + '\n');
  if (electron) require('./electron.js').init(target);
  if (vite) require('./vite.js').init(target, { ts });

  console.log(`
  Created ${name}/

  Next:
    cd ${name}${ts ? '\n    npm install            (TypeScript, its Node.js types and esbuild)' : ''}${vite ? '\n    npm install            (install vite)\n    som vite:dev           (launch Vite dev server with instant HMR)' : ''}${electron ? '\n    npm install            (install electron & electron-builder)\n    som electron:dev       (launch desktop window)' : ''}${dbKind === 'mysql' ? '\n    som add mysql2         (the MySQL driver, verified & sandboxed)' : dbKind === 'postgres' ? '\n    som add pg             (the PostgreSQL driver, verified & sandboxed)' : ''}${dbKind && dbKind !== 'sqlite' ? '\n    (set DATABASE_URL in .env to your database)' : ''}
    npm run dev

  Then log in as test@example.com with the password "password", or register.
  Emails (verify email, reset password) are printed in the terminal until MAIL_URL is set in .env.
`);
}

// som new my-app --ts  →  TypeScript across backend (.ts) and frontend (.som, .ts), tsconfig.json, and npm run typecheck
function toTypeScript(target, projectPkg) {
  const { toTs, TSCONFIG } = require('./to-ts.js');
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.js')) { fs.writeFileSync(full.replace(/\.js$/, '.ts'), toTs(fs.readFileSync(full, 'utf8'))); fs.unlinkSync(full); }
    }
  };
  walk(path.join(target, 'backend'));
  fs.writeFileSync(path.join(target, 'tsconfig.json'), JSON.stringify(TSCONFIG, null, 2) + '\n');
  projectPkg.scripts.typecheck = 'tsc --noEmit';
  projectPkg.devDependencies = { esbuild: '^0.25.0', typescript: '^5.8.0', '@types/node': '^22.13.0' };
  projectPkg.allowScripts = { esbuild: true };
  // Shared TypeScript interfaces for the frontend
  fs.writeFileSync(path.join(target, 'frontend', 'types.ts'), `// Shared TypeScript interfaces for your .som pages and frontend modules.
// Import in any .som file or .ts module:  import type { User } from '../types.ts'

export interface User {
  id: number
  name: string
  email: string
  email_verified_at?: string | null
  created_at?: string
}

export interface ApiList<T> {
  data: T[]
  total?: number
}
`);
  // a typed helper for the frontend, used like any module: import { money } from '../logic/format.ts'
  fs.mkdirSync(path.join(target, 'frontend', 'logic'), { recursive: true });
  fs.writeFileSync(path.join(target, 'frontend', 'logic', 'format.ts'), `// A TypeScript module for the pages: import { money, ago } from '../logic/format.ts'
// som dev turns it into JavaScript as it is sent; som build writes it as format.js

export function money(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).format(amount)
}

export function ago(date: string | Date): string {
  const seconds: number = Math.round((Date.now() - new Date(date).getTime()) / 1000)
  const units: [number, string][] = [[31536000, 'year'], [2592000, 'month'], [86400, 'day'], [3600, 'hour'], [60, 'minute']]
  for (const [size, name] of units) if (seconds >= size) return \`\${Math.floor(seconds / size)} \${name}\${seconds >= size * 2 ? 's' : ''} ago\`
  return 'just now'
}
`);
  // Upgrade Counter.som to showcase TypeScript in .som components
  const counterSom = path.join(target, 'frontend', 'tests', 'components', 'Counter.som');
  if (fs.existsSync(counterSom)) {
    fs.writeFileSync(counterSom, `<!-- A TypeScript .som component: a button that counts. Used by tests/pages/Test.som as <counter>. -->
prop start: number = 0

state count: number = start
derive double: number = count * 2

action add(step: number = 1): void {
  count += step
}

<view>
  <button class="primary" @click={add(1)}>Clicked {count} {count === 1 ? 'time' : 'times'}, double {double}</button>
</view>

<style scoped>
button { font-variant-numeric: tabular-nums; justify-self: start; }
</style>
`);
  }
  // If --db created Todos.som, upgrade it with TypeScript interfaces & typed actions
  const todosSom = path.join(target, 'frontend', 'pages', 'Todos.som');
  if (fs.existsSync(todosSom)) {
    const src = fs.readFileSync(todosSom, 'utf8');
    fs.writeFileSync(todosSom, src
      .replace('load todos = api.get(\'/api/todos\')', `interface Todo {\n  id: number\n  title: string\n  done: boolean\n}\n\nload todos: Todo[] = api.get<Todo[]>('/api/todos')`)
      .replace('action add() {', 'action add(): Promise<void> {')
      .replace('action toggle(todo) {', 'action toggle(todo: Todo): Promise<void> {')
      .replace('action remove(todo) {', 'action remove(todo: Todo): Promise<void> {'));
  }
}

// som new my-app --ui bootstrap  →  the library's CDN links in index.html
function uiKits() { return {
  tailwind: ['<!-- Tailwind CSS: use its classes in any .som file -->', '<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>'],
  bootstrap: ['<!-- Bootstrap: its classes and components (data-bs-toggle…) work in any .som file -->', '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css">', '<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js" defer></script>'],
  bulma: ['<!-- Bulma: its classes work in any .som file -->', '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bulma@1.0.2/css/bulma.min.css">'],
  pico: ['<!-- Pico CSS: plain HTML gets styled by itself -->', '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css">'],
}; }
function addUiKit(target, ui) {
  const file = path.join(target, 'frontend', 'index.html');
  const html = fs.readFileSync(file, 'utf8');
  // before ui.css or the app's own <style>, so your styles win
  const tags = uiKits()[ui].map((t) => '  ' + t).join('\n') + '\n';
  let updated;
  if (html.includes('<link rel="stylesheet" href="ui.css">')) {
    updated = html.replace('<link rel="stylesheet" href="ui.css">', tags + '  <link rel="stylesheet" href="ui.css">');
  } else if (html.includes('  <style>')) {
    updated = html.replace('  <style>', () => tags + '  <style>');
  } else {
    updated = html.replace(/<\/head>/i, () => tags + '</head>');
  }
  fs.writeFileSync(file, updated);
}

// som new my-app --db sqlite  →  database/migrations, a seed, som.config.json and a Todos page
function addDatabase(target, kind, projectName) {
  const back = path.join(target, 'backend'), front = path.join(target, 'frontend');
  const file = (rel, text) => { fs.mkdirSync(path.dirname(path.join(back, rel)), { recursive: true }); fs.writeFileSync(path.join(back, rel), text); };
  const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}_${p2(d.getMonth() + 1)}_${p2(d.getDate())}_000001`;
  // A migration, a model, a controller, a seeder and a route
  file(`database/migrations/${stamp}_create_todos_table.js`, `// som dev runs new migrations by itself (or: som migrate). som migrate:rollback runs down().
module.exports = {
  up(schema) {
    schema.create('todos', (table) => {
      table.id()
      table.string('title', 200)
      table.boolean('done').default(false)
      table.timestamps()
    })
  },

  down(schema) {
    schema.dropIfExists('todos')
  },
}
`);
  file('app/Models/Todo.js', `const { Model } = require('somjs/server')

// The todos table: Todo.all(), Todo.find(id), Todo.where('done', false).get(), Todo.create({ title })
class Todo extends Model {
  static fillable = ['title', 'done']
  static casts = { done: 'boolean' }
}

module.exports = Todo
`);
  file('app/Http/Controllers/TodoController.js', `const { response } = require('somjs/server')
const Todo = require('../../Models/Todo')

// Route.apiResource('todos', TodoController) in routes/api.js gives these five
class TodoController {
  // GET /api/todos
  async index(req) {
    return Todo.latest('id').get()
  }

  // POST /api/todos   (a 422 with { message, errors } when the rules fail)
  async store(req) {
    const data = await req.validate({ title: 'required|max:200' })
    return response(await Todo.create(data), 201)
  }

  // GET /api/todos/5
  async show(req, id) {
    return Todo.findOrFail(id)
  }

  // PUT or PATCH /api/todos/5
  async update(req, id) {
    const todo = await Todo.findOrFail(id)
    const data = await req.validate({ title: 'sometimes|required|max:200', done: 'sometimes|boolean' })
    return todo.update(data)
  }

  // DELETE /api/todos/5
  async destroy(req, id) {
    const todo = await Todo.findOrFail(id)
    await todo.delete()
  }
}

module.exports = TodoController
`);
  file('database/seeders/TodoSeeder.js', `const { Seeder } = require('somjs/server')
const Todo = require('../../app/Models/Todo')

// DatabaseSeeder calls this one (or on its own: som db:seed --class TodoSeeder)
class TodoSeeder extends Seeder {
  async run() {
    await Todo.create({ title: 'Learn Som.js', done: true })
    await Todo.create({ title: 'Build something', done: false })
  }
}

module.exports = TodoSeeder
`);
  const seeder = path.join(back, 'database', 'seeders', 'DatabaseSeeder.js');
  fs.writeFileSync(seeder, fs.readFileSync(seeder, 'utf8').replace(/(    await user\.save\(\)\n)/, "$1    await this.call(require('./TodoSeeder'))\n"));
  const routes = path.join(back, 'routes', 'api.js');
  const routesSrc = fs.readFileSync(routes, 'utf8');
  const todoBlock = `\nconst TodoController = require('../app/Http/Controllers/TodoController')\n\n// The todos table, for signed-in users: index, store, show, update, destroy (app/Http/Controllers/TodoController.js)\nRoute.middleware('auth').group(() => {\n  Route.apiResource('todos', TodoController)\n})\n`;
  fs.writeFileSync(routes, routesSrc.includes('// A controller for a table:')
    ? routesSrc.replace('// A controller for a table:', todoBlock.trim() + '\n\n// Another table:')
    : routesSrc.trimEnd() + '\n' + todoBlock);
  const url = { sqlite: 'sqlite:backend/database/app.db', mysql: `mysql://root:secret@localhost:3306/${projectName.replace(/-/g, '_')}`, postgres: `postgres://postgres:secret@localhost:5432/${projectName.replace(/-/g, '_')}` }[kind];
  // the address of the database goes in .env (DATABASE_URL)
  const setUrl = (f, u) => fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/^DATABASE_URL=.*$/m, () => 'DATABASE_URL=' + u));
  setUrl(path.join(target, '.env'), url);
  setUrl(path.join(target, '.env.example'), url.replace(/\/\/[^:@\s]+:[^@\s]+@/, '//user:password@'));
  fs.writeFileSync(path.join(front, 'pages', 'Todos.som'), `<!-- the todos table, through routes/api.js and app/Http/Controllers/TodoController.js -->
load todos = api.get('/api/todos')
// rules are checked here first, so a todo with mistakes is never sent; the server's 422 errors land here too
state draft = form({ title: '' }, { title: 'required|max:200' })

action add() {
  const todo = await draft.$submit((values) => api.post('/api/todos', values))
  if (!todo) return
  todos.data.unshift(todo)
  draft.$reset()
}
action toggle(todo) {
  Object.assign(todo, await api.patch('/api/todos/' + todo.id, { done: !todo.done }))
}
action remove(todo) {
  await api.delete('/api/todos/' + todo.id)
  todos.data = todos.data.filter((t) => t.id !== todo.id)
}

<view>
  <section class="page">
    <h1>Todos</h1>
    <p class="lead">Rows of the todos table, through <code>/api/todos</code>.</p>
    <form @submit.prevent={add}>
      <input s-model="draft.title" placeholder="What needs doing?" aria-label="New todo">
      <button class="primary" disabled={draft.$busy}>Add</button>
    </form>
    <p s-if="draft.$error('title')" class="error">{draft.$error('title')}</p>
    <p s-if="todos.loading" class="muted">Loading…</p>
    <p s-elif="todos.error" class="error">{todos.error.message}</p>
    <ul s-else>
      {for todo in todos.data key todo.id}
        <li>
          <label><input type="checkbox" checked={todo.done} @change="toggle(todo)"> <span class={todo.done ? 'done' : ''}>{todo.title}</span></label>
          <button class="ghost sm" @click="remove(todo)" aria-label="Remove">Remove</button>
        </li>
      {empty}
        <li class="muted">Nothing yet.</li>
      {/for}
    </ul>
  </section>
</view>

<style scoped>
.page { padding: 48px 0; max-width: 560px; }
h1 { font-size: 36px; letter-spacing: -0.04em; }
form { display: flex; gap: 8px; margin: 24px 0 6px; }
form input { flex: 1; }
.error { margin: 6px 0; }
ul { list-style: none; padding: 0; margin: 16px 0 0; border: 1px solid var(--border); }
li { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 8px 8px 8px 16px; border-bottom: 1px solid var(--border); }
li:last-child { border-bottom: 0; }
li.muted { padding: 16px; }
label { display: flex; align-items: center; gap: 10px; }
.done { color: var(--muted); text-decoration: line-through; }
</style>
`);
  const webFile = path.join(front, 'routes', 'web.som');
  fs.writeFileSync(webFile, fs.readFileSync(webFile, 'utf8').replace(/(  Route\.view\('\/profile'[^\n]*\n)/, "$1  Route.view('/todos', 'pages/Todos.som').name('todos').title('Todos')\n"));
  const layout = path.join(front, 'layouts', 'app.som');
  fs.writeFileSync(layout, fs.readFileSync(layout, 'utf8').replace(/(<som-link s-if="\$store\.auth\.token" to="\/dashboard"[^>]*>[^<]*<\/som-link>)/, '$1\n        <som-link s-if="$store.auth.token" to="/todos" exact-class="here">Todos</som-link>'));
}
function copyFolder(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name === '_vscode' ? '.vscode' : entry.name === '_gitignore' ? '.gitignore' : entry.name === '_env.example' ? '.env.example' : entry.name);
    if (entry.isDirectory()) copyFolder(src, dest);
    else fs.copyFileSync(src, dest);
  }
}

/* ------------------------------------------------------------------ som vscode */
function installVscode() {
  const os = require('os');
  const from = path.join(__dirname, '..', 'editors', 'vscode');
  const ext = require(path.join(from, 'package.json'));
  const homes = ['.vscode', '.vscode-insiders', '.cursor', '.vscode-oss', '.windsurf', '.antigravity-ide']
    .map((d) => path.join(os.homedir(), d))
    .filter((d, i) => i === 0 || fs.existsSync(d));
  for (const home of homes) {
    const dir = path.join(home, 'extensions');
    fs.mkdirSync(dir, { recursive: true });
    fs.readdirSync(dir).filter((n) => n.startsWith('somjs.som-')).forEach((n) => fs.rmSync(path.join(dir, n), { recursive: true, force: true }));
    copyFolder(from, path.join(dir, `somjs.som-${ext.version}`));
    console.log(`  Installed in ${path.join(dir, `somjs.som-${ext.version}`)}`);
  }
  // Ensure current project .vscode/settings.json maps .som files to Som and configures formatter
  const settingsDir = path.join(process.cwd(), '.vscode');
  const settings = path.join(settingsDir, 'settings.json');
  fs.mkdirSync(settingsDir, { recursive: true });
  let cfg = {};
  if (fs.existsSync(settings)) {
    try { cfg = JSON.parse(fs.readFileSync(settings, 'utf8')); } catch {}
  }
  cfg['files.associations'] = { ...(cfg['files.associations'] || {}), '*.som': 'som' };
  cfg['[som]'] = { ...(cfg['[som]'] || {}), 'editor.defaultFormatter': 'somjs.som' };
  fs.writeFileSync(settings, JSON.stringify(cfg, null, 2) + '\n');
  console.log('  Updated .vscode/settings.json: .som files use Som language and somjs.som formatter');
  console.log('\n  Restart VS Code (or run "Reload Window") to see updated colors and formatting in .som files.\n');
}

/* ------------------------------------------------------------------ som dev */
async function devServer(args, { production = false } = {}) {
  const isProd = Boolean(production || process.env.APP_ENV === 'production' || process.env.NODE_ENV === 'production');
  let port = production ? Number(process.env.PORT) || 8000 : 8000, folder = production ? 'dist' : '.', apiFile = null, delay = 0, saveApi = true, hot = !production, dbUrl = null, migrations = null, serverFolder = null, backendFolder = null, seedNew = false;
  // som dev only answers this computer; --host 0.0.0.0 shares it on your network.
  // som serve answers everyone (HOST in the environment can narrow it).
  let host = production ? process.env.HOST || '0.0.0.0' : '127.0.0.1';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' || args[i] === '-p') port = Number(args[++i]) || port;
    else if (args[i] === '--api') apiFile = args[++i];
    else if (args[i] === '--db') dbUrl = args[++i];
    else if (args[i] === '--migrations') migrations = path.resolve(args[++i]);
    else if (args[i] === '--delay') delay = Number(args[++i]) || 0;
    else if (args[i] === '--no-save') saveApi = false;
    else if (args[i] === '--no-hot') hot = false;
    else if (args[i] === '--server') serverFolder = path.resolve(args[++i]);
    else if (args[i] === '--backend') backendFolder = path.resolve(args[++i]);
    else if (args[i] === '--seed') seedNew = true;
    else if (args[i] === '--host') host = args[++i];
    else if (/^\d+$/.test(args[i])) port = Number(args[i]);
    else folder = args[i];
  }
  // frontend/ and backend/ (new projects): only frontend/ is served, backend/ can't be reached from a browser
  const lay = require('./layout.js').layout(folder === 'dist' || folder === '.' ? '.' : folder);
  const root = !production && folder === '.' ? lay.frontend : path.resolve(folder);
  if (production && !fs.existsSync(root)) {
    console.error(`  Nothing to serve in ${root}. Build first: som build`);
    process.exit(1);
  }
  const mockApi = apiFile && !production ? createMockApi(path.resolve(apiFile), delay, saveApi) : null;

  // ----- .env: settings and secrets for the server; PUBLIC_ ones also reach the browser (Som.env)
  const env = require('./env.js');
  const envDir = lay.split ? lay.project : require('./deps.js').projectDir(root);
  const envFile = env.loadEnv(envDir);

  // ----- a database: its tables become /api/<table>
  const config = readConfig(root);
  dbUrl = dbUrl || process.env.DATABASE_URL || config.db || null;
  // the backend: routes/api.js, app/, database/ (in the project, or --backend <folder>)
  const backendDir = backendFolder || (lay.split ? lay.backend : envDir);
  const apiRoutesFile = require('./backend/typescript.js').findFile(path.join(backendDir, 'routes', 'api')); // api.js or api.ts
  const hasBackend = Boolean(apiRoutesFile);
  // som serve: the backend must not sit inside the folder that is served, or its files could be downloaded
  if (production && hasBackend && (backendDir === root || backendDir.startsWith(root + path.sep))) {
    console.error(`  The backend (${backendDir}) is inside the folder being served (${root}).\n  Serve the built site instead: som build, then som serve dist`);
    process.exit(1);
  }
  if (production && hasBackend && !process.env.APP_KEY) console.warn('  Warning: no APP_KEY in .env. Signed links (email verification) stop working on every restart.');
  let dbApi = null, db = null, dbNote = '';
  if (dbUrl) {
    const { connect, migrate } = require('./db.js');
    const { createDbApi } = require('./db-api.js');
    try {
      db = await connect(dbUrl, { root: config.dir });
      if (!production) { // som dev runs new migrations by itself; for som serve, run `som migrate`
        const { migrator, installAlias } = require('./backend/index.js');
        installAlias(); // require('somjs/server') and .ts files work in migrations and seeders
        require('./backend/model.js').setBaseDir(backendDir);
        const dir = migrations || migrationsDir(backendDir, config.dir, root);
        const isNew = !(await db.tables()).some((t) => t.name === 'som_migrations'); // nothing migrated yet
        const ran = dir ? await migrator.migrate(db, dir, (f) => console.log(`  migrated  ${f}`)) : [];
        // --seed: a brand-new database gets database/seeders/DatabaseSeeder.js
        if (seedNew && isNew && ran.length) await migrator.seed(db, backendDir, { log: (n) => console.log(`  seeded    ${n}`) });
      }
      if (production && !config.tables && !hasBackend) console.log('  No "tables" in som.config.json: the database API shows no tables. List the ones the app may use.');
      // with routes/api.js, your routes are the API: tables are only served when som.config.json lists them
      dbApi = createDbApi(db, { tables: config.tables || (production || hasBackend ? {} : null), production });
      const names = await dbApi.tables();
      dbNote = `\n  Database: ${describeDb(dbUrl)}${names.length ? ' → /api/ (' + names.join(', ') + ')' : hasBackend ? '' : ' → /api/ (no tables yet)'}`;
    } catch (e) {
      console.error('\n  Could not open the database: ' + e.message.replace(/\n/g, '\n  '));
      process.exit(1);
    }
    process.on('SIGINT', () => { db.close().finally(() => process.exit(0)); });
  }

  // ----- routes/api.js, controllers, models, middleware
  let backend = null, backendNote = '', backendRoutesCount = 0, serverRoutesCount = 0;
  if (hasBackend) {
    backend = require('./backend/index.js').createBackend(backendDir, { db, production });
    const n = backend.routes().length;
    backendRoutesCount = n;
    // queued jobs, mails and notifications run in the background here, and routes/console.js runs on schedule
    // (QUEUE_WORKER=off or SCHEDULER=off in .env when a separate `som queue:work` / cron does it)
    if (db) {
      const queue = require('./backend/queue.js');
      const queues = String(process.env.QUEUE_NAMES || 'high,default,low').split(',').map((x) => x.trim());
      if (process.env.QUEUE_WORKER !== 'off' && process.env.QUEUE_CONNECTION !== 'sync') {
        let busy = false;
        setInterval(async () => {
          if (busy) return;
          if (queue.isStopped()) return;
          busy = true;
          try { for (let i = 0; i < 20 && (await queue.workOne({ queues, log: console.log })); i++); } catch (e) { if (!/no such table|doesn't exist|does not exist/i.test(e.message)) console.log('  queue: ' + e.message); }
          busy = false;
        }, 1000).unref();
      }
      if (process.env.SCHEDULER !== 'off') require('./backend/schedule.js').startScheduler(backendDir);
    }
    backendNote = `\n  Routes:  ${path.relative(process.cwd(), apiRoutesFile) || 'routes/api.js'} → ${n} route${n === 1 ? '' : 's'} at /api  (som route:list)`;
  }

  // ----- your own server code: server/hello.js → /api/hello (any Node.js package can be used there)
  const deps = require('./deps.js');
  const project = deps.projectDir(root);
  const serverDir = serverFolder || path.join(lay.split ? lay.backend : project, 'server');
  let serverRoutes = null, serverNote = '';
  if (fs.existsSync(serverDir)) {
    serverRoutes = require('./server-routes.js').createServerRoutes(serverDir, { db, production });
    const list = serverRoutes.routes();
    serverRoutesCount = list.length;
    serverNote = `\n  Server:  ${path.relative(process.cwd(), serverDir) || '.'} → ${list.length ? list.map((f) => '/api/' + f.replace(/\\/g, '/').replace(/\.(c|m)?js$/, '').replace(/(^|\/)index$/, '')).join(', ') : 'no routes yet'}`;
  } else if (serverFolder) {
    console.error(`  --server: ${serverFolder} does not exist.`);
    process.exit(1);
  }
  // npm packages in the browser (som dev only; som build puts them in dist/deps)
  const npmMap = () => (production ? null : deps.importMap(project));

  const types = {
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.som': 'text/plain',
    '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
    '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain', '.md': 'text/markdown',
  };
  const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch (_) { return false; } };

  function send(res, file) {
    // a TypeScript module for the browser: its JavaScript (som build writes it as .js)
    if (!production && /\.(m|c)?ts$/i.test(file) && !file.endsWith('.d.ts')) {
      const { transpileTs } = require('./backend/typescript.js');
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      try {
        const code = transpileTs(fs.readFileSync(file, 'utf8'), { filename: file, format: 'esm', projectDir: project });
        return res.end(code);
      } catch (e) {
        return res.end(`throw new Error(${JSON.stringify((e.errors && e.errors[0] ? e.errors[0].text : e.message) + ' (' + path.basename(file) + ')')});`);
      }
    }
    const type = types[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type + (type.startsWith('text/') || type.endsWith('json') ? '; charset=utf-8' : ''),
      'Cache-Control': isProd ? 'no-cache' : 'no-store', // dev: always pick up your latest changes
      'X-Content-Type-Options': 'nosniff',
      ...(isProd ? { 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'SAMEORIGIN', 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload' } : {}),
    });
    if (!production && type === 'text/html') {
      let html = fs.readFileSync(file, 'utf8');
      // PUBLIC_ values from .env, as Som.env (som build puts them in app.js)
      const envTag = `<script>${env.envScript(env.publicEnv())}</script>`;
      const langHelper = require('./lang.js');
      const langDirs = langHelper.findLangDirs(root);
      const langData = langHelper.scanLangDir(langDirs);
      const langTag = Object.keys(langData).length ? `<script>${langHelper.langScript(langData)}</script>` : '';
      const tagsToInject = [envTag, langTag].filter(Boolean).join('\n');
      html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + '\n' + tagsToInject) : tagsToInject + '\n' + html;
      // the import map, so `import dayjs from 'dayjs'` finds the package; merged into yours if the page has one
      const map = npmMap();
      if (map) {
        const own = html.match(/<script\s+type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/i);
        if (own) {
          let mine = {};
          try { mine = JSON.parse(own[1]); } catch (_) { /* leave a broken map as it is */ }
          const merged = { ...mine, imports: { ...map.imports, ...(mine.imports || {}) } };
          html = html.replace(own[0], () => `<script type="importmap">${JSON.stringify(merged)}</script>`);
        } else {
          const tag = `<script type="importmap">${JSON.stringify(map)}</script>`;
          html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + '\n' + tag) : tag + '\n' + html;
        }
      }
      // the dev client (hot reload, error overlay, DevTools) first in <head>, after the import map
      if (hot) {
        const tag = '<script src="/__som/client.js"></script>';
        const im = html.match(/<script\s+type=["']importmap["'][^>]*>[\s\S]*?<\/script>/i);
        html = im ? html.replace(im[0], () => im[0] + '\n' + tag) : html.replace(/<head[^>]*>/i, (m) => m + '\n' + tag);
        if (!html.includes(tag)) html = tag + '\n' + html;
      }
      return res.end(html);
    }
    const stream = fs.createReadStream(file);
    stream.on('error', () => {
      if (!res.headersSent) res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    });
    stream.pipe(res);
  }

  // ----- hot reload: watch the folder, tell open pages what changed -----
  const clients = new Set();
  const tools = path.join(__dirname, '..', 'tools');
  function devFiles(req, res, urlPath) {
    if (urlPath === '/__som/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write('retry: 1000\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (!hot && !/^\/__som\/(deps|npm)\//.test(urlPath)) { res.writeHead(404); return res.end(); }
    const name = { '/__som/client.js': 'dev-client.js', '/__som/devtools.js': 'devtools.js' }[urlPath];
    if (!name) { res.writeHead(404); return res.end(); }
    send(res, path.join(tools, name));
  }
  const ignored = (rel) => /(^|[\/\\])(node_modules|\.git|dist)([\/\\]|$)/.test(rel) || /(^|[\/\\])\.|~$|\.swp$/.test(rel);
  const apiPath = apiFile ? path.resolve(apiFile) : null;
  const pending = new Map();
  function changed(rel) {
    if (!rel || ignored(rel)) return;
    const full = path.join(root, rel);
    if (full === apiPath) return; // the practice API writes to its own file
    if (insideServerDir(full)) return; // server/ code is read again on the next request, no page reload needed
    clearTimeout(pending.get(full));
    pending.set(full, setTimeout(() => {
      pending.delete(full);
      if (!isFile(full)) return;
      const urlPath = '/' + rel.split(path.sep).join('/');
      const ext = path.extname(full).toLowerCase();
      const routeFile = ext === '.som' && /^routes[\/\\]/.test(rel); // routes/web.som: the whole page loads again
      const msg = { type: ext === '.som' && !routeFile ? 'som' : ext === '.css' ? 'css' : 'reload', path: urlPath };
      clients.forEach((c) => c.write(`data: ${JSON.stringify(msg)}\n\n`));
      if (clients.size) console.log(`  ${msg.type === 'reload' ? 'reload' : 'update'}  ${urlPath}`);
    }, 60));
  }
  function watchFolder() {
    try { fs.watch(root, { recursive: true }, (_, rel) => changed(rel && String(rel))); return; }
    catch (_) { /* older Node on Linux: watch each folder */ }
    const watchDir = (dir) => {
      const rel = path.relative(root, dir);
      if (rel && ignored(rel)) return;
      try { fs.watch(dir, (_, name) => name && changed(path.relative(root, path.join(dir, String(name))))); } catch (_) { return; }
      fs.readdirSync(dir, { withFileTypes: true }).forEach((d) => { if (d.isDirectory()) watchDir(path.join(dir, d.name)); });
    };
    watchDir(root);
  }
  if (hot) watchFolder();

  // ----- the admin panel: backend/admin/ at /admin, its files only for signed-in admins -----
  const adminDir = lay.split && isFile(path.join(lay.backend, 'admin', 'index.html')) ? path.join(lay.backend, 'admin') : null;
  if (adminDir && hot) {
    const notify = (rel) => {
      if (!rel || ignored(rel)) return;
      const full = path.join(adminDir, rel);
      clearTimeout(pending.get(full));
      pending.set(full, setTimeout(() => {
        pending.delete(full);
        if (!isFile(full)) return;
        const urlPath = '/admin/' + rel.split(path.sep).join('/');
        const ext = path.extname(full).toLowerCase();
        const routeFile = /^routes[\/\\]/.test(rel);
        const msg = { type: ext === '.som' && !routeFile ? 'som' : ext === '.css' ? 'css' : 'reload', path: urlPath };
        clients.forEach((c) => c.write(`data: ${JSON.stringify(msg)}\n\n`));
        if (clients.size) console.log(`  ${msg.type === 'reload' ? 'reload' : 'update'}  ${urlPath}`);
      }, 60));
    };
    try { fs.watch(adminDir, { recursive: true }, (_, rel) => notify(rel && String(rel))); } catch (_) { /* no recursive watch here */ }
  }
  async function adminFiles(req, res, urlPath) {
    if (urlPath === '/admin') { res.writeHead(301, { Location: '/admin/' }); return res.end(); }
    const rel = urlPath.slice('/admin/'.length);
    const file = path.join(adminDir, rel);
    const notFound = () => { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found: ' + urlPath); };
    if (file !== adminDir && !file.startsWith(adminDir + path.sep)) return notFound();
    if (secret(urlPath)) return notFound();
    // the page itself only loads som.js and asks who you are: anyone may get it, like a login screen
    if (!rel || rel === 'index.html' || (!path.extname(rel) && !isFile(file))) {
      if (!production) return send(res, path.join(adminDir, 'index.html'));
      // som serve: the PUBLIC_ values from .env, like the built app has them in app.js
      const html = fs.readFileSync(path.join(adminDir, 'index.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'same-origin' });
      return res.end(html.replace(/<head[^>]*>/i, (m) => `${m}\n<script>${env.envScript(env.publicEnv())}</script>`));
    }
    if (!isFile(file)) return notFound();
    // everything else (pages, components, layouts, routes) only after the 'auth' and 'admin' middleware say yes
    const verdict = backend ? await backend.allows(req) : { status: 403 };
    if (!verdict.ok) {
      res.writeHead(verdict.status || 403, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(verdict.status === 401 ? 'Log in first.' : 'Only for admins.');
    }
    return send(res, file);
  }
  // .env changed: read it again, and reload open pages (a new DATABASE_URL needs a restart)
  if (!production) fs.watchFile(path.join(envDir, '.env'), { interval: 500 }, (cur, prev) => {
    if (cur.mtimeMs === prev.mtimeMs) return; // not a real change (the file may not exist at all)
    const before = process.env.DATABASE_URL;
    env.loadEnv(envDir);
    console.log('  .env changed' + (process.env.DATABASE_URL !== before ? ' (restart som dev to use the new DATABASE_URL)' : ''));
    clients.forEach((c) => c.write(`data: ${JSON.stringify({ type: 'reload', path: '/.env' })}\n\n`));
  });
  // files a browser must never get: the database itself, its settings and password, hidden files, locks, dumps
  const secret = (p) => /(^|\/)\.|\.(db|sqlite3?|db-wal|db-shm|sqlite-wal|sqlite-shm|sql|bak|dump|key|pem|crt)$|(^|\/)(som\.config\.json|package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb|composer\.(json|lock)|docker-compose.*\.ya?ml|Dockerfile|node_modules|vendor)(\/|$)/i.test(p)
    || (production && /(^|\/)(database|app|routes)\//i.test(p));
  setInterval(() => clients.forEach((c) => c.write(': ping\n\n')), 25000).unref();
  // /demo/users/2 → demo/users/2/index.html, demo/users/index.html, demo/index.html, index.html
  function nearestIndex(urlPath) {
    let dir = urlPath;
    for (;;) {
      const candidate = path.join(root, dir, 'index.html');
      if (isFile(candidate)) return candidate;
      if (dir === '/' || dir === '' || dir === '.') return null;
      dir = path.posix.dirname(dir);
    }
  }

  // /__som/deps/dayjs → the package as one ES module; /__som/npm/bootstrap/dist/css/bootstrap.css → that file
  async function npmFiles(req, res, urlPath) {
    const jsError = (status, message) => {
      console.log('  ' + message);
      res.writeHead(status, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(`throw new Error(${JSON.stringify(message)});`);
    };
    // only installed packages by their name ('dayjs', '@scope/pkg/file.css'): never a path like ./backend/… or ../.env
    const spec0 = urlPath.replace(/^\/__som\/(npm|deps)\//, '').replace(/\/$/, '');
    if (!/^(@[\w.-]+\/)?[\w-][\w.-]*(\/[\w.@+-]+)*$/.test(spec0) || spec0.split('/').some((p) => p === '..' || p === '.')) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not a package name: ' + spec0);
    }
    if (urlPath.startsWith('/__som/npm/')) {
      const file = deps.packageFile(project, urlPath.slice('/__som/npm/'.length));
      if (!file) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Not in node_modules: ' + urlPath.slice(11) + '  (som add ' + (urlPath.slice(11).match(deps.NAME) || [''])[0] + ')'); }
      return send(res, file);
    }
    const spec = urlPath.slice('/__som/deps/'.length).replace(/\/$/, '');
    try {
      const code = await deps.bundle(project, spec);
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(code);
    } catch (e) { jsError(e.code === 'MISSING' ? 404 : 500, e.message); }
  }
  const privateDirs = [serverDir, ...(hasBackend ? ['app', 'routes', 'database', 'config', 'storage'].map((d) => path.join(backendDir, d)) : []), path.join(root, 'config')];
  const insideServerDir = (file) => privateDirs.some((d) => file === d || file.startsWith(d + path.sep));

  // som down: storage/framework/down.json → a 503 for everyone, except with the secret (som down --secret=…)
  const downPath = path.join(backendDir, 'storage', 'framework', 'down.json');
  let downCache = { at: 0, data: null };
  const downInfo = () => {
    if (Date.now() - downCache.at > 1000) {
      let data = null;
      try { data = JSON.parse(fs.readFileSync(downPath, 'utf8')); } catch (_) { /* up */ }
      downCache = { at: Date.now(), data };
    }
    return downCache.data;
  };
  function maintenance(req, res, urlPath) {
    const down = downInfo();
    if (!down) return false;
    const { same, cookieSecure } = require('./backend/http.js');
    const cookie = (req.headers.cookie || '').match(/(?:^|;\s*)som_bypass=([^;]+)/);
    let cookieVal = null;
    if (cookie) { try { cookieVal = decodeURIComponent(cookie[1]); } catch (_) { cookieVal = cookie[1]; } }
    if (down.secret && cookieVal && same(cookieVal, String(down.secret))) return false;
    if (down.secret && same(urlPath, '/' + String(down.secret))) {
      res.writeHead(302, { Location: '/', 'Set-Cookie': `som_bypass=${encodeURIComponent(down.secret)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${cookieSecure() ? '; Secure' : ''}` });
      res.end();
      return true;
    }
    if (urlPath.startsWith('/__som/')) return false;
    const headers = { 'Cache-Control': 'no-store', ...(down.retry ? { 'Retry-After': String(down.retry) } : {}) };
    if (urlPath === '/api' || urlPath.startsWith('/api/')) {
      res.writeHead(503, { ...headers, 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ message: down.message || 'Service Unavailable' }));
      return true;
    }
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    res.writeHead(503, { ...headers, 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>503 | Service Unavailable</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;color:#09090b;background:#fff">
<main style="padding:24px;max-width:520px"><p style="margin:0;font-size:14px;color:#71717a">503 · Service Unavailable</p><h1 style="margin:8px 0 12px;font-size:28px">Back soon</h1><p style="margin:0;color:#3f3f46;line-height:1.6">${esc(down.message || 'We are making the site better. Please come back soon.')}</p></main></body>`);
    return true;
  }

  // DNS rebinding: a web page can make its own name (evil.example) point at 127.0.0.1 and then read everything
  // som dev serves, with the browser believing it is the same site. A server that only answers this computer
  // therefore only answers the names of this computer (add more with SOM_ALLOWED_HOSTS=my-tunnel.example).
  const hostOnly = (h) => String(h || '').toLowerCase().replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  const isLocalName = (n) => n === 'localhost' || n === '127.0.0.1' || n === '::1' || n.endsWith('.localhost');
  const allowedHosts = new Set(String(process.env.SOM_ALLOWED_HOSTS || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean));
  const loopbackBind = !production && (host === 'localhost' || host === '::1' || /^127\./.test(host));
  // a request from another web site (Origin) that changes data in the unauthenticated API (--api, --db)
  const crossSiteWrite = (req) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(String(req.method).toUpperCase())) return false;
    const origin = req.headers.origin;
    if (!origin) return false; // not a browser (curl, a script), or the same site on a method that sends no Origin
    let oh;
    try { oh = hostOnly(new URL(origin).host); } catch (_) { return true; }
    const mine = hostOnly(req.headers.host);
    return !(oh === mine || (isLocalName(oh) && isLocalName(mine)) || allowedHosts.has(oh));
  };

  const server = http.createServer(async (req, res) => {
    try {
      if (loopbackBind && !isLocalName(hostOnly(req.headers.host)) && !allowedHosts.has(hostOnly(req.headers.host))) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end(`Blocked: this server only answers localhost. To reach it by the name "${hostOnly(req.headers.host)}", start it with SOM_ALLOWED_HOSTS=${hostOnly(req.headers.host)} (or --host 0.0.0.0 to share it on your network).`);
      }
      // In production: plain HTTP is not allowed for security (force HTTPS / HSTS)
      if (isProd) {
        const isEncrypted = Boolean(req.socket && req.socket.encrypted);
        const forwardedProto = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
        const forceHttps = process.env.FORCE_HTTPS === 'true' || (process.env.APP_URL && process.env.APP_URL.startsWith('https://'));
        const isPlainHttp = forwardedProto === 'http' || (!isEncrypted && forceHttps);
        if (isPlainHttp) {
          const target = require('./backend/http.js').httpsRedirectTarget(req);
          if (!target) { res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Bad request'); }
          res.writeHead(301, {
            Location: target,
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
            'Content-Type': 'text/plain; charset=utf-8',
          });
          return res.end('Redirecting to HTTPS');
        }
      }

      let urlPath;
      try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
      catch (_) { res.writeHead(400); return res.end('Bad request'); }
      // a backslash or a NUL in the path is never a real page, and on Windows a backslash would act as a folder separator
      if (/[\\\0]/.test(urlPath)) { res.writeHead(400); return res.end('Bad request'); }
      if (maintenance(req, res, urlPath)) return;

      if (urlPath === '/mcp' || urlPath.startsWith('/mcp/') || urlPath === '/api/mcp') {
        const { getMcpServer } = require('./backend/mcp.js');
        return getMcpServer({ baseDir: backendDir || root }).handleHttpRequest(req, res);
      }

      if (backend && (urlPath === '/api' || urlPath.startsWith('/api/'))) {
        if (await backend(req, res, urlPath)) return; // routes/api.js answered
      }
      if (serverRoutes && (urlPath === '/api' || urlPath.startsWith('/api/'))) {
        if (await serverRoutes(req, res, urlPath)) return; // a file in server/ answered
      }
      if (!production && /^\/__som\/(deps|npm)\//.test(urlPath)) return npmFiles(req, res, urlPath);
      if ((dbApi || mockApi) && (urlPath === '/api' || urlPath.startsWith('/api/'))) {
        if (crossSiteWrite(req)) {
          res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
          return res.end(JSON.stringify({ message: 'Blocked: another web site may not change data here.' }));
        }
        if (!dbApi) return mockApi(req, res, urlPath);
        if (!mockApi) return dbApi(req, res, urlPath);
        // both: a database table wins, the rest goes to the JSON file
        const name = urlPath.split('/')[2];
        return dbApi.tables().then((t) => (!name || t.includes(name) ? dbApi : mockApi)(req, res, urlPath));
      }
      if (hot && urlPath.startsWith('/__som/')) return devFiles(req, res, urlPath);
      if (adminDir && (urlPath === '/admin' || urlPath.startsWith('/admin/'))) return adminFiles(req, res, urlPath);
      // /storage/…: files on the public disk (backend/storage/app/public), connected by som storage:link.
      // They are sent as downloads of plain data: an uploaded .html or .svg can't run scripts on your site.
      if (urlPath.startsWith('/storage/')) {
        const pub = path.join(backendDir, 'storage', 'app', 'public');
        const f = path.join(pub, urlPath.slice('/storage/'.length));
        // a link inside the folder that points outside it must not be followed
        const real = (x) => { try { return fs.realpathSync(x); } catch (_) { return null; } };
        const realPub = real(pub), realF = real(f);
        if ((f.startsWith(pub + path.sep)) && !secret(urlPath) && isFile(f) && realPub && realF && realF.startsWith(realPub + path.sep)) {
          const type = types[path.extname(f).toLowerCase()] || 'application/octet-stream';
          res.writeHead(200, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox", 'Cache-Control': 'public, max-age=3600' });
          return fs.createReadStream(f).pipe(res);
        }
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Not found: ' + urlPath);
      }
      if (secret(urlPath)) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Not found: ' + urlPath); }

      const file = path.join(root, urlPath);
      if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); return res.end('Forbidden'); } // stay inside the folder (not a neighbour like app-old/)
      if (insideServerDir(file) && isFile(file)) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Not found: ' + urlPath); } // server code stays on the server

      if (isFile(file)) return send(res, file);
      if (!production && /\.js$/i.test(file)) {
        const tsFile = file.replace(/\.js$/i, '.ts');
        if (isFile(tsFile)) return send(res, tsFile);
      }
      if (lay.public && !urlPath.startsWith('/storage/')) {
        const pubFile = path.join(lay.public, urlPath);
        if (pubFile.startsWith(lay.public + path.sep) && isFile(pubFile) && !secret(urlPath)) return send(res, pubFile);
      }
      if (isFile(path.join(file, 'index.html'))) {
        if (!urlPath.endsWith('/')) { res.writeHead(301, { Location: urlPath + '/' }); return res.end(); }
        return send(res, path.join(file, 'index.html'));
      }
      // a page path (no extension) gets the nearest index.html, so clean URLs work on reload
      const index = !path.extname(urlPath) && nearestIndex(urlPath);
      if (index) return send(res, index);

      // the Som.js repository itself has no index.html at the top: show the demo
      if (urlPath === '/' && isFile(path.join(root, 'demo/index.html'))) {
        res.writeHead(302, { Location: '/demo/' });
        return res.end();
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found: ' + urlPath);
    } catch (err) {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(isProd ? 'Internal Server Error' : 'Internal Server Error: ' + (err && err.message ? err.message : String(err)));
    }
  });

  // if the port is taken (another server is still running), try the next one
  let tries = 0;
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && tries < 20) {
      console.log(`  Port ${port + tries} is already in use by another program, trying ${port + tries + 1}…`);
      tries++;
      server.listen(port + tries, host);
    } else {
      console.error('  ' + err.message);
      process.exit(1);
    }
  });
  server.listen(port, host, () => {
    const p = server.address().port;
    const start = isFile(path.join(root, 'index.html')) ? '' : isFile(path.join(root, 'demo/index.html')) ? 'demo/' : '';
    const { renderDevBanner } = require('./terminal.js');
    console.log(renderDevBanner({
      version: pkg.version,
      port: p,
      host,
      start,
      root: path.relative(process.cwd(), root) || '.',
      envFile: envFile ? (path.relative(process.cwd(), envFile) || '.env') : null,
      hot,
      routesCount: backendRoutesCount,
      serverRoutesCount,
      adminPath: adminDir ? `/admin/` : null,
      database: dbUrl ? describeDb(dbUrl) : null,
    }));
  });
}

/* ------------------------------------------------------------------ settings: som.config.json
 * { "db": "sqlite:database/app.db", "tables": { "posts": true, "users": { "write": false, "hidden": ["password"] } } }
 * Looked for in the folder being served, then its parents (so `som serve dist` finds the project's file).
 * DATABASE_URL in the environment wins over "db" — put real passwords there, not in the file.
 */
function readConfig(start) { return require('./som-config.js').readConfig(start); }
function migrationsDir(...dirs) {
  for (const d of dirs) if (d && fs.existsSync(path.join(d, 'database', 'migrations'))) return path.join(d, 'database', 'migrations');
  return null;
}
const describeDb = (url) => url.replace(/\/\/([^:@/]+):[^@/]*@/, '//$1:•••@');

/* ------------------------------------------------------------------ som db */
async function dbCommand(args) {
  const [sub = 'help', ...rest] = args;
  let dbUrl = null, folder = '.', migrations = null;
  const extra = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--db') dbUrl = rest[++i];
    else if (rest[i] === '--dir') folder = rest[++i];
    else if (rest[i] === '--migrations') migrations = path.resolve(rest[++i]);
    else extra.push(rest[i]);
  }
  require('./env.js').loadEnv(require('./deps.js').projectDir(folder));
  const config = readConfig(folder);
  dbUrl = dbUrl || process.env.DATABASE_URL || config.db;
  if (sub === 'help' || !['migrate', 'seed', 'tables', 'sql'].includes(sub)) {
    console.log(`
  som db migrate          The same as som migrate
  som db seed             The same as som db:seed
  som db tables           List tables and columns
  som db sql "<SQL>"      Run one statement and print the result

  The database comes from --db, DATABASE_URL or "db" in som.config.json.
`);
    return;
  }
  if (!dbUrl) { console.error('  Which database? Add --db sqlite:database/app.db, set DATABASE_URL, or put "db" in som.config.json.'); process.exit(1); }
  const { connect, migrate } = require('./db.js');
  let db;
  try {
    db = await connect(dbUrl, { root: config.dir });
    if (sub === 'migrate' || sub === 'seed') { // the same as som migrate and som db:seed
      await db.close(); db = null;
      return require('./artisan.js').commands[sub === 'migrate' ? 'migrate' : 'db:seed'](rest);
    } else if (sub === 'tables') {
      for (const t of await db.tables()) {
        console.log(`\n  ${t.name}${t.key ? '' : '  (no single primary key)'}`);
        t.columns.forEach((c) => console.log(`    ${c.name.padEnd(20)} ${String(c.type).padEnd(16)} ${c.name === t.key ? 'key' : ''}${c.auto ? ' auto' : ''}${c.required ? ' required' : ''}`));
      }
      console.log('');
    } else if (sub === 'sql') {
      const sql = extra.join(' ');
      if (!sql.trim()) { console.error('  som db sql "SELECT * FROM posts"'); process.exit(1); }
      if (/^\s*(select|with|pragma|show|describe|explain)\b/i.test(sql)) console.table(await db.query(sql));
      else { const r = await db.run(sql); console.log(`  Done: ${r.changes} row${r.changes === 1 ? '' : 's'} changed.`); }
    }
  } catch (e) {
    console.error('  ' + e.message.replace(/\n/g, '\n  '));
    process.exitCode = 1;
  } finally {
    if (db) await db.close();
  }
}

/* ------------------------------------------------------------------ som dev --api db.json
 * A small REST API for trying things out, made from a JSON file:
 *   { "posts": [ { "id": 1, "title": "Hello" } ], "$required": { "posts": ["title"] } }
 *
 *   GET    /api/posts              list (filter with ?field=value, search with ?q=text)
 *   GET    /api/posts/1            one item
 *   POST   /api/posts              create (gets the next id)
 *   PUT    /api/posts/1            replace
 *   PATCH  /api/posts/1            change some fields
 *   DELETE /api/posts/1            remove (204 No Content)
 *
 * Standard errors: 404 { message }, 422 { message, errors: { field: [...] } }.
 * Changes are written back to the file, so they survive a restart (--no-save keeps them in memory).
 */
function createMockApi(file, delay, save) {
  let db;
  try { db = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { console.error(`  Could not read the API file ${file}: ${e.message}`); process.exit(1); }
  const required = db.$required || {};
  const rules = db.$rules || {}; // "$rules": { "posts": { "title": "required|min:3" } } — the same rules as Som.validate
  const { validate: check } = require('../som.js');
  let saveTimer = null;
  const persist = () => {
    if (!save) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { fs.writeFileSync(file, JSON.stringify(db, null, 2) + '\n'); }
      catch (e) { console.error(`  Could not save ${file}: ${e.message}`); }
    }, 50);
  };
  const send = (res, status, data) => {
    const body = data === undefined ? '' : JSON.stringify(data);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' });
    setTimeout(() => res.end(body), delay);
  };
  const MAX_MOCK_BODY = 1024 * 1024;
  const readBody = (req) => new Promise((resolve) => {
    let raw = '', size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_MOCK_BODY) { req.destroy(); resolve(null); }
      else raw += c;
    });
    req.on('end', () => { try { resolve(raw ? require('./safe-json.js').parseJson(raw) : {}); } catch (_) { resolve(null); } });
  });
  const validate = (name, item, partial) => {
    const errors = {};
    for (const f of required[name] || []) {
      const v = item[f];
      if ((!partial || f in item) && (v === undefined || v === null || String(v).trim() === '')) errors[f] = [`The ${f} field is required.`];
    }
    if (rules[name]) {
      const found = check(item, rules[name], { only: partial ? Object.keys(item) : null });
      for (const k of Object.keys(found)) if (!errors[k]) errors[k] = found[k];
    }
    return Object.keys(errors).length ? { message: Object.values(errors)[0][0], errors } : null;
  };

  const handler = async (req, res, urlPath) => {
    const url = new URL(req.url, 'http://x');
    const [, , name, id, extra] = urlPath.split('/');
    if (!name) return send(res, 200, Object.keys(db).filter((k) => !k.startsWith('$')));
    if (extra !== undefined || !Array.isArray(db[name])) return send(res, 404, { message: `Nothing at /api/${name}${id ? '/' + id : ''}` });
    const list = db[name];
    const find = () => list.findIndex((x) => String(x.id) === id);
    const method = req.method.toUpperCase();

    if (method === 'GET' && !id) {
      let items = list;
      for (const [k, v] of url.searchParams) {
        if (k === 'q') items = items.filter((x) => JSON.stringify(x).toLowerCase().includes(v.toLowerCase()));
        else items = items.filter((x) => String(x[k]) === v);
      }
      return send(res, 200, items);
    }
    if (method === 'POST' && !id) {
      const body = await readBody(req);
      if (!body || typeof body !== 'object' || Array.isArray(body)) return send(res, 400, { message: 'Send a JSON object.' });
      const bad = validate(name, body, false);
      if (bad) return send(res, 422, bad);
      const item = { id: list.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1, ...body };
      list.push(item);
      persist();
      return send(res, 201, item);
    }
    if (!id) return send(res, 405, { message: `${method} needs an id: /api/${name}/1` });
    const at = find();
    if (at < 0) return send(res, 404, { message: `No item ${id} in ${name}.` });
    if (method === 'GET') return send(res, 200, list[at]);
    if (method === 'DELETE') { list.splice(at, 1); persist(); return send(res, 204); }
    if (method === 'PUT' || method === 'PATCH') {
      const body = await readBody(req);
      if (!body || typeof body !== 'object' || Array.isArray(body)) return send(res, 400, { message: 'Send a JSON object.' });
      const bad = validate(name, body, method === 'PATCH');
      if (bad) return send(res, 422, bad);
      list[at] = method === 'PUT' ? { ...body, id: list[at].id } : { ...list[at], ...body, id: list[at].id };
      persist();
      return send(res, 200, list[at]);
    }
    return send(res, 405, { message: `${method} is not supported.` });
  };
  handler.collections = () => Object.keys(db).filter((k) => !k.startsWith('$') && Array.isArray(db[k]));
  return handler;
}

async function redisPingCommand() {
  require('./backend/index.js').installAlias();
  const { Redis } = require('./backend/redis.js');
  try {
    const res = await Redis.ping();
    console.log(`  ✔ Connected to Redis (${res || 'PONG'})`);
    Redis.closeAll();
    process.exit(0);
  } catch (err) {
    console.error(`  ❌ Failed to connect to Redis: ${err.message}`);
    Redis.closeAll();
    process.exit(1);
  }
}
