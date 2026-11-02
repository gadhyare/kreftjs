// Type definitions for Som.js 3.0.2
// Use from TypeScript or for editor hints in plain JavaScript (// @ts-check).

export interface Signal<T> { value: T }
export interface Derived<T> { readonly value: T }
export interface WritableDerived<T> { value: T }
export type Source<T> = Signal<T> | Derived<T> | (() => T)
export type Stop = () => void

export interface WatchOptions { immediate?: boolean; deep?: boolean; flush?: 'pre' | 'post' | 'sync' }

/** A value loaded with `load x = …` or Som.resource(() => …) */
export interface Resource<T> {
  data: T | null
  loading: boolean
  error: any
  loaded: boolean
  reload(): Promise<T | undefined>
}

/** Every store gets these (hidden from loops and from saving) */
export interface StoreTools<T> {
  readonly $name: string
  /** Put every value back to how it started */
  $reset(): void
  /** Change several values at once */
  $patch(change: Partial<T> | ((store: T) => void)): void
  /** Run fn whenever any value changes */
  $watch(fn: (values: T, store: T) => void): Stop
}
export type Store<T> = T & StoreTools<T>

export interface Storage {
  has(key: string): boolean
  get<T = any>(key: string, fallback?: T): T
  set(key: string, value: any): void
  remove(key: string): void
  clear(): void
  keys(): string[]
}

export interface ApiOptions {
  /** put in front of every address, like '/api' */
  base?: string
  headers?: Record<string, string>
  /** ms, default 30000 */
  timeout?: number
  query?: Record<string, any>
  /** true: get { data, status, headers } instead of only the data */
  full?: boolean
  signal?: AbortSignal
  credentials?: RequestCredentials
  body?: any
  [key: string]: any
}
export interface Api {
  get<T = any>(url: string, options?: ApiOptions): Promise<T>
  delete<T = any>(url: string, options?: ApiOptions): Promise<T>
  post<T = any>(url: string, body?: any, options?: ApiOptions): Promise<T>
  put<T = any>(url: string, body?: any, options?: ApiOptions): Promise<T>
  patch<T = any>(url: string, body?: any, options?: ApiOptions): Promise<T>
  head(url: string, options?: ApiOptions): Promise<any>
  request<T = any>(method: string, url: string, options?: ApiOptions): Promise<T>
  /** change the settings of this client */
  setup(options: ApiOptions): Api
  /** a new client with its own settings */
  create(options: ApiOptions): Api
  before(fn: (request: { method: string; url: string; headers: Record<string, string>; body?: any }) => any): Stop
  after(fn: (response: any) => any): Stop
  onError(fn: (error: ApiError) => any): Stop
}
export declare class ApiError extends Error {
  status: number
  data: any
  /** Standard validation errors: { email: ['The email field is required.'] } */
  errors: Record<string, string[]>
}

export interface Bus {
  on(name: string, fn: (...args: any[]) => void): Stop
  once(name: string, fn: (...args: any[]) => void): Stop
  off(name: string, fn?: (...args: any[]) => void): void
  send(name: string, ...args: any[]): void
}

/** Som.table('posts'): the rows of a table served by `som dev --db` / `som serve --db` */
export interface TableQuery {
  _limit?: number
  _page?: number
  /** columns to sort by; a leading - sorts backwards: '-created_at,title' */
  _sort?: string
  /** search every text column */
  q?: string
  /** column = value, or column_gte / _lte / _gt / _lt / _ne / _like */
  [filter: string]: any
}
export interface Table<T = any> {
  readonly name: string
  all(query?: TableQuery, options?: ApiOptions): Promise<T[]>
  find(id: string | number, options?: ApiOptions): Promise<T>
  /** how many rows match (from the X-Total-Count header) */
  count(query?: TableQuery): Promise<number>
  create(data: Partial<T>, options?: ApiOptions): Promise<T>
  update(id: string | number, data: Partial<T>, options?: ApiOptions): Promise<T>
  patch(id: string | number, data: Partial<T>, options?: ApiOptions): Promise<T>
  remove(id: string | number, options?: ApiOptions): Promise<void>
}

