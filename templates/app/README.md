# My Som.js app

```bash
npm run dev       # work on it
npm run build     # production files in dist/
npm run preview   # check dist/ before uploading
```

Log in as **test@example.com** with the password **password**, or register. Emails (verify email, reset password) are printed in the terminal until `MAIL_URL` is set in `.env`.

The app has two halves, cleanly separating client code from backend logic:

```
frontend/              everything the browser gets (the only folder that is served)
  index.html           who is signed in (the auth store), the router, app start
  routes/web.som       the pages and their addresses (Dashboard, Users, Profile, etc.)
  App.som              the page for the current route
  layouts/             app.som (default dashboard shell) and guest.som (the login pages)
  pages/               your pages: Dashboard, Users, Profile, Home; pages/auth/: Login, Register…
  components/          your components (Field.som, StatCard.som)
  errors/              the error pages: 404.som, 500.som…
  docs/                the documentation, at /docs
  tests/               test pages and components, at /tests
  ui.css               the look; change the colors at the top

backend/               never served as files, never built into dist/, readable only by you
  routes/api.js        your API routes (routes/auth.js: login, register, passwords)
  app/Http/            Controllers/, Middleware/ (auth, verified, password.confirm), Kernel.js (throttle)
  app/Models/          User.js and your models
  database/            migrations/ and seeders/ (and app.db with SQLite)

.env                   settings and secrets (never sent to the browser); .env.example lists the keys
```

The backend provides complete full-stack tools: `som key:generate`, `make:job`, `make:event`, `make:listener`, `make:mail`, `make:notification`, `make:policy`, `make:request`, `make:resource`, `make:factory`, `make:command`… `som list` shows them all, `som tinker` opens a console with your models, and `backend/routes/console.js` holds the schedule.

Add routes directly to `frontend/routes/web.som` (pages) and `backend/routes/api.js` (API). In the backend, you can use PHP-style namespaces: `const { DashboardController } = namespace('App\\Http\\Controllers\\Admin')`, `use('App\\Models\\User')`, or `Route.namespace('Admin').group(...)`. Split into modules with `som make:routes shop` (pages: `frontend/routes/shop.som`, API: `backend/routes/shop.js`). Scaffold full-stack features in one line with `som make:model Post -mfscpr --route=api --auth` (model, migration, factory, seeder, controller, page, and route registration) or `som make:model Post --all`; list the API anytime with `som route:list`.

While `npm run dev` runs, saving a `.som` file updates the page in place and keeps its state. The **S** button opens Som DevTools. `som.d.ts` gives your editor hints; run `som vscode` once for colors in `.som` files. `som dev` only answers this computer; add `--host 0.0.0.0` to open it from your phone.

Packages from npm: `npm i dayjs` and `npm i -D esbuild` once, then `import dayjs from 'dayjs'` in any `.som` file. A CSS file works the same way: `import 'bootstrap/dist/css/bootstrap.min.css'`. Or add a CDN `<link>` to `frontend/index.html`.

Update packages anytime with `som update`:
```bash
som update              # updates npm packages and refreshes embedded som.js / som.d.ts
som update <package>    # update a specific package (e.g. som update esbuild)
som update --latest     # upgrade packages to their latest versions
som update --check      # inspect outdated packages without modifying
som update --core       # update only Som runtime files (som.js, som.d.ts, server.d.ts)
```
