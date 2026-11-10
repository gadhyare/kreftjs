# الفصل السابع: المصادقة والوسطاء والأمان

## صفحات الدخول الجاهزة

المشاريع الجديدة (بلا `--no-auth`) تأتي بكل شاشات الدخول والواجهة الخلفية التي وراءها:

| الصفحة | العنوان | ماذا تفعل |
|---|---|---|
| `pages/auth/Login.kreft` | `/login` | الدخول بالبريد وكلمة المرور. |
| `pages/auth/Register.kreft` | `/register` | إنشاء حساب مع بريد لتأكيد العنوان. |
| `pages/auth/ForgotPassword.kreft` | `/forgot-password` | يرسل رابطًا لاختيار كلمة مرور جديدة. |
| `pages/auth/ResetPassword.kreft` | `/reset-password/:token` | الرابط القادم في ذلك البريد. |
| `pages/auth/VerifyEmail.kreft` | `/verify-email` | "تحقق من بريدك"، ورابطه يفتح `/verify-email/:id/:hash`. |
| `pages/auth/ConfirmPassword.kreft` | `/confirm-password` | أعد كتابة كلمة المرور قبل أمر خطير. |
| `pages/Dashboard.kreft` و`pages/Profile.kreft` | `/dashboard` و`/profile` | أول صفحة بعد الدخول؛ إعدادات الحساب. |

## كيف يعمل الدخول

- الدخول يضع رمزًا في **كوكي HttpOnly**. سكربتات الصفحة لا تقرؤه، فلا يسرقه سكربت محقون في الصفحة. وفي قاعدة البيانات يُخزَّن تجزئة الرمز فقط.
- كل تغيير (POST وPUT وPATCH وDELETE) يحتاج ترويسة `X-XSRF-TOKEN` مطابقة لكوكي `XSRF-TOKEN`. و`Kreftjs.api` يفعل ذلك عنك.
- أي سكربت أو تطبيق يرسل `device_name` عند الدخول يحصل على **رمز API** (`Authorization: Bearer 5|…`) بدل الكوكي.
- كلمات المرور تُجزَّأ بـ scrypt. روابط الاستعادة تنتهي بعد 60 دقيقة وتُخرج المستخدم من كل مكان.
- معرّف الجلسة يتغير عند كل دخول، فلا يمكن زرع جلسة في متصفح مسبقًا.

على الخادم:

```js
Route.middleware(['auth', 'verified']).group(() => {
  Route.get('/orders', [OrderController, 'index'])               // req.user هو المستخدم
})

Route.delete('/account', /* … */).middleware(['auth', 'password.confirm'])   // يطلب كلمة المرور مجددًا (423)
```

مساعدات تستعملها في أي مكان بالواجهة الخلفية:

```js
const { Hash, Str, Url, Mail, Crypt } = require('kreftjs/server')

Hash.make('secret')                      // خزّن هذه، لا كلمة المرور أبدًا
Hash.check('secret', user.password)      // true أو false
Str.random(40)                           // رمز عشوائي
Url.signed('/verify-email/5/abc', 60)    // رابط يعمل 60 دقيقة دون تغيير
await Mail.send({ to, subject, text })   // يُطبع في الطرفية حتى تضبط MAIL_URL
```

## حمايات في مسارات الدخول

- الزوار لهم `throttle:6,1`: ست محاولات في الدقيقة لكل عنوان.
- كل **حساب** يُقفَل أيضًا بعد `LOGIN_MAX_FAILURES` (10) كلمات مرور خاطئة في `LOGIN_WINDOW_SECONDS` (15 دقيقة)، أيًّا كان عنوان المحاولات. بعدها حتى الكلمة الصحيحة تعطي `429` حتى تنتهي النافذة.
- رموز المصادقة الثنائية تُعدّ لكل حساب أيضًا: `TWO_FACTOR_MAX_FAILURES` (8) رمزًا خاطئًا يقفل الحساب، وبدء دخول جديد لا يصفّر العدّ.
- "نسيت كلمة المرور؟" تعطي الجواب نفسه سواء كان للعنوان حساب أو لا.
- تغيير البريد يحتاج تأكيد كلمة المرور في آخر 3 ساعات (الجواب `423`)، لأن العنوان هو ما تثق به استعادة كلمة المرور.

## المصادقة الثنائية والأجهزة ورموز API

- **المصادقة الثنائية:** رموز تطبيق المصادقة (TOTP) ورموز استرداد. كل رمز استرداد يعمل مرة واحدة.
- **الأجهزة:** `/profile` يعرض المتصفحات المسجّلة، ويمكن إخراج أي منها.
- **رموز API:** تُنشأ في `/profile` بالصلاحيات `read` و`create` و`update` و`delete`. الرمز لا يستعمل إلا طرق HTTP التي تسمح بها صلاحياته، على **كل** مسار (`GET` تحتاج `read`، و`POST` تحتاج `create`، و`PUT`/`PATCH` تحتاج `update`، و`DELETE` تحتاج `delete`). جلسات المتصفح ورموز `*` فقط تدير الرموز وكلمة المرور والحساب.

### المديرون

المدير مستخدم عموده `is_admin` صحيح. المستخدم التجريبي مدير؛ وامنح غيره الصلاحية من صفحة المستخدمين أو بـ `kreft make:admin you@example.com`. واستعمل `Route.middleware(['auth', 'admin'])` لمسارات المديرين.

## الوسطاء (Middleware)

الوسيط يعمل قبل المتحكم، ويمكنه إيقاف الطلب أو تغيير الجواب:

