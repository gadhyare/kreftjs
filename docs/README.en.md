# Som.js — Documentation

Som.js is a small reactive framework with its own component language. You write a component in a `.som` file: declare your state, derived values and actions in plain words, describe the page in a `<view>`, and the page updates itself whenever the state changes. It's one JavaScript file with no build step.

```html
<!-- Counter.som -->
state count = 0
derive double = count * 2

action add() { count++ }

<view>
  <button @click={add}>{count} × 2 = {double}</button>
</view>
```

---

## Contents

1. [Getting started](#1-getting-started)
2. [The .som language](#2-the-som-language)
3. [The view](#3-the-view)
4. [Components](#4-components)
5. [Sharing data](#5-sharing-data)
6. [Saving data](#6-saving-data)
7. [Talking to an API & Fetching Data](#7-talking-to-an-api--fetching-data)
8. [Router](#8-router)
9. [Template engine](#9-template-engine)
10. [Using Som from JavaScript](#10-using-som-from-javascript)
11. [Blade & Server Templating](#11-blade--server-templating)
12. [Reference](#12-reference)
13. [Developer tools](#13-developer-tools)
14. [Build for production](#14-build-for-production)
15. [Limits](#15-limits)
16. [Security & CSRF Protection](#16-security--csrf-protection)
17. [Database & Models Guide](#17-database--models-guide)
18. [Controllers & Request Handling](#18-controllers--request-handling)
19. [Middleware & Route Protection](#19-middleware--route-protection)
20. [Migrations, Seeders & Factories](#20-migrations-seeders--factories)
21. [Queues, Jobs & Background Processing](#21-queues-jobs--background-processing)
22. [Testing Your Application](#22-testing-your-application)
23. [Passing Data from Controllers to Pages](#23-passing-data-from-controllers-to-pages)
24. [Folder Structure & Custom Directories](#24-folder-structure--custom-directories)
25. [RTL & LTR Internationalization](#25-rtl--ltr-internationalization)
26. [Model Context Protocol (MCP) & AI Agent Integration](#26-model-context-protocol-mcp--ai-agent-integration)
27. [Auto Garbage Collector & Memory Watchdog](#27-auto-garbage-collector--memory-watchdog)
28. [Security-Hardened Package Management (som add)](#28-security-hardened-package-management-som-add)
29. [Desktop Applications with Electron.js (som electron)](#29-desktop-applications-with-electronjs-som-electron)
30. [Vite.js Bundling & Instant HMR (som vite)](#30-vitejs-bundling--instant-hmr-som-vite)
31. [Advanced ORM: Soft Deletes, Eager Loading & Transactions](#31-advanced-orm-soft-deletes-eager-loading--transactions)
32. [Configuration System (config/)](#32-configuration-system-config)
33. [HTML Security, XSS Sanitization & Safe Display](#33-html-security-xss-sanitization--safe-display)
34. [Session Lifetimes & Frontend Inactivity Watchdog](#34-session-lifetimes--frontend-inactivity-watchdog)
35. [Interactive Error Monitoring & Debugging (.som)](#35-interactive-error-monitoring--debugging-som)


---

## 1. Getting started

A Som app is an HTML page plus `.som` files.

```html
<!-- index.html -->
<div id="app"></div>
<script src="som.js"></script>
<script>
  Som.app('App.som').mount('#app')
</script>
```

```html
<!-- App.som -->
state name = 'World'

<view>
  <h1>Hello {name}</h1>
  <input s-model="name">
</view>
```

### With npm (recommended)

You need [Node.js](https://nodejs.org) (it includes npm). Inside the Som.js folder, run this once so the `som` command works everywhere:

```bash
npm link
```

Then create and run a project:

```bash
som new my-app
cd my-app
npm run dev
```

Open the address the terminal shows (`http://localhost:8000`). `som dev` serves your files, never caches them while you work, and makes clean URLs like `/users/5` work on reload. If port 8000 is busy, it picks the next free one.

To try the demo in the Som.js folder itself: `npm run dev`, then open `http://localhost:8000/demo/`. A new project, and the demo, also show this documentation at `/docs`.

> **`.som` files need a server.** Browsers block loading files from `file://`, so always open the app through `npm run dev` (or any web server).

### The folders of a new project

A new Som.js application is organized around a clean, zero-leak separation of concerns between your client application (`frontend/`) and your server architecture (`backend/`):

```text
my-app/
├── frontend/                     # Public client-side application (the only folder served)
│   ├── index.html                # Application entrypoint & client bootstrap
│   ├── App.som                   # Root reactive shell & router container
│   ├── ui.css                    # Modern design system & utility classes
│   ├── som.js & som.d.ts         # Reactive engine & TypeScript declarations
│   ├── routes/
│   │   └── web.som               # Client-side route declarations (/dashboard, /login, etc.)
│   ├── layouts/
│   │   ├── app.som               # Authenticated application layout (sidebar, header, user menu)
│   │   └── guest.som             # Minimal guest layout for auth flows
│   ├── pages/
│   │   ├── Home.som              # Welcome landing page
│   │   ├── Dashboard.som         # Main user dashboard with reactive analytics
│   │   ├── Profile.som           # Account settings & session management
│   │   ├── Users.som             # User administration table
│   │   └── auth/                 # Complete authentication views
│   │       ├── Login.som         # Log in form with inactivity protection
│   │       ├── Register.som      # User registration
│   │       ├── ForgotPassword.som# Password reset request
│   │       ├── ResetPassword.som # Password reset submission
│   │       ├── VerifyEmail.som   # Email verification notice
│   │       └── ConfirmPassword.som# Sensitive action password confirmation
│   ├── components/               # Reusable UI widgets
│   │   ├── Field.som             # Form input wrapper with error states
│   │   ├── StatCard.som          # Metric summary card
│   │   └── profile/              # Profile modules (ApiTokens, Sessions, TwoFactor)
│   └── tests/                    # Frontend test pages & component specs
│
├── backend/                      # Isolated server-side application (never exposed to HTTP)
│   ├── config/                   # Centralized configuration repository
│   │   ├── app.js                # App name, environment, debug mode, key
│   │   ├── auth.js               # Authentication guards, providers & token settings
│   │   ├── database.js           # Database connections (SQLite, MySQL, PostgreSQL)
│   │   ├── redis.js              # Redis cache & session client config
│   │   └── session.js            # Lifetime timeout, idle watchdog & driver options
│   ├── app/
│   │   ├── Http/
│   │   │   ├── Controllers/      # HTTP request handlers (Auth, Profile, Admin)
│   │   │   └── Middleware/       # Request filters (Authenticate, CheckAbilities, EnsureIsAdmin)
│   │   ├── Models/               # Data models with schema casting & relationships (User, etc.)
│   │   └── Providers/            # Application service providers & boot hooks
│   ├── database/
│   │   ├── migrations/           # Database schema migrations (0001_create_users, etc.)
│   │   ├── seeders/              # Seed scripts for initial & mock data
│   │   └── factories/            # Model factories for testing
│   └── routes/
│       ├── api.js                # REST API endpoints & route handlers
│       ├── auth.js               # Authentication API endpoints
│       └── console.js            # Scheduled background jobs & CLI artisan tasks
│
├── .env                          # Local secrets, database credentials & APP_KEY
├── package.json                  # Project dependencies & npm scripts
└── som.config.json               # Som.js CLI & tooling options
```

#### Detailed Breakdown of Folders:

1. **`frontend/` — The Public Client Application**
   - **`index.html`**: The HTML foundation that loads fonts, initial styles, and mounts the root reactive Som component into `#app`.
   - **`routes/web.som`**: Maps browser URLs to page components using declarative route tags (`<route path="/dashboard" component={Dashboard} />`). Supports nested routes and route guards.
   - **`layouts/`**: Reusable page wrappers. `layouts/app.som` provides responsive side navigation, user profile menus, and active route highlights, while `layouts/guest.som` wraps authentication screens.
   - **`pages/`**: Full-screen view components. Everything you build as a destination route lives here. Pre-bundled auth pages in `pages/auth/` handle the complete user lifecycle out of the box.
   - **`components/`**: Isolated, reusable UI building blocks like form fields, modal dialogs, and stat cards that receive props and emit events.
   - **`ui.css`**: A lightweight, modern design system inspired by minimalist UI patterns with CSS variables, form controls, responsive typography, and utility classes.

2. **`backend/` — The Private Server Engine**
   - **`config/`**: Houses structured configuration files. Every setting is loaded and cached by Som's configuration repository and accessible anywhere in your backend with `config('database.default')` or `config('session.lifetime')`.
   - **`app/Http/Controllers/`**: Encapsulates your business logic and handles incoming HTTP requests, input validation, and JSON responses.
   - **`app/Http/Middleware/`**: Intercepts requests before reaching controllers. Includes `Authenticate` (with automatic session lifetime and inactivity enforcement), role checkers, and token validators.
   - **`app/Models/`**: Clean database models with property casting, validation rules, and query scopes.
   - **`database/migrations/`**: Code-defined schema migrations that run with `som db migrate` across SQLite, PostgreSQL, and MySQL.
   - **`routes/api.js`**: Defines your REST endpoints, HTTP methods (`Route.get`, `Route.post`), rate limits, and middleware bindings.

3. **Security by Isolation**
   - **Zero Public Leakage**: The dev server (`som dev`) and production static builds (`som build`) strictly expose only the `frontend/` directory. The `backend/` folder, database files, and `.env` have no HTTP routes and cannot be downloaded by browsers under any circumstance.
   - **Strict Protection**: On macOS and Linux, `som new` initializes `backend/` and `.env` with restrictive file permissions (readable only by the local owner), and internal directory guards actively prevent path traversal attacks.

### CSS libraries: Tailwind, Bootstrap, Bulma, Pico…

Any CSS library works. Its classes go in your `<view>` like any other class.

**From a CDN.** Add its `<link>` (or `<script>`) to `index.html`. `som build` leaves these links as they are. A new project can start with one:

```bash
som new my-app --ui tailwind     # also: bootstrap, bulma, pico
```

```html
<!-- index.html, before your own <style> so your styles win -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css">
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js" defer></script>
```

**From npm.** Install it and import the CSS file in any `.som` file. It becomes a `<link>` on the page, added once:

```html
import 'bootstrap/dist/css/bootstrap.min.css'     // npm i bootstrap
import 'bootstrap-icons/font/bootstrap-icons.css'
import './theme.css'                              // your own CSS file, next to this .som file
```

`som build` copies these files (and the fonts and images they point to) into `dist/vendor/` and links them in `index.html`.

**Tailwind with its own CLI** (instead of the CDN script) needs to know where your classes are: give it `"./**/*.{html,som}"` as the content to scan.

**The look of a new project.** `som new` adds `ui.css`: quiet styles in the spirit of shadcn/ui, with square corners and no shadows. A plain `<button>`, `<input>`, `<select>`, `<table>` and `<code>` already look right, and there are a few classes: `btn` (`primary`, `secondary`, `ghost`, `danger`, `sm`, `lg`), `card`, `badge`, `alert`, `label`, `field`, `muted`. Change the colors at the top of the file and everything follows. Delete the `<link>` to `ui.css` if you'd rather use only a library.

### npm packages in the browser

Install a package, then import it in a `.som` file:

```bash
npm i dayjs nanoid lodash
npm i -D esbuild           # once per project: it prepares packages for the browser
```

```html
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { nanoid } from 'nanoid'
import { debounce } from 'lodash'

state id = nanoid()
on start { dayjs.extend(relativeTime) }

<view>
  <p>{dayjs(post.date).fromNow()}</p>
</view>
```

`som dev` serves each package as one browser-ready file and tells the browser where to find it (an import map). Packages written the old Node.js way (`module.exports`, like lodash) work too, named imports included. `som build` writes them, minified, into `dist/deps/`. Packages that need Node.js itself (the file system, a database driver) belong in [your own server code](#your-own-server-code-server) instead.

---

## 2. The .som language

A `.som` file has three parts:

1. **The script**: everything outside `<view>` and `<style>`. Each line starts with a keyword.
2. **`<view>`**: the HTML of the component.
3. **`<style>`** (optional): CSS. Add `scoped` so it only applies to this component.

### Keywords

| Keyword | Example | Meaning |
|---|---|---|
| `state` | `state count = 0` | A value that can change. When it changes, the view updates. |
| `derive` | `derive double = count * 2` | A value calculated from other values. It updates by itself. |
| `action` | `action add(n) { count += n }` | A function you call from the view or from other actions. |
| `when` | `when count > 10 { … }` | Runs the block each time the condition becomes true. |
| `watch` | `watch count { … }` | Runs the block each time the value changes. Inside it, `value` is the new value and `old` is the previous one. |
| `on` | `on ready { … }` | Lifecycle: `on start` (before showing), `on ready` (on screen), `on update` (after the view changed), `on show` / `on hide` (a kept component comes back / is put away, see [keep](#keep-put-away-instead-of-removed)), `on destroy` (being removed). |
| `prop` | `prop start = 0` | A value the parent passes in. The value after `=` is the default. |
| `event` | `event save, remove` | Events this component sends to its parent with `send('save', data)`. |
| `use` | `use cart` | Use a shared store (see [Sharing data](#5-sharing-data)). `use mouse = trackMouse()` uses [shared logic](#shared-logic-use-x--) from a `.js` file. |
| `share` | `share theme = 'dark'` | Give a value to every component inside this one. |
| `receive` | `receive theme = 'light'` | Take a value a parent shared. The value after `=` is the fallback. |
| `import` | `import Card from './Card.som'` | Use another component, or a JavaScript module. |
| `saved` | `saved todos = []` | Like `state`, but kept in the browser (localStorage), so it survives a page reload. |
| `load` | `load users = api.get('/api/users')` | Loads data from an API. Gives `users.data`, `users.loading`, `users.error` and `users.reload()`. |

Inside the script you use names **directly**: write `count++`, not `this.count++` or `count.value++`.

```html
<!-- TodoPage.som -->
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

watch todos {
  localStorage.setItem('todos', JSON.stringify(value))
}

on start {
  todos = JSON.parse(localStorage.getItem('todos') || '[]')
}

<view>
  <form @submit.prevent={add}>
    <input s-model="text" placeholder="New todo">
  </form>
  <label s-each="todo in todos" s-key="todo.id">
    <input type="checkbox" s-model="todo.done"> {todo.text}
  </label>
  <p>{remaining} left · <button @click={clearDone}>Clear done</button></p>
</view>
```

### Good to know

- An `action` that uses `await` becomes async automatically.
- Lines that don't start with a keyword are normal JavaScript, for example `let timer` or `const max = 10`. They're visible to your actions but not to the view. Use `state`, `derive` or `action` for anything the view needs.
- Inside the script you can use every Som function directly: `bus`, `store`, `signal`, `watch`, `tick`… and `send`, `props`, `$route`, `$router`.
- Errors point to the file and line, for example `"state" needs a name, like: state count = 0 (Bad.som, line 3)`.

---

## 3. The view

### Showing values: `{ }`

```html
<h1>Hello {name}</h1>
<p>{count} items · total {total.toFixed(2)}</p>
<p>{isAdmin ? 'Admin' : 'User'}</p>
```

Values are always escaped, so they're safe. To show a real `{`, write `\{`.

### Attributes

```html
<img src={user.photo} alt={user.name}>        <!-- the value as it is -->
<button disabled={count === 0}>Reset</button>  <!-- false removes the attribute -->
<div class="card {active ? 'on' : ''}">        <!-- build a text -->
<a href="/users/{user.id}">Profile</a>
```

`:class` and `:style` also accept objects: `:class="{ done: todo.done }"`.

### Events

```html
<button @click={add}>Add</button>            <!-- calls add() -->
<button @click="add(5)">Add 5</button>
<input @input="search($event.target.value)"> <!-- $event is the browser event -->
<form @submit.prevent={save}>
<input @keyup.enter={send}>
```

Modifiers: `.prevent` `.stop` `.self` `.once` `.capture` `.passive`. Keys: `.enter` `.esc` `.space` `.tab` `.up` `.down` `.ctrl` `.shift` `.alt` `.meta` `.exact`.

### Directives

| Directive | What it does |
|---|---|
| `s-if` / `s-elif` / `s-else` | Adds or removes the element |
| `s-each="item in list"` + `s-key="item.id"` | Repeats the element. Also `(item, index) in list`, `(value, key) in object`, `n in 10` |
| `s-model="name"` | Two-way binding for input, textarea, select, checkbox, radio. Modifiers `.trim` `.number` `.lazy` |
| `s-show` | Hides with CSS instead of removing |
| `s-text` / `s-html` | Sets text, or HTML (`s-html` is not escaped, so only use it with HTML you trust) |
| `s-ref="box"` | Gives you the element: `state box = null` receives it |
| `s-skip` | Leaves the element as it is (for code samples with `{ }`) |
| `s-once` | Draws the element once and never updates it |
| `s-memo="[a, b]"` | Updates the element only when `a` or `b` changes (great in long lists) |
| `s-animate="fade"` | Animates the element when it comes and goes (see [Animations](#animations-s-animate)) |
| `<template s-if>` / `<template s-each>` | Groups elements without a wrapper |
| `<som-component :is="name">` | Shows a component chosen while the app runs |
| `<som-portal to="body">` | Renders the content somewhere else (modals, toasts) |

### Loops: `{for}`

```html
<ul>
  {for user in users key user.id}
    <li>{user.name}</li>
  {empty}
    <li>No users yet</li>
  {/for}
</ul>
```

- `{for user in users}` repeats everything up to `{/for}` once per item, like `users.map(…)` in React.
- `key user.id` (optional) lets Som keep and move the right rows when the list changes.
- `{empty}` (optional) shows when the list is empty.
- `{for (user, i) in users}` gives the index, `{for (value, key) in object}` walks an object, and `{for n in 5}` counts from 1 to 5.
- Loops can be nested and work inside tables. `s-each` on an element does the same: `<li s-each="user in users" s-key="user.id">`.

Write `\{for` to show the text itself.

### Animations: `s-animate`

```html
<p s-if="open" s-animate="fade">Hello</p>
<div s-show="menu" s-animate="slide">…</div>
<ul>
  {for item in items key item.id animate slide}
    <li>{item.name}</li>
  {/for}
</ul>
```

`s-animate` works with `s-if` / `s-else`, `s-show`, loops, `<som-component>` and `<som-view>`. Four animations are ready to use: `fade`, `slide`, `scale` and `pop`.

Your own animation is just CSS. Pick a name, then style these classes:

| Class | When |
|---|---|
| `name-in` | The whole time it comes in (put the `transition` here) |
| `name-in-from` | The first moment: where it comes from |
| `name-out` | The whole time it goes out |
| `name-out-to` | Where it goes to |
| `name-move` | A list item moving to its new place |

```css
.drop-in, .drop-out { transition: all .3s ease }
.drop-in-from { opacity: 0; transform: translateY(-30px) }
.drop-out-to  { opacity: 0; transform: translateX(60px) }
```

- Som waits for the longest `transition` or `animation` before it removes the element.
- `s-animate.after` lets the old element leave before the new one comes in (`s-if` / `s-else`, pages, components).
- Nothing animates when the page first opens. Add `.first` to animate then too: `s-animate.first="fade"`.
- An element with `s-animate` and none of the above plays its in-animation when it appears.

### Faster views: `s-once` and `s-memo`

Som already changes only the exact text or attribute that changed. For big pages:

```html
<footer s-once>Opened at {openedAt}</footer>   <!-- never updates -->

{for row in rows key row.id}
  <tr s-memo="[row.id === selected]" class={row.id === selected ? 'on' : ''}>…</tr>
{/for}
```

With `s-memo`, picking another row redraws two rows, not all of them.

### Your own directives

```js
app.directive('focus', {
  ready(el, binding) { el.focus() },  // element is on the page
  update(el, binding) {},             // binding.value changed
  destroy(el, binding) {},            // element is being removed
})
```

```html
<input s-focus>
<div s-tooltip:top={message}></div>   <!-- binding.arg = 'top', binding.value = message -->
```

---

## 4. Components

### Using a component

Register it once by its path:

```js
Som.app('App.som')
  .component('UserCard', 'components/UserCard.som')
  .mount('#app')
```

Or import it in the `.som` file that needs it:

```html
import UserCard from './UserCard.som'

<view>
  <user-card name="Alice Smith" age={30}></user-card>
</view>
```

In the view, write component names in **kebab-case** (`<user-card>`).

### Props: parent → child

```html
<!-- UserCard.som -->
prop name
prop age = 0
prop admin = false

<view>
  <div class="card">{name} ({age}) <b s-if="admin">admin</b></div>
</view>
```

```html
<user-card name="Alice Smith" age={30} admin></user-card>
```

The default's type is used for plain text attributes: `age="30"` becomes the number `30`, and `admin` with no value becomes `true`. A prop can't be changed inside the child; send an event to the parent instead.

### Events: child → parent

```html
<!-- TodoItem.som -->
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
  <todo-item s-each="t in todos" s-key="t.id" todo={t} @remove={removeTodo}></todo-item>
</view>
```

With a component event, `@remove={removeTodo}` passes the data the child sent: here `removeTodo(id)`.

### `s-model` on a component

```html
<!-- Toggle.som -->
prop modelValue = false
event update:modelValue

<view>
  <button @click="send('update:modelValue', !modelValue)">{modelValue ? 'On' : 'Off'}</button>
</view>
```

```html
<toggle s-model="darkMode"></toggle>
```

Named: `s-model:title="pageTitle"` uses `prop title` and the event `update:title`.

### Slots

```html
<!-- Card.som -->
prop items = []

<view>
  <div class="card">
    <header><slot name="header">Default title</slot></header>
    <slot></slot>
    <li s-each="item in items"><slot name="item" item={item}>{item}</slot></li>
  </div>
</view>
```

```html
<card items={users}>
  <template s-slot:header>Users</template>
  <p>Body content</p>
  <template s-slot:item="{ item }"><b>{item.name}</b></template>
</card>
```

### Styles

- `<style>` applies to the whole page.
- `<style scoped>` applies only to this component.
- `.parent :deep(.child)` reaches into child components from scoped CSS.
- Attributes like `class` that you put on a component tag land on its root element.

For colors in VS Code, run `som vscode` once (see [Developer tools](#13-developer-tools)).

### Keep: put away instead of removed

```html
<som-component :is="tab" keep></som-component>
<som-view keep></som-view>
<som-view keep="5"></som-view>   <!-- keep at most 5; the one used longest ago goes -->
```

When you switch away, a kept component is put aside with everything in it: typed text, scroll lists, its state. When you come back it is exactly as you left it. Kept components get two more lifecycle steps:

```html
on show { timer.start() }   <!-- it came back (also the first time) -->
on hide { timer.stop() }    <!-- it was put away -->
```

### Waiting: `<som-wait>`

```html
<som-wait>
  <user-profile id={5}></user-profile>
  <p s-waiting>Loading…</p>
  <p s-failed="error">Could not load: {error.message}</p>
</som-wait>
```

`<som-wait>` shows the `s-waiting` part until everything inside is ready: components whose `.som` file is still loading, every `load`, and every `on start` that uses `await`. Inside it, a component that is still loading draws its view only when its data is there, so the view never meets `null`. If something fails, the `s-failed` part shows instead (the name you give, here `error`, holds the error). It only waits the first time; later reloads use the usual `loading` fields.

---

## 5. Sharing data

| Need | Use |
|---|---|
| Parent → child | `prop` |
| Child → parent | `event` + `send()`, or `s-model` |
| Many components, anywhere | stores: `Som.store()` + `use` |
| A parent → everything inside it | `share` / `receive` |
| "Something happened" messages | `bus.send()` / `bus.on()` |

### Stores

Create a store once, in your page's script:

```js
Som.store('cart', {
  items: [],
  get count() { return this.items.length },
  get total() { return this.items.reduce((s, p) => s + p.price, 0) },
  add(product) { this.items.push(product) },
})
```

Use it in any `.som` file. Every component sees the same data, and a change in one place updates all of them:

```html
use cart

<view>
  <span>Cart: {cart.count} · {cart.total}</span>
  <button @click="cart.add(product)">Add</button>
</view>
```

Every store also has:

| | |
|---|---|
| `cart.$patch({ total: 0 })` or `cart.$patch((c) => { … })` | Change several values at once |
| `cart.$reset()` | Back to the values it started with |
| `cart.$watch((values) => …)` | Runs on every change (stops by itself when the component goes away) |

### Shared logic: `use x = …`

Logic you need in many components goes in a `.js` file as a function. It can use `Som.state`, `Som.watch`, `Som.onReady`, `Som.onDestroy` and the rest, and it belongs to the component that uses it:

```js
// logic/mouse.js
export function trackMouse() {
  const pos = Som.state({ x: 0, y: 0 })
  const move = (e) => { pos.x = e.clientX; pos.y = e.clientY }
  window.addEventListener('pointermove', move)
  Som.onDestroy(() => window.removeEventListener('pointermove', move))
  return pos
}
```

```html
import { trackMouse } from '../logic/mouse.js'
use mouse = trackMouse()

<view><p>{mouse.x}, {mouse.y}</p></view>
```

### Share / receive

```html
<!-- Layout.som -->
state settings = { theme: 'dark', lang: 'so' }
share settings = settings

<!-- any component inside it, however deep -->
receive settings
<view><p>Theme: {settings.theme}</p></view>
```

Share a `state` object, as in this example, and every receiver updates when it changes. `Som.app(…).share('key', value)` shares with the whole app.

### Event bus

```html
<!-- sending -->
action save() { bus.send('toast', 'Saved!') }

<!-- listening -->
state message = ''
on ready { bus.on('toast', (text) => (message = text)) }
```

Listeners added in `on start` or `on ready` are removed automatically when the component is removed. Others stay until you call `bus.off('toast', fn)`.

---

## 6. Saving data

Write `saved` instead of `state` and the value is kept in the browser's localStorage, so it survives a page reload and closing the browser.

```html
saved todos = []
saved theme = 'light'
saved token = '' as 'auth.token'    <!-- choose the storage key yourself -->
```

- Every change is saved by itself, deep ones too: `todos.push(…)`, `todo.done = true`.
- The key is `<Component>.<name>`, for example `Home.todos`, stored as `som:Home.todos`. Use `as '…'` to choose your own, for example to share one value between components.
- A change made in another tab of the same site shows up in this tab too.

A store keeps its plain values when you add `saved`:

```js
Som.store('cart', {
  items: [],
  get count() { return this.items.length },
}, { saved: true })                 // or { saved: ['items'] } to save only some fields
```

From JavaScript:

```js
const theme = Som.saved('theme', 'light')   // a signal: theme.value = 'dark' is saved
Som.storage.set('user', { name: 'Alice Smith' })
Som.storage.get('user')                      // { name: 'Alice Smith' }
Som.storage.remove('user')
Som.storage.clear()                          // removes only what Som saved

Som.app({ todos: [], saved: ['todos'] })     // object components
```

localStorage belongs to one browser on one site, holds about 5 MB, and anyone using that browser can read it, so never store passwords in it. Data that users or devices share belongs on your server, through the API.

---

## 7. Talking to an API & Fetching Data

Som.js makes data fetching and HTTP requests straightforward. The global `api` client is directly accessible in all `.som` files, and `Som.api` is available in standard JavaScript.

```js
const users = await api.get('/api/users', { query: { page: 2 } })   // GET /api/users?page=2
const user  = await api.post('/api/users', { name: 'Alice Smith' })  // POST create
await api.put('/api/users/1', user)                                  // PUT replace
await api.patch('/api/users/1', { status: 'active' })                // PATCH update
await api.delete('/api/users/1')                                     // DELETE remove
```

---

### 7.1 How to Fetch Data in `.som` Files (`load`)

The `load` keyword declares a **reactive asynchronous resource**. It automatically handles loading states, error catching, and refetching when reactive dependencies change:

```html
<!-- pages/Posts.som -->
state query = ''
state page = 1

// Automatically refetches whenever `query` or `page` changes!
load posts = api.get('/api/posts', { query: { q: query || undefined, page } })

<view>
  <div class="search-bar">
    <input type="search" s-model.lazy="query" placeholder="Search posts…">
  </div>

  <!-- Loading state -->
  <div s-if="posts.loading" class="spinner">
    Loading posts…
  </div>

  <!-- Error state -->
  <div s-elif="posts.error" class="error-box">
    Failed to load posts: {posts.error.message}
    <button @click={posts.reload}>Try Again</button>
  </div>

  <!-- Success state with data -->
  <div s-else class="post-list">
    {for post in posts.data || [] key post.id}
      <article class="post-card">
        <h3>{post.title}</h3>
        <p>{post.body}</p>
      </article>
    {empty}
      <p class="empty">No posts found matching "{query}".</p>
    {/for}
  </div>

  <button @click={() => page++}>Next Page ({page})</button>
</view>
```

#### Properties of a `load` Resource:
- `resource.data`: The returned payload (`null` until loaded).
- `resource.loading`: Boolean flag, `true` while the request is in flight.
- `resource.loaded`: Boolean flag, `true` once the first response has arrived.
- `resource.error`: Holds the `Error` or `ApiError` object if rejected, otherwise `null`.
- `resource.reload()`: Method to manually trigger a fresh network request.

#### Direct Table Operations with `table(name)`
For fast CRUD operations on database tables served by `som dev --db` or `/api/<table>`:

```html
const posts = table('posts')

// Fetch all with filters, sorting, and pagination:
load list = posts.all({ q: search, _sort: '-created_at', _limit: 10 })

action createPost() {
  const newPost = await posts.create({ title: 'New Article', body: '...' })
  list.data = [newPost, ...list.data] // Update local state immediately
}

action deletePost(id) {
  await posts.remove(id)
  list.data = list.data.filter(p => p.id !== id)
}
```

Available `table` methods:
- `posts.all(query, options)`: GET all matching rows.
- `posts.find(id, options)`: GET single row by ID.
- `posts.count(query)`: Returns total record count (reads `X-Total-Count` header).
- `posts.create(data, options)`: POST new record.
- `posts.update(id, data, options)`: PUT full replacement.
- `posts.patch(id, data, options)`: PATCH partial column updates.
- `posts.remove(id, options)`: DELETE record.

### Errors

A failed request throws an `ApiError` with `status`, `message`, `data` and `errors` (validation error messages). Network problems and timeouts have `status` 0.

```html
state errors = {}

action save() {
  try {
    await api.post('/api/users', form)
  } catch (e) {
    errors = e.errors || {}    // { email: ['The email has already been taken.'] }
  }
}
```

### Forms and validation

Give a form its rules in declarative style. The page checks them first, so a form with mistakes is never sent:

```html
state post = form({ title: '', email: '' }, { title: 'required|min:3|max:120', email: 'required|email' })

action save() {
  const created = await post.$submit((values) => api.post('/api/posts', values))
  if (created) post.$reset()
}

<view>
  <form @submit.prevent={save}>
    <input s-model="post.title">
    <p s-if="post.$error('title')" class="error">{post.$error('title')}</p>
    <button disabled={post.$busy}>Save</button>
  </form>
</view>
```

| On the form | What it is |
|---|---|
| `post.title`, `post.email` | The values, for `s-model` |
| `post.$error('title')` | The first message for a field, or `''` |
| `post.$errors` | Every message: `{ title: ['…'] }` |
| `post.$valid`, `post.$busy` | No mistakes / sending right now |
| `post.$submit(send)` | Checks; only then calls `send(values)`. A 422 from the server fills the same errors. Gives `false` when it didn't send |
| `post.$check()`, `post.$reset(values?)`, `post.$setErrors(e)` | Check now / start again / show errors from elsewhere |

Errors show after the first submit, then follow your typing. Rules: `required` `required_if:field,value` `nullable` `string` `numeric` `integer` `boolean` `accepted` `email` `url` `alpha` `alpha_num` `alpha_dash` `date` `after:date` `before:date` `min:n` `max:n` `between:a,b` `size:n` `digits:n` `in:a,b` `not_in:a,b` `same:field` `different:field` `confirmed` `regex:/…/`. `min`, `max`, `between` and `size` count letters for text, the value for numbers, and items for lists. A rule can also be a function: `title: ['required', (v) => v !== 'test' || 'Pick a real title']`.

Without a form: `validate(values, rules)` gives `{}` or `{ field: ['…'] }`. Your own words: `form(values, rules, { messages: { 'title.required': 'Write a title' } })`. To translate every message, change `Som.validate.messages`.

**The same rules on the server.** With `som dev --db` or `som serve`, add `"rules"` to a table in `som.config.json`: `"posts": { "rules": { "title": "required|min:3" } }`. The practice API reads `"$rules"` from its JSON file. The backend server validates incoming requests, and its 422 errors land in the form the same way.

### Settings

```js
Som.api.setup({
  base: '/api',                             // then api.get('users') → /api/users
  token: () => Som.storage.get('token'),    // sent as Authorization: Bearer …
  headers: { 'Accept-Language': 'en' },
  timeout: 10000,                           // ms (default 30000)
})
Som.api.onError((e) => { if (e.status === 401) location.href = '/login' })
const github = Som.api.create({ base: 'https://api.github.com' })   // a second client
```

Options for one request: `query`, `headers`, `timeout`, `signal` (to cancel) and `full: true` (returns `{ data, status, headers }`). Hooks: `before(request)`, `after(data)`, `onError(error)`. FormData, Blob and text are sent as they are (file uploads); any other body is sent as JSON.

**Backend APIs:** every request sends `X-CSRF-TOKEN` from `<meta name="csrf-token">`, `X-XSRF-TOKEN` from cookies, `X-Requested-With` and `Accept: application/json`, so the server answers with JSON and 422 validation errors. These headers, and your `token`, only go to your own site (or to a client's own `base`), never to someone else's API.

Any public API works the same way; the demo's Online API page uses [jsonplaceholder.typicode.com](https://jsonplaceholder.typicode.com): `const online = api.create({ base: 'https://jsonplaceholder.typicode.com' })`.

### A practice API: `som dev --api`

```bash
som dev --api db.json              # a REST API at /api, made from a JSON file
som dev --api db.json --delay 500  # answer slowly, to see loading states
```

```json
{
  "posts": [{ "id": 1, "title": "Hello" }],
  "$required": { "posts": ["title"] }
}
```

This gives GET and POST on `/api/posts`, GET, PUT, PATCH and DELETE on `/api/posts/1`, search with `?q=text`, filters with `?field=value`, and standard 404 and 422 validation errors. Changes are written back to the JSON file, so they survive a restart; add `--no-save` to keep them in memory only. The demo's Posts page uses it (`npm run dev`).

### A real database: SQLite, MySQL, PostgreSQL

`--db` turns the tables of a database into the same kind of API, at `/api/<table>`:

```bash
som dev --db sqlite:database/app.db                       # built into Node.js 22.5+, nothing to install
som dev --db mysql://user:pass@localhost:3306/shop        # MySQL or MariaDB: npm i mysql2
som dev --db postgres://user:pass@localhost:5432/shop     # PostgreSQL: npm i pg
som new my-app --db sqlite                                # a new project with a database and a Todos page
```

Make the tables with `.sql` files in `database/migrations`. They run once each, in name order. `som dev` runs new ones by itself; `som db migrate` runs them by hand:

```sql
-- database/migrations/001_create_posts.sql
CREATE TABLE posts (
  id INTEGER PRIMARY KEY,            -- MySQL: INT AUTO_INCREMENT PRIMARY KEY · PostgreSQL: SERIAL PRIMARY KEY
  title VARCHAR(200) NOT NULL,
  body TEXT,
  likes INT NOT NULL DEFAULT 0
);
```

Every table gets:

| Request | What it does |
|---|---|
| `GET /api/posts` | Rows. Filters: `?userId=3`, `?title_like=som`, `?likes_gte=5` (also `_lte` `_gt` `_lt` `_ne`), `?q=text` (every text column). `?_sort=-likes,title`, `?_limit=20&_page=2` (at most 1000 a time). The `X-Total-Count` header has the full count |
| `GET /api/posts/1` | One row |
| `POST /api/posts` | Create; answers 201 with the new row |
| `PUT /api/posts/1` | Replace; columns you leave out become empty, unless they can't be |
| `PATCH /api/posts/1` | Change some columns |
| `DELETE /api/posts/1` | Remove; answers 204 |

Columns that are `NOT NULL` without a default are required: a missing one answers 422 with `{ message, errors }`. So does a value that breaks a `UNIQUE` or foreign key rule. `BOOLEAN` columns come back as `true` / `false` in every database.

In the browser, use `api` and `load` as usual, or `table`:

```html
const posts = table('posts')
load list = posts.all({ q: search, _sort: '-id', _limit: 20 })

action save() { await posts.create({ title }) }        // also find(id), count(), update, patch, remove
```

Which tables are open, and what they allow, goes in `som.config.json`:

```json
{
  "db": "sqlite:database/app.db",
  "tables": {
    "posts": true,
    "users": { "write": false, "hidden": ["password"] },
    "orders": { "write": ["create"] }
  }
}
```

`som dev` serves every table until you list them. **`som serve` serves only the tables you list.** Use it to run the built app for real users: `som build`, then `som serve dist`. Put the real address and password in `DATABASE_URL`, in `.env` or the environment (see below); it wins over `"db"`. The database file, `som.config.json` and `database/` are never sent to the browser, and `som build` leaves them out.

There's no login built in yet, so anyone who can open the site can use the open tables. Open only what the public may see or change, or keep your own secure backend for anything private.

Other commands: `som db seed` (runs `database/seed.sql`), `som db tables`, `som db sql "SELECT …"`.

### A full-stack backend: routes, controllers, models

For your own API, Som.js provides complete backend capabilities in Node.js. A project made with `som new` has them:

```
routes/api.js                       Route.get(…), Route.apiResource(…)        (addresses start with /api)
app/Http/Controllers/PostController.js
app/Http/Middleware/Authenticate.js
app/Models/Post.js
database/migrations/2026_10_29_120000_create_posts_table.js
database/seeders/DatabaseSeeder.js
```

`som dev` and `som serve` load `routes/api.js` by themselves, and `som dev` picks up every change you save. These folders never reach the browser, and `som build` leaves them out. Each file gets what it needs from `require('somjs/server')`.

**Routes** (`routes/api.js`):

```js
const { Route } = require('somjs/server')
const PostController = require('../app/Http/Controllers/PostController')

Route.get('/hello', (req) => ({ hello: req.input('name', 'world') }))   // GET /api/hello
Route.apiResource('posts', PostController)          // index, store, show, update, destroy
Route.get('/posts/{post}/comments', [PostController, 'comments']).name('posts.comments')
Route.middleware('auth').group(() => {
  Route.delete('/posts/{post}', [PostController, 'destroy'])
})
Route.prefix('admin').middleware(['auth', 'ensure-is-admin']).group(() => { … })
```

Parameters are written `{post}`, or `{post?}` when they're optional. A route can also take a name (`.name('…')`), a pattern (`.whereNumber('id')`) or `.middleware(…)`. `Route.url('posts.comments', { post: 5 })` builds an address. `som route:list` shows every route.

### Namespaces (`use` and `namespace`)

Som.js supports PHP-style namespaces for controller routing, class auto-loading, and model relations:

```js
const { Route, use, namespace } = require('somjs/server')

// 1. Single class import just like PHP `use App\Models\User;`
const User = use('App\\Models\\User')
const UserController = use('App\\Http\\Controllers\\Admin\\UserController')

// 2. Namespace grouping:
const { User, Post, Role } = namespace('App\\Models')
const { DashboardController, UserController } = namespace('App\\Http\\Controllers\\Admin')

// 3. Controller routing with namespaces:
Route.namespace('Admin').group(() => {
  Route.get('/users', 'UserController@index')
  Route.apiResource('users', 'UserController')
})

// 4. Or direct PHP backslash namespace strings in routes:
Route.get('/users', 'App\\Http\\Controllers\\Admin\\UserController@index')
Route.get('/stats', 'Admin\\DashboardController@index')
Route.apiResource('admin/users', 'Admin\\UserController')
```

**Controllers** get the request first, then the route's parameters. What a method returns is sent as JSON; returning nothing answers 204:

```js
const { response, abort } = require('somjs/server')
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
  async show(req, id) { return Post.findOrFail(id) }             // 404 when it isn't there
  async destroy(req, id) { await (await Post.findOrFail(id)).delete() }
}
module.exports = PostController
```

| The request | |
|---|---|
| `req.input('name', default)`, `req.all()`, `req.only('a', 'b')`, `req.except(…)`, `req.has(…)`, `req.filled(…)` | Values from the body and the query |
| `req.boolean('x')`, `req.integer('page', 1)`, `req.string('q')` | Values in the right type |
| `await req.validate(rules)` | The same rules as `form()`, plus `unique:table,column` and `exists:table,column`. Returns only the checked fields, or answers 422 on validation failure |
| `req.params`, `req.query`, `req.body`, `req.header('x')`, `req.bearerToken()`, `req.ip()`, `req.user` | The rest |
| `response(data, 201)`, `response(data).header('X', 'y')`, `abort(403, 'message')` | Answers |

**Models** (`app/Models/Post.js`), like Eloquent:

```js
const { Model } = require('somjs/server')

class Post extends Model {
  static fillable = ['title', 'body', 'author_id']   // what create() and update() may fill
  static hidden = []                                 // never sent as JSON
  static casts = { published: 'boolean', meta: 'json' }
  author() { return this.belongsTo(require('./Author')) }
  comments() { return this.hasMany(require('./Comment')) }
}
module.exports = Post
```

The table is the plural of the name (`Post` → `posts`); write `static table = '…'` for another one. Then:

```js
await Post.all()                     await Post.find(5)            await Post.findOrFail(5)
await Post.where('published', true).orderByDesc('id').limit(10).get()
await Post.where('views', '>', 100).orWhere('pinned', true).count()
await Post.with('author', 'comments').paginate(15, page)   // { data, total, per_page, current_page, last_page }
const post = await Post.create({ title: 'Hi' })              // fills created_at and updated_at
await post.update({ title: 'Hello' })                        await post.delete()
await post.comments().get()          await post.comments().create({ body: 'Nice' })
await post.load('author')            // post.author is now the author
```

Without a model: `DB.table('posts').where('id', 5).update({ … })`, `DB.select('SELECT …', [values])`. Values always travel as parameters, never inside the SQL text.

### Migrations and seeders

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

Column types: `id`, `string`, `text`, `integer`, `bigInteger`, `decimal`, `float`, `boolean`, `date`, `dateTime`, `timestamp`, `timestamps`, `json`, `enum`, `uuid`, `foreignId`. Each can be `.nullable()`, `.default(…)`, `.unique()` or `.index()`. `schema.table('posts', (t) => { … })` changes a table; `t.dropColumn('x')` and `t.renameColumn('a', 'b')` work there. Plain `.sql` files still work too.

A seeder fills in starting data:

```js
// database/seeders/DatabaseSeeder.js
const { Seeder } = require('somjs/server')
const Post = require('../../app/Models/Post')

class DatabaseSeeder extends Seeder {
  async run() {
    await Post.create({ title: 'Hello', author_id: 1 })
    await this.call(require('./CommentSeeder'))
  }
}
module.exports = DatabaseSeeder
```

| Command | What it does |
| Backend | `require('somjs/server')`: `Route` `Model` `DB` `Seeder` `response` `abort`; `som migrate` (`:rollback` `:fresh` `:status`) `som db:seed` `som make:model/controller/migration/seeder/middleware` `som route:list` |
|---|---|
| `som key:generate` | Generates a 256-bit encryption key and sets `APP_KEY` in `.env` (`--show` to print) |
| `som migrate` | Runs the new migrations (`som dev` does this by itself) |
| `som migrate:rollback` | Undoes the last batch (`--step 2`: the last two) |
| `som migrate:fresh --seed` | Drops every table, migrates again, then seeds |
| `som migrate:status` | Which migrations ran |
| `som db:seed` | Runs `DatabaseSeeder` (`--class PostSeeder` for another) |
| `som make:model Post -mfsc` | The model, migration (`-m`), factory (`-f`), seeder (`-s`), controller (`-c`), page (`-p`), route (`-r`, `--route=api`, `--auth`) or `--all` |
| `som make:controller PostController --api` | A controller with index, store, show, update and destroy (supports `--route`, `--auth`) |
| `som make:page Post` | Frontend page in `frontend/pages/` (supports `-r`, `--route`, `--auth`) |
| `som make:migration create_posts_table` | `add_x_to_posts_table` gives a `schema.table` one |
| `som make:seeder PostSeeder`, `som make:middleware EnsureIsAdmin` | |
| `som route:list` | Every route, with its name, controller and middleware |

`som dev --seed` seeds a brand-new database the first time. The database comes from `DATABASE_URL` in `.env`.

### Middleware

Middleware runs before the controller, and can stop the request or change the answer:

```js
// app/Http/Middleware/EnsureIsAdmin.js     ('ensure-is-admin' in a route, or 'ensure-is-admin:editor')
const { abort } = require('somjs/server')

class EnsureIsAdmin {
  async handle(req, next, role = 'admin') {
    if (!req.user || req.user.role !== role) abort(403)
    const response = await next(req)                  // the controller runs here
    return response.header('X-Checked', 'yes')
  }
}
module.exports = EnsureIsAdmin
```

A name in a route finds its file in `app/Http/Middleware`: `'auth'` is `Authenticate.js` (or `Auth.js`), and `'ensure-is-admin'` is `EnsureIsAdmin.js`. Words after a colon are passed after `next`.

**Built-in middleware:**
- `throttle:60,1`: Rate limiting (60 requests per minute per visitor and route, then 429 Too Many Attempts).
- `csrf` (or `verifyCsrfToken`): Enforces CSRF token verification on all state-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`). Validates `X-CSRF-TOKEN` or `X-XSRF-TOKEN` headers or the `_token` body field against the cookie token using timing-safe comparisons (`crypto.timingSafeEqual`), returning `419 Page Expired` on mismatch. Also automatically issues an `XSRF-TOKEN` cookie on GET/HEAD responses so frontend SPAs (including `Som.api`, fetch, Axios) send it back effortlessly.
- `can:ability,model`: Policy authorization checks via `Gate.authorize()`.

Middleware for every route can be registered in `app/Http/Kernel.js`:
```js
// app/Http/Kernel.js
module.exports = {
  middleware: ['csrf', 'throttle:120,1'],
}
```
Exempt routes using `.withoutMiddleware('csrf')` or define custom exemptions via `VerifyCsrfToken({ except: ['webhooks/*'] })`. You can also expose a CSRF cookie endpoint using `Route.csrfCookie('/csrf-cookie')`. New projects have `Authenticate.js` for signed-in users (see [Login, register and passwords](#login-register-and-passwords)), `EnsureEmailIsVerified.js` (`'verified'`) and `RequirePassword.js` (`'password.confirm'`).

Once `routes/api.js` exists, the automatic table API only serves the tables listed in `som.config.json`; your routes are the API. The demo's Backend page (`npm run dev`, then /demo/backend) shows all of this working.

### Login, register and passwords

New projects come with every sign-in page, fully preconfigured with the backend behind them:

| Page | Address | What it does |
| --- | --- | --- |
| `pages/auth/Login.som` | `/login` | Log in with email and password |
| `pages/auth/Register.som` | `/register` | Make an account, then get an email to verify the address |
| `pages/auth/ForgotPassword.som` | `/forgot-password` | Email a link to choose a new password |
| `pages/auth/ResetPassword.som` | `/reset-password/:token` | The link from that email: choose the new password |
| `pages/auth/VerifyEmail.som` | `/verify-email` | "Check your email" and "Send the link again"; the link itself opens `/verify-email/:id/:hash` |
| `pages/auth/ConfirmPassword.som` | `/confirm-password` | Type the password again before something serious |
| `pages/Dashboard.som` | `/dashboard` | The first page after logging in |
| `pages/Profile.som` | `/profile` | Change name, email and password; delete the account |

`npm run dev` makes the tables (`database/migrations/0001_01_01_000000_create_users_table.js`) and a user to try: **test@example.com** with the password **password**. Emails (verify, reset) are printed in the terminal. To send real ones, put `MAIL_URL=smtp://user:password@host:587` in `.env` and run `npm i nodemailer`. Links in emails start with `APP_URL` and are signed with `APP_KEY`; both are in `.env`.

How the browser side fits together:

```js
// frontend/index.html: who is signed in. The login itself is an HttpOnly cookie, out of reach of page scripts
const auth = Som.store('auth', { user: null, … }, { saved: ['user'] })

// frontend/routes/web.som: what each page needs
Route.view('/dashboard', 'pages/Dashboard.som').middleware('auth', 'verified')
Route.layout('guest').middleware('guest').group(() => { Route.view('/login', 'pages/auth/Login.som') })
```

`auth` sends visitors to `/login` (and back afterwards), `guest` sends signed-in users to `/dashboard`, and `verified` sends users whose email isn't verified to `/verify-email`. The three are in `Som.router({ middleware })` in `index.html`. In any `.som` file, `$store.auth.user` is the user and `$store.auth.logout()` logs out.

On the server, `routes/auth.js` has the routes and `app/Http/Controllers/Auth/` the controllers. Logging in puts a token in an HttpOnly cookie (a row in `personal_access_tokens`, standard secure SPA session auth). Only a hash of it is stored, and logging out deletes it. Protect your own routes with standard middleware names:

```js
Route.middleware(['auth', 'verified']).group(() => {
  Route.get('/orders', [OrderController, 'index'])                    // req.user is the user
})
Route.delete('/account', …).middleware(['auth', 'password.confirm'])  // asks for the password again (423)
```

The helpers they use are yours too: `const { Hash, Str, Url, Mail } = require('somjs/server')`.

```js
Hash.make('secret')                          // store this, never the password
Hash.check('secret', user.password)          // true or false
Str.random(40)                               // a random token
Url.signed('/verify-email/5/abc', 60)        // a link that works for 60 minutes, unchanged
await Mail.send({ to, subject, text })       // printed in the terminal until MAIL_URL is set
```

Passwords are hashed with scrypt, wrong logins are slowed down (`throttle:6,1`), "Forgot your password?" gives the same answer whether or not the email has an account, and a new password logs out every other device.

### Keeping the backend safe

- `som dev` only answers this computer (`127.0.0.1`). `som dev --host 0.0.0.0` opens it to your network, to try the app on a phone.
- Every API answer has the `X-Content-Type-Options`, `X-Frame-Options` and `Referrer-Policy` headers, and request bodies over 5 MB are refused (`MAX_BODY_KB` in `.env`).
- `app/Http/Kernel.js` limits each visitor to 120 requests a minute for each address; the login routes allow 6.
- The visitor's address comes from the connection. Behind nginx, Cloudflare or a load balancer, put its address in `TRUSTED_PROXIES` in `.env` (or `*`), so `X-Forwarded-For` is believed from it and from nobody else.
- A login token nobody used for `AUTH_TOKEN_DAYS` days (30) stops working.
- JSON bodies can't carry `__proto__` or `constructor` keys, and models never fill `id` from a request.

### Dashboard as default UI

New projects provide an admin dashboard sidebar layout as the default application UI directly in `frontend/`:

```
frontend/
  layouts/app.som     the dashboard shell: collapsible sidebar (Ctrl+B), theme toggle, breadcrumbs
  pages/Dashboard.som the main telemetry overview, metrics, and user stats
  pages/Users.som     user management (find users, promote roles, toggle admin, delete)
  pages/Profile.som   account settings, security, and sessions
  components/StatCard.som
```

The sidebar collapses to compact icons with the toggle button (or Ctrl+B, ⌘B on Mac) and remembers state in localStorage; on mobile devices it slides in as an off-canvas drawer. Links and groups can be customized at the top of `layouts/app.som`.

**Custom Auth Guards:** All routes are defined directly in `frontend/routes/web.som`. Developers can attach whatever custom authentication guards or middleware pipelines they need directly onto any route or group:

```js
// frontend/routes/web.som
Route.middleware('auth').group(() => {
  Route.view('/', 'pages/Dashboard.som')
  Route.view('/users', 'pages/Users.som').middleware('admin')
})
```

An admin is a user whose `is_admin` column is true. The test user is one; give the rights to others on the Users page, or with `som make:admin you@example.com` (`--remove` takes them away). `is_admin` can never be filled from an untrusted request.

Controllers, models and seeders can go in folders: `som make:controller Admin/ReportController` makes `app/Http/Controllers/Admin/` if it isn't there yet, and points the `require` paths inside the right way. `som make:model Shop/Product --all` does the same for the model, its controller and its seeder.

### Models in depth (Active Record ORM)

Models provide a full-featured Active Record ORM: relations of every kind, scopes, hooks, soft deletes, casts and computed fields.

```js
// app/Models/Post.js
class Post extends Model {
  static fillable = ['title', 'body', 'user_id']
  static casts = { published: 'boolean', meta: 'json' }
  static softDeletes = true                        // delete() fills deleted_at; restore(), withTrashed()
  static appends = ['excerpt']                     // getExcerptAttribute() goes into the JSON

  user() { return this.belongsTo(require('./User')) }
  comments() { return this.hasMany(require('./Comment')) }
  tags() { return this.belongsToMany(require('./Tag')) }          // the post_tag table

  static scopePublished(q) { q.where('published', true) }        // Post.query().published()
  getExcerptAttribute() { return String(this.body || '').slice(0, 80) }
  static async creating(post) { post.slug ??= Str.slug(post.title) }   // creating, created, updating, saved, deleted…
}
```

Queries chain the same way, with eager loading, counts, `whereHas`, joins, grouping, transactions and factories:

```js
await Post.query().published().with('user', 'comments.author').withCount('comments').paginate(15, page)
await Post.query().whereHas('comments', (q) => q.where('approved', true)).get()
await post.tags().sync([1, 2, 3])                                 // attach(), detach(), toggle()
await DB.transaction(async () => { await Order.create(…); await Stock.decrement(…) })   // all or nothing
await DB.table('orders').join('users', 'users.id', '=', 'orders.user_id').groupBy('status').get()
await User.factory().count(10).has(Post.factory().count(3), 'posts').create()   // database/factories
```

Relations: `hasOne`, `hasMany`, `belongsTo`, `belongsToMany` (with `pivot`, `attach`, `sync`), `hasManyThrough`. Results come back as a collection with `pluck`, `groupBy`, `keyBy`, `sum`, `sortBy` and the rest. Factories live in `database/factories` and use `fake.name()`, `fake.email()`, `fake.sentence()`…

### Jobs, events, mail, cache and files

Full-stack backend tools for production apps are in `require('somjs/server')`, each with its own folder in `backend/app/` and a `som make:` command:

```js
await dispatch(new SendWelcome(user))                   // app/Jobs: runs in the background (tries, backoff, failed())
await event(new OrderShipped(order))                    // app/Listeners with static event = 'OrderShipped'
await Mail.to(user).send(new WelcomeMail(user))         // app/Mail: subject, text, html or markdown({ … })
await user.notify(new InvoicePaid(invoice))             // app/Notifications: 'mail' and 'database' channels
await Cache.remember('stats', 600, () => loadStats())   // database, file or memory (CACHE_STORE)
const path = await req.file('avatar').store('avatars')  // uploads; Storage.url(path) → /storage/avatars/…
await req.authorize('update', post)                     // app/Policies/PostPolicy.js, 403 when not allowed
const data = await StorePostRequest.validate(req)       // app/Http/Requests: authorize() and rules()
return PostResource.collection(await Post.paginate(15)) // app/Http/Resources: { data, meta }
```

Queued jobs, queued listeners, mail and notifications run in the background: `som dev` and `som serve` work through the `jobs` table every second. On a big server, set `QUEUE_WORKER=off` and run `som queue:work` on its own. Failed jobs go to `failed_jobs` (`som queue:failed`, `som queue:retry all`). Uploaded files on the public disk are served at `/storage/…` as plain data, so an uploaded page can't run scripts on your site.

### Task scheduling

What runs on its own is listed in `backend/routes/console.js` for automated background routines and scheduling:

```js
// backend/routes/console.js
Schedule.call(async () => { await Post.onlyTrashed().forceDelete() }).daily().name('clean-trash')
Schedule.job(new SendDailyReport()).weekdays().at('08:00')
Schedule.command('send:report Daily').hourly()
```

`som dev` and `som serve` check it every minute (`SCHEDULER=off` in `.env` to leave it to cron with `som schedule:run`). `som schedule:list` shows what runs when.

### All the commands

```
som list                     every command, yours too
som tinker                   a console with your models: await User.count()
som about                    versions, settings, folders
som down --secret=x / som up maintenance mode (503 for visitors; /x lets you in)
som key:generate             a new APP_KEY
som migrate:refresh --seed   undo every migration, run them again (also migrate:reset, db:wipe)
som queue:work / queue:failed / queue:retry all / queue:flush
som schedule:work / schedule:run / schedule:list
som cache:clear              event:list   route:list   make:admin you@example.com
som make:model Post --all    make:controller  make:migration  make:seeder  make:factory
som make:job  make:event  make:listener  make:mail  make:notification  make:policy
som make:request  make:resource  make:rule  make:observer  make:middleware  make:command
```

Your own commands go in `app/Console/Commands` (`som make:command SendReport`) and work like built-in ones:

```js
// app/Console/Commands/SendReport.js  →  som send:report Alex --force
class SendReport extends Command {
  static signature = 'send:report {name?} {--force}'
  static description = 'Email the weekly report'
  async handle() { this.info(`Sent to ${this.argument('name') || 'everyone'}`) }
}
```

Folders work for every `make:` command: `som make:controller Admin/ReportController` makes `Controllers/Admin/` if it isn't there. `app/Providers/AppServiceProvider.js` runs `boot()` when the backend starts: a place for `Gate.define(…)` and other app-wide setup.

### Two-factor, devices and API tokens

A browser keeps its login in an **HttpOnly cookie**: page scripts can't read it, so code injected into a page can't steal it. Changes also need the `X-XSRF-TOKEN` header to match the `XSRF-TOKEN` cookie, and `Som.api` sends it by itself (a mismatch is a 419). Scripts and other apps use API tokens instead. The Profile page has all of it: two-factor authentication with a QR code and recovery codes, the devices signed in (log one out, or all the others), and API tokens with permissions. **Remember me** on the login page keeps the login for `AUTH_TOKEN_DAYS`; otherwise it ends when the browser closes.

```
POST /api/login { email, password, remember }       → HttpOnly cookie (or { token } with device_name)
POST /api/two-factor-challenge { code | recovery_code }
POST /api/user/two-factor  → { qr, secret }  then  POST /api/user/two-factor/confirm { code }
GET  /api/user/sessions    DELETE /api/user/sessions/{id}    DELETE /api/user/sessions (others)
POST /api/user/tokens { name, abilities: ['read'] } → { token }, shown once
Route.get('/reports', …).middleware(['auth', 'abilities:read'])     // what an API token may do
Route.get('/drafts', …).middleware(['auth', 'role:editor'])         // users.role (admins pass too)
```

`TOTP` (the 6-digit codes) and `QR` (QR codes as SVG) are in `somjs/server` for your own use too. Users have a `role` column (`user`, `editor`; change the list in `Admin/UserController.js`), configured on the Users management page (`/users`).

### TypeScript

```bash
som new shop --ts       # backend/*.ts, tsconfig.json, npm run typecheck
```

Every backend file is then `.ts`: routes, controllers, models, migrations and seeders, with types for everything in `somjs/server`. `som make:` commands write `.ts` files too. Pages can import `.ts` modules (`import { money } from '../logic/format.ts'`); `som dev` serves them as JavaScript and `som build` compiles them. Types aren't checked while the app runs: `npm run typecheck` does that. JavaScript and TypeScript files can sit side by side.

### Your own server code: `server/`

For anything the table API doesn't do, write it yourself in Node.js. Each `.js` file in `server/` answers one address under `/api`:

| File | Address |
|---|---|
| `server/hello.js` | `/api/hello` |
| `server/users/[id].js` | `/api/users/5`, with `ctx.params.id` = `'5'` |
| `server/index.js` | `/api` |
| `server/_helpers.js` | nothing: files and folders starting with `_` are for your own code |

```js
// server/hash.js
const crypto = require('crypto')          // Node's own packages, or any package from npm

exports.get = (ctx) => ({ hello: ctx.query.name || 'world' })

exports.post = async (ctx) => {
  const { text } = ctx.validate(ctx.body, { text: 'required|max:500' })   // returns 422 Unprocessable Entity when validation fails
  const [row] = await ctx.db.query('SELECT COUNT(*) AS n FROM posts')      // the --db database
  return ctx.reply(201, { hash: crypto.createHash('sha256').update(text).digest('hex'), posts: row.n })
}
```

Export `get`, `post`, `put`, `patch` and `del` (or `handle` for every method). `export function get` works as well as `exports.get`. What you return goes back as JSON; returning nothing answers 204.

| `ctx` | |
|---|---|
| `ctx.params` `ctx.query` `ctx.body` `ctx.headers` `ctx.method` | The request. `body` is read from JSON or a form |
| `ctx.db` | The database from `--db` or `som.config.json`: `query(sql, params)`, `run(sql, params)` with `?` placeholders |
| `ctx.validate(data, rules)` | The same rules as `form()`. Returns the data, or stops with 422 and `{ message, errors }` |
| `ctx.fail(status, message)` | Stop with an error. `ctx.fail(422, { email: ['Taken.'] })` for field errors |
| `ctx.reply(status, data, headers)` | Answer with another status or headers |
| `ctx.req` `ctx.res` | Node's request and response, to stream a file or redirect |

A file in `server/` wins over a table or a `--api` collection at the same address. `som dev` reads a changed file again on the next request; `som serve` runs the same files for real users. Another folder: `--server api-code`. The `server/` folder is never sent to the browser, and `som build` leaves it out. Like the table API, it has no login built in: check who is asking yourself (a header, a cookie) before doing anything private.

### Settings and secrets: `.env`

Settings and environment secrets go in a `.env` file at the root of the project. `som new` makes one, plus `.env.example` to show which keys exist:

```bash
# .env
APP_NAME="My shop"
DATABASE_URL=sqlite:database/app.db
MAIL_PASSWORD=secret
PUBLIC_APP_NAME="${APP_NAME}"      # PUBLIC_ values also reach the browser
```

| Where | How you read it |
|---|---|
| `server/*.js` | `process.env.MAIL_PASSWORD` or `ctx.env.MAIL_PASSWORD` |
| `som.config.json` | `"${NAME}"` in a value |
| The database | `DATABASE_URL` is used by itself |
| A `.som` file | only `PUBLIC_` values: `{env.PUBLIC_APP_NAME}` (also `Som.env` in JavaScript) |

The rules:

- **`.env` never reaches the browser.** `som dev` and `som serve` refuse to send it, `som build` leaves it out, and new projects list it in `.gitignore`. Only values whose names start with `PUBLIC_` are given to the page, so never put a password or a key in one.
- **The real environment wins.** On a server, `DATABASE_URL=… som serve dist` overrides the file. `som dev --db …` wins over both.
- `som dev` reads the file again when you save it and reloads open pages. A new `DATABASE_URL` needs a restart.
- `som build` puts the `PUBLIC_` values into `app.js` when you build. Change one, build again.
- `"double quotes"` can hold `#`, `\n` and `${OTHER}`; `'single quotes'` are taken exactly as written; `${NAME:-default}` gives a fallback.

The code that runs in the browser can always be read by its visitors, in any framework. Keep secrets, and the checks that protect your data, in server code: `server/*.js` or your backend controllers and database rules.

---

## 8. Router

```js
const router = Som.router({
  routes: [
    { path: '/', component: 'pages/Home.som', meta: { title: 'Home' } },
    { path: '/users/:id', name: 'user', component: 'pages/User.som', props: true },
    { path: '/posts/:slug?', component: 'pages/Posts.som' },  // optional param
    { path: '/old', redirect: '/' },
    { path: '/admin', component: 'pages/Admin.som', guard: () => isAdmin() || '/login' },
    { path: '*', component: 'pages/NotFound.som' },             // 404
  ],
  // mode: 'hash', // optional: URLs like #/users/5 instead of /users/5
})

Som.app('App.som').use(router).mount('#app')
```

```html
<!-- App.som -->
<view>
  <nav>
    <som-link to="/">Home</som-link>
    <som-link to="/users/{user.id}">Profile</som-link>
  </nav>
  <som-view></som-view>
</view>
```

```html
<!-- pages/User.som — with props: true, the :id param arrives as a prop -->
prop id
derive user = users.find(id)
action back() { $router.back() }
```

| Feature | How |
|---|---|
| Current route | `$route.path`, `$route.params.id`, `$route.query.tab`, `$route.meta` |
| Navigate | `$router.go('/users/5?tab=info')`, `$router.replace(to)`, `$router.back()`, `$router.go(-1)` |
| Active link | `som-link-active`, and `som-link-exact` on an exact match |
| Page title | `meta: { title: '…' }` |
| Check before every page | `router.before((to, from) => …)`. Return `false` to stop, or a path to go elsewhere |
| Check one route | `guard: (to, from) => …` |
| After every page | `router.after((to, from) => …)` |

Each page `.som` file is loaded the first time someone opens it.

### Route files: `routes/web.som`

New projects keep their pages in `frontend/routes/web.som` as dedicated route declarations, and `index.html` only points to it:

```js
Som.router({
  routes: ['routes/web.som', 'routes/shop.som'],   // one or more route files, read in this order
  layout: 'app',
  errors: 'errors',
  middleware: {                                     // the names the routes use in .middleware(…)
    auth: (to) => (auth.token ? true : '/login?redirect=' + encodeURIComponent(to.fullPath)),
    guest: () => (auth.token ? '/dashboard' : true),
  },
})
```

```js
// routes/web.som
Route.view('/', 'pages/Home.som').name('home').title('Home')
Route.view('/posts/:id', 'pages/Post.som')                  // :id reaches the page as a prop

Route.middleware('auth').group(() => {
  Route.view('/dashboard', 'pages/Dashboard.som').middleware('verified')
})
Route.layout('guest').middleware('guest').group(() => {
  Route.view('/login', 'pages/auth/Login.som').title('Log in')
})
Route.prefix('/account').name('account.').middleware('auth', 'role:editor').group(() => {
  Route.view('/settings', 'pages/account/Settings.som').children(() => {
    Route.view('', 'pages/account/General.som')            // /account/settings
    Route.view('mail', 'pages/account/Mail.som')           // /account/settings/mail
  })
})
Route.redirect('/home', '/')
Route.fallback('pages/NotFound.som')                       // instead of errors/404.som
```

| On a route | What it does |
| --- | --- |
| `.name('home')` | `$router.go({ name: 'home' })` |
| `.title('Home')` | the page title |
| `.layout('guest')`, `.layout('none')` | another layout, or none |
| `.middleware('auth', 'role:editor')` | runs these before the page; `role:editor` passes `'editor'` after `to, from` |
| `.meta({ … })` | anything else, in `$route.meta` |
| `.children(() => …)` | nested pages, shown in the page's own `<som-view>` |

`Route.prefix()`, `.middleware()`, `.layout()` and `.name()` also start a group: `Route.prefix('/account').middleware('auth').group(() => { … })`. A middleware returns `true` to go on, `false` to stay, or an address to go there instead, like `router.before()`. More files: `som make:routes shop` writes `routes/shop.som` and adds it to the list (`som make:routes shop --api` does the same for the API: `backend/routes/shop.js`). Saving a route file reloads the page, and `som build` puts route files in `app.js`, so the built app needs no `eval`. The `routes: [{ path, component }]` objects above still work, and the two can be mixed.

### Nested routes

```js
{ path: '/settings', component: 'pages/Settings.som', children: [
  { path: '', component: 'pages/settings/General.som' },          // /settings
  { path: 'account', component: 'pages/settings/Account.som' },   // /settings/account
] }
```

`pages/Settings.som` is the frame (a title, tabs…) and has its own `<som-view>`, which shows the child. Guards and `meta` of the parent count for its children too.

### Layouts

A layout is the frame around your pages: the bar, the menu, the footer. It provides a shared structural wrapper for your views. Put it in `layouts/` as a `.som` file, with a `<slot>` where the page goes:

```html
<!-- layouts/app.som -->
state menuOpen = false

<view>
  <header>…</header>
  <main>
    <slot></slot>          <!-- the page -->
  </main>
</view>
```

Choose which pages use it. When more than one applies, the route wins, then the page file, then the router:

| Where | What you write | Behavior |
|---|---|---|
| Every page | `Som.router({ layout: 'app', routes })` | Root default layout |
| One route and its children | `{ path: '/admin', component: …, layout: 'admin' }` | Route-scoped layout |
| Inside the page file | `layout admin` on its own line | Page-level layout override |
| No layout | `layout: false` on the route, or `layout none` in the page | Disables layout rendering |

`'admin'` means `layouts/admin.som`. You can also give a path (`layout: 'shells/Admin.som'`) or name layouts that live elsewhere: `Som.router({ layouts: { admin: 'shells/Admin.som' } })`.

Going from one page to another with the same layout keeps the layout on the screen: it doesn't flicker, and its state (an open menu, a search box) stays. Moving to a page with another layout swaps it.

**Sections.** A page can also fill other places in its layout, like `@section` and `@yield`:

```html
<!-- in the layout -->
<som-yield name="actions">shown when the page has no such section</som-yield>

<!-- in the page -->
<som-section name="actions">
  <button class="primary" @click="save()">Save</button>
</som-section>
```

The section stays part of the page: it uses the page's values and actions, and leaves when the page does. The demo's Layouts page shows both.

### Error pages

Each HTTP error has its own dedicated page in an `errors/` folder. Turn them on in the router:

```js
const router = Som.router({
  errors: 'errors',        // the folder with the error pages
  routes: [ … ],
})
```

New projects have the folder already; `som make:errors` adds it to an older one (and the line in `index.html`):

```
errors/minimal.som    the base frame layout
errors/401.som  402.som  403.som  404.som  419.som  429.som  500.som  503.som
errors/error.som      any other status
```

An address no route knows shows `errors/404.som`, and a page that can't be loaded shows `errors/500.som`. Anywhere else, `abort()` halts execution and shows the matching error page. The address stays as it is, and **Go back** returns to the page before:

```html
<!-- pages/Post.som -->
prop id
load post = api.get('/api/posts/' + id)

watch post.error { if (post.error && post.error.status === 404) abort(404) }

action remove() {
  if (!$store.auth.user) return abort(403, 'Sign in to delete posts.')
  …
}
```

`abort` works in any `.som` file, as `$router.abort()`, and as `Som.abort()` in JavaScript. Each page is a normal `.som` file that fills the frame's sections, so change the words, the look or the links as you like. The page gets `status` and `message` as props:

```html
<!-- errors/404.som -->
layout 'errors/minimal.som'
prop message = ''

<view>
  <som-section name="code">404</som-section>
  <som-section name="title">Not Found</som-section>
  <som-section name="message">{message || 'Sorry, the page you are looking for could not be found.'}</som-section>
</view>
```

`$route.error` is `{ status, message }` while an error page shows, and `null` otherwise. Without `errors` in the router, an unknown address shows nothing, as before (or your own `{ path: '*' }` route).

### Page animations and kept pages

```html
<som-view s-animate.after="fade"></som-view>   <!-- the old page fades out, then the new one in -->
<som-view keep></som-view>                     <!-- pages keep what was typed in them -->
```

### Clean URLs

By default the router uses clean URLs with no `#`: `/users/5`. Two things make that work:

1. **Tell Som where the app lives** with a `<base>` tag in `index.html`. Paths to `.som` files start from there too, so reloading `/demo/users/5` still finds `pages/User.som`:

   ```html
   <base href="/demo/">
   ```

   If the app is at the root of the site, use `<base href="/">`.

2. **The server sends `index.html` for every page path**, so reloading `/demo/users/5` doesn't give a 404:
   - Locally: `npm run dev` does it for you.
   - Production / Node server: `app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist/index.html')))`

If you can't change the server, use `mode: 'hash'`. URLs then look like `/demo/#/users/5` and work with any server.

---

## 9. Template engine

`Som.render()` turns a view and data into an HTML string:

```js
const html = Som.render(
  `<ul><li s-each="u in users" class={u === me ? 'me' : ''}>{u}</li></ul>
   <p s-if="!users.length">No users</p>`,
  { users: ['Alex', 'Alice Smith'], me: 'Alex' }
)
// <ul><li class="me">Alex</li><li>Alice Smith</li></ul>
```

All directives work, values are escaped, and you can pass components: `Som.render(view, data, { components: { UserCard } })`. Use it for emails, print pages, or any HTML you build in JavaScript.

---

## 10. Using Som from JavaScript

You can also write components and logic as JavaScript objects. The rules match the `.som` language: values are state, getters are derived values, functions are actions, and you use `this`.

```js
Som.app({
  count: 0,
  get double() { return this.count * 2 },
  add() { this.count++ },
  template: `<button @click={add}>{count} × 2 = {double}</button>`,
}).mount('#app')
```

| JavaScript | Same as in `.som` |
|---|---|
| `Som.state({ … })` | `state` + `derive` + `action` together, for code outside components |
| `Som.signal(0)` | one value, read and written with `.value` |
| `Som.derived(() => …)` | `derive` |
| `Som.watch(source, (value, old) => …)` | `watch` |
| `Som.effect(() => …)` | runs again whenever what it reads changes |
| `Som.tick()` | wait until the page has updated |

Object options: `props`, `events`, `init(props, { send })`, `watch`, `share`, `receive`, `start`, `ready`, `destroy`, `destroyed`, `components`, `directives`, `template`, `templateUrl`, `passAttrs`.

---

## 11. Blade & Server Templating

Blade and traditional template engines use `{{ }}`, and Som uses single `{ }`, so they don't conflict. Put `som.js` and your `.som` files in your public assets folder:

```blade
<div id="app"></div>
<script src="{{ asset('som/som.js') }}"></script>
<script>
  Som.store('auth', { user: @json(auth()->user()) })
  Som.app('{{ asset('som/App.som') }}').mount('#app')
</script>
```

---

## 12. Reference

| Group | Names |
|---|---|
| `.som` keywords | `state` `derive` `action` `when` `watch` `on start/ready/update/show/hide/destroy` `prop` `event` `use` `share` `receive` `import` `saved` `load` `layout` |
| In the script | `send` `props` `bus` `store` `$route` `$router` `tick` and every `Som` function |
| In the view | `{expr}` `attr={expr}` `@event` `s-if` `s-elif` `s-else` `s-each` `s-key` `s-model` `s-show` `s-text` `s-html` `s-ref` `s-skip` `s-once` `s-memo` `s-animate` `s-slot` `<slot>` `<som-component>` `<som-portal>` `<som-link>` `<som-view>` `<som-wait>` `<som-section>` `<som-yield>` `keep` `send` `$event` `$route` `$router` `$store` `$bus` `$refs` `{for … in … key …}` `{empty}` `{/for}` `s-empty` |
| App | `Som.app(rootOrPath)` → `.component(name, pathOrObject)` `.directive()` `.share()` `.use()` `.mount()` `.unmount()` `.globals` |
| Data | `store` (+ `$patch` `$reset` `$watch`) `state` `signal` `derived` `readonly` `read` `isSignal` `isState` `unwrap` `raw` `saved` `storage` |
| Reacting | `watch` `effect` `tick` `onCleanup` `onReady` `onUpdate` `onShow` `onHide` `onDestroy` `onDestroyed` |
| Sharing | `bus` (`on` `once` `off` `send`) `createBus` `share` `receive` |
| Forms | `form(values, rules)` (`$error` `$errors` `$valid` `$busy` `$submit` `$check` `$reset` `$setErrors`) `validate(values, rules)` |
| Server | `table(name)` (`all` `find` `count` `create` `update` `patch` `remove`) `api` (`get` `post` `put` `patch` `delete` `request` `setup` `create` `before` `after` `onError`) `ApiError` `resource` |
| Components | `load(path)` `lazy(loader)` `compileSom(source, url)` |
| Router | `Som.router()` → `.go` `.abort` `.replace` `.back` `.forward` `.before` `.after` `.ready` `.route` `.routes`; `children` for nested routes; `currentRoute()` `currentRouter()` |
| Engine | `render(view, data, options)` |
| Command | `som new` (`--db` `--ui`) `som dev` (`--db` `--server`) `som build` (`--prerender`) `som update` `som serve` `som db migrate/seed/tables/sql` `som vscode` |
| Packages | `import x from 'package'` (npm, in the browser) · `import 'package/file.css'` · `server/*.js` with `ctx` (`params` `query` `body` `db` `validate` `fail` `reply`) |

### Coming from Vue

| Vue | Som.js |
|---|---|
| `.vue` single-file component | `.som` file: script, `<view>`, `<style scoped>` |
| `ref()` / `reactive()` / `computed()` | `state` / `derive` (JS: `Som.signal`, `Som.state`, `Som.derived`) |
| `watch` / `watchEffect` | `watch x { }`, `when cond { }` (JS: `Som.watch`, `Som.effect`) |
| `{{ x }}`, `:attr`, `@click` | `{x}`, `attr={x}`, `@click={fn}` |
| `v-if` / `v-else-if` / `v-else`, `v-show` | `s-if` / `s-elif` / `s-else`, `s-show` |
| `v-for` + `:key` | `{for x in list key x.id}` … `{/for}` or `s-each` + `s-key` |
| `v-model`, `v-bind`, `v-on` | `s-model`, `s-bind`, `s-on` |
| `v-once`, `v-memo` | `s-once`, `s-memo` |
| `defineProps` / `defineEmits` / `emit` | `prop` / `event` / `send()` |
| slots, scoped slots | `<slot>`, `<template s-slot:name="{ item }">` |
| `provide` / `inject` | `share` / `receive` |
| `onMounted` / `onUpdated` / `onUnmounted` | `on ready` / `on update` / `on destroy` |
| `onActivated` / `onDeactivated` | `on show` / `on hide` |
| composables (`useMouse()`) | `use mouse = trackMouse()` |
| `<KeepAlive>` | `keep` on `<som-component>` / `<som-view>` |
| `<Teleport>` | `<som-portal to="body">` |
| `<Suspense>` | `<som-wait>` with `s-waiting` / `s-failed` |
| `<Transition>`, `<TransitionGroup>` | `s-animate="fade"`, `{for … animate slide}` |
| Vue Router (+ nested routes) | `Som.router()`, `<som-view>`, `<som-link>`, `children` |
| Nuxt layouts (`layouts/`, `definePageMeta({ layout })`) | `layouts/*.som`, `layout x` in a page, `layout:` on a route |
| Pinia | `Som.store()` + `use`, with `$patch` / `$reset` / `$watch`, `{ saved: true }` |
| Vite (dev server, HMR) | `som dev` (hot reload that keeps state, error overlay) |
| Vue DevTools | Som DevTools: the **S** button while `som dev` runs |
| TypeScript, Volar | `som.d.ts`, `som vscode` |
| Nuxt static site (SSG) | `som build --prerender` |
| Nuxt server routes (`server/api`) | `server/*.js` → `/api/*` |
| `import` from npm with Vite | the same `import`, with `som dev` (`npm i -D esbuild`) |

---

## 13. Developer tools

All of these come with Som.js. Nothing else to install.

**Hot reload.** While `npm run dev` (`som dev`) runs, save a `.som` file and only that component is swapped on the page; its state stays. A `.css` file reloads its styles; any other file reloads the page. Mistakes, in a `.som` file or while the app runs, show in a box at the bottom of the page. Turn it all off with `som dev --no-hot`.

**Som DevTools.** The **S** button in the corner (or <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd>) opens a panel with:

- **Components**: the live tree. Pick one to see its props, state and derived values. Change state right there. Hovering a component outlines it on the page.
- **Stores**: every store's values, which you can change, and `$reset()`.
- **Route**: the current route and every route, with a button to go there.
- **Timeline**: store actions and bus messages as they happen.

The button and the panel only exist under `som dev`; built apps never include them.

**VS Code.** `som vscode` installs colors, bracket matching, comments, folding and snippets for `.som` files (in VS Code, Cursor and VSCodium). Restart the editor afterwards. Type `som` in an empty `.som` file for a starter component.

**Types.** `som.d.ts` describes everything in `Som`, so TypeScript and your editor's hints know it. `som new` copies it into new projects; with npm it's found by itself.

---

## 14. Build for production

`som build` compiles your app ahead of time into a few plain files:

```bash
npm run build      # or: som build
npm run preview    # check the result: som dev dist
```

| File | What it is |
|---|---|
| `index.html` | Your page, now loading the files below |
| `som.js` | The framework |
| `app.js` | Every `.som` file, already compiled |
| `app.css` | All `<style>` blocks; scoped ones already scoped |
| `main.js` | The inline `<script>` code from your `index.html` |
| `deps/` | The npm packages your `.som` files import, minified |
| `vendor/` | The CSS files your `.som` files import from npm, with their fonts |

What you get:

- **Faster first load:** the browser downloads one `app.js` instead of each `.som` file, and nothing is compiled in the browser.
- **Works with a strict Content-Security-Policy:** every expression in your views becomes a real function, so the app never uses `eval` or `new Function`. You can serve it with `script-src 'self'`.
- **Errors before you deploy:** a mistake in any `.som` file stops the build and names the file and line.

Options: `som build ./site --out public` builds another folder into `public/`, and `--base /` changes the `<base href>`. Upload the output folder to any web server, and have it send `index.html` for page paths (see Clean URLs).

### Ready HTML for every page: `--prerender`

```bash
npm i -D jsdom             # once per project
som build --prerender      # every route without :params
som build --prerender /users/1,/users/2   # and these addresses too
```

Each page is opened in a simulated browser, its data is loaded, and the result is saved as `dist/<page>/index.html`. Visitors and search engines get the content at once, and the page title from `meta.title`. Then Som.js starts and the page works as usual. Data from an API that isn't running during the build shows its loading or error state in that HTML, and is loaded normally in the browser.

### Updating packages and runtime: `som update`

```bash
som update              # updates npm packages and refreshes som.js / som.d.ts
som update <package>    # update a specific package (e.g. som update esbuild)
som update --latest     # upgrade packages to their latest versions
som update --check      # inspect outdated packages without modifying (npm outdated)
som update --core       # update only Som.js runtime files (som.js, som.d.ts, server.d.ts)
som update --npm        # update only npm packages
```

`som update` automates keeping both your project's npm dependencies and the local framework runtime files (`frontend/som.js`, `frontend/som.d.ts`, `backend/server.d.ts`) up-to-date with the installed Som.js version.

---

## 15. Limits

- Without a build, views are compiled in the browser with `new Function`, which a strict Content-Security-Policy blocks. Built apps (`som build`) don't have this problem. Templates written as strings in JavaScript (`template: '…'`) are still compiled in the browser.
- Inside a view, `<` directly followed by a letter starts a tag, so write `{a < b}` with a space, not `{a<b}`.
- Animations need a CSS `transition` or `animation`; without one the element just appears or goes.
- `--prerender` makes static HTML when you build. There is no server that renders pages on every request.
- The database API has no login or user permissions yet: `tables` in `som.config.json` decides what everyone may do.
- `.som` files must be served over `http://`, not opened from `file://`.
- npm packages in the browser need esbuild in the project (`npm i -D esbuild`). Each package is its own file, so two packages that use a third one each carry a copy of it.
- `server/` files have no login built in, like the table API.

---

## 16. Security & CSRF Protection

Security in Som.js is built-in across both the frontend and backend layers to defend against common web vulnerabilities, including Cross-Site Request Forgery (CSRF), Cross-Site Scripting (XSS), SQL Injection, Prototype Pollution, Path Traversal, and Timing Attacks.

### 16.1 CSRF Protection (Cross-Site Request Forgery)

Cross-Site Request Forgery occurs when an unauthorized command is transmitted from a user that the web application trusts (e.g. through ambient browser credentials like cookies).

Som.js uses the industry-standard Double Submit Cookie and Token Verification pattern:

1. **How it works:**
   - Any safe request (`GET`, `HEAD`, `OPTIONS`) automatically receives a secure, random `XSRF-TOKEN` cookie from the server (`SameSite=Lax`, `Path=/`, non-HttpOnly so client-side JavaScript can read it).
   - Any state-changing request (`POST`, `PUT`, `PATCH`, `DELETE`) submitted by browsers using cookies or session authentication must provide a valid token.
   - The token is verified against the cookie token using constant-time string comparisons (`crypto.timingSafeEqual`) to prevent timing side-channel attacks.
   - If the token is missing, expired, or invalid, the backend immediately halts with `419 Page Expired` (`CSRF token mismatch`).

2. **Enabling the CSRF Middleware:**
   Register `'csrf'` (or `'verifyCsrfToken'`) on specific routes, route groups, or globally in `app/Http/Kernel.js`:
   ```js
   // app/Http/Kernel.js
   module.exports = {
     middleware: ['csrf', 'throttle:120,1'],
   }
   ```
   Or on specific route groups:
   ```js
   // routes/api.js
   Route.middleware('csrf').group(() => {
     Route.post('/posts', [PostController, 'store'])
     Route.put('/posts/{post}', [PostController, 'update'])
     Route.delete('/posts/{post}', [PostController, 'destroy'])
   })
   ```

3. **Exempting Routes:**
   Webhook routes or third-party callbacks (e.g. Stripe, GitHub) can be exempted:
   ```js
   Route.post('/webhook/stripe', [StripeController, 'handle']).withoutMiddleware('csrf')
   ```
   Or pass exemptions to `VerifyCsrfToken`:
   ```js
   const { VerifyCsrfToken } = require('somjs/server')
   const csrf = new VerifyCsrfToken({ except: ['webhook/*', 'api/external/*'] })
   ```

4. **Sending CSRF Tokens from the Frontend:**
   - **`Som.api` / Axios / Fetch:**
     `Som.api` automatically reads the `XSRF-TOKEN` cookie and attaches it as the `X-XSRF-TOKEN` header on every state-changing request.
     If you have `<meta name="csrf-token" content="...">` in your `<head>`, `Som.api` also forwards it in `X-CSRF-TOKEN`.
   - **HTML Form submissions:**
     Include a hidden `_token` or `csrf_token` field:
     ```html
     <form action="/api/contact" method="POST">
       <input type="hidden" name="_token" value="{csrfToken}">
       <input type="text" name="name" s-model="name">
       <button type="submit">Submit</button>
     </form>
     ```
   - **CSRF Cookie Endpoint:**
     Use `Route.csrfCookie('/csrf-cookie')` to expose an endpoint for SPAs to initialize the CSRF cookie before making API mutations:
     ```js
     // routes/api.js
     Route.csrfCookie('/csrf-cookie')
     ```

5. **Request Helpers:**
   Inside any controller or middleware:
   ```js
   const token = req.csrfToken()        // get or generate current token
   const valid = req.hasValidCsrfToken() // boolean check
   ```

---

### 16.2 Cross-Site Scripting (XSS) Prevention

Cross-Site Scripting allows attackers to inject malicious client-side scripts into web pages viewed by other users.

1. **Automatic Template Escaping:**
   In `.som` components, all expressions within views (`{user.name}`, `title={post.title}`) are treated as pure text and bound via standard DOM text nodes or attributes. HTML tags inside expressions are never parsed as markup:
   ```html
   <!-- If user.bio is "<script>alert('xss')</script>", it safely renders as harmless text -->
   <p>{user.bio}</p>
   ```

2. **The `s-html` Directive:**
   Only use `s-html` when intentionally rendering trusted or pre-sanitized HTML:
   ```html
   <div s-html="trustedContent"></div>
   ```
   Never bind raw user input directly to `s-html`.

3. **Strict Content Security Policy (CSP):**
   When you run `som build`, all template expressions are pre-compiled into JavaScript functions. This eliminates any runtime `eval()` or `new Function()` calls, allowing production deployments to enforce a strict CSP:
   ```http
   Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none';
   ```

4. **Documentation & Markdown Sanitization:**
   The built-in markdown parser (`docs/markdown.js`) escapes all content prior to parsing, restricts links strictly to `http://`, `https://`, and safe relative anchors, while blocking protocol-relative URLs (`//evil.com`), `javascript:` URIs, and data URIs. External links automatically receive `rel="noopener noreferrer"`.

---

### 16.3 SQL Injection Defense

SQL Injection occurs when user-supplied data is concatenated directly into SQL queries, altering query logic.

1. **Parameterized Queries by Default:**
   The Som.js Query Builder (`DB.table(...)` and Model queries) strictly uses parameterized queries (`?` placeholders on SQLite/MySQL and `$1, $2` on PostgreSQL). Values are never concatenated into SQL statements:
   ```js
   // 100% safe against SQL injection:
   await DB.table('users').where('email', req.input('email')).first()
   ```

2. **Identifier Quoting:**
   All table and column identifiers are escaped with dialect-specific quotes via `db.q()` (double quotes `"` in SQLite & PostgreSQL, backticks `` ` `` in MySQL) to prevent identifier-based injection.

3. **Safe String Literal Escaping in Migrations:**
   Migration default values and enum definitions escape both single quotes and backslashes (critical for MySQL escaping semantics), avoiding quote-escape breakouts.

4. **Safe Foreign Key Actions:**
   Referential integrity actions (`onDelete`, `onUpdate`) are strictly validated against a known safe whitelist (`CASCADE`, `SET NULL`, `RESTRICT`, `NO ACTION`, `SET DEFAULT`).

---

### 16.4 Prototype Pollution Defenses

Prototype Pollution allows malicious actors to modify JavaScript's `Object.prototype`, potentially corrupting application logic or leading to remote code execution.

Som.js actively prevents prototype pollution:
- **JSON Requests:** Parsed via `safe-json.js`, automatically filtering out `__proto__`, `constructor`, and `prototype` keys.
- **URL-Encoded Requests:** Form bodies (`application/x-www-form-urlencoded`) strip prototype pollution keys before populating `req.body`.
- **Query Strings:** `req.query` automatically sanitizes incoming search parameters.
- **Multipart Uploads:** Form field names parsed from multipart requests ignore prototype keys.
- **Nested Getter (`req.input('user.address.city')`):** `getPath` explicitly halts if any path segment targets `__proto__`, `constructor`, or `prototype`.

---

### 16.5 Path Traversal & Sensitive File Protection

1. **Directory Boundary Checks:**
   `Storage.disk('local')` and `Storage.disk('public')` verify that all resolved file paths remain strictly inside the storage directory (`f.startsWith(root + path.sep)`). Any `../` attempts outside the designated folder throw a `400 Bad Request`.
2. **Uploaded File Names:**
   `file.store('avatars')` generates a cryptographically random hex name (`crypto.randomBytes(16)`), ignoring the original client-provided filename.
3. **Protected Server Files:**
   The built-in server (`som dev` and `som serve`) automatically blocks access to:
   - Hidden files and folders (`.env*`, `.git`, `.vscode`, etc.)
   - Database files (`.db`, `.sqlite`, `.sqlite3`, `.db-wal`, `.sql`, `.dump`, `.bak`)
   - Package manager files and lockfiles (`package.json`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lockb`, `composer.*`)
   - Configuration and Docker files (`som.config.json`, `Dockerfile`, `docker-compose*.yml`)
   - Backend source code in production (`backend/`, `app/`, `routes/`, `database/`)

---

### 16.6 Rate Limiting & Timing Attack Protection

1. **Rate Limiting (`throttle`):**
   Defend your API endpoints from brute-force and denial-of-service attacks:
   ```js
   Route.post('/login', [AuthController, 'login']).middleware('throttle:5,1') // 5 attempts per minute
   ```
   Limits track visitor IP and route independently. Exceeded limits return `429 Too Many Attempts` with `Retry-After`, `X-RateLimit-Limit`, and `X-RateLimit-Remaining` headers.

2. **Timing Attack Resistance:**
   Authentication tokens, personal access tokens, session identifiers, and CSRF tokens are verified using `crypto.timingSafeEqual` to avoid side-channel timing disclosures.

---

### 16.7 Security Headers & Header Injection Prevention

1. **Default Security Headers:**
   Every API response from the Som.js backend includes:
   ```http
   X-Content-Type-Options: nosniff
   X-Frame-Options: DENY
   Referrer-Policy: same-origin
   Cross-Origin-Resource-Policy: same-origin
   Cache-Control: no-store
   ```
2. **HTTP Response Splitting Defense:**
   Calling `res.header(name, value)` or `res.cookie(name, value)` validates that neither the header name nor value contain carriage return (`\r`) or newline (`\n`) characters, preventing HTTP response splitting and header injection vulnerabilities.

---

## 17. Database & Models Guide

Som.js features a powerful, lightweight database abstraction and Eloquent/ActiveRecord-style ORM built directly into `somjs/server`. It supports **SQLite** (zero dependencies, built into modern Node.js), **MySQL / MariaDB** (via `mysql2`), and **PostgreSQL** (via `pg`).

### 17.1 Linking & Configuring the Database & Environment

Configure your database connection string and application keys in your `.env` file:

```env
# Application Encryption Key (generated via som key:generate):
APP_KEY="base64:..."

# SQLite (Built-in, zero dependencies, perfect for local dev & smaller apps):
DATABASE_URL="sqlite:database/app.db"

# MySQL / MariaDB (requires: npm i mysql2):
DATABASE_URL="mysql://root:secret@127.0.0.1:3306/my_database"

# PostgreSQL (requires: npm i pg):
DATABASE_URL="postgres://postgres:secret@127.0.0.1:5432/my_database"
```

To connect via CLI flags during development:
```bash
som dev --db sqlite:database/app.db
# or
som dev --db mysql://root:secret@127.0.0.1:3306/my_database
```

#### Application Key Generation (`som key:generate`)

The `APP_KEY` is a 256-bit encryption key used by `somjs/server` to sign URLs (`Route.signed()`), encrypt cookies, and protect sessions:

```bash
# Generate a new 256-bit key and save it to .env:
som key:generate

# Display the generated key in terminal without modifying .env:
som key:generate --show

# Force key regeneration in production:
som key:generate --force
```

> **Automatic Session Invalidation:** Session cookies (`som_session`) are cryptographically sealed with AES-256-GCM authenticated encryption using `APP_KEY`. Changing `APP_KEY` (whether manually in `.env` or via `som key:generate`) renders existing session cookies undecryptable. Furthermore, `som key:generate` automatically wipes active session tokens from the database (`personal_access_tokens WHERE type = 'session'`) and removes cached session files, instantly forcing all users to re-authenticate.

---

### 17.2 Defining Models (`app/Models/*.js`)

Generate a model with its migration, factory, seeder, controller, page, and route in one line:
```bash
# Generate model, migration, factory, seeder, and controller (classic -mfsc):
som make:model Post -mfsc

# Full stack scaffolding: model, migration, factory, seeder, controller, page, and registered routes with auth:
som make:model Post -mfscpr --route=api --auth

# Or use the --all flag:
som make:model Post --all --auth

# Scaffolding flags:
#   -m   Generate migration in database/migrations/
#   -f   Generate factory in database/factories/PostFactory.js
#   -s   Generate seeder in database/seeders/PostSeeder.js
#   -c   Generate resource controller in app/Http/Controllers/PostController.js
#   -p   Generate UI page in frontend/pages/Post.som
#   -r   Register route automatically in route file
#   --route=<name> Target route file (e.g. --route=api or --route=shop)
#   --auth         Attach auth middleware: .middleware('auth')
```

A model represents a database table (by default, the lowercase plural form of the class name, e.g., `Post` maps to `posts`):

```js
// app/Models/Post.js
const { Model, Str } = require('somjs/server')

class Post extends Model {
  // static table = 'posts' // Optional override
  static fillable = ['title', 'slug', 'body', 'user_id', 'published'] // Mass-assignment whitelist
  static hidden = [] // Fields excluded when serialized to JSON
  static casts = { published: 'boolean', meta: 'json' } // Automatic type conversion
  static softDeletes = true // Enables soft deletes via `deleted_at`

  // Relationships:
  user() {
    return this.belongsTo(require('./User'))
  }

  comments() {
    return this.hasMany(require('./Comment'))
  }

  tags() {
    return this.belongsToMany(require('./Tag')) // Uses pivot table `post_tag`
  }

  // Model Query Scopes:
  static scopePublished(query) {
    query.where('published', true)
  }

  // Model Lifecycle Hooks (creating, created, updating, updated, deleting, deleted):
  static async creating(post) {
    if (!post.slug) post.slug = Str.slug(post.title)
  }
}

module.exports = Post
```

---

### 17.3 Querying with Models

```js
const Post = require('../../app/Models/Post')

// Retrieve all records:
const posts = await Post.all()

// Find by primary key (or throw 404 HttpError):
const post = await Post.findOrFail(1)

// Query chaining:
const active = await Post.query()
  .published()
  .where('views', '>=', 100)
  .orderBy('created_at', 'desc')
  .limit(20)
  .get()

// Eager loading relations:
const detailedPosts = await Post.with('user', 'comments.author').get()

// Pagination:
const paginated = await Post.query().latest().paginate(15, req.integer('page', 1))
// Returns: { data: [...], total, per_page, current_page, last_page }

// Creating records:
const created = await Post.create({
  title: 'Understanding Som.js',
  body: 'Full guide content...',
  user_id: req.user.id,
})

// Updating & Deleting:
await post.update({ title: 'Updated Title' })
await post.delete() // Sets deleted_at if softDeletes is enabled
```

---

### 17.4 Query Builder (`DB`) & Transactions

When you need raw queries or lower-level table operations without model instances:

```js
const { DB } = require('somjs/server')

// Table queries:
const activeUsers = await DB.table('users')
  .where('status', 'active')
  .orderBy('id', 'desc')
  .get()

// Joins & Aggregates:
const orders = await DB.table('orders')
  .join('users', 'users.id', '=', 'orders.user_id')
  .select('orders.*', 'users.name as customer_name')
  .where('orders.total', '>', 50)
  .get()

const count = await DB.table('users').count()
const maxTotal = await DB.table('orders').max('total')

// Direct parameterized SQL (safely escaped):
const rows = await DB.select('SELECT * FROM users WHERE email = ?', [email])
await DB.statement('UPDATE users SET verified = ? WHERE id = ?', [true, 1])

// Database Transactions:
await DB.transaction(async () => {
  await DB.table('accounts').where('id', fromId).decrement('balance', 100)
  await DB.table('accounts').where('id', toId).increment('balance', 100)
})
```

---

## 18. Controllers & Request Handling

Controllers group related HTTP request logic together into clean, testable classes.

### 18.1 Generating Controllers

```bash
# Standard resource controller:
som make:controller PostController --api

# Controller bound to a specific model:
som make:controller PostController --model Post

# Nested controller inside a subfolder:
som make:controller Admin/ReportController
```

---

### 18.2 Controller Anatomy & REST Actions

```js
// app/Http/Controllers/PostController.js
const { response, abort, noContent } = require('somjs/server')
const Post = require('../../Models/Post')

class PostController {
  // GET /api/posts
  async index(req) {
    const search = req.string('q')
    return Post.query()
      .when(search, (q) => q.where('title', 'like', `%${search}%`))
      .latest()
      .paginate(15, req.integer('page', 1))
  }

  // POST /api/posts
  async store(req) {
    // Validate request inputs:
    const data = await req.validate({
      title: 'required|min:3|max:200|unique:posts,title',
      body: 'required|max:10000',
      published: 'boolean',
    })

    const post = await Post.create({ ...data, user_id: req.user.id })
    return response(post, 201)
  }

  // GET /api/posts/{id}
  async show(req, id) {
    return Post.with('user', 'comments').findOrFail(id)
  }

  // PUT/PATCH /api/posts/{id}
  async update(req, id) {
    const post = await Post.findOrFail(id)
    
    // Authorization check via Gate / Policy:
    await req.authorize('update', post)

    const data = await req.validate({
      title: 'sometimes|required|min:3|max:200',
      body: 'sometimes|required',
      published: 'boolean',
    })

    await post.update(data)
    return post
  }

  // DELETE /api/posts/{id}
  async destroy(req, id) {
    const post = await Post.findOrFail(id)
    await req.authorize('delete', post)
    await post.delete()
    return noContent() // 204 No Content
  }
}

module.exports = PostController
```

---

### 18.3 Connecting Routes to Controllers (`routes/api.js`)

In `backend/routes/api.js`:

```js
const { Route } = require('somjs/server')
const PostController = require('../app/Http/Controllers/PostController')

// Resource routes (maps index, store, show, update, destroy):
Route.apiResource('posts', PostController)

// Custom individual action routes:
Route.get('/posts/{id}/comments', [PostController, 'comments'])
Route.post('/posts/{id}/publish', [PostController, 'publish']).middleware('auth')

// Route groups with prefix and middleware:
Route.prefix('admin').middleware(['auth', 'ensure-is-admin']).group(() => {
  Route.get('/stats', [AdminReportController, 'stats'])
})
```

Check your registered route table at any time with:
```bash
som route:list
```

---

## 19. Middleware & Route Protection

Middleware wraps HTTP requests to inspect, authenticate, modify, or block incoming traffic before it reaches the controller, and can modify the outgoing response.

### 19.1 Creating Custom Middleware

Generate a middleware with:
```bash
som make:middleware EnsureIsAdmin
```

Define the `handle(req, next, ...args)` method:

```js
// app/Http/Middleware/EnsureIsAdmin.js
const { abort } = require('somjs/server')

class EnsureIsAdmin {
  async handle(req, next, requiredRole = 'admin') {
    // 1. Before controller: check conditions
    if (!req.user) {
      abort(401, 'Please log in first.')
    }

    if (req.user.role !== requiredRole && !req.user.is_admin) {
      abort(403, `Access requires ${requiredRole} permissions.`)
    }

    // 2. Pass request downstream to next middleware or controller:
    const res = await next(req)

    // 3. After controller: modify response headers or cookies if needed
    return res.header('X-Role-Verified', requiredRole)
  }
}

module.exports = EnsureIsAdmin
```

---

### 19.2 Registering & Using Middleware

Register global middleware or route aliases in `backend/app/Http/Kernel.js`:

```js
// backend/app/Http/Kernel.js
module.exports = {
  // Global middleware executed on every request:
  middleware: [
    'csrf',
    'throttle:120,1',
  ],

  // Route-level middleware aliases:
  aliases: {
    'admin': 'Middleware/EnsureIsAdmin.js',
  },
}
```

Apply middleware to routes in `routes/api.js`:

```js
// Single middleware:
Route.get('/profile', [UserController, 'profile']).middleware('auth')

// Middleware with parameters ('admin:superadmin'):
Route.get('/system-logs', [LogController, 'index']).middleware('admin:superadmin')

// Multiple middlewares on a group:
Route.middleware(['auth', 'csrf', 'throttle:30,1']).group(() => {
  Route.post('/orders', [OrderController, 'store'])
  Route.delete('/orders/{id}', [OrderController, 'destroy'])
})
```

---

### 19.3 Built-in Middleware Reference

| Middleware | Description | Example Usage |
|---|---|---|
| `auth` | Ensures the visitor is authenticated via session cookie or bearer token. | `Route.middleware('auth')` |
| `guest` | Prevents authenticated users from accessing login/register pages. | `Route.middleware('guest')` |
| `verified` | Ensures the authenticated user has verified their email address. | `Route.middleware(['auth', 'verified'])` |
| `csrf` | Verifies CSRF double-submit cookies on `POST`, `PUT`, `PATCH`, `DELETE`. | `Route.middleware('csrf')` |
| `throttle:max,min` | Rate limits requests by IP address and route. | `Route.middleware('throttle:60,1')` |
| `can:ability,model` | Checks authorization against defined Policies or Gates. | `Route.middleware('can:update,post')` |

---

## 20. Migrations, Seeders & Factories

Migrations track schema modifications over time across development, staging, and production environments.

### 20.1 Creating & Writing Migrations

Generate a migration:
```bash
som make:migration create_posts_table
# Or to modify an existing table:
som make:migration add_published_to_posts_table
```

A migration implements `up(schema)` and `down(schema)`:

```js
// database/migrations/2026_10_30_000001_create_posts_table.js
module.exports = {
  up(schema) {
    schema.create('posts', (table) => {
      table.id() // Auto-incrementing primary key
      table.foreignId('user_id').constrained().cascadeOnDelete()
      table.string('title', 200).unique()
      table.string('slug').index()
      table.text('body').nullable()
      table.boolean('published').default(false)
      table.integer('views').default(0)
      table.json('metadata').nullable()
      table.timestamps() // created_at and updated_at
    })
  },

  down(schema) {
    schema.dropIfExists('posts')
  },
}
```

#### Altering Existing Tables:
```js
module.exports = {
  up(schema) {
    schema.table('posts', (table) => {
      table.string('subtitle', 255).nullable()
      table.index(['user_id', 'published'])
    })
  },
  down(schema) {
    schema.table('posts', (table) => {
      table.dropColumn('subtitle')
    })
  },
}
```

#### Running Migration Commands:
- `som migrate`: Run all pending migrations.
- `som migrate:rollback`: Roll back the last batch of migrations (`--step 2` for two batches).
- `som migrate:fresh --seed`: Drop all database tables, re-run all migrations from scratch, and seed the database.
- `som migrate:status`: Inspect which migrations have run and their batch numbers.

---

### 20.2 Model Factories with `fake`

Factories generate large quantities of realistic test and dummy data.

```bash
som make:factory PostFactory --model Post
```

```js
// database/factories/PostFactory.js
const { Factory } = require('somjs/server')
const Post = require('../../app/Models/Post')

module.exports = Factory.define(Post, (fake) => ({
  title: fake.sentence(6),
  slug: (attrs) => fake.slug(attrs.title),
  body: fake.paragraph(4),
  published: true,
  views: fake.number(0, 500),
})).state('draft', {
  published: false,
})
```

Smart Model Factories & Faker Helpers:
```js
// database/factories/CategoryFactory.js
const { Factory } = require('somjs/server')
const Category = require('../../app/Models/Category')

// som make:factory CategoryFactory automatically detects Category and sets smart seeds!
module.exports = Factory.define(Category, (fake) => ({
  name: fake.unique().category(),            // Real categories e.g. "Electronics", "Home & Kitchen"
  slug: (attrs) => fake.slug(attrs.name),    // Auto kebab-case: "electronics", "home-kitchen"
  description: fake.sentence(),
  is_active: true,
}))
```

Rich domain Faker methods include:
- `fake.category()` / `fake.department()`: realistic catalog categories & corporate departments
- `fake.product()` / `fake.brand()`: real product & brand names
- `fake.tag()`: realistic keywords & tags
- `fake.sku(prefix)` / `fake.price(min, max)`: e-commerce SKU codes and formatted prices
- `fake.slug(textOrWordCount)`: slugifies text into kebab-case or generates words
- `fake.smart(columnName, modelName)`: automatically guesses appropriate data based on column & model

Using factories in code:
```js
// Create 10 categories in the database:
await Category.factory().count(10).create()

// Create 20 posts in the database:
await Post.factory().count(20).create()

// Create with override and state:
await Post.factory().draft().create({ title: 'Special Draft' })

// Create post for a specific user:
await Post.factory().for(user).create()
```

---

### 20.3 Writing & Running Seeders

Seeders populate your tables with initial or testing data:

```bash
som make:seeder PostSeeder
```

```js
// database/seeders/DatabaseSeeder.js
const { Seeder, Hash } = require('somjs/server')
const User = require('../../app/Models/User')
const Post = require('../../app/Models/Post')

class DatabaseSeeder extends Seeder {
  async run() {
    // Create an initial admin user:
    const admin = await User.create({
      name: 'System Admin',
      email: 'admin@example.com',
      password: Hash.make('password123'),
      is_admin: true,
    })

    // Seed posts using Factory:
    await Post.factory().count(10).for(admin).create()

    // Call sub-seeders:
    await this.call(require('./CategorySeeder'))
  }
}

module.exports = DatabaseSeeder
```

Execute seeders via:
```bash
som db:seed
# Or run a specific seeder class:
som db:seed --class PostSeeder
```

---

## 21. Queues, Jobs & Background Processing

Move slow tasks (sending transactional emails, generating PDFs, resizing images, calling third-party webhooks) out of the HTTP request-response cycle into background jobs.

### 21.1 Setting Up Queue Tables

Generate and run the queue migration:
```bash
som queue:table
som migrate
```
This creates the `jobs` (waiting tasks) and `failed_jobs` tables.

---

### 21.2 Defining a Job

Generate a new job class:
```bash
som make:job SendWelcomeEmail
```

```js
// app/Jobs/SendWelcomeEmail.js
const { Job, Mail } = require('somjs/server')

class SendWelcomeEmail extends Job {
  static tries = 3    // Maximum retry attempts if an error is thrown
  static backoff = 15 // Seconds to wait between retry attempts

  constructor(user) {
    super()
    this.user = user // Model instances are automatically serialized to ID and reloaded when executed
  }

  async handle() {
    // Perform background work:
    await Mail.send({
      to: this.user.email,
      subject: `Welcome to our platform, ${this.user.name}!`,
      text: 'Thank you for signing up.',
    })
  }

  failed(error) {
    // Executed if all retry attempts fail:
    console.error(`Failed to send welcome email to user #${this.user.id}:`, error.message)
  }
}

module.exports = SendWelcomeEmail
```

---

### 21.3 Dispatching Jobs

Dispatch jobs from your controllers, actions, or models:

```js
const { dispatch, dispatchSync } = require('somjs/server')
const SendWelcomeEmail = require('../Jobs/SendWelcomeEmail')

// 1. Asynchronous background queue (preferred):
await dispatch(new SendWelcomeEmail(user))

// 2. Synchronous immediate execution (useful during testing or debugging):
await dispatchSync(new SendWelcomeEmail(user))
```

---

### 21.4 Running & Managing Queue Workers

- **Development:** `som dev` automatically checks and processes queue jobs in the background.
- **Production Worker:** Run dedicated worker processes via:
  ```bash
  som queue:work
  # Specific queue priority:
  som queue:work --queue=high,default
  # Stop when all pending jobs finish:
  som queue:work --stop-when-empty
  ```
- **Inspect Failed Jobs:**
  ```bash
  som queue:failed
  ```
- **Retry Failed Jobs:**
  ```bash
  som queue:retry 1     # Retry specific job ID
  som queue:retry all   # Re-queue all failed jobs
  ```
- **Flush / Clear:**
  ```bash
  som queue:flush       # Delete all failed jobs
  som queue:clear       # Delete all waiting jobs
  ```

---

## 22. Testing Your Application

Writing automated tests gives you confidence that your database operations, controllers, and APIs work as expected. Som.js works seamlessly with Node's native test runner (`node:test`).

### 22.1 Setting Up the Test Environment

Add a test script to your `package.json`:
```json
{
  "scripts": {
    "test": "node --test 'tests/**/*.test.js'"
  }
}
```

Create a test database configuration: you can use SQLite in-memory (`sqlite::memory:`) or a dedicated test database file (`database/testing.db`).

---

### 22.2 Writing Model & Database Unit Tests

```js
// tests/models/post.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const { createSchema, setConnection } = require('somjs/server')
const { connect } = require('somjs/bin/db.js')
const Post = require('../../backend/app/Models/Post')

test.before(async () => {
  // Connect to an in-memory SQLite database:
  const db = await connect('sqlite::memory:')
  setConnection(db)

  // Run table migration:
  const schema = createSchema(db)
  await schema.create('posts', (table) => {
    table.id()
    table.string('title')
    table.boolean('published').default(false)
    table.timestamps()
  })
})

test('can create a post and retrieve it', async () => {
  const post = await Post.create({ title: 'Testing Post', published: true })
  assert.ok(post.id)
  assert.equal(post.title, 'Testing Post')
  assert.equal(post.published, true)

  const found = await Post.findOrFail(post.id)
  assert.equal(found.title, 'Testing Post')
})

test('find throws 404 HttpError when not found', async () => {
  await assert.rejects(async () => {
    await Post.findOrFail(9999)
  }, (err) => err.status === 404)
})
```

---

### 22.3 Writing HTTP Controller & Endpoint Tests

Test your API routes and controllers end-to-end:

```js
// tests/api/posts.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const { createBackend, Request } = require('somjs/server')

test('POST /api/posts validates required title', async () => {
  const handler = createBackend('backend') // Points to your backend directory

  // Construct simulated HTTP request:
  const req = new Request({
    method: 'POST',
    url: '/api/posts',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}), // Missing required title
  })

  const res = await handler(req)
  assert.equal(res.status, 422) // Validation failure
  
  const body = JSON.parse(res.body)
  assert.ok(body.errors.title)
})

test('GET /api/posts returns 200 with list of posts', async () => {
  const handler = createBackend('backend')
  const req = new Request({ method: 'GET', url: '/api/posts' })
  const res = await handler(req)

  assert.equal(res.status, 200)
  const data = JSON.parse(res.body)
  assert.ok(Array.isArray(data.data || data))
})
```

Run all tests with:
```bash
npm test
```

---

## 23. Passing Data from Controllers to Pages

Som.js offers multiple flexible and idiomatic approaches to pass server-side data, models, and variables from backend controllers into `.som` pages.

### 23.1 Pattern 1: Reactive Asynchronous Fetching (`api` + `load`) (Recommended)

In modern reactive web applications, controllers expose clean JSON endpoints, and `.som` pages consume them reactively using the `load` statement.

#### The Controller:
```js
// backend/app/Http/Controllers/ProductController.js
const { response } = require('somjs/server')
const Product = require('../../Models/Product')

class ProductController {
  async show(req, id) {
    const product = await Product.with('category', 'reviews.user').findOrFail(id)
    return {
      product,
      currency: 'USD',
      canEdit: req.user ? req.user.id === product.user_id || req.user.is_admin : false,
    }
  }
}

module.exports = ProductController
```

#### The Route (`backend/routes/api.js`):
```js
const { Route } = require('somjs/server')
const ProductController = require('../app/Http/Controllers/ProductController')

Route.get('/products/{id}', [ProductController, 'show'])
```

#### The Page (`frontend/pages/Product.som`):
```html
<!-- Parameter `:id` from the client router is passed directly as `prop id` -->
prop id

// `load` calls the controller action and creates a reactive resource:
load res = api.get(`/api/products/${id}`)

derive product = res.data ? res.data.product : null
derive currency = res.data ? res.data.currency : 'USD'
derive canEdit = res.data ? res.data.canEdit : false

action edit() {
  // Action logic
}

<view>
  <div s-if="res.loading" class="spinner">Loading product #{id}…</div>
  <div s-elif="res.error" class="error">{res.error.message}</div>
  <article s-else class="product-details">
    <h1>{product.title}</h1>
    <p class="price">{product.price} {currency}</p>
    <p>{product.description}</p>
    
    <button s-if="canEdit" @click={edit}>Edit Product</button>
  </article>
</view>
```

---

### 23.2 Pattern 2: Global Initial Data Hydration

When you want server-rendered data (such as the authenticated user, feature flags, or app configuration) immediately available without an extra HTTP round-trip upon first page load:

#### Injecting Data in `index.html`:
```html
<!-- frontend/index.html -->
<head>
  <!-- Injected dynamically by your server entrypoint or build -->
  <script>
    window.__APP_DATA__ = {
      appName: "Som Store",
      user: null, // Filled with user object if logged in
      features: { newCheckout: true, darkTheme: false }
    };
  </script>
</head>
```

#### Consuming in a `.som` Page or Store:
```html
<!-- frontend/pages/Home.som -->
state appData = window.__APP_DATA__ || {}
state user = appData.user

<view>
  <h1>Welcome to {appData.appName}</h1>
  <p s-if="user">Logged in as: {user.name}</p>
  <p s-else><a href="/login">Please sign in</a></p>
</view>
```

---

### 23.3 Pattern 3: Server-Side Component Rendering (`Som.render`)

If you are rendering HTML on the server (e.g., in email templates, PDF generators, or server-rendered landing pages), pass variables directly into the template:

```js
// In your server route or controller:
const { Som } = require('somjs')
const { response } = require('somjs/server')
const Invoice = require('../../app/Models/Invoice')

class InvoiceController {
  async download(req, id) {
    const invoice = await Invoice.with('items', 'customer').findOrFail(id)
    
    // Pass variables directly to the Som template engine:
    const html = Som.render(`
      <div class="invoice-box">
        <h1>Invoice #{invoice.number}</h1>
        <p>Issued to: <b>{customer.name}</b> ({customer.email})</p>
        <table>
          <thead>
            <tr><th>Item</th><th>Quantity</th><th>Price</th></tr>
          </thead>
          <tbody>
            {for item in items}
              <tr>
                <td>{item.name}</td>
                <td>{item.qty}</td>
                <td>{item.price} {currency}</td>
              </tr>
            {/for}
          </tbody>
        </table>
        <p class="total">Total: {invoice.total} {currency}</p>
      </div>
    `, {
      invoice,
      customer: invoice.customer,
      items: invoice.items,
      currency: 'USD',
    })

    return response(html).header('Content-Type', 'text/html')
  }
}

module.exports = InvoiceController
```

---

### 23.4 Pattern 4: Route Parameters and Query String Props

Client-side routes defined in `frontend/routes/web.som` automatically pass URL parameters as props to the target page:

```js
// frontend/routes/web.som
Route.view('/users/:id', 'pages/User.som').name('users.show')
```

```html
<!-- frontend/pages/User.som -->
prop id // Matches `:id` in the route definition!

load user = api.get(`/api/users/${id}`)

<view>
  <h2>User Profile #{id}</h2>
  <p s-if="user.data">{user.data.name} — {user.data.email}</p>
</view>
```

You can also read query string parameters using `$route.query`:
```html
<view>
  <!-- URL: /products?sort=newest&page=2 -->
  <p>Sorting by: {$route.query.sort}</p>
  <p>Current Page: {$route.query.page || 1}</p>
</view>
```

---

## 24. Folder Structure & Custom Directories

Som.js supports both unified single-folder architectures and full modular enterprise structures. It automatically detects and works with standard folder conventions:

```
my-app/
├── Source/ (or frontend/, src/)     The browser code: index.html, pages, components, routes
├── backend/ (or app/, server/)      Server logic: controllers, models, routes/api.js
├── Public/ (or public/)             Static public assets served directly: images, favicon, fonts
├── Import/                          Incoming raw datasets, CSV imports, seed inputs, migrations
├── Export/                          Generated reports, PDF downloads, backups, analytics exports
├── config/ (or Config/)             Application configuration files (som.config.json, app.js)
├── storage/                         Uploaded files, cache, and framework storage
├── .env                             Environment settings and secrets
└── package.json
```

---

### 24.1 Supported Folder Roles

#### 1. `Source/` (or `frontend/`, `src/`)
Contains all client-side code:
- `index.html`: The application entry point.
- `routes/web.som`: Client-side route declarations.
- `pages/`: Page components.
- `components/`: Reusable UI widgets.
- `layouts/`: Master page wrappers (`main.som`, `guest.som`).
- `ui.css`: Design tokens and global stylesheets.

#### 2. `Public/` (or `public/`)
Houses static assets that are served directly at the root URL path without routing:
- Images: `Public/images/logo.svg` → accessible at `http://localhost:8000/images/logo.svg`.
- Icons & Manifests: `Public/favicon.ico`, `Public/robots.txt`, `Public/site.webmanifest`.
- Fonts: `Public/fonts/inter.woff2`.
- When running `som build`, all files inside `Public/` are automatically copied to `dist/`.

#### 3. `Import/`
A dedicated space for data ingestion:
- Place external JSON feeds, CSV files, batch migration scripts, or legacy data dumps.
- Keep them separate from production assets to avoid accidental public exposure.
- Example usage in a seeder or job:
  ```js
  const fs = require('fs')
  const path = require('path')
  const data = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'Import', 'users.json'), 'utf8'))
  ```

#### 4. `Export/`
A destination for background exports and outputs:
- Generated CSV reports, PDF invoices, and automated database backups (`som db backup`).
- Automatically protected from public HTTP access by Som's built-in server security rules.

#### 5. `config/` (or `Config/`)
Centralized configuration repository:
- `config/som.config.json` or `config/som.json`: Database connections, table whitelist, and API rate limits.
- Som.js automatically scans `config/som.config.json` and loads environment variable substitutions (`${DATABASE_URL}`).

---

## 25. RTL & LTR Internationalization

Som.js provides first-class support for bidirectional user interfaces, allowing seamless switching between **LTR (Left-to-Right)** languages (such as English, French, Spanish) and **RTL (Right-to-Left)** languages (such as Arabic, Hebrew, Persian, Urdu).

---

### 25.1 Setting the Direction Attribute (`dir`)

The HTML `dir` attribute controls text direction and layout orientation.

#### Global Direction in `index.html`:
```html
<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="utf-8">
  <title>My App</title>
</head>
<body>
  <div id="app"></div>
</body>
</html>
```

#### Component-Level Direction in `.som` Files:
You can specify `dir` statically or bind it reactively to a state variable:

```html
<!-- Component with dynamic direction -->
state isRtl = false

action toggleDirection() {
  isRtl = !isRtl
  // Also update root document direction:
  document.documentElement.setAttribute('dir', isRtl ? 'rtl' : 'ltr')
}

<view>
  <button @click={toggleDirection}>
    Switch to {isRtl ? 'LTR' : 'RTL'}
  </button>

  <main dir={isRtl ? 'rtl' : 'ltr'} class="content-box">
    <h2>{isRtl ? 'Right to Left' : 'Left to Right'}</h2>
    <p>This layout adapts automatically based on text direction.</p>
  </main>
</view>
```

---

### 25.2 CSS Logical Properties (Best Practice)

When writing CSS inside `<style>` or `<style scoped>` in `.som` files, **always use CSS Logical Properties** instead of physical properties (`left`/`right`). Logical properties automatically mirror your layout in RTL mode without writing a single line of override code!

| Physical Property (Avoid) | CSS Logical Property (Recommended) | Effect in LTR | Effect in RTL |
|---|---|---|---|
| `margin-left` | `margin-inline-start` | Left margin | Right margin |
| `margin-right` | `margin-inline-end` | Right margin | Left margin |
| `padding-left` | `padding-inline-start` | Left padding | Right padding |
| `padding-right` | `padding-inline-end` | Right padding | Left padding |
| `left: 0` | `inset-inline-start: 0` | Positions at Left | Positions at Right |
| `right: 0` | `inset-inline-end: 0` | Positions at Right | Positions at Left |
| `text-align: left` | `text-align: start` | Left-aligned | Right-aligned |
| `text-align: right` | `text-align: end` | Right-aligned | Left-aligned |
| `border-left` | `border-inline-start` | Left border | Right border |
| `border-right` | `border-inline-end` | Right border | Left border |

#### Example:
```html
<style scoped>
.sidebar {
  /* Automatically docks to the left in LTR and right in RTL: */
  position: fixed;
  inset-inline-start: 0;
  top: 0;
  bottom: 0;
  width: 260px;

  /* Automatic padding and borders: */
  padding-inline-start: 24px;
  padding-inline-end: 16px;
  border-inline-end: 1px solid var(--border);
  text-align: start;
}
</style>
```

---

### 25.3 Direction-Specific CSS Selectors

When specific visual adjustments are necessary (e.g., flipping navigation arrows or icons):

```css
/* Target RTL mode specifically */
[dir="rtl"] .back-arrow {
  transform: scaleX(-1); /* Flips arrow to point right */
}

[dir="rtl"] .breadcrumb-separator {
  transform: rotate(180deg);
}

/* Or using the modern :dir() pseudo-class */
:dir(rtl) .notification-badge {
  inset-inline-end: -6px;
}
```

---

### 25.4 Building a Reactive Locale & Direction Store

Create a reusable store that manages language, text direction, and persistent user preferences:

```js
// frontend/stores/locale.js
export const locale = Som.store('locale', {
  current: 'en',
  dir: 'ltr',

  setLocale(lang, dir = null) {
    this.current = lang
    // Detect RTL automatically if not specified:
    const rtlLanguages = ['ar', 'he', 'fa', 'ur']
    this.dir = dir || (rtlLanguages.includes(lang) ? 'rtl' : 'ltr')

    // Apply to HTML document:
    document.documentElement.setAttribute('lang', this.current)
    document.documentElement.setAttribute('dir', this.dir)
  }
}, { saved: ['current', 'dir'] }) // Persisted across browser sessions!
```

In any `.som` page or component:
```html
import { locale } from '../stores/locale.js'

<view>
  <div class="lang-switch">
    <button @click={() => locale.setLocale('en', 'ltr')}>English (LTR)</button>
    <button @click={() => locale.setLocale('ar', 'rtl')}>العربية (RTL)</button>
  </div>

  <p>Current Direction: <b>{locale.dir}</b></p>
</view>
```

---

## 26. Model Context Protocol (MCP) & AI Agent Integration

Som.js includes a native **Model Context Protocol (MCP)** server implementing the open `2024-11-05` standard. This enables AI Coding Agents (such as **Claude Desktop**, **Cursor**, **Windsurf**, and **Google Antigravity**) to inspect routes, introspect database schemas, and safely execute queries against your application with zero third-party packages.

### 26.1 Starting the MCP Server

You can run the MCP server in two modes:

#### 1. Stdio Mode (for AI IDEs & Desktop Agents)
Launch Som.js in Stdio mode directly from the terminal or your agent config:
```bash
som mcp
```

To configure **Claude Desktop**, add the following to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "somjs": {
      "command": "node",
      "args": ["./bin/som.js", "mcp"],
      "cwd": "/path/to/your/somjs-project"
    }
  }
}
```

To configure **Cursor** or **Windsurf**, navigate to `Settings -> Features -> MCP Servers` and add a command with `node ./bin/som.js mcp`.

#### 2. HTTP & SSE Transport (for Web Agents & Microservices)
When running `som dev` or `som serve`, the MCP server is mounted automatically at `/mcp` and `/api/mcp`.
* **Capabilities discovery:** `GET /mcp` returns JSON-RPC capabilities, available tools, and server metadata.
* **JSON-RPC execution:** `POST /mcp` accepts standard MCP protocol requests.

### 26.2 Built-in MCP Tools

The Som.js MCP server exposes three native tools to AI agents:

| Tool Name | Description | Parameters |
|---|---|---|
| `query_database` | Runs a safe, read-only SQL query against the connected database. Forbids destructive commands (`DROP`, `TRUNCATE`, `ATTACH`) and automatically redacts sensitive fields (`password`, `token`, `secret`). | `sql` (string, required) |
| `list_routes` | Lists every registered HTTP route, its method, URI, action handler, and attached middleware. | None |
| `server_health` | Returns server uptime, Node.js version, platform, and live V8 memory statistics (`rssMB`, `heapUsedMB`, `gcExposed`). | None |

### 26.3 Built-in MCP Resources

AI agents can directly read contextual resources using URI schemas:
* `som://routes`: Complete JSON catalogue of backend routes.
* `som://schema`: Complete database schema, including all tables, columns, data types, and primary/foreign keys.

### 26.4 Security & Origin Protection

The HTTP MCP endpoint includes enterprise-grade security guards:
* **Anti-DNS Rebinding / CORS Origin Locking:** Untrusted browser origins (e.g., `https://malicious.com`) are immediately rejected with `403 Forbidden`. Only `localhost`, `127.0.0.1`, and explicit `MCP_ALLOWED_ORIGIN` hosts are permitted.
* **Bearer Token Authentication:** Set `MCP_TOKEN=your-secret-token` in `.env` to require `Authorization: Bearer your-secret-token` on all incoming requests.

---

## 27. Auto Garbage Collector & Memory Watchdog

Long-running Node.js servers frequently suffer from V8 heap accumulation during active development and production traffic. Som.js solves this with an active **Memory Watchdog and Auto Garbage Collector** (`bin/backend/gc.js`).

### 27.1 Enabling Automatic Garbage Collection

Pass the `--gc` flag to `som dev` or `som serve`:
```bash
som dev --gc
# or in production:
AUTO_GC=1 som serve dist
```

When `--gc` or `AUTO_GC=1` is present, Som.js will automatically respawn the V8 runtime with `--expose-gc` enabled so that `global.gc()` is available.

### 27.2 How It Works

1. **Watchdog Interval:** Every 30 seconds (configurable via `AUTO_GC_INTERVAL_MS`), the watchdog samples `process.memoryUsage()`.
2. **Threshold Monitoring:** If `heapUsed` exceeds the threshold (default: 250MB, configurable via `AUTO_GC_THRESHOLD_MB`), the watchdog:
   * Clears internal file and migration caches (`migrator.forgetProjectFiles()`).
   * Triggers an immediate V8 major garbage collection cycle (`global.gc()`).
3. **Low Overhead:** In typical development and production benchmarks, Som.js maintains a lean footprint of **40MB to 60MB**, avoiding memory leaks and OOM crashes.

### 27.3 Programmatic API

You can also use the memory manager directly in your custom backend code:
```javascript
const { startAutoGarbageCollector, getMemoryStats } = require('som/server');

// Start with custom threshold:
startAutoGarbageCollector({ thresholdMB: 300, intervalMs: 15000, log: true });

// Read current memory diagnostics:
const stats = getMemoryStats();
console.log(`Heap: ${stats.heapUsedMB} MB / Total: ${stats.heapTotalMB} MB (GC Active: ${stats.gcExposed})`);
```

---

## 28. Security-Hardened Package Management (`som add`)

Unlike standard `npm install`, which allows unvetted scripts to execute arbitrary code during installation, Som.js features a security-first package installer: **`som add`** (alias: `som install`).

### 28.1 Why `som add`?

1. **Zero-Dependency Redundancy Guard:** Prevents unnecessary bloat by warning you if Som.js already implements that capability natively (e.g., `dotenv`, `cors`, `body-parser`, `nodemon`, `cookie-parser`, `multer`, `sqlite3`).
2. **Script Sandboxing (`--ignore-scripts`):** Blocks remote code execution (RCE) attacks hidden in `preinstall` or `postinstall` hooks by sandboxing all untrusted packages by default.
3. **Typosquatting Protection:** Detects and halts common typosquatting attacks (such as `crossenv`, `lodsh`, `axois`, `mongose`).
4. **Registry Age Verification:** Performs real-time HTTPS inspection on the NPM registry; flags brand-new disposable packages published within the last 14 days.
5. **Exact Version Lock:** Enforces `--save-exact` by default to prevent downstream minor-version supply-chain tampering.
6. **Automatic Post-Install Audit:** Silently executes `npm audit` after installation and flags any discovered vulnerabilities.

### 28.2 Usage & Commands

```bash
# Install a verified package:
som add pg mysql2

# Install a development dependency:
som add -D vitest

# Dry-run inspection without installing:
som add --dry-run <package>

# Allow build scripts for trusted packages that require native compilation (e.g. node-gyp):
som add --allow-scripts better-sqlite3

# Bypass redundancy or security warnings:
som add --force dotenv
```

### 28.3 Verified Ecosystem Packages

Som.js recognizes a curated list of battle-tested packages:
* **Databases:** `pg`, `mysql2`, `better-sqlite3`, `redis`, `ioredis`
* **Validation & Utilities:** `zod`, `valibot`, `nanoid`, `uuid`, `dayjs`, `date-fns`
* **Media & Networking:** `sharp`, `ws`
* **Communication & Auth:** `nodemailer`, `resend`, `jsonwebtoken`, `bcryptjs`, `argon2`

---

## 29. Desktop Applications with Electron.js (`som electron`)

Som.js has built-in, first-class support for compiling your web application into a cross-platform desktop application using **Electron.js**.

### 29.1 Initializing Electron Support

Add desktop scaffolding to your project:
```bash
som electron:init
# alias:
som make:electron
```
This generates:
* `electron/main.js`: Main desktop process orchestrating windows, menus, and system trays.
* `electron/preload.js`: Secure IPC context bridge exposing native desktop APIs to your `.som` frontend.

### 29.2 Development & Hot Reload

Launch your desktop app in development mode:
```bash
som electron
# alias:
som electron:dev
```
The desktop window boots instantly with Hot Module Replacement (HMR). Any edits to your `.som` files or backend routes update live inside the desktop window without restarting Electron.

### 29.3 Packaging for Windows, macOS & Linux

Package your application into native installers (`.dmg`, `.exe`, `.AppImage`):
```bash
som electron:build
```
This builds your production bundle into `dist/` and runs `electron-builder` to produce standalone desktop executables.

---

## 30. Vite.js Bundling & Instant HMR (`som vite`)

For teams that prefer the standard Vite.js ecosystem or want instant Rollup tree-shaking alongside Som.js:

```bash
# 1. Initialize Vite configuration:
som vite:init

# 2. Run the Vite development server with backend API proxy:
som vite:dev

# 3. Compile the production bundle:
som vite:build

# 4. Preview the built distribution:
som vite:preview
```

The generated `vite.config.js` includes the custom `tools/vite-plugin-som.js` plugin that compiles `.som` reactive components on the fly while proxying all `/api/*` and `/mcp` calls seamlessly to your Som.js backend.

---

## 31. Advanced ORM: Soft Deletes, Eager Loading & Transactions

The Som.js Active Record ORM (`bin/backend/model.js`) provides an Eloquent-grade API for querying and manipulating relational data with zero external dependencies.

### 31.1 Soft Deletes

Soft deleting allows records to be marked as deleted without physically removing them from the database:

#### 1. Add `deleted_at` to your Migration
```javascript
// database/migrations/2026_01_01_create_posts_table.js
module.exports = async function (schema) {
  await schema.create('posts', (table) => {
    table.id();
    table.string('title');
    table.text('content');
    table.timestamps();
    table.softDeletes(); // Creates deleted_at DATETIME NULL
  });
};
```

#### 2. Enable in your Model
```javascript
// app/Models/Post.js
const { Model } = require('som/server');

class Post extends Model {
  static softDeletes = true;
  static deletedAtColumn = 'deleted_at'; // Default is 'deleted_at'
}

module.exports = Post;
```

#### 3. Soft Delete Queries & Methods
```javascript
// Soft delete a model instance:
const post = await Post.find(1);
await post.delete(); // Sets deleted_at = NOW()

// Query only active records (soft-deleted records are excluded by default):
const activePosts = await Post.all();

// Include soft-deleted records:
const allPosts = await Post.withTrashed().get();

// Retrieve only soft-deleted records:
const trashedPosts = await Post.onlyTrashed().get();

// Restore a soft-deleted record:
await post.restore();
// or via query builder:
await Post.onlyTrashed().where('id', 1).restore();

// Permanently delete from the database:
await post.forceDelete();
```

### 31.2 Eager Loading & N+1 Prevention

Prevent N+1 query bottlenecks by loading related models in a single batched query:

```javascript
// Automatically batches queries for author and nested comments author:
const posts = await Post.with('author', 'comments.author').get();

posts.forEach((post) => {
  console.log(post.title, post.author.name);
  post.comments.forEach((c) => console.log(c.author.name));
});
```

> **Type Robustness:** Som.js uses type-safe primary and foreign key coercion (`String(a) === String(b)`). This guarantees that relational lookups succeed seamlessly across `BigInt`, `UUID`, numeric IDs, and string IDs.

### 31.3 Database Transactions

Ensure atomic data consistency across multiple operations:

```javascript
const { db } = require('som/server');

await db.transaction(async (tx) => {
  const sender = await User.query().where('id', 1).first();
  const receiver = await User.query().where('id', 2).first();

  await sender.update({ balance: sender.balance - 100 });
  await receiver.update({ balance: receiver.balance + 100 });
});
```
If any error occurs inside the transaction callback, all queries are automatically rolled back.

---

## 32. Configuration System (`config/`)

Som.js features a centralized configuration engine that unifies environment variables, configuration files, and defaults into a single repository.

### 32.1 The `config(key, fallback)` Helper

Access any configuration value using dot notation:

```javascript
const { config } = require('somjs/server');

// Retrieve values with fallback defaults
const appName = config('app.name', 'My Som App');
const dbConnection = config('database.default', 'sqlite');
const sessionLifetime = config('session.lifetime', 120);

// Check if a key exists
if (config.has('redis.connections.default')) {
  // ...
}

// Modify configuration at runtime
config.set('app.debug', false);

// Retrieve all configuration items
const allConfig = config.all();
```

### 32.2 Configuration Directory Structure

Configuration files reside in `backend/config/` (or `config/` in root):

```
backend/config/
├── app.js        -> config('app.*')
├── database.js   -> config('database.*')
├── session.js    -> config('session.*')
├── redis.js      -> config('redis.*')
└── auth.js       -> config('auth.*')
```

Example `backend/config/session.js`:

```javascript
module.exports = {
  driver: process.env.SESSION_DRIVER || 'file',
  lifetime: Number(process.env.SESSION_LIFETIME) || 120, // in minutes
  expire_on_close: process.env.SESSION_EXPIRE_ON_CLOSE === 'true',
  inactivity_timeout: Number(process.env.PUBLIC_SESSION_TIMEOUT) || 15, // in minutes
  warning_before: Number(process.env.PUBLIC_SESSION_WARNING) || 2,
  cookie: process.env.SESSION_COOKIE || 'som_session',
  secure: process.env.APP_ENV === 'production',
  http_only: true,
  same_site: 'lax',
};
```

---

## 33. HTML Security, XSS Sanitization & Safe Display

Som.js includes enterprise-grade, zero-dependency HTML sanitization and security utilities to safely accept rich text and display it without XSS risks.

### 33.1 Backend Security Functions

```javascript
const { cleanHtml, stripTags, escapeHtml, SafeHtml, html } = require('somjs/server');

// 1. cleanHtml: Strips <script>, <iframe>, dangerous event handlers (onerror, onload)
// and unsafe protocols (javascript:, vbscript:, data:text/html) while keeping safe tags:
const clean = cleanHtml(userInput);

// 2. stripTags: Removes all HTML tags and returns clean plain text:
const plainText = stripTags('<p>Hello <b>World</b></p>'); // "Hello World"

// 3. escapeHtml / e: Escapes &, <, >, ", ' into HTML entities:
const safeString = escapeHtml('<script>alert(1)</script>');

// 4. SafeHtml & html template tag:
const content = html`<div class="article">${clean}</div>`;
```

### 33.2 Request Helpers

Sanitize user input directly on the `Request` object:

```javascript
class PostController {
  async store(req) {
    // Strips malicious scripts and dangerous event handlers
    const safeBody = req.clean('body');

    // Strips all tags for a clean title
    const plainTitle = req.strip('title');

    // Wraps directly into a SafeHtml object
    const safeHtml = req.html('description');

    await Post.create({ title: plainTitle, body: safeBody });
    return { success: true };
  }
}
```

### 33.3 Model Casts for HTML

Define automatic sanitization on Eloquent-style ORM models:

```javascript
const { Model } = require('somjs/server');

class Article extends Model {
  static casts = {
    content: 'safe_html',     // Automatically sanitizes before DB write; hydrates as SafeHtml
    headline: 'strip_tags',   // Strips all HTML tags before saving
    raw_code: 'escape_html'   // Escapes all special characters
  };
}
```

### 33.4 Safe Display in Frontend Views (`.som`)

In `.som` components, `s-html` automatically filters scripts and unsafe event handlers through `cleanHtml`:

```html
<template>
  <div class="content">
    <!-- Render rich HTML safely with built-in XSS protection -->
    <div s-html="post.content"></div>
  </div>
</template>
```

---

## 34. Session Lifetimes & Frontend Inactivity Watchdog

To prevent unauthorized access when a user leaves their computer unattended, Som.js pairs server-side session lifetime enforcement with a frontend inactivity watchdog.

### 34.1 Environment Configuration (`.env`)

```env
# Server session lifetime in minutes (inactivity timeout)
SESSION_LIFETIME=120
SESSION_EXPIRE_ON_CLOSE=false

# Frontend inactivity timer in minutes (auto-redirect to /login)
PUBLIC_SESSION_TIMEOUT=15
PUBLIC_SESSION_WARNING=2
```

### 34.2 Backend Inactivity Enforcement

In `Authenticate.js`, session tokens are automatically expired when inactive for longer than `SESSION_LIFETIME`:

```javascript
const sessionMinutes = Number(process.env.SESSION_LIFETIME || 120);
const lastUsed = new Date(token.last_used_at || token.created_at).getTime();

if (token.type === 'session' && !token.remember && (Date.now() - lastUsed > sessionMinutes * 60000)) {
  await token.delete();
  abort(401, 'Unauthenticated.');
}
```

### 34.3 Frontend Inactivity Timer (`useInactivityTimer`)

Use `useInactivityTimer` in dashboard layouts or components to detect user idle state and redirect to login:

```html
<template>
  <div class="dashboard">
    <div s-if="warning" class="alert alert-warning">
      Your session will expire in { remainingMinutes } minutes due to inactivity.
      <button @click="extend">Stay Signed In</button>
    </div>
    <slot />
  </div>
</template>

<script>
import { useInactivityTimer } from 'somjs';

export default {
  state: {
    warning: false,
    remainingMinutes: 2
  },
  init() {
    const timer = useInactivityTimer({
      timeout: Number(env.PUBLIC_SESSION_TIMEOUT || 15) * 60 * 1000,
      warningTime: Number(env.PUBLIC_SESSION_WARNING || 2) * 60 * 1000,
      redirect: '/login?reason=inactive',
      onWarning: (info) => {
        this.warning = true;
        this.remainingMinutes = info.remainingMinutes;
      }
    });

    this.extend = () => {
      timer.reset();
      this.warning = false;
    };
  }
}
</script>
```

---

## 35. Interactive Error Monitoring & Debugging (`.som`)

When developing Som.js applications, runtime exceptions and server-side errors are caught by an interactive error monitoring system. Inspired by modern developer diagnostic overlays, Som.js provides split-view stack traces, interactive code snippet inspectors, intelligent solution recommendations, and request telemetry.

### 35.1 Key Capabilities

- **Interactive Stack Explorer**: Collapsible vendor frames (`Expand vendor frames`) keep noise hidden, while your application code frames are prominently highlighted. Clicking any frame in the stack trace dynamically updates the source inspector.
- **Source Code Preview**: Displays code context around the failing line with syntax numbering and error line highlighting.
- **Smart Solution Engine**: Automatically analyzes error messages and generates actionable recommendations (such as detecting method typos, null pointer exceptions, unmigrated database tables, or undefined variables).
- **Comprehensive Context Inspection**: Complete visibility into HTTP methods, request URLs, client IPs, route parameters, query strings, headers, request bodies, session state, and system telemetry.
- **Instant Diagnostic Sharing**: Export formatted error summaries directly to Markdown for GitHub issues or JSON payloads with a single click.

### 35.2 The `.som` Error Monitoring Component

A dedicated reactive component is provided in `templates/errors/ErrorMonitor.som`. You can use it in your error views, error boundaries, or developer testing pages:

```html
<!-- pages/CustomErrorView.som -->
import ErrorMonitor from 'errors/ErrorMonitor.som'

state caughtException = null

<view>
  <error-monitor
    s-if="caughtException"
    error={caughtException}
    status={500}
    title={caughtException.name}
    message={caughtException.message}
    frames={caughtException.frames}
    solution={caughtException.solution}>
  </error-monitor>
</view>
```

#### Supported Props:
| Prop | Type | Description |
|---|---|---|
| `error` | `Object` | The caught Error instance or error payload |
| `status` | `Number` | HTTP status code (e.g. `500`, `404`, `403`) |
| `title` | `String` | Exception name (e.g. `BadMethodCallException`, `TypeError`) |
| `message` | `String` | Detailed error description |
| `frames` | `Array` | Parsed stack frames with file, line, and code snippet data |
| `solution` | `Object` | Optional smart suggestion with `{ title, message }` |
| `request` | `Object` | HTTP request telemetry with method, URL, headers, and params |

### 35.3 Automatic Backend Developer Error Pages

In development mode (`APP_ENV=local` or `APP_DEBUG=true`), all unhandled API and server errors automatically render the interactive debugger when requested from a browser (`text/html`), or return structured JSON containing the parsed stack trace for API clients.

#### Smart Suggestion Examples:
1. **Method Typo Detection**:
   - Error: `Call to undefined method Post.qquery()`
   - Suggestion: `💡 Bad Method Call: Did you mean to call .query() ?`
2. **Null / Undefined Property Access**:
   - Error: `Cannot read properties of undefined (reading 'email')`
   - Suggestion: `💡 Null Reference: Use optional chaining (?.) or verify that the user record exists.`
3. **Missing Database Table**:
   - Error: `SQLITE_ERROR: no such table: posts`
   - Suggestion: `💡 Database Migration: Run 'som db migrate' to apply pending migrations.`

### 35.4 Live Showcase Route (`/error-monitor`)

To test and preview different exception scenarios locally, a developer showcase is available at `/error-monitor` in your new project. You can switch between method typo exceptions, null reference errors, and database migration issues to inspect how stack frames, context tables, and smart suggestions behave.


