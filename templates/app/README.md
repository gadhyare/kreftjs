# My Som.js Application

Welcome to your **Som.js v2.4** full-stack application.

## Quick Commands

```bash
npm run dev       # Start dev server with hot-reload + backend API (http://localhost:8000)
npm run build     # Compile minified production assets into dist/
npm run serve     # Run the production server (serves dist/ + backend/ API)
npm test          # Run backend & frontend test suites
```

> **Demo Credentials:** Sign in with **test@example.com** and password **password**, or register a new account. Outgoing emails (verification, password reset) are printed in the terminal until `MAIL_URL` is configured in `.env`.

---

## Project Architecture

Your project cleanly isolates client-side UI (`frontend/`) from server-side business logic (`backend/`):

```text
├── frontend/                  # Public client application (the only folder served to browsers)
│   ├── index.html             # HTML entry, auth store, router & app bootstrap
│   ├── App.som                # Root reactive shell
│   ├── routes/web.som         # Client-side routes (Dashboard, Users, Profile, Auth)
│   ├── layouts/               # app.som (authenticated shell) & guest.som (auth pages)
│   ├── pages/                 # Route views (Home, Dashboard, Users, Profile, auth/*)
│   ├── components/            # Reusable widgets (Field.som, StatCard.som, profile/*)
│   ├── errors/                # Custom HTTP error views (404.som, 500.som, ErrorMonitor.som)
│   ├── docs/                  # Built-in documentation (accessible at /docs)
│   └── ui.css                 # Design system tokens & component styles
│
├── backend/                   # Private server engine (never exposed or built into dist/)
│   ├── config/                # Centralized config (app, auth, database, redis, session)
│   ├── routes/                # api.js (REST API), auth.js (Auth endpoints), console.js (Cron)
│   ├── app/
│   │   ├── Http/Controllers/  # Request handlers & validation
│   │   ├── Http/Middleware/   # Auth, CheckAbilities, EnsureIsAdmin, security headers
│   │   └── Models/            # Active Record models (User.js, PersonalAccessToken.js, etc.)
│   └── database/              # migrations/, seeders/, factories/, and SQLite app.db
│
└── .env                       # Environment secrets (APP_KEY, DB_*, REDIS_*, SESSION_*)
```

---

## Scaffolding & CLI Generators

Generate full-stack features from the terminal:

```bash
# Generate Model + Migration + Factory + Seeder + Controller + .som Page + Route:
som make:model Post --all

# Or pick specific layers (-m migration, -f factory, -s seeder, -c controller, -p page, -r route):
som make:model Post -mfscpr --route=api --auth

# Individual generators:
som make:controller OrderController --api
som make:request StorePostRequest --model Post
som make:resource PostResource
som make:rule StrongPassword
som make:observer PostObserver --model Post
som make:middleware EnsureSubscribed
som make:job ProcessWebhook
som make:mail InvoiceReady
som make:routes billing        # Creates frontend/routes/billing.som & backend/routes/billing.js

# Database & inspection tools:
som db:migrate                 # Run pending migrations
som db:seed                    # Run database seeders
som route:list                 # List all registered backend API routes
som redis:ping                 # Verify Redis connectivity
som tinker                     # Interactive REPL with your Models, DB, Cache & Redis preloaded
```

---

## Writing `.som` Components

Every `.som` file combines reactive state, actions, `<view>`, and optional `<style scoped>`:

```html
<!-- frontend/pages/Posts.som -->
state title = ''
load posts = api.get('/api/posts')

action create() {
  await api.post('/api/posts', { title })
  title = ''
  posts.reload()
}

<view>
  <h1>Posts</h1>
  <form @submit.prevent={create} class="row">
    <input s-model="title" placeholder="Post title" required>
    <button class="primary">Publish</button>
  </form>

  <ul s-if="posts.data">
    {for post in posts.data key post.id}
      <li>{post.title}</li>
    {/for}
  </ul>
</view>
```

---

## Installing & Updating Packages

Use `som add` to install npm packages safely (blocks untrusted lifecycle scripts, checks for typosquatting, and skips redundant packages already built into Som.js):

```bash
som add dayjs nanoid
som add -D esbuild             # Bundles browser packages into import-mapped modules
```

Keep dependencies and your embedded Som.js runtime up to date:

```bash
som update                     # Update npm dependencies & refresh som.js / som.d.ts
som update --check             # Check for outdated packages without modifying files
som update --core              # Refresh only Som.js runtime & TypeScript definitions
```