```js
// app/Http/Middleware/EnsureIsAdmin.js     ('ensure-is-admin' في مسار، أو 'ensure-is-admin:editor')
const { abort } = require('kreftjs/server')

class EnsureIsAdmin {
  async handle(req, next, role = 'admin') {
    if (!req.user || req.user.role !== role) abort(403)
    const response = await next(req)               // المتحكم يعمل هنا
    return response.header('X-Checked', 'yes')
  }
}

module.exports = EnsureIsAdmin
```

الاسم في المسار يجد ملفه في `app/Http/Middleware`: `'auth'` هو `Authenticate.js`، و`'ensure-is-admin'` هو `EnsureIsAdmin.js`.

### الوسطاء المدمجة

| الوسيط | ماذا يفعل |
|---|---|
| `throttle:60,1` | تحديد المعدل: 60 طلبًا في الدقيقة لكل زائر ومسار، ثم `429`. |
| `csrf` | يفحص رمز CSRF على POST وPUT وPATCH وDELETE (`419` عند الخطأ). |
| `can:ability,model` | فحوص السياسات عبر `Gate.authorize()`. |
| `auth` و`guest` و`verified` و`password.confirm` | مجموعة الدخول من `app/Http/Middleware`. |

ولكل المسارات اذكر الوسطاء في `app/Http/Kernel.js`:

```js
module.exports = {
  middleware: ['throttle:120,1'],
}
```

استثنِ مسارًا بـ `.withoutMiddleware('csrf')`، أو `new VerifyCsrfToken({ except: ['webhooks/*'] })`.

## السياسات (Policies) والتفويض

```js
// app/Policies/PostPolicy.js
class PostPolicy {
  update(user, post) { return user.id === post.user_id }
  delete(user, post) { return user.is_admin || user.id === post.user_id }
}
module.exports = PostPolicy
```

```js
// في متحكم
async update(req, id) {
  const post = await Post.findOrFail(id)
  await req.authorize('update', post)        // 403 إن رفضت السياسة
  await post.update(await UpdatePostRequest.validate(req))
  return post
}
```

وللتوليد: `kreft make:policy PostPolicy`. وكتابة `can:update,post` في الوسيط تفعل الشيء نفسه على مستوى المسار.

## قائمة فحص قبل الإنتاج

| الفحص | لماذا |
|---|---|
| `NODE_ENV=production` و`APP_ENV=production` | يطفئ صفحات التصحيح ويفعّل HSTS وتحويل https ويجعل أخطاء الأمان قاتلة. |
| `APP_DEBUG=false` | لا تُظهر آثار المكدّس أو الشيفرة للزوار أبدًا. |
| `APP_KEY` بمفتاح من 32 بايت (`kreft key:generate`) | في الإنتاج يرفض التطبيق البدء بمفتاح أقل من 16 بايت. |
| `APP_URL=https://your.site` | تُستعمل لروابط البريد وتحويل https والكوكيز الآمنة. |
| `TRUSTED_PROXIES` إن استعملت وسيطًا | وإلا يشترك كل الزوار في عنوان الوسيط وحدود المعدل. |
| `DATABASE_URL` حقيقي وخطة نسخ احتياطي | SQLite تكفي للصغير؛ استعمل MySQL أو PostgreSQL لعدة خوادم. |
| `CACHE_STORE=redis` أو `database`، و`QUEUE_CONNECTION=redis` أو `database` | `memory` لكل عملية على حدة. وأقفال الحسابات في الذاكرة المؤقتة. |
| `MAIL_URL` مضبوط | وإلا تُطبع الرسائل في الطرفية فقط. |
| `MCP_TOKEN` مضبوط، أو MCP مطفأ | نقطة MCP معطلة في الإنتاج بدونه. |
| لا مستخدم تجريبي | لا تشغّل `--seed` على الإنتاج؛ واحذف `test@example.com`. |
| HTTPS أمام التطبيق مع `FORCE_HTTPS=true` | الكوكيز `Secure` في الإنتاج. |
| `npm audit` و`kreft update` | أصلح الثغرات المعروفة قبل الإصدار. |

> **ملاحظة:** Kreft لا يغني عن مراجعة أمنية. للأنظمة الحساسة، ادعُ متخصصًا لمراجعة التطبيق والبنية والاعتماديات.

## أدوات الحماية في الواجهة

- القيم تُهرَّب دائمًا في القوالب. و`k-html` يُنظَّف من السكربتات لكن اربط HTML تثق به فقط.
- التطبيق المبني (`kreft build`) لا يستعمل `eval` ولا `new Function`، فتعمل معه سياسة أمان المحتوى (CSP) الصارمة.
- `Kreftjs.env` يحمل المتغيرات التي تبدأ بـ `PUBLIC_` فقط؛ لا تضع سرًّا في واحد منها.

## تمارين

1. أنشئ سياسة `ProductPolicy` تسمح للمدير فقط بالحذف، واختبرها برمز API محدود الصلاحيات.
2. أضف وسيطًا `ensure-subscribed` يجيب `402` لمن ليس مشتركًا.
3. فعّل المصادقة الثنائية لحسابك من `/profile` واحتفظ برموز الاسترداد.

## أمان الحزم الخارجية

راجع [الفصل 24](24-package-security.md) لتثبيت حزم npm عبر فحص الشجرة والتنبيهات والرخص والسلامة، ثم اتخاذ قرار Allow أو Disallow. الموافقة لا تتجاوز سياسة الحظر، وتبقى سكربتات التثبيت معطلة.
