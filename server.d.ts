// Types for require('kreftjs/server'): routes, controllers, models, migrations, seeders, middleware.

export type Rules = Record<string, string | string[]>

export declare class Request {
  method: string
  path: string
  params: Record<string, string>
  query: Record<string, string>
  body: any
  headers: Record<string, string | string[] | undefined>
  /** set by your auth middleware */
  user: any
  readonly url: string
  raw: any
  res: any
  ip(): string
  header(name: string, fallback?: string | null): string | null
  bearerToken(): string | null
  route(name: string, fallback?: any): any
  all(): Record<string, any>
  input(key?: string, fallback?: any): any
  has(key: string | string[]): boolean
  filled(key: string | string[]): boolean
  missing(key: string): boolean
  only(...keys: string[]): Record<string, any>
  except(...keys: string[]): Record<string, any>
  boolean(key: string, fallback?: boolean): boolean
  integer(key: string, fallback?: number): number
  string(key: string, fallback?: string): string
  slug(key: string, sep?: string): string
  uniqueSlug(target: any, column: string, key: string, sep?: string): Promise<string>
  /** Clean untrusted HTML input by stripping scripts and dangerous attributes */
  clean(key: string, options?: CleanHtmlOptions): string
  /** Strip all HTML tags from input returning plain text */
  strip(key: string): string
  /** Retrieve input wrapped in SafeHtml object */
  html(key: string, options?: CleanHtmlOptions): SafeHtml
  isMethod(method: string): boolean
  expectsJson(): boolean
  /** Request locale detected from query (?lang=), cookie, Accept-Language header, or default */
  locale(): string
  setLocale(locale: string): this
  /** Validation rules, plus unique:table,column[,ignoreId] and exists:table,column. Throws a 422 when they fail. */
  validate<T extends Record<string, any> = Record<string, any>>(rules: Rules, messages?: Record<string, string>, names?: Record<string, string>): Promise<T>
  validated(): Record<string, any>
  /** the user 'auth' found (null without it) and the token or browser session they used */
  accessToken: any
  /** a cookie from the browser */
  cookie(name: string, fallback?: string | null): string | null
  /** an upload (multipart/form-data): req.file('avatar') */
  file(name: string): UploadedFile | null
  hasFile(name: string): boolean
  files: Record<string, UploadedFile | UploadedFile[]>
  /** policies and gates */
  can(ability: string, ...args: any[]): Promise<boolean>
  cannot(ability: string, ...args: any[]): Promise<boolean>
  /** 403 when the user may not */
  authorize(ability: string, ...args: any[]): Promise<void>
  /** CSRF token for the current session/request */
  csrfToken(): string
  /** checks if the request has a valid CSRF token */
  hasValidCsrfToken(): boolean
}

export declare class Response {
  body: any
  statusCode: number
  headers: Record<string, string>
  status(code: number): this
  header(name: string, value: string): this
  withHeaders(headers: Record<string, string>): this
  json(body: any, status?: number): this
  /** Set-Cookie: HttpOnly, SameSite=Lax, Path=/ by default (Secure on https) */
  cookie(name: string, value: string, options?: { maxAge?: number; path?: string; httpOnly?: boolean; sameSite?: 'Lax' | 'Strict' | 'None'; secure?: boolean; domain?: string }): this
  withoutCookie(name: string, options?: { path?: string }): this
}
export declare function response(body?: any, status?: number, headers?: Record<string, string>): Response
export declare namespace response {
  function json(body: any, status?: number, headers?: Record<string, string>): Response
  function noContent(): Response
}
export declare function noContent(): Response
export declare function abort(status: number, message?: string): never
export declare function abortIf(condition: any, status: number, message?: string): void
export declare function abortUnless(condition: any, status: number, message?: string): void

type Handler = (req: Request, ...params: string[]) => any
type Action = Handler | [any, string] | string
type MiddlewareSpec = string | ((req: Request, next: (req?: Request) => Promise<Response>, ...args: string[]) => any) | { handle(req: Request, next: (req?: Request) => Promise<Response>, ...args: string[]): any } | (new () => { handle(req: Request, next: (req?: Request) => Promise<Response>, ...args: string[]): any })

export interface RouteEntry {
  methods: string[]
  uri: string
  routeName: string
  middleware(...m: (MiddlewareSpec | MiddlewareSpec[])[]): this
  withoutMiddleware(...m: MiddlewareSpec[]): this
  name(name: string): this
  where(param: string | Record<string, string>, pattern?: string): this
  whereNumber(param: string): this
}
interface PendingGroup {
  prefix(prefix: string): this
  middleware(...m: (MiddlewareSpec | MiddlewareSpec[])[]): this
  name(name: string): this
  namespace(namespace: string): this
  group(fn: (route: RouteStatic) => void): RouteStatic
  get(uri: string, action: Action): RouteEntry
  post(uri: string, action: Action): RouteEntry
  put(uri: string, action: Action): RouteEntry
  patch(uri: string, action: Action): RouteEntry
  delete(uri: string, action: Action): RouteEntry
  apiResource(name: string, controller: any, options?: ResourceOptions): ResourceRoutes
  csrfCookie(uri?: string): RouteStatic
}
interface ResourceOptions { only?: string[]; except?: string[]; parameter?: string }
interface ResourceRoutes {
  routes: RouteEntry[]
  middleware(...m: (MiddlewareSpec | MiddlewareSpec[])[]): ResourceRoutes
  name(prefix: string): ResourceRoutes
  names(names: string | Record<string, string>): ResourceRoutes
  only(...methods: (string | string[])[]): ResourceRoutes
  except(...methods: (string | string[])[]): ResourceRoutes
}
export interface RouteStatic {
  get(uri: string, action: Action): RouteEntry
  post(uri: string, action: Action): RouteEntry
  put(uri: string, action: Action): RouteEntry
  patch(uri: string, action: Action): RouteEntry
  delete(uri: string, action: Action): RouteEntry
  options(uri: string, action: Action): RouteEntry
  any(uri: string, action: Action): RouteEntry
  match(methods: string[], uri: string, action: Action): RouteEntry
  csrfCookie(uri?: string): RouteEntry
  /** index, store, show, update, destroy */
  apiResource(name: string, controller: any, options?: ResourceOptions): ResourceRoutes
  resource(name: string, controller: any, options?: ResourceOptions): ResourceRoutes
  prefix(prefix: string): PendingGroup
  middleware(...m: (MiddlewareSpec | MiddlewareSpec[])[]): PendingGroup
  name(name: string): PendingGroup
  namespace(namespace: string): PendingGroup
  group(attributes: { prefix?: string; middleware?: MiddlewareSpec | MiddlewareSpec[]; as?: string; name?: string; namespace?: string } | ((route: RouteStatic) => void), fn?: (route: RouteStatic) => void): RouteStatic
  fallback(action: Action): RouteEntry
  url(name: string, params?: Record<string, any>): string
  list(): RouteEntry[]
}
export declare const Route: RouteStatic

