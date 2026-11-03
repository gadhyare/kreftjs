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
│   ├── App.kreft              # Root reactive shell
│   ├── routes/web.kreft       # Client-side routes (Dashboard, Users, Profile, Auth)
│   ├── layouts/               # app.kreft (authenticated shell) & guest.kreft (auth pages)
│   ├── pages/                 # Route views (Home, Dashboard, Users, Profile, auth/*)
│   ├── components/            # Reusable widgets (Field.kreft, StatCard.kreft, profile/*)
│   ├── errors/                # Custom HTTP error views (404.kreft, 500.kreft, ErrorMonitor.kreft)
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
# Generate Model + Migration + Factory + Seeder + Controller + .kreft Page + Route:
kreft make:model Post --all

# Or pick specific layers (-m migration, -f factory, -s seeder, -c controller, -p page, -r route):
kreft make:model Post -mfscpr --route=api --auth

# Individual generators:
kreft make:controller OrderController --api
kreft make:request StorePostRequest --model Post
kreft make:resource PostResource
kreft make:rule StrongPassword
kreft make:observer PostObserver --model Post
kreft make:middleware EnsureSubscribed
kreft make:job ProcessWebhook
kreft make:mail InvoiceReady
kreft make:routes billing        # Creates frontend/routes/billing.kreft & backend/routes/billing.js

# Database & inspection tools:
kreft db:migrate                 # Run pending migrations
kreft db:seed                    # Run database seeders
kreft route:list                 # List all registered backend API routes
kreft redis:ping                 # Verify Redis connectivity
kreft tinker                     # Interactive REPL with your Models, DB, Cache & Redis preloaded
```

---

## Writing `.kreft` Components

Every `.kreft` file combines reactive state, actions, `<view>`, and optional `<style scoped>`:

```html
<!-- frontend/pages/Posts.kreft -->
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

Use `kreft add` to install npm packages safely (blocks untrusted lifecycle scripts, checks for typosquatting, and skips redundant packages already built into Kreft):

```bash
kreft add dayjs nanoid
kreft add -D esbuild             # Bundles browser packages into import-mapped modules
```

Keep dependencies and your embedded Kreft runtime up to date:

```bash
kreft update                     # Update npm dependencies & refresh kreft.js / kreft.d.ts
kreft update --check             # Check for outdated packages without modifying files
kreft update --core              # Refresh only Kreft runtime & TypeScript definitions
```
