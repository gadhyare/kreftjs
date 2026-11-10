#!/usr/bin/env node
/*
 * The kreftjs command
 *
 *   kreft new my-app            create a new Kreft project
 *   kreft dev                   run the dev server in this folder (http://localhost:8000)
 *   kreft dev --port 3000       another port
 *   kreft dev ./site            another folder
 *   kreft build                 build this folder for production into ./dist
 *   kreft vscode                install colors and snippets for .kreft files in VS Code
 *   kreft editor <name>         the same for sublime, zed, jetbrains, vim
 *   kreft serve dist            run the built app in production (with --db: its database API)
 *   kreft db migrate            run new database/migrations/*.sql   (also: seed, tables, sql "…")
 *   kreft help                  show this help
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
  'electron:help': () => require('./electron.js').help(),
  'electron:config': (a) => require('./electron.js').config(a),
  'make:electron': (a) => require('./electron.js').init(a),
  tauri: (a) => require('./tauri.js').run(a),
  'tauri:dev': (a) => require('./tauri.js').dev(a),
  'tauri:build': (a) => require('./tauri.js').build(a),
  'tauri:init': (a) => require('./tauri.js').init(a),
  'tauri:help': () => require('./tauri.js').help(),
  'tauri:sync': (a) => require('./tauri.js').sync(a),
  'tauri:config': (a) => require('./tauri.js').config(a),
  'make:tauri': (a) => require('./tauri.js').init(a),
  'harmony:init': (a) => require('./harmony.js').init(a),
  'harmony:build': (a) => require('./harmony.js').build(a),
  'harmony:open': (a) => require('./harmony.js').open(a),
  'harmony:help': () => require('./harmony.js').help(),
  'make:harmony': (a) => require('./harmony.js').init(a),
  'mobile:icons': (a) => require('./mobile.js').icons(a),
  'mobile:splash': (a) => require('./mobile.js').splash(a),
  'mobile:ui': (a) => require('./mobile-ui.js').run(a),
  'make:home': (a) => require('./home-variants.js').make(a),
  'mobile:init': (a) => require('./mobile.js').init(a.find((x) => !x.startsWith('-'))),
  'mobile:build': (a) => require('./mobile.js').build(a),
  'mobile:release': (a) => require('./release.js').main(a),
  'mobile:run': (a) => require('./mobile.js').run(a),
  'mobile:setup': (a) => require('./mobile.js').setup(a),
  'mobile:open': (a) => require('./mobile.js').open(a),
  'mobile:dev': (a) => require('./mobile.js').dev(a),
  'mobile:help': () => require('./mobile.js').help(),
  'make:mobile': (a) => require('./mobile.js').init(a.find((x) => !x.startsWith('-'))),
  vite: (a) => require('./vite.js').dev(a),
  'vite:dev': (a) => require('./vite.js').dev(a),
  'vite:build': (a) => require('./vite.js').build(a),
  'vite:preview': (a) => require('./vite.js').preview(a),
  'vite:init': (a) => require('./vite.js').init(a),
  'make:vite': (a) => require('./vite.js').init(a),
  mcp: (a) => {
    const { getMcpServer } = require('./backend/mcp.js');
    console.error(`  Kreft MCP Server listening on stdio (Model Context Protocol)...`);
    getMcpServer().listenStdio();
  },
  redis: redisPingCommand,
  'redis:ping': redisPingCommand,
  add: (args) => require('./add.js')(args),
  install: (args) => require('./add.js')(args),
  i: (args) => require('./add.js')(args),
  new: createProject, dev: devServer, serve: (a) => devServer(a, { production: true }), db: dbCommand, vscode: installVscode, editor: (args) => require('./editors.js')(args, { vscode: installVscode }), editors: (args) => require('./editors.js')(args, { vscode: installVscode }), build: (args) => require('./build.js')(args), update: (args) => require('./update.js')(args), upgrade: (args) => require('./update.js')(args), help, '--help': help, '-h': help, '--version': version, '-v': version
};
// the mobile commands can run from anywhere: kreft mobile:dev --android --app /path/to/my-app  (the same as cd /path/to/my-app first)
if (/^mobile:/.test(command || '') || command === 'make:home') {
  const at = rest.indexOf('--app');
  if (at >= 0) {
    const dir = rest[at + 1];
    rest.splice(at, dir && !dir.startsWith('-') ? 2 : 1);
    try { if (!dir || dir.startsWith('-')) throw new Error('--app needs the app folder: --app /path/to/my-app'); process.chdir(require('path').resolve(dir)); }
    catch (e) { console.error(`\n  Could not use the app folder${dir ? ' ' + dir : ''}: ${/ENOENT/.test(e.message) ? 'it does not exist' : e.message}\n`); process.exit(1); }
  }
}
// a folder that was deleted or put in the Trash must not be worked in (see guard.js)
const guard = require('./guard.js');
guard.checkStart(command);
if (['queue:work', 'queue:start', 'schedule:work'].includes(command)) guard.watch([process.cwd()]);
if (commands[command]) commands[command](rest);
else if (command && !command.startsWith('-')) {
  // your own commands: app/Console/Commands (kreft make:command SendReport)
  require('./artisan-more.js').runCustom(command, rest).then((found) => { if (!found) unknown(); }, (e) => { console.error('  ' + (e.stack || e)); process.exitCode = 1; });
} else unknown();

/* ------------------------------------------------------------------ help */
function help() {
  console.log(`
  Kreft ${pkg.version}

  Usage:
    kreft new <name>        Create a new project in a folder called <name>, with login, register,
                            password reset, email verification and profile pages (on SQLite)
        --db <kind>         …on another database (sqlite, mysql or postgres), plus a Todos example
        --no-auth           …without login, register, profile and users (--auth: with them, the default)
        --redis             …configure Redis for caching, background queues and pub/sub
        --ui <library>      …with a CSS library from a CDN: tailwind, bootstrap, bulma or pico
        --ts                …use TypeScript across frontend (.kreft, .ts) and backend (.ts)
        --js                …use JavaScript (default when non-interactive)
        --harmony           …with HarmonyOS support (harmony/ project for DevEco Studio)
        --tauri             …with Tauri desktop app support (src-tauri, small installers, needs Rust)
        --electron          …with Electron desktop app support (main.js, preload.js, packaging)
        --mobile            …with iOS / Android support (Capacitor)
        --vite              …with Vite.js bundling & instant HMR (vite.config.js, npm run vite)
    kreft dev [folder]      Start the dev server (default: this folder)
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
                              mysql://user:pass@localhost:3306/shop   (kreft add mysql2)
                              postgres://user:pass@localhost:5432/shop  (kreft add pg)
    kreft serve [folder]    Run a built app for real users (folder: dist). Same --port and --db;
                            only the tables listed in kreftjs.config.json are served

  Bundler & Dev Server (Vite.js):
    kreft vite              Start Vite dev server and proxy backend API (alias: kreft vite:dev)
    kreft vite:dev          Start Vite dev server with instant HMR and backend proxy
    kreft vite:build        Build production bundle with Vite and Rollup
    kreft vite:preview      Preview production build locally with Vite
    kreft vite:init         Add Vite configuration to an existing project (alias: kreft make:vite)

  Desktop (Electron.js):
    kreft electron          Open the app in a desktop window only: no browser, no URL (alias: kreft electron:dev)
    kreft electron:build    Build and make installers (--mac, --win, --linux; or npm run electron:build:all)
    kreft electron:init     Add Electron support to an existing project (alias: kreft make:electron)
    kreft electron:config   Check config/electron.config.js and print the final settings
    kreft add electron      Add Electron: config/electron.config.js, electron/, scripts, packages (--force, --no-install)
    kreft make:home         Write an app-style home page: --mobile (phone screen) or --desktop (sidebar workspace)
    kreft mobile:run        Build and start the app on an emulator or phone (--android, --ios, --target; see kreft mobile:help)
    kreft mobile:build      Build for iOS / Android with Capacitor (--android, --ios, --api-url; see kreft mobile:help)
    kreft mobile:release    A signed release: .apk and .aab (Android), .ipa (iOS), .hap and .app (HarmonyOS); see --help
    kreft electron:help     Everything about desktop apps: menu, icon, installers, errors

  Desktop (Tauri, small installers, needs Rust):
    kreft tauri             Open the app in a Tauri desktop window (alias: kreft tauri:dev)
    kreft tauri:build       Build and make installers (--debug, --bundles dmg|nsis|deb|appimage …)
    kreft tauri:init        Add Tauri support to an existing project (alias: kreft make:tauri)
    kreft tauri:config      Check config/tauri.config.js and print the final settings
    kreft tauri:sync        Write src-tauri/ from config/tauri.config.js (dev and build do it)
    kreft add tauri         Add Tauri: config/tauri.config.js, src-tauri/, scripts, packages (kreft add electron tauri: both)
    kreft tauri:help        Prerequisites, files and options

  HarmonyOS (Huawei, needs DevEco Studio):
    kreft harmony:build     Build the site into a HarmonyOS project in harmony/ (--api-url https://…, --hap)
    kreft harmony:open      Open harmony/ in DevEco Studio
    kreft harmony:init      Add HarmonyOS support to an existing project (alias: kreft make:harmony)
    kreft harmony:help      Prerequisites, files and options

  The backend (kreft list shows every command, yours too):
    kreft key:generate      Set the application encryption key in .env (--show: print only)
    kreft migrate           Run new migrations in database/migrations (.js or .sql)
    kreft migrate:rollback    Undo the last batch of migrations (--step 2: the last two)
    kreft migrate:fresh     Drop every table and migrate again (--seed: then seed)
    kreft migrate:status    Which migrations ran
    kreft db:seed           Run database/seeders/DatabaseSeeder.js (--class PostSeeder: another one)
    kreft route:list        The routes in routes/api.js
    kreft storage:link      Connect public/storage to storage/app/public (--force) (alias: kreft link:storage)
    kreft storage:unlink    Remove the storage link (alias: kreft unlink:storage)
    kreft sitemap           Generate public/sitemap.xml and robots.txt
    kreft log               Tail recent log entries from storage/logs/kreft.log (--lines 50, --level error)
    kreft log:clear         Clear the log file
    kreft make:model Post     app/Models/Post.js (-m -f -s -c -p -r, --route=file, --auth, --all)
    kreft make:controller PostController (--api, --model Post, -r, --route=file, --auth)
    kreft make:request StorePostRequest    app/Http/Requests/StorePostRequest.js (--model Post)
    kreft make:resource PostResource     app/Http/Resources/PostResource.js
    kreft make:rule Uppercase          app/Rules/Uppercase.js
    kreft make:page Post    frontend/pages/Post.kreft (--model Post, -r, --route=file, --auth)
    kreft make:factory PostFactory database/factories/PostFactory.js (--model Post)
    kreft make:migration create_posts_table
    kreft make:seeder PostSeeder
    kreft make:middleware EnsureIsAdmin
    kreft make:job SendWelcomeEmail    app/Jobs/SendWelcomeEmail.js
    kreft make:event OrderShipped      app/Events/OrderShipped.js
    kreft make:listener SendShipmentNotice app/Listeners/SendShipmentNotice.js (--event OrderShipped)
    kreft make:mail WelcomeMail        app/Mail/WelcomeMail.js
    kreft make:notification InvoicePaid    app/Notifications/InvoicePaid.js
    kreft make:policy PostPolicy       app/Policies/PostPolicy.js (--model Post)
    kreft make:observer PostObserver     app/Observers/PostObserver.js (--model Post)
    kreft make:command SendReport      app/Console/Commands/SendReport.js (--command report:send)
    kreft make:errors       The error pages in errors/ (401, 403, 404, 419, 429, 500, 503…)
    kreft make:admin <email>    Let that user open the admin panel at /admin (--remove: take it away)
    kreft make:routes admin     A new route file for pages: frontend/routes/admin.kreft (--api: backend/routes/admin.js)
    kreft db tables         List tables and columns
    kreft db sql "<SQL>"    Run one SQL statement and print the result
    kreft build [folder]    Build for production (default: this folder)
        --out <folder>      Where to write it (default: dist)
        --base <path>       Change the <base href> (for example /)
        --prerender [paths] Also save every page as ready HTML (needs: npm i -D jsdom)
        --include <folder>  Also copy this folder into the output (for example docs)
        --no-htaccess       Do not write dist/.htaccess (page-address rules for Apache and Hostinger)
        --no-minify         Copy kreftjs.js as it is (by default it is minified when esbuild is installed)
    kreft add <packages...>     Install npm packages with strict security gatekeeper (alias: kreft install, kreft i)
        -D, --dev           Install as devDependency
        -y, --yes           Auto-confirm unverified community packages in CI/CD
        --dry-run, --check  Inspect package security report without installing
        --json              Emit a machine-readable security report (scripts are disabled)
        --force             Bypass redundancy blocks, typosquat traps and security warnings
    kreft update [packages]     Update project packages (npm update) and Kreft runtime files
        --latest            Upgrade packages to their latest versions
        --check             Check for outdated packages (npm outdated)
        --core              Update only Kreft runtime files (kreftjs.js, kreftjs.d.ts, server.d.ts)
        --npm               Update only npm dependencies
    kreft vscode            Install .kreft colors, snippets and Emmet in VS Code (also Antigravity, Cursor, Windsurf, VSCodium)
    kreft editor <name>     The same for another editor: sublime, zed, jetbrains, vim (kreft editor: the list)

  Examples:
    kreft new shop
    cd shop
    npm run dev
    kreft update
    npm run build
`);
}
function version() { console.log(pkg.version); }
function unknown() {
  console.error(`  Unknown command "${command}".`);
  help();
  process.exit(1);
}