/** Validation rules: 'required|min:3|max:120', 'required|email', 'nullable|integer|between:1,10', or functions */
export type Rule = string | ((value: any, data: any) => true | string | void)
export type Rules = Record<string, string | Rule[]>
export type Errors = Record<string, string[]>
export interface ValidateOptions {
  /** your own words: { 'title.required': 'Write a title', email: '…' } */
  messages?: Record<string, string>
  /** field names in messages: { first_name: 'first name' } */
  names?: Record<string, string>
  /** check only these fields */
  only?: string | string[]
  /** Som.form: show errors while typing from the start, not only after the first submit */
  live?: boolean
}
export interface FormTools<T> {
  readonly $errors: Errors
  readonly $valid: boolean
  readonly $busy: boolean
  readonly $submitted: boolean
  /** the first message for a field, or '' */
  $error(field: keyof T & string): string
  $values(): T
  /** check every field (or one); true when there are no mistakes */
  $check(field?: keyof T & string): boolean
  /** show errors from somewhere else, like an ApiError or { title: ['…'] } */
  $setErrors(errors: Errors | { errors: Errors }): void
  /** back to the starting values (or to new ones), errors cleared */
  $reset(values?: Partial<T>): void
  /** checks the rules; only then calls send(values). A 422 ApiError fills $errors. false when it didn't send or the server refused */
  $submit<R>(send?: (values: T) => Promise<R> | R): Promise<R | true | false>
}
export type Form<T> = T & FormTools<T>

export interface ActionState {
  /** true while the async action is executing */
  readonly loading: boolean
  /** alias for loading */
  readonly pending: boolean
  /** error message string if the action threw an error, or null */
  readonly error: string | null
  /** validation error dictionary if the action threw a 422 ApiError or validation error, or null */
  readonly errors: Record<string, string[]> | null
  /** reset loading, error, and errors back to clean state */
  reset(): void
}

export type ActionFn<A extends any[] = any[], R = any> = ((...args: A) => Promise<R> | R) & ActionState

export interface Selection<T = any> {
  readonly ids: (string | number)[]
  readonly count: number
  readonly all: boolean
  has(idOrItem: string | number | T): boolean
  toggle(idOrItem: string | number | T): void
  toggleAll(): void
  select(...idOrItems: (string | number | T)[]): void
  deselect(...idOrItems: (string | number | T)[]): void
  clear(): void
}

export interface Theme {
  /** 'auto' | 'dark' | 'light' */
  readonly current: 'auto' | 'dark' | 'light'
  /** true when dark mode is currently active (explicit or via system prefers-color-scheme) */
  readonly dark: boolean
  readonly isDark: boolean
  /** toggle between light and dark modes */
  toggle(): void
  /** set mode explicitly to 'dark', 'light', or 'auto' (system preference) */
  set(mode: 'auto' | 'dark' | 'light'): void
}

/* ---------------- components ---------------- */
export type PropType = StringConstructor | NumberConstructor | BooleanConstructor | ArrayConstructor | ObjectConstructor | FunctionConstructor
export interface PropOptions { type?: PropType | PropType[]; default?: any; required?: boolean; validator?: (v: any) => boolean }

export interface Context {
  send: (event: string, ...args: any[]) => void
  attrs: Record<string, any>
  slots: Record<string, any>
  expose: (o: object) => void
}