export declare class Raw { sql: string; params: any[] }
export declare function raw(sql: string, params?: any[]): Raw

/** An Array with collection utility methods; every get() returns one */
export declare class Collection<T = any> extends Array<T> {
  static make<T>(items?: Iterable<T>): Collection<T>
  all(): T[]
  toArray(): any[]
  count(): number
  isEmpty(): boolean
  isNotEmpty(): boolean
  first(fn?: (item: T) => boolean): T | null
  last(fn?: (item: T) => boolean): T | null
  firstWhere(key: string, op?: any, value?: any): T | null
  pluck<V = any>(key: string): Collection<V>
  pluck(key: string, by: string): Record<string, any>
  where(key: string, op: any, value?: any): Collection<T>
  whereIn(key: string, values: any[]): Collection<T>
  whereNotIn(key: string, values: any[]): Collection<T>
  whereNull(key: string): Collection<T>
  whereNotNull(key: string): Collection<T>
  reject(fn: (item: T, i: number) => boolean): Collection<T>
  contains(key: any, value?: any): boolean
  sum(key?: string | ((item: T) => number)): number
  avg(key?: string | ((item: T) => number)): number | null
  average(key?: string): number | null
  min(key?: string): any
  max(key?: string): any
  sortBy(key: string | ((item: T) => any), desc?: boolean): Collection<T>
  sortByDesc(key: string | ((item: T) => any)): Collection<T>
  groupBy(key: string | ((item: T) => any)): Record<string, Collection<T>>
  keyBy(key: string | ((item: T) => any)): Record<string, T>
  countBy(key: string | ((item: T) => any)): Record<string, number>
  mapWithKeys(fn: (item: T, i: number) => Record<string, any>): Record<string, any>
  unique(key?: string): Collection<T>
  chunk(size: number): Collection<Collection<T>>
  take(n: number): Collection<T>
  skip(n: number): Collection<T>
  partition(fn: (item: T, i: number) => boolean): Collection<Collection<T>>
  implode(glue?: string, key?: string): string
  each(fn: (item: T, i: number) => any): this
  tap(fn: (c: this) => void): this
  pipe<R>(fn: (c: this) => R): R
  random(): T | null
  shuffle(): Collection<T>
  only(...keys: string[]): Collection<any>
  except(...keys: string[]): Collection<any>
}
export declare function collect<T>(items?: Iterable<T>): Collection<T>

export interface Paginated<T> { data: Collection<T>; total: number; per_page: number; current_page: number; last_page: number; from: number | null; to: number | null }

export declare class Builder<T = any> {
  select(...columns: (string | Raw)[]): this
  addSelect(...columns: (string | Raw)[]): this
  selectRaw(sql: string, params?: any[]): this
  distinct(): this
  join(table: string, first: string, op: string, second?: string): this
  leftJoin(table: string, first: string, op: string, second?: string): this
  rightJoin(table: string, first: string, op: string, second?: string): this
  crossJoin(table: string): this
  where(column: string | Record<string, any> | ((q: Builder<T>) => void), operator?: any, value?: any): this
  orWhere(column: string | ((q: Builder<T>) => void), operator?: any, value?: any): this
  whereNot(column: string, value: any): this
  whereColumn(first: string, op: string, second?: string): this
  whereIn(column: string, values: any[] | Builder): this
  whereNotIn(column: string, values: any[] | Builder): this
  orWhereIn(column: string, values: any[]): this
  whereNull(column: string): this
  whereNotNull(column: string): this
  orWhereNull(column: string): this
  orWhereNotNull(column: string): this
  whereBetween(column: string, range: [any, any]): this
  whereNotBetween(column: string, range: [any, any]): this
  whereLike(column: string, value: string): this
  orWhereLike(column: string, value: string): this
  whereDate(column: string, op: any, value?: any): this
  whereYear(column: string, op: any, value?: any): this
  whereMonth(column: string, op: any, value?: any): this
  whereExists(fn: ((q: Builder) => void) | Builder): this
  whereNotExists(fn: ((q: Builder) => void) | Builder): this
  whereRaw(sql: string, params?: any[]): this
  orWhereRaw(sql: string, params?: any[]): this
  when(condition: any, fn: (q: this, value: any) => void, otherwise?: (q: this) => void): this
  unless(condition: any, fn: (q: this, value: any) => void, otherwise?: (q: this) => void): this
  tap(fn: (q: this) => void): this
  groupBy(...columns: string[]): this
  having(column: string, op: any, value?: any): this
  orHaving(column: string, op: any, value?: any): this
  havingRaw(sql: string, params?: any[]): this
  orderBy(column: string, direction?: 'asc' | 'desc'): this
  orderByDesc(column: string): this
  orderByRaw(sql: string, params?: any[]): this
  latest(column?: string): this
  oldest(column?: string): this
  inRandomOrder(): this
  reorder(): this
  limit(n: number): this
  take(n: number): this
  offset(n: number): this
  skip(n: number): this
  forPage(page: number, perPage?: number): this
  get(): Promise<Collection<T>>
  first(): Promise<T | null>
  firstOrFail(): Promise<T>
  sole(): Promise<T>
  find(id: any): Promise<T | null>
  value(column: string): Promise<any>
  pluck(column: string): Promise<Collection<any>>
  pluck(column: string, key: string): Promise<Record<string, any>>
  exists(): Promise<boolean>
  doesntExist(): Promise<boolean>
  count(column?: string): Promise<number>
  max(column: string): Promise<number | null>
  min(column: string): Promise<number | null>
  sum(column: string): Promise<number>
  avg(column: string): Promise<number | null>
  paginate(perPage?: number, page?: number): Promise<Paginated<T>>
  simplePaginate(perPage?: number, page?: number): Promise<{ data: Collection<T>; per_page: number; current_page: number; has_more: boolean }>
  chunk(size: number, fn: (rows: Collection<T>, page: number) => any): Promise<boolean>
  each(fn: (row: T) => any, size?: number): Promise<boolean>
  insert(values: Record<string, any> | Record<string, any>[]): Promise<number | null>
  insertGetId(values: Record<string, any>): Promise<number | null>
  update(values: Record<string, any>): Promise<number>
  updateOrInsert(match: Record<string, any>, values?: Record<string, any>): Promise<boolean>
  increment(column: string, by?: number, extra?: Record<string, any>): Promise<number>
  decrement(column: string, by?: number, extra?: Record<string, any>): Promise<number>
  delete(): Promise<number>
  truncate(): Promise<any>
  toSql(): { sql: string; params: any[] }
}

