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
| **Tooling** | `kreft dev` with hot reload that keeps state, DevTools, an error monitor, `kreft build`, TypeScript, Vite and Electron support. |
| **Security by default** | Escaped views, CSRF protection, hashed passwords, rate limits, hardened package installs. See [Security overview](#security-overview). |

### How the docs are organised

1. **Start here** gets a project running.
2. **The Kreft language** is everything in the browser.
3. **Backend** is everything on the server.
4. **Tooling** covers the command line, building and deploying.
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
kreft --version     # for example 0.0.22-beta
kreft about         # Kreft and Node.js versions, this project's settings and drivers
kreft list          # every command your version has
```

`kreftjs` is a longer name for the same command; both work.

### Set up your editor

```bash
kreft vscode
```

installs colors and snippets for `.kreft` files in VS Code (also Cursor and VSCodium). Restart the editor afterwards.

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
| `kreft new my-app` | Makes a project (`--js`, `--ts`, `--db sqlite`, `--ui tailwind`, `--no-auth`). |
| `kreft dev` | Development server with hot reload (`--port`, `--host`, `--db`, `--api`, `--server`, `--backend`, `--seed`, `--no-hot`, `--gc`). |
| `kreft build` | Compiles the app into plain files in `dist/` (`--out`, `--base`, `--prerender`). |
| `kreft serve [dist]` | Runs a built app for real users. Answers everyone, serves only the tables you list. |
| `kreft update` | Updates npm packages and refreshes `kreftjs.js` (`--core`, `--npm`, `--latest`, `--check`). |
| `kreft add <package>` | A safer `npm install`. See [Packages](#packages). |
| `kreft about`, `kreft env`, `kreft log`, `kreft tinker` | Versions and folders, environment, logs, a console with your models (`await User.count()`). |
| `kreft down --secret=x` / `kreft up` | Maintenance mode: visitors get `503`, and `/x` lets you in. |
| `kreft vscode` | Installs colors, snippets and folding for `.kreft` files in VS Code, Cursor and VSCodium. |
| `kreft electron:dev`, `kreft electron:build` | A desktop window, and installers: [Desktop apps](#desktop-apps-with-electron). |
| `kreft mobile:init`, `mobile:build`, `mobile:open`, `mobile:dev` | iOS and Android apps with Capacitor: [Mobile apps](#mobile-apps-ios-and-android). |
| `kreft mobile:ui`, `mobile:icons`, `mobile:splash` | The phone UI kit, the app icon and the splash screen: [The phone UI kit](#the-phone-ui-kit). |
| `kreft make:home --mobile` / `--desktop` | An app-style home page: [Home pages made for apps](#home-pages-made-for-apps). |
| `kreft build --pwa` | Also writes a manifest and a service worker (an installable site that works offline). |

### Generators and database

| Group | Commands |
|---|---|
| `make:` | `model`, `controller`, `page`, `routes`, `migration`, `seeder`, `factory`, `middleware`, `request`, `resource`, `policy`, `rule`, `job`, `event`, `listener`, `mail`, `notification`, `observer`, `command`, `lang`, `errors`, `admin`, `electron`, `mobile`, `home`, `vite` |
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

**Kreft DevTools.** The **S** button in the corner (or <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd>) opens a panel:

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
npm version prerelease --preid=beta   # or: patch, minor (changes package.json and makes a git tag)
npm publish --tag latest       # needs npm login; the package is then installed with kreftjs@latest
npm run build                  # then upload dist/kreftjs-com as above
```

Check that people get it with `npm view kreftjs version` and a fresh `npm install -g kreftjs@latest`.

**Trying a version before everyone gets it.** Publish it under another tag. `latest` and `beta` stay on the old version, so nobody gets it by accident:

```bash
npm publish --tag mobile-test --access public     # npm asks you to approve in the browser
npm install -g kreftjs@mobile-test                  # you, on any computer
kreft --version                                     # shows the new number
npm dist-tag add kreftjs@0.0.26-beta beta           # when it is good: the tag everyone uses moves
```

`--access public` is needed because this package's `package.json` has `publishConfig.access` set to `restricted` (left from an old scoped package), which npm refuses for a plain package name. A version number can be published only once, so the next try is the next number. To test the folder you are in without publishing anything, run `npm link` (undo with `npm unlink -g kreftjs`). `kreft --version` after `npm install -g` reads the globally installed package, not the repository.

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

## Vite and Electron

**Vite.** If your team prefers the Vite ecosystem, Kreft has a plugin that compiles `.kreft` files on the fly:

```bash
kreft vite:init       # writes vite.config.js with the Kreft plugin
kreft vite:dev        # Vite dev server with the backend API proxied
kreft vite:build      # optimised bundle with code splitting
kreft vite:preview
```

**Electron.** Turn the same app into a desktop application. See [Desktop apps with Electron](#desktop-apps-with-electron) below.

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
kreft electron:init           # alias: kreft make:electron
npm install                     # installs electron and electron-builder
```

### Commands

| Command | What it does |
|---|---|
| `kreft electron:init` | Writes `electron/main.js`, `electron/preload.js` and the app icon `build/icon.png`, and adds the scripts (including `electron:build:mac`, `:win`, `:linux` and `:all`), the `electron` and `electron-builder` dev dependencies and a `build` block to `package.json`. Files that already exist are never overwritten. It also removes the Google Fonts links from `index.html`, so the app starts without a network. |
| `kreft electron:dev` | Opens the app in a desktop window only: no browser opens and no URL is printed. The dev server runs hidden on a private port of your computer that only the window uses (hot reload works). Closing the window stops the server. Flags after the command go to the dev server. |
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
| Add desktop support | `kreft new my-app --electron`, or `kreft electron:init` in an existing app, then `npm install` |
| Open the app in its window | `kreft electron` (no browser, no URL) |
| Open DevTools | `kreft electron --devtools=bottom`, `ELECTRON_DEVTOOLS=right`, or F12 |
| Show, auto-hide or hide the menu | `ELECTRON_MENU=show`, `auto` or `hide`; `kreftDesktop.setMenu('hide')` |
| Change the icon | Replace `build/icon.png` (square PNG, 512×512 or bigger) |
| Change the app name | `build.productName` and `build.appId` in `package.json` |
| Make an installer | `npm run electron:build:mac`, `:win`, `:linux` or `:all` |
| Get help in the terminal | `kreft electron:help` |

### Project layout

```text
my-app/
├── electron/
│   ├── main.js        the main process: creates the window, handles the desktop functions
│   └── preload.js     the safe bridge exposed to your pages as window.kreftDesktop
├── dist/              the static build the packaged app loads
├── dist-electron/     installers written by electron-builder
└── package.json       "main": "electron/main.js" and the "build" block
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

1. In `electron/main.js`, add a handler: `ipcMain.handle('app:ping', () => 'pong')`.
2. In `electron/preload.js`, add it to the `desktop` object: `ping: () => ipcRenderer.invoke('app:ping')`.
3. Call `Kreftjs.desktop.ping()` from a page.

Expose one narrow function per task. Never pass a path or a command from a page straight to the file system or a shell without checking it in `main.js`.

### DevTools

They are hidden by default. Open them with a flag or an environment variable:

```bash
kreft electron:dev --devtools          # right side
kreft electron:dev --devtools=bottom   # bottom, left or detach
kreft electron:dev --no-devtools
ELECTRON_DEVTOOLS=bottom kreft electron:dev
```

In development, F12 or Ctrl+Shift+I toggles them.

### The window menu

Set the menu bar when you start the app:

```bash
ELECTRON_MENU=show kreft electron   # default: the menu bar is visible
ELECTRON_MENU=auto kreft electron   # hidden, press Alt to show it (Windows and Linux)
ELECTRON_MENU=hide kreft electron   # no menu at all
```

Or change it while the app runs, from a page:

```js
window.kreftDesktop.setMenu('hide')   // 'show' | 'auto' | 'hide'
window.kreftDesktop.getMenu()         // the current mode
```

On macOS the menu lives in the top bar of the screen, so `show` and `auto` look the same, and `hide` keeps only the app-name menu (with Quit) because macOS needs one. Apps created before 0.0.18 have the old `electron/main.js` without this: delete it and run `kreft electron:init` (copy your own changes back first). For your own menu (File, Edit…), call `Menu.buildFromTemplate([...])` and `Menu.setApplicationMenu(...)` in `electron/main.js`.

### The app icon

`kreft electron:init` copies the Kreft logo to `build/icon.png`. Replace it with your own square PNG, 512×512 or bigger. The window uses it, and electron-builder makes the `.icns` (macOS) and `.ico` (Windows) files from it. Set the app name with `build.productName` and `build.appId` in `package.json`, electron-builder also needs `description`, `homepage`, an `author` with an e-mail and `build.linux.maintainer` (for `.deb` and `.rpm`). `kreft electron:init` and `kreft electron:build` fill in the missing ones (from your git name and e-mail); check them before you release.

### Packaging and installers

```bash
kreft electron:build --mac                 # .dmg and .zip
kreft electron:build --win                 # NSIS installer and portable .exe
kreft electron:build --linux               # AppImage, .deb and .rpm
kreft electron:build --mac --win --linux   # all three
kreft electron:build --all                 # the same as the line above
```

The `package.json` scripts do the same: `npm run electron:build:mac`, `:win`, `:linux` and `:all`.

`electron:build` writes to `dist-electron/`. Flags go to electron-builder, for example `kreft electron:build --mac --arm64`. The defaults in the `build` block of `package.json` are:

| System | Targets |
|---|---|
| Windows | `nsis` installer (choose the folder), `portable` |
| macOS | `dmg`, `zip` |
| Linux | `AppImage`, `deb`, `rpm` |

Edit `appId`, `productName` and the targets there. Build for each system on that system: a macOS installer needs a Mac (on a Mac, the Linux `AppImage` and the Windows installers build, but `.deb` and `.rpm` fail: build those on Linux, or remove them from `build.linux.target`). Code signing and notarisation (macOS) or a signing certificate (Windows) are set up through electron-builder (electron.build/code-signing) and are needed before you give the app to other people; unsigned macOS apps show a Gatekeeper warning.

The packaged app loads the built `dist/index.html` and does not start a backend. A frontend-only app works as is; a full-stack app (login, database) does not work once installed.

### `npm run build` or `electron:build`?

Adding Electron does not change `npm run build`. The two commands make different things:

| Command | What it makes | Use it for |
|---|---|---|
| `npm run build` | The website in `dist/`, with paths that start at `/` (the `docs/` folder is included). | Putting the app on a web server. |
| `npm run electron:build` | The same site built with `--base ./` so it opens from a file, then an installer in `dist-electron/`. | Giving the app to people as a desktop program. |

A `dist/` made by `npm run build` shows a white window if you open it in Electron, because its paths start at `/`. Run `electron:build` (or `kreft build --base ./`) first. Doing both is fine: `electron:build` rewrites `dist/`, so run `npm run build` again before you deploy the website.

### Security

The window follows Electron's security guidance:

- `contextIsolation` and `sandbox` are on; `nodeIntegration` is off.
- Links to other sites open in the system browser, and new windows are denied.
- Navigation away from the app is blocked: only the dev server (development) or files inside `dist/` (packaged) can load.
- The bridge exposes named functions only, with the option lists described above.

Do not turn these off to make something work. Add a bridge function instead.

### Troubleshooting

| Problem | Fix |
|---|---|
| `Electron is not installed locally` | `kreft add -D electron` |
| `electron-builder is not installed` | `kreft add -D electron-builder` |
| A white window in the packaged app | Run `electron:build` again; the build must use `--base ./`. Check that `dist/index.html` exists. |
| API calls fail in the packaged app | The backend is not bundled. Set an absolute `base` for the API client (see above). |
| The window opens before the server is ready | It waits up to 15 seconds. Check the terminal for a dev server error. |
| Port 8000 is taken | Nothing to do: the hidden server picks the next free port. |

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
| `kreft mobile:run [--android] [--ios] [--target id]` | The one command to see your app: builds, then installs and starts it on an emulator or phone (Capacitor lists the devices and starts the one you choose). Run it again after every change |
| `kreft mobile:setup` | First-run setup: `key:generate` (only when `APP_KEY` is missing), `storage:link` and `migrate`. Safe to run again. `mobile:dev` runs it for you |
| `kreft mobile:open` | Opens the native project |
| `kreft mobile:dev` | Runs on a device or emulator with live reload from your dev server (same Wi-Fi) |
| `kreft mobile:ui [--layout] [--gallery]` | Adds the [phone UI kit](#the-phone-ui-kit) to an app |
| `kreft mobile:icons` / `kreft mobile:splash` | Makes the [app icon and splash screens](#app-icon-and-splash-screen) |
| `kreft mobile:help` | Lists these commands in the terminal |

**Building the Android app needs Java 21, 22 or 23** (Capacitor 7 uses Gradle 8.11). An older Java fails with `invalid source release: 21`, and a newer one (24, 25, 26) fails with `Unsupported class file major version`. The `kreft mobile:*` commands pick a fitting Java by themselves: the one Gradle already downloaded, an installed JDK, or the one inside Android Studio (they print `Using Java 21 from …`). If none is found they say so; install one with `brew install --cask temurin@21` (or from adoptium.net), or point to it yourself: `export JAVA_HOME="/path/to/jdk-21"`. Running from Android Studio (`kreft mobile:open --android`) needs no extra setup. The iOS Simulator needs a full Xcode install, not only the command line tools.

**The backend does not run inside the phone.** Run it on a server and give the app its address with `--api-url` (written to `.env` as `PUBLIC_API_URL`), then in your code:

```js
Kreftjs.api.setup({ base: Kreftjs.env.PUBLIC_API_URL, token: () => Kreftjs.storage.get('token') })
```

Use API tokens for sign-in in the app, not cookie sessions.

### Run it on an emulator, a simulator or a phone

`kreft mobile:build` only prepares the native project: it builds the site and copies it into `android/` or `ios/`. **To see the app, run `kreft mobile:run --android` (or `--ios`) inside your app folder**: it builds, installs the app on the emulator or phone and starts it. Or open the project yourself in Android Studio or Xcode, or use `kreft mobile:dev` for live reload.

**Android emulator** (Mac, Windows, Linux):

1. Install [Android Studio](https://developer.android.com/studio). In **Device Manager** choose **Create Device**, pick a Pixel phone and a recent system image, and start it.
2. In your app folder: `kreft mobile:run --android`. After each change to your code, run it again.
3. Prefer Android Studio? `kreft mobile:build --android`, then `kreft mobile:open --android` and press the green **Run** button.

**iOS Simulator** (Mac only):

1. Install **Xcode** from the App Store and open it once to accept the license. Then run `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`.
2. In your app folder: `kreft mobile:run --ios`. Or `kreft mobile:build --ios`, then `kreft mobile:open --ios`; in Xcode choose a simulator (for example an iPhone) at the top and press **Run**. The first build may ask you to install CocoaPods.

**A real phone.** Android: turn on *Developer options* and *USB debugging*, plug it in, and choose it in Android Studio's device list. iPhone: plug it in, trust the computer, choose it in Xcode and pick a signing team (a free Apple ID works for testing).

**Live reload.** `kreft mobile:dev --android` (or `--ios`) starts your dev server on the network and runs the app on the emulator or phone, so a saved change shows up without building again. The phone must reach your computer, so use the same Wi-Fi. It needs the Capacitor tools from `npm install`.

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

A website's welcome page is not what an app should open on. `kreft new my-app --mobile` writes a **phone home screen** (top bar, shortcut cards, a bottom tab bar, a card that shows the touch events), and `kreft new my-app --electron` writes a **desktop workspace** (sidebar, toolbar with search, info cards, shortcuts). With both flags, `pages/Home.kreft` shows the desktop one inside the Electron window and the phone one everywhere else.

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
| Platform | `native.platform()` is `'android'`, `'ios'`, `'electron'` or `'web'`; `isNative()`, `isDesktop()`, `isWeb()`. |
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
| `This folder is not a Kreft app` | You ran a `mobile:` command outside an app, for example in the folder of the framework itself. Go into your app first: `cd my-app`. The command changes nothing when it refuses. |
| `Capacitor is not installed. Run: npm install` | Run `npm install` in the app. |
| The simulator needs a full Xcode install | Install Xcode, then `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`. |
| Nothing opens after `kreft mobile:build` | It only prepares the project. Run `kreft mobile:open --android` and press **Run**, or use `kreft mobile:dev`. |
| The page loads but data and sign-in fail | The app is calling an address the phone cannot reach. Build with `--api-url` and read the table in [Run it on an emulator, a simulator or a phone](#run-it-on-an-emulator-a-simulator-or-a-phone). |
| Content sits under the status bar | Android 15 and newer draw apps edge to edge. `capacitor.config.json` from `kreft mobile:init` has `android.adjustMarginsForEdgeToEdge: "force"`; add it to an older config. |
| `kreft mobile:icons` fails | The tool downloads itself the first time and needs the internet. The picture must be a PNG (1024x1024 for icons, 2732x2732 for the splash screen). |
| `kreft --version` shows an old number | The `kreft` command is the globally installed one. Update it: `npm install -g kreftjs@latest` (or the tag you published). |

### Mobile: what to know

- The app is your web app in the phone's WebView. It is not a second, native renderer, so very heavy animation or huge lists need care (use `edge-virtual-list` and `edge-lazy-grid`).
- The backend never runs inside the phone. Use `--api-url`, API tokens for sign-in (not cookie sessions) and CORS on your server for the app.
- Android builds work on Mac, Windows and Linux. iOS builds need a Mac with Xcode.
- Camera, location and photo library on iPhone need a usage text in `ios/App/App/Info.plist`.
- The native plugins are checked in the Android emulator; iOS has not been run in a simulator by the framework's own tests.

## Packages

`kreft add` is a safer `npm install`:

```bash
kreft add pg mysql2                 # install packages
kreft add -D vitest                 # a development dependency
kreft add --dry-run some-package    # inspect without installing
kreft add --allow-scripts better-sqlite3   # allow build scripts for a trusted native package
kreft add --force dotenv            # ignore a warning
```

What it checks before and after installing:

1. **Redundancy.** It warns when Kreft already does the job natively (`dotenv`, `cors`, `body-parser`, `node-fetch`…).
2. **Install scripts.** Packages install with `--ignore-scripts`, so a `postinstall` hook cannot run code, unless you pass `--allow-scripts` or the package is on the short list of known native-build packages.
3. **Typosquatting.** Names close to popular ones (`axois`, `lodsh`, `crossenv`) stop the install.
4. **Look-alike characters.** Names with non-ASCII or homoglyph characters are refused, as are shell metacharacters.
5. **Registry age.** A package published in the last 14 days is flagged.
6. **Exact versions.** `--save-exact` is the default (`--no-exact` to turn it off).
7. **Audit.** `npm audit` runs afterwards and reports findings.

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

> [!NOTE]
> Kreft does not replace a security review. For regulated or high-risk systems, have the app, its infrastructure and its dependencies reviewed by someone who does that professionally.

## Known limits

- Without a build, views are compiled in the browser with `new Function`, which a strict Content-Security-Policy blocks. Use `kreft build` for production.
- Inside a view, `<` directly followed by a letter starts a tag, so write `{a < b}` with a space.
- The memory of which two-factor codes were already used, and login tickets, is kept per process. Behind several servers, a code can be replayed once on each. The per-account lockout (kept in the cache) still limits guessing.
- The sanitizer removes unsafe markup; it is not a substitute for choosing carefully what HTML you show.
- `--prerender` makes static HTML at build time. On a running server whole pages are drawn only for crawlers and link previews; every other visitor gets the page drawn by the browser, and an address the app does not have answers 200 (the app shows its own 404 page) unless `seo.js` says otherwise.
- `.kreft` files must be served over `http://` or `https://`, not opened from `file://`.

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