/** An object component: plain values are state, getters are derived values, functions are actions */
export interface ComponentDef {
  template?: string
  templateUrl?: string
  props?: string[] | Record<string, PropType | PropType[] | PropOptions>
  events?: string[] | Record<string, any>
  components?: Record<string, Component>
  directives?: Record<string, Directive>
  init?: (props: any, ctx: Context) => object | void
  watch?: Record<string, ((value: any, old: any) => void) | string | { handler: Function | string; deep?: boolean; immediate?: boolean }>
  share?: object | (() => object)
  receive?: string[] | Record<string, string | { from?: string; fallback?: any }>
  saved?: string | string[]
  passAttrs?: boolean
  start?(): void | Promise<void>
  ready?(): void
  update?(): void
  show?(): void
  hide?(): void
  destroy?(): void
  destroyed?(): void
  [key: string]: any
}
/** A component: an object, an init function, a lazy() loader or the address of a .som file */
export type Component = ComponentDef | ((props: any, ctx: Context) => object | void) | LazyComponent | string
export interface LazyComponent { __loader: () => Promise<any> }

export interface DirectiveBinding { value: any; oldValue: any; arg?: string; modifiers: Record<string, boolean>; instance: any }
export type Directive = ((el: HTMLElement, binding: DirectiveBinding) => void) | {
  ready?(el: HTMLElement, binding: DirectiveBinding): void
  update?(el: HTMLElement, binding: DirectiveBinding): void
  destroy?(el: HTMLElement, binding: DirectiveBinding): void
}

export interface App {
  readonly version: string
  globals: Record<string, any>
  component(name: string): Component | undefined
  component(name: string, def: Component): App
  directive(name: string): Directive | undefined
  directive(name: string, def: Directive): App
  share(key: string | symbol, value: any): App
  use(plugin: { install(app: App, ...options: any[]): any } | ((app: App, ...options: any[]) => any), ...options: any[]): App
  mount(target: string | Element): any
  unmount(): void
}

/* ---------------- router ---------------- */
export interface RouteRecord {
  path: string
  component?: Component
  name?: string
  /** true: params become props; an object: fixed props; a function: (route) => props */
  props?: boolean | Record<string, any> | ((route: Route) => Record<string, any>)
  meta?: Record<string, any> & { title?: string }
  redirect?: string | RouteTarget | ((route: Route) => string | RouteTarget)
  guard?: Guard
  /** Child routes, shown in the page's own <som-view> */
  children?: RouteRecord[]
  /** The layout for this route and its children: 'admin' → layouts/admin.som, a .som path, a component, or false for none */
  layout?: string | Component | false
}
export interface Route {
  readonly path: string
  readonly fullPath: string
  readonly params: Record<string, string>
  readonly query: Record<string, string | string[]>
  readonly hash: string
  readonly name: string | null
  readonly meta: Record<string, any>
  /** set while an error page shows (an unknown address, or abort()) */
  readonly error: { status: number; message: string } | null
}
export type RouteTarget = string | { path?: string; name?: string; params?: Record<string, any>; query?: Record<string, any>; hash?: string }
export type Guard = (to: Route, from: Route) => boolean | void | RouteTarget | Promise<boolean | void | RouteTarget>
export interface Router {
  readonly route: Route
  /** shows errors/<status>.som for this address: abort(403, 'Only the owner can see this.') */
  abort(status?: number, message?: string): void
  readonly routes: RouteRecord[]
  go(to: RouteTarget | number): Promise<void> | void
  replace(to: RouteTarget): Promise<void>
  back(): void
  forward(): void
  href(to: RouteTarget): string
  resolve(to: RouteTarget): Route
  before(guard: Guard): Stop
  /** a middleware name the routes can use: router.middleware('admin', (to) => isAdmin() || '/') */
  middleware(name: string, fn: RouteMiddleware): Router
  after(fn: (to: Route, from: Route) => void): Stop
  ready(): Promise<void>
  install(app: App): void
}
/** routes/web.som: `Route` is there without an import */
export interface RouteEntry {
  name(name: string): RouteEntry
  title(title: string): RouteEntry
  description(description: string): RouteEntry
  seo(options: SeoOptions | string): RouteEntry
  meta(meta: Record<string, any>): RouteEntry
  layout(layout: string | false): RouteEntry
  middleware(...names: (string | string[])[]): RouteEntry
  withoutMiddleware(...names: string[]): RouteEntry
  props(props: boolean | Record<string, any> | ((route: Route) => Record<string, any>)): RouteEntry
  children(fn: (route: RouteFile) => void): RouteEntry
}
export interface RouteGroup {
  prefix(prefix: string): RouteGroup
  middleware(...names: (string | string[])[]): RouteGroup
  name(name: string): RouteGroup
  layout(layout: string | false): RouteGroup
  title(title: string): RouteGroup
  description(description: string): RouteGroup
  seo(options: SeoOptions | string): RouteGroup
  meta(meta: Record<string, any>): RouteGroup
  group(fn: (route: RouteFile) => void): RouteFile
}
export interface RouteFile {
  /** a page: Route.view('/posts/:id', 'pages/Post.som') — :id reaches the page as a prop */
  view(path: string, component: string | Component): RouteEntry
  get(path: string, component: string | Component): RouteEntry
  redirect(from: string, to: string): void
  fallback(component: string | Component): RouteEntry
  group(attributes: { prefix?: string; middleware?: string | string[]; name?: string; layout?: string | false; meta?: Record<string, any> } | ((route: RouteFile) => void), fn?: (route: RouteFile) => void): RouteFile
  prefix(prefix: string): RouteGroup
  middleware(...names: (string | string[])[]): RouteGroup
  name(name: string): RouteGroup
  layout(layout: string | false): RouteGroup
  title(title: string): RouteGroup
  description(description: string): RouteGroup
  seo(options: SeoOptions | string): RouteGroup
}
/** a middleware for routes: true (or nothing) goes on, false stays, an address goes there instead */
export type RouteMiddleware = (to: Route, from: Route, ...args: string[]) => boolean | string | object | void | Promise<boolean | string | object | void>

