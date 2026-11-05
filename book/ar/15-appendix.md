# الملحق: مرجع سريع وأخطاء شائعة ومصطلحات

## ورقة الغش

| أريد… | في `.kreft` | في JavaScript |
|---|---|---|
| قيمة تتغير | `state n = 0` | `Kreftjs.signal(0)` |
| قيمة محسوبة | `derive d = n * 2` | `Kreftjs.derived(() => n.value * 2)` |
| دالة | `action add() { n++ }` | دالة عادية |
| رد فعل على تغيّر | `watch n { … }` | `Kreftjs.watch(n, fn)` |
| عند تحقق شرط | `when n > 5 { … }` | `Kreftjs.effect(...)` |
| قيمة محفوظة | `saved n = 0` | `Kreftjs.saved('n', 0)` |
| جلب بيانات | `load x = api.get('/api/x')` | `await api.get('/api/x')` |
| مخزن مشترك | `use cart` | `Kreftjs.store('cart', {…})` |
| قيمة للأبناء | `share t = 'dark'` / `receive t` | `app.share('t', v)` |
| رسالة عامة | `bus.send('x', v)` / `bus.on('x', fn)` | نفسه |
| تنقّل | `$router.go('/x')` | `router.go('/x')` |
| ترجمة | `{$t('messages.hello')}` | `Kreftjs.locale('ar')` |

## الواجهة الخلفية بسرعة

| المهمة | الشيفرة |
|---|---|
| مسار | `Route.get('/x', [Controller, 'method'])` |
| مجموعة بوسيط | `Route.middleware('auth').group(() => {…})` |
| تحقق | `await req.validate({ f: 'required\|email' })` |
| إنشاء | `await Model.create({…})` |
| استعلام | `Model.query().scope().with('rel').paginate(15, page)` |
| معاملة | `await DB.transaction(async () => {…})` |
| حدث | `await event(new Something(x))` |
| مهمة | `await Job.dispatch(x).delay(60)` |
| بريد | `await Mail.to(u).queue(new M(x))` |
| ذاكرة مؤقتة | `await Cache.remember('k', 60, fn)` |
| قفل | `await Cache.lock('k', 15, fn)` |
| جدولة | `Schedule.job(new J()).dailyAt('08:00')` |

## أخطاء شائعة وعلاجها

| الخطأ | العَرَض | العلاج |
|---|---|---|
| استعمال `const`/`let` لشيء تحتاجه الصفحة | الصفحة فارغة بلا أي خطأ | `state` أو `derive` أو `action` |
| `{total()}` على `derive` | خطأ أو قيمة غريبة | `{total}` بلا أقواس |
| نسيان `await` على `dispatch` | المهمة لا تُرسل | `await Job.dispatch(...)` |
| `type="email"` يمنع الإرسال | لا تظهر رسائل Kreft | أضف `novalidate` للنموذج |
| `<` ملاصقة لحرف في قالب | `{a<b}` تُفهم كوسم | اكتب `{a < b}` |
| `no such table` | بعد إضافة ترحيل | `kreft migrate` |
| صفحة بيضاء بعد النشر | `<base href>` خاطئ | `kreft build --base /` |
| فتح `.kreft` من `file://` | لا يعمل | استعمل `npm run dev` أو خادمًا |
| `/docs` 404 عند التحديث | `.htaccess` لم يُرفع | ارفعه وأظهر الملفات المخفية |
| `Str.slug` مع العربية | `ا-ول` بدل `أول` | اكتب `slugify` يُبقي `\p{L}` |
| الاسم الخام في رسالة التحقق | "اكتب author…" | أضف `attributes` في `lang/ar/validation.json` |
| تكرار الحدث/البريد عند إعادة الإرسال | بريدان | أطلق الحدث بعد النجاح فقط (`fresh`) |

## مصطلحات

| المصطلح | المعنى |
|---|---|
| **State (حالة)** | قيمة تتغير؛ عند تغيّرها تتحدث الصفحة. |
| **Derived (مشتقة)** | قيمة تُحسب من قيم أخرى وتتحدث وحدها. |
| **Action (فعل)** | دالة تغيّر الحالة أو تنفّذ عملًا. |
| **Store (مخزن)** | حالة مشتركة بين مكوّنات كثيرة. |
| **Slot (فتحة)** | مكان في المكوّن يملؤه من يستعمله. |
| **Portal (بوابة)** | رسم محتوى في مكان آخر من الصفحة (كالنافذة المنبثقة). |
| **Directive (توجيه)** | سمة خاصة على عنصر مثل `k-if` و`k-each`. |
| **Hot reload** | تبديل المكوّن المعدَّل دون تحديث الصفحة. |
| **Migration (ترحيل)** | وصف لتغيير في بنية قاعدة البيانات. |
| **Seeder (بذرة)** | ملء بيانات البداية. |
| **Factory (مصنع)** | صنع بيانات وهمية للاختبار. |
| **Middleware (وسيط)** | شيفرة تعمل قبل المتحكم. |
| **Policy (سياسة)** | قواعد تحدد من يستطيع فعل ماذا بأي نموذج. |
| **Job (مهمة)** | عمل يُنفَّذ في الخلفية على طابور. |
| **Idempotency (عدم التكرار)** | تنفيذ الطلب نفسه مرتين له أثر مرة واحدة. |
| **Prerender** | توليد HTML جاهز لكل صفحة وقت البناء. |
| **CSP** | سياسة أمان المحتوى؛ تقيّد ما يجوز للصفحة تحميله وتنفيذه. |
| **RTL** | الكتابة من اليمين إلى اليسار. |

## أين تتعمق؟

- التوثيق الكامل بالإنجليزية: `docs/README.md` (وفي الموقع: kreftjs.com/docs).
- `kreft help` و`kreft list` و`kreft electron:help` في الطرفية.
- أدوات المطوّر: الزر **S** في التطبيق أثناء `kreft dev`.