/* ------------------------------------------------------------------ kreft new */
async function createProject(args) {
  let name = null, dbKind = null, ui = null, ts = false, langChosen = false, electron = false, tauri = false, harmony = false, mobile = false, vite = false, redis = false, auth = true, authChosen = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--ts' || args[i] === '--typescript') { ts = true; langChosen = true; }
    else if (args[i] === '--js' || args[i] === '--javascript') { ts = false; langChosen = true; }
    else if (args[i] === '--tauri') tauri = true;
    else if (args[i] === '--harmony') harmony = true;
    else if (args[i] === '--electron' || args[i] === '--desktop') electron = true;
    else if (args[i] === '--mobile') mobile = true;
    else if (args[i] === '--vite') vite = true;
    else if (args[i] === '--auth') { auth = true; authChosen = true; }
    else if (args[i] === '--no-auth') { auth = false; authChosen = true; }
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
    console.error('  Give the project a name:  kreft new my-app  (or: kreft new my-app --ts)');
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
  if (!authChosen && process.stdin.isTTY && process.stdout.isTTY) {
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise((resolve) => {
      console.log(`\n  ${name} — authentication (login, register, password reset, profile, users):`);
      console.log('    1) Yes, include it (default)');
      console.log('    2) No, start without it (--no-auth)\n');
      rl.question('  Authentication [1/2]: ', (ans) => { rl.close(); resolve(String(ans || '').trim().toLowerCase()); });
    });
    if (answer === '2' || answer === 'n' || answer === 'no') auth = false;
  }
  const template = path.join(__dirname, '..', 'templates', 'app');
  copyFolder(template, target);
  // frontend/: everything the browser gets. backend/: routes/api.js, app/, database/ (never served)
  const front = path.join(target, 'frontend');
  copyFolder(path.join(__dirname, '..', 'templates', 'errors'), path.join(front, 'errors')); // error pages
  fs.copyFileSync(path.join(__dirname, '..', 'kreftjs.js'), path.join(front, 'kreftjs.js'));
  fs.copyFileSync(path.join(__dirname, '..', 'kreftjs.d.ts'), path.join(front, 'kreftjs.d.ts')); // editor hints
  fs.copyFileSync(path.join(__dirname, '..', 'server.d.ts'), path.join(target, 'backend', 'server.d.ts')); // hints for require('kreftjs/server')
  // the documentation pages, in their own folder: docs/Docs.kreft, its Markdown reader and the README.md manual
  copyFolder(path.join(__dirname, '..', 'docs'), path.join(front, 'docs'));

  const projectName = path.basename(target).toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  const projectPkg = {
    name: projectName,
    version: '0.1.0',
    private: true,
    scripts: {
      dev: 'kreft dev --seed', start: 'kreft dev --seed', build: 'kreft build', preview: 'kreft dev dist', serve: 'kreft serve dist',
      migrate: 'kreft migrate', 'db:seed': 'kreft db:seed', 'migrate:fresh': 'kreft migrate:fresh --seed',
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
  if (!auth) require('./no-auth.js').removeAuth(target);
  if (ts) toTypeScript(target, projectPkg);
  if (ui) addUiKit(target, ui);
  // backend/ and .env are for this user only (on macOS and Linux): other accounts on the computer can't read them
  if (process.platform !== 'win32') {
    const lock = (dir) => { fs.chmodSync(dir, 0o700); for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) lock(f); else fs.chmodSync(f, 0o600); } };
    try { lock(path.join(target, 'backend')); fs.chmodSync(path.join(target, '.env'), 0o600); } catch (_) { /* a file system without permissions */ }
  }
  fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify(projectPkg, null, 2) + '\n');
  if (electron) require('./electron.js').init(target);
  if (tauri) require('./tauri.js').init(target);
  if (harmony) require('./harmony.js').init(target);
  if (mobile) {
    require('./mobile.js').init(target);
    require('./mobile-ui.js').install(target, { layout: !electron, gallery: true }); // top bar and bottom bar that never move; /edge shows every component
  }
  if (mobile || electron) require('./home-variants.js').apply(target, { mobile, desktop: electron }); // a home page made for the app, not the web
  if (vite) require('./vite.js').init(target, { ts });

  console.log(`
  Created ${name}/

  Next:
    cd ${name}${ts ? '\n    npm install            (TypeScript, its Node.js types and esbuild)' : ''}${vite ? '\n    npm install            (install vite)\n    kreft vite:dev           (launch Vite dev server with instant HMR)' : ''}${electron ? '\n    npm install            (install electron & electron-builder)\n    kreft electron:dev       (launch desktop window)' : ''}${dbKind === 'mysql' ? '\n    kreft add mysql2         (the MySQL driver, verified & sandboxed)' : dbKind === 'postgres' ? '\n    kreft add pg             (the PostgreSQL driver, verified & sandboxed)' : ''}${dbKind && dbKind !== 'sqlite' ? '\n    (set DATABASE_URL in .env to your database)' : ''}
    npm run dev

${auth ? `  Then log in as test@example.com with the password "password", or register.
  Emails (verify email, reset password) are printed in the terminal until MAIL_URL is set in .env.
` : '  Created without authentication (--no-auth): there is no login, registration or users table.\n'}`);
}

