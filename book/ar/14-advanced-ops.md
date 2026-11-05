# الفصل الرابع عشر (متقدم): تقارير مجدولة ومهام موثوقة وتشغيل حقيقي

بعد أن يعمل التطبيق، يأتي العمل الذي لا يراه المستخدم: تقارير تُرسل وحدها، ومهام تعيد المحاولة عند الفشل، ونظام يُراقَب ويُنشر. الأمثلة هنا جُرِّبت على المتجر السابق.

## 1) تقرير يومي مجدول على الطابور

مهمة تحسب الأرقام وترسلها بالبريد، مع محاولات تلقائية عند الفشل:

```js
const { Job, Mail } = require('kreftjs/server')
const Order = require('../Models/Order')

class SendDailyReport extends Job {
  static tries = 3
  static backoff = 30        // ثانية بين المحاولات

  async handle() {
    const orders = await Order.query().count()
    const revenue = await Order.query().sum('total_cents')
    await Mail.send({
      to: process.env.ADMIN_EMAIL || 'admin@example.com',
      subject: 'التقرير اليومي',
      text: `الطلبات: ${orders}\nالإيرادات: ${(revenue / 100).toFixed(2)} $`,
    })
    console.log(`[report] orders=${orders} revenue=${revenue}`)
  }

  failed(error) {
    console.error('[report] failed:', error.message)
  }
}

module.exports = SendDailyReport
```

- `static tries = 3` و`static backoff = 30`: عند فشل البريد (خادم SMTP مشغول مثلًا) تُعاد المحاولة بعد 30 ثانية حتى 3 مرات.
- `failed(error)` يعمل بعد آخر محاولة فاشلة: مكانك لإرسال تنبيه أو تسجيل الخطأ.
- `Order.query().sum('total_cents')` و`.count()` تجميعات تُحسب في قاعدة البيانات.

ثم جدولتها في `backend/routes/console.js`:

```js
const SendDailyReport = require('../app/Jobs/SendDailyReport')

Schedule.job(new SendDailyReport()).dailyAt('08:00').name('daily-report')   // كل يوم 08:00
// للتجربة: .everyMinute()
```

دوال التوقيت المتاحة تشمل: `everyMinute()` و`everyFiveMinutes()` و`everyFifteenMinutes()` و`hourly()` و`hourlyAt(30)` و`daily()` و`dailyAt('08:00')` و`weekly()` و`weeklyOn(day, time)` و`monthly()` و`cron('expr')` و`weekdays()` مع `at('08:00')`.

نتيجة تجربتنا:

```bash
$ kreft schedule:list
  0 0 * * *        prune-old-tokens
  * * * * *        daily-report

$ kreft schedule:run
  ran       daily-report (2 ms)
```

وفي سجل الخادم ظهر الناتج: `Email to admin@example.com: التقرير اليومي` ثم `[report] orders=5 revenue=15500`. (في التطوير تُطبع الرسالة بدل أن تُرسل حتى تضبط `MAIL_URL`).

### تشغيل المجدول في الإنتاج

| الخيار | كيف |
|---|---|
| المجدول داخل الخادم (الافتراضي) | `kreft serve` يفحص الجدول كل دقيقة |
| من cron | اضبط `SCHEDULER=off` وأضف `* * * * * cd /app && kreft schedule:run` إلى crontab |
| عملية دائمة | `kreft schedule:work` |

**مهم عند عدة خوادم:** إن شغّلت عدة نسخ من التطبيق فكل نسخة ستشغّل المجدول وتتكرر المهمة. شغّل المجدول على نسخة واحدة (`SCHEDULER=off` على الباقي)، أو استعمل `Cache.lock` داخل المهمة.

## 2) طابور حقيقي بدل التطوير

```env
QUEUE_CONNECTION=redis        # أو database
CACHE_STORE=redis
REDIS_URL=rediss://default:secret@host:6379/0
```

```bash
kreft queue:work        # عامل في الخلفية (يعمل أيضًا داخل kreft dev و kreft serve)
kreft queue:failed      # ما فشل بعد كل المحاولات
kreft queue:retry all   # أعد المحاولة
kreft queue:flush       # امسح الفاشلة
```

أنماط عملية:

