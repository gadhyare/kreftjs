# الفصل الثالث والعشرون: تطبيقات HarmonyOS

هواتف وأجهزة Huawei اللوحية التي تعمل بنظام **HarmonyOS NEXT** لا تستطيع تثبيت تطبيقات Android، ولا يدعمها Capacitor. لذلك يصنع Kreft مشروعًا أصليًا صغيرًا بلغة **ArkTS** (لغة HarmonyOS) صفحته الوحيدة عارض ويب (Web) ملء الشاشة يحمّل موقعك المبني من ملفات التطبيق نفسه، فتعمل الصفحات بلا شبكة. والصفحات هي ملفات `.kreft` نفسها.

> **ملاحظة:** الواجهة الخلفية لا تعمل داخل الهاتف. ابنِ بـ `--api-url` ليعرف التطبيق عنوان خادمك.

## ما تحتاجه

| تحتاج | لماذا |
|---|---|
| [DevEco Studio](https://developer.huawei.com/consumer/en/deveco-studio/) | يوفّر SDK الخاص بـ HarmonyOS والمحاكي وأدوات البناء والتوقيع. |
| حساب مطوّر Huawei | لتوقيع التطبيق على هاتف حقيقي فقط. المحاكي لا يحتاج حسابًا. |

## البداية السريعة

```bash
kreft new my-app --harmony      # مشروع جديد بدعم HarmonyOS
cd my-app
kreft harmony:build --api-url https://your-server.example
kreft harmony:open              # يفتح harmony/ في DevEco Studio؛ اضغط Run
```

لتطبيق موجود: `kreft harmony:init` (اسم بديل: `kreft make:harmony`). يكتب مجلد `harmony/` ولا يستبدل ملفًا موجودًا أبدًا.

## الأوامر

| الأمر | ماذا يفعل |
|---|---|
| `kreft harmony:init` (أو `make:harmony`) | يضيف مجلد `harmony/` (مشروع ArkTS) وأيقونة التطبيق وسكربتي `harmony:build` و`harmony:open`. |
| `kreft harmony:build [--api-url …] [--hap]` | يبني الموقع (`kreft build --base ./`) وينسخه إلى `harmony/entry/src/main/resources/rawfile/`. `--api-url` يكتب `PUBLIC_API_URL` في `.env`. `--hap` يشغّل `hvigor` لصنع ملف `.hap` (يلزم أدوات سطر أوامر DevEco Studio). |
| `kreft harmony:open` | يفتح `harmony/` في DevEco Studio. |
| `kreft harmony:help` | دليل مختصر في الطرفية. |

شغّل `harmony:build` من جديد بعد كل تعديل على صفحاتك.

## النشر للمتجر

لنسخة موقّعة جاهزة لـ AppGallery استعمل أمر الإصدار الموحّد (تفاصيله الكاملة في الفصل 21):

```bash
kreft mobile:release --harmony --api-url https://api.your-site.com
```

يصنع ملفي `.hap` (للتثبيت أو للمختبرين) و`.app` (لـ AppGallery)، ويضبط رقم الإصدار في `AppScope/app.json5`، ويكتب الملفات في `release/harmony/` مع الحجم وبصمة SHA-256. التوقيع يُضبط في DevEco Studio (*File → Project Structure → Signing Configs*)، وإلا خرجت الملفات **غير موقّعة** وسينبّهك الأمر. وجرّب `--dry-run` أولًا ليريك كل خطوة دون تغيير أي شيء.

## كيف يعمل

- `harmony/` مشروع ArkTS عادي (نموذج Stage، واجهة برمجة API 12). صفحته الوحيدة `Index.ets` هي `Web` ملء الشاشة تحمّل `index.html` من `$rawfile` — أي من ملفات التطبيق نفسه، لا من الإنترنت.
- `harmony:build` ينسخ `dist/` نسخة جديدة كل مرة (فتُحذف الملفات المحذوفة ولا يبقى أثر)، ويزيل `sw.js` (لا Service Worker داخل التطبيق حتى لا يقدّم ملفات قديمة بعد التحديث).
- العناوين داخل التطبيق بصيغة `#/login` (انظر الملاحظة أدناه)، وعلى موقعك تبقى عادية.

## بنية المشروع

```text
my-app/
├── harmony/
│   ├── AppScope/app.json5                       اسم الحزمة (com.kreftjs.<الاسم>) والإصدار والأيقونة
│   └── entry/src/main/
│       ├── ets/pages/Index.ets                  عارض الويب (غيّر إعداداته هنا)
│       ├── module.json5                         الأجهزة والأذونات (INTERNET مفعّل)
│       └── resources/rawfile/                   موقعك، يكتبه harmony:build (لا يُلتزم في git)
├── build/icon.png                               أيقونة التطبيق
└── package.json                                 السكربتان harmony:build وharmony:open
```

الأجهزة المفعّلة في `module.json5`: الهاتف واللوحي و`2in1`.

## عنوان الخادم

التطبيق لا يستطيع الوصول إلى `localhost` على حاسوبك. ابنِ بعنوان خادمك:

```bash
kreft harmony:build --api-url https://api.your-site.com
```

يكتب ذلك `PUBLIC_API_URL` في `.env`، وتستعمله كما في فصل الموبايل:

```js
Kreftjs.api.setup({ base: Kreftjs.env.PUBLIC_API_URL, token: () => Kreftjs.storage.get('token') })
```

وسجّل الدخول برموز API لا بجلسات الكوكيز.

## ملاحظتان مهمتان

1. **وضع المسارات.** يغيّر `harmony:init` سطرًا واحدًا في `frontend/index.html`: يجعل الموجِّه يستعمل العناوين بصيغة `#/` داخل التطبيق (لأن ملفات التطبيق نفسها لا تملك عنوان `/login`) والعناوين العادية على الموقع. إن كنت ضبطت `mode` بنفسك تُرك كما هو.
2. **لا مساعدات Electron هنا.** `window.kreftDesktop` ودوال Electron الأخرى غير موجودة في تطبيق HarmonyOS.

## الأيقونة

يستعمل `harmony:init` أيقونة التطبيق من `build/icon.png` (أو شعار Kreft إن لم توجد)، وينسخها إلى مجلدات الوسائط في `harmony/`. استبدل `build/icon.png` بأيقونتك قبل `harmony:init` أو بعده، ثم أعد البناء.

## ما الذي جُرّب فعلًا؟

- **جُرّب:** ملفات `harmony/` و`harmony:build` والنسخ إلى `rawfile/` وعرض الموقع وعناوين `#/` — كلها على الحاسوب.
- **لم يُجرَّب:** فتح المشروع في DevEco Studio أو تشغيله على محاكٍ أو هاتف، فقد تحتاج ملفات البناء تعديلات صغيرة. إن اشتكى DevEco Studio من شيء فأبلغ به ليُصلح.

## استكشاف الأخطاء

| الرسالة أو العَرَض | الحل |
|---|---|
| شاشة بيضاء في التطبيق | أعد `kreft harmony:build` وتأكد من وجود `rawfile/index.html`. |
| «لم يُعثر على الصفحة» بعد النقر | يجب أن يستعمل الموجِّه `mode: 'hash'` داخل التطبيق (يضيفه `harmony:init` ما لم تضبط `mode`). |
| طلبات API تفشل | ابنِ بـ `--api-url https://…`. الهاتف لا يصل إلى `localhost` على حاسوبك. |
| `hvigor was not found` | استعمل `kreft harmony:open` وشغّل من DevEco Studio بدل `--hap`. |
| الهاتف يرفض تثبيت التطبيق | يجب توقيعه في DevEco Studio (File > Project Structure > Signing Configs). |

## تمارين

1. أنشئ مشروعًا بـ `kreft new app --harmony` وابنِه وافتحه في DevEco Studio.
2. غيّر اسم التطبيق في `AppScope/resources/base/element/string.json` وأعد البناء.
3. اربطه بخادمك بـ `--api-url` وتأكد أن `PUBLIC_API_URL` في `.env` صحيحة.
