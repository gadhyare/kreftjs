# Kreft

**A small reactive framework with its own component language, and a full Node.js backend to go with it.**

You write components in `.kreft` files in plain words: `state`, `derive`, `action`. The same project also gives you routing, controllers, an Active Record ORM, migrations, queues, mail, sign-in pages with two-factor codes, and a development server with hot reload that keeps your state.

📖 **[Read the documentation](docs/README.md)** · run `npm run dev` and open `/demo/docs` for the searchable version.

```html
<!-- Counter.kreft -->
state count = 0
derive double = count * 2
action add() { count++ }

<view>
  <button @click={add}>{count} × 2 = {double}</button>
</view>
```

## Start in a minute

You need [Node.js](https://nodejs.org) 22.5 or newer.

```bash
npm i -g kreft            # once: makes the `kreft` command available everywhere
kreft new my-app          # asks: JavaScript or TypeScript?
cd my-app
npm run dev
```

Open the address in the terminal (normally `http://localhost:8000`). A new project already has sign-in, registration, password reset, a dashboard and a profile page. The development database has a test user, **test@example.com** with the password **password**, for local use only.

## What is inside

| | |
|---|---|
| **The `.kreft` language** | `state`, `derive`, `action`, `watch`, `prop`, `event`, slots, stores, `saved` data, `load` for APIs, forms with validation, animations. |
| **Router** | Nested routes, layouts, guards, error pages, clean URLs. |
| **Backend** | `Route`, controllers, form requests, policies, models with relations, soft deletes and scopes, migrations, seeders, factories, jobs, mail, notifications, cache, Redis, file storage, scheduling. |
| **Authentication** | Cookie sessions with CSRF protection, API tokens with permissions, device list, two-factor codes, email verification, account lockout. |
| **Tooling** | `kreft dev` with hot reload, DevTools, an error monitor, `kreft build` (CSP-safe), prerendering, TypeScript, Vite and Electron support, a safer `kreft add`, an MCP server for AI agents. |

## Learn more

| I want to… | Read |
|---|---|
| Build my first page | [Your first app](docs/README.md#your-first-app) and [Components](docs/README.md#components-and-the-kreft-file) |
| Fetch data and handle forms | [Fetching data](docs/README.md#fetching-data), [Forms](docs/README.md#forms-and-validation) |
| Add an API and a database | [Routing](docs/README.md#routing), [Models](docs/README.md#models-and-the-database), [Migrations](docs/README.md#migrations-seeders-and-factories) |
| Understand sign-in | [Authentication](docs/README.md#authentication) |
| Go to production | [Build and deploy](docs/README.md#build-and-deploy), [Production checklist](docs/README.md#production-checklist) |
| Look up a command | [Command line](docs/README.md#command-line), then `kreft list` |

## The demo

In this repository, `npm run dev` serves live examples of every feature at **http://localhost:8000/demo/**: components, forms, loops, animations, the router and layouts, a database page, the backend, and the searchable documentation at `/demo/docs`.

## Repository layout

```text
kreft.js, kreft.d.ts    the browser runtime and its TypeScript types
server.js, server.d.ts  the backend entry point: require('kreft/server')
bin/                    the `kreft` command and the backend modules (bin/backend/)
tools/                  hot reload client, DevTools, Vite plugin
templates/app/          the project that `kreft new` creates
editors/vscode/         syntax colours and snippets for .kreft files
demo/                   the interactive demo
docs/                   the manual (README.md) and its viewer (Docs.kreft)
test/                   security regression tests: npm test
```

## Security

Views are escaped, logins use HttpOnly cookies with CSRF protection, passwords use scrypt, and `kreft dev` only answers your own computer. The manual has a [Security overview](docs/README.md#security-overview) and a [Production checklist](docs/README.md#production-checklist). Run `npm test` to run the security regression tests.

## Migrating from Som.js

Kreft is Som.js under a new name (version 3.0.0 of the `kreft` package). The old names keep working, so an existing project runs without edits. New files and everything the tools write use the new names. Move over when it suits you.

| Som.js | Kreft | Still works? |
|---|---|---|
| `npm i -g somjs` | `npm i -g kreft` | The `som` command stays as a second name for `kreft` and prints a one-line notice. |
| `som dev`, `som build`, `som make:page` … | `kreft dev`, `kreft build`, `kreft make:page` … | Yes, through the `som` command. |
| `Counter.som` | `Counter.kreft` | Yes. Both extensions compile; a name that is missing with one extension is tried with the other (`layouts/app.kreft` finds `layouts/app.som`). |
| `s-if`, `s-each`, `s-model` … (every `s-` directive) | `k-if`, `k-each`, `k-model` … | Yes. Both prefixes are read in templates. |
| `<som-view>`, `<som-link>`, `<som-wait>`, `<som-component>`, `<som-yield>`, `<som-section>`, `<som-portal>` | `<kreft-view>`, `<kreft-link>` … | Yes. Both tag names work. |
| `Som` (global object) | `Kreft` | `Som` points to the same object and is deprecated. |
| `Som.compileSom(source)` | `Kreft.compile(source)` | `compileSom` is kept as an alias. |
| `window.somDesktop` | `window.kreftDesktop` | Same object under both names. |
| `som.js`, `som.d.ts` in your project | `kreft.js`, `kreft.d.ts` | An existing `som.js` keeps working; `kreft update` rewrites it in place with the new runtime. |
| `som.config.json`, `config/som.json` | `kreft.config.json`, `config/kreft.json` | Yes: both are read (the new name wins). |
| `require('somjs/server')` | `require('kreft/server')` | Also accepted: `somjs/server`, `som/server`, `@somjs/server`. |
| `som_session`, `som_2fa`, `som_bypass` cookies | `kreft_session`, `kreft_2fa`, `kreft_bypass` | `app/Auth/Session.js` belongs to your project, so an existing project keeps its `som_` names until you edit that file. The framework's CSRF check and the maintenance-mode bypass accept both. New projects use the new names. |
| `SOM_ALLOWED_HOSTS`, `SOM_SSR`, `SOM_SSR_TTL`, `SOM_MCP_TOKEN`, `SOM_CLI`, `SOM_ELECTRON_DEVTOOLS` | `KREFT_…` with the same ending | Yes: the `KREFT_` name is read first, then the `SOM_` one. |
| `window.__SOM_ENV__`, `__SOM_DEV__`, `__SOM_LANG__`, `__SOM_VITE__` | `__KREFT_ENV__` … | Read by the runtime under both names. |
| `/__som/…` dev-server addresses | `/__kreft/…` | The dev server answers both. |
| Vite: `import som from 'somjs/vite'` | `import kreft from 'kreft/vite'` | The plugin exports `som` and `somPlugin` too, and handles `.som` files. |
| VS Code extension `.som` language | `.kreft` language | The new extension colours `.som` files as well. Run `kreft vscode` to install it. |

Kept on purpose, with a TODO for 3.1: the `som_migrations` table (renaming it would lose the migration history of every deployed database), the `som:` prefix of `saved`/`Kreft.storage` keys in `localStorage`, and the `som:queue:` / `som:delayed:` Redis keys of the queue. Renaming them needs a migration with a fallback read, so it waits for a minor release.

## License

See the `LICENSE` file once it is published. Until then, no license is granted.
