# الفصل الرابع: الموجِّه والبيانات والنماذج

## تعريف المسارات

```js
const router = Kreftjs.router({
  routes: [
    { path: '/', component: 'pages/Home.kreft', meta: { title: 'الرئيسية' } },
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
    <kreft-link to="/">الرئيسية</kreft-link>
    <kreft-link to="/users/{user.id}">الملف الشخصي</kreft-link>
  </nav>
  <kreft-view></kreft-view>
</view>
```

مع `props: true` يصل المعامل `:id` كـ prop:

```html
<!-- pages/User.kreft -->
prop id
derive user = users.find(id)
action back() { $router.back() }
```

| الميزة | الطريقة |
|---|---|
| المسار الحالي | `$route.path` و`$route.params.id` و`$route.query.tab` و`$route.meta` |
| التنقل | `$router.go('/users/5?tab=info')` و`$router.replace(to)` و`$router.back()` |
| الرابط النشط | الفئتان `kreft-link-active` و`kreft-link-exact` |
| عنوان الصفحة | `meta: { title: '…' }` |
| فحص قبل كل صفحة | `router.before((to, from) => …)`. أرجع `false` للإيقاف أو مسارًا للذهاب إليه. |
| فحص مسار واحد | `guard: (to, from) => …` |
| بعد كل صفحة | `router.after((to, from) => …)` |

كل ملف صفحة يُحمَّل أول مرة يفتحها أحد.

## ملفات المسارات

المشاريع الجديدة تحفظ صفحاتها في `frontend/routes/web.kreft`، و`index.html` يشير إليه فقط:

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
Route.view('/', 'pages/Home.kreft').name('home').title('الرئيسية')
Route.view('/posts/:id', 'pages/Post.kreft')

Route.middleware('auth').group(() => {
  Route.view('/dashboard', 'pages/Dashboard.kreft').middleware('verified')
})

