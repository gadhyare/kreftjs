# الفصل الحادي عشر (متقدم): مدونة كاملة

نبني مدونة بمقالات وتعليقات ووسوم، بحث وترقيم صفحات، تحقق متقدم، ووصلات عربية، وSEO للزواحف. **كل شيفرة هنا جُرِّبت فعلًا**: شُغّل الخادم وأُرسلت طلبات حقيقية، وفُتحت الصفحات في المتصفح.

ما ستتعلمه: علاقات متعددة لمتعدد (many-to-many)، وscopes، وخطّافات النماذج، وFormRequest، وResource، وقواعد تحقق خاصة، وبحث بتأخير (debounce)، وSEO من قاعدة البيانات.

## الخطوة 1: الجداول

أربعة جداول: المقالات والتعليقات والوسوم وجدول الربط `post_tag`.

```js
module.exports = {
  up(schema) {
    schema.create('posts', (table) => {
      table.id()
      table.string('title', 200).unique()
      table.string('slug', 220).unique()
      table.text('body').nullable()
      table.boolean('published').default(false)
      table.integer('views').default(0)
      table.json('meta').nullable()
      table.timestamps()
    })

    schema.create('comments', (table) => {
      table.id()
      table.foreignId('post_id').constrained().cascadeOnDelete()
      table.string('author', 80)
      table.text('body')
      table.boolean('approved').default(false)
      table.timestamps()
    })

    schema.create('tags', (table) => {
      table.id()
      table.string('name', 60).unique()
      table.timestamps()
    })

    schema.create('post_tag', (table) => {
      table.id()
      table.foreignId('post_id').constrained().cascadeOnDelete()
      table.foreignId('tag_id').constrained().cascadeOnDelete()
    })
  },

  down(schema) {
    schema.dropIfExists('post_tag')
    schema.dropIfExists('tags')
    schema.dropIfExists('comments')
    schema.dropIfExists('posts')
  },
}
```

بعد إضافة ترحيل جديد شغّل `kreft migrate` (خادم التطوير يرحّل عند بدئه فقط). وإن نسيت ستجد الخطأ المفيد: `no such table: posts. Hint: Run kreft migrate`.

## الخطوة 2: النماذج

```js
const { Model } = require('kreftjs/server')

// Str.slug مناسب للاتينية. للعربية نبني الوصلة بأنفسنا ونُبقي الحروف العربية
const slugify = (text) => String(text).trim().toLowerCase()
  .replace(/[\u064B-\u065F\u0670\u0640]/g, '')      // التشكيل والتطويل
  .replace(/\s+/g, '-')
  .replace(/[^\p{L}\p{N}-]+/gu, '')
  .replace(/-+/g, '-')

class Post extends Model {
  static fillable = ['title', 'slug', 'body', 'published', 'meta']
  static casts = { published: 'boolean', meta: 'json' }

  comments() { return this.hasMany(require('./Comment')) }
  tags() { return this.belongsToMany(require('./Tag'), 'post_tag') }

  // scopes: تُسلسل كأنها دوال: Post.query().published().search('kreft')
  static scopePublished(q) { q.where('published', true) }
  static scopeSearch(q, text) {
    if (text) q.where((w) => w.where('title', 'like', `%${text}%`).orWhere('body', 'like', `%${text}%`))
  }

  // خطّاف: يعمل قبل الإنشاء
  static async creating(post) { post.slug ??= slugify(post.title) }
}

module.exports = Post
```

نقاط مهمة:

- **`scopePublished` و`scopeSearch`**: دوال استعلام قابلة لإعادة الاستخدام: `Post.query().published().search('كلمة')`.
- **`creating`**: خطّاف يعمل قبل الإنشاء ويملأ `slug`.
- **وصلات عربية:** `Str.slug` مصمم للاتينية؛ جرّبته فحوّل "أول" إلى `ا-ول`. لذلك كتبنا `slugify` يُبقي الحروف العربية (`\p{L}`) ويحذف التشكيل. النتيجة: `أول-مقال-في-kreft`.
- **`casts`**: `published` منطقي و`meta` JSON.

```js
const { Model } = require('kreftjs/server')

class Comment extends Model {
  static fillable = ['post_id', 'author', 'body', 'approved']
  static casts = { approved: 'boolean' }

  post() { return this.belongsTo(require('./Post')) }
}

module.exports = Comment
```

```js
const { Model } = require('kreftjs/server')

class Tag extends Model {
  static fillable = ['name']
  posts() { return this.belongsToMany(require('./Post'), 'post_tag') }
}

module.exports = Tag
```

## الخطوة 3: التحقق والاستجابة

```js
const { FormRequest } = require('kreftjs/server')

class StorePostRequest extends FormRequest {
  authorize(req) { return true }          // في مشروع بمصادقة: return req.user != null
  rules() {
    return {
      title: 'required|min:3|max:200|unique:posts,title',
      body: 'required',
      published: 'boolean',
    }
  }
  messages() {
    return { 'title.required': 'أعطِ المقال عنوانًا.', 'title.unique': 'هذا العنوان مستعمل من قبل.' }
  }
}

module.exports = StorePostRequest
```