export interface RouterOptions {
  /** route objects, or route files: 'routes/web.som' / ['routes/web.som', 'routes/admin.som'] (both can be mixed) */
  routes: RouteRecord[] | string | (string | RouteRecord)[]
  /** the names routes use in .middleware(…): { auth: (to) => auth.token ? true : '/login' } */
  middleware?: Record<string, RouteMiddleware>
  mode?: 'history' | 'hash'
  base?: string
  scrollToTop?: boolean
  /** The layout every page goes in: 'app' → layouts/app.som (a page's `layout x`, or a route's `layout`, wins) */
  layout?: string | Component | false
  /** Names for layouts that live elsewhere: { admin: 'views/AdminShell.som' } */
  layouts?: Record<string, string | Component>
  /** The folder with the error pages (errors/404.som, 403, 500…): unknown addresses show 404.som, abort(…) the others */
  errors?: string | boolean
}

/* ---------------- Som ---------------- */
export interface SomStatic {
  readonly version: string
  /** PUBLIC_ values from .env (also `env` in .som files). Never secrets: those stay in server code */
  readonly env: Readonly<Record<string, string>>
  /** true when running inside an Electron desktop window */
  readonly isElectron: boolean
  /** Native desktop bridge methods (minimize, maximize, dialogs) when running in Electron */
  readonly desktop: DesktopBridge | null
  /** true when running with Vite (dev server or production build) */
  readonly isVite: boolean
  __makeDef(parts: any, values?: any): ComponentDef
  __registerDef(path: string, def: any): any
  __hotDef(id: string, newDef: any): boolean
  /** the error page for this address: abort(404), abort(403, 'Only the owner can see this.') (also `abort` in .som files) */
  abort(status?: number, message?: string): void
  app(root?: Component, props?: Record<string, any>): App
  lazy(loader: () => Promise<any>): LazyComponent
  load(url: string): Promise<ComponentDef>
  compileSom(source: string, url?: string): Promise<ComponentDef>
  /** Strips TypeScript type annotations, interfaces, type aliases and enums from source code while preserving line numbers */
  stripTypeScript(source: string): string
  /** The template engine: a view and data → an HTML string */
  render(view: string, data?: Record<string, any>, options?: { components?: Record<string, Component>; directives?: Record<string, Directive> }): string