/** a query that gives models: with(), withCount(), whereHas(), scopes, soft deletes */
export declare class ModelBuilder<T = any> extends Builder<T> {
  with(...relations: (string | Record<string, (q: ModelBuilder) => void>)[]): this
  withCount(...relations: (string | Record<string, (q: ModelBuilder) => void>)[]): this
  has(relation: string, op?: string, count?: number): this
  orHas(relation: string, op?: string, count?: number): this
  whereHas(relation: string, fn?: (q: ModelBuilder) => void, op?: string, count?: number): this
  orWhereHas(relation: string, fn?: (q: ModelBuilder) => void, op?: string, count?: number): this
  doesntHave(relation: string): this
  whereDoesntHave(relation: string, fn?: (q: ModelBuilder) => void): this
  withTrashed(): this
  onlyTrashed(): this
  withoutTrashed(): this
  findMany(ids: any[]): Promise<Collection<T>>
  findOrFail(id: any): Promise<T>
  forceDelete(): Promise<number>
  restore(): Promise<number>
  /** scopes: static scopePublished(query) → .published() */
  [scope: string]: any
}

export interface HasManyRelation<T = any> extends ModelBuilder<T> {
  create(attributes?: Record<string, any>): Promise<T>
  createMany(list: Record<string, any>[]): Promise<Collection<T>>
  make(attributes?: Record<string, any>): T
  save(model: T): Promise<T>
}
export interface BelongsToRelation<T = any> extends ModelBuilder<T> {
  associate(model: T | null): any
  dissociate(): any
}
export interface BelongsToManyRelation<T = any> extends ModelBuilder<T> {
  withPivot(...columns: string[]): this
  withTimestamps(): this
  wherePivot(column: string, op: any, value?: any): this
  attach(ids: any, extra?: Record<string, any>): Promise<void>
  detach(ids?: any): Promise<number>
  sync(ids: any[], detaching?: boolean): Promise<{ attached: any[]; detached: any[] }>
  syncWithoutDetaching(ids: any[]): Promise<{ attached: any[]; detached: any[] }>
  toggle(ids: any[]): Promise<{ attached: any[]; detached: any[] }>
  updateExistingPivot(id: any, values: Record<string, any>): Promise<number>
}

type ModelClass<M> = { new (...a: any[]): M; default?: any }

export declare class Model {
  static table: string
  static primaryKey: string
  static fillable: string[] | null
  static guarded: string[]
  static hidden: string[]
  static visible: string[] | null
  static appends: string[]
  /** 'boolean' | 'integer' | 'float' | 'decimal:2' | 'json' | 'array' | 'collection' | 'date' | 'datetime' | 'string' */
  static casts: Record<string, string>
  static timestamps: boolean
  static softDeletes: boolean
  static deletedAtColumn: string
  static perPage: number
  static observers: any[]
  static query<M extends typeof Model>(this: M): ModelBuilder<InstanceType<M>>
  static all<M extends typeof Model>(this: M): Promise<Collection<InstanceType<M>>>
  static find<M extends typeof Model>(this: M, id: any): Promise<InstanceType<M> | null>
  static findMany<M extends typeof Model>(this: M, ids: any[]): Promise<Collection<InstanceType<M>>>
  static findOrFail<M extends typeof Model>(this: M, id: any): Promise<InstanceType<M>>
  static first<M extends typeof Model>(this: M): Promise<InstanceType<M> | null>
  static firstOrFail<M extends typeof Model>(this: M): Promise<InstanceType<M>>
  static where<M extends typeof Model>(this: M, column: any, operator?: any, value?: any): ModelBuilder<InstanceType<M>>
  static whereIn<M extends typeof Model>(this: M, column: string, values: any[]): ModelBuilder<InstanceType<M>>
  static with<M extends typeof Model>(this: M, ...relations: any[]): ModelBuilder<InstanceType<M>>
  static withCount<M extends typeof Model>(this: M, ...relations: any[]): ModelBuilder<InstanceType<M>>
  static withTrashed<M extends typeof Model>(this: M): ModelBuilder<InstanceType<M>>
  static onlyTrashed<M extends typeof Model>(this: M): ModelBuilder<InstanceType<M>>
  static withoutTrashed<M extends typeof Model>(this: M): ModelBuilder<InstanceType<M>>
  static restore<M extends typeof Model>(this: M): Promise<number>
  static orderBy<M extends typeof Model>(this: M, column: string, direction?: 'asc' | 'desc'): ModelBuilder<InstanceType<M>>
  static latest<M extends typeof Model>(this: M, column?: string): ModelBuilder<InstanceType<M>>
  static scope<M extends typeof Model>(this: M, name: string, ...args: any[]): ModelBuilder<InstanceType<M>>
  static count(): Promise<number>
  static exists(): Promise<boolean>
  static pluck(column: string, key?: string): Promise<any>
  static paginate(perPage?: number, page?: number): Promise<Paginated<any>>
  static chunk(size: number, fn: (rows: Collection<any>) => any): Promise<boolean>
  static create<M extends typeof Model>(this: M, attributes: Record<string, any>): Promise<InstanceType<M>>
  static createMany<M extends typeof Model>(this: M, list: Record<string, any>[]): Promise<Collection<InstanceType<M>>>
  static firstOrNew<M extends typeof Model>(this: M, match: Record<string, any>, extra?: Record<string, any>): Promise<InstanceType<M>>
  static firstOrCreate<M extends typeof Model>(this: M, match: Record<string, any>, extra?: Record<string, any>): Promise<InstanceType<M>>
  static updateOrCreate<M extends typeof Model>(this: M, match: Record<string, any>, values: Record<string, any>): Promise<InstanceType<M>>
  static destroy(...ids: any[]): Promise<number>
  static factory(count?: number): FactoryBuilder
  static observe(...observers: any[]): void
  [column: string]: any
  readonly exists: boolean
  readonly trashed: boolean
  wasRecentlyCreated: boolean
  pivot?: Record<string, any>
  fill(attributes: Record<string, any>): this
  forceFill(attributes: Record<string, any>): this
  setAttribute(key: string, value: any): this
  getAttribute(key: string): any
  save(): Promise<this | false>
  update(attributes: Record<string, any>): Promise<this | false>
  delete(): Promise<boolean>
  forceDelete(): Promise<boolean>
  restore(): Promise<boolean>
  refresh(): Promise<this>
  fresh(...relations: string[]): Promise<this | null>
  touch(): Promise<this>
  increment(column: string, by?: number): Promise<this>
  decrement(column: string, by?: number): Promise<this>
  replicate(...except: string[]): this
  is(other: any): boolean
  isNot(other: any): boolean
  isDirty(...keys: string[]): boolean
  isClean(...keys: string[]): boolean
  getDirty(): Record<string, any>
  getOriginal(key?: string): any
  load(...relations: any[]): Promise<this>
  loadCount(...relations: any[]): Promise<this>
  makeHidden(...keys: string[]): this
  makeVisible(...keys: string[]): this
  toJSON(): Record<string, any>
  hasMany<R extends Model>(related: ModelClass<R> | any, foreignKey?: string, localKey?: string): HasManyRelation<R>
  hasOne<R extends Model>(related: ModelClass<R> | any, foreignKey?: string, localKey?: string): HasManyRelation<R>
  belongsTo<R extends Model>(related: ModelClass<R> | any, foreignKey?: string, ownerKey?: string): BelongsToRelation<R>
  belongsToMany<R extends Model>(related: ModelClass<R> | any, pivotTable?: string, foreignPivotKey?: string, relatedPivotKey?: string, parentKey?: string, relatedKey?: string): BelongsToManyRelation<R>
  hasManyThrough<R extends Model>(related: ModelClass<R> | any, through: any, firstKey?: string, secondKey?: string, localKey?: string, secondLocalKey?: string): ModelBuilder<R>
}

