# الفصل الثامن: العمل في الخلفية: الطوابير والبريد والذاكرة المؤقتة والجدولة

لكل أداة مجلدها في `backend/app/` وأمر `kreft make:` يولّد ملفها:

```js
await dispatch(new SendWelcome(user))                   // app/Jobs: يعمل في الخلفية (محاولات، وانتظار، وfailed())
await event(new OrderShipped(order))                    // app/Listeners
await Mail.to(user).send(new WelcomeMail(user))         // app/Mail: موضوع، نص، html أو markdown({ … })
await user.notify(new InvoicePaid(invoice))             // app/Notifications: قنوات 'mail' و 'database'
await Cache.remember('stats', 600, () => loadStats())   // قاعدة بيانات أو ملف أو ذاكرة أو redis (CACHE_STORE)
const path = await req.file('avatar').store('avatars')  // الرفع؛ Storage.url(path) هو /storage/avatars/…
```

## المهام (Jobs)

```bash
kreft make:job SendReport
```

```js
// app/Jobs/SendReport.js
const { Job } = require('kreftjs/server')

class SendReport extends Job {
  static tries = 3        // أعد المحاولة بعد خطأ، حتى 3 مرات
  static backoff = 10     // ثوانٍ بين المحاولات

  constructor(data) {
    super()
    this.data = data      // النماذج تُخزَّن كمعرّف وتُقرأ من جديد عند التشغيل
  }

  async handle() {
    // العمل نفسه
  }

  failed(error) {
    // بعد آخر محاولة
  }
}

module.exports = SendReport
```

`Job.dispatch(...)` يعيد كائنًا يمكن تسلسل دوال عليه (`delay(seconds)` و`onQueue(name)`) ثم `await`:

```js
await SendReport.dispatch(user)
await SendReport.dispatch(user).delay(60).onQueue('mail')
```

> **تحذير:** `dispatch` يرسل المهمة عندما تكتب `await` (أو `.then`). استدعاؤه ونسيان `await` لا يرسل شيئًا.

المهام والمستمعون والبريد والإشعارات المضافة للطابور تعمل في الخلفية. `kreft dev` و`kreft serve` يعالجان جدول `jobs` كل ثانية. وللتحكم بالعمّال: `kreft queue:work` و`queue:failed` و`queue:retry all` و`queue:flush`. اختر المشغّل بـ `QUEUE_CONNECTION` (`database` أو `redis` أو `sync`).

- **`sync`**: تشغيل فوري في نفس الطلب. ممتاز للاختبارات.
- **`database`**: جدول `jobs`. لا شيء إضافي.
- **`redis`**: الأسرع، ويدعم التأخير. يلزم `REDIS_URL`.

## الأحداث والمستمعون

```js
// app/Events/OrderPlaced.js
class OrderPlaced {
  constructor(order) { this.order = order }
}
module.exports = OrderPlaced
```

```js
// app/Listeners/LogOrder.js
class LogOrder {
  static event = 'OrderPlaced'      // كل مستمع له static event
  // static queue = true            // شغّله لاحقًا على الطابور

  async handle(event) {
    console.log(`[order] #${event.order.id}`)
  }
}
module.exports = LogOrder
```

```js
await event(new OrderPlaced(order))      // يعمل كل المستمعين لهذا الحدث
```

الأحداث تفصل "ما حدث" عن "ماذا نفعل بعد ذلك". أضف مستمعًا جديدًا (إرسال رسالة، تحديث إحصاء) دون أن تلمس شيفرة الطلب.

## البريد

```bash
kreft make:mail OrderReceipt
```

```js
// app/Mail/OrderReceipt.js
const { Mailable } = require('kreftjs/server')

class OrderReceipt extends Mailable {
  constructor(order) {
    super()
    this.order = order
  }

  build() {
    return this.subject(`إيصال الطلب #${this.order.id}`).markdown({
      greeting: 'شكرًا لطلبك',
      lines: [`المجموع: ${(this.order.total_cents / 100).toFixed(2)} $`],
      action: { text: 'افتح التطبيق', url: process.env.APP_URL || '/' },
    })
  }
}
module.exports = OrderReceipt
```

```js
await Mail.to(user.email).send(new OrderReceipt(order))        // الآن
await Mail.to(user.email).queue(new OrderReceipt(order))       // على الطابور
await Mail.to(user.email).later(600, new OrderReceipt(order))  // بعد 10 دقائق
```

> **ملاحظة:** حتى تضبط `MAIL_URL` في `.env` تُطبع الرسائل في الطرفية بدل أن تُرسل. وهذا مناسب جدًا للتطوير: ترى الرسالة التي كانت ستصل.

## الذاكرة المؤقتة (Cache)

```js
const stats = await Cache.remember('stats', 600, () => loadStats())   // احسب مرة كل 10 دقائق
await Cache.put('k', 'v', 60)
await Cache.get('k')
await Cache.forget('k')
```

متى تُبطل الذاكرة؟ عندما يتغير ما تعتمد عليه:

```js
async store(req) {
  const product = await Product.create(await req.validate({ name: 'required' }))
  await Cache.forget('products:list')          // أبطل القائمة المؤقتة
  return product
}
```

المخازن: `database` أو `file` أو `memory` أو `redis`، بحسب `CACHE_STORE`. `memory` تخص العملية الواحدة؛ لعدة خوادم استعمل `database` أو `redis`.

### الأقفال (Locks)

القفل الذري يضمن أن عملية واحدة فقط تدخل المقطع الحرج:

```js
// أسلوب الدالة: يُحرَّر القفل وحده
await Cache.lock('checkout:' + key, 15, async () => {
  // مقطع لا يدخله إلا واحد في كل مرة (تنتهي صلاحية القفل بعد 15 ثانية)
})

