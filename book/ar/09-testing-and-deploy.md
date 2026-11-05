# الفصل التاسع: الاختبار والبناء والنشر

## اختبار الواجهة الخلفية

تُختبر شيفرة الخادم بمشغّل الاختبارات المدمج في Node وقاعدة SQLite في الذاكرة، فالاختبارات سريعة ولا تمس بياناتك الحقيقية.

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
  const db = await connect('sqlite::memory:')       // قاعدة فارغة جديدة لهذا الملف
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

لاختبار جداول مشروع كامل شغّل ترحيلاته الحقيقية بدل بناء المخطط يدويًا: `migrator.migrate(db, 'backend/database/migrations')`.

اختبارات المكوّنات للمتصفح تعيش في `frontend/tests/` وتُفتح بـ `kreft dev`.

## الأدوات المرافقة للتطوير

كل ما هنا يأتي مع Kreft:

**إعادة التحميل الفورية.** أثناء `kreft dev` احفظ ملف `.kreft` فيُبدَّل ذلك المكوّن وحده وتبقى حالته. وملف `.css` يُعاد تحميله بلا تحديث للصفحة، والخطأ يعرض طبقة فيها الملف والسطر.

**أدوات Kreft (DevTools).** زر **S** في الزاوية (أو <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd>) يفتح لوحة:

| التبويب | يعرض |
|---|---|
| Components | الشجرة الحية. اختر مكوّنًا لترى الخصائص والحالة والقيم المشتقة، وغيّر الحالة هناك. |
| Stores | قيم كل مخزن (قابلة للتغيير) و`$reset()`. |
| Route | المسار الحالي وكل المسارات، مع زر للذهاب إليها. |
| Timeline | أفعال المخازن ورسائل الـ bus حال وقوعها. |

الزر واللوحة موجودان تحت `kreft dev` فقط؛ التطبيقات المبنية لا تحتويهما أبدًا.

### مراقب الأخطاء

في التطوير، خطأ غير ملتقط على الخادم يعرض صفحة تفاعلية بدل رسالة مجردة: مستكشف مكدّس يخفي إطارات المكتبات ويبرز إطاراتك، ومعاينة للشيفرة حول السطر الفاشل، ومحرك اقتراحات للأخطاء الشائعة (خطأ إملائي في دالة نموذج، أو قراءة خاصية من `undefined`، أو جدول مفقود يحتاج `kreft migrate`)، والطلب كاملًا (مع إخفاء كلمات المرور والرموز والكوكيز). وتظهر الصفحة فقط حين `APP_ENV` ليس `production` و`APP_DEBUG` صحيح. **في الإنتاج الخطأ نفسه يجيب `Server error.` ببساطة**، بلا مكدّس أو أسماء ملفات.

## البناء (Build)

```bash
npm run build      # أو: kreft build
npm run preview    # افحص النتيجة: kreft dev dist
```

| الملف | ما هو |
|---|---|
| `index.html` | صفحتك، تحمّل الآن الملفات أدناه. |
| `kreftjs.js` | الإطار. |
| `app.js` | كل ملفات `.kreft`، مصرّفة. |
| `app.css` | كل كتل `<style>`؛ المحصورة محصورة فعلًا. |
| `main.js` | شيفرة `<script>` المضمنة في `index.html`. |
| `deps/` و`vendor/` | حزم npm وملفات CSS التي تستوردها ملفاتك، مصغّرة. |

ماذا تكسب:

- **أول تحميل أسرع:** يحمّل المتصفح `app.js` واحدًا ولا يصرّف شيئًا.
- **سياسة CSP صارمة تعمل:** كل تعبير يصير دالة حقيقية، فلا `eval` ولا `new Function` في التطبيق المبني.
- **أخطاء قبل النشر:** أي خطأ في أي ملف `.kreft` يوقف البناء ويسمي الملف والسطر.

خيارات: `kreft build ./site --out public` يبني مجلدًا آخر، و`--base /` يغيّر `<base href>`. و`--no-htaccess` يتخطى ملف `.htaccess`.

### القاعدة (base) الصحيحة: خطأ شائع جدًا