export interface FakeData {
  number(min?: number, max?: number): number
  float(min?: number, max?: number, digits?: number): number
  boolean(chance?: number): boolean
  pick<T>(list: T[]): T
  some<T>(list: T[], n?: number): T[]
  firstName(): string; lastName(): string; name(): string; userName(): string; email(): string; safeEmail(): string; phone(): string
  city(): string; country(): string; address(): string; company(): string
  category(): string; department(): string; product(): string; productName(): string; tag(): string; brand(): string; sku(prefix?: string): string; price(min?: number, max?: number): number; status(customList?: string[]): string
  word(): string; words(n?: number): string; sentence(n?: number): string; paragraph(n?: number): string; paragraphs(n?: number): string; text(max?: number): string; title(): string; slug(arg?: number | string): string
  url(): string; imageUrl(w?: number, h?: number): string; color(): string; uuid(): string; password(n?: number): string
  date(from?: string, to?: string): string; pastDate(): string; futureDate(): string
  smart(col: string, modelName?: string): any
  unique(): FakeData & { reset(): void }
}
export declare const fake: FakeData

export interface FactoryBuilder<M = any> {
  count(n: number): FactoryBuilder<M>
  state(values: Record<string, any> | ((attrs: Record<string, any>, fake: FakeData) => Record<string, any>)): FactoryBuilder<M>
  sequence(...values: (Record<string, any> | ((i: number) => Record<string, any>))[]): FactoryBuilder<M>
  for(parent: Model, key?: string): FactoryBuilder<M>
  has(child: FactoryBuilder, relation?: string): FactoryBuilder<M>
  raw(extra?: Record<string, any>): any
  make(extra?: Record<string, any>): Promise<any>
  create(extra?: Record<string, any>): Promise<any>
  [state: string]: any
}
export interface FactoryDefinition<M = any> extends FactoryBuilder<M> {
  (countOrAttrs?: number | Record<string, any>): FactoryBuilder<M>
  new (countOrAttrs?: number | Record<string, any>): FactoryBuilder<M>
  state(name: string, values: Record<string, any> | ((attrs: Record<string, any>, fake: FakeData) => Record<string, any>)): FactoryDefinition<M>
  state(values: Record<string, any> | ((attrs: Record<string, any>, fake: FakeData) => Record<string, any>)): FactoryBuilder<M>
  Model: M
  default: FactoryDefinition<M>
  [key: string]: any
}

export declare const Factory: {
  define<M extends typeof Model>(model: M | any, definition: (fake: FakeData, i: number) => Record<string, any>): FactoryDefinition<M>
  for(model: any): FactoryBuilder
}

export declare const DB: {
  table(name: string): Builder
  query(name: string): Builder
  raw(sql: string, params?: any[]): Raw
  select(sql: string, params?: any[]): Promise<Collection<any>>
  selectOne(sql: string, params?: any[]): Promise<any>
  insert(sql: string, params?: any[]): Promise<{ changes: number; insertId: number | null }>
  update(sql: string, params?: any[]): Promise<number>
  delete(sql: string, params?: any[]): Promise<number>
  statement(sql: string, params?: any[]): Promise<any>
  /** every query inside (models too) is one transaction: COMMIT when fn returns, ROLLBACK when it throws */
  transaction<R>(fn: (trx: any) => Promise<R>): Promise<R>
}

export declare class Seeder {
  call(seeders: (new () => Seeder) | (new () => Seeder)[]): Promise<void>
  run(): Promise<void>
}

/** The table builder a migration's up(schema) / down(schema) gets */
export interface Schema {
  create(table: string, build: (table: Blueprint) => void): Promise<void>
  table(table: string, build: (table: Blueprint) => void): Promise<void>
  drop(table: string): Promise<void>
  dropIfExists(table: string): Promise<void>
  rename(from: string, to: string): Promise<void>
  hasTable(table: string): Promise<boolean>
  hasColumn(table: string, column: string): Promise<boolean>
  raw(sql: string): Promise<void>
}
export interface Column {
  nullable(value?: boolean): this
  notNullable(): this
  notNull(): this
  null(): this
  default(value: any): this
  defaultValue(value: any): this
  defaultTo(value: any): this
  useCurrent(): this
  defaultToCurrent(): this
  unique(): this
  index(): this
  primary(): this
  unsigned(): this
  constrained(table?: string, column?: string): this
  references(column: string): this
  on(table: string): this
  inTable(table: string): this
  onDelete(action: string): this
  onUpdate(action: string): this
  cascadeOnDelete(): this
  nullOnDelete(): this
  restrictOnDelete(): this
  noActionOnDelete(): this
  cascadeOnUpdate(): this
  nullOnUpdate(): this
  restrictOnUpdate(): this
  noActionOnUpdate(): this
  change(): this
}
export interface Blueprint {
  id(name?: string): Column
  increments(name: string): Column
  bigIncrements(name: string): Column
  uuid(name?: string): Column
  foreignId(name: string): Column
  string(name: string, length?: number): Column
  char(name: string, length?: number): Column
  text(name: string): Column
  mediumText(name: string): Column
  longText(name: string): Column
  enum(name: string, values: string[]): Column
  json(name: string): Column
  integer(name: string): Column
  tinyInteger(name: string): Column
  smallInteger(name: string): Column
  bigInteger(name: string): Column
  unsignedInteger(name: string): Column
  unsignedBigInteger(name: string): Column
  float(name: string): Column
  double(name: string): Column
  decimal(name: string, precision?: number, scale?: number): Column
  boolean(name: string): Column
  bool(name: string): Column
  date(name: string): Column
  time(name: string): Column
  dateTime(name: string): Column
  timestamp(name: string): Column
  timestamps(): void
  softDeletes(name?: string): Column
  rememberToken(): Column
  unique(columns: string | string[], name?: string): this
  index(columns: string | string[], name?: string): this
  createIndex(columns: string | string[], name?: string): this
  addIndex(columns: string | string[], name?: string): this
  createUnique(columns: string | string[], name?: string): this
  addUnique(columns: string | string[], name?: string): this
  fullText(columns: string | string[], name?: string): this
  fulltext(columns: string | string[], name?: string): this
  spatialIndex(columns: string | string[], name?: string): this
  foreign(column: string | string[]): Column
  dropColumn(...names: string[]): this
  renameColumn(from: string, to: string): this
  dropIndex(name: string): this
  dropUnique(name: string): this
  dropForeign(name: string | string[]): this
  dropTimestamps(): this
}