  signal<T>(value: T): Signal<T>
  state<T extends object>(obj: T): T
  derived<T>(get: () => T): Derived<T>
  derived<T>(options: { get: () => T; set: (v: T) => void }): WritableDerived<T>
  readonly<T extends object>(obj: T): Readonly<T>
  isSignal(v: any): v is Signal<any>
  isState(v: any): boolean
  read<T>(v: T | Signal<T>): T
  unwrap<T>(v: T): T
  raw<T>(v: T): T

  saved<T>(key: string, initial: T | (() => T)): Signal<T>
  storage: Storage
  api: Api
  ApiError: typeof ApiError
  resource<T>(load: () => Promise<T>, options?: { initial?: T }): Resource<T>
  table<T = any>(name: string, options?: { api?: Api; base?: string }): Table<T>
  /** {} when everything is fine, otherwise { field: ['message', …] } — standard 422 errors shape */
  validate: ((data: Record<string, any>, rules: Rules, options?: ValidateOptions) => Errors) & { messages: Record<string, any> }
  form<T extends object>(values: T, rules?: Rules, options?: ValidateOptions): Form<T>
  /** reactive multi-row selection for tables & bulk actions */
  selection<T = any>(itemsSource: T[] | (() => T[]), key?: string): Selection<T>
  /** reactive theme controller (dark/light/auto, toggle, system detection) */
  theme: Theme
  slug(text: string): string

  watch<T>(source: Source<T> | object | Source<any>[], cb: (value: T, old: T, onCleanup: (fn: () => void) => void) => void, options?: WatchOptions): Stop
  effect(fn: (onCleanup: (fn: () => void) => void) => void, options?: WatchOptions): Stop
  tick(fn?: () => void): Promise<void>
  onCleanup(fn: () => void): void

  store<T extends object>(name: string, obj: T, options?: { saved?: boolean | string[] }): Store<T>
  store<T extends object = any>(name: string): Store<T>
  bus: Bus
  createBus(): Bus
  share(key: string | symbol, value: any): void
  receive<T = any>(key: string | symbol, fallback?: T): T

  onReady(fn: () => void): void
  onUpdate(fn: () => void): void
  onShow(fn: () => void): void
  onHide(fn: () => void): void
  onDestroy(fn: () => void): void
  onDestroyed(fn: () => void): void
  onMounted(fn: () => void): void
  onUnmounted(fn: () => void): void
  onBeforeUnmount(fn: () => void): void
  onUpdated(fn: () => void): void
  /** creates a timer that automatically cleans up when the component is unmounted */
  useInterval(fn: () => void, ms?: number): () => void
  useTimeout(fn: () => void, ms?: number): () => void
  /** inactivity watchdog: tracks user interaction and auto-redirects upon session expiration */
  useInactivityTimer(options?: number | InactivityTimerOptions): { reset: () => void; stop: () => void; timeoutMs: number }

  router(options: RouterOptions): Router
  currentRoute(): Route | null
  currentRouter(): Router | null

  /** updates <title>, <meta>, <link rel="canonical">, openGraph, twitter cards and JSON-LD */
  seo(options: SeoOptions | string): void
  useSeo(options: SeoOptions | string): void

  /** HTML Security & XSS Sanitization utilities */
  cleanHtml(rawHtml: any, options?: { allowedTags?: string[]; allowedAttributes?: Record<string, string[]>; allowedSchemes?: string[] }): string
  sanitizeHtml(rawHtml: any, options?: { allowedTags?: string[]; allowedAttributes?: Record<string, string[]>; allowedSchemes?: string[] }): string
  stripTags(html: any): string
  escapeHtml(str: any): string
  unescapeHtml(str: any): string
  SafeHtml: {
    new (html: string): { __som_safe_html: true; toString(): string; toHtml(): string }
    raw(html: string): { __som_safe_html: true; toString(): string; toHtml(): string }
    clean(rawHtml: any, options?: any): { __som_safe_html: true; toString(): string; toHtml(): string }
    isSafe(value: any): boolean
  }

