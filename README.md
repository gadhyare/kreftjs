# Som.js

**A small reactive framework with its own component language, and a full Node.js backend to go with it.**

You write components in `.som` files in plain words: `state`, `derive`, `action`. The same project also gives you routing, controllers, an Active Record ORM, migrations, queues, mail, sign-in pages with two-factor codes, and a development server with hot reload that keeps your state.

📖 **[Read the documentation](docs/README.en.md)** · run `npm run dev` and open `/demo/docs` for the searchable version.

```html
<!-- Counter.som -->
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
npm link                  # once, inside this folder: makes the `som` command available everywhere
som new my-app            # asks: JavaScript or TypeScript?
cd my-app
npm run dev
```

Open the address in the terminal (normally `http://localhost:8000`). A new project already has sign-in, registration, password reset, a dashboard and a profile page. The development database has a test user, **test@example.com** with the password **password**, for local use only.

## What is inside

| | |
|---|---|
| **The `.som` language** | `state`, `derive`, `action`, `watch`, `prop`, `event`, slots, stores, `saved` data, `load` for APIs, forms with validation, animations. |
| **Router** | Nested routes, layouts, guards, error pages, clean URLs. |
| **Backend** | `Route`, controllers, form requests, policies, models with relations, soft deletes and scopes, migrations, seeders, factories, jobs, mail, notifications, cache, Redis, file storage, scheduling. |
| **Authentication** | Cookie sessions with CSRF protection, API tokens with permissions, device list, two-factor codes, email verification, account lockout. |
| **Tooling** | `som dev` with hot reload, DevTools, an error monitor, `som build` (CSP-safe), prerendering, TypeScript, Vite and Electron support, a safer `som add`, an MCP server for AI agents. |

## Learn more

| I want to… | Read |
|---|---|
| Build my first page | [Your first app](docs/README.en.md#your-first-app) and [Components](docs/README.en.md#components-and-the-som-file) |
| Fetch data and handle forms | [Fetching data](docs/README.en.md#fetching-data), [Forms](docs/README.en.md#forms-and-validation) |
| Add an API and a database | [Routing](docs/README.en.md#routing), [Models](docs/README.en.md#models-and-the-database), [Migrations](docs/README.en.md#migrations-seeders-and-factories) |
| Understand sign-in | [Authentication](docs/README.en.md#authentication) |
| Go to production | [Build and deploy](docs/README.en.md#build-and-deploy), [Production checklist](docs/README.en.md#production-checklist) |
| Look up a command | [Command line](docs/README.en.md#command-line), then `som list` |

## The demo

In this repository, `npm run dev` serves live examples of every feature at **http://localhost:8000/demo/**: components, forms, loops, animations, the router and layouts, a database page, the backend, and the searchable documentation at `/demo/docs`.

## Repository layout

```text
som.js, som.d.ts        the browser runtime and its TypeScript types
server.js, server.d.ts  the backend entry point: require('somjs/server')
bin/                    the `som` command and the backend modules (bin/backend/)
tools/                  hot reload client, DevTools, Vite plugin
templates/app/          the project that `som new` creates
editors/vscode/         syntax colours and snippets for .som files
demo/                   the interactive demo
docs/                   the manual (README.en.md) and its viewer (Docs.som)
test/                   security regression tests: npm test
```

## Security

Views are escaped, logins use HttpOnly cookies with CSRF protection, passwords use scrypt, and `som dev` only answers your own computer. The manual has a [Security overview](docs/README.en.md#security-overview) and a [Production checklist](docs/README.en.md#production-checklist). Run `npm test` to run the security regression tests.

## License

See the `LICENSE` file once it is published. Until then, no license is granted.