export declare class HttpError extends Error { constructor(status: number, message?: string, extra?: any); status: number }
export declare class ValidationError extends HttpError { constructor(errors: Record<string, string[]>); errors: Record<string, string[]> }
export declare class ModelNotFoundError extends Error { status: 404 }

/** Passwords and tokens: Hash.make('secret') to store, Hash.check('secret', stored) to compare (scrypt) */
export declare const Hash: {
  make(value: string): string
  check(value: string, hashed: string): boolean
  /** a quick hash for long random tokens */
  sha256(value: string): string
}
export declare const Url: {
  /** APP_URL from .env + path */
  to(path?: string): string
  /** a link that only works unchanged (and, with minutes, until it expires), signed with APP_KEY */
  signed(path: string, minutes?: number | null): string
  /** check(path, { expires, signature }) */
  check(path: string, query?: Record<string, any>): boolean
}

export declare interface SlugFunction {
  (text: string, separator?: string): string
  unique(target: any, column: string, text: string, separator?: string): Promise<string>
}
export declare const slug: SlugFunction
export declare function uniqueSlug(target: any, column: string, text: string, separator?: string): Promise<string>

export declare const Str: {
  random(length?: number): string
  slug(text: string, separator?: string): string
  uniqueSlug(target: any, column: string, text: string, separator?: string): Promise<string>
  limit(text: string, length?: number, end?: string): string
  words(text: string, words?: number, end?: string): string
  camel(text: string): string
  studly(text: string): string
  snake(text: string, separator?: string): string
  kebab(text: string): string
  title(text: string): string
  ucfirst(text: string): string
  plural(word: string, count?: number): string
  singular(word: string): string
  uuid(): string
  ulid(): string
  contains(text: string, needles: string | string[], ignoreCase?: boolean): boolean
  startsWith(text: string, needles: string | string[]): boolean
  endsWith(text: string, needles: string | string[]): boolean
  after(text: string, search: string): string
  before(text: string, search: string): string
  between(text: string, from: string, to: string): string
  mask(text: string, character: string, index: number, length?: number): string
  padLeft(text: string, length: number, pad?: string): string
  padRight(text: string, length: number, pad?: string): string
  squish(text: string): string
  is(pattern: string, text: string): boolean
}

/** AES-256-GCM with APP_KEY: Crypt.encrypt(anything) / Crypt.decrypt(payload) */
export declare const Crypt: {
  encrypt(value: any): string
  decrypt<T = any>(payload: string): T
  encryptString(value: string): string
  decryptString(payload: string): string
}
type LogFn = (message: string, context?: Record<string, any>) => void
/** Log.info('Order placed', { id }) → the terminal and backend/storage/logs/kreft.log */
export declare const Log: { debug: LogFn; info: LogFn; notice: LogFn; warning: LogFn; error: LogFn; critical: LogFn; write(level: string, message: string, context?: any): void; clear(): boolean; path(): string; getDirectory(): string; setDirectory(dir: string): void }
/** translations from backend/lang/<locale>.json or in-memory dictionary: __('welcome', { name }) */
export declare const Lang: {
  setDirectory(dir: string): void
  getDirectory(): string | null
  locale(): string
  setLocale(locale: string): void
  fallbackLocale(): string
  setFallbackLocale(locale: string): void
  translations(localeOrDict: string | Record<string, any>, dict?: Record<string, any>): typeof Lang
  all(locale?: string): Record<string, any>
  dir(locale?: string): 'rtl' | 'ltr'
  isRtl(locale?: string): boolean
  get(key: string, replace?: Record<string, any>, locale?: string): string
  choice(key: string, count: number, replace?: Record<string, any>, locale?: string): string
  has(key: string, locale?: string): boolean
  formatNumber(value: number, options?: Intl.NumberFormatOptions, locale?: string): string
  formatCurrency(amount: number, currency?: string, locale?: string): string
  formatDate(date: Date | string | number, options?: Intl.DateTimeFormatOptions, locale?: string): string
}
export declare function __(key: string, replace?: Record<string, any>, locale?: string): string
export declare function trans(key: string, replace?: Record<string, any>, locale?: string): string
export declare function transChoice(key: string, count: number, replace?: Record<string, any>, locale?: string): string
export declare function trans_choice(key: string, count: number, replace?: Record<string, any>, locale?: string): string
export interface ConfigFn {
  <T = any>(key?: string, defaultValue?: T): T
  get<T = any>(key: string, defaultValue?: T): T
  has(key: string): boolean
  set(key: string | Record<string, any>, value?: any): ConfigFn
  all(): Record<string, any>
  load(projectRoot?: string): ConfigFn
  reload(projectRoot?: string): ConfigFn
  repository: any
}
/** configuration from config/*.js and kreftjs.config.json: config('app.name') */
export declare const config: ConfigFn
export declare const Config: ConfigFn
export declare const SEO: {
  renderTags(options?: Record<string, any> | string): string
  sitemap(routes?: (string | { path: string; changefreq?: string; priority?: string })[], options?: { baseUrl?: string }): string
  robots(options?: { allow?: string; disallow?: string | string[]; sitemapUrl?: string }): string
}
interface HttpResponse { status: number; ok: boolean; headers: Record<string, string>; body: string; json<T = any>(): T; successful(): boolean; failed(): boolean }
interface PendingHttp {
  get(url: string, query?: Record<string, any>): Promise<HttpResponse>
  post(url: string, data?: any): Promise<HttpResponse>
  put(url: string, data?: any): Promise<HttpResponse>
  patch(url: string, data?: any): Promise<HttpResponse>
  delete(url: string, data?: any): Promise<HttpResponse>
  withToken(token: string): PendingHttp
  withHeaders(headers: Record<string, string>): PendingHttp
  baseUrl(url: string): PendingHttp
  timeout(seconds: number): PendingHttp
  asForm(): PendingHttp
  throw(): PendingHttp
}
/** calls to other APIs: await Http.withToken(key).get('https://api.example.com/x') */
export declare const Http: PendingHttp
/** a value from .env, with a fallback: env('APP_NAME', 'App') */
export declare function env(key: string, fallback?: any): any
export declare function now(): Date