- **مهام صغيرة مستقلة:** مهمة لكل رسالة، لا مهمة واحدة ضخمة تُرسل لألف مستخدم (فإن فشلت في المنتصف أعادت الكل).
- **عدم التكرار (idempotency):** المهمة قد تُنفَّذ أكثر من مرة (بعد انقطاع) فاكتبها بحيث لا يضر تكرارها: تحقق من حالة قبل الإرسال.
- **طوابير مسماة:** `dispatch(...).onQueue('mail')` ليأخذ عامل مخصص أمور البريد.

## 3) قاعدة واحدة، ثلاث بيئات

الترحيلات والنماذج نفسها تعمل على SQLite وMySQL وPostgreSQL، فاستعمل:

| البيئة | قاعدة البيانات |
|---|---|
| التطوير | `sqlite:backend/database/app.db` (بلا تثبيت) |
| الاختبار | `sqlite::memory:` (سريعة، تُنشأ لكل ملف اختبار) |
| الإنتاج | MySQL أو PostgreSQL، مع نسخ احتياطي مجدول |

ولا تكتب SQL يخص محرّكًا بعينه في الترحيلات؛ استعمل `table.*` ليبقى الملف قابلًا للنقل.

## 4) وكلاء الذكاء الاصطناعي: خادم MCP

يتضمن Kreft خادم Model Context Protocol يتيح لوكيل برمجة ذكي أن يرى مساراتك ومخطط قاعدة بياناتك وأن يستعلم **قراءةً فقط**.

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

للاستعمال عبر HTTP اضبط `MCP_TOKEN` وأرسله:

```bash
curl -H "Authorization: Bearer a-long-random-secret" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' http://localhost:8000/mcp
```

| الأداة | ما تعطيه |
|---|---|
| `query_database` | يشغّل `SELECT` واحدًا للقراءة فقط |
| `list_routes` | كل المسارات بطرقها وأسمائها ووسائطها |
| `server_health` | زمن التشغيل والذاكرة |
| `kreft://routes` و`kreft://schema` | فهرس المسارات؛ الجداول والأعمدة والمفاتيح |

> **تحذير:** `query_database` يستطيع قراءة كل الجداول الأخرى. استعمل حساب قاعدة بيانات للقراءة فقط بلا وصول إلى جداول الأسرار، واحفظ الرمز خارج Git. وفي الإنتاج النقطة معطلة (403) حتى تضبط `MCP_TOKEN`.

## 5) رمز API بصلاحيات محدودة

للسكربتات والتطبيقات الأخرى أنشئ رمزًا من `/profile` بالصلاحيات `read` و`create` و`update` و`delete` فقط حسب الحاجة. الرمز لا يستعمل إلا طرق HTTP التي تسمح بها صلاحياته:

```bash
curl -H "Authorization: Bearer 5|xxxxxxxx" https://example.com/api/orders      # يحتاج read
curl -X POST -H "Authorization: Bearer 5|xxxxxxxx" -d '{…}' https://example.com/api/orders   # يحتاج create
```

وتطبيق جوال أو سكربت يرسل `device_name` عند الدخول يحصل على رمز بدل الكوكي.

## 6) مراقبة الذاكرة

الخوادم الطويلة قد تجمع ذاكرة ببطء. شغّل بـ `--gc` (أو `AUTO_GC=1`) فيفحص Kreft الذاكرة كل 30 ثانية، وإذا تجاوزت `AUTO_GC_THRESHOLD_MB` نظّف ذاكرته المؤقتة وشغّل جامع القمامة. هذه شبكة أمان؛ إن رأيتها تعمل كثيرًا فابحث عن التسرب.

## 7) قائمة نهائية قبل الإطلاق

1. `NODE_ENV=production` و`APP_DEBUG=false` و`APP_KEY` حقيقي (الفصل السابع).
2. قاعدة حقيقية + نسخ احتياطي.
3. `QUEUE_CONNECTION` و`CACHE_STORE` غير `memory` إن كان لك أكثر من عملية.
4. `MAIL_URL` مضبوط.
5. `kreft build --base /` وفحص وسم `<base>` وملف `.htaccess` (الفصل التاسع).
6. `npm audit` و`kreft update`.
7. جرّب **مسار الدفع أو التسجيل** (أهم مسار) من البداية للنهاية على نسخة تجريبية.

## تمارين

1. اكتب مهمة `ExpireOrders` تلغي الطلبات المعلّقة وتعيد المخزون في معاملة، وجدولها كل ساعة.
2. اجعل مهمة التقرير ترسل لعدة مدراء بمهمة صغيرة لكل مدير.
3. أنشئ رمز API بصلاحية `read` فقط وجرّب أن `POST` يُرفض به.