Route.layout('guest').middleware('guest').group(() => {
  Route.view('/login', 'pages/auth/Login.kreft').title('تسجيل الدخول')
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

| على المسار | ماذا يفعل |
|---|---|
| `.name('home')` | `$router.go({ name: 'home' })` |
| `.title('Home')` | عنوان الصفحة. |
| `.layout('guest')` و`.layout('none')` | تخطيط آخر أو بلا تخطيط. |
| `.middleware('auth', 'role:editor')` | ينفّذ هذه قبل الصفحة. |
| `.meta({ … })` | أي شيء آخر، في `$route.meta`. |
| `.children(() => …)` | صفحات متداخلة تظهر في `<kreft-view>` الخاص بالصفحة. |

> **ملاحظة:** وسيط `auth` في المتصفح يقرر أي الشاشات تُعرض فقط. هو لا يحمي البيانات: كل مسار API يجب أن يفحص المستخدم على الخادم.

## التخطيطات (Layouts)

التخطيط هو الإطار حول صفحاتك: الشريط والقائمة والتذييل. ضعه في `layouts/` واستعمل `<slot>` حيث تذهب الصفحة.

```html
<!-- layouts/app.kreft -->
state menuOpen = false

<view>
  <header>…</header>
  <main><slot></slot></main>
</view>
```

| أين | ماذا تكتب |
|---|---|
| كل الصفحات | `Kreftjs.router({ layout: 'app', routes })` |
| مسار واحد وأبناؤه | `{ path: '/admin', component: …, layout: 'admin' }` |
| داخل ملف صفحة | `layout admin` في سطر وحده |
| بلا تخطيط | `layout: false` على المسار أو `layout none` في الصفحة |

عند انطباق أكثر من واحد: المسار يغلب، ثم ملف الصفحة، ثم الموجِّه. التنقل بين صفحتين تستعملان التخطيط نفسه يُبقي التخطيط على الشاشة مع حالته.

وللصفحة أن تملأ أماكن أخرى في تخطيطها:

```html
<!-- في التخطيط -->
<kreft-yield name="actions">يظهر إن لم يكن للصفحة هذا القسم</kreft-yield>

<!-- في الصفحة -->
<kreft-section name="actions">
  <button class="primary" @click="save()">حفظ</button>
</kreft-section>
```

## صفحات الأخطاء

لكل خطأ HTTP صفحته في `errors/`. فعّلها بـ `errors: 'errors'` في الموجِّه:

```text
errors/401.kreft 402.kreft 403.kreft 404.kreft 419.kreft 429.kreft 500.kreft 503.kreft
errors/error.kreft      أي حالة أخرى
errors/minimal.kreft    الإطار المشترك
```

عنوان غير معروف يعرض `errors/404.kreft`. ومن أي ملف `.kreft` يعرض `abort(404)` الصفحة المناسبة:

```html
prop id
load post = api.get('/api/posts/' + id)
watch post.error { if (post.error && post.error.status === 404) abort(404) }
```

## العناوين النظيفة

يستعمل الموجِّه افتراضيًا عناوين بلا `#` (`/users/5`). ويلزم لذلك أمران:

1. وسم `<base href="/">` في `index.html` (استعمل `<base href="/demo/">` إن كان التطبيق في مجلد).
2. أن يرسل الخادم `index.html` لكل مسار صفحة، حتى لا يكون إعادة تحميل `/users/5` خطأ 404. الأمر `npm run dev` يفعل هذا عنك.

> **تنبيه مهم عند النشر:** إن بنيت الموقع بقاعدة خاطئة (مثلًا `/demo/`) وهو في الجذر، ستظهر صفحة بيضاء لأن المتصفح يطلب الملفات من `/demo/app.js`. ابنِ بـ `kreft build --base /`. تفاصيل أكثر في فصل النشر.

إن لم تستطع تغيير الخادم فاستعمل `mode: 'hash'`؛ فتصير العناوين `/#/users/5`.

## جلب البيانات

العميل العام `api` متاح في كل ملف `.kreft`، وكذلك `Kreftjs.api` في JavaScript العادي:

```js
const users = await api.get('/api/users', { query: { page: 2 } })
const user  = await api.post('/api/users', { name: 'سارة أحمد' })
await api.put('/api/users/1', user)
await api.patch('/api/users/1', { status: 'active' })
await api.delete('/api/users/1')
```

### load: تحميل البيانات

`load` يعلن مصدرًا تفاعليًا. يتولى حالة التحميل والخطأ ويجلب من جديد إذا تغيّرت القيم التي يقرؤها:

```html
<!-- pages/Posts.kreft -->
state query = ''
state page = 1

load posts = api.get('/api/posts', { query: { q: query || undefined, page } })

<view>
  <input type="search" k-model.lazy="query" placeholder="ابحث في المقالات…">

  <p k-if="posts.loading">جارٍ تحميل المقالات…</p>
  <div k-elif="posts.error">
    فشل التحميل: {posts.error.message}
    <button @click={posts.reload}>حاول مجددًا</button>
  </div>
  <div k-else>
    {for post in posts.data || [] key post.id}
      <article><h3>{post.title}</h3><p>{post.body}</p></article>
    {empty}
      <p>لا نتائج لـ "{query}".</p>
    {/for}
  </div>

  <button @click={() => page++}>الصفحة التالية ({page})</button>
</view>
```

| الخاصية | المعنى |
|---|---|
| `posts.data` | النتيجة (`null` حتى تُحمَّل). |
| `posts.loading` | `true` أثناء الطلب. |
| `posts.loaded` | `true` بعد وصول أول جواب. |
| `posts.error` | الخطأ أو `null`. |
| `posts.reload()` | اجلب الآن من جديد. |

### الجداول

للجداول التي يقدّمها `kreft dev --db` أو واجهة الجداول التلقائية، يعطيك `table(name)` استدعاءات جاهزة:

```html
const posts = table('posts')

load list = posts.all({ q: search, _sort: '-created_at', _limit: 10 })

action createPost() {
  const created = await posts.create({ title: 'مقال جديد' })
  list.data = [created, ...list.data]
}
```

الدوال: `all(query)` و`find(id)` و`count(query)` و`create(data)` و`update(id, data)` (PUT) و`patch(id, data)` و`remove(id)`.

### الأخطاء

الطلب الفاشل يرمي `ApiError` فيه `status` و`message` و`data` و`errors` (رسائل التحقق). مشاكل الشبكة وانتهاء المهلة لها `status` يساوي 0.

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

### الإعدادات

```js
Kreftjs.api.setup({
  base: '/api',                               // فيصير api.get('users') هو /api/users
  token: () => Kreftjs.storage.get('token'),  // يُرسل كـ Authorization: Bearer …
  headers: { 'Accept-Language': 'ar' },
  timeout: 10000,
})

Kreftjs.api.onError((e) => { if (e.status === 401) location.href = '/login' })

const github = Kreftjs.api.create({ base: 'https://api.github.com' })    // عميل ثانٍ
```

خيارات للطلب الواحد: `query` و`headers` و`timeout` و`signal` (للإلغاء) و`full: true` (يعيد `{ data, status, headers }`).

الطلبات إلى خادمك تُرسل أيضًا `X-XSRF-TOKEN` من كوكي `XSRF-TOKEN` (و`X-CSRF-TOKEN` من `<meta name="csrf-token">`)، و`X-Requested-With`.

### واجهة تجريبية للتدرّب

```bash
kreft dev --api db.json              # واجهة REST على /api من ملف JSON
kreft dev --api db.json --delay 500  # أجب ببطء لترى حالات التحميل
```

> **تحذير:** `--api` و`--db` للتطوير فقط. لا تسجيل دخول فيهما. في الإنتاج اكتب مسارات حقيقية.

## النماذج والتحقق

أعطِ النموذج قواعده بأسلوب تصريحي. النموذج الذي فيه أخطاء لا يُرسل أبدًا:

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
    <button disabled={post.$busy}>حفظ</button>
  </form>
</view>
```

| على النموذج | ما هو |
|---|---|
| `post.title` و`post.email` | القيم، لـ `k-model`. |
| `post.$error('title')` | أول رسالة للحقل أو `''`. |
| `post.$errors` | كل الرسائل: `{ title: ['…'] }`. |
| `post.$valid` و`post.$busy` | لا أخطاء / يُرسل الآن. |
| `post.$submit(send)` | يفحص ثم يستدعي `send(values)`. وخطأ 422 من الخادم يملأ الأخطاء نفسها. يعيد `false` إن لم يُرسل. |
| `post.$check()` و`post.$reset(values?)` و`post.$setErrors(e)` | افحص الآن / ابدأ من جديد / اعرض أخطاء من مكان آخر. |

تظهر الأخطاء بعد أول إرسال، ثم تتبع كتابتك.

بلا نموذج: `validate(values, rules)` يعطي `{}` أو `{ field: ['…'] }`. ورسائلك الخاصة في الوسيط الثالث:

```js
form(values, rules, { messages: { 'title.required': 'اكتب عنوانًا.' } })
```

أسماء القواعد نفسها تعمل على الخادم في `req.validate()`، فمجموعة قواعد واحدة تصف الطرفين.

### كلمات المرور

القاعدة `not_common_password` ترفض الكلمات الشائعة (`password` و`12345678` …) وحرفًا مكرّرًا (`aaaaaaaa`) وتسلسلًا بسيطًا (`abcdefgh`) وما يطابق البريد. تستعملها المشاريع الجديدة مع `min:8`:

```js
password: 'required|min:8|confirmed|not_common_password'
```

هي قائمة قصيرة تعمل دون اتصال، فتمسك أسوأ الاختيارات فقط. ارفع `min` لما هو أطول (عبارة من أربع كلمات خير من خليط قصير من الرموز).

## تمارين

1. اكتب صفحة `Posts` فيها بحث وترقيم صفحات بـ `load`، مع زر "حاول مجددًا" عند الخطأ.
2. اكتب نموذج تسجيل بقواعد `required|email` و`required|min:8|confirmed`، وارسمه برسائل خطأ بالعربية.
3. أنشئ مسارات متداخلة: `/account/settings` مع تبويبين `general` و`mail`.