يحتفظ البناء بوسم `<base href="…">` المكتوب في `index.html` المصدر، ويضبط قواعد `.htaccess` عليه. **إن كان `index.html` المصدر يحمل قاعدة مجلد فرعي** (مثل `<base href="/demo/">` في مشروع `demo`) وأنت ترفع الموقع إلى الجذر، فالنتيجة **صفحة بيضاء**: المتصفح يطلب `/demo/app.js` فلا يجد شيئًا.

الحل: اذكر القاعدة صراحة عند البناء للنشر في الجذر:

```bash
kreft build --out dist/site --base /
```

وافحص `index.html` المبني: يجب أن ترى `<base href="/">`. وإن كان موقعك في مجلد فرعي `/blog/` فابنِ بـ `--base /blog/`.

### الرفع إلى استضافة

**استضافة ثابتة: Hostinger وcPanel وأي استضافة Apache.** ارفع ما **داخل** `dist/` (لا المجلد نفسه) إلى المجلد الذي يخدم الموقع، وهو عادة `public_html`. في hPanel من Hostinger: **Files ← File Manager ← public_html ← Upload**، أو استعمل FTP. لا تستعمل مستورِدات "framework" أو "Node.js app" لهذا: فهي تبحث عن `package.json` وتقول *Unsupported framework or invalid project structure* لأن `dist/` فيه ملفات منتهية فقط.

ويكتب `kreft build` ملف `dist/.htaccess`:

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

Apache لا يعرف إلا الملفات الموجودة على القرص، فبدون هذه القواعد يعطي `/docs` أو أي عنوان نظيف خطأ 404 عند فتحه أو إعادة تحميله. ومعها، كل عنوان صفحة (بلا امتداد وليس تحت `/api/`) ليس ملفًا حقيقيًا يفتح `index.html` ويتولى الموجِّه الباقي. ارفع الملف أيضًا (يبدأ بنقطة فبعض مديري الملفات يخفونه؛ فعّل "show hidden files").

ويضع `kreft build` أيضًا بصمة قصيرة في عنوان كل سكربت وملف أنماط (`app.js?v=28a965f6`)، ويطلب `.htaccess` من الاستضافة ألا تحتفظ بـ `index.html`. الاستضافات تخزّن `.js` و`.css` أيامًا، فبدون البصمة يظل الزوار يشغّلون الإطار والصفحات القديمة بعد رفع بناء جديد.

> **ملاحظة:** هذا يستضيف الواجهة الأمامية فقط. تسجيل الدخول وقاعدة البيانات وكل ما تحت `/api` يحتاج خادم Node.js الذي لا يشغّله Apache.

**خطة Node.js أو VPS.** ارفع المشروع كله (بلا `node_modules`)، لا `dist/`. أضف Kreft إلى اعتماداتك بـ `npm i kreftjs`، وابنِ بـ `npm run build`، وشغّل الخادم بـ `npm run serve` (يقرأ `PORT` الذي تضبطه استضافتك). سكربت `start` المولَّد يشغّل خادم التطوير فلا تستعمله في الإنتاج.

على VPS أبقِه يعمل بـ PM2 وضع nginx أمامه للنطاق وHTTPS:

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

ثم `sudo certbot --nginx -d example.com` يضيف HTTPS. اضبط `APP_ENV=production` و`APP_KEY` حقيقيًا في `.env` أولًا، وراجع [قائمة الفحص](07-auth-and-security.md).

## تحسين محركات البحث (SEO)

### صفحات HTML جاهزة: `--prerender`

```bash
npm i -D jsdom                              # مرة لكل مشروع
kreft build --prerender                       # كل مسار بلا :params
kreft build --prerender /users/1,/users/2     # وهذه العناوين أيضًا
```

كل صفحة تُفتح في متصفح محاكى، وتُحمَّل بياناتها، وتُحفظ النتيجة في `dist/<page>/index.html`، فيحصل الزوار ومحركات البحث على HTML منتهٍ.

الوسوم التي تضعها الصفحة بـ `.seo({...})` أو `meta` (الوصف، وcanonical، وOpen Graph، وTwitter، وhreflang، وJSON-LD، و`lang` و`dir`) تُحفظ في HTML الصفحة أيضًا، فتراها معاينات الروابط والزواحف التي لا تشغّل JavaScript.

### SEO لصفحات تأتي من قاعدة بياناتك: `backend/routes/seo.js`