// أسلوب الكائن
const lock = await Cache.lock('report', 30)
if (lock) {
  try { /* العمل */ } finally { await lock.release() }
}

// انتظر حتى 5 ثوانٍ للحصول عليه
await Cache.lock('report', 30).block(5, async () => { /* … */ })
```

استعمالها الكلاسيكي: منع النقر المزدوج على "ادفع" من إنشاء طلبين (انظر الفصل الثاني عشر).

## الملفات المرفوعة

```js
const path = await req.file('avatar').store('avatars')
```

يحفظ باسم عشوائي ولا يثق بالاسم الأصلي أبدًا. فقط الامتدادات المعروفة (صور، PDF، نص، مكتب، صوت، فيديو، أرشيفات) تحتفظ بامتدادها؛ وغيرها يُخزَّن `.bin`. استعمل `file.isImage()` لتفحص ترويسة الملف الحقيقية لا اسمه فقط.

الملفات في القرص العام تُخدَّم من `/storage/…` كتنزيلات بيانات خام، فلا يمكن لـ `.html` أو `.svg` مرفوع أن يشغّل سكربتات في موقعك.

```js
const url = Storage.url(path)          // /storage/avatars/xxxx.png
```

## الجدولة (Scheduling)

```js
// backend/routes/console.js
Schedule.call(async () => { await Post.onlyTrashed().forceDelete() }).daily().name('clean-trash')
Schedule.job(new SendReport()).weekdays().at('08:00')
Schedule.command('send:report Daily').hourly()
```

`kreft dev` و`kreft serve` يفحصان الجدول كل دقيقة. اضبط `SCHEDULER=off` لتشغّله من cron بـ `kreft schedule:run`؛ و`kreft schedule:list` يعرض ما هو مخطط.

## Redis

لدى Kreft عميل Redis خاص به (RESP2 عبر TCP أو TLS) بلا حزمة إضافية. يعمل مع Redis وValkey وخدمات Redis المستضافة.

```env
CACHE_STORE=redis
QUEUE_CONNECTION=redis
REDIS_URL=rediss://default:secret@host:6379/0      # أو REDIS_HOST وREDIS_PORT وREDIS_USERNAME وREDIS_PASSWORD وREDIS_DB
REDIS_PREFIX=kreft_
```

```bash
kreft redis:ping        # PONG (1ms) — 127.0.0.1:6379/0
```

Redis يعطيك أيضًا أقفالًا ذرية (`Cache.lock('report', 30)`) والنشر والاشتراك (publish/subscribe).

## الإعدادات

الإعدادات تأتي من `.env` و`backend/config/*.js` والقيم الافتراضية عبر مساعد واحد:

```js
const { config } = require('kreftjs/server')

config('app.name', 'My app')
config('database.default', 'sqlite')
config.has('redis.connections.default')
config.set('app.debug', false)
```

## الجلسات وعدم النشاط

طبقتان تخرجان المستخدم الغائب:

```env
SESSION_LIFETIME=120            # دقائق خمول قبل أن يُسقط الخادم الجلسة
PUBLIC_SESSION_TIMEOUT=15       # دقائق قبل أن ترسل الصفحة نفسها المستخدم إلى /login
PUBLIC_SESSION_WARNING=2        # دقائق تحذير قبل ذلك
AUTH_TOKEN_DAYS=30              # رمز لم يُستعمل هذه الأيام يتوقف
```

قيم `PUBLIC_` تُنسخ إلى المتصفح (`Kreftjs.env`)؛ لا تضع فيها أسرارًا أبدًا.

## خلف وسيط (Proxy)

عنوان الزائر يأتي من الاتصال. خلف nginx أو Cloudflare أو موزّع أحمال اذكر وسطاءك:

```env
TRUSTED_PROXIES=10.0.0.1          # أو *
TRUSTED_PROXY_HOPS=1              # مع *: كم وسيطًا أمامك
```

`X-Forwarded-For` يُقرأ من اليمين، فلا يستطيع الزائر اختيار عنوانه بنفسه.

## تمارين

1. اجعل تسجيل مستخدم جديد يطلق حدثًا `UserRegistered` له مستمعان: واحد يرسل بريد ترحيب على الطابور، وآخر يزيد عدّادًا في الذاكرة المؤقتة.
2. اكتب مهمة تحذف الملفات المؤقتة وجدولها كل ليلة الساعة 03:00.
3. استعمل `Cache.lock` لمنع تشغيل تقرير ثقيل مرتين في آن واحد.
