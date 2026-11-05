# الفصل السادس: الواجهة الخلفية

المشروع الذي ينشئه `kreft new` فيه واجهة خلفية على Node.js. الأمران `kreft dev` و`kreft serve` يحمّلان `backend/routes/api.js` بنفسيهما، وكل عنوان فيه يبدأ بـ `/api`، و`kreft dev` يلتقط كل تغيير تحفظه. مجلد `backend` لا يصل المتصفح أبدًا.

## المسارات (Routes)

```js
// backend/routes/api.js
const { Route } = require('kreftjs/server')
const PostController = require('../app/Http/Controllers/PostController')

Route.get('/hello', (req) => ({ hello: req.input('name', 'world') }))      // GET /api/hello

Route.apiResource('posts', PostController)    // index, store, show, update, destroy
Route.get('/posts/{post}/comments', [PostController, 'comments']).name('posts.comments')

Route.middleware('auth').group(() => {
  Route.delete('/posts/{post}', [PostController, 'destroy'])
})

Route.prefix('admin').middleware(['auth', 'admin']).group(() => { /* … */ })
```

- المعاملات تُكتب `{post}`، أو `{post?}` إن كانت اختيارية.
- للمسار اسم (`.name('…')`) ونمط (`.whereNumber('id')`) ووسيط (`.middleware('auth')`).
- `kreft route:list` يطبع كل المسارات مع أسمائها ومتحكماتها ووسطائها.

### فضاءات الأسماء (Namespaces)

فضاءات الأسماء بأسلوب PHP مدعومة للمتحكمات والنماذج والعلاقات:

```js
const { Route, use, namespace } = require('kreftjs/server')

const User = use('App\\Models\\User')
const { DashboardController, UserController } = namespace('App\\Http\\Controllers\\Admin')

Route.namespace('Admin').group(() => {
  Route.get('/users', 'UserController@index')
  Route.apiResource('users', 'UserController')
})
```

## المتحكمات (Controllers) والطلب

دالة المتحكم تستلم الطلب أولًا، ثم معاملات المسار. ما تعيده يُرسل كـ JSON، وإن لم تعد شيئًا فالجواب `204`.

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

  async show(req, id) { return Post.findOrFail(id) }               // 404 إن لم يوجد
  async destroy(req, id) { await (await Post.findOrFail(id)).delete() }
}

module.exports = PostController
```

ولتوليد متحكم: `kreft make:controller PostController --api` (وأيضًا `--model Post` و`--route=api` و`--auth`).

### الطلب (req)

| الاستدعاء | يعطي |
|---|---|
| `req.input('name', default)` و`req.all()` و`req.only('a', 'b')` و`req.except(…)` و`req.has(…)` و`req.filled(…)` | قيمًا من الجسم والاستعلام. |
| `req.boolean('x')` و`req.integer('page', 1)` و`req.string('q')` | قيمة بالنوع الصحيح. |
| `await req.validate(rules)` | القواعد نفسها كما في `form()`، إضافة إلى `unique:table,column` و`exists:table,column`. يعيد الحقول المفحوصة فقط أو يجيب `422`. |
| `req.params` و`req.query` و`req.body` و`req.header('x')` و`req.bearerToken()` و`req.ip()` و`req.user` | الباقي. |
| `req.file('avatar').store('avatars')` | يحفظ رفعًا باسم عشوائي. |
| `response(data, 201)` و`response(data).header('X', 'y')` و`abort(403, 'message')` | الأجوبة. |

### طلبات النماذج والموارد والسياسات

للنقاط الأكبر، انقل القواعد والتفويض خارج المتحكم:

```js
// app/Http/Requests/StorePostRequest.js
const { FormRequest } = require('kreftjs/server')

class StorePostRequest extends FormRequest {
  authorize(req) { return req.user != null }           // false تجيب 403
  rules() { return { title: 'required|max:200', body: 'required' } }
  messages() { return { 'title.required': 'أعطِ المقال عنوانًا.' } }
}

module.exports = StorePostRequest
```

```js
const data = await StorePostRequest.validate(req)                // في متحكم
return PostResource.collection(await Post.paginate(15))          // { data, meta }
await req.authorize('update', post)                              // app/Policies/PostPolicy.js
```

ولتوليدها: `kreft make:request` و`kreft make:resource` و`kreft make:policy`.

## النماذج (Models) وقاعدة البيانات

النماذج أصناف Active Record، كما في Eloquent:

```js
// app/Models/Post.js
const { Model, Str } = require('kreftjs/server')

class Post extends Model {
  static fillable = ['title', 'body', 'user_id']        // ما يجوز لـ create() و update() ملؤه
  static hidden = []                                    // لا يُرسل كـ JSON أبدًا
  static casts = { published: 'boolean', meta: 'json' }
  static softDeletes = true                             // delete() يملأ deleted_at

  user() { return this.belongsTo(require('./User')) }
  comments() { return this.hasMany(require('./Comment')) }
  tags() { return this.belongsToMany(require('./Tag')) }

  static scopePublished(q) { q.where('published', true) }
  static async creating(post) { post.slug ??= Str.slug(post.title) }
}

