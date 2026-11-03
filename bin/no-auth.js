/*
 * kreft new my-app --no-auth
 *
 * A new app comes with login, registration, password reset, email verification, a profile and an admin area. This takes
 * all of that out again, so the app starts as a plain site: the welcome page, the docs, the error monitor and the tests
 * (and the Todos example when --db is used), without a users table, sessions or sign-in pages.
 * It runs on a freshly copied template, before the TypeScript step, so every file is still plain .js.
 */
const fs = require('fs');
const path = require('path');

const TO_REMOVE = [
  // frontend: the sign-in pages, the profile, the admin pages and what only they use
  'frontend/pages/auth', 'frontend/pages/Profile.kreft', 'frontend/pages/Users.kreft', 'frontend/pages/Dashboard.kreft',
  'frontend/components/profile', 'frontend/components/StatCard.kreft', 'frontend/layouts/guest.kreft',
  // backend: the auth routes, controllers, middleware, models and the users table
  'backend/routes/auth.js', 'backend/app/Auth',
  'backend/app/Http/Controllers/Auth', 'backend/app/Http/Controllers/Admin', 'backend/app/Http/Controllers/ProfileController.js',
  'backend/app/Http/Middleware', 'backend/app/Http/Requests/Auth',
  'backend/app/Models/User.js', 'backend/app/Models/PersonalAccessToken.js',
  'backend/config/auth.js', 'backend/database/migrations/0001_01_01_000000_create_users_table.js',
  'lang/en/auth.json', 'lang/ar/auth.json', 'lang/en/passwords.json', 'lang/ar/passwords.json',
];

const API = (todos) => `// Your API: every address here starts with /api.
// All API routes live directly in this file. Add your new routes here!
// See them all anytime with: kreft route:list
const { Route } = require('kreftjs/server')
${todos ? `const TodoController = require('../app/Http/Controllers/TodoController')

// The todos table: index, store, show, update, destroy (app/Http/Controllers/TodoController.js)
Route.apiResource('todos', TodoController)

` : ''}// Example public endpoint: GET /api/hello?name=World
Route.get('/hello', (req) => ({ hello: req.input('name', 'world'), app: process.env.APP_NAME }))

// This app was created without sign-in. To add it later, start a new app without --no-auth and copy its auth files.
`;

const PROVIDER = `// Runs once when the backend starts (and again after a change).
// A place for gates, event listeners and settings that belong to the whole app.
class AppServiceProvider {
  boot() {
    // Gate.define('view-reports', (user) => user.hasRole('editor'))   → await req.authorize('view-reports')
  }
}

module.exports = AppServiceProvider
`;

const SEEDER = (todos) => `const { Seeder } = require('kreftjs/server')

// kreft db:seed  (kreft dev --seed fills a new database)
class DatabaseSeeder extends Seeder {
  async run() {
${todos ? "    await this.call(require('./TodoSeeder'))\n" : ''}  }
}

module.exports = DatabaseSeeder
`;

const WEB = (todos) => `// Application Web Routes (this app was created without sign-in: --no-auth).

// Welcome page
Route.view('/', 'pages/Home.kreft').layout('none').name('home').title('Welcome')
Route.view('/welcome', 'pages/Home.kreft').layout('none').name('welcome').title('Welcome')
${todos ? "\nRoute.view('/todos', 'pages/Todos.kreft').name('todos').title('Todos')\n" : ''}
// Documentation (docs/) and test suite (tests/)
Route.view('/docs', 'docs/Docs.kreft').name('docs').title('Documentation').layout('docs')   // its own slim bar
Route.view('/error-monitor', 'pages/ErrorMonitor.kreft').name('error-monitor').title('Error Monitor')
Route.prefix('/tests').name('tests.').group(() => {
  Route.view('/', 'tests/pages/Test.kreft').name('index').title('Test Suite')
  Route.view('/about', 'tests/pages/About.kreft').name('about').title('About · Tests')
})
`;

