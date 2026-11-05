# الفصل الأول: البداية

## ما هو Kreft؟

Kreft (يُكتب `kreftjs`) إطار عمل صغير، تفاعلي (reactive)، له لغة مكوّنات خاصة به: ملفات `.kreft`. تكتب في الملف الواحد حالتك وقيمك المشتقة وأفعالك بكلمات بسيطة، ثم تصف الصفحة في `<view>`. ويأتي مع واجهة خلفية كاملة على Node.js (مسارات، ومتحكمات، ونماذج، وترحيلات، وطوابير، وبريد)، فيغطي المشروع الواحد التطبيق بأكمله.

> **ملاحظة:** الإصدار الحالي تجريبي (`0.0.x-beta`). كل ما في هذا الكتاب جُرِّب على الإصدار الذي صدر معه، لكن واجهات الإطار قد تتغير بين الإصدارات التجريبية. راجع `kreft --version` وملف `docs/README.md` (بالإنجليزية) عند الشك.

لماذا قد تختاره؟

- **لغة واحدة للمكوّن:** HTML ومنطق وتنسيق في ملف واحد، بلا ديكورات ولا وحدات (modules) تتعلمها.
- **بدون إعداد:** `kreft new` ثم `kreft dev`. لا ملف إعداد لأداة تجميع.
- **واجهة خلفية جاهزة:** تسجيل دخول، وتحقق من البريد، واستعادة كلمة المرور، ولوحة إدارة، ومصادقة ثنائية.
- **تطبيقات سطح المكتب:** `kreft new --electron` ثم تبني مثبّتات لـ Windows وmacOS وLinux.
- **دعم RTL من الأساس:** تبديل اللغة واتجاه الصفحة من دالة واحدة (مهم لنا نحن العرب، وله فصل كامل).

## التثبيت

المتطلبات: Node.js (يُفضَّل 22 أو أحدث) وnpm.

```bash
npm install -g kreftjs
kreft --version        # مثال: 0.0.19-beta
```

للتحقق من أن كل شيء سليم:

```bash
kreft about
```

وللحصول على تلوين الملفات وملفات المقتطفات (snippets) في VS Code أو Cursor:

```bash
kreft vscode
```

## أول تطبيق

```bash
kreft new my-app            # يسألك: JavaScript أم TypeScript؟
cd my-app
npm run dev
```

افتح العنوان الذي يطبعه الطرفية (عادة `http://localhost:8000`؛ وإن كان المنفذ مشغولًا يُستخدم التالي).

خيارات مفيدة عند الإنشاء:

```bash
kreft new shop --db mysql --ts          # TypeScript وقاعدة MySQL
kreft new site --ui tailwind --no-auth  # Tailwind بدون صفحات تسجيل الدخول
kreft new desk --electron               # مع دعم تطبيقات سطح المكتب
kreft new app-name --ui bootstrap --no-auth
```

> **تنبيه:** اكتب قيم الخيارات كما هي بالضبط: `bootstrap` و`tailwind` و`bulma` و`pico`. أي قيمة أخرى توقف الأمر مع رسالة تعرض القيم المسموحة.

يأتي المشروع الجديد (إن لم تستعمل `--no-auth`) بصفحات الدخول والتسجيل واستعادة كلمة المرور وتأكيد البريد والملف الشخصي ولوحة الإدارة. وعند تشغيل `npm run dev` تُنشأ الجداول ومستخدم تجريبي:

- البريد: `test@example.com`
- كلمة المرور: `password`

> **تحذير:** هذا المستخدم للتطوير المحلي فقط. احذفه أو لا تشغّل `--seed` أبدًا على قاعدة بيانات حقيقية.

رسائل البريد (تأكيد، استعادة) تُطبع في الطرفية إلى أن تضبط `MAIL_URL`.

## أصغر تطبيق ممكن

يمكنك استعمال Kreft بلا مشروع كامل. التطبيق صفحة HTML وملفات `.kreft`:

```html
<!-- index.html -->
<div id="app"></div>
<script src="kreftjs.js"></script>
<script>
  Kreftjs.app('App.kreft').mount('#app')
</script>
```

```html
<!-- App.kreft -->
state name = 'العالم'

<view>
  <h1>مرحبًا يا {name}</h1>
  <input k-model="name">
</view>
```