/** two-factor codes (authenticator apps), RFC 6238 */
export declare const TOTP: {
  secret(bytes?: number): string
  code(secret: string, at?: number): string
  verify(secret: string, code: string, window?: number): boolean
  url(secret: string, label: string, issuer?: string): string
  recoveryCodes(n?: number): string[]
}
/** QR codes as SVG, no package needed */
export declare const QR: { svg(text: string, options?: { size?: number; margin?: number; dark?: string; light?: string }): string; matrix(text: string): boolean[][] }

/** Mailables: await Mail.to(user).send(new WelcomeMail(user)) */
export declare class Mailable {
  subject(subject: string): this
  from(address: string, name?: string): this
  replyTo(address: string): this
  text(text: string): this
  html(html: string): this
  markdown(message: { greeting?: string; lines?: string[]; action?: { text: string; url: string }; outro?: string[]; salutation?: string }): this
  attach(file: string | object, options?: { as?: string; mime?: string }): this
  build(): this | Promise<this>
}
type Address = string | { email: string; name?: string }
interface PendingMail {
  cc(address: Address | Address[]): PendingMail
  bcc(address: Address | Address[]): PendingMail
  send(mailable: Mailable): Promise<any>
  queue(mailable: Mailable, options?: { delay?: number; queue?: string }): Promise<any>
  later(seconds: number, mailable: Mailable): Promise<any>
}
export declare const Mail: {
  send(message: { to: string; subject?: string; text?: string; html?: string; from?: string; cc?: string; bcc?: string }): Promise<any>
  to(address: Address | Address[]): PendingMail
  sent: { to: string; subject: string; text: string; html?: string; from: string; at: Date }[]
}

/** Events: await event(new OrderShipped(order)); listeners in app/Listeners (static event = 'OrderShipped') */
export declare const Event: {
  listen(event: string | Function | (string | Function)[], listener: Function | object): void
  dispatch(event: string | object, ...payload: any[]): Promise<any[]>
  hasListeners(event: string | Function): boolean
  forget(event: string | Function): void
  listeners(event: string | Function): any[]
  reset(): void
}
export declare function event(event: object | string, ...payload: any[]): Promise<any[]>

/** Queued jobs: await dispatch(new SendWelcome(user)); kreftjs dev or kreftjs queue:work runs them */
export declare class Job {
  static tries: number
  static backoff: number | number[]
  static queue: string
  static dispatch(...args: any[]): Promise<any> & {
    delay(seconds: number): Promise<any> & { onQueue(name: string): Promise<any> }
    onQueue(name: string): Promise<any> & { delay(seconds: number): Promise<any> }
  }
  static dispatchSync(...args: any[]): Promise<any>
  handle(): any
  failed?(error: Error): any
}
export declare function dispatch(job: Job, options?: { delay?: number; queue?: string }): Promise<any>
export declare function dispatchSync(job: Job): Promise<any>

/** Queue manager: pause, stop, resume, and restart queue workers */
export declare const Queue: {
  stop(queueName?: string): { stoppedAll: boolean; stoppedQueues: string[]; restartAt: number }
  stopAll(): { stoppedAll: boolean; stoppedQueues: string[]; restartAt: number }
  pause(queueName?: string): { stoppedAll: boolean; stoppedQueues: string[]; restartAt: number }
  resume(queueName?: string): { stoppedAll: boolean; stoppedQueues: string[]; restartAt: number }
  resumeAll(): { stoppedAll: boolean; stoppedQueues: string[]; restartAt: number }
  restart(): { stoppedAll: boolean; stoppedQueues: string[]; restartAt: number }
  status(): { stoppedAll: boolean; stoppedQueues: string[]; restartAt: number }
  isStopped(queueName?: string): boolean
  getStoppedQueues(): string[]
}

/** Notifications: await user.notify(new InvoicePaid(invoice)) — channels 'mail' and 'database' */
export declare class Notification {
  static queue: boolean
  via(notifiable: any): string[]
  toMail?(notifiable: any): any
  toDatabase?(notifiable: any): Record<string, any>
  static send(notifiables: any, notification: Notification): Promise<void>
}

/** Cache.remember('stats', 600, () => load()); CACHE_STORE: database, file or memory */
export declare const Cache: {
  store(name?: string): typeof Cache
  get<T = any>(key: string, fallback?: T | (() => T)): Promise<T>
  has(key: string): Promise<boolean>
  missing(key: string): Promise<boolean>
  put(key: string, value: any, seconds?: number | Date): Promise<boolean>
  set(key: string, value: any, seconds?: number | Date): Promise<boolean>
  add(key: string, value: any, seconds?: number | Date): Promise<boolean>
  forever(key: string, value: any): Promise<boolean>
  remember<T>(key: string, seconds: number | Date, fn: () => T | Promise<T>): Promise<T>
  rememberForever<T>(key: string, fn: () => T | Promise<T>): Promise<T>
  pull<T = any>(key: string, fallback?: T): Promise<T>
  forget(key: string): Promise<boolean>
  increment(key: string, by?: number): Promise<number>
  decrement(key: string, by?: number): Promise<number>
  flush(): Promise<void>
  lock<R = any>(name: string, seconds?: number, callback?: () => R | Promise<R>): Promise<{ owner: string; release(): Promise<void>; forceRelease(): Promise<boolean> } | null | R> & {
    get<T = any>(fn?: () => T | Promise<T>): Promise<T | boolean | { owner: string; release(): Promise<void> } | null>
    block<T = any>(waitSeconds?: number, fn?: () => T | Promise<T>): Promise<T | { owner: string; release(): Promise<void> }>
    release(): Promise<void>
    forceRelease(): Promise<boolean>
  }
}