const LAYOUT = (todos) => `<!-- The default layout: a slim bar and the page. Every route without .layout(…) uses it (see index.html). -->
state docs = (Kreftjs.env.PUBLIC_DOCS_URL || 'http://kreftjs.com').replace(/\\/+$/, '')   // where "Documentation" links go: PUBLIC_DOCS_URL in .env

<view>
  <header>
    <kreft-link to="/" class="brand"><span class="mark" aria-hidden="true"></span>{env.PUBLIC_APP_NAME || 'My app'}</kreft-link>
    <nav>
      <kreft-link to="/" exact-class="here">Home</kreft-link>${todos ? `
      <kreft-link to="/todos" exact-class="here">Todos</kreft-link>` : ''}
      <kreft-link to="/error-monitor" exact-class="here">Error monitor</kreft-link>
      <kreft-link to="/tests" exact-class="here">Tests</kreft-link>
      <a href={docs + '/docs'} target="_blank" rel="noopener">Docs</a>
      <button type="button" class="theme" @click="theme.toggle()" aria-label="Toggle theme" title="Toggle theme">
        <span k-if="theme.dark">☀</span><span k-else>🌙</span>
      </button>
    </nav>
  </header>
  <main>
    <slot></slot>
  </main>
</view>

<style scoped>
header { position: sticky; top: 0; z-index: 50; display: flex; align-items: center; gap: 14px; height: 60px; padding: 0 var(--container-pad, 28px); background: var(--background); border-bottom: 1px solid var(--border); box-sizing: border-box; }
.brand { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; font-size: 16px; letter-spacing: -0.02em; color: var(--foreground); text-decoration: none; }
.mark { width: 16px; height: 16px; background: var(--primary); }
nav { display: flex; align-items: center; gap: 4px; margin-inline-start: auto; }
nav a { padding: 6px 10px; font-size: 14px; color: var(--muted); text-decoration: none; border-radius: var(--radius); }
nav a:hover, nav a.here { color: var(--foreground); background: var(--accent); }
.theme { height: 34px; width: 34px; margin-inline-start: 6px; background: var(--card); color: var(--foreground); border: 1px solid var(--border); border-radius: var(--radius); font: inherit; cursor: pointer; }
.theme:hover { background: var(--accent); }
main { width: 100%; max-width: calc(var(--container, 1240px) + var(--container-pad, 28px) * 2); margin: 0 auto; padding: 0 var(--container-pad, 28px) 48px; box-sizing: border-box; }
@media (max-width: 640px) {
  header { padding: 0 16px; }
  nav a:not(.here) { display: none; }
  main { padding: 0 16px 36px; }
}
</style>
`;

function removeAuth(target) {
  const at = (rel) => path.join(target, rel);
  const read = (rel) => fs.readFileSync(at(rel), 'utf8');
  const write = (rel, text) => fs.writeFileSync(at(rel), text);
  const todos = fs.existsSync(at('backend/app/Http/Controllers/TodoController.js'));

  for (const rel of TO_REMOVE) fs.rmSync(at(rel), { recursive: true, force: true });
  fs.mkdirSync(at('backend/app/Http/Middleware'), { recursive: true });
  fs.writeFileSync(at('backend/app/Http/Middleware/.gitkeep'), '');

  write('backend/routes/api.js', API(todos));
  write('backend/app/Providers/AppServiceProvider.js', PROVIDER);
  write('backend/database/seeders/DatabaseSeeder.js', SEEDER(todos));
  write('frontend/routes/web.kreft', WEB(todos));
  write('frontend/layouts/app.kreft', LAYOUT(todos));

  // index.html: no auth store, no guards, no "signed out" handling; the router keeps its pages and layout
  let html = read('frontend/index.html');
  const from = html.indexOf('    // Who is signed in.');
  const to = html.indexOf("    Kreftjs.app('App.kreft')");
  if (from >= 0 && to > from) {
    html = html.slice(0, from) + `    const router = Kreftjs.router({
      routes: ['routes/web.kreft'], // the pages are in routes/web.kreft; add more files: kreft make:routes admin
      layout: 'app',              // every page goes inside layouts/app.kreft…
      errors: 'errors',           // error pages: errors/404.kreft for unknown addresses, abort(403) → errors/403.kreft
    })

` + html.slice(to);
  }
  html = html.replace(/ *\.component\('StatCard'[^\n]*\n/, '');
  write('frontend/index.html', html);

  // the welcome page loses its Log in / Sign up / Dashboard links
  const home = read('frontend/pages/Home.kreft')
    .replace(/[ \t]*<kreft-link k-if="!?\$store\.auth\.user"[^>]*>[\s\S]*?<\/kreft-link>[ \t]*\r?\n/g, '');
  write('frontend/pages/Home.kreft', home);

  // the docs bar went back to "the app" when signed in
  write('frontend/layouts/docs.kreft', read('frontend/layouts/docs.kreft')
    .replace(/<kreft-link to=\{\$store\.auth\.user \? '\/dashboard' : '\/'\} class="back">← \{\$store\.auth\.user \? 'Back to the app' : 'Home'\}<\/kreft-link>/,
      '<kreft-link to="/" class="back">← Home</kreft-link>'));

  const readme = read('README.md');
  write('README.md', readme.replace(/\n\n/, '\n\n> Created with `--no-auth`: there is no login, registration, profile or users table.\n\n'));
  return { todos };
}

module.exports = { removeAuth, TO_REMOVE };