> **تحذير:** ملفات `.kreft` تحتاج خادمًا. المتصفحات ترفض تحميل الملفات من `file://`، فافتح التطبيق دائمًا عبر `npm run dev` أو أي خادم.

## بنية المشروع

ينشئ `kreft new` مجلدين لا يختلطان أبدًا: `frontend/` هو ما يصل المتصفح، و`backend/` هو الخادم ولا يمكن الوصول إليه عبر HTTP.

```text
my-app/
├── frontend/
│   ├── index.html          نقطة الدخول
│   ├── App.kreft           المكوّن الجذر وحاوية الموجِّه
│   ├── routes/web.kreft    مسارات الصفحات
│   ├── layouts/            app.kreft (بعد الدخول)، guest.kreft (صفحات الدخول)
│   ├── pages/              ملف .kreft لكل شاشة
│   ├── components/         مكوّنات قابلة لإعادة الاستخدام
│   ├── ui.css              نظام التصميم
│   └── tests/              اختبارات المكوّنات
├── backend/
│   ├── config/             app.js, auth.js, database.js, redis.js, session.js
│   ├── app/
│   │   ├── Http/           Controllers, Middleware, Requests, Resources
│   │   ├── Models/         User, PersonalAccessToken
│   │   └── Auth/           مساعدات الجلسات
│   ├── database/           migrations, seeders, factories
│   └── routes/             api.js, auth.js, console.js
├── .env                    الأسرار والإعدادات (لا ترفعه إلى Git أبدًا)
├── package.json
└── kreftjs.config.json     خيارات سطر الأوامر
```

لماذا الفصل مهم؟

- `kreft dev` و`kreft build` يقدّمان `frontend/` فقط. أما `backend/` وملفات قاعدة البيانات و`.env` فلا عنوان ويب لها.
- على macOS وLinux يمنح `kreft new` المجلد `backend/` والملف `.env` صلاحيات يقرؤها المالك فقط.
- ملفات مثل `.env` و`*.db` و`*.pem` و`package.json` مرفوضة حتى لو طُلبت بالاسم.

## إضافة مكتبة CSS

أي مكتبة تعمل. أضف `<link>` في `index.html`، أو ثبّتها واستورد ملفها من ملف `.kreft`:

```html
import 'bootstrap/dist/css/bootstrap.min.css'   // npm i bootstrap
import './theme.css'                            // ملفك الخاص بجانب هذا الملف
```

## حزم npm في المتصفح

```bash
kreft add dayjs nanoid lodash
kreft add -D esbuild      # مرة واحدة لكل مشروع: يجهّز الحزم للمتصفح
```

```html
import dayjs from 'dayjs'
import { nanoid } from 'nanoid'

state id = nanoid()

<view>
  <p>{dayjs().format('YYYY-MM-DD')}</p>
</view>
```

الأمر `kreft add` نسخة أكثر أمانًا من `npm install`: يمنع سكربتات التثبيت افتراضيًا، ويتحقق من أخطاء الكتابة المتعمدة في أسماء الحزم (typosquatting)، وينبّه إلى الحزم التي نُشرت قبل أقل من 14 يومًا، ثم يشغّل `npm audit`.

## أوامر ستستخدمها كل يوم

| الأمر | وظيفته |
|---|---|
| `kreft new my-app` | ينشئ مشروعًا |
| `kreft dev` | خادم التطوير مع إعادة تحميل فورية |
| `kreft build` | يصرّف التطبيق إلى ملفات عادية في `dist/` |
| `kreft serve dist` | يشغّل التطبيق المبني للمستخدمين الحقيقيين |
| `kreft list` | يعرض كل أوامر نسختك |
| `kreft help` | خيارات الأوامر الرئيسية |
| `kreft tinker` | طرفية تفاعلية مع نماذجك (`await User.count()`) |
| `kreft update` | يحدّث الحزم وملف `kreftjs.js` |

تدريب سريع: أنشئ مشروعًا، وغيّر كلمة في `frontend/pages/` وراقب الصفحة تتبدل في المتصفح دون إعادة تحميل وبدون ضياع الحالة. هذه هي إعادة التحميل الفورية (hot reload).