// kreft new my-app --ts  →  TypeScript across backend (.ts) and frontend (.kreft, .ts), tsconfig.json, and npm run typecheck
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
  fs.writeFileSync(path.join(target, 'frontend', 'types.ts'), `// Shared TypeScript interfaces for your .kreft pages and frontend modules.
// Import in any .kreft file or .ts module:  import type { User } from '../types.ts'

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
// kreft dev turns it into JavaScript as it is sent; kreft build writes it as format.js

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
  // Upgrade Counter.kreft to showcase TypeScript in .kreft components
  const counterKreft = path.join(target, 'frontend', 'tests', 'components', 'Counter.kreft');
  if (fs.existsSync(counterKreft)) {
    fs.writeFileSync(counterKreft, `<!-- A TypeScript .kreft component: a button that counts. Used by tests/pages/Test.kreft as <counter>. -->
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
  // If --db created Todos.kreft, upgrade it with TypeScript interfaces & typed actions
  const todosKreft = path.join(target, 'frontend', 'pages', 'Todos.kreft');
  if (fs.existsSync(todosKreft)) {
    const src = fs.readFileSync(todosKreft, 'utf8');
    fs.writeFileSync(todosKreft, src
      .replace('load todos = api.get(\'/api/todos\')', `interface Todo {\n  id: number\n  title: string\n  done: boolean\n}\n\nload todos: Todo[] = api.get<Todo[]>('/api/todos')`)
      .replace('action add() {', 'action add(): Promise<void> {')
      .replace('action toggle(todo) {', 'action toggle(todo: Todo): Promise<void> {')
      .replace('action remove(todo) {', 'action remove(todo: Todo): Promise<void> {'));
  }
}

