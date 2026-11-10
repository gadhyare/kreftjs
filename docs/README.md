# Start here

## Introduction

Kreft is a small reactive framework with its own component language. You write a component in a `.kreft` file: declare your state, derived values and actions in plain words, then describe the page in a `<view>`. The framework also ships a full Node.js backend (routes, controllers, models, migrations, queues, mail) so one project can cover the whole stack.

```html
<!-- Counter.kreft -->
state count = 0
derive double = count * 2
action add() { count++ }

<view>
  <button @click={add}>{count} × 2 = {double}</button>
</view>
```

### What you get

| Part | What it gives you |
|---|---|
| **The `.kreft` language** | `state`, `derive`, `action`, `watch`, props, events, slots, stores, a router with layouts and nested routes, forms with validation, animations. |
| **The backend** | `Route`, controllers, an Active Record `Model`, migrations, seeders, factories, jobs, mail, cache, file storage, policies, scheduling. |
| **Authentication** | Sign-in pages, password reset, email verification, two-factor codes, device sessions and API tokens, ready in every new project (leave them out with `--no-auth`). |
| **Tooling** | `kreft dev` with hot reload that keeps state, DevTools, an error monitor, `kreft build`, TypeScript, Vite, and targets for every platform: Electron, Tauri, iOS/Android (Capacitor), HarmonyOS and PWA. |
| **Platforms** | The web, desktop apps for macOS, Linux and Windows (Electron or Tauri), and phone apps for iOS, Android and HarmonyOS. TV apps are coming soon. See [One codebase, every screen](#one-codebase-every-screen). |
| **Security by default** | Escaped views, CSRF protection, hashed passwords, rate limits, hardened package installs. See [Security overview](#security-overview). |

### Where it runs

One project, many targets. The pages are the same `.kreft` files everywhere; only the shell around them changes.

| Target | What it is | Build it | Details |
|---|---|---|---|
| **Web** | The normal website. | `kreft build` | — |
| **PWA** | The site as an installable app that works offline. | `kreft build --pwa` | [Mobile apps (iOS and Android)](#mobile-apps-ios-and-android) |
| **Desktop — Electron** | A desktop program for Windows, macOS and Linux (ships its own browser). | `kreft new app --electron`, then `kreft electron:build` | [Desktop apps with Electron](#desktop-apps-with-electron) |
| **Desktop — Tauri** | A desktop program with installers of a few MB (uses the system web view, needs Rust). | `kreft new app --tauri`, then `kreft tauri:build` | [Desktop apps with Tauri](#desktop-apps-with-tauri) |
| **Mobile — iOS and Android** | A real app for the App Store and Google Play (a Capacitor WebView). | `kreft new app --mobile`, then `kreft mobile:build --android` | [Mobile apps (iOS and Android)](#mobile-apps-ios-and-android) |
| **Mobile — HarmonyOS** | A small native ArkTS shell with a web view for Huawei phones and tablets. | `kreft new app --harmony`, then `kreft harmony:build` | [HarmonyOS apps](#harmonyos-apps) |

- The backend never runs inside a desktop or phone app: it runs on your computer or a server, and the app reaches it with `--api-url` (or `PUBLIC_API_URL` in `.env`).
- Combine flags for one project that targets several platforms, for example `kreft new app --mobile --electron`. `--desktop` is an alias for `--electron`.

### How the docs are organised

1. **Start here** gets a project running.
2. **The Kreft language** is everything in the browser.
3. **Backend** is everything on the server.
4. **Tooling** covers the command line, building and deploying, and **Platforms** covers desktop, phone and (soon) TV apps.
5. **Security** and **Reference** are for checking details.

> [!NOTE]
> Some chapters mention a few tools by name only (for example `kreft make:model`). Run `kreft list` to see every command that your installed version has.

## Installation

### Requirements

| You need | Why |
|---|---|
| [Node.js](https://nodejs.org) **22.5 or newer** (npm comes with it) | Runs the `kreft` command, the dev server and the backend. 22.5 also gives you SQLite with nothing to install. |
| A terminal | macOS Terminal, Windows PowerShell, or any Linux shell. |
| A modern browser | Chrome, Edge, Firefox or Safari. |
| MySQL, PostgreSQL or Redis | Only if you choose them. SQLite needs nothing. |

Check your Node version:

```bash
node --version      # v22.5.0 or higher
```

### Install the command

Always ask npm for the newest version with `@latest`. Pick one way.

**1. Once, for every project (recommended).** The `kreft` command then works in any folder (the package is called `kreftjs`):

```bash
npm install -g kreftjs@latest
```

**2. Inside one project.** The version is saved in the project's `package.json`, so everyone who clones the project, your server and your CI get the same one:

```bash
npm install -D kreftjs@latest
npx kreftjs dev
```

**3. Without installing anything.** `npx` downloads Kreft, runs it and forgets it. Good for trying it out:

```bash
npx kreftjs@latest new my-app
```

> [!NOTE]
> The scripts of a new project (`npm run dev`, `build`, `serve` …) call `kreftjs`. With way 1 that is the global command. With way 2, npm finds it in the project's `node_modules` by itself. On a server where it is not installed globally, run `npm install -D kreftjs@latest` in the project before `npm run build` or `npm run serve`.

### Check that it works

```bash
kreft --version     # for example 0.0.39-beta
kreft about         # Kreft and Node.js versions, this project's settings and drivers
kreft list          # every command your version has
```

`kreftjs` is a longer name for the same command; both work.

### Set up your editor

```bash
kreft vscode
```

installs colors, snippets and Emmet for `.kreft` files in VS Code and the editors built on it (Antigravity, Cursor, Windsurf, VSCodium). Restart the editor afterwards.

Other editors have their own plugin, each with Emmet (`ul>li*3` in `<view>`, `m10` in `<style>`):

```bash
kreft editor sublime      # Sublime Text
kreft editor zed          # Zed
kreft editor jetbrains    # WebStorm, PhpStorm, IntelliJ IDEA, PyCharm, Android Studio ...
kreft editor vim          # Vim and Neovim
```

`kreft editor` alone lists them. [Editor plugins](#editor-plugins) has one part per editor: what you get, how to install it, and how to download the plugin as a file.

### Update

```bash
npm install -g kreftjs@latest      # the command (or: npm install -D kreftjs@latest inside a project)
cd my-app
kreft update --check       # what would change
kreft update --core        # refresh this app's kreftjs.js and type files (a backup is saved)
```

Every app has its own copy of the browser runtime, `frontend/kreftjs.js`. Updating the command does not touch it, so an existing app keeps its old version until you run `kreft update --core` inside it.

### Uninstall

```bash
npm rm -g kreftjs
```

### Working on Kreft itself

Run `npm link` inside the Kreft folder. The `kreft` command then runs that folder's code, and every edit shows at once. Undo it with `npm unlink -g kreftjs`.

### If something goes wrong

| What you see | What to do |
|---|---|
| `command not found: kreftjs` | npm's global folder is not on your `PATH`. Run `npm config get prefix`, add its `bin` folder to `PATH`, and open a new terminal. |
| `EACCES: permission denied` while installing | Do not use `sudo`. Install Node with [nvm](https://github.com/nvm-sh/nvm), or run `npm config set prefix ~/.npm-global` and add `~/.npm-global/bin` to `PATH`. |
| `SQLite needs Node.js 22.5 or newer` | Update Node.js. `node --version` must show 22.5.0 or higher. |
| A new project shows `Missing APP_KEY` or a database error on the first run | Run `kreft mobile:setup` (or `kreft mobile:dev`, which does it): it creates `.env` and the key, links storage and migrates. |
| The phone shows an old version of your app after you rebuilt | An older build registered a service worker that keeps serving cached files. New builds remove it by themselves, but a phone that already has it may need the app's data cleared once (Android: *App info → Storage → Clear data*, or `adb shell pm clear com.example.yourapp`) or the app uninstalled and installed again. |
| `kreft --version` shows an old number | Another copy comes first on your `PATH`. Run `which -a kreftjs` (Windows: `where kreftjs`) and remove the old one. |
| PowerShell says "running scripts is disabled" (Windows) | Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, or use Command Prompt. |
| The browser shows a blank page or "Not found: /" | Run `kreft dev` from the project's top folder (the one with `frontend/` and `backend/`). The dev server serves `frontend/`. |

Next: [Your first app](#your-first-app).

## Your first app

Create a project, move into it and start the development server:

```bash
kreft new my-app            # asks: JavaScript or TypeScript?
cd my-app
npm run dev
```

Pass `--js` or `--ts` to skip the question, and `--db sqlite` or `--ui tailwind` (also `bootstrap`, `bulma`, `pico`) to start with a database or a CSS library.

Options can be combined. For example, a Bootstrap app without login pages:

```bash
kreft new app-name --ui bootstrap --no-auth
```

More examples:

```bash
kreft new shop --db mysql --ts          # TypeScript, with a MySQL database
kreft new site --ui tailwind --no-auth  # Tailwind, no sign-in
kreft new desk --electron               # with desktop-app support
kreft new desk --tauri                  # desktop app with small installers (needs Rust)
kreft new phone --harmony               # HarmonyOS app (Huawei, needs DevEco Studio)
```

> [!NOTE]
> Write the option values exactly: `bootstrap` (not `bootstap`), `tailwind`, `bulma` or `pico`. Any other value stops with a message that lists the allowed ones.

A new app comes with login, registration, password reset, email verification, a profile and an admin area. It asks whether you want them; pass `--auth` or `--no-auth` to skip the question. `--no-auth` starts a plain site: the welcome page, the docs, the error monitor and the tests (and the Todos example with `--db`), with no users table, sessions or sign-in pages.

Open the address the terminal shows (normally `http://localhost:8000`). If that port is busy, the next free one is used.

The new project already has a working login page. `npm run dev` creates the tables and a test user, **test@example.com** with the password **password**. Emails (verify, reset) are printed in the terminal until you set `MAIL_URL`.

> [!WARNING]
> The test user is for local development only. Delete it, or never run `--seed` against a real database.

### The smallest possible app

You can use Kreft without any project at all. An app is an HTML page plus `.kreft` files:

```html
<!-- index.html -->
<div id="app"></div>
<script src="kreftjs.js"></script>
<script>
  Kreftjs.app('App.kreft').mount('#app')
</script>
```

```html
<!-- App.kreft -->
state name = 'World'

<view>
  <h1>Hello {name}</h1>
  <input k-model="name">
</view>
```

> [!WARNING]
> `.kreft` files need a web server. Browsers refuse to load files from `file://`, so always open your app through `npm run dev` or any other server.

## Project structure

`kreft new` creates two folders that never mix: `frontend/` is what browsers receive, `backend/` is the server and is never reachable over HTTP.

```text
my-app/
├── frontend/
│   ├── index.html          entry point
│   ├── App.kreft             root component and router container
│   ├── routes/web.kreft      page routes
│   ├── layouts/            app.kreft (signed in), guest.kreft (sign-in pages)
│   ├── pages/              one .kreft file per screen, auth/ for sign-in pages
│   ├── components/         reusable pieces
│   ├── ui.css              the design system
│   └── tests/              component tests
├── backend/
│   ├── config/             app.js, auth.js, database.js, redis.js, session.js
│   ├── app/
│   │   ├── Http/           Controllers, Middleware, Requests, Resources
│   │   ├── Models/         User, PersonalAccessToken
│   │   └── Auth/           session helpers
│   ├── database/           migrations, seeders, factories
│   └── routes/             api.js, auth.js, console.js
├── .env                    secrets and settings (never commit it)
├── package.json
└── kreftjs.config.json         CLI options
```

### Why the two folders matter

- `kreft dev` and `kreft build` serve only `frontend/`. The `backend/` folder, database files and `.env` have no web address.
- On macOS and Linux `kreft new` gives `backend/` and `.env` permissions that only the owner can read.
- Files such as `.env`, `*.db`, `*.pem`, `package.json` and `kreftjs.config.json` are refused even if requested by name.

### Adding a CSS library

Any CSS library works. Add its `<link>` to `index.html`, or install it and import the file from a `.kreft` file; it becomes a `<link>` added once, and `kreft build` copies it (with its fonts and images) into `dist/vendor/`.

```html
import 'bootstrap/dist/css/bootstrap.min.css'   // npm i bootstrap
import './theme.css'                            // your own file, next to this .kreft file
```

### npm packages in the browser

Install a package with `kreft add`, then import it in any `.kreft` file:

```bash
kreft add dayjs nanoid lodash
kreft add -D esbuild      # once per project: it prepares packages for the browser
```

```html
import dayjs from 'dayjs'
import { nanoid } from 'nanoid'

state id = nanoid()

<view>
  <p>{dayjs().format('YYYY-MM-DD')}</p>
</view>
```

`kreft dev` serves each package as one browser-ready file and tells the browser where it is with an import map. Old-style packages (`module.exports`, such as lodash) work too.

# The Kreft language

## Components and the .kreft file

A `.kreft` file has three parts:

1. **The script**: everything outside `<view>` and `<style>`. Each line starts with a keyword.
2. **`<view>`**: the HTML of the component.
3. **`<style>`** (optional): CSS. Add `scoped` so it applies only to this component.

### Keywords

| Keyword | Example | Meaning |
|---|---|---|
| `state` | `state count = 0` | A value that can change. When it changes, the view updates. |
| `derive` | `derive double = count * 2` | A value calculated from other values. It updates by itself. |
| `action` | `action add(n) { count += n }` | A function you call from the view or from other actions. |
| `when` | `when count > 10 { … }` | Runs the block each time the condition becomes true. |
| `watch` | `watch count { … }` | Runs each time the value changes. Inside, `value` is the new value and `old` the previous one. |
| `on` | `on ready { … }` | Lifecycle: `on start`, `on ready`, `on update`, `on show`, `on hide`, `on destroy`. |
| `prop` | `prop start = 0` | A value the parent passes in. The value after `=` is the default. |
| `event` | `event save, remove` | Events this component sends to its parent with `send('save', data)`. |
| `use` | `use cart` | Use a shared store. `use mouse = trackMouse()` uses shared logic from a `.js` file. |
| `share` / `receive` | `share theme = 'dark'` | Give a value to everything inside this component / take a value a parent shared. |
| `import` | `import Card from './Card.kreft'` | Use another component or a JavaScript module. |
| `saved` | `saved todos = []` | Like `state`, but kept in the browser (localStorage). |
| `load` | `load users = api.get('/api/users')` | Loads data and gives `users.data`, `users.loading`, `users.error`, `users.reload()`. |

Inside the script you use names **directly**: write `count++`, not `this.count++`.

### A complete example

```html
<!-- TodoPage.kreft -->
state todos = []
state text = ''

derive remaining = todos.filter((t) => !t.done).length

action add() {
  if (!text.trim()) return
  todos.push({ id: Date.now(), text, done: false })
  text = ''
}

action clearDone() {
  todos = todos.filter((t) => !t.done)
}

when todos.length && remaining === 0 {
  bus.send('toast', 'All done!')
}

<view>
  <form @submit.prevent={add}>
    <input k-model="text" placeholder="New todo">
  </form>
  <label k-each="todo in todos" k-key="todo.id">
    <input type="checkbox" k-model="todo.done"> {todo.text}
  </label>
  <p>{remaining} left · <button @click={clearDone}>Clear done</button></p>
</view>
```

### Good to know

- An `action` that uses `await` becomes async automatically.
- A line that does not start with a keyword is normal JavaScript (`let timer`, `const max = 10`). Your actions can use it, but the view cannot. Use `state`, `derive` or `action` for anything the view needs.
- Every Kreft function is available in the script: `bus`, `store`, `signal`, `watch`, `tick`, `send`, `props`, `$route`, `$router`.
- Errors name the file and line, for example `"state" needs a name, like: state count = 0 (Bad.kreft, line 3)`.

### Lifecycle

| Hook | Runs |
|---|---|
| `on start` | Before the component is shown. Good for first data. |
| `on ready` | The component is on the screen. |
| `on update` | After the view changed. |
| `on show` / `on hide` | A [kept](#keep-and-wait) component comes back / is put away. |
| `on destroy` | The component is being removed. Clean up here. |

## Templates and directives

### Showing values

```html
<h1>Hello {name}</h1>
<p>{count} items · total {total.toFixed(2)}</p>
<p>{isAdmin ? 'Admin' : 'User'}</p>
```

Values are always escaped, so they are safe to show. To show a literal `{`, write `\{`.

### Attributes

```html
<img src={user.photo} alt={user.name}>         <!-- the value as it is -->
<button disabled={count === 0}>Reset</button>   <!-- false removes the attribute -->
<div class="card {active ? 'on' : ''}">         <!-- build a text -->
<a href="/users/{user.id}">Profile</a>
```

`:class` and `:style` also accept objects: `:class="{ done: todo.done }"`.

### Events

```html
<button @click={add}>Add</button>
<button @click="add(5)">Add 5</button>
<input @input="search($event.target.value)">
<form @submit.prevent={save}>
<input @keyup.enter={send}>
```

Modifiers: `.prevent` `.stop` `.self` `.once` `.capture` `.passive`. Keys: `.enter` `.esc` `.space` `.tab` `.up` `.down` `.ctrl` `.shift` `.alt` `.meta` `.exact`.

### Directives

| Directive | What it does |
|---|---|
| `k-if` / `k-elif` / `k-else` | Adds or removes the element. |
| `k-match="value"` + `k-case` / `k-default` on its children | Shows the child whose `k-case` equals the value. See [Choosing with k-match](#choosing-with-k-match). |
| `k-each="item in list"` + `k-key="item.id"` | Repeats the element. Also `(item, i) in list`, `(value, key) in object`, `n in 10`. |
| `k-model="name"` | Two-way binding for input, textarea, select, checkbox and radio. Modifiers `.trim` `.number` `.lazy`. |
| `k-show` | Hides with CSS instead of removing. |
| `k-text` / `k-html` | Sets text, or HTML. `k-html` is cleaned of scripts and event handlers, but only bind HTML you trust. |
| `k-ref="box"` | Gives you the element: `state box = null` receives it. |
| `k-skip` | Leaves the element as it is (for code samples that contain `{ }`). |
| `k-once` | Draws the element once and never updates it. |
| `k-memo="[a, b]"` | Updates the element only when `a` or `b` changes. |
| `k-animate="fade"` | Animates the element when it comes and goes. |
| `<template k-if>` / `<template k-each>` | Groups elements without a wrapper. |
| `<kreft-component :is="name">` | Shows a component chosen while the app runs. |
| `<kreft-portal to="body">` | Renders content somewhere else (modals, toasts). |

### Loops

```html
<ul>
  {for user in users key user.id}
    <li>{user.name}</li>
  {empty}
    <li>No users yet</li>
  {/for}
</ul>
```

- `key user.id` is optional; it lets Kreft keep and move the right rows.
- `{empty}` is optional and shows when the list is empty.
- `{for (user, i) in users}` gives the index, `{for (value, key) in object}` walks an object, `{for n in 5}` counts 1 to 5.
- `k-each` on an element does the same: `<li k-each="user in users" k-key="user.id">`.

### Animations

```html
<p k-if="open" k-animate="fade">Hello</p>
<div k-show="menu" k-animate="slide">…</div>

<ul>
  {for item in items key item.id animate slide}
    <li>{item.name}</li>
  {/for}
</ul>
```

`k-animate` works with `k-if`, `k-show`, loops, `<kreft-component>` and `<kreft-view>`. Ready-made: `fade`, `slide`, `scale`, `pop`.

Your own animation is CSS with these classes (replace `name`):

| Class | When |
|---|---|
| `name-in` | The whole time it comes in (put the `transition` here). |
| `name-in-from` | The first moment: where it comes from. |
| `name-out` | The whole time it goes out. |
| `name-out-to` | Where it goes to. |
| `name-move` | A list item moving to its new place. |

```css
.drop-in, .drop-out { transition: all .3s ease }
.drop-in-from { opacity: 0; transform: translateY(-30px) }
.drop-out-to  { opacity: 0; transform: translateX(60px) }
```

- Kreft waits for the longest `transition` or `animation` before removing the element.
- `k-animate.after` lets the old element leave before the new one comes in.
- Nothing animates when the page first opens; add `.first` to animate then too.

### Faster views

Kreft already changes only the exact text or attribute that changed. For very large pages:

```html
<footer k-once>Opened at {openedAt}</footer>

{for row in rows key row.id}
  <tr k-memo="[row.id === selected]" class={row.id === selected ? 'on' : ''}>…</tr>
{/for}
```

With `k-memo`, picking another row redraws two rows, not all of them.

### Your own directives

```js
app.directive('focus', {
  ready(el, binding) { el.focus() },
  update(el, binding) {},
  destroy(el, binding) {},
})
```

```html
<input k-focus>
<div k-tooltip:top={message}></div>   <!-- binding.arg = 'top', binding.value = message -->
```

### Choosing with k-match

When one value decides what to show, `k-match` reads better than a chain of `k-if` / `k-elif`:

```html
<div k-match="status">
  <b k-case="'ok'">Done</b>
  <i k-case="'wait', 'queued'">Waiting</i>
  <u k-default>Unknown</u>
</div>
```

- The comparison is strict (`===`). Several values in one `k-case` (separated by commas) mean "one of these".
- Only the first matching case shows. `k-default` shows when none match; put it last.
- The children are turned into `k-if` / `k-elif` / `k-else`, so components, `<template>` and `k-animate` work on them as usual.

### Pipes

Pass a value through a pipe with `|` to format it, instead of calling helper functions in the view:

```html
<p>{price | currency:'EUR'}</p>
<p>{createdAt | ago}</p>
<p>{title | capitalize | truncate:30}</p>
<a title={name | upper}>{tags | join:' · '}</a>
```

- Arguments follow a colon (`truncate:30`, `currency:'EUR'`) or sit in parentheses (`number(2)`). Pipes run left to right.
- `||`, `|=` and a `|` inside a string, a regular expression or brackets are not pipes.
- Numbers, currency and dates follow the app's language (`Kreftjs.locale`).

| Pipe | Result |
|---|---|
| `upper` `lower` `capitalize` `trim` | Text case and spaces. |
| `truncate:n` | Cuts text to `n` characters and adds `…`. |
| `currency:'USD'` | `$1,234.50`, in the current language. |
| `number:digits` `percent:digits` | `1,234.5`, `45%` (0.45). |
| `date:'short'` `time` | `short`, `medium` (default), `long`, `full`; or an `Intl.DateTimeFormat` options object. |
| `ago` | `3 hours ago`, `in 2 days`. A date like `2026-11-05 15:39:58` from the Kreft database is read as UTC. |
| `bytes` | `1.5 KB`. |
| `json` | Pretty-printed JSON, for debugging. |
| `fallback:'n/a'` | The value, or the fallback when it is empty. |
| `join:sep` `first` `last` `slice:a:b` `reverse` `sortBy:'key':'desc'` `count` | Lists. |

**Your own pipe.** Any function in the component works as a pipe, and wins over a built-in with the same name:

```html
const wrap = (value, left = '«', right = '»') => left + value + right

<view><p>{name | wrap}</p> <p>{name | wrap:'[':']'}</p></view>
```

For the whole app: `Kreftjs.pipe('shout', (value) => String(value).toUpperCase() + '!')`.

> `a | b` used to be a bitwise OR. In a view it is now a pipe; write bit operations inside a function in the script.

## Props, events and slots

### Using a component

Register it once by its path, or import it where you need it:

```js
Kreftjs.app('App.kreft')
  .component('UserCard', 'components/UserCard.kreft')
  .mount('#app')
```

```html
import UserCard from './UserCard.kreft'

<view>
  <user-card name="Alice Smith" age={30}></user-card>
</view>
```

In the view, write component names in **kebab-case** (`<user-card>`).

### Props: parent to child

```html
<!-- UserCard.kreft -->
prop name
prop age = 0
prop admin = false

<view>
  <div class="card">{name} ({age}) <b k-if="admin">admin</b></div>
</view>
```

```html
<user-card name="Alice Smith" age={30} admin></user-card>
```

The default's type decides how plain text attributes are read: `age="30"` becomes the number `30`, and `admin` with no value becomes `true`. A child cannot change a prop; send an event instead.

### Typed props

Write the type the way TypeScript does. A wrong value, or a missing required prop, warns while you develop (in `kreft dev` and in a built app's console):

```html
prop tone: 'info' | 'warn' = 'info'   // only these values; 'info' when not given
prop label: string                     // required: leaving it out warns
prop count?: number                    // optional
prop items: string[] = []
prop onSave: (id: number) => void
```

- Checked: `string` `number` `boolean` `null` `undefined` `object` `Date`, `T[]`, functions, literal values (`'sm'`, `3`, `true`) and unions of them. Your own type names (`User`), `any` and `unknown` are not checked.
- A prop is required when it has no default, no `?` and its type has no `null` / `undefined`.
- `number`, `boolean` and `string` also decide how a plain attribute is read: `count="5"` becomes `5`.


### Events: child to parent

```html
<!-- TodoItem.kreft -->
prop todo
event remove

<view>
  <li>{todo.text} <button @click="send('remove', todo.id)">✕</button></li>
</view>
```

```html
<!-- parent -->
action removeTodo(id) { todos = todos.filter((t) => t.id !== id) }

<view>
  <todo-item k-each="t in todos" k-key="t.id" todo={t} @remove={removeTodo}></todo-item>
</view>
```

### `k-model` on a component

```html
<!-- Toggle.kreft -->
prop modelValue = false
event update:modelValue

<view>
  <button @click="send('update:modelValue', !modelValue)">{modelValue ? 'On' : 'Off'}</button>
</view>
```

```html
<toggle k-model="darkMode"></toggle>
```

Named models: `k-model:title="pageTitle"` uses `prop title` and the event `update:title`.

### Slots

```html
<!-- Card.kreft -->
prop items = []

<view>
  <div class="card">
    <header><slot name="header">Default title</slot></header>
    <slot></slot>
    <li k-each="item in items"><slot name="item" item={item}>{item}</slot></li>
  </div>
</view>
```

```html
<card items={users}>
  <template k-slot:header>Users</template>
  <p>Body content</p>
  <template k-slot:item="{ item }"><b>{item.name}</b></template>
</card>
```

### Styles

- `<style>` applies to the whole page.
- `<style scoped>` applies only to this component.
- `.parent :deep(.child)` reaches into child components from scoped CSS.
- Attributes such as `class` that you put on a component tag land on its root element.

### Keep and wait

**Keep** puts a component away instead of removing it. Typed text, scroll position and state are all still there when it returns:

```html
<kreft-component :is="tab" keep></kreft-component>
<kreft-view keep></kreft-view>
<kreft-view keep="5"></kreft-view>   <!-- keep at most 5; the one used longest ago goes -->
```

```html
on show { timer.start() }   <!-- it came back (also the first time) -->
on hide { timer.stop() }    <!-- it was put away -->
```

**Wait** shows a placeholder until everything inside is ready (lazy components, every `load`, every `on start` that awaits):

```html
<kreft-wait>
  <user-profile id={5}></user-profile>
  <p k-waiting>Loading…</p>
  <p k-failed="error">Could not load: {error.message}</p>
</kreft-wait>
```

## Sharing state

| Need | Use |
|---|---|
| Parent to child | `prop` |
| Child to parent | `event` + `send()`, or `k-model` |
| Many components, anywhere | stores: `Kreftjs.store()` + `use` |
| A parent to everything inside it | `share` / `receive` |
| "Something happened" messages | `bus.send()` / `bus.on()` |

### Stores

Create a store once in your page's script:

```js
Kreftjs.store('cart', {
  items: [],
  get count() { return this.items.length },
  get total() { return this.items.reduce((s, p) => s + p.price, 0) },
  add(product) { this.items.push(product) },
})
```

Use it in any `.kreft` file. Every component sees the same data:

```html
use cart

<view>
  <span>Cart: {cart.count} · {cart.total}</span>
  <button @click="cart.add(product)">Add</button>
</view>
```

Every store also has `$patch` (change several values at once), `$reset()` (back to the start) and `$watch(fn)` (runs on every change and stops by itself when the component goes away).

### Shared logic

Logic that many components need goes in a `.js` file as a function. It can use `Kreftjs.state`, `Kreftjs.watch`, `Kreftjs.onDestroy` and the rest:

```js
// logic/mouse.js
export function trackMouse() {
  const pos = Kreftjs.state({ x: 0, y: 0 })
  const move = (e) => { pos.x = e.clientX; pos.y = e.clientY }
  window.addEventListener('pointermove', move)
  Kreftjs.onDestroy(() => window.removeEventListener('pointermove', move))
  return pos
}
```

```html
import { trackMouse } from '../logic/mouse.js'
use mouse = trackMouse()

<view><p>{mouse.x}, {mouse.y}</p></view>
```

### Share and receive

```html
<!-- Layout.kreft -->
state settings = { theme: 'dark', lang: 'so' }
share settings = settings

<!-- any component inside it, however deep -->
receive settings

<view><p>Theme: {settings.theme}</p></view>
```

Share a `state` object and every receiver updates when it changes. `Kreftjs.app(…).share('key', value)` shares with the whole app.

### Event bus

```html
<!-- sending -->
action save() { bus.send('toast', 'Saved!') }

<!-- listening -->
state message = ''
on ready { bus.on('toast', (text) => (message = text)) }
```

Listeners added in `on start` or `on ready` are removed automatically when the component goes away. Others stay until you call `bus.off('toast', fn)`.

## Saving data in the browser

Write `saved` instead of `state` and the value is kept in localStorage. It survives reloads and closing the browser.

```html
saved todos = []
saved theme = 'light'
saved token = '' as 'auth.token'    <!-- choose the storage key yourself -->
```

- Every change is saved by itself, including deep ones: `todos.push(…)`, `todo.done = true`.
- The default key is `<Component>.<name>`, for example `Home.todos`. Use `as '…'` to share one value between components.
- A change made in another tab of the same site shows up in this tab too.

A store keeps its plain values when you add `saved`:

```js
Kreftjs.store('cart', { items: [] }, { saved: true })            // or { saved: ['items'] } for some fields
```

From JavaScript:

```js
const theme = Kreftjs.saved('theme', 'light')    // a signal: theme.value = 'dark' is saved
Kreftjs.storage.set('user', { name: 'Alice Smith' })
Kreftjs.storage.get('user')
Kreftjs.storage.remove('user')
Kreftjs.storage.clear()                          // removes only what Kreft saved
```

> [!WARNING]
> localStorage belongs to one browser on one site, holds about 5 MB and can be read by anyone using that browser, and by any script that runs on your page. Never store passwords or long-lived secrets in it.

## Router and layouts

### Defining routes

```js
const router = Kreftjs.router({
  routes: [
    { path: '/', component: 'pages/Home.kreft', meta: { title: 'Home' } },
    { path: '/users/:id', name: 'user', component: 'pages/User.kreft', props: true },
    { path: '/posts/:slug?', component: 'pages/Posts.kreft' },
    { path: '/old', redirect: '/' },
    { path: '/admin', component: 'pages/Admin.kreft', guard: () => isAdmin() || '/login' },
    { path: '*', component: 'pages/NotFound.kreft' },
  ],
})

Kreftjs.app('App.kreft').use(router).mount('#app')
```

```html
<!-- App.kreft -->
<view>
  <nav>
    <kreft-link to="/">Home</kreft-link>
    <kreft-link to="/users/{user.id}">Profile</kreft-link>
  </nav>
  <kreft-view></kreft-view>
</view>
```

With `props: true`, the `:id` parameter arrives as a prop:

```html
<!-- pages/User.kreft -->
prop id
derive user = users.find(id)
action back() { $router.back() }
```

| Feature | How |
|---|---|
| Current route | `$route.path`, `$route.params.id`, `$route.query.tab`, `$route.meta` |
| Navigate | `$router.go('/users/5?tab=info')`, `$router.replace(to)`, `$router.back()` |
| Active link | The `kreft-link-active` and `kreft-link-exact` classes |
| Page title | `meta: { title: '…' }` |
| Check before every page | `router.before((to, from) => …)`. Return `false` to stop, or a path to go elsewhere. |
| Check one route | `guard: (to, from) => …` |
| After every page | `router.after((to, from) => …)` |

Each page file is loaded the first time someone opens it.

### Route files

New projects keep their pages in `frontend/routes/web.kreft`, and `index.html` only points to it:

```js
Kreftjs.router({
  routes: ['routes/web.kreft', 'routes/shop.kreft'],
  layout: 'app',
  errors: 'errors',
  middleware: {
    auth: (to) => (auth.user ? true : '/login?redirect=' + encodeURIComponent(to.fullPath)),
    guest: () => (auth.user ? '/dashboard' : true),
  },
})
```

```js
// routes/web.kreft
Route.view('/', 'pages/Home.kreft').name('home').title('Home')
Route.view('/posts/:id', 'pages/Post.kreft')

Route.middleware('auth').group(() => {
  Route.view('/dashboard', 'pages/Dashboard.kreft').middleware('verified')
})

Route.layout('guest').middleware('guest').group(() => {
  Route.view('/login', 'pages/auth/Login.kreft').title('Log in')
})

Route.prefix('/account').name('account.').middleware('auth').group(() => {
  Route.view('/settings', 'pages/account/Settings.kreft').children(() => {
    Route.view('', 'pages/account/General.kreft')       // /account/settings
    Route.view('mail', 'pages/account/Mail.kreft')      // /account/settings/mail
  })
})

Route.redirect('/home', '/')
Route.fallback('pages/NotFound.kreft')
```

| On a route | What it does |
|---|---|
| `.name('home')` | `$router.go({ name: 'home' })` |
| `.title('Home')` | The page title. |
| `.layout('guest')`, `.layout('none')` | Another layout, or none. |
| `.middleware('auth', 'role:editor')` | Runs these before the page. |
| `.meta({ … })` | Anything else, in `$route.meta`. |
| `.children(() => …)` | Nested pages, shown in the page's own `<kreft-view>`. |

> [!NOTE]
> Client-side `auth` middleware only decides which screens to show. It does not protect data: every API route must check the user on the server.

### Layouts

A layout is the frame around your pages: bar, menu, footer. Put it in `layouts/` and use `<slot>` where the page goes.

```html
<!-- layouts/app.kreft -->
state menuOpen = false

<view>
  <header>…</header>
  <main><slot></slot></main>
</view>
```

| Where | What you write |
|---|---|
| Every page | `Kreftjs.router({ layout: 'app', routes })` |
| One route and its children | `{ path: '/admin', component: …, layout: 'admin' }` |
| Inside a page file | `layout admin` on its own line |
| No layout | `layout: false` on the route, or `layout none` in the page |

When more than one applies, the route wins, then the page file, then the router. Going between two pages that use the same layout keeps the layout on screen, with its state.

A page can also fill other places in its layout:

```html
<!-- in the layout -->
<kreft-yield name="actions">shown when the page has no such section</kreft-yield>

<!-- in the page -->
<kreft-section name="actions">
  <button class="primary" @click="save()">Save</button>
</kreft-section>
```

### Error pages

Each HTTP error can have its own page in `errors/`. Turn them on with `errors: 'errors'` in the router. New projects already have the folder (`kreft make:errors` adds it to an older one):

```text
errors/401.kreft 402.kreft 403.kreft 404.kreft 419.kreft 429.kreft 500.kreft 503.kreft
errors/error.kreft      any other status
errors/minimal.kreft    the shared frame
```

An unknown address shows `errors/404.kreft`; a page that cannot load shows `errors/500.kreft`. From any `.kreft` file, `abort(404)` (also `$router.abort()` and `Kreftjs.abort()`) shows the matching page:

```html
prop id
load post = api.get('/api/posts/' + id)
watch post.error { if (post.error && post.error.status === 404) abort(404) }
```

### Clean URLs

By default the router uses URLs without `#` (`/users/5`). Two things make that work:

1. A `<base href="/">` tag in `index.html` (use `<base href="/demo/">` if the app lives in a folder).
2. The server must send `index.html` for every page path, so reloading `/users/5` is not a 404. `npm run dev` does this for you.

If you cannot change the server, use `mode: 'hash'`; URLs then look like `/#/users/5`.

## Fetching data

The global `api` client is available in every `.kreft` file, and `Kreftjs.api` in plain JavaScript:

```js
const users = await api.get('/api/users', { query: { page: 2 } })
const user  = await api.post('/api/users', { name: 'Alice Smith' })
await api.put('/api/users/1', user)
await api.patch('/api/users/1', { status: 'active' })
await api.delete('/api/users/1')
```

### Loading data: `load`

`load` declares a reactive resource. It handles the loading state, the error, and fetches again when the values it reads change:

```html
<!-- pages/Posts.kreft -->
state query = ''
state page = 1

load posts = api.get('/api/posts', { query: { q: query || undefined, page } })

<view>
  <input type="search" k-model.lazy="query" placeholder="Search posts…">

  <p k-if="posts.loading">Loading posts…</p>
  <div k-elif="posts.error">
    Failed to load: {posts.error.message}
    <button @click={posts.reload}>Try again</button>
  </div>
  <div k-else>
    {for post in posts.data || [] key post.id}
      <article><h3>{post.title}</h3><p>{post.body}</p></article>
    {empty}
      <p>No posts found for "{query}".</p>
    {/for}
  </div>

  <button @click={() => page++}>Next page ({page})</button>
</view>
```

| Property | Meaning |
|---|---|
| `posts.data` | The result (`null` until loaded). |
| `posts.loading` | `true` while a request is running. |
| `posts.loaded` | `true` once the first answer arrived. |
| `posts.error` | The error, or `null`. |
| `posts.reload()` | Fetch again now. |

### Tables

For tables served by `kreft dev --db` or the automatic table API, `table(name)` gives ready-made calls:

```html
const posts = table('posts')

load list = posts.all({ q: search, _sort: '-created_at', _limit: 10 })

action createPost() {
  const created = await posts.create({ title: 'New article' })
  list.data = [created, ...list.data]
}
```

Methods: `all(query)`, `find(id)`, `count(query)`, `create(data)`, `update(id, data)` (PUT), `patch(id, data)`, `remove(id)`.

### Errors

A failed request throws an `ApiError` with `status`, `message`, `data` and `errors` (validation messages). Network problems and timeouts have `status` 0.

```html
state errors = {}

action save() {
  try {
    await api.post('/api/users', form)
  } catch (e) {
    errors = e.errors || {}      // { email: ['The email has already been taken.'] }
  }
}
```

### Settings

```js
Kreftjs.api.setup({
  base: '/api',                               // then api.get('users') is /api/users
  token: () => Kreftjs.storage.get('token'),      // sent as Authorization: Bearer …
  headers: { 'Accept-Language': 'en' },
  timeout: 10000,
})

Kreftjs.api.onError((e) => { if (e.status === 401) location.href = '/login' })

const github = Kreftjs.api.create({ base: 'https://api.github.com' })    // a second client
```

Options for one request: `query`, `headers`, `timeout`, `signal` (to cancel) and `full: true` (returns `{ data, status, headers }`).

Requests to your own backend also send `X-XSRF-TOKEN` from the `XSRF-TOKEN` cookie (and `X-CSRF-TOKEN` from `<meta name="csrf-token">`), plus `X-Requested-With`.

### A practice API

```bash
kreft dev --api db.json              # a REST API at /api, made from a JSON file
kreft dev --api db.json --delay 500  # answer slowly, to see loading states
```

It gives GET and POST on `/api/posts`, GET, PUT, PATCH and DELETE on `/api/posts/1`, search with `?q=text`, filters with `?field=value`, and standard paging and sorting.

> [!WARNING]
> `--api` and `--db` are for development. They have no login. `kreft dev` answers only your own computer, and refuses requests that change data when they come from another web site, but do not expose them to the internet. In production, write real routes (see [Routing](#routing)).

## Forms and validation

Give a form its rules in declarative style. A form with mistakes is never sent:

```html
state post = form({ title: '', email: '' }, { title: 'required|min:3|max:120', email: 'required|email' })

action save() {
  const created = await post.$submit((values) => api.post('/api/posts', values))
  if (created) post.$reset()
}

<view>
  <form @submit.prevent={save}>
    <input k-model="post.title">
    <p k-if="post.$error('title')" class="error">{post.$error('title')}</p>
    <button disabled={post.$busy}>Save</button>
  </form>
</view>
```

| On the form | What it is |
|---|---|
| `post.title`, `post.email` | The values, for `k-model`. |
| `post.$error('title')` | The first message for a field, or `''`. |
| `post.$errors` | Every message: `{ title: ['…'] }`. |
| `post.$valid`, `post.$busy` | No mistakes / sending right now. |
| `post.$submit(send)` | Checks, then calls `send(values)`. A 422 from the server fills the same errors. Gives `false` when it did not send. |
| `post.$check()`, `post.$reset(values?)`, `post.$setErrors(e)` | Check now / start again / show errors from elsewhere. |

Errors appear after the first submit, then follow your typing.

Without a form, `validate(values, rules)` gives `{}` or `{ field: ['…'] }`. Custom messages go in the third argument: `form(values, rules, { messages: { 'title.required': 'Write a title.' } })`.

The same rule names work on the server in `req.validate()` (see [Controllers and requests](#controllers-and-requests)), so one set of rules can describe both sides.

### Passwords

`not_common_password` refuses a password that is among the most used ones (`password`, `12345678`, `qwertyuiop` …), one character repeated (`aaaaaaaa`), a plain run (`12345678`, `abcdefgh`), or the same as the email address. A new app uses it next to `min:8` when people register, reset or change a password, in the pages and in the controllers:

```js
password: 'required|min:8|confirmed|not_common_password'
```

It is a short list that runs offline, with no service called, so it catches the worst choices and nothing more. For longer ones, raise `min` (a passphrase of four words beats a short mix of symbols). Change the message in `lang/en/validation.json` (`not_common_password`).

## Internationalization and RTL

Kreft translates text and flips direction for right-to-left languages such as Arabic, Hebrew, Persian and Urdu.

### Translations

Put translation files in a `lang/` folder: `lang/` or `frontend/lang/` in your project (`backend/lang/` and `resources/lang/` are read too). Use `lang/en.json` for plain strings, or `lang/en/messages.json` for grouped keys. In any view:

```html
<h1>{$t('messages.welcome', { name: user.name })}</h1>
<p>{$choice('messages.apples', count)}</p>
```

A message uses `:name` for values. For plurals, separate the forms with `|`: `{0} No apples|{1} One apple|[2,*] :count apples`. Under the hood, categories use the browser's `Intl.PluralRules` for the current locale.

Change the language with `Kreftjs.locale('ar')`. The page's `<html lang>` and `dir` update, and every view re-renders. `Kreftjs.fallbackLocale('en')` sets the fallback, `Kreftjs.locales()` lists loaded languages, and `Kreftjs.translations('so', { … })` registers more text from code.

### Direction

`dir` is set for you from the locale, and you can also bind it by hand:

```html
<view dir={isArabic ? 'rtl' : 'ltr'}>…</view>
```

### Write CSS that flips by itself

Use CSS logical properties instead of left/right:

| Avoid | Use |
|---|---|
| `margin-left` / `margin-right` | `margin-inline-start` / `margin-inline-end` |
| `padding-left` / `padding-right` | `padding-inline-start` / `padding-inline-end` |
| `left: 0` / `right: 0` | `inset-inline-start: 0` / `inset-inline-end: 0` |
| `text-align: left` / `right` | `text-align: start` / `end` |
| `border-left` / `border-right` | `border-inline-start` / `border-inline-end` |

```css
.sidebar {
  position: fixed;
  inset-inline-start: 0;           /* left in LTR, right in RTL */
  padding-inline-start: 24px;
  border-inline-end: 1px solid var(--border);
}

[dir="rtl"] .back-arrow { transform: scaleX(-1); }    /* flip an icon */
```

On the server, request language comes from `?lang=`, the `lang` cookie or `Accept-Language`, and backend messages live in `backend/lang/<locale>/`.

## Using Kreft from JavaScript

You can write components as plain objects. The rules match the `.kreft` language: values are state, getters are derived values, functions are actions.

```js
Kreftjs.app({
  count: 0,
  get double() { return this.count * 2 },
  add() { this.count++ },
  template: `<button @click={add}>{count} × 2 = {double}</button>`,
}).mount('#app')
```

| JavaScript | Same as in `.kreft` |
|---|---|
| `Kreftjs.state({ … })` | `state` + `derive` + `action` together, for code outside components. |
| `Kreftjs.signal(0)` | One value, read and written with `.value`. |
| `Kreftjs.derived(() => …)` | `derive` |
| `Kreftjs.watch(source, (value, old) => …)` | `watch` |
| `Kreftjs.effect(() => …)` | Runs again whenever what it reads changes. |
| `Kreftjs.tick()` | Wait until the page has updated. |

`Kreftjs.render(view, data)` turns a view and data into an HTML string, with every directive working and every value escaped. Use it for emails and print views:

```js
Kreftjs.render(`<ul><li k-each="u in users">{u}</li></ul>`, { users: ['Alex', 'Alice'] })
// <ul><li>Alex</li><li>Alice</li></ul>
```

### Server templates

Blade and similar engines use `{{ }}`; Kreft uses `{ }`, so they do not clash. Put `kreftjs.js` and your `.kreft` files in your public folder and mount as usual.

# Backend

## Routing

A project made with `kreft new` has a Node.js backend. `kreft dev` and `kreft serve` load `backend/routes/api.js` by themselves, every address in it starts with `/api`, and `kreft dev` picks up each change you save. The backend folder never reaches the browser.

```js
// routes/api.js
const { Route } = require('kreftjs/server')
const PostController = require('../app/Http/Controllers/PostController')

Route.get('/hello', (req) => ({ hello: req.input('name', 'world') }))      // GET /api/hello

Route.apiResource('posts', PostController)    // index, store, show, update, destroy
Route.get('/posts/{post}/comments', [PostController, 'comments']).name('posts.comments')

Route.middleware('auth').group(() => {
  Route.delete('/posts/{post}', [PostController, 'destroy'])
})

Route.prefix('admin').middleware(['auth', 'admin']).group(() => { … })
```

- Parameters are written `{post}`, or `{post?}` when optional.
- A route can have a name (`.name('…')`), a pattern (`.whereNumber('id')`) and middleware (`.middleware('auth')`).
- `kreft route:list` prints every route with its name, controller and middleware.

### Namespaces

PHP-style namespaces are supported for controllers, models and relations:

```js
const { Route, use, namespace } = require('kreftjs/server')

const User = use('App\\Models\\User')
const { DashboardController, UserController } = namespace('App\\Http\\Controllers\\Admin')

Route.namespace('Admin').group(() => {
  Route.get('/users', 'UserController@index')
  Route.apiResource('users', 'UserController')
})
```

## Controllers and requests

A controller method gets the request first, then the route's parameters. What it returns is sent as JSON; returning nothing answers `204`.

```js
const { response, abort } = require('kreftjs/server')
const Post = require('../../Models/Post')

class PostController {
  async index(req) {
    return Post.with('author').where('published', true).latest().paginate(15, req.integer('page', 1))
  }

  async store(req) {
    const data = await req.validate({
      title: 'required|max:200|unique:posts,title',
      author_id: 'required|exists:authors,id',
    })
    return response(await Post.create(data), 201)
  }

  async show(req, id) { return Post.findOrFail(id) }               // 404 when missing
  async destroy(req, id) { await (await Post.findOrFail(id)).delete() }
}

module.exports = PostController
```

Generate one with `kreft make:controller PostController --api` (also `--model Post`, `--route=api`, `--auth`).

### The request

| Call | Gives |
|---|---|
| `req.input('name', default)`, `req.all()`, `req.only('a', 'b')`, `req.except(…)`, `req.has(…)`, `req.filled(…)` | Values from the body and the query. |
| `req.boolean('x')`, `req.integer('page', 1)`, `req.string('q')` | A value in the right type. |
| `await req.validate(rules, messages, names)` | The same rules as `form()`, plus `unique:table,column` and `exists:table,column`. Returns only the checked fields, or answers `422`. `messages` are your own texts (`{ 'title.unique': 'That title is already used.' }`, or `{ unique: '…' }` for every field); `names` are nicer field names (`{ email: 'e-mail address' }`). |
| `req.params`, `req.query`, `req.body`, `req.header('x')`, `req.bearerToken()`, `req.ip()`, `req.user` | The rest. |
| `req.file('avatar').store('avatars')` | Saves an upload with a random name. |
| `response(data, 201)`, `response(data).header('X', 'y')`, `abort(403, 'message')` | Answers. |
| `response.stream('/path/video.mp4', { type, download, headers })` | Sends a file with byte ranges. See [Video and audio files](#video-and-audio-files). |

### Video and audio files

To serve a video or audio file, return `response.stream(path)` instead of reading the file yourself:

```js
const path = require('path')

Route.get('/videos/:name', (req) =>
  response.stream(path.join(__dirname, '../storage/videos', path.basename(req.params.name))))

Route.get('/podcast/:id/download', (req) =>
  response.stream('/var/media/episode.mp3', { download: true }))   // saved as a file instead of played
```

- **Seeking works.** The server answers `Range` requests with `206 Partial Content`, so a player can jump to any minute without downloading the rest, and Safari, which refuses to play video without ranges, plays it. A range that does not fit the file gets `416`.
- **Only the needed bytes are read**, and reading stops when the viewer leaves or seeks elsewhere.
- **Caching is built in.** The answer carries `ETag` and `Last-Modified`, so an unchanged file is answered with `304`. `HEAD` requests get the headers only.
- **A missing file is a plain `404`**, not a crash.
- Options: `type` (the media type; guessed from the extension for `mp4`, `webm`, `mov`, `mp3`, `m4a`, `ogg`, `wav`, `flac`, `m3u8`, `mpd`, `vtt` …), `download: true` (adds `Content-Disposition: attachment`), and `headers` (extra headers).

> [!WARNING]
> Never build the path straight from the request. Use `path.basename(...)` as above, or look the file up in your database, so nobody can ask for `../../.env`.

`kreft dev` and `kreft serve` also send the static media files of your app (`.mp4`, `.webm`, `.mp3`, HLS playlists …) with ranges, so a `<video src="/intro.mp4" controls>` seeks without any code.

### Form requests, resources and policies

For bigger endpoints, move rules and authorization out of the controller:

```js
// app/Http/Requests/StorePostRequest.js
const { FormRequest } = require('kreftjs/server')

class StorePostRequest extends FormRequest {
  authorize(req) { return req.user != null }           // false answers 403
  rules() { return { title: 'required|max:200', body: 'required' } }
  messages() { return { 'title.required': 'Give the post a title.' } }
}

module.exports = StorePostRequest
```

```js
const data = await StorePostRequest.validate(req)                // in a controller
return PostResource.collection(await Post.paginate(15))          // { data, meta }
await req.authorize('update', post)                              // app/Policies/PostPolicy.js
```

Generate them with `kreft make:request`, `kreft make:resource` and `kreft make:policy`.

### Passing data from controllers to pages

A page receives data from the API with `load` (see [Fetching data](#fetching-data)). Return plain objects, collections or paginator results from controllers; hidden model fields (`static hidden`) are never included.

## Models and the database

Models are Active Record classes, like Eloquent:

```js
// app/Models/Post.js
const { Model, Str } = require('kreftjs/server')

class Post extends Model {
  static fillable = ['title', 'body', 'user_id']        // what create() and update() may fill
  static hidden = []                                    // never sent as JSON
  static casts = { published: 'boolean', meta: 'json' }
  static softDeletes = true                             // delete() fills deleted_at

  user() { return this.belongsTo(require('./User')) }
  comments() { return this.hasMany(require('./Comment')) }
  tags() { return this.belongsToMany(require('./Tag')) }

  static scopePublished(q) { q.where('published', true) }
  static async creating(post) { post.slug ??= Str.slug(post.title) }
}

module.exports = Post
```

**Always set `static fillable`.** Without it a model lets `create()` and `update()` set every column except `id`, so `Post.create(req.all())` would save `{ "is_admin": true }` from a visitor. The controllers made by `kreft make:controller --model` read only the `fillable` columns (`req.only(...Model.fillable)`) and stop with an error until you set it. Kreft prints a warning when a model without `fillable` is given a privilege-looking column (`is_admin`, `role`, `permissions` …).

The table is the plural of the class name (`Post` is `posts`); set `static table = '…'` for another one.

### Querying

```js
await Post.all()
await Post.find(5)                       // or findOrFail(5): 404 when missing
await Post.where('published', true).orderByDesc('id').limit(10).get()
await Post.where('views', '>', 100).orWhere('pinned', true).count()
await Post.query().published().with('user', 'comments.author').withCount('comments').paginate(15, page)
await Post.query().whereHas('comments', (q) => q.where('approved', true)).get()

const post = await Post.create({ title: 'Hi' })     // fills created_at and updated_at
await post.update({ title: 'Hello' })
await post.delete()

await post.comments().create({ body: 'Nice' })
await post.tags().sync([1, 2, 3])                   // also attach(), detach(), toggle()
```

Relations: `hasOne`, `hasMany`, `belongsTo`, `belongsToMany` (with `pivot`), `hasManyThrough`. Soft deleted rows come back with `withTrashed()` and return with `restore()`.

Without a model:

```js
await DB.table('orders').join('users', 'users.id', '=', 'orders.user_id').groupBy('status').get()
await DB.select('SELECT * FROM posts WHERE id = ?', [5])
await DB.transaction(async () => { await Order.create({ … }); await Stock.decrement(…) })   // all or nothing
```

> [!WARNING]
> Values always travel as parameters (`?`). Never build SQL by joining user input into a string. `whereRaw`, `selectRaw` and `orderByRaw` take raw SQL on purpose: pass user values through their parameter array.

### Databases

The database comes from `DATABASE_URL` in `.env`:

```env
DATABASE_URL=sqlite:backend/database/app.db                  # built into Node.js, nothing to install
DATABASE_URL=mysql://user:pass@localhost:3306/shop           # npm i mysql2
DATABASE_URL=postgres://user:pass@localhost:5432/shop        # npm i pg
```

The same migrations and models work on all three.

## Migrations, seeders and factories

A migration describes a table in JavaScript; the same file works on SQLite, MySQL and PostgreSQL:

```js
// database/migrations/2026_10_29_120000_create_posts_table.js
module.exports = {
  up(schema) {
    schema.create('posts', (table) => {
      table.id()
      table.foreignId('author_id').constrained().cascadeOnDelete()
      table.string('title', 200).unique()
      table.text('body').nullable()
      table.boolean('published').default(false)
      table.json('meta').nullable()
      table.timestamps()
    })
  },
  down(schema) {
    schema.dropIfExists('posts')
  },
}
```

Column types include `id`, `string`, `text`, `integer`, `bigInteger`, `decimal`, `float`, `boolean`, `date`, `dateTime`, `timestamp`, `timestamps`, `json`, `foreignId`. Plain `.sql` files in `database/migrations` also work (they run once each, in name order).

A seeder fills starting data:

```js
// database/seeders/DatabaseSeeder.js
const { Seeder } = require('kreftjs/server')
const Post = require('../../app/Models/Post')

class DatabaseSeeder extends Seeder {
  async run() {
    await Post.create({ title: 'Hello', author_id: 1 })
    await this.call(require('./CommentSeeder'))
  }
}

module.exports = DatabaseSeeder
```

Factories make fake data for seeders and tests:

```js
await User.factory().count(10).has(Post.factory().count(3), 'posts').create()
```

### Commands

| Command | What it does |
|---|---|
| `kreft migrate` | Runs the new migrations (`kreft dev` does this by itself). |
| `kreft migrate:rollback` | Undoes the last batch (`--step 2` for the last two). |
| `kreft migrate:fresh --seed` | Drops every table, migrates again, then seeds. |
| `kreft migrate:status` | Which migrations ran. |
| `kreft db:seed` | Runs `DatabaseSeeder` (`--class PostSeeder` for another). |
| `kreft make:model Post -mfsc` | A model plus migration (`-m`), factory (`-f`), seeder (`-s`), controller (`-c`), page (`-p`), route (`-r`). |
| `kreft make:migration create_posts_table` | `add_x_to_posts_table` makes a `schema.table` one. |
| `kreft make:seeder`, `kreft make:middleware` | The files, in the right folders. |

> [!NOTE]
> `migrate:fresh` and `db:wipe` destroy data. They are meant for development databases only.

## Authentication

New projects come with every sign-in screen and the backend behind it:

| Page | Address | What it does |
|---|---|---|
| `pages/auth/Login.kreft` | `/login` | Log in with email and password. |
| `pages/auth/Register.kreft` | `/register` | Make an account and get an email to verify the address. |
| `pages/auth/ForgotPassword.kreft` | `/forgot-password` | Email a link to choose a new password. |
| `pages/auth/ResetPassword.kreft` | `/reset-password/:token` | The link from that email. |
| `pages/auth/VerifyEmail.kreft` | `/verify-email` | "Check your email", and the link from it opens `/verify-email/:id/:hash`. |
| `pages/auth/ConfirmPassword.kreft` | `/confirm-password` | Type the password again before something serious. |
| `pages/Dashboard.kreft`, `pages/Profile.kreft` | `/dashboard`, `/profile` | The first page after logging in; account settings. |

### How a login works

- A login puts a token in an **HttpOnly cookie**. Page scripts cannot read it, so a script injected into a page cannot steal it. Only a hash of the token is stored in the database.
- Every change (POST, PUT, PATCH, DELETE) also needs the `X-XSRF-TOKEN` header to match the `XSRF-TOKEN` cookie. `Kreftjs.api` does this for you.
- A script or an app that sends `device_name` when it logs in gets an **API token** (`Authorization: Bearer 5|…`) instead.
- Passwords are hashed with scrypt. Reset links expire after 60 minutes and sign the user out everywhere.
- Session ids change on every login, so a session cannot be planted in a browser beforehand.

On the server:

```js
Route.middleware(['auth', 'verified']).group(() => {
  Route.get('/orders', [OrderController, 'index'])               // req.user is the user
})

Route.delete('/account', …).middleware(['auth', 'password.confirm'])   // asks for the password again (423)
```

Helpers you can use anywhere in the backend:

```js
const { Hash, Str, Url, Mail, Crypt } = require('kreftjs/server')

Hash.make('secret')                      // store this, never the password
Hash.check('secret', user.password)      // true or false
Str.random(40)                           // a random token
Url.signed('/verify-email/5/abc', 60)    // a link that works for 60 minutes, unchanged
await Mail.send({ to, subject, text })   // printed in the terminal until MAIL_URL is set
```

### Protections in the sign-in routes

- Visitors get `throttle:6,1`: six tries a minute per address.
- Each **account** also locks after `LOGIN_MAX_FAILURES` (10) wrong passwords in `LOGIN_WINDOW_SECONDS` (15 minutes), whatever address the tries come from. After that, even the right password gets `429` until the window ends.
- Two-factor codes are counted per account too: `TWO_FACTOR_MAX_FAILURES` (8) wrong codes lock it, and starting a new login does not reset the count.
- "Forgot your password?" answers the same whether or not the address has an account.
- Changing the email address needs a password confirmation from the last 3 hours (answer `423`), because the address is what password reset trusts.

### Two-factor, devices and API tokens

- **Two-factor**: authenticator-app codes (TOTP) plus recovery codes. Each recovery code works once.
- **Devices**: `/profile` lists the signed-in browsers, and any of them can be logged out.
- **API tokens**: create them in `/profile` with the permissions `read`, `create`, `update`, `delete`. A token can only use the HTTP methods its permissions allow, on **every** route (`GET` needs `read`, `POST` needs `create`, `PUT`/`PATCH` need `update`, `DELETE` needs `delete`). Only browser sessions and `*` tokens can manage tokens, the password and the account.

### Admin users

An admin is a user whose `is_admin` column is true. The test user is one; give the rights to others on the Users page, or with `kreft make:admin you@example.com`. Use `Route.middleware(['auth', 'admin'])` for admin-only routes.

## Middleware

Middleware runs before the controller and can stop the request or change the answer:

```js
// app/Http/Middleware/EnsureIsAdmin.js     ('ensure-is-admin' in a route, or 'ensure-is-admin:editor')
const { abort } = require('kreftjs/server')

class EnsureIsAdmin {
  async handle(req, next, role = 'admin') {
    if (!req.user || req.user.role !== role) abort(403)
    const response = await next(req)               // the controller runs here
    return response.header('X-Checked', 'yes')
  }
}

module.exports = EnsureIsAdmin
```

A name in a route finds its file in `app/Http/Middleware`: `'auth'` is `Authenticate.js`, `'ensure-is-admin'` is `EnsureIsAdmin.js`.

### Built in

| Middleware | What it does |
|---|---|
| `throttle:60,1` | Rate limiting: 60 requests a minute per visitor and route, then `429`. |
| `csrf` | Checks the CSRF token on POST, PUT, PATCH and DELETE (`419` when wrong). |
| `can:ability,model` | Policy checks through `Gate.authorize()`. |
| `auth`, `guest`, `verified`, `password.confirm` | The sign-in set from `app/Http/Middleware`. |

For every route, list middleware in `app/Http/Kernel.js`:

```js
module.exports = {
  middleware: ['throttle:120,1'],
}
```

Exempt a route with `.withoutMiddleware('csrf')`, or `new VerifyCsrfToken({ except: ['webhooks/*'] })`.

## Queues, mail, cache and files

Each tool has its own folder in `backend/app/` and a `kreftjs make:` command:

```js
await dispatch(new SendWelcome(user))                   // app/Jobs: runs in the background (tries, backoff, failed())
await event(new OrderShipped(order))                    // app/Listeners
await Mail.to(user).send(new WelcomeMail(user))         // app/Mail: subject, text, html or markdown({ … })
await user.notify(new InvoicePaid(invoice))             // app/Notifications: 'mail' and 'database' channels
await Cache.remember('stats', 600, () => loadStats())   // database, file, memory or redis (CACHE_STORE)
const path = await req.file('avatar').store('avatars')  // uploads; Storage.url(path) is /storage/avatars/…
```

### Jobs

`Job.dispatch(...)` returns an object you can chain (`delay(seconds)`, `onQueue(name)`) and then `await`:

```js
await SendWelcome.dispatch(user)
await SendWelcome.dispatch(user).delay(60).onQueue('mail')
```

> [!WARNING]
> `dispatch` sends the job when you `await` it (or call `.then`). Calling it and forgetting the `await` sends nothing.

Queued jobs, listeners, mail and notifications run in the background. `kreft dev` and `kreft serve` work through the `jobs` table every second. Control workers with `kreft queue:work`, `queue:failed`, `queue:retry all`, `queue:flush`. Choose the driver with `QUEUE_CONNECTION` (`database`, `redis`, `sync`).

### Uploads

`req.file('avatar').store('avatars')` saves with a random name and never trusts the original one. Only known plain-data extensions (images, PDF, text, office files, audio, video, archives) keep their extension; anything else is stored as `.bin`. Use `file.isImage()` to also check the file's real header, not only its name.

Files on the public disk are served from `/storage/…` as downloads of plain data, so an uploaded `.html` or `.svg` can never run scripts on your site.

### Scheduling

```js
// backend/routes/console.js
Schedule.call(async () => { await Post.onlyTrashed().forceDelete() }).daily().name('clean-trash')
Schedule.job(new SendDailyReport()).weekdays().at('08:00')
Schedule.command('send:report Daily').hourly()
```

`kreft dev` and `kreft serve` check the schedule every minute. Set `SCHEDULER=off` to run it from cron with `kreft schedule:run`; `kreft schedule:list` shows what is planned.

### Redis

Kreft includes its own Redis client (RESP2 over TCP or TLS) with no extra package. It works with Redis, Valkey and hosted Redis services.

```env
CACHE_STORE=redis
QUEUE_CONNECTION=redis
REDIS_URL=rediss://default:secret@host:6379/0      # or REDIS_HOST, REDIS_PORT, REDIS_USERNAME, REDIS_PASSWORD, REDIS_DB
REDIS_PREFIX=kreft_
```

```bash
kreftjs redis:ping        # PONG (1ms) — 127.0.0.1:6379/0
```

Redis also gives you atomic locks (`Cache.lock('report', 30)`) and publish/subscribe.

## Configuration

Settings come from `.env`, `backend/config/*.js` and defaults, through one helper:

```js
const { config } = require('kreftjs/server')

config('app.name', 'My app')
config('database.default', 'sqlite')
config.has('redis.connections.default')
config.set('app.debug', false)
```

Files in `backend/config/`: `app.js`, `auth.js`, `database.js`, `redis.js`, `session.js`. See [Environment variables](#environment-variables) for what `.env` controls.

### Sessions and inactivity

Two layers log out a user who walks away:

```env
SESSION_LIFETIME=120            # minutes of inactivity before the server drops the session
PUBLIC_SESSION_TIMEOUT=15       # minutes before the page itself sends the user to /login
PUBLIC_SESSION_WARNING=2        # minutes of warning before that
AUTH_TOKEN_DAYS=30              # a token unused for this many days stops working
```

`PUBLIC_` values are copied into the browser (`Kreftjs.env`); never put secrets in them.

### Behind a proxy

The visitor's address comes from the connection. Behind nginx, Cloudflare or a load balancer, list your proxies:

```env
TRUSTED_PROXIES=10.0.0.1          # or *
TRUSTED_PROXY_HOPS=1              # with *: how many proxies stand in front
```

`X-Forwarded-For` is read from the right, so the visitor cannot choose their own address.

## Testing

Backend code is tested with Node's own test runner and an in-memory SQLite database, so tests are fast and never touch your real data.

```json
{
  "scripts": { "test": "node --test \"tests/**/*.test.js\"" }
}
```

```js
// tests/models/post.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const { createSchema, setConnection } = require('kreftjs/server')
const { connect } = require('kreft/bin/db.js')
const Post = require('../../backend/app/Models/Post')

test.before(async () => {
  const db = await connect('sqlite::memory:')       // a new empty database for this test file
  setConnection(db)
  await createSchema(db).create('posts', (table) => {
    table.id()
    table.string('title')
    table.timestamps()
  })
})

test('a post can be created and found', async () => {
  const post = await Post.create({ title: 'Hello' })
  assert.equal((await Post.find(post.id)).title, 'Hello')
})
```

To test a whole project's tables, run its real migrations instead of building the schema by hand: `migrator.migrate(db, 'backend/database/migrations')`.

Component pages for the browser live in `frontend/tests/` and are opened with `kreft dev`.

# Tooling

## Command line

Run `kreft list` to see every command your installed version has, and `kreft help` for the options of the main ones.

### The main commands

| Command | What it does |
|---|---|
| `kreft new my-app` | Makes a project (`--js`, `--ts`, `--db sqlite`, `--ui tailwind`, `--no-auth`, `--mobile` for iOS and Android, `--electron` or `--tauri` for a desktop app, `--harmony` for HarmonyOS, `--vite`, `--redis`). |
| `kreft dev` | Development server with hot reload (`--port`, `--host`, `--db`, `--api`, `--server`, `--backend`, `--seed`, `--no-hot`, `--gc`). |
| `kreft build` | Compiles the app into plain files in `dist/` (`--out`, `--base`, `--prerender`). |
| `kreft serve [dist]` | Runs a built app for real users. Answers everyone, serves only the tables you list. |
| `kreft update` | Updates npm packages and refreshes `kreftjs.js` (`--core`, `--npm`, `--latest`, `--check`). |
| `kreft add <package>` | A safer `npm install`. See [Packages](#packages). |
| `kreft about`, `kreft env`, `kreft log`, `kreft tinker` | Versions and folders, environment, logs, a console with your models (`await User.count()`). |
| `kreft down --secret=x` / `kreft up` | Maintenance mode: visitors get `503`, and `/x` lets you in. |
| `kreft vscode` | Installs colors, snippets, folding and Emmet for `.kreft` files in VS Code, Antigravity, Cursor, Windsurf and VSCodium. |
| `kreft editor <name>` | The same for `sublime`, `zed`, `jetbrains` (WebStorm, PhpStorm, IDEA...) and `vim` (Vim, Neovim). |
| `kreft editor <name> --download [folder]` | Writes the plugin as one file instead of installing it: [Editor plugins](#editor-plugins). |
| `kreft electron:dev`, `kreft electron:build` | A desktop window, and installers: [Desktop apps](#desktop-apps-with-electron). |
| `kreft tauri:dev`, `kreft tauri:build` | The same with Tauri: [Desktop apps with Tauri](#desktop-apps-with-tauri). |
| `kreft harmony:build`, `kreft harmony:open` | A HarmonyOS project and DevEco Studio: [HarmonyOS apps](#harmonyos-apps). |
| `kreft mobile:init`, `mobile:build`, `mobile:open`, `mobile:dev` | iOS and Android apps with Capacitor: [Mobile apps](#mobile-apps-ios-and-android). |
| `kreft mobile:ui`, `mobile:icons`, `mobile:splash` | The phone UI kit, the app icon and the splash screen: [The phone UI kit](#the-phone-ui-kit). |
| `kreft make:home --mobile` / `--desktop` | An app-style home page: [Home pages made for apps](#home-pages-made-for-apps). |
| `kreft build --pwa` | Also writes a manifest and a service worker (an installable site that works offline). |

### Generators and database

| Group | Commands |
|---|---|
| `make:` | `model`, `controller`, `page`, `routes`, `migration`, `seeder`, `factory`, `middleware`, `request`, `resource`, `policy`, `rule`, `job`, `event`, `listener`, `mail`, `notification`, `observer`, `command`, `lang`, `errors`, `admin`, `electron`, `tauri`, `harmony`, `mobile`, `home`, `vite` |
| `migrate` | `migrate`, `:rollback`, `:fresh`, `:refresh`, `:reset`, `:status`, `:file`, `:undo` |
| `db:` | `db:seed`, `db:wipe` |
| `queue:` | `work`, `start`, `stop`, `pause`, `resume`, `restart`, `status`, `failed`, `retry`, `flush`, `clear`, `table` |
| `schedule:` | `run`, `work`, `list` |
| Others | `route:list`, `cache:clear`, `storage:link`, `key:generate`, `event:list`, `log:clear` |

`kreft dev --seed` seeds a brand-new database the first time. `kreft key:generate` writes a 256-bit `APP_KEY` into `.env` (`--show` prints it instead).

### Development server safety

- `kreft dev` answers only this computer (`127.0.0.1`) and only requests whose `Host` is a local name (`localhost`, `127.0.0.1`, `::1`, `*.localhost`). This stops DNS-rebinding attacks, where a web page tries to reach your dev server through its own domain name.
- To reach it through a tunnel or another name, set `KREFT_ALLOWED_HOSTS=my-tunnel.example`. To share it on your network, use `--host 0.0.0.0`.
- Requests that change data in `--api` or `--db` mode are refused when they come from another web site (a browser `Origin` that is not local).
- **Moving or deleting the project folder.** The operating system cannot refuse a delete, so the server says so after it happens: if the project folder is deleted or moved to the Trash while `kreft dev` or `kreft serve` runs, it stops at once with a message. Any `kreftjs` command started from a deleted folder or one in the Trash refuses to run. Stop the server with <kbd>Ctrl</kbd>+<kbd>C</kbd> before you move or delete a project.

## Developer tools

Everything here comes with Kreft. Nothing else to install.

**Hot reload.** While `kreft dev` runs, save a `.kreft` file and only that component is swapped; its state stays. A `.css` file is reloaded without a page refresh, and an error shows an overlay with the file and line.

**Kreft DevTools.** The **S** button in the corner (or <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd>) opens a panel. In the phone app the button is hidden so it never covers the bottom bar; to show it there run `localStorage.setItem('kreft:devtools-button', 'on')` in the app's console:

| Tab | Shows |
|---|---|
| Components | The live tree. Pick one to see props, state and derived values, and change state right there. |
| Stores | Every store's values, which you can change, and `$reset()`. |
| Route | The current route and every route, with a button to go there. |
| Timeline | Store actions and bus messages as they happen. |

The button and the panel only exist under `kreft dev`; built apps never include them.

**Types.** `kreftjs.d.ts` describes everything in `Kreft`, so TypeScript and your editor know it. `kreft new` copies it into new projects, and `kreft update --core` refreshes it.

### Error monitor

In development, an uncaught error on the server shows an interactive page instead of a bare message:

- A stack explorer that hides vendor frames and highlights yours.
- A source preview around the failing line.
- A suggestion engine for common mistakes (a method typo on a model, reading a property of `undefined`, a missing table that needs `kreft migrate`).
- The request: method, URL, route and query values, body, headers and client address. Passwords, tokens, cookies and CSRF values are masked.
- Copy the error as Markdown for an issue, or as JSON.

The page is only shown when `APP_ENV` is not `production` and `APP_DEBUG` is true. **In production the same error answers a plain `Server error.`** with no stack or file names.

Frontend errors use the same design through `errors/ErrorMonitor.kreft`; pass it a caught exception:

```html
import ErrorMonitor from 'errors/ErrorMonitor.kreft'
state caught = null

<view>
  <error-monitor k-if="caught" error={caught} status={500} title={caught.name} message={caught.message}></error-monitor>
</view>
```

## Editor plugins

Kreft has a plugin for each editor (this page online: [kreftjs.com/docs](https://kreftjs.com/docs#editor-plugins)). Every one gives `.kreft` files colors, snippets and **Emmet**: type `ul>li.item*3` in `<view>`, or `m10`, `df`, `bgc` in `<style>`, and expand it.

| Editor | Install | Download as a file | Source |
|---|---|---|---|
| VS Code, Antigravity, Cursor, Windsurf, VSCodium | `kreft editor vscode` | `kreft-vscode-<version>.vsix` | [editors/vscode](https://github.com/gadhyare/kreftjs/tree/main/editors/vscode) |
| Sublime Text | `kreft editor sublime` | `Kreft.sublime-package` | [editors/sublime](https://github.com/gadhyare/kreftjs/tree/main/editors/sublime) |
| Zed | `kreft editor zed` | `kreft-zed-<version>.zip` | [editors/zed](https://github.com/gadhyare/kreftjs/tree/main/editors/zed) |
| WebStorm, PhpStorm, IntelliJ IDEA, PyCharm, Android Studio | `kreft editor jetbrains` | `kreft-jetbrains-<version>.jar` | [editors/jetbrains](https://github.com/gadhyare/kreftjs/tree/main/editors/jetbrains) |
| Vim, Neovim | `kreft editor vim` | `kreft-vim.zip` | [editors/vim](https://github.com/gadhyare/kreftjs/tree/main/editors/vim) |

`kreft editor all` installs every one. `kreft editor` alone prints the list.

### Download a plugin

Add `--download` and the plugin is not installed: it is written as one file, in the form the editor installs by itself. Use it to share the plugin with your team, to keep it, or to set up a computer that has no Kreft.

```bash
kreft editor vscode --download            # kreft-vscode-<version>.vsix in this folder
kreft editor jetbrains --download ~/Downloads
kreft editor all --download plugins       # the five files in ./plugins
```

Without a Kreft project, `npx` does the same:

```bash
npx kreftjs@beta editor sublime --download
```

The command prints the file and how to install it. The same steps are below.

### VS Code, Antigravity, Cursor, Windsurf

```bash
kreft editor vscode
```

It installs the extension in every one of these editors it finds, and sets the project's `.vscode/settings.json`. Restart the editor. (`kreft vscode` is the same command.)

From a file: `kreft editor vscode --download`, then in the editor open *Extensions > the `...` menu > Install from VSIX...* and pick `kreft-vscode-<version>.vsix`. Or from a terminal:

```bash
code --install-extension kreft-vscode-2.4.0.vsix
```

You get: colors for `<view>`, `<style>` and `<script>`, *Format Document*, snippets (`kreftjs`, `state`, `action`, `for`, `kreft-wait`...), folding, and Emmet. If you have your own `emmet.includeLanguages` setting, the extension asks once and adds `"kreftjs": "html"` to it. To expand with Tab, set `"emmet.triggerExpansionOnTab": true`.

### Sublime Text

```bash
kreft editor sublime
```

It copies the package to `Packages/Kreft`. Reopen your `.kreft` files.

From a file: `kreft editor sublime --download`, then *Preferences > Browse Packages...*, go one folder up, and put `Kreft.sublime-package` in `Installed Packages`. Do not rename the file: its name is the package's name.

For Emmet, install the **Emmet** package: *Command Palette > Package Control: Install Package > Emmet*. It needs no setting.

### Zed

```bash
kreft editor zed
```

It puts the extension in `~/.kreft/editors/zed`. In Zed, open the command palette, run **zed: install dev extension** and pick that folder. Zed compiles the extension, so [Rust](https://rustup.rs) must be installed.

From a file: `kreft editor zed --download`, unzip it, and pick the `kreft-zed` folder in the same command.

Emmet needs no other extension and no setting: the Kreft extension starts the Emmet language server itself (Zed downloads it the first time). To turn it off:

```json
"languages": { "Kreft": { "language_servers": ["!kreft-emmet"] } }
```

### JetBrains IDEs

For WebStorm, PhpStorm, IntelliJ IDEA, PyCharm, RubyMine, GoLand, Rider and Android Studio, 2022.3 or newer.

```bash
kreft editor jetbrains
```

It builds the plugin and puts it in every JetBrains IDE it finds. Restart the IDE.

From a file: `kreft editor jetbrains --download`, then *Settings > Plugins > the gear > Install Plugin from Disk...* and pick `kreft-jetbrains-<version>.jar`.

A `.kreft` file opens as HTML, so the markup, the CSS in `<style>` and the JavaScript in `<script>` are colored and completed, and Emmet expands with Tab. The snippets are live templates: *Settings > Editor > Live Templates > Kreft*. Emmet for CSS needs an IDE with web support (WebStorm, PhpStorm, IDEA Ultimate, PyCharm Professional); Kreft-only syntax such as `state x = 0` is shown as plain text.

### Vim and Neovim

```bash
kreft editor vim
```

It copies the plugin to `pack/kreft/start/kreft` in your Vim and Neovim folders.

From a file: `kreft editor vim --download`, then unzip `kreft-vim.zip` into `~/.vim/pack/kreft/start/` (Neovim: `~/.config/nvim/pack/kreft/start/`).

For Emmet, install [emmet-vim](https://github.com/mattn/emmet-vim) and press `Ctrl+y` then `,` after an abbreviation. In Neovim (0.11 or newer) you can use the Emmet language server instead (`npm i -g @olrtg/emmet-language-server`):

```lua
vim.lsp.config('emmet_language_server', {
  cmd = { 'emmet-language-server', '--stdio' },
  filetypes = { 'html', 'css', 'kreft' },
  init_options = { includeLanguages = { kreft = 'html' } },
})
vim.lsp.enable('emmet_language_server')
```

### Another editor

An editor that takes TextMate grammars can use `editors/vscode/syntaxes/kreftjs.tmLanguage.json`. For Emmet, tell the editor to treat `.kreft` files as HTML: that is all the plugins above do.

## Build and deploy

`kreft build` compiles your app ahead of time:

```bash
npm run build      # or: kreft build
npm run preview    # check the result: kreft dev dist
```

| File | What it is |
|---|---|
| `index.html` | Your page, now loading the files below. |
| `kreftjs.js` | The framework. |
| `app.js` | Every `.kreft` file, already compiled. |
| `app.css` | All `<style>` blocks; scoped ones already scoped. |
| `main.js` | The inline `<script>` code from `index.html`. |
| `deps/`, `vendor/` | The npm packages and CSS your `.kreft` files import, minified. |

What you get:

- **A faster first load.** The browser downloads one `app.js` and compiles nothing.
- **A strict Content-Security-Policy works.** Every expression becomes a real function, so the built app never uses `eval` or `new Function`.
- **Errors before you deploy.** A mistake in any `.kreft` file stops the build and names the file and line.

Options: `kreft build ./site --out public` builds another folder, and `--base /` changes `<base href>`. `--no-htaccess` skips the `.htaccess` file described below. If esbuild is installed (`kreft add -D esbuild`), `kreftjs.js` is minified in the output (about 44 kB gzipped instead of 69 kB); `--no-minify` copies it as it is.

### Upload to a host

**Static hosting: Hostinger, cPanel, any Apache host.** Upload what is *inside* `dist/` (not the `dist` folder itself) to the folder the website is served from, normally `public_html`. In Hostinger's hPanel: **Files → File Manager → public_html → Upload**, or use FTP. Do not use the "framework" or "Node.js app" importers for this: they look for a `package.json` and say *Unsupported framework or invalid project structure*, because `dist/` holds only finished files.

`kreft build` also writes `dist/.htaccess`:

```apache
RewriteEngine On
RewriteBase /
RewriteRule ^index\.html$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME}/index.html !-f
RewriteCond %{REQUEST_URI} !^/api/
RewriteCond %{REQUEST_URI} !\.[A-Za-z0-9]+$
RewriteRule . /index.html [L]
```

Apache only knows the files on disk, so without these rules `/docs` or any other clean address gives a 404 when someone opens or reloads it. With them, every page address (no file extension, not under `/api/`) that is not a real file, or a folder with its own `index.html`, opens `index.html` and the router takes over. A missing file such as `app.js`, or an `/api/` address, stays a plain 404, so code that asks for data never receives the page's HTML. Upload the file too (it starts with a dot, so some file managers hide it; turn on "show hidden files"). If the site lives in a folder, build with `--base /folder/` and the rules follow it. An `.htaccess` you keep in `public/` is used as it is. `kreft build` also puts a short hash into the address of each script and style sheet (`app.js?v=28a965f6`), and the `.htaccess` tells the host never to keep `index.html`. Hosts cache `.js` and `.css` for days, so without the hash visitors would keep running the old runtime and old pages after you upload a new build. A relative base (`--base ./`, used by the desktop build) gets no file.

> [!NOTE]
> This hosts the front end only. Login, the database and everything under `/api` need the Node.js server, which Apache does not run.

**A Node.js plan or a VPS.** Upload the whole project (without `node_modules`), not `dist/`. Add Kreft to its dependencies with `npm install kreftjs@latest`, build with `npm run build`, and start the server with `npm run serve` (it reads the `PORT` your host sets). The generated `start` script runs the development server, so do not use it in production.


On a VPS, keep it running with PM2 and put nginx in front of it for your domain and HTTPS:

```bash
npm install && npm run build
npm i -g pm2
pm2 start "npm run serve" --name my-app && pm2 save
```

```nginx
server {
    server_name example.com;
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Then `sudo certbot --nginx -d example.com` adds HTTPS. Set `APP_ENV=production` and a real `APP_KEY` in `.env` first, and read the [Production checklist](#production-checklist).


### Publish the website (kreftjs.com)

The Kreft website is the `demo/` app plus the `docs/` manual. Three commands make it, and a fourth puts it online:

```bash
npm install kreftjs@latest     # in a project that uses Kreft; in this repository, plain: npm install
npm run build                  # writes the finished site to dist/kreftjs-com
```

Then upload what is *inside* `dist/kreftjs-com` (not the folder itself, and including the hidden `.htaccess`) to the folder kreftjs.com is served from, normally `public_html` (see [Upload to a host](#upload-to-a-host)). Open https://kreftjs.com and reload a page such as `/docs` to check that the clean addresses work.

`npm run build` runs `kreft build demo --out dist/kreftjs-com --base / --include docs`. `--base /` makes every path start at the site's root, and `--include docs` copies the manual in. To look at the result before you upload it, run `npm run preview`.

**Releasing a new version of the package.** This is done by the maintainer, before the site is built, so the site and the package agree:

```bash
npm test                       # the regression tests must pass
npm version 0.0.39-beta --no-git-tag-version --ignore-scripts  # choose a fresh version for the next release
npm pack --dry-run             # review the package contents
npm publish --tag beta --access public  # runs tests first; needs npm authentication
npm run build                  # then upload dist/kreftjs-com as above
```

Check that people get it with `npm view kreftjs version` and a fresh `npm install -g kreftjs@latest`.

**Trying a version before everyone gets it.** Publish it under another tag. `latest` and `beta` stay on the old version, so nobody gets it by accident:

```bash
npm publish --tag mobile-test --access public     # npm asks you to approve in the browser
npm install -g kreftjs@mobile-test                  # you, on any computer
kreft --version                                     # shows the new number
npm dist-tag add kreftjs@0.0.39-beta beta           # when it is good: the tag everyone uses moves
```

`package.json` sets public access, the official npm registry and the `beta` tag for prereleases. Use `npm run publish:beta` (or explicitly pass `--tag beta`) to publish a prerelease; moving `latest` is a separate maintainer decision. Unscoped packages such as `kreftjs` are public. Organization packages require an explicitly chosen name such as `@your-org/kreftjs` and access to that organization. A version number can be published only once, so the next try is the next number. To test the folder you are in without publishing anything, run `npm link` (undo with `npm unlink -g kreftjs`). `kreft --version` after `npm install -g` reads the globally installed package, not the repository.

### Ready HTML for every page: `--prerender`

```bash
npm i -D jsdom                              # once per project
kreft build --prerender                       # every route without :params
kreft build --prerender /users/1,/users/2     # and these addresses too
```

Each page is opened in a simulated browser, its data loaded, and the result saved as `dist/<page>/index.html`, so visitors and search engines get finished HTML.

The tags a page sets with `.seo({...})` or `meta` (description, canonical, Open Graph, Twitter, `hreflang`, JSON-LD, `lang` and `dir`) are saved in the page's HTML too, so link previews and crawlers that don't run JavaScript see them. A canonical written in `index.html` is kept for the home page only. A page where the app shows its error page is skipped.

Pages that come from your data (`/posts/:slug`) need their addresses: `kreft build --prerender --urls urls.js`. The file is `urls.json` (a list), `urls.txt` (one address per line), or `urls.js` (a list, or an async function that returns it).

### SEO for pages from your database: `backend/routes/seo.js`

A page whose content comes from a table can't be known at build time. List what the server should put in `<head>` for an address:

```js
// backend/routes/seo.js
const Post = require('../app/Models/Post')

module.exports = {
  '/': { title: 'My shop', description: 'Everything for the home' },
  '/posts/:slug': async ({ slug }) => {
    const post = await Post.where('slug', slug).first()
    if (!post) return null                  // a real 404, with noindex
    return {
      title: post.title,
      description: post.excerpt,
      og: { image: post.image },
      schema: { '@type': 'Article', headline: post.title },
      alternates: { en: `https://example.com/posts/${slug}`, ar: `https://example.com/ar/posts/${slug}` },
    }
  },
  // the addresses of your data pages, for `kreft sitemap`: '/path' or { path, lastmod }
  urls: async () => (await Post.all()).map((p) => ({ path: '/posts/' + p.slug, lastmod: p.updated_at })),
}
```

`kreft dev` and `kreft serve` answer a page request with `index.html` plus the tags of the first matching address (`:param` and a trailing `/*` work). Set `APP_URL` and each page also gets its `canonical`. An address that isn't listed is the normal page. The browser keeps these tags until the first navigation, then the router's own tags take over.

### Whole pages for crawlers

A crawler or link preview (Googlebot, Bingbot, WhatsApp, Facebook, X, Slack, Telegram …) that doesn't run JavaScript would see an empty `<div id="app">`. For these visitors `kreft dev` and `kreft serve` open the page in the same simulated browser as `--prerender`, wait until its data has loaded, and answer with the page already drawn. If the app shows its `errors/404.kreft` page, the answer has status 404. A page that `kreft build --prerender` already drew is sent as it is. Everyone else gets the normal page.

```bash
npm i -D jsdom        # once per project
KREFT_SSR=bots          # default: crawlers and link previews only
KREFT_SSR=all           # every visitor
KREFT_SSR=off           # never
KREFT_SSR_TTL=300       # seconds a drawn page is kept (kreft dev never keeps them)
```

At most two pages are drawn at a time; the other crawlers wait for their turn (up to 15 seconds, 20 at once), and the same address asked twice is drawn once. A page that takes longer than 15 seconds, fails, or is not a page of the app is not tried again for 30 seconds, and the normal page is sent meanwhile, as it is when jsdom is missing. The query string is part of the address (`/search?q=sofa` is its own page). Images, styles and fonts from other sites are not downloaded while drawing, scripts are. Responses carry `Vary: User-Agent` and the same security headers as every other page. The simulated browser introduces itself with a secret `User-Agent` that changes on every start, so it is never drawn again.

### Sitemap and robots.txt: `kreft sitemap`

```bash
kreft sitemap --url https://example.com                  # public/sitemap.xml and public/robots.txt
kreft sitemap --url https://example.com --urls urls.js   # and the addresses in that file
```

It lists the routes of `Kreftjs.router({ routes })` in `index.html` and `routes/web.kreft`, skipping redirects and patterns like `/posts/:id`, plus the `urls` of `backend/routes/seo.js` and `--urls`. A `lastmod` is written only when you give one (a database date such as `2026-01-02 10:00:00` becomes `2026-01-02`). A route can list `alternates: { en: '/about', ar: '/ar/about' }` for `xhtml:link` entries.

### Deploying the backend

```bash
NODE_ENV=production kreft serve dist
```

Before you do, work through the [Production checklist](#production-checklist).

## TypeScript

TypeScript works in the browser (`.kreft` files and `.ts` modules) and on the server (`routes/api.ts`, `app/**/*.ts`, migrations, seeders).

```bash
kreft new my-app --ts
```

Inside a `.kreft` file you can write `interface`, `type`, `enum`, `import type`, and typed `prop`, `state`, `derive` and `saved`. `kreftjs make:*` writes `.ts` files when the project has a `tsconfig.json` (or with `--ts`; `--js` forces JavaScript).

Execution needs no setup: Kreft uses `esbuild` if installed, otherwise Node's built-in type stripping (Node 22.6+), otherwise its own zero-dependency stripper.

> [!NOTE]
> Kreft removes types; it does not check them. Run `tsc --noEmit` in your CI for type checking.

## Vite, Electron and Tauri

**Vite.** If your team prefers the Vite ecosystem, Kreft has a plugin that compiles `.kreft` files on the fly:

```bash
kreft vite:init       # writes vite.config.js with the Kreft plugin
kreft vite:dev        # Vite dev server with the backend API proxied
kreft vite:build      # optimised bundle with code splitting
kreft vite:preview
```

**Electron.** Turn the same app into a desktop application. See [Desktop apps with Electron](#desktop-apps-with-electron) below.

**Tauri.** The same, with installers of a few megabytes, because the system web view is used instead of a bundled browser. See [Desktop apps with Tauri](#desktop-apps-with-tauri).

## One codebase. Every screen.

**One codebase, every screen.** A single Kreft project runs as a **web application**, a desktop app for **macOS, Linux and Windows** (with **Electron** or **Tauri**), and a phone or tablet app for **iOS, Android and HarmonyOS**. **TV apps are coming soon** and are not available yet. The pages are the same `.kreft` files everywhere; each target only adds a native shell around them.

### Where a Kreft app runs

| Target | Shell | Add it | Run it | Package it | Status |
|---|---|---|---|---|---|
| Web application | the browser | `kreft new my-app` | `kreft dev` | `kreft build` | Tested |
| macOS (Electron) | Electron | `kreft add electron` | `kreft electron:dev` | `kreft electron:build --mac` | Tested |
| Linux (Electron) | Electron | `kreft add electron` | `kreft electron:dev` | `kreft electron:build --linux` | Not tested here |
| Windows (Electron) | Electron | `kreft add electron` | `kreft electron:dev` | `kreft electron:build --win` | Not tested here |
| macOS (Tauri) | Tauri | `kreft add tauri` | `kreft tauri:dev` | `kreft tauri:build` | Tested |
| Linux (Tauri) | Tauri | `kreft add tauri` | `kreft tauri:dev` | `kreft tauri:build` | Not tested here |
| Windows (Tauri) | Tauri | `kreft add tauri` | `kreft tauri:dev` | `kreft tauri:build` | Not tested here |
| iOS | Capacitor | `kreft new my-app --mobile` | `kreft mobile:run --ios` | `kreft mobile:release --ios` | Not tested here |
| Android | Capacitor | `kreft new my-app --mobile` | `kreft mobile:run --android` | `kreft mobile:release --android` | Tested |
| HarmonyOS | ArkTS web view | `kreft new my-app --harmony` | `kreft harmony:open` (DevEco Studio) | `kreft mobile:release --harmony` | Not tested here |
| Android TV, tvOS, webOS, Tizen | | | | | **Coming soon** |

**What the status means.** *Tested* means Kreft's own tests ran it for real: the Electron and Tauri apps were started on macOS and checked (menu, DevTools, window, security, production builds), and an Android app was run on the emulator and built as a signed release. *Not tested here* means the same code is meant to run on that system, but Kreft has not run it there: build it on that system and check it before you ship. *Coming soon* means planned and not available.

### Which one do I choose?

| I want… | Choose |
|---|---|
| A website only | The web. Nothing to add. |
| A desktop app, and I want the page to look the same on every system | **Electron**. It ships its own Chromium. Needs only Node.js. Installers are about 100 MB. |
| A desktop app with a small installer, and I can use Rust | **Tauri**. It uses the system's web view. Installers are a few megabytes. Needs Rust. |
| An app in Google Play | **Android**. |
| An app in the App Store | **iOS**. Needs a Mac with Xcode and a paid Apple Developer account. |
| An app for Huawei phones and tablets | **HarmonyOS**. Needs DevEco Studio. |

Both desktop runtimes can live in one project (`kreft add electron tauri`), and a project can have desktop and phone targets together (`kreft new my-app --mobile --electron`). They share your pages. See [Desktop configuration](#desktop-configuration) for the settings file each one reads.

### What each target needs

| Target | You need installed |
|---|---|
| Web | Node.js 22.5 or newer |
| Electron | Node.js (Electron and electron-builder come with `kreft add electron`) |
| Tauri | Node.js and [Rust](https://rustup.rs); on Linux the WebKitGTK libraries; on Windows the Visual Studio C++ build tools |
| Android | Android Studio and a Java from 21 to 23 |
| iOS | A Mac with Xcode |
| HarmonyOS | DevEco Studio (and a Huawei developer account to sign for a real device) |

Build a desktop installer **on the system it is for**: a macOS installer needs a Mac, a Windows installer is best built on Windows, a Linux one on Linux.

### What is different on each target

- **The backend does not run inside an app.** A desktop or phone app holds your built pages. Point the API client at a server you host (for phones, build with `--api-url https://…`). See [Desktop apps with Electron](#desktop-apps-with-electron) and [Mobile apps](#mobile-apps-ios-and-android).
- **The address style.** A packaged app loads its pages from files, so the router uses `mode: 'hash'` there; `harmony:init` sets that up so the website keeps its normal addresses.
- **The native bridge differs.** Electron gives pages `window.kreftDesktop`; Tauri gives `window.__TAURI__`; the phone apps give `Kreftjs.native` (camera, files, share, haptics…). Write the page once and ask which one it is running in:

```js
if (Kreftjs.isElectron) {            // an Electron window
  kreftDesktop.notify('Saved', 'Your note was saved.')
} else if (Kreftjs.isTauri) {        // a Tauri window
  window.__TAURI__.event.emit('saved')
} else if (Kreftjs.native.isNative()) {  // an iOS or Android app
  Kreftjs.native.system.share({ text: 'Hello' })
}

Kreftjs.native.platform()    // 'ios' | 'android' | 'electron' | 'tauri' | 'web'
Kreftjs.native.isDesktop()   // true in Electron and Tauri
```

HarmonyOS apps run your pages in a web view, so they behave as the web there; use feature checks (`'share' in navigator`) for anything that depends on the device.

### TV apps (coming soon)

TV apps are **planned and not available yet**. Kreft has no TV packaging and no remote-control navigation today. What is planned:

| Target | Plan |
|---|---|
| Android TV | The Android app, with a remote-control (D-pad) focus ring and a TV layout kit |
| Apple tvOS | A tvOS shell around the same pages |
| LG webOS | A packaged web app for LG TVs |
| Samsung Tizen | A packaged web app for Samsung TVs |

There is no release date, and nothing here is promised until it ships and is tested. Until then, a TV that has a web browser can open your website; that is not a packaged TV app and has no focus handling for a remote.

### Platform commands at a glance

| I want to… | Command |
|---|---|
| Add Electron or Tauri to an app | `kreft add electron`, `kreft add tauri`, or `kreft add electron tauri` |
| Check the desktop settings | `kreft electron:config`, `kreft tauri:config` |
| Run a desktop app | `kreft electron:dev`, `kreft tauri:dev` |
| Make desktop installers | `kreft electron:build [--mac] [--win] [--linux]`, `kreft tauri:build` |
| Add phone support | `kreft new my-app --mobile`, or `kreft mobile:init` |
| Run on a phone or emulator | `kreft mobile:run --android`, `kreft mobile:run --ios`, `kreft mobile:dev` |
| Add HarmonyOS | `kreft new my-app --harmony`, or `kreft harmony:init` |
| Build and open HarmonyOS | `kreft harmony:build --api-url https://…`, `kreft harmony:open` |
| Release a phone app | `kreft mobile:release --android`, `--ios`, `--harmony`; the steps are in [Publishing your app to Google Play and the App Store](#publishing-your-app-to-google-play-and-the-app-store) |

## Desktop apps with Electron

Kreft can package your app as a desktop application for Windows, macOS and Linux. The pages are the same `.kreft` files you already have; Electron only supplies the window.

### Quick start

```bash
kreft new my-app --electron   # a new app with desktop support
cd my-app && npm install
kreft electron:dev            # a desktop window only (the server is hidden), with hot reload
kreft electron:build          # an installer in dist-electron/
```

Add desktop support to an existing app instead:

```bash
kreft add electron            # config/electron.config.js, electron/, scripts, packages (runs npm install)
```

Everything you can change (window, menu, DevTools, security, tray, updates, installers) is in `config/electron.config.js`: see [Desktop configuration](#desktop-configuration).

### Commands

| Command | What it does |
|---|---|
| `kreft add electron` | Writes `config/electron.config.js`, the generated `electron/main.js` and `electron/preload.js` and the app icon `build/icon.png`, adds the scripts (including `electron:build:mac`, `:win`, `:linux` and `:all`) and the `electron` and `electron-builder` dev dependencies to `package.json`, and runs `npm install`. An existing config file is never replaced without a yes (`--force` replaces it). `kreft electron:init` (alias `make:electron`) does the same without `npm install`. It also removes the Google Fonts links from `index.html`, so the app starts without a network. |
| `kreft electron:config` | Checks `config/electron.config.js` and prints the final settings (`--json` for machines). |
| `kreft electron:dev` | Checks the settings, then opens the app in a desktop window only: no browser opens and no URL is printed. The dev server runs hidden on a private port of your computer that only the window uses (hot reload works). Closing the window stops the server. Flags after the command go to the dev server. |
| `kreft electron:build` | Runs `kreft build --base ./`, then `electron-builder`. With no flag it builds for the system you are on. |
| `kreft electron:build --mac` | `.dmg` and `.zip` for macOS. |
| `kreft electron:build --win` | NSIS installer and portable `.exe` for Windows. |
| `kreft electron:build --linux` | AppImage, `.deb` and `.rpm` for Linux. |
| `kreft electron:build --mac --win --linux` | All three systems in one run. |
| `kreft electron:build --all` | The same as `--mac --win --linux`. |
| `npm run electron:build:mac`, `:win`, `:linux`, `:all` | Shortcuts for the four commands above. |

Other flags go straight to electron-builder: `--x64`, `--arm64`, `--ia32`, `--armv7l`, `--universal` (macOS) and `--dir` (an unpacked app folder only, no installer: fast for testing).

`kreft electron` is the same as `kreft electron:dev`. If the `electron/` folder is missing, both commands create it first.

### Quick reference

| I want to… | Do this |
|---|---|
| Add desktop support | `kreft new my-app --electron`, or `kreft add electron` in an existing app |
| Open the app in its window | `kreft electron` (no browser, no URL) |
| Open DevTools | `kreft electron --devtools=bottom`, `devtools.openOnStart` in the config file, or F12 |
| Show, auto-hide or hide the menu | `menu.visibility` (`'hidden'` is the default), `kreft electron --menu=visible`; `kreftDesktop.setMenu('visible')` |
| Change any setting | Edit `config/electron.config.js`, or `--set window.width=1000` for one run |
| Change the icon | Replace `build/icon.png` (square PNG, 512×512 or bigger) |
| Change the app name and id | `app.name` and `app.id` in `config/electron.config.js` |
| Make an installer | `npm run electron:build:mac`, `:win`, `:linux` or `:all` |
| Get help in the terminal | `kreft electron:help` |

### Project layout

```text
my-app/
├── config/
│   └── electron.config.js   your settings: the only file you edit
├── electron/
│   ├── main.js        generated: the main process, reads your settings (do not edit)
│   ├── preload.js     generated: the safe bridge exposed to your pages as window.kreftDesktop
│   ├── custom.js      yours, optional: your own main-process code (see "Your own code")
│   ├── kreft.resolved.json    written by the commands: your settings, checked and merged
│   └── builder.config.json    written by the commands: the electron-builder configuration
├── dist/              the static build the packaged app loads
├── dist-electron/     installers written by electron-builder
└── package.json       "main": "electron/main.js"
```

### How it runs

- **Development.** The window loads `http://localhost:8000` (change it with `PORT`). Hot reload, the DevTools button and the error overlay work as in the browser.
- **Packaged.** The window loads `dist/index.html` from disk. That is a static build, so the Kreft backend (`routes/`, the database, `kreft serve`) is **not** inside the app. Point the API client at a server you host:

```js
const api = Kreftjs.api.create({ base: 'https://api.example.com' })
```

  Use a `PUBLIC_` value from `.env` for the address, so development and production can differ. Remember that CORS on your server must allow the app.

### Detecting the desktop app

```js
if (Kreftjs.isElectron) {
  const info = await Kreftjs.desktop.getInfo()   // { name, version, platform, arch, isPackaged }
}
```

`Kreftjs.desktop` is `null` in a normal browser, so the same page works in both.

### The desktop bridge

`window.kreftDesktop` (also `Kreftjs.desktop`) is the only way your pages reach the system. Nothing else from Node.js or Electron is exposed.

| Function | Result |
|---|---|
| `getInfo()` | `{ name, version, platform, arch, isPackaged }` |
| `minimize()`, `maximize()`, `close()` | Control the window. `maximize()` toggles. |
| `openDevTools(mode)`, `closeDevTools()`, `toggleDevTools()` | DevTools; `mode` is `right`, `bottom`, `left` or `detach`. |
| `showMessageBox(options)` | A native message dialog. |
| `showOpenDialog(options)` | A native "open file" dialog. |
| `showSaveDialog(options)` | A native "save file" dialog. |

Every call returns a promise. The dialog functions pass on only a fixed list of options (for example `title`, `filters`, `properties`); anything else is dropped.

```kreftjs
state path = ''

async function pick() {
  const r = await Kreftjs.desktop.showOpenDialog({
    title: 'Choose a file',
    filters: [{ name: 'Images', extensions: ['png', 'jpg'] }],
    properties: ['openFile'],
  })
  if (!r.canceled) path = r.filePaths[0]
}
```

### Adding your own desktop function

`electron/main.js` and `preload.js` are generated, so your code goes in `electron/custom.js`:

1. In `electron/custom.js`, register a handler whose name starts with `app:`: `ipcMain.handle('app:ping', () => 'pong')`.
2. Call it from a page: `await kreftDesktop.invoke('app:ping')`.

Pages can reach only channels that start with `app:`, never the built-in ones. Expose one narrow function per task. Never pass a path or a command from a page straight to the file system or a shell without checking it in `custom.js`. See [Your own code](#your-own-code).

### DevTools

They are available while you work, closed when the window opens, and **off in the installed app**. All three are settings (`devtools.development`, `devtools.openOnStart`, `devtools.production`, `devtools.mode`). To open them at start for one run:

```bash
kreft electron:dev --devtools          # right side
kreft electron:dev --devtools=bottom   # bottom, left or detach
kreft electron:dev --no-devtools
ELECTRON_DEVTOOLS=bottom kreft electron:dev
```

F12 or Ctrl+Shift+I toggles them (Cmd+Option+I on macOS) where they are allowed. In production they are refused: the shortcuts do nothing and DevTools that open anyway are closed. See [Desktop configuration](#desktop-configuration).

### The window menu

The menu bar is **hidden by default**. Set `menu.visibility` in `config/electron.config.js` (`'hidden'`, `'visible'` or `'auto'`), or for one run:

```bash
kreft electron --menu=visible        # the menu bar
kreft electron --menu=auto           # hidden, press Alt to show it (Windows and Linux)
ELECTRON_MENU=show kreft electron    # the older variable still works: show | auto | hide
```

Or change it while the app runs, from a page:

```js
window.kreftDesktop.setMenu('visible')   // 'visible' | 'auto' | 'hidden' ('show' and 'hide' also work)
window.kreftDesktop.getMenu()            // the current mode
```

Your own menu goes in `menu.template` (see [Desktop configuration](#desktop-configuration)).

On macOS the menu lives in the top bar of the screen, so `visible` and `auto` look the same, and `hidden` keeps only an app menu (with Quit) and an Edit menu, because macOS always has a menu bar and copy and paste need Edit. For your own menu (File, Edit…), use `menu.template`; to send a click to the page, give the entry an `id` and listen with `kreftDesktop.onMenu`.

### The app icon

`kreft add electron` copies the Kreft logo to `build/icon.png`. Replace it with your own square PNG, 512×512 or bigger (or point `packaging.icon` at another file). The window uses it, and electron-builder makes the `.icns` (macOS) and `.ico` (Windows) files from it. The app name and id are `app.name` and `app.id` in `config/electron.config.js`.

### Packaging and installers

```bash
kreft electron:build --mac                 # .dmg and .zip
kreft electron:build --win                 # NSIS installer and portable .exe
kreft electron:build --linux               # AppImage, .deb and .rpm
kreft electron:build --mac --win --linux   # all three
kreft electron:build --all                 # the same as the line above
```

The `package.json` scripts do the same: `npm run electron:build:mac`, `:win`, `:linux` and `:all`.

`electron:build` checks your settings, writes `electron/builder.config.json` from them and runs electron-builder, which writes to `dist-electron/` (`packaging.electron.outputDir`). Flags go to electron-builder, for example `kreft electron:build --mac --arm64`. The defaults are:

| System | Targets |
|---|---|
| Windows | `nsis` installer (choose the folder), `portable` |
| macOS | `dmg`, `zip` |
| Linux | `AppImage`, `deb`, `rpm` |

Change the targets in `packaging.electron` (`mac`, `win`, `linux`) and the app id and name in `app`; anything else electron-builder knows goes in `advanced.builder`. The `build` block of `package.json` is not used any more. Build for each system on that system: a macOS installer needs a Mac (on a Mac, the Linux `AppImage` and the Windows installers build, but `.deb` and `.rpm` fail: build those on Linux, or remove them from `build.linux.target`). Code signing and notarisation (macOS) or a signing certificate (Windows) are set up through electron-builder (electron.build/code-signing) and are needed before you give the app to other people; unsigned macOS apps show a Gatekeeper warning.

The packaged app loads the built `dist/index.html` and does not start a backend. A frontend-only app works as is; a full-stack app (login, database) does not work once installed.

### `npm run build` or `electron:build`?

Adding Electron does not change `npm run build`. The two commands make different things:

| Command | What it makes | Use it for |
|---|---|---|
| `npm run build` | The website in `dist/`, with paths that start at `/` (the `docs/` folder is included). | Putting the app on a web server. |
| `npm run electron:build` | The same site built with `--base ./` so it opens from a file, then an installer in `dist-electron/`. | Giving the app to people as a desktop program. |

A `dist/` made by `npm run build` shows a white window if you open it in Electron, because its paths start at `/`. Run `electron:build` (or `kreft build --base ./`) first. Doing both is fine: `electron:build` rewrites `dist/`, so run `npm run build` again before you deploy the website.

### Security

The window follows Electron's security guidance, and each of these is a setting in `security` (the defaults are the safe values; turning one off prints a note):

- `contextIsolation`, `sandbox` and `webSecurity` are on; `nodeIntegration` and `allowRunningInsecureContent` are off.
- Links to other sites open in the system browser, and new windows are denied.
- Navigation away from the app is blocked: only the dev server (development) or files inside `dist/` (packaged) can load.
- The bridge exposes named functions only, with the option lists described above.

Do not turn these off to make something work. Add a function in `electron/custom.js` instead. The permission requests of a page (location, camera, clipboard…) are all refused unless listed in `security.permissions`.

### Troubleshooting

| Problem | Fix |
|---|---|
| `Electron is not installed locally` | `kreft add -D electron` |
| `electron-builder is not installed` | `kreft add -D electron-builder` |
| A white window in the packaged app | Run `electron:build` again; the build must use `--base ./`. Check that `dist/index.html` exists. |
| API calls fail in the packaged app | The backend is not bundled. Set an absolute `base` for the API client (see above). |
| The window opens before the server is ready | It waits up to 15 seconds. Check the terminal for a dev server error. |
| Port 8000 is taken | Nothing to do: the hidden server picks the next free port. |

## Desktop apps with Tauri

Tauri is the other way to make a desktop app from your Kreft project. Your pages are the same `.kreft` files. Instead of shipping a browser like Electron, Tauri uses the web view the system already has (WebView2 on Windows, WebKit on macOS and Linux), so installers are small and the app uses less memory. The trade-off is that the small native part is written in Rust.

### What you need

| You need | Why |
|---|---|
| [Rust](https://rustup.rs) (`cargo`) | Tauri compiles a small Rust program around your pages. Open a new terminal after installing. |
| Linux only | `webkit2gtk` and a few libraries. See [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/). |
| Windows only | The Visual Studio C++ build tools. WebView2 is already part of Windows 10 and 11. |

Install Rust once: from [rustup.rs](https://rustup.rs), or on a Mac with Homebrew:

```bash
brew install rustup
rustup default stable
```

Check it with `cargo --version`. Homebrew's `rustup` is *keg-only* (not linked into your normal path), so add it to your shell profile and open a new terminal:

```bash
echo 'export PATH=/opt/homebrew/opt/rustup/bin:$PATH' >> ~/.zshrc
```

Rust from rustup.rs puts `cargo` in `~/.cargo/bin`, which its installer adds to your path. `kreft tauri` also looks in `~/.cargo/bin` and in the Homebrew folder by itself, so it works even in a terminal that was opened before you installed Rust.

### Start

```bash
kreft new my-app --tauri      # a new project with Tauri included
cd my-app
npm install                   # installs @tauri-apps/cli
kreft tauri                   # opens the app in a desktop window
```

For a project you already have, run `kreft add tauri` (it also runs `npm install`). `kreft tauri:init` (alias `kreft make:tauri`) does the same without installing. It writes `config/tauri.config.js`, adds a `src-tauri/` folder and three scripts to `package.json`, and never replaces your config file without a yes. Everything you can change (window, menu, DevTools, security, tray, updates, installers) is in `config/tauri.config.js`: see [Desktop configuration](#desktop-configuration).

| Command | What it does |
|---|---|
| `kreft tauri` (or `tauri:dev`) | Starts the dev server on a free port and opens a Tauri window on it. No browser tab opens. Close the window to stop both. `--port N` chooses the port. |
| `kreft tauri:build` | Runs `kreft build --base ./`, then `tauri build`. Installers are written to `src-tauri/target/release/bundle/`. |
| `kreft tauri:init` | Adds Tauri to an existing project (`kreft add tauri` also installs the packages). |
| `kreft tauri:config` | Checks `config/tauri.config.js` and prints the final settings (`--json` for machines). |
| `kreft tauri:sync` | Writes `src-tauri/` from the settings. `tauri:dev` and `tauri:build` do it by themselves. |
| `kreft tauri:help` | Prerequisites, files and options. |

`tauri:build` builds for the system you run it on. Options: `--debug` (faster, larger build), `--bundles dmg|app|nsis|msi|deb|rpm|appimage` (which installers to make), `--target <rust-triple>` (another CPU). The first build compiles Rust and takes several minutes; later builds are quick.

### The files

| File | What it is |
|---|---|
| `config/tauri.config.js` | **Your settings.** The only file you edit. |
| `src-tauri/tauri.conf.json` | Generated from your settings: name, identifier, window, security, installers. Options this file lacks go in `advanced.tauriConf`. |
| `src-tauri/capabilities/default.json` | Generated: what the window may do (`core:default`, plus notifications and updates when on, plus `security.capabilities`). |
| `src-tauri/src/kreft_generated.rs` | Generated: menu, DevTools, right-click menu, tray, notifications and updates. Never edit it. |
| `src-tauri/src/main.rs` | **Yours.** Written once; it calls `kreft_generated::apply`. Add your own commands here. |
| `src-tauri/Cargo.toml` | Rust dependencies. Kreft rewrites only the lines between its two `kreft-generated` comments; add your own crates anywhere else. |
| `build/icon.png` | The app icon: a square PNG, 1024x1024 is best. Kreft writes a default one if you have none. `kreft tauri` makes every size from it into `src-tauri/icons/` with `tauri icon` whenever one is missing. To use your own, replace the file and run `npx tauri icon build/icon.png`. |

### In the page

`window.__TAURI__` exists only inside the Tauri window, so you can tell it from a browser:

```js
if (window.__TAURI__) {
  const name = await window.__TAURI__.core.invoke('greet', { name: 'Ada' })
}
```

`invoke` calls a Rust command that you write in `main.rs` and register with `.invoke_handler(tauri::generate_handler![greet])`.

### Electron or Tauri?

| | Electron | Tauri |
|---|---|---|
| Installer size | About 100 MB | A few MB |
| Needs | Node.js only | Node.js and Rust |
| Web view | Its own Chromium, the same everywhere | The system's, so small differences between systems |
| Your own system code | JavaScript (`window.kreftDesktop` bridge) | Rust commands |

`window.kreftDesktop` and the other Electron-only helpers do not exist in a Tauri window.

### The app icon

Tauri needs the icon in several sizes (`src-tauri/icons/32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns`, `icon.ico`) and will not compile without them. You do not have to make them: `kreft tauri` and `kreft tauri:build` make every size from `build/icon.png` whenever one is missing, and write a default `build/icon.png` first if your project has none.

To use your own icon, put a square PNG (1024x1024 is best) at `build/icon.png`, then make the sizes again. Run it **inside your project folder**, where `node_modules` is:

```bash
cd my-app
npx tauri icon build/icon.png
```

`tauri icon` also writes iOS and Android icon folders next to the desktop ones. A Tauri desktop app does not use them, so you can ignore them.

> [!NOTE]
> If `npx tauri` says `could not determine executable to run`, you are in the wrong folder or the command line is not installed. `cd` into your project and run `npm install` (it installs `@tauri-apps/cli`). Check with `ls node_modules/.bin | grep tauri`.

### What has been tested

`tauri:init`, `kreft new --tauri`, `tauri:dev` (the window opens on a free port and closes together with the dev server) and `tauri:build --debug --bundles app` (a macOS `.app`) were run with Rust 1.99 on macOS. Release installers, Windows and Linux were not tested.

### Tauri troubleshooting

| Problem | Fix |
|---|---|
| `Rust is not installed (cargo was not found)` | Install Rust (see the install steps above). If it is installed already, your terminal cannot see it: run `cargo --version`; if that says "command not found", add its folder to your path: `export PATH="$HOME/.cargo/bin:$PATH"` for rustup.rs, or `export PATH=/opt/homebrew/opt/rustup/bin:$PATH` for Homebrew (put the line in `~/.zshrc`, then open a new terminal). `kreft tauri` already looks in both folders, so this error usually means Rust is not installed at all. |
| `failed to open icon …/icons/32x32.png` (a Rust "proc macro panicked" error) | The icon sizes were not made. In your project folder run `npx tauri icon build/icon.png` (any square PNG works; if you have none, copy one to `build/icon.png` first). Kreft versions after 0.0.28-beta do this by themselves. |
| `npx tauri` says `could not determine executable to run` | You are not in your project folder, or `@tauri-apps/cli` is not installed. `cd` into the project and run `npm install`. |
| `The Tauri command line is not installed` | Run `npm install` (or `kreft add -D @tauri-apps/cli`). |
| A white window in the packaged app | Run `tauri:build` again; the build must use `--base ./`. Check that `dist/index.html` exists. |
| API calls fail in the packaged app | The backend is not bundled. Set an absolute `base` for the API client, as for Electron. |
| Linux build fails on `webkit2gtk` | Install the Linux libraries listed above. |
| Port 8000 is taken | Nothing to do: the dev server picks the next free port. |

## Desktop configuration

Electron and Tauri apps are set up from **one readable JavaScript file each**: `config/electron.config.js` and `config/tauri.config.js`. You change the window, the menu, DevTools, security, the tray, notifications, updates and the installers there. You never edit the native files Kreft generates (`electron/main.js`, `src-tauri/tauri.conf.json`, `src-tauri/src/kreft_generated.rs`): they read your settings.

### Add a runtime

```bash
kreft add electron            # config/electron.config.js, electron/, scripts, packages (runs npm install)
kreft add tauri               # config/tauri.config.js, src-tauri/, scripts, packages
kreft add electron tauri      # both, side by side
```

| Flag | What it does |
|---|---|
| `--no-install` | Do not run `npm install`. |
| `--force` | Replace an existing config file with the defaults (the old one is saved as `.bak`). |

**An existing config file is never replaced without a yes.** On a terminal `kreft add` asks `Replace it with the default settings? [y/N]`. Without a terminal (CI) it keeps your file and tells you to use `--force`. `kreft new my-app --electron` and `--tauri` write the same files. `kreft electron:init` and `kreft tauri:init` do the same as `add`, without installing packages.

### The config file

The file lists every option with its default, so you can see what exists. Change a value, save, run `kreft electron:dev` (or `tauri:dev`) again. Options you delete keep their default.

```js
// config/electron.config.js (a CommonJS project)
/** @type {import('kreftjs/desktop').ElectronConfig} */
module.exports = {
  window: { width: 1000, height: 700 },
  menu: { visibility: 'hidden' },
  devtools: { openOnStart: false },
}
```

In a project with `"type": "module"` in `package.json` the file uses `export default { … }` instead; `kreft add` writes the right form. A `.cjs` or `.mjs` file name also works. The file may export a function that returns the settings (it may be `async`), which receives the mode (`'development'` or `'production'`), the platform and the environment:

```js
// example: electron
module.exports = ({ mode }) => ({
  window: { title: mode === 'development' ? 'My app (dev)' : 'My app' },
  devtools: { openOnStart: mode === 'development' },
})
```

### What is used, in this order

The last one wins. Each layer is checked on its own, then they are merged group by group (a list is replaced, not added to).

| # | Layer | Where | Applies to |
|---|---|---|---|
| 1 | Built-in defaults | the tables below | the runtime |
| 2 | Shared KreftJS configuration | `kreftjs.config.json` → `"desktop"` | both runtimes |
| 3 | Shared environment | `KREFT_DESKTOP_WINDOW_WIDTH=1000` | both runtimes |
| 4 | Runtime configuration file | `config/electron.config.js`, `config/tauri.config.js` | one runtime |
| 5 | Runtime environment | `KREFT_ELECTRON_WINDOW_WIDTH=1000`, `KREFT_TAURI_WINDOW_WIDTH=1000` (and the older `ELECTRON_MENU`, `ELECTRON_DEVTOOLS`) | one runtime |
| 6 | Command line | `--set window.width=1000`, `--menu=visible`, `--devtools[=mode]`, `--no-devtools` | one run |

Layers 2 and 3 serve both runtimes, so an option or value one runtime does not have (`security.sandbox` in Tauri, `menu.visibility: 'auto'` in Tauri) is **ignored there with a note**, not an error. In layers 4 to 6 the same mistake is an error, because you wrote it for that runtime.

```json
{ "desktop": { "window": { "width": 1100, "height": 760 }, "tray": { "enabled": true } } }
```

The environment variable name of an option is its path in capitals with `_` between words: `window.minWidth` → `KREFT_ELECTRON_WINDOW_MIN_WIDTH`. A list is written with commas (`KREFT_ELECTRON_SECURITY_PERMISSIONS=geolocation,media`) or as JSON. `--set` takes any option (`--set devtools.mode=bottom --set window.resizable=false`); a value is read as JSON when it can be (`true`, `1000`, `null`), as text otherwise.

### Check your settings

```bash
kreft electron:config       # checks config/electron.config.js and prints the final settings
kreft tauri:config --json   # the same for Tauri, as JSON
```

`dev` and `build` check the settings too, **before** they start anything, so a mistake stops a build before it spends minutes. Every option is validated: unknown names, wrong types, numbers out of range, values the runtime does not support. All the problems are listed together, with where they come from:

```text
The tauri configuration has 3 problems:
  - menu.visibility: "auto" is not allowed in tauri (that value is for Electron). Use one of: hidden, visible.
    (from config/tauri.config.js)
  - window.widht: unknown option. Did you mean "width"? The options in window are: title, width, height, …
    (from config/tauri.config.js)
  - window.minWidth: is 1300, larger than window.width (1200). Lower minWidth or raise width.
```

Settings that are allowed but unsafe (`security.nodeIntegration: true`, `devtools.production: true`…) are not errors; each one prints a note.

### The defaults

| Setting | Default | Meaning |
|---|---|---|
| `menu.visibility` | `'hidden'` | No menu bar. On macOS the system menu bar always exists, so a minimal app menu (Quit) and an Edit menu stay: without Edit, Cmd+C and Cmd+V stop working. |
| `devtools.development` | `true` | DevTools are available while you work (F12 or Ctrl+Shift+I; Cmd+Option+I on macOS). |
| `devtools.openOnStart` | `false` | …but closed when the window opens. Set it to `true` to open them by themselves. |
| `devtools.production` | `false` | No DevTools in the installed app: the shortcuts do nothing, and in Electron DevTools that open anyway are closed. In Tauri a release build is made without its `devtools` feature. |
| Electron `security` | `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true` | Pages cannot reach Node.js. Turning one off prints a note. |
| `security.blockNewWindows` | `true` | A page cannot open windows; a link to another site opens in the system browser. |
| `webview.allowedNavigation` | `[]` | The window cannot go to any site except the app itself. |
| `notifications.enabled` | `false` | A page may not show notifications until you allow it. |
| `window` | 1200 × 800, minimum 800 × 600 | Resizable, centered. In both runtimes the size is the page area, without the title bar. |

### Every option

Runtime says where the option exists. Setting an Electron-only option in `config/tauri.config.js` (or the other way round) is an error that tells you what to use instead.

<!-- desktop-options:start (made by "node bin/desktop/docs.js --write": do not edit between the markers) -->

#### `app`

Name, id and version of the app.

| Option | Runtime | Default | What it does |
|---|---|---|---|
| `app.name` | both | `null` | The name people see. Default: the "productName" or "name" in package.json. |
| `app.id` | both | `null` | The reverse-domain id, for example "com.acme.notes". Default: com.kreftjs. followed by the lowercase name. |
| `app.version` | both | `null` | The version number. Default: the "version" in package.json. |
| `app.description` | both | `null` | A one-line description. Default: the "description" in package.json. |
| `app.author` | both | `null` | Who makes the app. Default: the "author" in package.json. |
| `app.homepage` | both | `null` | The web address of the app. Default: the "homepage" in package.json. |
| `app.copyright` | both | `null` | The copyright line shown in the installer and the About box. |

#### `window`

How the main window looks and behaves.

| Option | Runtime | Default | What it does |
|---|---|---|---|
| `window.title` | both | `null` | The window title. Default: the app name. |
| `window.width` | both | `1200` | Width in pixels. From 200 to 16000. |
| `window.height` | both | `800` | Height in pixels. From 150 to 16000. |
| `window.minWidth` | both | `800` | The window cannot be made narrower than this. From 0 to 16000. |
| `window.minHeight` | both | `600` | The window cannot be made lower than this. From 0 to 16000. |
| `window.maxWidth` | both | `null` | The window cannot be made wider than this. null: no limit. From 200 to 32000. |
| `window.maxHeight` | both | `null` | The window cannot be made higher than this. null: no limit. From 150 to 32000. |
| `window.x` | both | `null` | Distance from the left edge of the screen. null: the system chooses (or the window is centered). From -32000 to 32000. |
| `window.y` | both | `null` | Distance from the top edge of the screen. null: the system chooses (or the window is centered). From -32000 to 32000. |
| `window.center` | both | `true` | Open the window in the middle of the screen (ignored when x and y are set). |
| `window.resizable` | both | `true` | Let people resize the window. |
| `window.fullscreen` | both | `false` | Open the window in full screen. |
| `window.maximized` | both | `false` | Open the window maximized. |
| `window.alwaysOnTop` | both | `false` | Keep the window above all others. |
| `window.frame` | both | `true` | Draw the system title bar and border. false: a window without them. |
| `window.transparent` | both | `false` | A see-through window background (the page must draw its own background). |
| `window.backgroundColor` | both | `'#ffffff'` | The colour shown before the page has drawn, as #rrggbb. |
| `window.theme` | both | `'system'` | The look of the window frame and the system dialogs. Values: `system`, `light`, `dark`. |
| `window.skipTaskbar` | both | `false` | Keep the window out of the taskbar or dock. |
| `window.showOnReady` | Electron | `true` | Show the window only when the page is ready, so it never opens as a white flash. |

#### `menu`

The native application menu.

| Option | Runtime | Default | What it does |
|---|---|---|---|
| `menu.visibility` | both | `'hidden'` | "hidden": no menu bar. "visible": the menu bar. "auto": hidden until Alt is pressed (Electron on Windows and Linux only). On macOS the system menu bar always exists, so "hidden" keeps a minimal app and Edit menu: without them, copy and paste shortcuts stop working. Values: Electron `hidden`, `visible`, `auto`; Tauri `hidden`, `visible`. |
| `menu.template` | both | `null` | Your own menu, as a list of top-level entries with a submenu. null: the default menu of the runtime. |

#### `contextMenu`

The right-click menu.

| Option | Runtime | Default | What it does |
|---|---|---|---|
| `contextMenu.enabled` | both | `true` | Allow the right-click menu. false: right-click does nothing. |
| `contextMenu.items` | Electron | `['copy', 'cut', 'paste', 'selectAll']` | The entries of the right-click menu on text. |
| `contextMenu.inspectElement` | Electron | `true` | Add "Inspect element" when DevTools are allowed. |

#### `devtools`

The developer tools.

| Option | Runtime | Default | What it does |
|---|---|---|---|
| `devtools.development` | both | `true` | Allow DevTools while you work (kreft electron:dev, kreft tauri:dev). |
| `devtools.production` | both | `false` | Allow DevTools in the installed app. Keep it false unless you need to debug a release. |
| `devtools.openOnStart` | both | `false` | Open DevTools by themselves when the window opens (only where they are allowed). |
| `devtools.mode` | both | Electron `'right'`, Tauri `'detach'` | Where DevTools open. Tauri can only open them in their own window. Values: Electron `right`, `bottom`, `left`, `detach`; Tauri `detach`. |
| `devtools.shortcut` | both | `true` | F12 and Ctrl+Shift+I (Cmd+Option+I on macOS) toggle DevTools where they are allowed. |

#### `webview`

The web page inside the window.

| Option | Runtime | Default | What it does |
|---|---|---|---|
| `webview.zoomFactor` | both | `1` | The page zoom. 1 is 100 %. From 0.25 to 5. |
| `webview.userAgent` | both | `null` | Text sent to servers as the browser name. null: the default of the runtime. |
| `webview.spellcheck` | Electron | `false` | Underline misspelled words in text fields. |
| `webview.backgroundThrottling` | Electron | `true` | Slow the page down when the window is hidden. |
| `webview.openExternalLinksInBrowser` | both | `true` | A link to another site opens in the system browser, not in the app window. |
| `webview.allowedNavigation` | both | `[]` | Origins (like "https://login.acme.com") the window may go to besides the app itself. Everything else is blocked. |

#### `security`

What the page may do. The defaults are the safe ones.

| Option | Runtime | Default | What it does |
|---|---|---|---|
| `security.csp` | both | `null` | The Content-Security-Policy of the pages, for example "default-src 'self'". null: none is added. |
| `security.blockNewWindows` | both | `true` | Pages cannot open new windows. |
| `security.contextIsolation` | Electron | `true` | Keep the page and the preload script in separate JavaScript worlds. |
| `security.sandbox` | Electron | `true` | Run the page in the operating system sandbox. |
| `security.nodeIntegration` | Electron | `false` | Give the page access to Node.js. Leave it false: any script on the page could then run programs on the computer. |
| `security.webSecurity` | Electron | `true` | Keep the same-origin policy of the browser. |
| `security.allowRunningInsecureContent` | Electron | `false` | Let an https page load http scripts. |
| `security.permissions` | Electron | `[]` | Browser permissions the page may get, for example "geolocation", "media", "clipboard-read". Notifications are allowed by notifications.enabled. |
| `security.capabilities` | Tauri | `[]` | Extra Tauri permissions for the window, like "dialog:default" (the plugin must also be added in src-tauri/Cargo.toml). "core:default" is always there. |
| `security.globalTauri` | Tauri | `true` | Put the Tauri API on window.__TAURI__. |

#### `tray`

The system tray icon.

| Option | Runtime | Default | What it does |
|---|---|---|---|
| `tray.enabled` | both | `false` | Show an icon in the system tray (the menu bar on macOS). |
| `tray.icon` | both | `null` | A PNG file, relative to the project. null: the app icon. |
| `tray.tooltip` | both | `null` | Text shown when the mouse rests on the icon. null: the app name. |
| `tray.closeToTray` | both | `false` | Closing the window hides it; the app keeps running in the tray. Choose "Quit" in the tray menu to leave. |
| `tray.clickAction` | both | `'toggle'` | What a click on the tray icon does. Values: `toggle`, `show`, `none`. |
| `tray.menu` | both | `[{'label':'Show', 'action':'show'}, {'type':'separator'}, {'label':'Quit', 'action':'quit'}]` | The entries of the tray menu. |

#### `notifications`

System notifications.

| Option | Runtime | Default | What it does |
|---|---|---|---|
| `notifications.enabled` | both | `false` | The page may show system notifications. In Tauri this adds the notification plugin (a crate and a permission). |

#### `updates`

Updates.

| Option | Runtime | Default | What it does |
|---|---|---|---|
| `updates.enabled` | both | `false` | Look for new versions of the app. |
| `updates.url` | both | `null` | The https address of the folder that holds the update files (Electron: latest.yml and the installers; Tauri: the update JSON). |
| `updates.channel` | both | `'latest'` | The release channel, like "latest" or "beta". |
| `updates.checkOnStart` | both | `true` | Look for an update each time the app starts (installed app only). |
| `updates.autoDownload` | Electron | `false` | Download an update without asking. |
| `updates.pubkey` | Tauri | `null` | The public key that update files are signed with (made by "npx tauri signer generate"). |

#### `packaging`

How the installers are made.

| Option | Runtime | Default | What it does |
|---|---|---|---|
| `packaging.icon` | both | `'build/icon.png'` | The app icon, a square PNG (1024×1024 is best), relative to the project. |
| `packaging.category` | both | `null` | The category in app stores and menus, like "public.app-category.productivity" (macOS) or "Utility" (Linux). null: the default of the runtime. |
| `packaging.electron.outputDir` | both | `'dist-electron'` | The folder the installers are written to. |
| `packaging.electron.mac` | both | `['dmg', 'zip']` | Installers to make for macOS. |
| `packaging.electron.win` | both | `['nsis', 'portable']` | Installers to make for Windows. |
| `packaging.electron.linux` | both | `['AppImage', 'deb', 'rpm']` | Installers to make for Linux. |
| `packaging.electron.asar` | both | `true` | Pack the app files into one archive. |
| `packaging.electron.compression` | both | `'normal'` | How much the installer is compressed. Values: `store`, `normal`, `maximum`. |
| `packaging.electron.files` | both | `['dist/**/*', 'electron/**/*', 'package.json']` | The files that go into the app (build/icon.png and the tray icon are added). |
| `packaging.electron.extraResources` | both | `[]` | Extra files copied next to the app, relative to the project. |
| `packaging.tauri.targets` | both | `null` | Installers to make. null: all that fit the system you build on. |
| `packaging.tauri.resources` | both | `[]` | Extra files that go into the app, relative to src-tauri/. |
| `packaging.tauri.macMinimumSystemVersion` | both | `'10.15'` | The oldest macOS the app runs on. |
| `packaging.tauri.windowsWebviewInstall` | both | `'downloadBootstrapper'` | How the installer gets WebView2 on Windows. Values: `skip`, `downloadBootstrapper`, `embedBootstrapper`, `offlineInstaller`. |

#### `advanced`

A way out for options this file does not know. Values here are merged into the generated native configuration last.

| Option | Runtime | Default | What it does |
|---|---|---|---|
| `advanced.builder` | Electron | `{ … }` | Merged into the electron-builder configuration. Use it for options this file does not have. |
| `advanced.tauriConf` | Tauri | `{ … }` | Merged into src-tauri/tauri.conf.json. Use it for options this file does not have. |

<!-- desktop-options:end -->

### Electron and Tauri are not the same

The two runtimes do not offer the same things, so each has its own adapter (`bin/desktop/electron-adapter.js`, `bin/desktop/tauri-adapter.js`) and the options that exist in only one are marked above. The differences that matter:

| | Electron | Tauri |
|---|---|---|
| What the settings become | `electron/kreft.resolved.json` (read by `electron/main.js`) and `electron/builder.config.json` (for electron-builder) | `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, the dependency block of `Cargo.toml` and `src-tauri/src/kreft_generated.rs` |
| Menu `'auto'` (Alt shows it) | Yes (Windows, Linux) | No |
| Custom menu roles | the shared ones, and `reload`, `forceReload`, `toggleDevTools`, `zoomIn`, `zoomOut`, `resetZoom` | the shared ones only (`undo`, `redo`, `cut`, `copy`, `paste`, `selectAll`, `minimize`, `close`, `quit`, `fullscreen`, `about`) |
| Right-click menu | You choose the entries (`contextMenu.items`) | The web view's own menu; only on or off (`contextMenu.enabled`) |
| DevTools | right, bottom, left or detached; can be switched off in development | detached window only; a development build always has them (`devtools.development` must be `true`) |
| Permissions | `security.permissions` (browser permissions) | `security.capabilities` (Tauri permissions); notifications and updates add theirs by themselves |
| Notifications | a permission, and `kreftDesktop.notify(title, body)` | the `tauri-plugin-notification` crate, added by `notifications.enabled` (use its JavaScript API in the page) |
| Updates | `electron-updater` (install it: `kreft add electron-updater`) and a `generic` feed at `updates.url` | `tauri-plugin-updater`, a signed update JSON at `updates.url` and the public key in `updates.pubkey` |
| Installers | `packaging.electron` (targets per system, `asar`, compression…) | `packaging.tauri` (`targets`, `resources`, WebView2 install mode…) |
| A way out | `advanced.builder` (merged into the electron-builder configuration) | `advanced.tauriConf` (merged into `tauri.conf.json`) |
| Page API | `window.kreftDesktop` | `window.__TAURI__` (`security.globalTauri`) |
| Events to the page | `kreftDesktop.onMenu(cb)`, `onTray(cb)`, `onUpdate(cb)` | `window.__TAURI__.event.listen('kreft:menu', cb)`, `'kreft:tray'`, `'kreft:update-available'` |

### Examples

A custom menu, a tray icon that keeps the app running, and a notification (Electron):

```js
// example: electron
module.exports = {
  menu: {
    visibility: 'visible',
    template: [
      { label: 'File', submenu: [{ label: 'New note', id: 'note-new', accelerator: 'CmdOrCtrl+N' }, { type: 'separator' }, { role: 'quit' }] },
      { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'copy' }, { role: 'paste' }] },
    ],
  },
  tray: {
    enabled: true,
    closeToTray: true,
    tooltip: 'My notes',
    menu: [{ label: 'Open', action: 'show' }, { label: 'New note', action: 'emit', id: 'note-new' }, { type: 'separator' }, { label: 'Quit', action: 'quit' }],
  },
  notifications: { enabled: true },
}
```

In the page, listen for the entries that have an `id`:

```js
if (window.kreftDesktop) {
  kreftDesktop.onMenu((id) => { if (id === 'note-new') newNote() })
  kreftDesktop.onTray((id) => { if (id === 'note-new') newNote() })
  kreftDesktop.notify('Saved', 'Your note was saved.')
}
```

A fixed-size window, no right-click menu, and a strict content policy (Tauri):

```js
// example: tauri
module.exports = {
  window: { width: 480, height: 640, minWidth: 480, minHeight: 640, resizable: false, center: true },
  contextMenu: { enabled: false },
  security: { csp: "default-src 'self'; connect-src 'self' https://api.acme.test" },
  webview: { allowedNavigation: ['https://login.acme.test'] },
}
```

Updates (Tauri). Make the key pair once with `npx tauri signer generate -w ~/.tauri/notes.key`, keep the private key secret, and put the **public** key in the file:

```js
// example: tauri
module.exports = {
  updates: {
    enabled: true,
    url: 'https://updates.acme.test/notes/{{target}}/{{current_version}}',
    pubkey: 'dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEFCQ0RFRjAxMjM0NTY3ODk=',
  },
  notifications: { enabled: true },
  security: { capabilities: ['dialog:default'] },
}
```

Updates and installers (Electron), with an option this file does not have, passed on to electron-builder:

```js
// example: electron
module.exports = {
  app: { id: 'com.acme.notes', name: 'Acme Notes', copyright: 'Copyright © 2026 Acme' },
  updates: { enabled: true, url: 'https://updates.acme.test/notes', channel: 'latest' },
  packaging: {
    category: 'public.app-category.productivity',
    electron: { mac: ['dmg'], win: ['nsis'], linux: ['AppImage', 'deb'], compression: 'maximum' },
  },
  advanced: { builder: { mac: { hardenedRuntime: true } } },
}
```

### Both runtimes in one project

`kreft add electron tauri` installs both. They are independent: each has its own file (`config/electron.config.js`, `config/tauri.config.js`), folder (`electron/`, `src-tauri/`) and commands (`electron:dev`, `tauri:dev`…), and one never reads the other's file. Settings you want in both go in `kreftjs.config.json` under `"desktop"`. The page can tell which one it runs in (`window.kreftDesktop` or `window.__TAURI__`).

### Your own code

You never edit the generated files, so your own code has its own place:

- **Electron.** Create `electron/custom.js`: it is loaded after the window opens. Register handlers there and call them from a page through the `app:` channels (a page can reach no other channel):

  ```js
  // electron/custom.js
  const { ipcMain } = require('electron')
  module.exports = function (app, win, config) {
    ipcMain.handle('app:ping', () => 'pong')
  }
  ```

  ```js
  const answer = await kreftDesktop.invoke('app:ping')      // 'pong'
  kreftDesktop.on('app:progress', (n) => update(n))          // sent with win.webContents.send('app:progress', n)
  ```

- **Tauri.** Write your commands in `src-tauri/src/main.rs`, which is yours and is never overwritten; it already calls `kreft_generated::apply`. Calling `.setup(…)` or `.invoke_handler(…)` on the builder replaces what was set before, so call `kreft_generated::setup(app)?` inside your own setup.

### TypeScript and editor autocomplete

`kreftjs/desktop` has the types, made from the same description as the validation, with a comment on every option:

```js
/** @type {import('kreftjs/desktop').TauriConfig} */
module.exports = { devtools: { mode: 'detach' } }
```

```js
const { defineElectronConfig } = require('kreftjs/desktop')
module.exports = defineElectronConfig({ window: { width: 1000 } })
```

The editor then completes option names and values, and underlines a value the runtime does not accept (for example `menu.visibility: 'auto'` in a Tauri file). `ElectronConfig`, `TauriConfig` and `SharedDesktopConfig` (for `kreftjs.config.json`) are exported. In a TypeScript project, name the file `config/electron.config.cjs` or use `export default`.

### If you used Electron or Tauri with an earlier Kreft

- **The menu is hidden by default now.** It used to be visible. Set `menu.visibility: 'visible'` (or `ELECTRON_MENU=show`) to bring it back.
- **`ELECTRON_MENU` and `ELECTRON_DEVTOOLS` still work**, as layer 5.
- **The `build` block of `package.json` is ignored.** Installers are made from `packaging` and `app` in `config/electron.config.js`. Move your `appId`, `productName` and targets there (or into `advanced.builder`).
- **`electron/main.js` and `preload.js` are generated.** A hand-written `main.js` is saved as `main.js.bak` and replaced the next time you run a command; move your code to `electron/custom.js`.
- **`src-tauri/tauri.conf.json`, `capabilities/default.json` and `src/kreft_generated.rs` are written from the config file** every time. Put options this file lacks in `advanced.tauriConf`. Your `Cargo.toml` keeps your own dependencies; Kreft only writes the lines between its two `kreft-generated` comments.
- **`window.width` and `height` are the page area** in Electron too (they used to include the title bar).

### What has been tested

Automated tests (`npm test`) cover the defaults of both runtimes, the six layers and their order, validation (unknown, wrong, unsupported and out-of-range values, with the messages), CommonJS and ESM projects, never overwriting a config file, both runtimes in one project, the files made for electron-builder and Tauri, and the TypeScript definitions and the examples above.

The runtime tests (`npm run test:desktop`) start the real apps and read back what they do: the menu is hidden, DevTools are closed at start, open with the shortcut in development and are refused in production, `openOnStart` works only where DevTools are allowed, the window settings and the secure `webPreferences` are in effect, the file < environment < command line order holds in the real window, a production Electron build is packaged, starts and holds the checked configuration, and Tauri development and release builds compile with the safe defaults and with everything turned on. They were run on **macOS (Apple silicon)**. Windows and Linux are not tested by Kreft: the same code runs there, but check your own build on each system.

### Configuration troubleshooting

| Problem | Fix |
|---|---|
| `unknown option` | A name is misspelled or in the wrong group. The message lists the valid names and suggests the closest. |
| `is not supported by Tauri` / `by Electron` | The option belongs to the other runtime. The message says what to use instead (see the table above). |
| `x and y go together` | Set both `window.x` and `window.y`, or neither. |
| `config/electron.config.js could not be loaded` | A syntax error, or the wrong module style: `module.exports` in a `"type": "module"` project (use `export default` or `.cjs`). |
| My change has no effect | Restart `kreft electron:dev` / `tauri:dev`: the file is read at start. In Tauri, check `kreft tauri:config` shows your value. |
| `electron/kreft.resolved.json is missing` | Start the app with `kreft electron:dev` or `kreft electron:build`; they write it. Running `electron .` by hand does not. |
| A Tauri `main.rs` that ignores the settings | The note says to add `mod kreft_generated;` and `kreft_generated::apply(tauri::Builder::default())`. |
| `updates.pubkey` is required | Tauri verifies every update. `npx tauri signer generate -w ~/.tauri/app.key`, then put the public key in the file. |
| Shortcuts (F12) do nothing | DevTools are off in production (`devtools.production`), or `devtools.shortcut` is `false`. |

## HarmonyOS apps

Huawei phones and tablets running HarmonyOS NEXT cannot install Android apps, and Capacitor does not target them. So Kreft makes a small native project in ArkTS (the HarmonyOS language) whose only page is a full-screen web view. It loads your built site from the app's own files, so the pages are the same `.kreft` files and the app opens without a network.

### What you need

| You need | Why |
|---|---|
| [DevEco Studio](https://developer.huawei.com/consumer/en/deveco-studio/) | It brings the HarmonyOS SDK, the emulator and the tools that build and sign the app. |
| A Huawei developer account | Only to sign the app for a real phone. The emulator needs none. |

### Start

```bash
kreft new my-app --harmony      # a new project with HarmonyOS included
cd my-app
kreft harmony:build --api-url https://your-server.example
kreft harmony:open              # opens harmony/ in DevEco Studio; press Run
```

For a project you already have, run `kreft harmony:init` (alias `kreft make:harmony`). It writes a `harmony/` folder and never overwrites a file that exists.

| Command | What it does |
|---|---|
| `kreft harmony:build` | Runs `kreft build --base ./`, then copies `dist/` into `harmony/entry/src/main/resources/rawfile/`. `--api-url` sets the server the app talks to (written to `.env`). `--hap` also runs `hvigor` to make the `.hap` file (needs DevEco Studio's command line tools). |
| `kreft harmony:open` | Opens `harmony/` in DevEco Studio. |
| `kreft harmony:init` | Adds HarmonyOS to an existing project. |
| `kreft harmony:help` | Prerequisites, files and options. |

Run `harmony:build` again after every change to your pages. The backend does not run inside the phone, so the app needs `--api-url` (or a `PUBLIC_API_URL` in `.env`) to reach your server.

### The files

| File | What it is |
|---|---|
| `harmony/entry/src/main/ets/pages/Index.ets` | The web view. Change its settings here. |
| `harmony/entry/src/main/module.json5` | Device types and permissions (`INTERNET` is on). |
| `harmony/AppScope/app.json5` | Bundle name (`com.kreftjs.<name>`), version and icon. |
| `harmony/entry/src/main/resources/rawfile/` | Your site, written by `harmony:build`. It is not committed. |

> [!NOTE]
> `harmony:init` makes one change to your project: in `frontend/index.html` the router gets `mode: /^https?:$/.test(location.protocol) ? 'history' : 'hash'`. Inside the app, addresses look like `#/login` (the app's own files have no `/login`); on your website they stay normal. If you set a `mode` yourself, it is left alone. `window.kreftDesktop` and the other Electron helpers do not exist here.

> [!NOTE]
> The project follows the DevEco Studio template for HarmonyOS NEXT (API 12). DevEco Studio may offer to upgrade the build files to its newer version the first time you open it: accept.

> [!WARNING]
> **What has been tested.** The `harmony/` files, `harmony:build`, the copy into `rawfile/`, the site rendering and the `#/` page addresses were tested on a computer. The project has **not** been opened in DevEco Studio or run on an emulator or phone yet, so the build files may need small changes. Report what DevEco Studio says and it will be fixed.

### HarmonyOS troubleshooting

| Problem | Fix |
|---|---|
| A white screen in the app | Run `kreft harmony:build` again and check that `rawfile/index.html` exists. |
| Pages show "not found" after a click | The router must use `mode: 'hash'` inside the app (see the note above; `harmony:init` adds it unless you set a `mode`). |
| API calls fail | Build with `--api-url https://…`. A phone cannot reach `localhost` on your computer. |
| `hvigor was not found` | Use `kreft harmony:open` and run from DevEco Studio instead of `--hap`. |
| The phone refuses to install the app | The app must be signed in DevEco Studio (File > Project Structure > Signing Configs). |

## Mobile apps (iOS and Android)

Kreft apps run on phones in two ways. Both start from the same `.kreft` code.

**1. An installable website (PWA).** `kreft build --pwa` also writes `manifest.webmanifest`, a service worker `sw.js` and `pwa-register.js`. Visitors can add the site to their home screen, and pages they have seen open without a connection. Requests to `/api/` are never cached. Put a 512x512 `icon.png` next to `index.html` for the home screen icon.

**2. A real app with Capacitor.** The built site runs inside a native WebView and goes to the App Store or Google Play.

```bash
kreft new my-app --mobile        # or: kreft mobile:init in an existing app
npm install
kreft mobile:build --android --api-url https://api.example.com
kreft mobile:open --android      # Android Studio (--ios: Xcode, needs a Mac)
```

| Command | What it does |
|---|---|
| `kreft mobile:init` (alias `kreft make:mobile`) | Adds `capacitor.config.json`, the Capacitor packages, the native plugins, the `mobile:*` scripts and the [phone UI kit](#the-phone-ui-kit) |
| `kreft mobile:build [--android] [--ios]` | Builds the site with a relative base, adds the platform the first time, then runs `cap sync`. Without a flag it syncs the platforms that exist. (No service worker goes into a phone app: its files are inside the app.) |
| `kreft mobile:run [--android] [--ios] [--target id]` | The one command to see your app: builds, then installs and starts it on an emulator or phone. With one running Android device it uses that one; with several (or none) Capacitor asks, or pass `--target emulator-5554`. Run it again after every change |
| `kreft mobile:setup` | First-run setup: `key:generate` (only when `APP_KEY` is missing), `storage:link` and `migrate`. Safe to run again. `mobile:dev` runs it for you |
| `kreft mobile:open` | Opens the native project |
| `kreft mobile:dev [--android] [--ios] [--target id] [--lan] [--no-setup]` | Runs the first-run setup, starts your dev server and runs the app with live reload: a saved change shows on the phone within a second or two, without building again |
| `kreft mobile:ui [--layout] [--gallery]` | Adds the [phone UI kit](#the-phone-ui-kit) to an app |
| `kreft mobile:release` | A signed release: `.apk` and `.aab` (Android), `.ipa` (iOS), `.hap` and `.app` (HarmonyOS). See [the release guide](#publishing-your-app-to-google-play-and-the-app-store). |
| `kreft mobile:icons` / `kreft mobile:splash` | Makes the [app icon and splash screens](#app-icon-and-splash-screen) |
| `kreft mobile:help` | Lists these commands in the terminal |

**Building the Android app needs Java 21, 22 or 23** (Capacitor 7 uses Gradle 8.11). An older Java fails with `invalid source release: 21`, and a newer one (24, 25, 26) fails with `Unsupported class file major version`. The `kreft mobile:*` commands pick a fitting Java by themselves: the one Gradle already downloaded, an installed JDK, or the one inside Android Studio (they print `Using Java 21 from …`). If none is found they say so; install one with `brew install --cask temurin@21` (or from adoptium.net), or point to it yourself: `export JAVA_HOME="/path/to/jdk-21"`. Running from Android Studio (`kreft mobile:open --android`) needs no extra setup. The iOS Simulator needs a full Xcode install, not only the command line tools.

**The backend does not run inside the phone.** Run it on a server and give the app its address with `--api-url` (written to `.env` as `PUBLIC_API_URL`), then in your code:

```js
Kreftjs.api.setup({ base: Kreftjs.env.PUBLIC_API_URL, token: () => Kreftjs.storage.get('token') })
```

Use API tokens for sign-in in the app, not cookie sessions.

### Run it on an emulator, a simulator or a phone

**Side menu.** `<edge-side-nav>` takes the same colour props as the bars (`bg`, `color`, `activeColor`, `indicatorColor`, `borderColor`) and highlights the item for the page you are on. The bottom bar's active pill is a see-through grey by default, so its icon stays readable on a light or a dark bar.

**Dark bars.** The phone kit starts with a dark top bar and bottom bar (`#111827`). The strips behind the clock and the gesture bar follow them: `backgroundColor` in `capacitor.config.json`, an Android window background that `mobile:build` and `mobile:dev` add to `styles.xml` once, and `Kreftjs.native.system.statusBar({ color, style: 'auto' })`, which picks light icons on a dark colour. For a light look set `bg`, `color`, `activeColor`, `indicatorColor` and `borderColor` in the layout's *Appearance* block. **With a USB cable**, `mobile:dev` reopens the cable tunnel by itself if Android's tooling drops it while installing.

`kreft mobile:build` only prepares the native project: it builds the site and copies it into `android/` or `ios/`. **To see the app, run `kreft mobile:run --android` (or `--ios`) inside your app folder**: it builds, installs the app on the emulator or phone and starts it. Or open the project yourself in Android Studio or Xcode, or use `kreft mobile:dev` for live reload.

**Android emulator** (Mac, Windows, Linux):

1. Install [Android Studio](https://developer.android.com/studio). In **Device Manager** choose **Create Device**, pick a Pixel phone and a recent system image, and start it.
2. In your app folder: `kreft mobile:run --android`. After each change to your code, run it again.
3. Prefer Android Studio? `kreft mobile:build --android`, then `kreft mobile:open --android` and press the green **Run** button.

**iOS Simulator** (Mac only):

1. Install **Xcode** from the App Store and open it once to accept the license. Then run `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`.
2. In your app folder: `kreft mobile:run --ios`. Or `kreft mobile:build --ios`, then `kreft mobile:open --ios`; in Xcode choose a simulator (for example an iPhone) at the top and press **Run**. The first build may ask you to install CocoaPods.

**A real phone.** Android: turn on *Developer options* and *USB debugging*, plug it in, and choose it in Android Studio's device list. iPhone: plug it in, trust the computer, choose it in Xcode and pick a signing team (a free Apple ID works for testing).

**Live reload.** `kreft mobile:dev --android` (or `--ios`) starts your dev server and runs the app on the emulator or phone, so a saved change shows up without building again. It picks the running device by itself and takes the next free port if 8000 is busy, telling the app the right one. It needs the Capacitor tools from `npm install`.

- **Through the cable (the default for Android).** When an Android phone or emulator is connected through `adb` (USB with *USB debugging* on, or wireless debugging), `mobile:dev` runs `adb reverse`, which makes the phone's `localhost:8000` lead to your computer. No Wi-Fi is needed, it works behind any firewall, and the dev server listens on your computer only, not on the network. It removes the tunnel when you stop it.
- **Through the Wi-Fi.** For iOS, when no Android device is connected yet, or with `--lan`, the app uses your computer's address on the Wi-Fi (`10.0.2.2` for an emulator), so the phone must be on the same Wi-Fi as the computer, and the dev server is open to that network.

**Use a network you trust.** In Wi-Fi mode (iOS, `--lan`, or no Android device connected) the dev server listens on your whole network (`--host 0.0.0.0`), so anyone on the same Wi-Fi can open it. Do it at home or on a private network, never on a public one, and stop it when you are done. Through the cable (the Android default) it is not open to the network at all.

**First-run setup.** Before it starts the server, `mobile:dev` runs `kreft mobile:setup` (skip it with `--no-setup`): it creates `.env` and a new `APP_KEY` when they are missing (a fresh checkout from git has no `.env`), links `storage` for public files, and runs the database migrations. A new database is also seeded, so the test user exists. Every step only does something when it is needed, so running it again is harmless. A good `APP_KEY` is never replaced (that would log every user out), and the key is never printed.

**Where is the backend?** The backend runs on your computer or a server, never inside the phone. Give the app the address the phone can reach:

| The app runs on | Address of the server on your computer |
|---|---|
| Android emulator | `http://10.0.2.2:8000` |
| iOS Simulator | `http://localhost:8000` |
| A real phone on the same Wi-Fi | `http://192.168.x.x:8000` (your computer's address; start the server with `kreft dev --host 0.0.0.0`) |
| After you publish | `https://api.your-site.com` |

```bash
kreft mobile:build --android --api-url http://10.0.2.2:8000
```

Plain `http://` is for testing; a published app should always use `https://`.

**Run a mobile command from any folder.** Every `kreft mobile:…` command (and `kreft make:home`) takes `--app <folder>`, which is the same as going into the app first: `kreft mobile:dev --android --app ~/projects/my-app`.

### Mobile and desktop in one app

`kreft new my-app --mobile --electron` makes one project for both. Pages use the dashboard layout (`layouts/app.kreft`) as in a web app, and `pages/Home.kreft` shows the desktop workspace inside the Electron window and the phone screen everywhere else (the phone one draws its own top bar and bottom bar). With only `--mobile`, every page uses `layouts/mobile.kreft`. To use the phone layout in a project that has both, run `kreft mobile:ui --layout`.

### The animated splash screen

A phone app shows the native splash screen (made by `kreft mobile:splash`) while the web part loads. The kit adds an **animated splash** that takes over from it without a flash: your logo moves, the app name fades in, and when the app is on the screen it fades away. It is the `<div id="edge-splash">` in `index.html`. The native splash covers only the first moment (`launchAutoHide: false` in `capacitor.config.json` lets the page decide): as soon as the animated one is painted, the native one fades away and the animation plays. Give both the same background colour, so nothing flashes: `kreft mobile:splash splash.png --bg "#ffffff"` for the native one and `--edge-splash-bg` for the animated one. The splash is never stuck: it is gone after 8 seconds at the latest.

```html
<div id="edge-splash" class="edge-splash" data-anim="pulse" data-web="false">…</div>
```

- `data-anim` is `pulse` (the logo breathes), `zoom` (it pops in), `rise` (it slides up) or `none`.
- `data-web="true"` shows it in a browser too; by default a browser skips it.
- Colours: `--edge-splash-bg` and `--edge-splash-fg` in `edge.css` (they follow dark mode). Change the logo by changing the `<img>`.
- From code: `Kreftjs.native.splash.set({ minTime: 1500, anim: 'zoom' })` (the animation plays at least `minTime` milliseconds from when it appears; 900 by default, and `0` means as soon as the app is ready) and `Kreftjs.native.splash.hide()`.
- People who asked their phone for less motion get a plain fade.

To turn it off, delete the `#edge-splash` element and set `"launchAutoHide": true` under `plugins.SplashScreen` in `capacitor.config.json`.

### Home pages made for apps

A website's welcome page is not what an app should open on. `kreft new my-app --mobile` writes a **phone home screen** (a gradient greeting card with a time-of-day hello and the signed-in user's name, shortcut tiles that animate in one after another, a card that shows the touch events; the top bar and bottom tab bar come from the layout), and `kreft new my-app --electron` writes a **desktop workspace** (sidebar, toolbar with search, info cards, shortcuts). With both flags, `pages/Home.kreft` shows the desktop one inside the Electron window and the phone one everywhere else.

```bash
kreft make:home --mobile      # in an existing project: phone home screen (replaces pages/Home.kreft)
kreft make:home --desktop     # desktop workspace
```

They are normal files (`components/HomeMobile.kreft`, `components/HomeDesktop.kreft`), so change them freely. Preview either in a browser with `?platform=mobile` or `?platform=desktop`. Links to the dashboard, users and profile appear only when the project has them (not with `--no-auth`).

### Touch events

```html
<div @tap={open}>Open</div>
<li @swipeleft={remove($event)} @longpress={select}>Row</li>
<section @swipe={go($event)}>…</section>   <!-- $event.direction: left | right | up | down -->
```

`@tap` (moves less than 10px, under 500ms), `@longpress` (held still for 500ms), `@swipe` and `@swipeleft`, `@swiperight`, `@swipeup`, `@swipedown` (40px or more in under 800ms). They use pointer events, so they work with a finger, a pen and a mouse. `.once`, `.prevent` and `.stop` work. A horizontal swipe keeps vertical scrolling working.

The starter `ui.css` already pads the page for the notch (`env(safe-area-inset-*)`), removes the tap delay and makes buttons and fields at least 44px high on touch screens. New projects have `viewport-fit=cover` set by `kreft build --pwa`.

### The phone UI kit

`kreft new my-app --mobile` also installs a kit made for phones: **42 components** (`edge-` tags), a native API (`Kreftjs.native`), a stylesheet (`edge.css`), a layout whose bars never move, and a page that shows everything live. In an existing app: `kreft mobile:ui` adds the components, the native API and the stylesheet; `kreft mobile:ui --layout` also uses the phone layout for every page; `kreft mobile:ui --gallery` adds the `/edge` page.

The files are copied into your project (`components/edge/`, `kreftjs-native.js`, `edge.css`, `layouts/mobile.kreft`), so you can change any of them. Running the command again only adds what is missing; it never overwrites your edits.

#### Top bar and bottom bar that never move

`layouts/mobile.kreft` puts the page between a top bar and a bottom bar. Only the page scrolls: the bars stay exactly where they are, the document itself does not scroll and does not bounce. They keep clear of the notch and the home bar by themselves.

The starting look is the `base` block at the top of that file. Any page can change it, and it goes back to the base on the next page:

```html
use edge

on ready {
  edge.setTop({ title: 'Cart', center: true, bg: '#111827', color: '#ffffff',
    right: [{ icon: 'search', id: 'search', onTap: () => openSearch() }, { icon: 'bell', badge: 3 }] })
  edge.setBottom({ labels: 'active', indicator: 'line', floating: true, activeColor: '#38bdf8' })
}
```

| `edge.setTop({ … })` | |
|---|---|
| `title`, `subtitle` | The text. Without a title the page's `.title('…')` from the routes is used. |
| `back` | `'auto'` (default: an arrow on pages that are not a bottom button), `true` or `false`. |
| `bg`, `color`, `height` | Colours and the height in px (the notch area is added). |
| `center`, `border`, `elevated`, `blur` | Centre the title, the line under the bar, a shadow, frosted glass. |
| `left`, `right` | Buttons: `[{ icon \| text \| src, label, id, badge, onTap }]`. |
| `show` | `false` hides the bar. `edge.hideBars()` and `edge.showBars()` do both bars. |

| `edge.setBottom({ … })` | |
|---|---|
| `items` | The buttons: `[{ label, icon \| text \| src, to, badge, disabled, onTap }]`. An item with `to` opens that page and is active on it. |
| `labels` | `'always'`, `'active'` or `'never'`. |
| `indicator` | `'pill'`, `'line'` or `'none'`: what shows the active button. |
| `bg`, `color`, `activeColor`, `height` | Colours and height. |
| `border`, `floating`, `blur`, `haptics` | The line above, a rounded floating bar, frosted glass, a small buzz on tap. |

`edge.reset()` goes back to the defaults. The two bars are also ordinary components you can use anywhere: `<edge-top-bar title="Cart" back bg="#111" color="#fff">` and `<edge-bottom-nav items={tabs} labels="active">`, with the same names as props. Colours for the whole app are the variables at the top of `edge.css` (`--edge-top-bg`, `--edge-bottom-active`, `--edge-accent`, `--edge-radius` …); they follow your `ui.css` colours, so dark mode works by itself.

Putting the bars in your own layout:

```html
<edge-shell>
  <template k-slot:top><edge-top-bar title="Home"></edge-top-bar></template>
  …the page…
  <template k-slot:bottom><edge-bottom-nav items={tabs}></edge-bottom-nav></template>
</edge-shell>
```

#### Components

Every component has a comment at the top of its file listing its props. Values that change come back with `k-model` (`prop modelValue` and `event update:modelValue`), the way [k-model on a component](#k-model-on-a-component) works. Open `/edge` in your app (or run it in a browser) to see and try all of them.

| Component | What it is |
|---|---|
| `edge-shell` | The frame: top slot, page that scrolls, bottom slot. |
| `edge-top-bar` | The bar at the top: title, back arrow, buttons, colours. |
| `edge-bottom-nav` | The row of buttons at the bottom: icons, labels, badges, indicator. |
| `edge-side-nav` | A drawer from the side (`k-model`, `side`, `items`). |
| `edge-tab-row` | Tabs in a row that scrolls sideways, with badges. |
| `edge-row`, `edge-column` | Children side by side or one under another (`gap`, `align`, `justify`, `wrap`, `pad`). |
| `edge-stack` | Children on top of each other (`align`). |
| `edge-spacer`, `edge-divider` | Space (flexible or `size`), a line (`label`, `vertical`, `inset`). |
| `edge-scroll-view` | A box that scrolls on its own (`horizontal`, `snap`, `hideBar`). |
| `edge-list` | Rows like a settings screen (`items`, `inset`, or the `item` slot). |
| `edge-lazy-grid` | A grid that draws more items as you scroll (`columns` or `min`, `step`). |
| `edge-virtual-list` | Thousands of equal rows, only the visible ones exist (`itemHeight`). |
| `edge-carousel` | Cards you swipe sideways with the next one peeking (`peek`, `autoplay`). |
| `edge-pager` | Full pages you swipe between, with dots (`k-model` is the page). |
| `edge-text` | Text: `size`, `weight`, `color`, `muted`, `lines` (cut with …), `mono`. |
| `edge-icon` | 55 built-in icons (`name`), your own picture (`src`) or a glyph (`text`). |
| `edge-image` | Loads near the screen, keeps its shape (`ratio`, `radius`, `fit`, `placeholder`). |
| `edge-badge` | A small number or a dot (`value`, `dot`, `max`, `tone`). |
| `edge-chip` | A pill: a filter or tag (`selected`, `closable`, `tone`). |
| `edge-shape` | A coloured shape: circle, rect, rounded, pill, triangle, diamond, hexagon, star. |
| `edge-canvas` | A drawing surface with a sharp 2D context (`@draw`, `@pointer`). |
| `edge-progress-bar` | A progress bar, or a moving one when the amount is unknown (`indeterminate`). |
| `edge-activity-indicator` | A spinner (`size`, `color`). |
| `edge-accordion` | Sections that open and close (`items`, `single`). |
| `edge-button` | A button made for thumbs: `variant`, `size`, `icon`, `full`, `loading`. |
| `edge-button-group` | A segmented control: one choice out of a few (`options`, `k-model`). |
| `edge-text-input` | A field with label, icon, hint, error, clear button; no zoom on iPhone. |
| `edge-checkbox`, `edge-toggle` | A checkbox and a switch (`k-model`, `label`). |
| `edge-radio-group`, `edge-select` | One choice out of a few; a dropdown that opens the phone's own picker. |
| `edge-slider` | A range slider (`min`, `max`, `step`, `showValue`). |
| `edge-modal` | A dialog over the page (`k-model`, `title`, `fullscreen`, footer slot). |
| `edge-bottom-sheet` | A panel from the bottom you drag down to close (`size`: auto, half, full). |
| `edge-menu` | A small menu from a button; `sheet` opens it as an action sheet. |
| `edge-fab` | The round floating button, `extended` with a label. |
| `edge-pressable` | Anything pressable with the feeling you choose: `@press`, `@longpress`. |
| `edge-gesture-area` | `@tap`, `@doubletap`, `@longpress`, `@swipe`, `@swipeleft` … on an area. |
| `edge-refreshable` | Pull down to refresh (`refreshing`, `@refresh`). |
| `edge-web-view` | A web page inside the app (http(s) only, sandboxed). |

Layout helpers: classes in `edge.css` such as `edge-row`, `edge-col`, `edge-center`, `edge-between`, `edge-grow`, `edge-pad`, `edge-card`, `edge-round`, `edge-muted`, `edge-ellipsis`. Positioning: `edge-rel` on the parent, then `edge-abs` or `edge-fixed` with `edge-top`, `edge-bottom-right`, `edge-cover` and `edge-z1` … `edge-z3`; `edge-safe-top` and `edge-safe-bottom` pad for the notch and the home bar. Add your own icon with `Kreftjs.edgeIcons.add('logo', 'M2 2h20v20H2z')` (a 24x24 path).

#### Native features: `Kreftjs.native`

`kreftjs-native.js` works in the phone app (through Capacitor plugins that `kreft mobile:init` adds), in Electron and in a plain browser (with what the browser has), so you can build the whole app in the browser first. Calls return a Promise and give a sensible default instead of failing when something is not available.

| Area | Calls |
|---|---|
| Platform | `native.platform()` is `'android'`, `'ios'`, `'electron'`, `'tauri'` or `'web'`; `isNative()`, `isDesktop()`, `isWeb()`. |
| Device | `device.info()` (platform, OS, model, screen), `device.id()`, `device.battery()`, `device.language()`. |
| Haptics | `haptics.impact('light' \| 'medium' \| 'heavy')`, `haptics.notification('success' \| 'warning' \| 'error')`, `haptics.selection()`, `haptics.vibrate(ms)`. |
| File | `file.pick({ accept, multiple })`, `file.readText(f)`, `file.readDataUrl(f)`, `file.write(path, data)`, `file.read(path)`, `file.list(dir)`, `file.remove(path)`, `file.save(name, data, mime)`. |
| System | `system.openUrl(url)` (http, https, mailto, tel only), `system.share({ title, text, url })`, `system.copy(text)`, `system.paste()`, `system.network()`, `system.app()`, `system.statusBar({ color, style, overlay })`, `system.keyboard.show()` and `.hide()`, `system.hideSplash()`, `system.exit()`. |
| Dialogs | `dialog.alert(text, { title })`, `dialog.confirm(text, { ok, cancel, danger })` gives `true` or `false`, `dialog.prompt(text, { value })` gives the text or `null`, `dialog.actionSheet({ title, options })`, `dialog.toast(text, { tone, position, duration })`. |
| Safe area | `safeArea()` gives `{ top, right, bottom, left }` and sets the CSS variables `--edge-safe-top` … for you. |
| Positioning | `position.get()` (latitude, longitude), `position.watch(fn)` gives a stop function. |
| Events | `on('pause' \| 'resume' \| 'network' \| 'urlOpen' \| 'keyboardShow' \| 'keyboardHide', fn)` gives a stop function. |
| Back button | `pushBack(fn)`: the newest handler gets the Android back button first (return `false` to pass it on); then the page goes back, then the app closes. Modals, sheets and drawers do this by themselves. |
| Assets | `asset('img/logo.png')` gives the right address inside the app, whatever the base. |
| Splash screen | `splash.set({ minTime, anim })` and `splash.hide()` control the [animated splash screen](#the-animated-splash-screen); it hides itself once the app is ready. |

On iPhone, camera, location and photo access need a usage text in `ios/App/App/Info.plist` (Apple asks for it); on Android the plugins add their permissions.

#### App icon and splash screen

```bash
kreft mobile:icons logo.png --bg "#ffffff"                         # a 1024x1024 PNG: every icon size for android/ and ios/
kreft mobile:splash splash.png --bg "#ffffff" --dark-bg "#000000"   # a 2732x2732 PNG, with a dark version
```

They copy the picture to `assets/` and use Capacitor's asset tool (the first run needs the internet). Then build again with `kreft mobile:build --android`.

#### Coming from NativePHP Mobile

| NativePHP Mobile | Kreft |
|---|---|
| Device, File, System | `Kreftjs.native.device`, `.file`, `.system` |
| Native UI, Edge components | the `edge-` components above |
| Routing, Middleware | [the router](#router-and-layouts) and its guards, as in a web app |
| Layouts, Nested components | `layouts/mobile.kreft`, and components with slots |
| Dialogs | `Kreftjs.native.dialog` and `edge-modal`, `edge-bottom-sheet` |
| Safe area, Positioning | `Kreftjs.native.safeArea()`, the `edge-safe-*` and `edge-abs` classes, `Kreftjs.native.position` |
| Events | `Kreftjs.native.on(…)`, and component `event` / `send()` |
| App icons, Splash screens | `kreft mobile:icons`, `kreft mobile:splash` |
| Assets | `Kreftjs.native.asset(…)` |

### Publishing your app to Google Play and the App Store

A *release build* is the signed file you upload to a store. It is different from the debug app that `kreft mobile:run` and `mobile:dev` install. Follow this list from top to bottom for every new version.

> [!NOTE]
> **What has been tested.** The Android steps below (setting the id and version, making a keystore, signing, `./gradlew bundleRelease assembleRelease`, and checking the signature) were run on macOS: they produced a signed `.aab` (3.6 MB) and `.apk` (3.9 MB) with the right id and version. Uploading to Google Play was not tried. The iPhone steps are Apple's usual Xcode steps and were **not** run by the Kreft tests (they need a Mac with Xcode and a paid Apple account), so check each one on your own computer.

#### The short way: `kreft mobile:release`

One command makes the signed files for a store, for each platform:

```bash
kreft mobile:release --android --api-url https://api.your-site.com --create-keystore   # first time: also makes the signing key
kreft mobile:release --android --api-url https://api.your-site.com --bump              # every later release
kreft mobile:release --ios --team ABCDE12345 --api-url https://api.your-site.com       # a Mac with Xcode
kreft mobile:release --harmony --api-url https://api.your-site.com                     # DevEco Studio
kreft mobile:release --api-url https://api.your-site.com                               # every platform that has a folder
kreft mobile:release --android --api-url https://api.your-site.com --dry-run           # show every step, change nothing
```

| Platform | It makes | Needs |
|---|---|---|
| Android | `release/android/<name>-<version>-<code>.apk` (to install or send to testers) and `.aab` (for Google Play) | Android Studio, Java 21 to 23 |
| iOS | `release/ios/<name>.ipa`, from an Xcode archive | A Mac with Xcode, and your Apple **Team ID** (`--team`, or `APPLE_TEAM_ID`) |
| HarmonyOS | `release/harmony/…hap` (an app package) and `…app` (for AppGallery), from hvigor | DevEco Studio's command line tools (`hvigorw`) and a signing configuration |

What every release does, in order: it checks your options **before** it changes anything, sets the version numbers, builds the site with `--api-url` and copies it into the app, signs the build, then writes the files to `release/<platform>/` and prints each file's size and SHA-256. On Android it also checks the signature of the `.apk` with `apksigner`. The `release/` folder is added to `.gitignore`.

| Option | What it does |
|---|---|
| `--api-url <https://…>` | The server the app talks to (or `PUBLIC_API_URL` in `.env`). **A store build must use `https` and a real address**: `http://…`, `localhost`, `10.0.2.2` and addresses inside your network are refused (`--allow-insecure-api` skips this, for a test build). |
| `--no-api-url` | **The app needs no server** (pages only, no login or database). `PUBLIC_API_URL` in `.env` is ignored and no address is built into the app. Use this when `.env` still holds a test address like `http://10.0.2.2:8000` from an emulator build: the release stops on it, and the message says it comes from `.env`. |
| `--version <1.2.0>` | The version people see. Default: `version` in `package.json`. |
| `--build <number>` | The build number the stores compare: Android `versionCode`, the iOS build, the HarmonyOS `versionCode`. |
| `--bump` | Add 1 to the current build number instead. Every store upload needs a higher number than the last. |
| `--out <folder>` | Where the files go. Default: `release/`. |
| `--dry-run` | Show every step and the exact commands. Writes nothing. |
| `--apk`, `--aab` | Android: only that format. Default: both. |
| `--create-keystore` | Android: make the signing key (see below). |
| `--team <ID>`, `--method <m>` | iOS: your Apple Team ID, and how to export: `app-store` (default), `ad-hoc`, `development` or `enterprise`. |
| `--hap`, `--app` | HarmonyOS: only that file. Default: both. |

#### Why `--api-url`, and do I always need it?

**`--dry-run` isn't required.** It's an optional preview that shows the steps and changes nothing. You only add it when you want to look first. A normal release is just:

```bash
kreft mobile:release --android --api-url https://api.your-site.com
```

**`--api-url` is needed for a release because the backend doesn't run inside the phone.** The app holds only your built pages, and those pages have to call a server somewhere. For a store build, Kreft must know the address of that server and bake it into the app. The release command also refuses addresses a phone can't reach, like `http://…`, `localhost` or `10.0.2.2`, so a test address doesn't get shipped by mistake.

**You can avoid typing it:**

- Put it in `.env` once: `PUBLIC_API_URL=https://api.your-site.com`. The release command reads it, so you can drop the flag.
- If your app needs no server (pages only, no login or database), use `--no-api-url` instead.

**For `kreft mobile:run` and `mobile:dev` you don't need it.** They are for development, and they pick the address for you (the emulator reaches your computer through `10.0.2.2`). Only a release needs the real server address.

**Android signing.** A release build must be signed. `--create-keystore` makes `android/upload-keystore.jks` and `android/keystore.properties` (a random password, readable only by you) **once**, adds the signing to `android/app/build.gradle` and puts the key files in `android/.gitignore`. It never replaces a key that exists. Copy both files somewhere safe **outside the project** (a password manager or an encrypted drive): without them you can never update the app. If you set the signing up by hand as described below, the command recognises it and leaves your `build.gradle` as it is.

**iOS.** The command runs `xcodebuild archive` for the *App* scheme in the *Release* configuration with automatic signing for your team, writes `ExportOptions.plist` and runs `xcodebuild -exportArchive` to make the `.ipa`. Upload an `app-store` build with Transporter or Xcode's Organizer. You must be signed in to your Apple ID in Xcode (*Settings → Accounts*) and have the Apple Developer membership.

**HarmonyOS.** The command runs `kreft harmony:build`, sets the version in `harmony/AppScope/app.json5` and runs hvigor (`assembleHap`, `assembleApp`). Signing is set in DevEco Studio (*File → Project Structure → Signing Configs*, "Automatically generate signature" for a test device, or your AppGallery certificates). Without it the files are made **unsigned**, and the command says so.

> [!WARNING]
> **What has been tested.** `kreft mobile:release --android` was run for real on macOS, in a new project with no manual setup: the key was made, the signing added, `versionCode` raised with `--bump`, and a signed `.apk` and `.aab` came out (the signature checked with `apksigner`); a second run reused the key. The guards (https, folders, key, Team ID) and the exact Xcode and hvigor command lines are covered by automated tests and shown by `--dry-run`, but **the iOS and HarmonyOS builds themselves were not run**: there is no Xcode or DevEco Studio on the test computer. Run `--dry-run` first, then build, and send what you see if a step fails.

The rest of this guide explains each step by hand, for when you want to do one yourself or the command stops and you need to know why.

#### Before the first release

1. **Give the app its real id and name.** `kreft new` gives it the id `com.example.<name>`, and stores refuse that. In `capacitor.config.json` set `"appId": "com.yourcompany.myapp"` (reverse domain, lowercase letters and digits) and `"appName"` **before** you run `kreft mobile:build` for the first time: the id is written into `android/` and `ios/` when they are created, and it can never change after the app is published. If you must change it later, delete `android/` and `ios/` (nothing in them is yours unless you edited them) and run `kreft mobile:build` again.
2. **Icon and splash screen.** `kreft mobile:icons logo.png` and `kreft mobile:splash splash.png` (see [App icon and splash screen](#app-icon-and-splash-screen)).
3. **Point the app at your real server.** The backend does not run inside the phone. Build with the address of your server:

   ```bash
   kreft mobile:build --android --api-url https://api.your-site.com
   ```

   A store app must use `https://`, and your server must allow the app in CORS. The address is written to `PUBLIC_API_URL` in `.env`. Never ship an address like `http://10.0.2.2:8000` (that is the emulator's way to reach your computer).
4. **Developer accounts.** Google Play: a one-time fee and identity checks. App Store: the paid Apple Developer Program. Both can take days to approve, so start early.

#### Every release: the version number

A store accepts an upload only if its version number is higher than the one before. Android has two numbers, iOS has two as well:

| | Number the store compares | Number people see |
|---|---|---|
| Android (`android/app/build.gradle`, `defaultConfig`) | `versionCode`: a whole number, +1 for **every** upload, even a rejected one | `versionName`: for example `"1.0.1"` |
| iOS (Xcode, target *App*, *General*) | *Build*: a number that grows for each upload of the same version | *Version*: for example `1.0.1` |

Keep `package.json`'s `version` in step with the number people see.

#### Android: a signed bundle

**1. Make a keystore, once.** The keystore is the key that proves an update comes from you. Run this in `android/` and answer the questions:

```bash
cd android
keytool -genkeypair -v -keystore upload-keystore.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

`keytool` comes with Java (it is in the Java that Android Studio uses). Choose a strong password and write it down.

> [!WARNING]
> Keep a copy of `upload-keystore.jks` and its passwords somewhere safe and **outside the project** (a password manager, an encrypted drive). Do not put them in git. When you use *Play App Signing* (the default for new apps), Google holds the real app key and a lost upload key can be reset by Google support; without it, a lost keystore means you can never update the app again.

**2. Keep the secrets out of git.** Add these lines to `android/.gitignore` (the generated file does not ignore keystores):

```
*.jks
*.keystore
keystore.properties
```

**3. Tell Gradle about the keystore.** Make `android/keystore.properties` (a file only you have):

```
storeFile=../upload-keystore.jks
storePassword=YOUR_PASSWORD
keyAlias=upload
keyPassword=YOUR_PASSWORD
```

Then edit `android/app/build.gradle`. At the top, under `apply plugin`:

```groovy
def keystoreProperties = new Properties()
def keystoreFile = rootProject.file('keystore.properties')
if (keystoreFile.exists()) {
    keystoreFile.withInputStream { keystoreProperties.load(it) }
}
```

and inside `android { … }`, before `buildTypes`, add `signingConfigs`, and use it in the `release` build type:

```groovy
    signingConfigs {
        release {
            if (keystoreFile.exists()) {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
            // …the lines that were already there
        }
    }
```

`storeFile` is read from the `android/app` folder, which is why the path starts with `../`.

**4. Build.** First build the site and copy it into the app (this also puts the Java that Gradle needs in `android/gradle.properties`), then ask Gradle for the release files:

```bash
kreft mobile:build --android --api-url https://api.your-site.com
cd android
./gradlew bundleRelease assembleRelease      # on Windows: gradlew.bat
```

You get two files:

| File | For |
|---|---|
| `android/app/build/outputs/bundle/release/app-release.aab` | **Google Play.** Upload this one. |
| `android/app/build/outputs/apk/release/app-release.apk` | Installing on a phone yourself, or sending it to a tester. |

Android Studio can make the same files: `kreft mobile:open --android`, then *Build → Generate Signed App Bundle / APK*. Check that the file is signed and has the right id and version:

```bash
$ANDROID_HOME/build-tools/<version>/apksigner verify --print-certs android/app/build/outputs/apk/release/app-release.apk
$ANDROID_HOME/build-tools/<version>/aapt2 dump badging android/app/build/outputs/apk/release/app-release.apk | head -1
```

**5. Try the release build on a real phone before you upload.** A release app behaves differently from the debug one (it talks to your real server, and it is signed). With the phone plugged in and USB debugging on:

```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

`-r` replaces an installed copy with the same signature. If a debug copy from `kreft mobile:run` is there, uninstall it first: the signatures differ.

**6. Upload to Google Play.** In the [Play Console](https://play.google.com/console) create the app, then *Testing → Internal testing → Create new release*, accept *Play App Signing* and upload the `.aab`. Fill in the store page, the *Content rating*, the *Data safety* form and the privacy policy link. Test with the internal track first; promote the same release to *Production* when it is good. New personal developer accounts may have to run a closed test with a minimum number of testers for some days before production is allowed; check Google's current rule in the Console.

#### iPhone: archive and upload (a Mac with Xcode)

1. `kreft mobile:build --ios --api-url https://api.your-site.com`, then `kreft mobile:open --ios`.
2. In Xcode, select the *App* target, *Signing & Capabilities*: tick *Automatically manage signing* and choose your **Team**. The *Bundle Identifier* must be your `appId`.
3. Set *Version* and *Build* (see above). Add a text for every permission the app asks for (camera, location, photos…) to `ios/App/App/Info.plist`, for example `NSCameraUsageDescription`; Apple rejects an app that asks without explaining.
4. Choose the device **Any iOS Device (arm64)**, then *Product → Archive*.
5. In the Organizer window, *Distribute App → App Store Connect → Upload*.
6. In [App Store Connect](https://appstoreconnect.apple.com) create the app with the same bundle id, wait for the build to finish processing, and test it with *TestFlight* (yourself first, then testers). Then fill in the store page (screenshots for the required device sizes, description, privacy answers), pick the build, and *Submit for Review*.

#### Checklist before every upload

- [ ] The app opens and works on a **real phone**, using the release file, against your real `https://` server.
- [ ] The id is not `com.example…`, and the version number is higher than the last upload.
- [ ] `.env` has no test keys; `PUBLIC_API_URL` is your production address.
- [ ] Only the permissions you use are asked for (check `android/app/src/main/AndroidManifest.xml` and `Info.plist`).
- [ ] A privacy policy page exists at a public address, and the stores' privacy forms say what the app collects.
- [ ] The keystore and its passwords are backed up outside the project and are not in git.
- [ ] You have the store texts and screenshots ready (phone sizes at least; tablets if you support them).

#### Updating a published app

Change the pages, run `kreft mobile:build --android --api-url …` again, raise `versionCode` and `versionName` (Android) or *Build* and *Version* (iOS), build the release file as above, and upload it as a new release. Reviews usually take from some hours to a few days. Only the files inside the app change when you upload; users get them through the store's normal update.

#### Release problems

| Problem | Fix |
|---|---|
| `android/keystore.properties or android/upload-keystore.jks already exists` | You passed `--create-keystore` a second time. It never replaces your key (a lost key means you can never update the app). For later releases drop `--create-keystore` and add `--bump`: `kreft mobile:release --android --api-url https://… --bump`. Keep the key files you already have. |
| `Version code 2 has already been used` (Play) | Raise `versionCode` in `android/app/build.gradle` and build again. |
| `You uploaded an APK that is not signed` / signed with the wrong key | The `release` build type must have `signingConfig signingConfigs.release`, and `keystore.properties` must exist. After the first upload, always use the same keystore. |
| `Keystore was tampered with, or password was incorrect` | A wrong `storePassword` or `keyPassword` in `keystore.properties`. |
| `SDK location not found` | Install Android Studio and set `ANDROID_HOME` (macOS: `~/Library/Android/sdk`), or write `sdk.dir=…` in `android/local.properties`. |
| `Unsupported class file major version` / `invalid source release: 21` | Gradle runs on the wrong Java. Run `kreft mobile:build --android` first: it writes a fitting Java (21 to 23) to `android/gradle.properties`. |
| The app opens but shows no data | The build still points at a test server. Build again with `--api-url https://…` and check that your server allows the app in CORS. |
| `adb install` says `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | A copy signed with another key is installed (for example the debug app). Uninstall it: `adb uninstall com.yourcompany.myapp`. |
| Play rejects the app for the target API level | Raise `targetSdkVersion` (in `android/variables.gradle`) to what the Console asks, update Capacitor's packages (`kreft update`), and build again. |
| Apple: `Missing Purpose String in Info.plist` | Add the `NS…UsageDescription` text for that permission and upload a new build. |
| Apple: `No account for team` / signing fails | Add your Apple ID in Xcode → Settings → Accounts, then choose the team again. |

### Writing your own edge components

The components in `components/edge/` are plain `.kreft` files, so copy one and change it. The ones that came with the kit follow a few rules, because each one was a real bug once. A test in the framework checks them for every kit component:

- **Props for what people customize, CSS variables for the look.** Colours come from the `--edge-*` variables in `edge.css`; a prop such as `bg` only sets a variable on the root.
- **Put `data-edge` on every `<button>`, `<input>`, `<select>` and `<textarea>`.** The starter `ui.css` styles all of them (height, border, hover colour); `data-edge` switches that off so your own CSS decides.
- **Do not name a class like one in `ui.css`** (`btn`, `field`, `label`, `card`, `muted`, `badge`, `danger`, `lead`): the global rule leaks into your component.
- **`k-ref` needs `state`**, not `let`: `state box = null`, then `k-ref="box"`.
- **Do not write `class="a {x}"` and `:class` on the same element**; the static part is lost. Build one text with `derive cls = 'a ' + x` and use `class={cls}`.
- **Scoped CSS cannot reach slotted children** (and `> :deep(*)` compiles to broken CSS). Set what you need on `box.children` from `on ready` and a `MutationObserver`, as `edge-stack` and `edge-pager` do.
- **No `style="…"` in the view** (a strict Content-Security-Policy blocks it): bind `:style="vars"`.
- Use `$router.go(path)` to navigate (there is no `push`), `k-elif` (not `k-else-if`), and give the component a comment at the top that lists its props.

### Mobile troubleshooting

| What you see | Why, and what to do |
|---|---|
| `invalid source release: 21` | Gradle runs on a Java older than 21. `kreft mobile:build`, `mobile:run` and `mobile:dev` fix this for good: they write `org.gradle.java.home=…` into `android/gradle.properties`, so Gradle uses a fitting Java from any terminal and from Android Studio (they never change a line you wrote there). In an app made before that, run `kreft mobile:build --android` once, or add the line yourself. |
| `Unsupported class file major version 69` (or 68, 70) | Gradle runs on a Java newer than 23. Use Java 21 (see above). |
| The phone shows "Webpage not available" (`net::ERR_CONNECTION_…`) | The phone cannot reach your computer: its Wi-Fi is off or it is on another network (mobile data cannot reach an address like `192.168.x.x`). Plug it in with the USB cable and turn on *USB debugging*: `kreft mobile:dev` then goes through the cable and needs no Wi-Fi. Otherwise put the phone on the same Wi-Fi as the computer. |
| A white screen and the error `ReferenceError: Kreftjs is not defined` | `kreftjs.js` did not start, almost always because the browser inside the phone is too old to read it. Update *Android System WebView* and *Chrome* in the Play Store (*Settings → Apps → Android System WebView* shows its version) and reload. The dev error box lists every error and the **first one is the cause** (a `SyntaxError` in `kreftjs.js` means an old browser). In an app made with an older kreft, refresh its runtime with `kreft update --core`. A built app shows "This app could not start…" on the screen instead of a blank page. |
| `This folder is not a Kreft app` | You ran a `mobile:` command outside an app, for example in the folder of the framework itself (a new terminal tab often starts there). Go into your app first, `cd my-app`, or add `--app /path/to/my-app` to the command. The command changes nothing when it refuses. |
| `Capacitor is not installed. Run: npm install` | Run `npm install` in the app. |
| The simulator needs a full Xcode install | Install Xcode, then `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`. |
| Nothing opens after `kreft mobile:build` | It only prepares the project. Run `kreft mobile:open --android` and press **Run**, or use `kreft mobile:dev`. |
| The page loads but data and sign-in fail | The app is calling an address the phone cannot reach. Build with `--api-url` and read the table in [Run it on an emulator, a simulator or a phone](#run-it-on-an-emulator-a-simulator-or-a-phone). |
| Content sits under the status bar | Android 15 and newer draw apps edge to edge. `capacitor.config.json` from `kreft mobile:init` has `android.adjustMarginsForEdgeToEdge: "force"`; add it to an older config. |
| `kreft mobile:dev` says a port is busy | It uses the next free one and tells the app (`Port 8000 is busy: using 8001`), so there is nothing to do. |
| `kreft mobile:icons` fails | The tool downloads itself the first time and needs the internet. The picture must be a PNG (1024x1024 for icons, 2732x2732 for the splash screen). |
| `kreft --version` shows an old number | The `kreft` command is the globally installed one. Update it: `npm install -g kreftjs@latest` (or the tag you published). |

### Mobile: what to know

- The app is your web app in the phone's WebView. It is not a second, native renderer, so very heavy animation or huge lists need care (use `edge-virtual-list` and `edge-lazy-grid`).
- A phone needs a reasonably current browser engine, and Android System WebView is updated through the Play Store. The framework's own files use no syntax newer than Chrome 64 (a test checks it; `?.` and `??` are avoided on purpose) and add small stand-ins for a few helpers old engines lack, but some features (such as the `ago` pipe) use newer browser features, so keep *Android System WebView* up to date.
- The backend never runs inside the phone. Use `--api-url`, API tokens for sign-in (not cookie sessions) and CORS on your server for the app.
- Android builds work on Mac, Windows and Linux. iOS builds need a Mac with Xcode.
- Camera, location and photo library on iPhone need a usage text in `ios/App/App/Info.plist`.
- The framework's own checks run in the Android emulator: debug builds, the native plugins, the animated splash screen, `kreft mobile:run`, and live reload with `kreft mobile:dev` (a saved edit shows in the running app within seconds). iOS has not been run in a simulator by those checks, and store builds are not made.

## Packages

`kreft install`, `kreft i` and `kreft add` use the same npm security pipeline.

```sh
kreft install luxon
# CI: explicitly allow installation after policy checks
kreft install luxon --yes
kreft i @scope/package@1.2.3 --dev
kreft install luxon --check --json
```

### The order of things

1. **Check.** Kreft resolves the exact versions in a temporary folder and reviews every package: registry identity, integrity, advisories, license and tier. Your project is not touched.
2. **Ask.** If the review passed, you see the summary and the question. A package that failed the review is blocked and no question is asked.
3. **Install, only on Allow.** Kreft installs the reviewed packages with their integrity verified and scripts disabled, then updates `package.json`, the lockfile and `node_modules` together.
4. **Disallow cancels.** Option 2, Enter, an unknown answer, Ctrl+C, EOF or a closed terminal cancel; option 4 also saves a deny rule.

**What a No changes: nothing.** A cancelled install leaves `package.json`, the lockfile, `node_modules`, `kreftjs.config.json` and other project files exactly as they were. npm may still update its external cache or logs while reviewing metadata. The temporary folder is removed, and no report is written either (no `.kreft/` folder appears). The only answers that write anything are the ones that say so: **Always allow** and **Never allow** save a rule in `kreftjs.config.json`.

### What you see

Normal output shows a colored **Package Security Assessment Report** with only the requested package name, exact version and status, followed by the installation choices. Registry progress, dependency lists and advisory details are hidden. If project policy blocks installation, a short reason replaces the confirmation.

- **Every package, one by one,** is written to `.kreft/security/latest.txt` (and `latest.json`) when reporting is enabled, except on cancellation. Add `--verbose` to `kreft install` to see all of it, and every check message, in the terminal.

After security checks pass, interactive CLI installs display the findings and ask what to do with the requested packages:

Like the JavaScript / TypeScript question in `kreft new`, package installation uses a numbered menu after the security check completes. For example, run `kreft add dayjs`, `kreft i dayjs` or `kreft install dayjs`:

```text
Security checks passed for dayjs@1.11.23. Choose what to do:
  1) Allow installation once
  2) Disallow installation once (default)
  3) Always allow this package in this project
  4) Never allow this package in this project

Installation [1/2/3/4]:
```

The version shown is the exact version resolved for that operation.

| Choice | What happens |
|---|---|
| `1` — Allow once | Install now after checks pass. No rule is saved; ask again next time. Also accepts `a`, `allow`, `y`, `yes`. |
| `2` — Disallow once | Cancel without changing project files or writing a report. This is the default for Enter, an unknown answer, EOF or Ctrl+C. Also accepts `d`, `disallow`. |
| `3` — Always allow | Install now and save the exact reviewed version in `security.allowedPackages`, for example `dayjs@1.11.23`. Future installs of that version still run security checks, then skip the question. Also accepts `r`, `always`. |
| `4` — Never allow | Cancel and save the package name in `security.deniedPackages`, for example `dayjs`. All versions are blocked on later installs. Also accepts `n`, `never`. |

For several requested packages, the answer applies to the whole batch. Saved choices apply to the requested packages, not automatic approvals of their dependencies. An already allowed batch skips the question only after the full review passes. Use `--yes` / `-y` for unattended CI installs; it never bypasses security policy. IDE terminals and redirected streams can answer the numbered question too. If input is closed or no answer is available, installation visibly cancels. Blocked packages cannot be allowed through this menu; dry runs do not prompt.

The installer copies the manifest, npm lockfile and project `.npmrc` to a temporary sibling directory inside the project. npm resolves a lockfile with scripts disabled. Kreft inspects every resolved entry, including nested duplicates, peer and optional dependencies. npm handles version conflicts and cycles. Registry metadata is fetched once per exact package/version per operation, with bounded retries and timeouts. User npm configuration and scoped registry settings remain applicable. Reports can contain private package metadata; registry credentials are not copied into reports.

Before fetching package bodies, Kreft enforces exact registry identity, strong integrity metadata, license policy and npm advisory thresholds. Any policy failure leaves the project manifest, lockfile and node_modules untouched. A successful review installs in staging using `npm ci --ignore-scripts`, which verifies downloaded bytes against lockfile integrity. Kreft compares the resulting lockfile and installed package identities with the approved graph, then promotes the staged tree with recovery on promotion failure. Platform-specific optional omissions are recorded. Existing node_modules is replaced with the approved tree, so extraneous modules and manual edits are removed. An interrupted process or machine failure during promotion may require manual recovery from `.kreft-node-modules-*`; this is not a crash-atomic multi-file transaction.

Configuration follows the existing JSON configuration convention, in `kreftjs.config.json` (including the existing `config/`, `Config/` and legacy filename lookup conventions):

```json
{
  "security": {
    "enabled": true,
    "minimumTier": 2,
    "blockCriticalVulnerabilities": true,
    "blockHighVulnerabilities": true,
    "blockMaliciousPackages": true,
    "ignoreScripts": true,
    "verifyIntegrity": true,
    "auditOnInstall": true,
    "allowUnverified": false,
    "checkDependencies": true,
    "checkLicenses": true,
    "checkMaintenance": true,
    "failOnUnknownSecurityStatus": true,
    "deniedLicenses": ["AGPL-3.0-only"],
    "deniedPackages": ["example-denied", "another-package@1.0.0"],
    "allowedPackages": ["luxon@3.5.0", "@scope/internal-tool"],
    "reports": {
      "enabled": true,
      "format": ["json", "text"],
      "directory": ".kreft/security"
    }
  }
}
```

The deny and allow lists are empty by default; the entries above illustrate organization-specific restrictions. The other settings shown are defaults. Unknown settings and invalid types fail with an error. `enabled`, `ignoreScripts`, `verifyIntegrity` and `checkDependencies` must remain true in this implementation. `--force` and `--yes` never bypass package policy. `--allow-scripts`, `--trusted`, `--no-audit` and `--no-exact` are rejected; script-dependent native packages require a separately reviewed build step. Per-version script exceptions are not yet implemented. Desktop scaffolding (`kreft add electron tauri`) retains its existing separate setup workflow and is not covered by this gatekeeper. Run desktop scaffolding and package installation separately.

### Remembering your decision: allow and deny rules

The prompt's **Always allow** and **Never allow** answers write a rule into `kreftjs.config.json`. You can also edit the rules yourself, without installing anything:

```sh
kreft install --allow-package luxon@3.5.0        # allow this exact version for good
kreft install --allow-package @scope/tool        # allow every version of a package
kreft install --deny-package left-pad            # block a package for good
kreft install --forget-package left-pad          # remove the rule again (a name removes every version)
kreft install --packages                         # list the rules (add --json for a machine-readable list)
```

- **`security.allowedPackages`** lists packages that skip the question. An entry is a package name (any version) or an exact version (`name@1.2.3`). It never holds a range, a tag or a URL.
- **`security.deniedPackages`** lists packages that are blocked. The same two forms.
- **Allowing never bypasses the review.** The security check (registry identity, integrity, advisories, license, tier) runs first, exactly as for any package. An allowed package that fails it is still blocked, and nothing is installed. The allow list only saves you the question. In the same way, `--yes` and `--force` never bypass the policy.
- **Always allow records the exact version** you reviewed, so a new version of the package is reviewed and asked about again.
- **One package cannot be both.** A configuration that allows and denies the same package (with overlapping versions) is rejected with a message. `--allow-package` on a package you denied removes the deny, and `--deny-package` on an allowed package removes the allow: you changed your mind on purpose, and the command says it did so.
- **Your file is kept as written.** Kreft edits only the `security` lists. Every other setting, and every `${NAME}` placeholder, stays exactly as you wrote it, and the new file is written in one step so a crash cannot leave half a file. If the file cannot be written, the choice still counts for the current installation and Kreft says it was not saved.
- A skipped question is recorded in the report as `decisionSource: "allowedPackages"`; an answer at the prompt is `"prompt"`, and a saved choice also has a `remembered` entry.

Commit `kreftjs.config.json` to share the rules with your team, or keep them local: the file is the only place they live.

Classifications:

- **Trusted (Tier 1)** requires verified provenance evidence this implementation cannot supply, so it is never issued. Requiring Tier 1 blocks installation.
- **Established (Tier 2)** requires matching registry identity/integrity, available advisory results, license evidence and (by default) maintainer/repository evidence. These are registry claims, not proof that code is safe.
- **Unverified (Tier 3)** indicates missing evidence, deprecation or license expressions requiring manual review. Permit explicitly with `allowUnverified: true` or `minimumTier: 3`. Missing registry/advisory evidence still blocks unless `failOnUnknownSecurityStatus` is also false.
- **Blocked** means a mandatory configured policy rule failed. Reports give the package, version, graph location, rule and supporting advisory evidence.

Download counts and dependency counts never establish trust. Package age alone never blocks installation. Advertised provenance is reported as unverified. License denial checks SPDX identifier tokens conservatively, including OR expressions; there is no automatic legal interpretation. Maintenance evidence is limited to metadata, not a claim about maintainer trustworthiness.

Reports default to `.kreft/security/latest.json` and `latest.txt`; operations that write reports replace these files. Cancellation preserves any earlier reports. Interactive decisions are recorded in the report as `decision: "allow"`, and a cancellation as `status: "cancelled"` with `policyAllowed: true` (which tells the developer's choice apart from a security block). **A cancellation writes no report file**: see "What a No changes" above. With `--json` the report goes to stdout either way. Other statuses are `approved` (successful review without installation), `installed`, `blocked` and `failed`.

`--json` emits the report to stdout; failures also produce diagnostic stderr and nonzero exit status. `--check` resolves and evaluates without fetching/extracting package bodies, so its approval does not mean artifact bytes have been verified. CI can run `kreft install package --check --json` and inspect the exit status before an actual install.

This version supports standalone npm projects with lockfile versions 2 and 3. Aliases, git/file/URL sources, npm overrides, workspaces, npm shrinkwrap and other package managers fail explicitly. They require additional resolution and verification support; they are not silently converted to npm. npm registry advisory availability is required by default. No advisory database guarantees complete malware or vulnerability detection. Source review, cryptographic provenance verification, historical dependency-change analysis and a dedicated malicious-package feed remain future work.

Validation: `node --test test/package-rules.test.js` covers the allow and deny rules, the prompt answers, the command-line flags and the guarantee that an allowed package is still reviewed. `node --test test/package-gatekeeper.test.js` exercises policy decisions, malicious specifications, advisory and license blocking, missing evidence, graph mismatch, dry runs, exact pinning and project preservation on failure. Resolution uses npm's documented [lockfile behavior](https://docs.npmjs.com/cli/commands/npm-install/) and [npm ci semantics](https://docs.npmjs.com/cli/commands/npm-ci/).

## MCP for AI agents

Kreft includes a Model Context Protocol server, so an AI coding agent can see your project's routes and schema, and query the database read-only.

| Tool or resource | What it gives |
|---|---|
| `query_database` | Runs one read-only `SELECT`. |
| `list_routes` | Every route with methods, name and middleware. |
| `server_health` | Uptime and memory. |
| `kreft://routes`, `kreft://schema` | The route catalogue; the tables, columns and keys. |

### Local use (stdio)

```bash
kreft mcp
```

```json
{
  "mcpServers": {
    "kreft": { "command": "kreft", "args": ["mcp"], "cwd": "/path/to/your-project" }
  }
}
```

### Over HTTP

`kreft dev` and `kreft serve` also answer at `/mcp`. Set a token and send it:

```env
MCP_TOKEN=a-long-random-secret
```

```bash
curl -H "Authorization: Bearer a-long-random-secret" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' http://localhost:8000/mcp
```

### What protects it

- **`MCP_TOKEN`** is required whenever it is set. The `APP_KEY` is never accepted in its place.
- **In production** (`NODE_ENV` or `APP_ENV` = `production`), the endpoint is off (`403`) until `MCP_TOKEN` is set.
- **In development without a token**, only a direct local client is accepted: a loopback address, a `localhost` Host header, and no proxy headers (`X-Forwarded-*`). A remote address, a proxy or a tunnel needs `MCP_TOKEN`.
- **Browsers** from foreign origins are refused. `MCP_ALLOWED_ORIGIN` adds one origin.
- **`query_database` is limited**: one `SELECT`, no comments or `;`, no mutations or file functions, no `SELECT … INTO`, and no sleeping or locking. It refuses columns and tables that hold credentials (anything named like a password, token, secret, hash or authentication, and the tokens, sessions and jobs tables), whole-row JSON building, and the database server's own accounts and sessions (`mysql.*`, `performance_schema`, `sys`, `pg_authid`…). Results are masked again by shape (password hashes). The query runs in a transaction that is always rolled back, with a time limit of 5 seconds (`MCP_QUERY_TIMEOUT_MS`).

> [!WARNING]
> The MCP database tool can still read every other table. Use a database account with read-only access and no access to credentials, and keep the token out of version control.

### Calling other MCP servers (client)

Your app can also call tools on a remote MCP server over Streamable HTTP:

```js
const { Mcp } = require('kreftjs/server')

const quran = await Mcp.connect('https://mcp.quran.ai')   // { headers: { Authorization: 'Bearer …' } } if needed
const tools = await quran.tools()
const verses = await quran.call('fetch_quran', { ayahs: '1:1-2' })
await quran.close()
```

`call` returns the structured result (or the text, parsed as JSON when possible) and throws if the tool reports an error. Only `http(s)` URLs are accepted, redirects are refused, and a response over `maxBytes` (10 MB) is cut off. Never pass a URL a visitor typed: your server would fetch addresses of their choosing, including your internal network (SSRF). Use a fixed or allow-listed URL.

## Running `kreft dev` outside a project

`kreft dev` and `kreft serve` start only in a Kreft project: a folder with `index.html`, a `frontend/` folder, `.kreft` pages, a backend or a `kreftjs.config.json`. In any other folder (an empty one, your home folder) they stop and say so, instead of serving whatever is there. `kreft dev --force` serves the folder anyway. `kreft run dev` is not a command: inside a project use `kreft dev`, or `npm run dev`.

## Kreft Shield

Floods and scanners from one address can slow a server to a crawl. Turn on the Shield with one line in `.env` (changes apply without a restart):

```
SHIELD=true
```

For every visitor address (the same `req.ip()` that `throttle` uses, so set `TRUSTED_PROXIES` behind a proxy):

| Protection | Default | Setting |
|---|---|---|
| Rate limit: over the limit answers `429` with `Retry-After` | 300 requests in 10 s | `SHIELD_MAX_REQUESTS`, `SHIELD_WINDOW_SEC` |
| Probing counts more: `401`, `403`, `404` and `405` answers weigh 5 requests | 5 | `SHIELD_ERROR_WEIGHT` |
| Concurrency: requests in flight at once from one address | 60 | `SHIELD_MAX_CONCURRENT` |
| Ban: this many rate-limit hits within the strike window | 3 hits in 10 min | `SHIELD_STRIKES`, `SHIELD_STRIKE_WINDOW_MIN` |
| Ban length, doubling at every repeat up to 24 h | 15 min | `SHIELD_BAN_MINUTES` |
| Connections: open sockets from one address; extra ones are closed (stops slowloris floods that never finish a request) | 100 | `SHIELD_MAX_CONNECTIONS` |
| Overload: when the event loop lags, limits shrink to a quarter | 300 ms lag | `SHIELD_MAX_LAG_MS` |

IPv6 visitors are counted by their `/64` prefix, because one customer owns billions of addresses in it and could otherwise rotate through them.

**Behind nginx, Caddy or a CDN, set `TRUSTED_PROXIES`.** Without it every visitor looks like the proxy: all users would share one limit and one ban, and a proxy on the same computer (`127.0.0.1`) is never limited at all. The Shield prints a warning when it sees `X-Forwarded-For` from an address that is not trusted.

Never limited: addresses in `SHIELD_ALLOW="1.2.3.4,5.6.7.8"` and this computer (`127.0.0.1`, `::1`), unless `SHIELD_LOCAL=true` (use it to try the Shield on your own machine). A banned address is answered with a bare `429` before any work is done.

```js
const { Shield } = require('kreftjs/server')
Shield.on('ban', (b) => Log.warning(`banned ${b.ip} for ${b.minutes} min: ${b.reason}`))
Shield.bans()            // who is banned now
Shield.unban('1.2.3.4')  // let an address back in
Shield.ban('1.2.3.4', 60)
Shield.status()          // counters, limits, event-loop lag
```

The MCP tool `shield_status` returns the same. Bans are kept in memory, so a restart clears them. The Shield protects the application; a flood that fills your network connection has to be stopped by a firewall or a CDN in front of the server.

## Memory watchdog

Long-running servers can slowly collect memory. Start with `--gc` (or `AUTO_GC=1`) and Kreft samples the heap every 30 seconds (`AUTO_GC_INTERVAL_MS`). When it passes `AUTO_GC_THRESHOLD_MB`, Kreft clears its own caches and runs garbage collection. This is a safety net; find the leak if you see it often.

The watchdog is a small memory manager:

- **Adaptive.** A cleanup also runs when the heap keeps growing (more than `AUTO_GC_GROWTH_MB_PER_MIN`, default 20) while already above 60% of the threshold, not only after it passes the limit.
- **Least-used first.** The in-memory cache (`CACHE_STORE=memory`) keeps at most `CACHE_MEMORY_MAX` entries (default 5000) and, under pressure, drops expired and least recently used entries instead of everything. Register your own cache with `onMemoryPressure('name', (fraction) => dropped)`.
- **Leak hint.** After each real GC (needs `--gc`) Kreft records the heap that remains. If it keeps rising by `AUTO_GC_LEAK_RISE_MB` (default 20) over several collections, it reports a suspected leak. `writeHeapSnapshot()` saves a `.heapsnapshot` for Chrome DevTools to show what holds the memory.
- **Alerts.** `onMemoryAlert((alert) => …)` is called when memory is still high after `AUTO_GC_ALERT_AFTER` cleanups in a row (default 3), or a leak is suspected, at most once per 10 minutes. Without a listener the alert is printed as a warning.
- **Report.** `getMemoryReport()` returns the samples, trend, GC and eviction counts, leak state and alerts as JSON; the MCP tool `memory_report` returns the same.

```js
const { getMemoryReport, onMemoryAlert } = require('kreftjs/server')
onMemoryAlert((a) => Log.warning(a.message))
Route.get('/admin/memory', () => getMemoryReport()).middleware('auth')
```

# Security

## Security overview

Kreft is built so the safe thing is the default. This chapter lists what is protected, where, and what stays your job.

### In the browser

- **Escaped views.** Everything in `{ }`, `k-text` and attributes is shown as text. `<script>` in a user's bio is only text.
- **`k-html` is cleaned**, not trusted. Kreft parses the HTML the way the browser does, in a document that runs nothing, then removes scripts, frames, forms, SVG and MathML, every `on…` attribute, `srcdoc`, and addresses that start with `javascript:` or an unsafe `data:`. Even so, bind only HTML you trust or that the server already cleaned.
- **A strict Content-Security-Policy works** with built apps. `kreft build` turns every expression into a function ahead of time, so there is no `eval` and no `new Function`. Without a build, views compile in the browser and a strict CSP blocks that.
- **Prototype pollution is blocked.** Paths and keys such as `__proto__`, `constructor` and `prototype` are ignored in views, translations and JSON bodies.
- **A login cookie is HttpOnly**, so a script on your page cannot read it.

### In the phone app

- **Anything inside the app can be read** by whoever installs it: the files, the code and every `PUBLIC_` value. Secrets (API keys, database passwords, `APP_KEY`) stay on the server; the app talks to your server, and your server talks to the other services.
- **Sign in with API tokens**, not cookie sessions, and keep the token in the phone's secure storage. Use `https://` for every address.
- **`Kreftjs.native.system.openUrl` opens only `http`, `https`, `mailto`, `tel` and `sms`** addresses, never `javascript:` or `file:`. `edge-web-view` shows only `http(s)` and relative addresses, in a sandbox that cannot reach your app's data.
- **Live reload (`kreft mobile:dev`) shares the dev server on your network.** Use a private network.

### On the server

#### CSRF

Kreft uses the double-submit cookie pattern. Any safe request gets an `XSRF-TOKEN` cookie; any request that changes data (POST, PUT, PATCH, DELETE) from a browser must send the same value back in `X-XSRF-TOKEN` (or `X-CSRF-TOKEN`, a `_token` field). The comparison is constant-time, and a wrong or missing token answers `419`.

- `Kreftjs.api` sends the header by itself. HTML forms add `<input type="hidden" name="_token" value="{csrfToken}">`.
- `Route.csrfCookie('/csrf-cookie')` gives a single-page app an endpoint to get the cookie first.
- Exempt only what must be (webhooks): `.withoutMiddleware('csrf')`.
- Requests that carry only an API bearer token and no cookie are not browser sessions and do not need CSRF.

#### HTML on the server

Anything built into HTML on the server should go through the helpers in `kreftjs/server`:

```js
const { escapeHtml, cleanHtml, SafeHtml, html } = require('kreftjs/server')

escapeHtml(userText)                         // turn text into safe text
cleanHtml(userHtml)                          // keep a small set of tags and attributes, drop the rest
```

`cleanHtml` keeps an allow-list of tags and attributes, checks every address, and filters `style`. A tag it cannot read is turned into text (`&lt;`), never passed through.

#### Passwords, keys and tokens

| Tool | What it does |
|---|---|
| `Hash.make` / `Hash.check` | Passwords with scrypt, a new salt each time, constant-time compare. |
| `Crypt.encryptString` / `Crypt.decryptString` | AES-256-GCM with a fresh IV, keyed by `APP_KEY`. Tampering is detected. |
| `Url.signed` / `Url.check` | Links that work only unchanged (and until a time). |
| API tokens, reset tokens | Stored as a SHA-256 hash; the plain value is shown once. |

> [!WARNING]
> `APP_KEY` encrypts sessions and signs links. Changing it signs everyone out and breaks old signed links. Keep it out of version control and out of logs.

#### Limits and lockouts

- `throttle:60,1` limits requests per visitor and route. The sign-in routes allow 6 a minute.
- Accounts lock after repeated wrong passwords or two-factor codes, whatever the address. See [Authentication](#authentication).
- Request bodies are limited (`MAX_BODY_KB`), and JSON bodies cannot carry `__proto__` or `constructor` keys.
- Every API answer carries `X-Content-Type-Options`, `X-Frame-Options` and `Referrer-Policy`; in production also `Strict-Transport-Security`.

#### Plain HTTP

In production a request with `X-Forwarded-Proto: http` is redirected to `https`, and one with `X-Forwarded-Proto: https` is served when it comes from this machine or from a proxy listed in `TRUSTED_PROXIES` (so a proxy that ends TLS works with `FORCE_HTTPS=true` or an `https://` `APP_URL`; anyone else could write that header, so from other addresses it is ignored, and the server says so once in its log). Without that header, `FORCE_HTTPS=true` or an `https://` `APP_URL` redirects every plain request. The address in the redirect comes from `APP_URL` when set, otherwise from the `Host` header only if it looks like a host name; it cannot be used to send visitors to another site.

#### API tokens

A token made in the profile page has a list of permissions (`read`, `create`, `update`, `delete`), and the middleware enforces them from the HTTP method on every route. A read-only token cannot delete anything, even if its owner is an admin.

#### Uploads

Files get random names. Unknown extensions are stored as `.bin`. Public files are served as plain data with a sandbox policy, so they cannot run scripts. Use `isImage()` to check the real file header.

#### The database

- Values travel as parameters. Table and column names are quoted.
- The automatic table API (`--db`) is a development tool with no login. `kreft serve` only serves the tables you list in `kreftjs.config.json`, with `write: false` and `hidden: [...]` where needed; hidden columns cannot be read or used to sort.
- Raw SQL helpers (`whereRaw`, `selectRaw`, `orderByRaw`, `DB.raw`) are for your own SQL; pass user values in their parameter array.

#### Packages

`kreft add` blocks install scripts, typosquats and look-alike names, flags very new packages, and pins exact versions. See [Packages](#packages).

### What stays your job

- **Check access on the server.** Client route guards decide what to show, not who may read data. Every route that returns private data needs `auth` and, where it matters, `admin` or a policy.
- **Never trust HTML you did not clean**, and never put secrets in `PUBLIC_` variables or localStorage.
- **Keep dependencies and Node.js up to date** (`kreft update`, `npm audit`).
- **Protect the machine.** Kreft cannot protect a database, a server or a `.env` file that others can read.

## Production checklist

Go through this before your first real user:

| Check | Why |
|---|---|
| `NODE_ENV=production` and `APP_ENV=production` | Turns off debug pages, enables HSTS and the https redirect, and makes security errors fatal. |
| `APP_DEBUG=false` | Never show stack traces or source code to visitors. |
| `APP_KEY` set to a 32-byte key (`kreft key:generate`) | In production the app refuses to start without a key of at least 16 bytes. A random per-process key would also break sessions on restart. |
| `APP_URL=https://your.site` | Used for links in emails, the https redirect and secure cookies. |
| `TRUSTED_PROXIES` set if you use a proxy | Otherwise every visitor shares the proxy's address and rate limits. |
| A real `DATABASE_URL` and a backup plan | SQLite is fine for small apps; use MySQL or PostgreSQL for several servers. |
| `CACHE_STORE=redis` or `database`, `QUEUE_CONNECTION=redis` or `database` | `memory` is per process. Account lockouts live in the cache, so they are shared between servers only with `database` or `redis`. |
| `MAIL_URL` set | Otherwise emails are only printed in the terminal. |
| `MCP_TOKEN` set, or MCP left off | The MCP endpoint is disabled in production without it. |
| Tables listed in `kreftjs.config.json`, or no `--db` at all | `kreft serve` serves only the tables you list. |
| No test user | Do not run `--seed` against production; delete `test@example.com` if it exists. |
| HTTPS in front of the app, and `FORCE_HTTPS=true` | Cookies are `Secure` in production and on `https` URLs. Plain HTTP is only redirected to HTTPS with `FORCE_HTTPS=true` or an `https://` `APP_URL`. |
| No `SESSION_SECURE_COOKIE=false` in `.env` | It switches the `Secure` flag off, so the login cookie is also sent over plain `http://`. Older templates wrote it; the server warns about it at start-up in production. |
| `npm audit` and `kreft update` | Fix known vulnerabilities before release. |
| Phone app: `--api-url` is an `https://` address, and the app id is yours | A published app must not call `http://10.0.2.2` or keep the id `com.example.…`. See [Publishing your app](#publishing-your-app-to-google-play-and-the-app-store). |
| Phone app: no secrets inside it | Everything in an app (the code, `PUBLIC_` values) can be read by whoever installs it. Keep keys and passwords on the server. |

> [!NOTE]
> Kreft does not replace a security review. For regulated or high-risk systems, have the app, its infrastructure and its dependencies reviewed by someone who does that professionally.

## Known limits

- Without a build, views are compiled in the browser with `new Function`, which a strict Content-Security-Policy blocks. Use `kreft build` for production.
- Inside a view, `<` directly followed by a letter starts a tag, so write `{a < b}` with a space.
- The memory of which two-factor codes were already used, and login tickets, is kept per process. Behind several servers, a code can be replayed once on each. The per-account lockout (kept in the cache) still limits guessing.
- The sanitizer removes unsafe markup; it is not a substitute for choosing carefully what HTML you show.
- `--prerender` makes static HTML at build time. On a running server whole pages are drawn only for crawlers and link previews; every other visitor gets the page drawn by the browser, and an address the app does not have answers 200 (the app shows its own 404 page) unless `seo.js` says otherwise.
- `.kreft` files must be served over `http://` or `https://`, not opened from `file://`.
- Phone apps run your web app in the phone's WebView and need a server for the backend; iOS builds need a Mac with Xcode. See [Mobile: what to know](#mobile-what-to-know).

# Reference

## Environment variables

Set these in `.env` (never commit it). Variables that start with `PUBLIC_` are copied into the browser as `Kreftjs.env`; never put a secret in one.

### App

| Variable | Meaning |
|---|---|
| `APP_NAME`, `APP_URL` | Name and public address (used in emails, https redirects, secure cookies). |
| `APP_ENV`, `NODE_ENV` | `production` turns on production behaviour (either one is enough). |
| `APP_DEBUG` | `true` shows the interactive error page outside production. |
| `APP_KEY` | Encrypts sessions and signs links. Make it with `kreft key:generate`; required in production. |
| `APP_LOCALE`, `APP_FALLBACK_LOCALE`, `APP_TIMEZONE` | Language and time zone defaults. |
| `HOST`, `PORT` | Where `kreft serve` listens. |
| `PUBLIC_APP_NAME` | The app's name in the browser, in the phone app's top bar and home page, and under the animated splash logo. |
| `PUBLIC_API_URL` | The server a phone app talks to. `kreft mobile:build --api-url https://api.example.com` writes it for you; read it with `Kreftjs.env.PUBLIC_API_URL`. It is visible inside the app, so never put a secret in it. |
| `FORCE_HTTPS` | `true` redirects plain HTTP in production. |
| `MAX_BODY_KB` | Largest request body accepted. |

### Database, cache and queues

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | `sqlite:…`, `mysql://…` or `postgres://…`. |
| `DB_CONNECTION`, `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`, `DB_SSL` | The same as separate values. |
| `CACHE_STORE` | `database`, `file`, `memory` or `redis`. Also `CACHE_PREFIX`, `CACHE_DEFAULT_TTL`. |
| `QUEUE_CONNECTION` | `database`, `redis` or `sync`. Also `QUEUE_NAMES`, `QUEUE_WORKER`. |
| `REDIS_URL`, or `REDIS_HOST` `REDIS_PORT` `REDIS_USERNAME` `REDIS_PASSWORD` `REDIS_DB` `REDIS_TLS` `REDIS_PREFIX` | Redis connection. |
| `SCHEDULER` | `off` hands scheduling to cron (`kreft schedule:run`). |
| `MAX_QUERY_ROWS`, `HARD_QUERY_LIMIT` | Upper limits on rows a query may return. |
| `FILESYSTEM_DISK` | `local` or `public`. |

### Sign-in and sessions

| Variable | Default | Meaning |
|---|---|---|
| `SESSION_LIFETIME` | 120 | Minutes of inactivity before a session ends. |
| `SESSION_EXPIRE_ON_CLOSE` | false | End the session when the browser closes. |
| `SESSION_SECURE_COOKIE`, `SESSION_SAME_SITE`, `SESSION_DOMAIN`, `SESSION_COOKIE` | production / `Lax` | Cookie attributes. |
| `AUTH_TOKEN_DAYS` | 30 | A token unused this long stops working. |
| `PASSWORD_TIMEOUT` | 10800 | Seconds a password confirmation stays valid. |
| `LOGIN_MAX_FAILURES`, `LOGIN_WINDOW_SECONDS` | 10, 900 | Wrong passwords per account before a lockout. |
| `TWO_FACTOR_MAX_FAILURES` | 8 | Wrong two-factor codes per account before a lockout. |
| `PUBLIC_SESSION_TIMEOUT`, `PUBLIC_SESSION_WARNING` | 15, 2 | Minutes of page inactivity before sign-out, and the warning before it. |
| `PUBLIC_DOCS_URL` | `http://kreftjs.com` | Where the "Documentation" links of a new app's pages go. Change it to `https://…` or to your own site. |

### Network and tools

| Variable | Meaning |
|---|---|
| `TRUSTED_PROXIES`, `TRUSTED_PROXY_HOPS` | Which proxies' `X-Forwarded-For` is believed, and how many stand in front with `*`. |
| `KREFT_ALLOWED_HOSTS` | Extra host names `kreft dev` answers to. |
| `MCP_DATABASE_RESTRICTED` | Set to `true` when the MCP connection uses a database user that can read only the tables it should see. Without an engine-enforced read protection (SQLite on Node.js 24+ has one) the `query_database` tool is turned off; the other MCP tools stay on. |
| `KREFT_ALLOWED_ORIGINS` | Full origins (like `https://app.example.com,http://localhost:5173`) whose plain HTML forms may post to your API. A form sent from any other web site, or from the same host on another port, is refused (this stops login CSRF). JSON requests are not affected. |
| `MCP_TOKEN`, `MCP_ALLOWED_ORIGIN`, `MCP_QUERY_TIMEOUT_MS` | MCP endpoint token, one extra allowed browser origin, and the query time limit. |
| `MAIL_URL`, `MAIL_FROM` | `smtp://user:password@host:587` sends real email (needs `kreft add nodemailer`). |
| `LOG_LEVEL`, `LOG_CHANNEL` | `debug`, `info`, `notice`, `warning`, `error`, `critical`. |
| `AUTO_GC`, `AUTO_GC_THRESHOLD_MB`, `AUTO_GC_INTERVAL_MS` | The memory watchdog. |

## API cheat sheet

| Group | Names |
|---|---|
| `.kreft` keywords | `state` `derive` `action` `when` `watch` `on` `prop` `event` `use` `share` `receive` `import` `saved` `load` `layout` |
| In the script | `send` `props` `bus` `store` `$route` `$router` `tick` and every `Kreft` function |
| In the view | `{expr}` `attr={expr}` `@event` `k-if` `k-elif` `k-else` `k-each` `k-key` `k-match` `k-case` `k-default` `k-model` `k-show` `k-text` `k-html` `k-ref` `k-skip` `k-once` `k-memo` `k-animate` `{for}` |
| App | `Kreftjs.app(rootOrPath)` then `.component()` `.directive()` `.share()` `.use()` `.mount()` `.unmount()` |
| Data | `store` (`$patch` `$reset` `$watch`) `state` `signal` `derived` `readonly` `saved` `storage` |
| Reacting | `watch` `effect` `tick` `onCleanup` `onReady` `onUpdate` `onShow` `onHide` `onDestroy` |
| Sharing | `bus` (`on` `once` `off` `send`) `share` `receive` |
| Forms | `form(values, rules)` (`$error` `$errors` `$valid` `$busy` `$submit` `$check` `$reset` `$setErrors`) and `validate(values, rules)` |
| Server data | `table(name)` and `api` (`get` `post` `put` `patch` `delete` `setup` `create` `onError`) |
| Languages | `$t` `$choice` `$locale` `$dir`, `Kreftjs.locale()` `Kreftjs.translations()` |
| Router | `Kreftjs.router()` with `.go` `.replace` `.back` `.before` `.after` `.route`, and `children` for nested routes |
| Engine | `Kreftjs.render(view, data, options)` |
| Phone apps | `Kreftjs.native` (`device` `haptics` `file` `system` `position` `dialog` `on` `pushBack` `safeArea` `asset`), the `edge` store (`setTop` `setBottom` `reset` `hideBars`), `Kreftjs.edgeIcons`, the `edge-` components, and the touch events `@tap` `@longpress` `@swipe` `@swipeleft` `@swiperight` `@swipeup` `@swipedown` |
| Server | `Route` `Model` `DB` `Seeder` `Hash` `Str` `Url` `Mail` `Crypt` `Cache` `Storage` `Schedule` `config` `response` `abort` and the helpers in `require('kreftjs/server')` |

## Compared with other frameworks

Kreft is one framework for the browser and the server. The others below each cover part of that, so the honest comparison is "what do you put next to them". This is a map to help you choose, not a ranking: all of them are good, and most are older, bigger and better known than Kreft.

| | **Kreft** | **Next.js** | **Nuxt** | **Astro** | **AdonisJS** | **NestJS** |
|---|---|---|---|---|---|---|
| **What it is** | Frontend and backend in one | React framework | Vue framework | Content sites with islands of interactivity | Backend (MVC) | Backend (modules, dependency injection) |
| **Components** | `.kreft` files, no Virtual DOM | React | Vue | Astro files; React, Vue, Svelte … inside | none (Edge templates, or Inertia) | none |
| **Pages drawn on the server** | At build time (`--prerender`), and for crawlers and link previews on request | Yes, for every visitor | Yes, for every visitor | Yes, mostly at build time | Only with Inertia | no |
| **Database layer** | Active Record `Model`, migrations, seeders, factories | none (use Prisma, Drizzle …) | none | none | Lucid (Active Record) | none (TypeORM, Prisma, MikroORM …) |
| **Sign-in, 2FA, API tokens** | Built in, in every new project | none (Auth.js …) | none (a module) | none | Built in | none (Passport, your own) |
| **Queues, mail, scheduler, cache** | Built in | none | none | none | Built in | Modules |
| **AI agent access (MCP)** | Built in | none | none | none | none | none |
| **Runtime dependencies** | None | Many | Many | Many | Some | Some |
| **Language** | JavaScript or TypeScript | TypeScript first | TypeScript first | TypeScript first | TypeScript first | TypeScript first |
| **Ecosystem and hiring** | Small, new | Very large | Large | Large | Medium | Large |

**Choose Kreft when** you want a whole application (screens, database, sign-in, jobs, mail) from one tool with almost no dependencies, in the Laravel style, and your team is small enough to learn one framework.

**Choose something else when:**

- **Next.js or Nuxt:** your team already knows React or Vue, you need the libraries of that ecosystem, or every visitor must get server-drawn HTML with streaming and incremental updates. Kreft draws whole pages on the server only for crawlers and link previews (see "Whole pages for crawlers").
- **Astro:** the site is mostly content (blog, documentation, marketing) and ships almost no JavaScript. Kreft apps always ship the framework.
- **AdonisJS:** you want the same Laravel-like backend with a larger community and years of production use, and you will bring your own frontend.
- **NestJS:** you build a large API or microservices with many teams, and you want strict structure and dependency injection.

**Things to weigh before choosing Kreft:** it is young and has one small community, few third-party packages are made for `.kreft` files, and nobody has run it at large scale yet. See [Known limits](#known-limits).

## Coming from Vue

| Vue | Kreft |
|---|---|
| `.vue` single-file component | `.kreft` file: script, `<view>`, `<style scoped>` |
| `ref()`, `reactive()`, `computed()` | `state`, `derive` (JS: `Kreftjs.signal`, `Kreftjs.state`, `Kreftjs.derived`) |
| `watch`, `watchEffect` | `watch x { }`, `when cond { }` (JS: `Kreftjs.watch`, `Kreftjs.effect`) |
| `{{ x }}`, `:attr`, `@click` | `{x}`, `attr={x}`, `@click={fn}` |
| `v-if`, `v-else-if`, `v-else`, `v-show` | `k-if`, `k-elif`, `k-else`, `k-show` |
| `v-for` with `:key` | `{for x in list key x.id}` … `{/for}`, or `k-each` + `k-key` |
| `v-model`, `v-once`, `v-memo` | `k-model`, `k-once`, `k-memo` |
| `defineProps`, `defineEmits`, `emit` | `prop`, `event`, `send()` |
| slots, scoped slots | `<slot>`, `<template k-slot:name="{ item }">` |
| `provide`, `inject` | `share`, `receive` |
| `onMounted`, `onUpdated`, `onUnmounted` | `on ready`, `on update`, `on destroy` |
| `<KeepAlive>`, `<Teleport>`, `<Suspense>` | `keep`, `<kreft-portal>`, `<kreft-wait>` |
| `<Transition>` | `k-animate="fade"` |
| Vue Router with nested routes | `Kreftjs.router()`, `<kreft-view>`, `<kreft-link>`, `children` |
| Pinia | `Kreftjs.store()` + `use`, with `{ saved: true }` |
| Vite dev server | `kreft dev` (or `kreft vite:dev`) |
| Nuxt static generation | `kreft build --prerender` |
| Nuxt `server/api` | `server/*.js` served at `/api/*` |

## Glossary

| Term | Meaning |
|---|---|
| **Component** | A `.kreft` file: script, view and style together. |
| **State** | A value that can change; the view follows it. |
| **Derived value** | A value calculated from other values; stays up to date by itself. |
| **Store** | State shared by many components. |
| **Layout** | The frame around pages: header, menu, footer. |
| **Middleware** | A check that runs before a route (client side) or a controller (server side). |
| **Migration** | A file that describes a change to the database schema. |
| **Seeder / Factory** | Fills the database with starting data / makes fake rows. |
| **Policy** | A class that decides whether a user may do something to a model. |
| **MCP** | Model Context Protocol: how AI agents read your project through tools. |