module.exports = Post
```

الجدول هو جمع اسم الصنف (`Post` ← `posts`)؛ استعمل `static table = '…'` لجدول آخر.

### الاستعلام

```js
await Post.all()
await Post.find(5)                       // أو findOrFail(5): 404 إن لم يوجد
await Post.where('published', true).orderByDesc('id').limit(10).get()
await Post.where('views', '>', 100).orWhere('pinned', true).count()
await Post.query().published().with('user', 'comments.author').withCount('comments').paginate(15, page)
await Post.query().whereHas('comments', (q) => q.where('approved', true)).get()

const post = await Post.create({ title: 'مرحبًا' })     // يملأ created_at و updated_at
await post.update({ title: 'أهلًا' })
await post.delete()

await post.comments().create({ body: 'جميل' })
await post.tags().sync([1, 2, 3])                   // وأيضًا attach() و detach() و toggle()
```

العلاقات: `hasOne` و`hasMany` و`belongsTo` و`belongsToMany` (مع `pivot`) و`hasManyThrough`. الصفوف المحذوفة حذفًا ناعمًا تعود بـ `withTrashed()` وتُسترجع بـ `restore()`.

بلا نموذج:

```js
await DB.table('orders').join('users', 'users.id', '=', 'orders.user_id').groupBy('status').get()
await DB.select('SELECT * FROM posts WHERE id = ?', [5])
await DB.transaction(async () => { await Order.create({ /* … */ }); await Stock.decrement(/* … */) })   // الكل أو لا شيء
```

> **تحذير:** القيم تسافر دائمًا كمعاملات (`?`). لا تبنِ SQL بضمّ مدخلات المستخدم في نص. أما `whereRaw` و`selectRaw` و`orderByRaw` فتأخذ SQL خامًا عمدًا: مرّر قيم المستخدم عبر مصفوفة المعاملات فيها.

### قواعد البيانات

تأتي القاعدة من `DATABASE_URL` في `.env`:

```env
DATABASE_URL=sqlite:backend/database/app.db                  # مدمجة في Node.js، لا شيء لتثبيته
DATABASE_URL=mysql://user:pass@localhost:3306/shop           # npm i mysql2
DATABASE_URL=postgres://user:pass@localhost:5432/shop        # npm i pg
```

الترحيلات والنماذج نفسها تعمل على الثلاث.

## الترحيلات (Migrations) والبذور (Seeders) والمصانع (Factories)

الترحيل يصف جدولًا بـ JavaScript، والملف نفسه يعمل على SQLite وMySQL وPostgreSQL:

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

أنواع الأعمدة: `id` و`string` و`text` و`integer` و`bigInteger` و`decimal` و`float` و`boolean` و`date` و`dateTime` و`timestamp` و`timestamps` و`json` و`foreignId`. وملفات `.sql` العادية في `database/migrations` تعمل أيضًا (تُنفَّذ مرة لكل ملف بترتيب الأسماء).

البذرة تملأ بيانات البداية:

```js
// database/seeders/DatabaseSeeder.js
const { Seeder } = require('kreftjs/server')
const Post = require('../../app/Models/Post')

class DatabaseSeeder extends Seeder {
  async run() {
    await Post.create({ title: 'مرحبًا', author_id: 1 })
    await this.call(require('./CommentSeeder'))
  }
}

module.exports = DatabaseSeeder
```

المصانع تصنع بيانات وهمية للبذور والاختبارات:

```js
await User.factory().count(10).has(Post.factory().count(3), 'posts').create()
```

### الأوامر

| الأمر | ماذا يفعل |
|---|---|
| `kreft migrate` | ينفّذ الترحيلات الجديدة (`kreft dev` يفعل ذلك وحده). |
| `kreft migrate:rollback` | يتراجع عن آخر دفعة (`--step 2` لآخر اثنتين). |
| `kreft migrate:fresh --seed` | يحذف كل الجداول ثم يرحّل من جديد ثم يبذر. |
| `kreft migrate:status` | أي الترحيلات نُفّذت. |
| `kreft db:seed` | ينفّذ `DatabaseSeeder` (`--class PostSeeder` لغيره). |
| `kreft make:model Post -mfsc` | نموذج مع ترحيل (`-m`) ومصنع (`-f`) وبذرة (`-s`) ومتحكم (`-c`) وصفحة (`-p`) ومسار (`-r`). |
| `kreft make:migration create_posts_table` | `add_x_to_posts_table` يصنع `schema.table`. |
| `kreft make:seeder` و`kreft make:middleware` | الملفات في أماكنها الصحيحة. |

> **ملاحظة:** `migrate:fresh` و`db:wipe` يدمّران البيانات. هما لقواعد التطوير فقط.

## تمارين

1. أنشئ مشروعًا بـ `--db sqlite`، ثم `kreft make:model Product -mfsc` وعدّل الترحيل بإضافة `price` و`stock`.
2. أضف مسار `GET /api/products/low-stock` يعيد المنتجات التي مخزونها أقل من 5 باستعمال scope.
3. اكتب بذرة تنشئ 50 منتجًا بالمصنع، وشغّل `kreft migrate:fresh --seed`.