// kreft new my-app --ui bootstrap  →  the library's CDN links in index.html
function uiKits() { return {
  tailwind: ['<!-- Tailwind CSS: use its classes in any .kreft file -->', '<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>'],
  bootstrap: ['<!-- Bootstrap: its classes and components (data-bs-toggle…) work in any .kreft file -->', '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css">', '<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js" defer></script>'],
  bulma: ['<!-- Bulma: its classes work in any .kreft file -->', '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bulma@1.0.2/css/bulma.min.css">'],
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

// kreft new my-app --db sqlite  →  database/migrations, a seed, kreftjs.config.json and a Todos page
function addDatabase(target, kind, projectName) {
  const back = path.join(target, 'backend'), front = path.join(target, 'frontend');
  const file = (rel, text) => { fs.mkdirSync(path.dirname(path.join(back, rel)), { recursive: true }); fs.writeFileSync(path.join(back, rel), text); };
  const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}_${p2(d.getMonth() + 1)}_${p2(d.getDate())}_000001`;
  // A migration, a model, a controller, a seeder and a route
  file(`database/migrations/${stamp}_create_todos_table.js`, `// kreft dev runs new migrations by itself (or: kreft migrate). kreft migrate:rollback runs down().
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
  file('app/Models/Todo.js', `const { Model } = require('kreftjs/server')

// The todos table: Todo.all(), Todo.find(id), Todo.where('done', false).get(), Todo.create({ title })
class Todo extends Model {
  static fillable = ['title', 'done']
  static casts = { done: 'boolean' }
}

module.exports = Todo
`);
  file('app/Http/Controllers/TodoController.js', `const { response } = require('kreftjs/server')
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
  file('database/seeders/TodoSeeder.js', `const { Seeder } = require('kreftjs/server')
const Todo = require('../../app/Models/Todo')

// DatabaseSeeder calls this one (or on its own: kreft db:seed --class TodoSeeder)
class TodoSeeder extends Seeder {
  async run() {
    await Todo.create({ title: 'Learn Kreft', done: true })
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
  fs.writeFileSync(path.join(front, 'pages', 'Todos.kreft'), `<!-- the todos table, through routes/api.js and app/Http/Controllers/TodoController.js -->
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
      <input k-model="draft.title" placeholder="What needs doing?" aria-label="New todo">
      <button class="primary" disabled={draft.$busy}>Add</button>
    </form>
    <p k-if="draft.$error('title')" class="error">{draft.$error('title')}</p>
    <p k-if="todos.loading" class="muted">Loading…</p>
    <p k-elif="todos.error" class="error">{todos.error.message}</p>
    <ul k-else>
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
  const webFile = path.join(front, 'routes', 'web.kreft');
  fs.writeFileSync(webFile, fs.readFileSync(webFile, 'utf8').replace(/(  Route\.view\('\/profile'[^\n]*\n)/, "$1  Route.view('/todos', 'pages/Todos.kreft').name('todos').title('Todos')\n"));
  const layout = path.join(front, 'layouts', 'app.kreft');
  fs.writeFileSync(layout, fs.readFileSync(layout, 'utf8').replace(/(<kreft-link k-if="\$store\.auth\.token" to="\/dashboard"[^>]*>[^<]*<\/kreft-link>)/, '$1\n        <kreft-link k-if="$store.auth.token" to="/todos" exact-class="here">Todos</kreft-link>'));
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

/* ------------------------------------------------------------------ kreft vscode */
/* VS Code only loads extensions listed in extensions.json, and after "Uninstall" it keeps the folder in .obsolete and
   deletes it on the next start. Copying the folder is not enough after an uninstall: list it again and clear .obsolete. */
function registerExtension(dir, folder, version) {
  const id = 'kreft.kreftjs';
  const location = path.join(dir, folder);
  try {
    const file = path.join(dir, 'extensions.json');
    let list = [];
    if (fs.existsSync(file)) { try { list = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { list = []; } }
    if (!Array.isArray(list)) list = [];
    list = list.filter((e) => !(e && e.identifier && /^kreft\.kreft(js)?$/.test(e.identifier.id)));
    list.push({ identifier: { id }, version, location: { $mid: 1, fsPath: location, external: 'file://' + location, path: location, scheme: 'file' }, relativeLocation: folder, metadata: { installedTimestamp: Date.now(), pinned: false, source: 'resource', isApplicationScoped: false, isMachineScoped: false, isBuiltin: false, targetPlatform: 'undefined' } });
    fs.writeFileSync(file, JSON.stringify(list));
  } catch {}
  try {
    const file = path.join(dir, '.obsolete');
    if (fs.existsSync(file)) {
      const o = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const k of Object.keys(o)) if (k.startsWith('kreft.kreftjs-') || k.startsWith('kreft.kreft-')) delete o[k];
      fs.writeFileSync(file, JSON.stringify(o));
    }
  } catch {}
}

function installVscode() {
  const os = require('os');
  const from = path.join(__dirname, '..', 'editors', 'vscode');
  const ext = require(path.join(from, 'package.json'));
  const homes = ['.vscode', '.vscode-insiders', '.cursor', '.vscode-oss', '.windsurf', '.antigravity-ide', '.antigravity', '.kiro', '.trae']
    .map((d) => path.join(os.homedir(), d))
    .filter((d, i) => i === 0 || fs.existsSync(d));
  for (const home of homes) {
    const dir = path.join(home, 'extensions');
    fs.mkdirSync(dir, { recursive: true });
    fs.readdirSync(dir).filter((n) => n.startsWith('kreft.kreftjs-') || n.startsWith('kreft.kreft-')) /* the older extensions go too */.forEach((n) => fs.rmSync(path.join(dir, n), { recursive: true, force: true }));
    copyFolder(from, path.join(dir, `kreft.kreftjs-${ext.version}`));
    registerExtension(dir, `kreft.kreftjs-${ext.version}`, ext.version);
    console.log(`  Installed in ${path.join(dir, `kreft.kreftjs-${ext.version}`)}`);
  }
  // Ensure current project .vscode/settings.json maps .kreft files to Kreft and configures formatter
  const settingsDir = path.join(process.cwd(), '.vscode');
  const settings = path.join(settingsDir, 'settings.json');
  fs.mkdirSync(settingsDir, { recursive: true });
  let cfg = {};
  if (fs.existsSync(settings)) {
    try { cfg = JSON.parse(fs.readFileSync(settings, 'utf8')); } catch {}
  }
  cfg['files.associations'] = { ...(cfg['files.associations'] || {}), '*.kreft': 'kreftjs', '*.kreftjs': 'kreftjs' };
  cfg['[kreftjs]'] = { ...(cfg['[kreftjs]'] || {}), 'editor.defaultFormatter': 'kreft.kreftjs' };
  cfg['emmet.includeLanguages'] = { ...(cfg['emmet.includeLanguages'] || {}), kreftjs: 'html' };   // Emmet in <view> and <style>
  fs.writeFileSync(settings, JSON.stringify(cfg, null, 2) + '\n');
  console.log('  Updated .vscode/settings.json: .kreft files use Kreft language, the kreft.kreftjs formatter and Emmet');
  console.log('\n  Restart VS Code (or run "Reload Window") to see updated colors and formatting in .kreft files.\n');
}

/* ------------------------------------------------------------------ kreft dev */
async function devServer(args, { production = false } = {}) {
  const isProd = Boolean(production || process.env.APP_ENV === 'production' || process.env.NODE_ENV === 'production');
  let port = production ? Number(process.env.PORT) || 8000 : 8000, folder = production ? 'dist' : '.', apiFile = null, delay = 0, saveApi = true, hot = !production, dbUrl = null, migrations = null, serverFolder = null, backendFolder = null, seedNew = false, force = false;
  // kreft dev only answers this computer; --host 0.0.0.0 shares it on your network.
  // kreft serve answers everyone (HOST in the environment can narrow it).
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
    else if (args[i] === '--force') force = true;
    else if (args[i] === '--host') host = args[++i];
    else if (/^\d+$/.test(args[i])) port = Number(args[i]);
    else folder = args[i];
  }
  // frontend/ and backend/ (new projects): only frontend/ is served, backend/ can't be reached from a browser
  const lay = require('./layout.js').layout(folder === 'dist' || folder === '.' ? '.' : folder);
  const root = !production && folder === '.' ? lay.frontend : path.resolve(folder);
  if (production && !fs.existsSync(root)) {
    console.error(`  Nothing to serve in ${root}. Build first: kreft build`);
    process.exit(1);
  }
  const mockApi = apiFile && !production ? createMockApi(path.resolve(apiFile), delay, saveApi) : null;

  // ----- .env: settings and secrets for the server; PUBLIC_ ones also reach the browser (Kreftjs.env)
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
  // Not a Kreft project and nothing to show: do not start a server on whatever folder this happens to be (an empty
  // one, or your home folder). --force serves it anyway.
  if (!force && !dbUrl && !apiFile && !serverFolder && !hasBackend && !lay.split) {
    const names = (() => { try { return fs.readdirSync(root); } catch (_) { return []; } })();
    const isSite = names.includes('index.html') || names.some((n) => /\.kreft$/.test(n)) || fs.existsSync(path.join(root, 'demo', 'index.html')) || fs.existsSync(path.join(config.dir || root, 'kreftjs.config.json'));
    if (!isSite) {
      console.error(`  ${path.resolve(root)} is not a Kreft project: there is no index.html, no frontend/ folder and no .kreft pages.\n\n  Make one:                  kreft new my-app   (then: cd my-app, kreft dev)\n  Or go into your project:   cd path/to/your-app\n  To serve this folder anyway: kreft ${production ? 'serve' : 'dev'} ${folder === '.' ? '' : folder + ' '}--force`);
      process.exit(1);
    }
  }
  // kreftjs serve: the backend must not sit inside the folder that is served, or its files could be downloaded
  if (production && hasBackend && (backendDir === root || backendDir.startsWith(root + path.sep))) {
    console.error(`  The backend (${backendDir}) is inside the folder being served (${root}).\n  Serve the built site instead: kreft build, then kreft serve dist`);
    process.exit(1);
  }
  if (production && hasBackend && !process.env.APP_KEY) console.warn('  Warning: no APP_KEY in .env. Signed links (email verification) stop working on every restart.');
  let dbApi = null, db = null, dbNote = '';
  if (dbUrl) {
    const { connect, migrate } = require('./db.js');
    const { createDbApi } = require('./db-api.js');
    try {
      db = await connect(dbUrl, { root: config.dir });
      if (!production) { // kreft dev runs new migrations by itself; for kreft serve, run `kreft migrate`
        const { migrator, installAlias } = require('./backend/index.js');
        installAlias(); // require('kreftjs/server') and .ts files work in migrations and seeders
        require('./backend/model.js').setBaseDir(backendDir);
        const dir = migrations || migrationsDir(backendDir, config.dir, root);
        const isNew = !(await db.tables()).some((t) => t.name === 'kreft_migrations'); // nothing migrated yet
        const ran = dir ? await migrator.migrate(db, dir, (f) => console.log(`  migrated  ${f}`)) : [];
        // --seed: a brand-new database gets database/seeders/DatabaseSeeder.js
        if (seedNew && isNew && ran.length) await migrator.seed(db, backendDir, { log: (n) => console.log(`  seeded    ${n}`) });
      }
      if (production && !config.tables && !hasBackend) console.log('  No "tables" in kreftjs.config.json: the database API shows no tables. List the ones the app may use.');
      // with routes/api.js, your routes are the API: tables are only served when kreftjs.config.json lists them
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
    // (QUEUE_WORKER=off or SCHEDULER=off in .env when a separate `kreft queue:work` / cron does it)
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
    backendNote = `\n  Routes:  ${path.relative(process.cwd(), apiRoutesFile) || 'routes/api.js'} → ${n} route${n === 1 ? '' : 's'} at /api  (kreft route:list)`;
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
  // npm packages in the browser (kreft dev only; kreft build puts them in dist/deps)
  const npmMap = () => (production ? null : deps.importMap(project));

  const types = {
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.kreft': 'text/plain', '.kreftjs': 'text/plain',
    '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
    '.ico': 'image/x-icon', ...(({ '.ts': _ts, ...media }) => media)(require('./backend/stream.js').MEDIA_TYPES), '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain', '.md': 'text/markdown',
  };
  const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch (_) { return false; } };

  const prodHeaders = isProd ? { 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'SAMEORIGIN', 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload' } : {};
  function send(res, file, opts = {}) { // opts.seo: tags for <head> (pages from seo.js), opts.status: 404 for a page that does not exist
    // a TypeScript module for the browser: its JavaScript (kreft build writes it as .js)
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
    const fileHeaders = {
      'Content-Type': type + (type.startsWith('text/') || type.endsWith('json') ? '; charset=utf-8' : ''),
      'Cache-Control': isProd ? 'no-cache' : 'no-store', // dev: always pick up your latest changes
      'X-Content-Type-Options': 'nosniff',
      ...prodHeaders,
    };
    // everything but pages is sent with byte ranges (video and audio seek, Safari plays)
    if (type !== 'text/html') return require('./backend/stream.js').sendFile(res.req, res, file, { status: opts.status, type: fileHeaders['Content-Type'], headers: fileHeaders });
    res.writeHead(opts.status || 200, fileHeaders);
    if (!production && type === 'text/html') {
      let html = fs.readFileSync(file, 'utf8');
      // PUBLIC_ values from .env, as Kreftjs.env (kreft build puts them in app.js)
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
        const tag = '<script src="/__kreft/client.js"></script>';
        const im = html.match(/<script\s+type=["']importmap["'][^>]*>[\s\S]*?<\/script>/i);
        html = im ? html.replace(im[0], () => im[0] + '\n' + tag) : html.replace(/<head[^>]*>/i, (m) => m + '\n' + tag);
        if (!html.includes(tag)) html = tag + '\n' + html;
      }
      return res.end(opts.seo ? require('./backend/seo-pages.js').inject(html, opts.seo) : html);
    }
    if (type === 'text/html' && opts.seo) return res.end(require('./backend/seo-pages.js').inject(fs.readFileSync(file, 'utf8'), opts.seo));
    const page = fs.createReadStream(file); // a page in production: headers are written, send it whole
    page.on('error', () => res.end('Not found'));
    page.pipe(res);
  }

  // ----- hot reload: watch the folder, tell open pages what changed -----
  const clients = new Set();
  const tools = path.join(__dirname, '..', 'tools');
  function devFiles(req, res, urlPath) {
    if (urlPath === '/__kreft/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write('retry: 1000\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (!hot && !/^\/__kreft\/(deps|npm)\//.test(urlPath)) { res.writeHead(404); return res.end(); }
    const name = { '/__kreft/client.js': 'dev-client.js', '/__kreft/devtools.js': 'devtools.js' }[urlPath];
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
      const isComp = ext === '.kreft' || ext === '.kreftjs'; // .kreftjs: files of a project from the 0.0.x betas
      const routeFile = isComp && /^routes[\/\\]/.test(rel); // routes/web.kreft: the whole page loads again
      const msg = { type: isComp && !routeFile ? 'kreft' : ext === '.css' ? 'css' : 'reload', path: urlPath };
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
        const isComp = ext === '.kreft' || ext === '.kreftjs';
        const routeFile = /^routes[\/\\]/.test(rel);
        const msg = { type: isComp && !routeFile ? 'kreft' : ext === '.css' ? 'css' : 'reload', path: urlPath };
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
    // the page itself only loads kreftjs.js and asks who you are: anyone may get it, like a login screen
    if (!rel || rel === 'index.html' || (!path.extname(rel) && !isFile(file))) {
      if (!production) return send(res, path.join(adminDir, 'index.html'));
      // kreftjs serve: the PUBLIC_ values from .env, like the built app has them in app.js
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
    console.log('  .env changed' + (process.env.DATABASE_URL !== before ? ' (restart kreft dev to use the new DATABASE_URL)' : ''));
    clients.forEach((c) => c.write(`data: ${JSON.stringify({ type: 'reload', path: '/.env' })}\n\n`));
  });
  // files a browser must never get: the database itself, its settings and password, hidden files, locks, dumps
  const secret = (p) => /(^|\/)\.|\.(db|sqlite3?|db-wal|db-shm|sqlite-wal|sqlite-shm|sql|bak|dump|key|pem|crt)$|(^|\/)((?:kreftjs|kreft)\.config\.json|package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb|composer\.(json|lock)|docker-compose.*\.ya?ml|Dockerfile|node_modules|vendor)(\/|$)/i.test(p)
    || (production && /(^|\/)(database|app|routes)\//i.test(p));
  setInterval(() => clients.forEach((c) => c.write(': ping\n\n')), 25000).unref();
  // a page of the app: index.html, with the SEO tags of backend/routes/seo.js for this address (and its status)
  async function sendPage(req, res, file, urlPath) {
    const search = (() => { try { return new URL(req.url, 'http://x').search; } catch (_) { return ''; } })();
    let seo = null;
    if (req.method === 'GET' || req.method === 'HEAD') {
      try { seo = await require('./backend/seo-pages.js').resolve(backendDir, urlPath, req); } catch (e) { console.log('  routes/seo.js: ' + (e && e.message || e)); }
    }
    // a crawler or link preview gets the page already drawn (and a 404 when the app shows its 404 page)
    if (ssr.wants(req) && (!seo || seo.status === 200) && !fs.readFileSync(file, 'utf8').includes('data-kreft-ssg')) { // a page kreft build --prerender already drew is sent as it is
      const page = await ssr.render(urlPath, search);
      if (page) {
        res.writeHead(page.status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': isProd ? 'no-cache' : 'no-store', 'Vary': 'User-Agent', 'X-Content-Type-Options': 'nosniff', ...prodHeaders });
        return res.end(page.html);
      }
    }
    return send(res, file, seo ? { seo: seo.tags, status: seo.status } : {});
  }
  let warnedProxy = false;
  const ssr = require('./ssr.js').create({
    root,
    cached: production,
    log: console.log,
    origin: () => { // where this server can be reached from itself
      const a = server.address();
      const host = !a.address || a.address === '0.0.0.0' || a.address === '::' ? '127.0.0.1' : a.address;
      return `http://${host.includes(':') ? '[' + host + ']' : host}:${a.port}`;
    },
  });
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

  // /__kreft/deps/dayjs → the package as one ES module; /__kreft/npm/bootstrap/dist/css/bootstrap.css → that file
  async function npmFiles(req, res, urlPath) {
    const jsError = (status, message) => {
      console.log('  ' + message);
      res.writeHead(status, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(`throw new Error(${JSON.stringify(message)});`);
    };
    // only installed packages by their name ('dayjs', '@scope/pkg/file.css'): never a path like ./backend/… or ../.env
    const spec0 = urlPath.replace(/^\/__kreft\/(npm|deps)\//, '').replace(/\/$/, '');
    if (!/^(@[\w.-]+\/)?[\w-][\w.-]*(\/[\w.@+-]+)*$/.test(spec0) || spec0.split('/').some((p) => p === '..' || p === '.')) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not a package name: ' + spec0);
    }
    if (urlPath.startsWith('/__kreft/npm/')) {
      const file = deps.packageFile(project, urlPath.slice('/__kreft/npm/'.length));
      if (!file) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Not in node_modules: ' + urlPath.slice(11) + '  (kreft add ' + (urlPath.slice(11).match(deps.NAME) || [''])[0] + ')'); }
      return send(res, file);
    }
    const spec = urlPath.slice('/__kreft/deps/'.length).replace(/\/$/, '');
    try {
      const code = await deps.bundle(project, spec);
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(code);
    } catch (e) { jsError(e.code === 'MISSING' ? 404 : 500, e.message); }
  }
  const privateDirs = [serverDir, ...(hasBackend ? ['app', 'routes', 'database', 'config', 'storage'].map((d) => path.join(backendDir, d)) : []), path.join(root, 'config')];
  const insideServerDir = (file) => privateDirs.some((d) => file === d || file.startsWith(d + path.sep));

  // kreftjs down: storage/framework/down.json → a 503 for everyone, except with the secret (kreft down --secret=…)
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
    const cookie = (req.headers.cookie || '').match(/(?:^|;\s*)kreft_bypass=([^;]+)/);
    let cookieVal = null;
    if (cookie) { try { cookieVal = decodeURIComponent(cookie[1]); } catch (_) { cookieVal = cookie[1]; } }
    if (down.secret && cookieVal && same(cookieVal, String(down.secret))) return false;
    if (down.secret && same(urlPath, '/' + String(down.secret))) {
      res.writeHead(302, { Location: '/', 'Set-Cookie': `kreft_bypass=${encodeURIComponent(down.secret)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${cookieSecure() ? '; Secure' : ''}` });
      res.end();
      return true;
    }
    if (urlPath.startsWith('/__kreft/')) return false;
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
  // kreft dev serves, with the browser believing it is the same site. A server that only answers this computer
  // therefore only answers the names of this computer (add more with KREFT_ALLOWED_HOSTS=my-tunnel.example).
  const hostOnly = (h) => String(h || '').toLowerCase().replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  const isLocalName = (n) => n === 'localhost' || n === '127.0.0.1' || n === '::1' || n.endsWith('.localhost');
  const allowedHosts = new Set(String(process.env.KREFT_ALLOWED_HOSTS || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean));
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

  // A form another web site submits to this server (a plain POST the browser sends without asking first). Cookies set by the answer
  // would sign the visitor in as someone else (login CSRF), so it is refused. The whole address of the sender counts (host AND port):
  // another program on the same host, on another port, is another site. Allowed senders: this server's own address, the host of
  // APP_URL, and the full origins listed in KREFT_ALLOWED_ORIGINS (https://app.example.com,http://localhost:5173). On a development
  // machine bound to localhost, localhost and 127.0.0.1 count as the same address (same port). Requests with a JSON body need a CORS check from the browser first.
  const allowedOrigins = new Set(String(process.env.KREFT_ALLOWED_ORIGINS || '').split(',').map((x) => x.trim().replace(/\/+$/, '').toLowerCase()).filter(Boolean));
  let appUrlHost = '';
  try { if (process.env.APP_URL) appUrlHost = new URL(process.env.APP_URL).host.toLowerCase(); } catch (_) { /* no usable APP_URL */ }
  const crossSiteForm = (req) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(String(req.method).toUpperCase())) return false;
    const type = String(req.headers['content-type'] || '').toLowerCase().split(';')[0].trim();
    if (!(type === '' || type === 'application/x-www-form-urlencoded' || type === 'multipart/form-data' || type === 'text/plain')) return false;
    const origin = req.headers.origin;
    if (!origin) return false;   // not a browser (curl, a script)
    let o;
    try { o = new URL(origin); } catch (_) { return true; }
    if (o.protocol !== 'http:' && o.protocol !== 'https:') return true;   // "null" and other schemes
    const mine = String(req.headers.host || '').toLowerCase();
    if (o.host.toLowerCase() === mine || o.host.toLowerCase() === appUrlHost) return false;
    if (allowedOrigins.has(o.origin.toLowerCase())) return false;
    // localhost and 127.0.0.1 are one machine, but only the same port is this server
    const port = (h) => (String(h).match(/:(\d+)$/) || [])[1] || '';
    if (loopbackBind && isLocalName(hostOnly(o.host)) && isLocalName(hostOnly(mine)) && port(o.host) === port(mine)) return false;
    return true;
  };

  const server = http.createServer(async (req, res) => {
    try {
      // SHIELD=true in .env: rate limits, bans and load shedding per visitor address (see backend/shield.js)
      if (require('./backend/shield.js').Shield.guard(req, res)) return;
      if (loopbackBind && !isLocalName(hostOnly(req.headers.host)) && !allowedHosts.has(hostOnly(req.headers.host))) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end(`Blocked: this server only answers localhost. To reach it by the name "${hostOnly(req.headers.host)}", start it with KREFT_ALLOWED_HOSTS=${hostOnly(req.headers.host)} (or --host 0.0.0.0 to share it on your network).`);
      }
      // In production: plain HTTP is not allowed for security (force HTTPS / HSTS)
      if (isProd) {
        const isEncrypted = Boolean(req.socket && req.socket.encrypted);
        const forwardedProto = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
        const forceHttps = process.env.FORCE_HTTPS === 'true' || (process.env.APP_URL && process.env.APP_URL.startsWith('https://'));
        // A proxy that ends TLS says how the visitor came in (X-Forwarded-Proto). "http" is always believed (it only makes
        // us stricter); "https" only from this machine or a proxy in TRUSTED_PROXIES, since anyone could write it. Without
        // a believed header the server cannot tell, and FORCE_HTTPS / an https APP_URL decide.
        // (Our own page-drawing browser asks over plain HTTP on this machine.)
        const httpMod = require('./backend/http.js');
        const believed = forwardedProto === 'http' || (forwardedProto === 'https' && httpMod.isTrustedProxy(req)) ? forwardedProto : '';
        if (forwardedProto === 'https' && !believed && forceHttps && !warnedProxy) {
          warnedProxy = true;
          console.log(`  X-Forwarded-Proto: https came from ${(req.socket && req.socket.remoteAddress) || 'an unknown address'}, which is not a trusted proxy, so the request is treated as plain HTTP.\n  Behind a proxy that ends TLS, put its address in TRUSTED_PROXIES (.env), or * for any.`);
        }
        const isPlainHttp = !ssr.isInternal(req) && (believed ? believed === 'http' : (!isEncrypted && forceHttps));
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

      if ((backend || serverRoutes) && (urlPath === '/api' || urlPath.startsWith('/api/')) && crossSiteForm(req)) {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(JSON.stringify({ message: 'Blocked: another web site may not submit a form here.' }));
      }
      if (backend && (urlPath === '/api' || urlPath.startsWith('/api/'))) {
        if (await backend(req, res, urlPath)) return; // routes/api.js answered
      }
      if (serverRoutes && (urlPath === '/api' || urlPath.startsWith('/api/'))) {
        if (await serverRoutes(req, res, urlPath)) return; // a file in server/ answered
      }
      if (!production && /^\/__kreft\/(deps|npm)\//.test(urlPath)) return npmFiles(req, res, urlPath);
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
      if (hot && urlPath.startsWith('/__kreft/')) return devFiles(req, res, urlPath);
      if (adminDir && (urlPath === '/admin' || urlPath.startsWith('/admin/'))) return adminFiles(req, res, urlPath);
      // /storage/…: files on the public disk (backend/storage/app/public), connected by kreft storage:link.
      // They are sent as downloads of plain data: an uploaded .html or .svg can't run scripts on your site.
      if (urlPath.startsWith('/storage/')) {
        const pub = path.join(backendDir, 'storage', 'app', 'public');
        const f = path.join(pub, urlPath.slice('/storage/'.length));
        // a link inside the folder that points outside it must not be followed
        const real = (x) => { try { return fs.realpathSync(x); } catch (_) { return null; } };
        const realPub = real(pub), realF = real(f);
        if ((f.startsWith(pub + path.sep)) && !secret(urlPath) && isFile(f) && realPub && realF && realF.startsWith(realPub + path.sep)) {
          const type = types[path.extname(f).toLowerCase()] || 'application/octet-stream';
          return require('./backend/stream.js').sendFile(req, res, f, { type, headers: { 'Content-Security-Policy': "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox", 'Cache-Control': /\.(m3u8|mpd)$/i.test(f) ? 'no-cache' : 'public, max-age=3600' } }); // a live playlist changes every few seconds
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
        return sendPage(req, res, path.join(file, 'index.html'), urlPath);
      }
      // a page path (no extension) gets the nearest index.html, so clean URLs work on reload
      const index = !path.extname(urlPath) && nearestIndex(urlPath);
      if (index) return sendPage(req, res, index, urlPath);

      // the Kreft repository itself has no index.html at the top: show the demo
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
  require('./backend/shield.js').Shield.watch(server); // SHIELD=true: caps open connections per address
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
    // stop, with a message, if the project folder is deleted or moved to the Trash while the server runs
    require('./guard.js').watch([project, backendDir, process.cwd()], { onStop: () => server.close() });
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

/* ------------------------------------------------------------------ settings: kreftjs.config.json
 * { "db": "sqlite:database/app.db", "tables": { "posts": true, "users": { "write": false, "hidden": ["password"] } } }
 * Looked for in the folder being served, then its parents (so `kreft serve dist` finds the project's file).
 * DATABASE_URL in the environment wins over "db" — put real passwords there, not in the file.
 */
function readConfig(start) { return require('./kreftjs-config.js').readConfig(start); }
function migrationsDir(...dirs) {
  for (const d of dirs) if (d && fs.existsSync(path.join(d, 'database', 'migrations'))) return path.join(d, 'database', 'migrations');
  return null;
}
const describeDb = (url) => url.replace(/\/\/([^:@/]+):[^@/]*@/, '//$1:•••@');

/* ------------------------------------------------------------------ kreft db */
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
  kreft db migrate          The same as kreft migrate
  kreft db seed             The same as kreft db:seed
  kreft db tables           List tables and columns
  kreft db sql "<SQL>"      Run one statement and print the result

  The database comes from --db, DATABASE_URL or "db" in kreftjs.config.json.
`);
    return;
  }
  if (!dbUrl) { console.error('  Which database? Add --db sqlite:database/app.db, set DATABASE_URL, or put "db" in kreftjs.config.json.'); process.exit(1); }
  const { connect, migrate } = require('./db.js');
  let db;
  try {
    db = await connect(dbUrl, { root: config.dir });
    if (sub === 'migrate' || sub === 'seed') { // the same as kreft migrate and kreft db:seed
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
      if (!sql.trim()) { console.error('  kreft db sql "SELECT * FROM posts"'); process.exit(1); }
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

/* ------------------------------------------------------------------ kreft dev --api db.json
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
  const rules = db.$rules || {}; // "$rules": { "posts": { "title": "required|min:3" } } — the same rules as Kreftjs.validate
  const { validate: check } = require('../kreftjs.js');
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