/** Redis client and connection manager: await Redis.get('key'); await Redis.set('key', 'val') */
export interface RedisClient {
  call(cmd: string, ...args: any[]): Promise<any>
  eval(script: string, numKeys?: number, ...args: any[]): Promise<any>
  pipeline(fn?: (pipe: RedisClient) => any): Promise<any[]>
  get(key: string): Promise<string | null>
  set(key: string, value: any, ...args: any[]): Promise<any>
  setex(key: string, seconds: number, value: any): Promise<any>
  setnx(key: string, value: any): Promise<number>
  del(...keys: (string | string[])[]): Promise<number>
  exists(...keys: (string | string[])[]): Promise<number>
  expire(key: string, seconds: number): Promise<number>
  ttl(key: string): Promise<number>
  incr(key: string): Promise<number>
  decr(key: string): Promise<number>
  incrby(key: string, amount: number): Promise<number>
  decrby(key: string, amount: number): Promise<number>
  hget(key: string, field: string): Promise<string | null>
  hset(key: string, field: string | Record<string, any>, value?: any): Promise<number>
  hdel(key: string, ...fields: (string | string[])[]): Promise<number>
  hexists(key: string, field: string): Promise<number>
  hgetall(key: string): Promise<Record<string, string>>
  hkeys(key: string): Promise<string[]>
  hvals(key: string): Promise<string[]>
  hlen(key: string): Promise<number>
  lpush(key: string, ...values: (any | any[])[]): Promise<number>
  rpush(key: string, ...values: (any | any[])[]): Promise<number>
  lpop(key: string): Promise<string | null>
  rpop(key: string): Promise<string | null>
  llen(key: string): Promise<number>
  lrange(key: string, start?: number, stop?: number): Promise<string[]>
  sadd(key: string, ...members: (any | any[])[]): Promise<number>
  srem(key: string, ...members: (any | any[])[]): Promise<number>
  smembers(key: string): Promise<string[]>
  sismember(key: string, member: any): Promise<number>
  zadd(key: string, score: number, member: string): Promise<number>
  zrangebyscore(key: string, min: number | string, max: number | string, ...options: any[]): Promise<string[]>
  zrem(key: string, ...members: (any | any[])[]): Promise<number>
  publish(channel: string, message: string): Promise<number>
  subscribe(channel: string, handler?: (msg: string, channel: string) => void): Promise<any>
  unsubscribe(channel: string, handler?: (msg: string, channel: string) => void): Promise<any>
  ping(msg?: string): Promise<string>
  flushdb(): Promise<string>
  flushall(): Promise<string>
  keys(pattern?: string): Promise<string[]>
  quit(): void
  destroy(): void
}

export declare const Redis: RedisClient & {
  connection(name?: string, options?: Record<string, any>): RedisClient
  client(name?: string): RedisClient
  closeAll(): void
}

/** Files: Storage.put('reports/a.txt', text); Storage.disk('public') is served at /storage */
interface Disk {
  path(p?: string): string
  put(path: string, content: string | Buffer): Promise<string>
  get(path: string): Promise<string>
  getBuffer(path: string): Promise<Buffer>
  exists(path: string): Promise<boolean>
  missing(path: string): Promise<boolean>
  delete(paths: string | string[]): Promise<boolean>
  size(path: string): Promise<number>
  lastModified(path: string): Promise<Date>
  append(path: string, content: string): Promise<void>
  copy(from: string, to: string): Promise<void>
  move(from: string, to: string): Promise<void>
  files(dir?: string): Promise<string[]>
  allFiles(dir?: string): Promise<string[]>
  makeDirectory(dir: string): Promise<void>
  deleteDirectory(dir: string): Promise<void>
  url(path: string): string | null
}
export declare const Storage: Disk & { disk(name?: 'local' | 'public'): Disk }
export declare class UploadedFile {
  name: string
  size: number
  type: string
  originalName(): string
  extension(): string
  isImage(): boolean
  hashName(): string
  store(dir: string, disk?: 'local' | 'public'): Promise<string>
  storeAs(dir: string, name: string, disk?: 'local' | 'public'): Promise<string>
}

/** Gates and policies (app/Policies/PostPolicy.js is found for the Post model) */
interface GateForUser { allows(ability: string, ...args: any[]): Promise<boolean>; denies(ability: string, ...args: any[]): Promise<boolean>; authorize(ability: string, ...args: any[]): Promise<void> }
export declare const Gate: {
  define(ability: string, fn: (user: any, ...args: any[]) => boolean | Promise<boolean>): void
  policy(model: string | Function, policy: any): void
  has(ability: string): boolean
  forUser(user: any): GateForUser
  abilities(): string[]
}

/** Form requests: const data = await StorePostRequest.validate(req) */
export declare class FormRequest {
  authorize(req: Request): boolean | Promise<boolean>
  rules(req: Request): Rules | Record<string, any>
  messages(): Record<string, string>
  attributes(): Record<string, string>
  prepareForValidation(data: Record<string, any>): Record<string, any>
  static validate<T = Record<string, any>>(req: Request): Promise<T>
}
/** API resources: return new PostResource(post) → { data: … } */
export declare class JsonResource<T = any> {
  static wrap: string | null
  resource: T
  constructor(resource: T)
  toArray(req?: Request | null): any
  whenLoaded(relation: string, value?: any): any
  when(condition: any, value: any): any
  static collection(items: any): ResourceCollection
  static make(resource: any): JsonResource
  [key: string]: any
}
export declare class ResourceCollection { toJSON(): { data: any[]; meta?: any } }

/** Task scheduling in backend/routes/console.js */
interface Task {
  cron(expression: string): this
  everyMinute(): this; everyTwoMinutes(): this; everyFiveMinutes(): this; everyTenMinutes(): this; everyFifteenMinutes(): this; everyThirtyMinutes(): this
  hourly(): this; hourlyAt(minute: number): this; daily(): this; dailyAt(time: string): this; at(time: string): this; twiceDaily(first?: number, second?: number): this
  weekly(): this; weeklyOn(day: number, time?: string): this; monthly(): this; monthlyOn(day: number, time?: string): this; yearly(): this
  weekdays(): this; weekends(): this; sundays(): this; mondays(): this; tuesdays(): this; wednesdays(): this; thursdays(): this; fridays(): this; saturdays(): this
  when(fn: () => boolean | Promise<boolean>): this
  withoutOverlapping(): this
  name(name: string): this
  description(text: string): this
}
export declare const Schedule: { call(fn: () => any): Task; job(job: Job): Task; command(line: string): Task }