  // localization & i18n
  locale(lang?: string): string
  fallbackLocale(lang?: string): string
  locales(): string[]
  translations(localeOrDict: string | Record<string, any>, dict?: Record<string, any>): SomStatic
  dir(locale?: string): 'rtl' | 'ltr'
  isRtl(locale?: string): boolean
  __(key: string, replace?: Record<string, any>, locale?: string): string
  t(key: string, replace?: Record<string, any>, locale?: string): string
  trans(key: string, replace?: Record<string, any>, locale?: string): string
  choice(key: string, count: number, replace?: Record<string, any>, locale?: string): string
  transChoice(key: string, count: number, replace?: Record<string, any>, locale?: string): string
  trans_choice(key: string, count: number, replace?: Record<string, any>, locale?: string): string
  hasTranslation(key: string, locale?: string): boolean
  formatNumber(value: number, options?: Intl.NumberFormatOptions, locale?: string): string
  formatCurrency(amount: number, currency?: string, locale?: string): string
  formatDate(date: Date | string | number, options?: Intl.DateTimeFormatOptions, locale?: string): string
  html(strings: TemplateStringsArray, ...values: any[]): { __som_safe_html: true; toString(): string; toHtml(): string }
}

export interface SeoOptions {
  title?: string
  description?: string
  keywords?: string | string[]
  author?: string
  robots?: string
  canonical?: string
  image?: string
  og?: {
    title?: string
    description?: string
    image?: string
    url?: string
    type?: string
    siteName?: string
  }
  twitter?: {
    card?: string
    title?: string
    description?: string
    image?: string
    site?: string
    creator?: string
  }
  schema?: Record<string, any> | string
  jsonLd?: Record<string, any> | string
}

/**
 * server/*.js — every exported function (get, post, put, patch, del, handle) gets this.
 *   /** @param {import('somjs').SomServerContext} ctx *\/
 *   exports.get = (ctx) => ({ hello: ctx.query.name })
 */
export interface SomServerContext {
  method: string
  path: string
  /** [id] parts of the file name: server/users/[id].js → { id: '5' } */
  params: Record<string, string>
  query: Record<string, string>
  /** JSON or form data (null for GET and DELETE) */
  body: any
  headers: Record<string, string | string[] | undefined>
  /** the database from --db or som.config.json, or null */
  db: null | {
    kind: 'sqlite' | 'mysql' | 'postgres'
    query<T = any>(sql: string, params?: any[]): Promise<T[]>
    run(sql: string, params?: any[]): Promise<{ changes: number; insertId: number | null }>
    exec(sql: string): Promise<void>
  }
  /** checks the rules; returns the data, or stops with 422 and { message, errors } */
  validate<T extends Record<string, any>>(data: T, rules: Record<string, string>, options?: ValidateOptions): T
  /** stops with an error: a message, or { field: ['message'] } */
  fail(status: number, detail?: string | Record<string, string[]>): never
  /** answer with another status or headers: return ctx.reply(201, row) */
  reply(status: number, data?: any, headers?: Record<string, string>): any
  /** process.env, with the values from .env */
  env: Record<string, string | undefined>
  req: any
  res: any
}

export interface DesktopBridge {
  readonly isElectron: boolean
  getInfo(): Promise<{ name: string; version: string; platform: string; arch: string; isPackaged: boolean }>
  minimize(): Promise<void>
  maximize(): Promise<void>
  close(): Promise<void>
  showMessageBox(options: any): Promise<any>
  showOpenDialog(options: any): Promise<any>
  showSaveDialog(options: any): Promise<any>
}

export interface InactivityTimerOptions {
  timeout?: number
  warningTime?: number
  redirect?: string
  events?: string[]
  onWarning?: (info: { remainingMs: number; remainingMinutes: number }) => void
  onTimeout?: () => void
}

declare const Som: SomStatic
export default Som

declare global {
  // the <script src="som.js"> global
  var Som: SomStatic
  interface Window {
    somDesktop?: DesktopBridge
  }
}

declare module '*.som' {
  const component: import('./som.js').ComponentDef
  export default component
}

