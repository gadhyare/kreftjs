# som.js

**Reactive by nature.** A tiny framework with its own component language.

📖 Documentation: [Read the documentation](docs/README.en.md)

```html
<!-- Counter.som -->
state count = 0
derive double = count * 2

action add() { count++ }

when count > 10 {
  bus.send('toast', 'Big number!')
}

<view>
  <button @click={add}>{count} × 2 = {double}</button>
</view>

<style scoped>
  button { font-size: 20px }
</style>
```

```html
<!-- index.html -->
<div id="app"></div>
<script src="som.js"></script>
<script>Som.app('Counter.som').mount('#app')</script>
```

## What's inside

- **The `.som` language**: `state`, `saved`, `derive`, `load`, `action`, `when`, `watch`, `on start/ready/update/show/hide/destroy`, `prop`, `event`, `use`, `share`, `receive`, `import`. Names are used directly: no `this`, no `.value`.
- **Views with `{ }`**: `{name}`, `title={x}`, `class="btn {x}"`, `@click={add}`, loops with `{for user in users} … {empty} … {/for}`, plus `s-if`, `s-model`, `s-once`, `s-memo` and more. Single braces provide clean, standard expressive templates.
- **Animations**: `s-animate="fade"` on `s-if`, `s-show`, lists (`{for … animate slide}`, items move into place), components and pages. Ready-made fade, slide, scale and pop, or your own CSS.
- **Saved data**: `saved todos = []` keeps a value in localStorage, so it survives a reload. Stores can be saved too.
- **Forms and validation**: `form(values, { title: 'required|min:3' })` with expressive validation rules. A form with mistakes is never sent, and the server checks the same rules (`som.config.json`, or `"$rules"` for the practice API).
- **API client**: `api.get`, `post`, `put`, `patch`, `delete` with JSON, CSRF protection and validation errors; `load posts = api.get(…)` gives `data`, `loading` and `error`.
- **Databases**: `som dev --db sqlite:app.db` (or `mysql://…`, `postgres://…`) turns every table into a REST API at `/api/<table>`, with filters, sorting, pages and 422 validation errors. `.sql` migrations, `table('posts')` in the browser, and `som serve` to run it for real users.
- **Environment configuration (`.env`)**: settings and secrets for the server (`process.env`, `DATABASE_URL`), never sent to the browser or copied by the build. Only `PUBLIC_` values reach the page, as `{env.PUBLIC_APP_NAME}`.
- **Complete full-stack backend**: `routes/api.js` (`Route.get`, `Route.apiResource`, groups, names), controllers, Active Record ORM models with relations and pagination, JavaScript migrations that work on SQLite, MySQL and PostgreSQL, seeders, and middleware (`auth`, `throttle:60,1`, your own). Plus CLI workflow commands: `som key:generate`, `som migrate`, `som migrate:rollback`, `som migrate:fresh --seed`, `som db:seed`, `som make:model Post --all`, `som make:controller`, `som make:middleware`, `som route:list`.
- **Server code**: `server/hello.js` answers `/api/hello`. Plain Node.js, so any npm package works there, with `ctx.db`, `ctx.validate` and 422 validation errors.
- **Any library**: `import dayjs from 'dayjs'` (any npm package) and `import 'bootstrap/dist/css/bootstrap.min.css'` in a `.som` file, or a CDN link in `index.html`. `som new my-app --ui tailwind` (or `bootstrap`, `bulma`, `pico`) starts with one.
- **Components** with props, events, `s-model`, slots and scoped CSS. `keep` puts them away instead of removing them; `<som-wait>` shows a loading view until everything inside has loaded.
- **Declarative route files (`routes/web.som`)**: `Route.view('/', 'pages/Home.som').name('home')`, groups with `prefix`, `middleware`, `layout` and `name`, nested pages, redirects. `som make:routes admin` adds another file (`--api` for the backend).
- **Router** with clean URLs (no `#`): `<som-link>`, `<som-view>`, params, guards, redirects, nested routes; each page is a `.som` file loaded when needed.
- **Layouts with slots and sections**: `Som.router({ layout: 'app' })` for every page, `layout: 'admin'` on a route, or `layout admin` inside a page (`@extends`). `<som-section>` and `<som-yield>` work seamlessly together. The layout stays on screen between pages that share it.
- **Native Model Context Protocol (MCP) for AI Agents**: Built-in MCP server (`som mcp` or `/mcp`) compliant with the 2024-11-05 standard. Connects directly to Claude Desktop, Cursor, Windsurf, or custom AI agents to query routes, schemas, and live database tables with built-in CORS origin and SQL exfiltration guards.
- **Auto Garbage Collection & Memory Watchdog**: `som dev --gc` or `AUTO_GC=1` exposes V8 garbage collection, automatically flushing internal file caches and reclaiming heap memory when thresholds are crossed to maintain a tiny 40–60MB memory footprint.
- **Enterprise Security Gatekeeper for Packages (`som add`)**: Strict, multi-layered security verification before enabling or installing any external npm dependency. Features: (1) Zero-dependency redundancy blocker that halts unnecessary libraries when Som.js already provides native solutions (e.g. `redis`, `dotenv`, `cors`, `jsonwebtoken`, `bcrypt`, `multer`), (2) Unicode homoglyph and shell injection protection, (3) Dynamic Levenshtein distance typosquatting detector comparing against 50+ high-profile packages, (4) Deep RCE lifecycle script scanner (`curl | sh`, `powershell`, `rm -rf`) with `--ignore-scripts` sandbox by default, (5) 4-tier security classification with mandatory confirmation gatekeeper for unverified community packages, and (6) Exact version pinning (`--save-exact`) and automated post-install vulnerability auditing.
- **Active Record ORM & Soft Deletes**: `hasMany`, `belongsTo`, `belongsToMany`, scopes, hooks, and full soft-delete support (`static softDeletes = true`, `withTrashed()`, `onlyTrashed()`, `restore()`, `forceDelete()`) with type-safe foreign key comparisons across BigInt, UUID, numbers, and strings.
- **Desktop Apps with Electron.js**: `som electron:init`, `som electron` (instant desktop window with HMR), and `som electron:build` (produces native `.dmg`, `.exe`, `.AppImage` installers via electron-builder).
- **Vite.js Bundling & Instant HMR**: `som vite:init`, `som vite` (runs Vite dev server with automated backend API proxying), and `som vite:build`.
- **Full Redis Integration**: First-class zero-dependency Redis client (`const { Redis } = require('somjs/server')`), backing `Cache` (`CACHE_STORE=redis`) with atomic distributed locks (`Cache.lock`), background queues (`QUEUE_CONNECTION=redis`), and pub/sub. `som new my-app --redis` configures it out of the box, and `som redis:ping` verifies connectivity.
- **Full backend ecosystem**: queued jobs, events and listeners, mailables, notifications (mail and database), cache, file storage and uploads, gates and policies, form requests, API resources, task scheduling, maintenance mode, your own commands and `som tinker`. Every piece has a `som make:` command, more than 40 commands in all (`som list`).
- **TypeScript or JavaScript**: `som new shop --ts` writes the backend in TypeScript with full types; pages can import `.ts` modules. Both kinds of files can live side by side.
- **Authentication and user accounts out of the box**: new projects have every sign-in page (log in with remember me, register, forgot and reset password, verify email, confirm password, profile, dashboard) with the backend behind them. The login is an HttpOnly cookie with CSRF protection; two-factor authentication (QR code, recovery codes), signed-in devices, API tokens with abilities, and roles come with it: a users table, tokens, `auth`, `verified` and `password.confirm` middleware, and `Hash`, `Str`, `Url` and `Mail` helpers. Emails print in the terminal until `MAIL_URL` is set.
- **Admin dashboard as default UI**: new projects come with a dashboard sidebar layout, metric stat cards, and user management directly in `frontend/`. Developers can freely attach custom auth guards and middleware directly to routes in `routes/web.som`.
- **Two folders, frontend/ and backend/**: only `frontend/` is served and built; the backend, the database file and `.env` have no address. Plus security headers, rate limits, trusted proxies, expiring login tokens, and `som dev` answering only your computer.
- **Dedicated HTTP error pages**: `errors/404.som`, `403`, `419`, `429`, `500`, `503` and more. An unknown address shows the 404 page; `abort(403, 'message')` shows another, in a page or an action. `som make:errors` adds them to a project.
- **A quiet look**: `ui.css` in new projects, in the spirit of shadcn/ui, with square corners and no shadows. Buttons, fields, cards, badges and tables, all from a few colors you can change.
- **Sharing data**: stores (`use cart`, with `$patch`, `$reset`, `$watch`), `share` / `receive`, an event bus, and shared logic in `.js` files (`use mouse = trackMouse()`).
- **Template engine**: `Som.render(view, data)` returns an HTML string.
- **Developer tools**: hot reload that keeps state, an error overlay, Som DevTools in the page, `som vscode` for editor colors, and `som.d.ts` types.
- One file and no dependencies at runtime. No build step while you work; `som build` when you ship (`--prerender` for ready HTML pages).

Coming from Vue? The [docs](docs/README.en.md#coming-from-vue) have a table with the Som.js name for every Vue feature.

## Run the demo

Needs [Node.js](https://nodejs.org) (npm comes with it). In this folder:

```bash
npm run dev
```

Then open http://localhost:8000/demo/. The menu has one page per feature:

| Group | Pages |
|---|---|
| Start | Start page (what Som.js is, with a live component), Documentation (`/docs`) |
| Basics | Basics (state, derive, action), Lifecycle (when, watch, on) |
| Views | Loops (`{for}`), Forms (`s-model`), Directives (`s-if`, `s-show`, `s-ref`, portal), Animations (`s-animate`), Fast views (`s-once`, `s-memo`, `on update`) |
| Components | Components (props, events, `s-model`, slots, `<som-component :is>`), Keep and wait (`keep`, `<som-wait>`) |
| Data | Saved data (localStorage), Sharing (store, share/receive, bus), Shop, Posts (API), Shared logic (`use x = …`, `$patch`, `$reset`), Online API (jsonplaceholder: `fetch`, `async`/`await`, `try`/`catch`), Database (SQLite), Backend (routes, controller, model, middleware), Server code (`demo/server/*.js`) |
| Router | Users (params), Router (query, guards, redirects, `go()`), Settings (nested routes), Layouts |
| Tools | Template engine (`Som.render`), Dev tools (hot reload, DevTools) |

`npm run dev` also serves a practice REST API from `demo/db.json` at `/api`, which the Posts page uses (changes are written to that file), and the `notes` table of a real SQLite database, `demo/database/demo.db`, which the Database page uses. SQLite needs Node.js 22.5 or newer.

While it runs, save any `.som` file and the page updates in place, keeping its state. The **S** button opens Som DevTools.

### Data still resets after a reload?

1. Check the version at the bottom of the menu, or type `Som.version` in the browser console. It should say **2.3.0**. If not, an old copy is running.
2. Stop every old server (Ctrl+C in each terminal), then start again from this folder with `npm run dev`.
3. Reload with Ctrl+Shift+R (Cmd+Shift+R on a Mac) so the browser drops its old copy.
4. Use `saved` for values that must survive a reload. `state` starts fresh every time.
5. Open the same address each time: `localhost:8000` and `127.0.0.1:8000` keep separate saved data.

## Start a new project

Run `npm link` once in this folder so the `som` command works everywhere, then:

```bash
som new my-app
cd my-app
npm run dev
```

`som dev` serves your files with clean URLs (no `#`), never caches them while you work, and picks the next free port if 8000 is busy.

```bash
som new my-app --ui bootstrap   # with a CSS library from a CDN: tailwind, bootstrap, bulma or pico
npm i dayjs && npm i -D esbuild # then: import dayjs from 'dayjs' in any .som file
```

Log in as **test@example.com** with the password **password**, or register. A new project keeps your work apart from the rest:

```
frontend/                     the only folder a browser can reach
  routes/web.som              the pages and their addresses
  pages/ components/ layouts/ your app (pages/auth/: login, register, passwords)
  errors/  docs/  tests/      error pages, the documentation (/docs), test pages (/tests)
backend/                      never served or built, readable only by you: routes/api.js, app/, database/
```

## A project with a database

```bash
som new shop --db mysql       # or postgres, sqlite (the default); also adds a Todos example
cd shop
som key:generate              # sets a secure 256-bit APP_KEY in .env
npm run dev                   # migrates, seeds a new database, serves routes/api.js at /api
som make:model Product -mfsc  # app/Models/Product.js, migration, factory, seeder, controller
som route:list                # the routes, their controllers and middleware
som migrate:fresh --seed      # start the database again
npm run build && npm run serve   # for real users
```

The database address goes in `.env` (`DATABASE_URL`). `routes/api.js` and the `app/` folder structure your API, models, and controllers.

## Colors in VS Code

```bash
som vscode
```

Installs colors, folding and snippets for `.som` files (VS Code, Cursor, VSCodium). Restart the editor afterwards.

## Build for production

```bash
npm run build      # in a project made with som new (or: som build)
npm run preview    # serve the result
som build --prerender   # also save every page as ready HTML (npm i -D jsdom first)
```

`som build` compiles every `.som` file ahead of time into one `app.js`, collects styles into `app.css`, and turns every view expression into a real function. Built apps load faster, report `.som` errors at build time with the file and line, and run under a strict Content-Security-Policy (no `eval`, no `new Function`). In this folder, `npm run build` builds the demo into `dist/demo`.

## Project layout

```
som.js                 the framework
som.d.ts               TypeScript types for everything in Som
package.json           npm package: `npm run dev`, and the `som` command
bin/som.js             the som command: `som new`, `som dev`, `som build`, `som update`, `som vscode` (no dependencies)
bin/build.js           the production build
bin/update.js          som update: update packages and refresh Som runtime files
bin/prerender.js       som build --prerender: ready HTML for every page
bin/db.js              SQLite, MySQL and PostgreSQL behind one small interface, and migrations
bin/db-api.js          the REST API made from database tables (som dev --db, som serve)
bin/server-routes.js   server/*.js files as /api addresses
bin/backend/           routes/api.js, controllers, models, migrations, seeders, middleware (require('somjs/server'))
bin/artisan.js         som migrate…, som db:seed, som make:…, som route:list
server.js, server.d.ts what require('somjs/server') gives, and its types
bin/deps.js            npm packages for the browser (esbuild), CSS from node_modules
tools/                 what `som dev` adds to the page: hot reload, error overlay, DevTools
editors/vscode/        the VS Code extension for .som files
templates/app/         the starter project `som new` creates: frontend/ (pages, routes/web.som) and backend/ (API, login)
bin/layout.js          where a project's frontend/ and backend/ are
demo/index.html        stores, routes and app start
demo/App.som           the app: the current page in its layout, and a toast
demo/layouts/*.som     main.som (bar + menu) and plain.som (bar + wide page)
demo/errors/*.som      the error pages (404, 403, 500…) and their frame, minimal.som
demo/ui.css            the look: buttons, fields, cards, tables (same as a new project's)
demo/pages/*.som       one page per feature (see the menu); Start.som is the start page
demo/db.json           data for the practice API (som dev --api)
demo/database/         the demo's SQLite migrations (the .db file is made on the first run)
demo/server/           the demo's server code: /api/time, /api/hash, /api/notes/stats
demo/routes/, demo/app/  the demo's full-stack backend: TaskController, the Task model, the DemoKey middleware
demo/components/*.som  reusable components (Counter, TodoList, Rating, Panel, Score, ThemeBox, NoteTab, TimerTab, SlowCard)
demo/logic/*.js        shared logic used with `use x = …` (mouse, countdown)
docs/                  the documentation pages: Docs.som (at /docs), its Markdown reader, and README.en.md
```

MIT License