/** Your own commands in app/Console/Commands (kreftjs make:command SendReport) */
export declare class Command {
  static signature: string
  static description: string
  handle(): any
  argument(name: string): any
  arguments(): Record<string, any>
  option(name: string): any
  options(): Record<string, any>
  line(text?: string): void
  info(text: string): void
  comment(text: string): void
  warn(text: string): void
  error(text: string): void
  newLine(n?: number): void
  table(rows: any[], headers?: string[]): void
  ask(question: string, fallback?: string): Promise<string>
  confirm(question: string, fallback?: boolean): Promise<boolean>
  call(line: string): Promise<any>
}

/** Built-in CSRF protection middleware and helpers */
export declare class VerifyCsrfToken {
  constructor(options?: { except?: string[] })
  handle(req: Request, next: (req?: Request) => Promise<Response>, ...args: string[]): Promise<Response>
}
export declare const csrf: (req: Request, next: (req?: Request) => Promise<Response>, ...args: string[]) => Promise<Response>
export declare function generateCsrfToken(): string
export declare function verifyCsrfToken(token: string, expected: string): boolean

/** Import a class or namespace by its PHP-style namespace (e.g. 'App\\Models\\User') */
export declare function use<T = any>(target: string): T

/** Create a namespace proxy to load classes dynamically (e.g. namespace('App\\Models')) */
export declare function namespace(prefix: string): Record<string, any>

/** Auto Garbage Collector & Memory Watchdog */
export declare function startAutoGarbageCollector(options?: { thresholdMB?: number; intervalMs?: number; log?: boolean }): void
export declare function stopAutoGarbageCollector(): void
export declare function getMemoryStats(): { rssMB: number; heapTotalMB: number; heapUsedMB: number; externalMB: number; gcExposed: boolean }
export interface MemoryAlert { type: 'memory-high' | 'memory-leak'; message: string; at: string; heapUsedMB: number; rssMB: number; [k: string]: any }
export interface MemoryReport {
  heapUsedMB: number; heapTotalMB: number; rssMB: number; externalMB: number; gcExposed: boolean
  running: boolean; startedAt: string | null; checks: number; cleanups: number; gcRuns: number; v8Collections: number
  reclaimedMB: number; evictedEntries: number; trendMBPerMin: number | null; overStreak: number
  leak: { suspected: boolean; riseMB: number; floorsMB: number[] }
  alerts: MemoryAlert[]; history: Array<{ t: number; heapUsedMB: number; rssMB: number }>; config: any
}
/** Everything a dashboard or alert needs, as plain JSON */
export declare function getMemoryReport(): MemoryReport
/** Register a cache cleaner: fn(fraction) drops that share of its least-used entries and returns how many went */
export declare function onMemoryPressure(name: string, fn: (fraction: number) => number | void): () => void
/** Called when memory stays high after cleaning, or a leak is suspected */
export declare function onMemoryAlert(fn: (alert: MemoryAlert) => void): () => void
/** Writes a V8 heap snapshot (open in Chrome DevTools > Memory); returns the file path */
export declare function writeHeapSnapshot(file?: string): string
export declare function checkMemory(): { action: string; [k: string]: any }

/** Native Model Context Protocol (MCP) Server */
export declare class McpServer {
  constructor(options?: { baseDir?: string })
  registerTool(name: string, schema: any, handler: (args: any) => Promise<any>): this
  registerResource(uri: string, name: string, mimeType: string, handler: () => Promise<string>): this
  handleHttpRequest(req: any, res: any): Promise<void>
  listenStdio(): void
}
export declare function getMcpServer(options?: { baseDir?: string }): McpServer

/** Kreft Shield: SHIELD=true in .env limits and bans abusive addresses */
export interface ShieldBan { ip: string; until: string; level: number; secondsLeft: number }
export declare const Shield: {
  enabled(): boolean
  bans(): ShieldBan[]
  ban(ip: string, minutes?: number, reason?: string): { ip: string; minutes: number; reason: string; until: string; level: number }
  unban(ip: string): boolean
  status(): { enabled: boolean; tracked: number; banned: number; blocked: number; limited: number; bans: number; eventLoopLagMs: number; overloaded: boolean; limits: Record<string, number> }
  on(event: 'ban', fn: (info: { ip: string; minutes: number; reason: string; until: string; level: number }) => void): typeof Shield
  off(event: 'ban', fn: (...a: any[]) => void): typeof Shield
}

/** MCP client (Streamable HTTP): call tools on a remote MCP server */
export declare class McpClient {
  constructor(url: string, options?: { headers?: Record<string, string>; timeout?: number })
  server: any
  connect(): Promise<this>
  tools(): Promise<Array<{ name: string; description?: string; inputSchema?: any }>>
  call(name: string, args?: Record<string, any>): Promise<any>
  resources(): Promise<any[]>
  readResource(uri: string): Promise<any>
  close(): Promise<void>
}
export declare const Mcp: { connect(url: string, options?: { headers?: Record<string, string>; timeout?: number }): Promise<McpClient> }

export interface CleanHtmlOptions {
  allowedTags?: string[]
  allowedAttributes?: Record<string, string[]>
  allowedSchemes?: string[]
  allowStyle?: boolean
}

export declare class SafeHtml {
  constructor(html: string)
  toHtml(): string
  toString(): string
  static raw(html: string): SafeHtml
  static clean(rawHtml: string, options?: CleanHtmlOptions): SafeHtml
  static isSafe(value: any): boolean
}

/** Sanitize HTML string by stripping script tags, event handlers and dangerous schemes */
export declare function cleanHtml(rawHtml: any, options?: CleanHtmlOptions): string
export declare const sanitizeHtml: typeof cleanHtml
/** Strip all HTML tags, returning plain text */
export declare function stripTags(html: any): string
/** Escape HTML special characters (&, <, >, ", ') */
export declare function escapeHtml(str: any): string
export declare const e: typeof escapeHtml
/** Unescape HTML entities */
export declare function unescapeHtml(str: any): string
/** Tagged template literal for safely composing HTML */
export declare function html(strings: TemplateStringsArray, ...values: any[]): SafeHtml
/** Check if a URL uses a safe scheme (http, https, mailto, tel, or relative path) */
export declare function isSafeUrl(url: string, allowedSchemes?: string[]): boolean

/** Built-in Error Monitor & Diagnostics UI */
export declare const ErrorMonitor: {
  record(err: any, req?: any, context?: Record<string, any>): any
  recent(limit?: number): any[]
  clear(): void
  renderDevErrorPage(entry: any): string
  renderSafeErrorPage(status?: number, message?: string): string
  handle(err: any, req?: any, res?: any): void
}