```js
const { JsonResource } = require('kreftjs/server')

class PostResource extends JsonResource {
  toArray(req) {
    return {
      id: this.id,
      title: this.title,
      slug: this.slug,
      excerpt: String(this.body || '').slice(0, 140),
      views: this.views,
      published: this.published,
      created_at: this.created_at,
    }
  }
}

module.exports = PostResource
```

الـ Resource يتحكم بما يخرج من الـ API: هنا نخرج مقتطفًا من النص لا النص كله.

### قاعدة تحقق خاصة بالعربية

```bash
kreft make:rule ArabicName
```

```js
// قاعدة تحقق خاصة: اسم بالحروف العربية والمسافات فقط
class ArabicName {
  passes(attribute, value, data) {
    return /^[ء-يٱ-ۓ\s]{2,60}$/.test(String(value || '').trim())
  }

  message() {
    return 'اكتب :attribute بالحروف العربية فقط.'
  }
}

module.exports = ArabicName
```

وتُستعمل في مصفوفة مع القواعد النصية: `author: ['required', new ArabicName()]` (انظر المتحكم أدناه).

## الخطوة 4: المتحكم والمسارات

```js
const { response } = require('kreftjs/server')
const Post = require('../../Models/Post')
const Tag = require('../../Models/Tag')
const PostResource = require('../Resources/PostResource')
const ArabicName = require('../../Rules/ArabicName')
const StorePostRequest = require('../Requests/StorePostRequest')

class PostController {
  // GET /api/posts?q=كلمة&tag=kreft&page=2
  async index(req) {
    const query = Post.query().published().search(req.string('q')).latest('id')
    if (req.filled('tag')) query.whereHas('tags', (q) => q.where('name', req.string('tag')))
    return PostResource.collection(await query.paginate(5, req.integer('page', 1)))
  }

  // GET /api/posts/{slug}: يزيد المشاهدات ويحمّل العلاقات
  async show(req, slug) {
    const post = await Post.query().published().where('slug', slug).with('tags').firstOrFail()
    await post.increment('views')
    const comments = await post.comments().where('approved', true).get()
    return { ...post.toJSON(), comments }
  }

  // POST /api/posts
  async store(req) {
    const data = await StorePostRequest.validate(req)
    const post = await Post.create(data)
    const names = req.input('tags', [])
    const tags = []
    for (const name of names) tags.push((await Tag.where('name', name).first()) || (await Tag.create({ name })))
    await post.tags().sync(tags.map((t) => t.id))
    return response(new PostResource(post), 201)
  }

  // POST /api/posts/{id}/comments: تنتظر الموافقة
  async comment(req, id) {
    const post = await Post.findOrFail(id)
    const data = await req.validate({ author: ['required', new ArabicName()], body: 'required|min:2|max:1000' })
    return response(await post.comments().create({ ...data, approved: false }), 201)
  }
}

module.exports = PostController
```

وفي `routes/api.js`:

```js
const PostController = require('../app/Http/Controllers/PostController')
Route.get('/posts', [PostController, 'index'])
Route.post('/posts', [PostController, 'store'])
Route.get('/posts/{slug}', [PostController, 'show'])
Route.post('/posts/{id}/comments', [PostController, 'comment']).middleware('throttle:10,1')
```

ملاحظات:

- `index` يبحث ويرشّح بالوسم ويرقّم: `paginate(5, page)` تعيد `{ data, meta }`.
- `show` يزيد المشاهدات بـ `increment` ويجلب الوسوم والتعليقات الموافَق عليها فقط.
- `store` ينشئ الوسوم الجديدة ويربطها بـ `sync([...ids])`.
- `comment` محدود بـ `throttle:10,1` (10 في الدقيقة) والتعليق ينتظر الموافقة (`approved: false`).

> **تنبيه الصلاحيات:** هذا المشروع التجريبي بلا تسجيل دخول، فمسار `POST /posts` مفتوح. في مشروع حقيقي ضعه تحت `Route.middleware('auth')` واجعل `authorize()` في `StorePostRequest` تُرجع `req.user != null`، وللتعديل والحذف استعمل سياسة (`req.authorize('update', post)`) كما في الفصل السابع.

## جرّبه بنفسك

```bash
curl -H 'Content-Type: application/json' -d '{"title":"أول مقال في Kreft","body":"هذا نص المقال الأول","published":true,"tags":["kreft","js"]}' localhost:8000/api/posts
curl -H 'Content-Type: application/json' -d '{"title":"أول مقال في Kreft","body":"x"}' localhost:8000/api/posts   # 422: العنوان مستعمل
curl -G --data-urlencode 'q=مقال' localhost:8000/api/posts
curl 'localhost:8000/api/posts?tag=kreft'
```