```js
// backend/routes/seo.js
const Post = require('../app/Models/Post')

module.exports = {
  '/': { title: 'متجري', description: 'كل ما يحتاجه البيت' },
  '/blog/:slug': async ({ slug }) => {
    const post = await Post.query().published().where('slug', slug).first()
    if (!post) return null                  // 404 حقيقي مع noindex
    return {
      title: post.title,
      description: String(post.body || '').slice(0, 150),
      schema: { '@type': 'Article', headline: post.title },
    }
  },
  // عناوين صفحات بياناتك، لـ `kreft sitemap`
  urls: async () => (await Post.query().published().get()).map((p) => ({ path: '/blog/' + p.slug, lastmod: p.updated_at })),
}
```

`kreft dev` و`kreft serve` يجيبان طلب الصفحة بـ `index.html` مع وسوم أول عنوان مطابق. واضبط `APP_URL` لتحصل كل صفحة على `canonical`.

### صفحات كاملة للزواحف

الزاحف أو معاينة الرابط (Googlebot وBingbot وWhatsApp وFacebook وX وTelegram …) الذي لا يشغّل JavaScript سيرى `<div id="app">` فارغًا. لهؤلاء يفتح `kreft dev` و`kreft serve` الصفحة في المتصفح المحاكى نفسه، وينتظر تحميل بياناتها، ويجيب بالصفحة مرسومة.

```bash
npm i -D jsdom        # مرة لكل مشروع
KREFT_SSR=bots          # الافتراضي: الزواحف ومعاينات الروابط فقط
KREFT_SSR=all           # كل زائر
KREFT_SSR=off           # أبدًا
KREFT_SSR_TTL=300       # ثوانٍ تحتفظ فيها بالصفحة المرسومة
```

### خريطة الموقع وrobots.txt

```bash
kreft sitemap --url https://example.com                  # public/sitemap.xml و public/robots.txt
kreft sitemap --url https://example.com --urls urls.js   # مع العناوين في ذلك الملف
```

## نشر الواجهة الخلفية

```bash
NODE_ENV=production kreft serve dist
```

وقبلها أنجز [قائمة الفحص قبل الإنتاج](07-auth-and-security.md).

## TypeScript

يعمل TypeScript في المتصفح (ملفات `.kreft` ووحدات `.ts`) وعلى الخادم (`routes/api.ts` و`app/**/*.ts` والترحيلات والبذور).

```bash
kreft new my-app --ts
```

داخل ملف `.kreft` يمكنك كتابة `interface` و`type` و`enum` و`import type`، و`prop` و`state` و`derive` و`saved` بأنواعها. والتنفيذ لا يحتاج إعدادًا: يستعمل Kreft الأداة `esbuild` إن وُجدت، وإلا إزالة الأنواع المدمجة في Node (22.6+)، وإلا مزيله الخاص بلا اعتماديات.

## تصحيح المشاكل الشائعة

| العَرَض | السبب المرجح | الحل |
|---|---|---|
| صفحة بيضاء بعد الرفع | `<base href>` خاطئ في `index.html` | ابنِ بـ `--base /` وأعد الرفع |
| `/docs` يعطي 404 عند التحديث | ملف `.htaccess` لم يُرفع | ارفعه (أظهر الملفات المخفية) |
| بقاء النسخة القديمة بعد الرفع | تخزين المتصفح أو الاستضافة | تأكد من رفع كل الملفات الجديدة بالبصمات |
| `no such table: …` | ترحيل جديد لم يُنفَّذ | `kreft migrate` |
| لا شيء يتغير في الصفحة | سطر `const` في السكربت | استعمل `state` أو `derive` |
| الإرسال لا يعمل مع `type="email"` | تحقق المتصفح الأصلي يسبق Kreft | أضف `novalidate` إلى `<form>` |

## تمارين

1. ابنِ تطبيقك بـ `--base /` وافتح `dist/index.html` وتحقق من وسم `<base>`.
2. أضف `backend/routes/seo.js` لمدونتك وافتح صفحة مقال بمتصفح يحاكي زاحفًا: `curl -A Googlebot …`.
3. اكتب اختبار نموذج لـ `Product` يتحقق من أن `scopeInStock` يستثني المنتجات التي مخزونها صفر.
