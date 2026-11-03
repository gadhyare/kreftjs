# My Kreft Application

Welcome to your **Kreft** full-stack application.

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
│   ├── App.kreftjs              # Root reactive shell
│   ├── routes/web.kreftjs       # Client-side routes (Dashboard, Users, Profile, Auth)
│   ├── layouts/               # app.kreftjs (authenticated shell) & guest.kreftjs (auth pages)
│   ├── pages/                 # Route views (Home, Dashboard, Users, Profile, auth/*)
│   ├── components/            # Reusable widgets (Field.kreftjs, StatCard.kreftjs, profile/*)
│   ├── errors/                # Custom HTTP error views (404.kreftjs, 500.kreftjs, ErrorMonitor.kreftjs)
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
# Generate Model + Migration + Factory + Seeder + Controller + .kreftjs Page + Route:
kreftjs make:model Post --all

# Or pick specific layers (-m migration, -f factory, -s seeder, -c controller, -p page, -r route):
kreftjs make:model Post -mfscpr --route=api --auth

# Individual generators:
kreftjs make:controller OrderController --api
kreftjs make:request StorePostRequest --model Post
kreftjs make:resource PostResource
kreftjs make:rule StrongPassword
kreftjs make:observer PostObserver --model Post
kreftjs make:middleware EnsureSubscribed
kreftjs make:job ProcessWebhook
kreftjs make:mail InvoiceReady
kreftjs make:routes billing        # Creates frontend/routes/billing.kreftjs & backend/routes/billing.js

# Database & inspection tools:
kreftjs db:migrate                 # Run pending migrations
kreftjs db:seed                    # Run database seeders
kreftjs route:list                 # List all registered backend API routes
kreftjs redis:ping                 # Verify Redis connectivity
kreftjs tinker                     # Interactive REPL with your Models, DB, Cache & Redis preloaded
```

---

## Writing `.kreftjs` Components

Every `.kreftjs` file combines reactive state, actions, `<view>`, and optional `<style scoped>`:

```html
<!-- frontend/pages/Posts.kreftjs -->
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
    <input k-model="title" placeholder="Post title" required>
    <button class="primary">Publish</button>
  </form>

  <ul k-if="posts.data">
    {for post in posts.data key post.id}
      <li>{post.title}</li>
    {/for}
  </ul>
</view>
```

---

## Installing & Updating Packages

Use `kreftjs add` to install npm packages safely (blocks untrusted lifecycle scripts, checks for typosquatting, and skips redundant packages already built into Kreft):

```bash
kreftjs add dayjs nanoid
kreftjs add -D esbuild             # Bundles browser packages into import-mapped modules
```

Keep dependencies and your embedded Kreft runtime up to date:

```bash
kreftjs update                     # Update npm dependencies & refresh kreftjs.js / kreftjs.d.ts
kreftjs update --check             # Check for outdated packages without modifying files
kreftjs update --core              # Refresh only Kreft runtime & TypeScript definitions
```