نتائج حقيقية من تجربتنا:

- إنشاء مقال: `201` وشكله `{"data":{"id":…,"slug":"أول-مقال-في-kreft",…}}`.
- تكرار العنوان: `422` مع `"The title has already been taken."`.
- البحث والتصفية بالوسم يعيدان المقالات المطابقة فقط مع `meta` (`total`, `per_page`, `current_page`, `last_page`).
- تعليق باسم لاتيني: `422`، وباسم عربي: `201`.

> **رسالة بالاسم الخام:** رسالة القاعدة الخاصة أظهرت "اكتب author…" لأن اسم الحقل لم يُترجم. أضف `"attributes": { "author": "الاسم" }` إلى `lang/ar/validation.json` فتظهر "اكتب الاسم بالحروف العربية فقط".

## الخطوة 5: SEO من قاعدة البيانات

```js
const Post = require('../app/Models/Post')

module.exports = {
  '/': { title: 'مدونتي', description: 'مقالات عن البرمجة' },
  '/blog/:slug': async ({ slug }) => {
    const post = await Post.query().published().where('slug', slug).first()
    if (!post) return null                       // 404 حقيقي مع noindex
    return {
      title: post.title,
      description: String(post.body || '').slice(0, 150),
      schema: { '@type': 'Article', headline: post.title },
    }
  },
  urls: async () => (await Post.query().published().get()).map((p) => ({ path: '/blog/' + p.slug, lastmod: p.updated_at })),
}
```

اختبرناه بطلب يحاكي زاحفًا:

```bash
curl -A Googlebot "localhost:8000/blog/أول-مقال-في-kreft"
```

والنتيجة تحوي `<title>أول مقال في Kreft</title>` ووسم `description` من نص المقال. ومقال غير موجود يعيد 404 حقيقيًا مع `noindex` لأن الدالة أعادت `null`.

## الخطوة 6: صفحة القائمة مع بحث بتأخير

```html
<!-- pages/Blog.kreft -->
state text = ''          // ما يكتبه المستخدم
state query = ''         // ما نبحث به فعلًا (بعد التأخير)
state tag = ''
state page = 1

// تأخير البحث 300 مللي ثانية: لا طلب مع كل حرف
let timer
watch text {
  clearTimeout(timer)
  timer = setTimeout(() => { query = value; page = 1 }, 300)
}
on destroy { clearTimeout(timer) }

load posts = api.get('/api/posts', { query: { q: query || undefined, tag: tag || undefined, page } })

derive meta = posts.data ? posts.data.meta : null

action pick(name) { tag = tag === name ? '' : name; page = 1 }

<view>
  <h1>المدونة</h1>

  <input type="search" k-model="text" placeholder="ابحث…">
  <p>
    <button k-each="t in ['kreft', 'js']" k-key="t" class={tag === t ? 'primary' : ''} @click="pick(t)">#{t}</button>
  </p>

  <p k-if="posts.loading && !posts.loaded">جارٍ التحميل…</p>
  <section k-else>
    {for p in posts.data ? posts.data.data : [] key p.id}
      <article>
        <h3><kreft-link to={'/blog/' + p.slug}>{p.title}</kreft-link></h3>
        <p>{p.excerpt} · {p.views} مشاهدة</p>
      </article>
    {empty}
      <p>لا مقالات تطابق بحثك.</p>
    {/for}
  </section>

  <p k-if="meta">
    <button disabled={page <= 1} @click="page--">السابق</button>
    {page} / {meta.last_page}
    <button disabled={page >= meta.last_page} @click="page++">التالي</button>
  </p>
</view>
```

ثلاثة أفكار في هذا الملف:

1. **`text` و`query`:** نفصل ما يكتبه المستخدم عمّا نطلبه فعلًا. `watch text` يؤجل تحديث `query` 300 مللي ثانية، فتتجمع الضغطات.
2. **`load posts`** يقرأ `query` و`tag` و`page` فيعيد الجلب تلقائيًا عند تغيّر أي منها.
3. **`on destroy`** ينظّف المؤقت.

وفي اختبارنا بالمتصفح: كتابة أربعة أحرف متتالية بسرعة أنتجت **طلبًا واحدًا** فقط.

ضع المسار في `routes/web.kreft`:

```js
Route.view('/blog', 'pages/Blog.kreft').name('blog').title('المدونة')
```

## تمارين

1. أضف صفحة `/blog/:slug` تعرض المقال والتعليقات ونموذج تعليق بـ `form()` يطبّق القاعدة العربية على الواجهة أيضًا.
2. أضف عدّادًا لمشاهدات اليوم بتخزين العدّاد في الذاكرة المؤقتة (`Cache`) وحفظه في قاعدة البيانات دفعة واحدة كل دقيقة بمهمة مجدولة.
3. أضف لوحة إدارة لموافقة التعليقات `PATCH /comments/{id}` تحت `auth` و`admin`.
