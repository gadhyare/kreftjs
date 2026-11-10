# الفصل الثاني والعشرون: تطبيقات سطح المكتب مع Tauri

Tauri هو الطريق الثاني لصنع تطبيق سطح مكتب من مشروع Kreft، بجانب Electron (الفصل العاشر). الصفحات هي ملفات `.kreft` نفسها. الفرق أن Tauri لا يشحن متصفحًا كاملًا مثل Electron، بل يستعمل عارض الويب الموجود أصلًا في النظام (WebView2 على Windows، وWebKit على macOS وLinux)، فتصير المثبّتات صغيرة (بضعة ميغابايت) والذاكرة أقل. مقابل ذلك، الجزء الأصلي الصغير مكتوب بلغة Rust.

> **ملاحظة:** الواجهة الخلفية (قاعدة البيانات والمسارات) **لا تعمل داخل التطبيق**، تمامًا كـ Electron. تعمل على خادم، ويتصل بها التطبيق بعنوان تحدّده.

## ما تحتاجه

| تحتاج | لماذا |
|---|---|
| [Rust](https://rustup.rs) و`cargo` | Tauri يجمّع برنامج Rust صغيرًا حول صفحاتك. افتح طرفية جديدة بعد التثبيت. |
| Linux فقط | `webkit2gtk` وبعض المكتبات (راجع tauri.app/start/prerequisites). |
| Windows فقط | WebView2 (موجود في Windows 10 و11) وأدوات بناء C++ من Visual Studio. |

ثبّت Rust مرة واحدة من rustup.rs، أو على Mac عبر Homebrew:

```bash
brew install rustup
rustup default stable
```

تحقق بـ `cargo --version`. إن لم يجده الطرفية، أضف مجلده إلى المسار: من rustup.rs أضف `export PATH="$HOME/.cargo/bin:$PATH"` إلى `~/.zshrc`، ومن Homebrew أضف `export PATH="/opt/homebrew/opt/rustup/bin:$PATH"`. أوامر `kreft tauri:*` تبحث في المجلدين بنفسها.

## البداية السريعة

```bash
kreft new my-app --tauri    # مشروع جديد بدعم Tauri
cd my-app
npm install                 # يثبّت @tauri-apps/cli
kreft tauri                 # يفتح التطبيق في نافذة سطح مكتب (بلا متصفح)
```

لتطبيق موجود: `kreft add tauri` (يضيف الإعدادات والملفات ثم يثبّت الحزم)، أو `kreft tauri:init` (الأمر نفسه بلا تثبيت؛ واسم بديل: `kreft make:tauri`). الملفات الموجودة لا تُستبدل أبدًا.

## الأوامر

| الأمر | ماذا يفعل |
|---|---|
| `kreft add tauri` | يضيف `config/tauri.config.js` ومجلد `src-tauri/` والأيقونة والسكربتات، ثم `npm install`. |
| `kreft tauri:init` | الأمر نفسه بلا تثبيت (اسم بديل: `make:tauri`). |
| `kreft tauri` (أو `tauri:dev`) | يشغّل خادم التطوير على منفذ حر ويفتح نافذة Tauri عليه. بلا متصفح. إغلاق النافذة يوقف الاثنين. |
| `kreft tauri:build` | يبني الموقع بـ `kreft build --base ./` ثم `tauri build`. المثبّتات في `src-tauri/target/release/bundle/`. |
| `kreft tauri:sync` | يعيد كتابة `src-tauri/` من ملف الإعدادات دون تشغيل شيء. |
| `kreft tauri:config` | يفحص ملف الإعدادات ويعرض القيم النهائية (`--json` للآلات). |
| `kreft tauri:help` | دليل مختصر في الطرفية. |

`tauri:build` يبني لنظامك الحالي. خياراته: `--debug` (أسرع وأكبر)، و`--bundles dmg|app|nsis|msi|deb|rpm|appimage` (أي المثبّتات تصنع)، و`--target <rust-triple>` (معالج آخر)، و`--no-bundle` (بلا مثبّت). أول بناء يجمّع Rust ويستغرق دقائق؛ وما بعده سريع.

## ملف الإعدادات

كل إعدادات التطبيق في ملف واحد: `config/tauri.config.js`. تكتبه أنت، ومنه تُولَّد الملفات الأصلية (`tauri.conf.json` و`capabilities` و`src/kreft_generated.rs`) — لا تعدّل المولَّدة.

```js
// config/tauri.config.js
module.exports = {
  window: { width: 1000, height: 700, minWidth: 800, minHeight: 600, center: true },
  menu: { visibility: 'hidden' },
  devtools: { openOnStart: false, mode: 'detach' },
  security: { capabilities: ['dialog:default'] },
  packaging: { icon: 'build/icon.png' },
}
```

مجموعات الإعداد: `app` (الاسم والمعرّف والإصدار)، و`window`، و`menu`، و`contextMenu`، و`devtools`، و`webview`، و`security`، و`tray`، و`notifications`، و`updates`، و`packaging`.

الترتيب (الأخير يغلب): الافتراضيات ← `kreftjs.config.json` (قسم `desktop`) ← `config/tauri.config.js` ← متغيّرات البيئة (`KREFT_TAURI_WINDOW_WIDTH=1000`) ← سطر الأوامر (`--set window.width=1000`).

غيّر أي إعداد لمرة واحدة دون تعديل الملف: `kreft tauri --set window.width=1200`. ولرؤية كل القيم بعد الدمج: `kreft tauri:config --json`. وما لا يغطيه الملف تضعه في `advanced.tauriConf`.

## بنية المشروع

```text
my-app/
├── config/tauri.config.js     إعداداتك (المصدر الوحيد الذي تعدّله)
├── src-tauri/                 الملفات الأصلية (تولَّد من الإعدادات)
│   ├── tauri.conf.json
│   ├── capabilities/default.json
│   └── src/main.rs            كود Rust الخاص بك (اختياري؛ يستدعي kreft_generated::apply)
├── build/icon.png             أيقونة التطبيق (PNG مربعة، 1024×1024 أفضل)
└── package.json               السكربتات: tauri وtauri:dev وtauri:build
```

## خيارات التطوير

```bash
kreft tauri --port 4000              # منفذ محدد (افتراضيًا يختار حرًا)
kreft tauri --devtools               # فتح DevTools عند البدء (أو --devtools=detach)
kreft tauri --no-devtools
kreft tauri --menu=hidden            # أو visible
kreft tauri --set window.width=1200  # تغيير أي إعداد لهذه الجلسة
```

## في الصفحة

`window.__TAURI__` يوجد داخل نافذة Tauri فقط، فبه تميّزها عن المتصفح:

```js
if (window.__TAURI__) {
  const name = await window.__TAURI__.core.invoke('greet', { name: 'Ada' })
}
```

`invoke` يستدعي أمر Rust تكتبه في `src-tauri/src/main.rs` وتسجّله بـ `.invoke_handler(tauri::generate_handler![greet])`. و`window.kreftDesktop` ودوال Electron الأخرى **غير موجودة** في نافذة Tauri.

## الأيقونة

يحتاج Tauri الأيقونة بعدة مقاسات (`src-tauri/icons/32x32.png` و`128x128.png` و`128x128@2x.png` و`icon.icns` و`icon.ico`) ويرفض الترجمة بلاها. لا تصنعها بنفسك: `kreft tauri` و`kreft tauri:build` يصنعانها من `build/icon.png` كلما نقصت واحدة (ويكتبان أيقونة افتراضية إن لم يكن لديك واحدة). لأيقونتك: ضع PNG مربعة 1024×1024 في `build/icon.png`، ثم:

```bash
cd my-app
npx tauri icon build/icon.png
```

## Electron أم Tauri؟

| | Electron | Tauri |
|---|---|---|
| حجم المثبّت | نحو 100 ميغابايت | بضعة ميغابايت |
| يحتاج | Node.js فقط | Node.js وRust |
| عارض الويب | Chromium خاص به، متطابق في كل مكان | عارض النظام، ففروق صغيرة بين الأنظمة |
| كود النظام الخاص بك | JavaScript (جسر `window.kreftDesktop`) | أوامر Rust |

اختر Electron إن أردت سلوكًا متطابقًا في كل مكان وجسر JavaScript جاهزًا، وTauri إن أردت مثبّتات صغيرة وذاكرة أقل وتقبل Rust.

## استكشاف الأخطاء

| الرسالة أو العَرَض | الحل |
|---|---|
| `Rust is not installed (cargo was not found)` | ثبّت Rust (الخطوات أعلاه)، أو أضف مجلده إلى `PATH` ثم افتح طرفية جديدة. |
| `failed to open icon …/icons/32x32.png` | المقاسات لم تُصنع. شغّل `npx tauri icon build/icon.png` داخل مشروعك. |
| `could not determine executable to run` | لست داخل مشروعك أو `@tauri-apps/cli` غير مثبّتة: `cd` إلى المشروع ثم `npm install`. |
| `The Tauri command line is not installed` | `npm install` (أو `kreft add -D @tauri-apps/cli`). |
| نافذة بيضاء في التطبيق المحزوم | أعد `tauri:build` (يلزمه `--base ./`) وتأكد من `dist/index.html`. |
| طلبات API تفشل في المحزوم | الواجهة الخلفية غير محزومة. اضبط `base` مطلقًا لعميل API كما في Electron. |
| فشل بناء Linux على `webkit2gtk` | ثبّت مكتبات Linux المذكورة أعلاه. |

## ما الذي جُرّب فعلًا؟

- **جُرّب:** `tauri:init` و`kreft new --tauri` و`tauri:dev` (تفتح النافذة على منفذ حر وتغلق مع الخادم) و`tauri:build --debug --bundles app` (تطبيق `.app` على macOS) — كلها بـ Rust 1.99 على macOS.
- **لم يُجرَّب:** المثبّتات النهائية، وWindows وLinux.

## تمارين

1. أنشئ تطبيقًا بـ `kreft new notes --tauri`، وغيّر حجم النافذة في `config/tauri.config.js` ثم شغّل `kreft tauri`.
2. غيّر لون الخلفية لمرة واحدة بـ `kreft tauri --set window.width=1200` دون تعديل الملف.
3. أضف أمر Rust `greet` واستدعه من صفحة عبر `window.__TAURI__.core.invoke`.
