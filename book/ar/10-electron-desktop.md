# الفصل العاشر: تطبيقات سطح المكتب مع Electron

يمكن لـ Kreft أن يحزم تطبيقك كبرنامج سطح مكتب لـ Windows وmacOS وLinux. الصفحات هي ملفات `.kreft` نفسها؛ وElectron يقدّم النافذة فقط.

## البداية السريعة

```bash
kreft new my-app --electron   # تطبيق جديد بدعم سطح المكتب
# أو في تطبيق موجود:
kreft electron:init           # اسم بديل: kreft make:electron
npm install                   # يثبّت electron و electron-builder
kreft electron                # يفتح التطبيق في نافذته: بلا متصفح وبلا عنوان
kreft electron:build          # مثبّت في dist-electron/
```

للمساعدة في الطرفية في أي وقت:

```bash
kreft electron:help
```

## الأوامر

| الأمر | ماذا يفعل |
|---|---|
| `kreft electron:init` | يكتب `electron/main.js` و`electron/preload.js` وأيقونة التطبيق `build/icon.png`، ويضيف السكربتات واعتماديات `electron` و`electron-builder` وكتلة `build` إلى `package.json`. الملفات الموجودة لا تُستبدل أبدًا. ويزيل أيضًا روابط Google Fonts من `index.html` ليبدأ التطبيق بلا شبكة. |
| `kreft electron` | يفتح التطبيق في نافذة سطح مكتب فقط: لا متصفح ولا عنوان يُطبع. خادم التطوير يعمل مخفيًا على منفذ خاص بحاسوبك لا تستعمله إلا النافذة (إعادة التحميل الفورية تعمل). إغلاق النافذة يوقف الخادم. |
| `kreft electron:build` | يشغّل `kreft build --base ./` ثم `electron-builder`. |
| `npm run electron:build:mac` | `.dmg` و`.zip`. |
| `npm run electron:build:win` | مثبّت NSIS و`.exe` محمول. |
| `npm run electron:build:linux` | AppImage و`.deb` و`.rpm`. |
| `npm run electron:build:all` | الثلاثة. |
| `kreft electron:help` | دليل مختصر في الطرفية. |

## مرجع سريع

| أريد أن… | افعل هذا |
|---|---|
| أضيف دعم سطح المكتب | `kreft new my-app --electron`، أو `kreft electron:init` ثم `npm install` |
| أفتح التطبيق في نافذته | `kreft electron` |
| أفتح DevTools | `kreft electron --devtools=bottom` أو `ELECTRON_DEVTOOLS=right` أو F12 |
| أظهر القائمة أو أخفيها | `ELECTRON_MENU=show` أو `auto` أو `hide`؛ و`kreftDesktop.setMenu('hide')` |
| أغيّر الأيقونة | استبدل `build/icon.png` (PNG مربعة 512×512 أو أكبر) |
| أغيّر اسم التطبيق | `build.productName` و`build.appId` في `package.json` |
| أصنع مثبّتًا | `npm run electron:build:mac` أو `:win` أو `:linux` أو `:all` |

## بنية المشروع

```text
my-app/
├── electron/
│   ├── main.js        النافذة والقائمة وجسر النظام
│   └── preload.js     ما تراه صفحاتك من النظام (window.kreftDesktop)
├── build/icon.png     أيقونة التطبيق
├── dist/              البناء الثابت (kreft build --base ./)
├── dist-electron/     المثبّتات التي يكتبها electron-builder
└── package.json       "main": "electron/main.js" وكتلة "build"
```

## كيف يعمل

- أثناء التطوير: خادم Kreft المخفي يخدّم الصفحات، والنافذة تفتحه. لا متصفح يُفتح ولا عنوان يُطبع.
- في التطبيق المحزوم: النافذة تحمّل `dist/index.html` مباشرة من الملفات، بلا خادم.

## اكتشاف تطبيق سطح المكتب

```js
if (Kreftjs.isElectron) {
  const info = await kreftDesktop.getInfo()    // { name, version, platform, arch, isPackaged }
}
```

```html
<!-- components/Titlebar.kreft -->
state info = null
on start { if (Kreftjs.isElectron) info = await kreftDesktop.getInfo() }

<view>
  <footer k-if="info">{info.name} v{info.version} · {info.platform}</footer>
</view>
```

## جسر سطح المكتب

`window.kreftDesktop` (وكذلك `Kreftjs.desktop`) هو الطريقة الوحيدة التي تصل بها صفحاتك إلى النظام. لا شيء آخر من Node.js أو Electron مكشوف.

| الدالة | ماذا تفعل |
|---|---|
| `getInfo()` | اسم التطبيق والإصدار والنظام. |
| `minimize()` و`maximize()` و`close()` | التحكم بالنافذة. |
| `getMenu()` و`setMenu('show' \| 'auto' \| 'hide')` | قائمة النافذة. |
| `openDevTools(mode)` و`closeDevTools()` و`toggleDevTools()` | أدوات المطوّر. |
| `showMessageBox(options)` | مربع رسالة أصلي. |
| `showOpenDialog(options)` و`showSaveDialog(options)` | نوافذ اختيار الملفات. |

```html
action confirmDelete() {
  const r = await kreftDesktop.showMessageBox({
    type: 'warning',
    buttons: ['حذف', 'إلغاء'],
    defaultId: 1,
    cancelId: 1,
    title: 'تأكيد',
    message: 'هل تريد حذف هذا العنصر؟',
  })
  if (r.response === 0) await remove()
}
```

## إضافة دالة سطح مكتب خاصة بك

1. في `electron/main.js` أضف معالجًا: `ipcMain.handle('app:ping', () => 'pong')`.
2. في `electron/preload.js` أضفه إلى كائن `desktop`: `ping: () => ipcRenderer.invoke('app:ping')`.
3. استعمله من الصفحة: `await kreftDesktop.ping()`.

> **تنبيه أمني:** مرّر الحد الأدنى من البيانات، وتحقق منها في `main.js`. هذا جسر بين صفحة (قد تُحقن فيها شيفرة) ونظام التشغيل.

## أدوات المطوّر

```bash
kreft electron --devtools          # على اليمين
kreft electron --devtools=bottom   # أسفل أو left أو detach
kreft electron --no-devtools
ELECTRON_DEVTOOLS=bottom kreft electron
```

والمفتاح F12 (أو Ctrl+Shift+I) يبدّل اللوحة.

## قائمة النافذة

اضبط شريط القائمة عند بدء التطبيق:

```bash
ELECTRON_MENU=show kreft electron   # الافتراضي: الشريط ظاهر
ELECTRON_MENU=auto kreft electron   # مخفي، اضغط Alt لإظهاره (Windows وLinux)
ELECTRON_MENU=hide kreft electron   # بلا قائمة
```

أو غيّرها والتطبيق يعمل من صفحة:

```js
window.kreftDesktop.setMenu('hide')   // 'show' | 'auto' | 'hide'
window.kreftDesktop.getMenu()         // الوضع الحالي
```

على macOS تعيش القائمة في الشريط العلوي للشاشة، فـ `show` و`auto` متشابهان، و`hide` يُبقي قائمة اسم التطبيق (فيها Quit) لأن macOS يحتاج واحدة. ولقائمتك الخاصة (File, Edit…) استعمل `Menu.buildFromTemplate([...])` و`Menu.setApplicationMenu(...)` في `electron/main.js`.

> **للتطبيقات التي أُنشئت قبل 0.0.18:** ملف `electron/main.js` القديم بلا هذه الميزة. انسخ تعديلاتك احتياطيًا، واحذف الملف، وشغّل `kreft electron:init`.

## أيقونة التطبيق

يضع `kreft electron:init` شعار Kreft في `build/icon.png`. استبدله بأيقونتك: PNG مربعة 512×512 أو أكبر. تستعملها النافذة، ويصنع electron-builder منها `.icns` (macOS) و`.ico` (Windows). واسم التطبيق في `build.productName` و`build.appId` داخل `package.json`.

يحتاج electron-builder أيضًا إلى `description` و`homepage` و`author` (مع بريد) و`build.linux.maintainer` (لـ `.deb` و`.rpm`). الأمران `kreft electron:init` و`kreft electron:build` يملآن الناقص منها من اسمك وبريدك في git؛ راجعها قبل الإصدار.

## المثبّتات

```bash
npm run electron:build:mac     # .dmg و .zip
npm run electron:build:win     # مثبّت NSIS و .exe محمول
npm run electron:build:linux   # AppImage و .deb و .rpm
npm run electron:build:all     # الثلاثة
```

تُكتب في `dist-electron/`. والوسائط تذهب إلى electron-builder، مثل `kreft electron:build --mac --arm64`. الإعدادات الافتراضية في كتلة `build` من `package.json`:

| النظام | الأهداف |
|---|---|
| Windows | مثبّت `nsis` (تختار المجلد) و`portable` |
| macOS | `dmg` و`zip` |
| Linux | `AppImage` و`deb` و`rpm` |

- ابنِ كل نظام على نظامه. على Mac تُبنى AppImage ومثبّتات Windows، لكن `.deb` و`.rpm` تفشل: ابنهما على Linux، أو احذفهما من `build.linux.target`.
- توقيع الشيفرة (code signing) يُضبط عبر electron-builder (electron.build/code-signing) ولازم قبل تسليم التطبيق للناس؛ تطبيقات macOS غير الموقّعة تعرض تحذير Gatekeeper.
- **التطبيق المحزوم لا يشغّل واجهة خلفية.** يحمّل `dist/index.html` فقط. تطبيق الواجهة وحدها يعمل كما هو؛ أما التطبيق المتكامل (تسجيل دخول وقاعدة بيانات) فلا يعمل بعد التثبيت ما لم تشغّل خادمًا في مكان ما وتوجّه `api.setup({ base })` إليه.

## `npm run build` أم `electron:build`؟

إضافة Electron لا تغيّر `npm run build`. الأمران يصنعان شيئين مختلفين:

| الأمر | ماذا يصنع | استعمله لـ |
|---|---|---|
| `npm run build` | الموقع في `dist/`، بمسارات تبدأ بـ `/` (ومجلد `docs/` مضمَّن). | نشر التطبيق على خادم ويب. |
| `npm run electron:build` | الموقع نفسه مبنيًا بـ `--base ./` ليُفتح من ملف، ثم مثبّت في `dist-electron/`. | تسليم التطبيق كبرنامج سطح مكتب. |

`dist/` الناتج عن `npm run build` يعرض نافذة بيضاء إن فتحته في Electron لأن مساراته تبدأ بـ `/`. شغّل `electron:build` (أو `kreft build --base ./`) أولًا. ولا مانع من الاثنين: `electron:build` يعيد كتابة `dist/`، فشغّل `npm run build` من جديد قبل نشر الموقع.

## الأمان

النافذة تتبع إرشادات Electron الأمنية:

- `contextIsolation: true` و`nodeIntegration: false` و`sandbox: true`: صفحتك لا ترى Node.js.
- الروابط الخارجية تُفتح في المتصفح الافتراضي للنظام، لا داخل النافذة.
- التنقل بعيدًا عن أصل التطبيق ممنوع.
- الجسر يمرر حقولًا مسموحة فقط إلى نوافذ الحوار.

## استكشاف الأخطاء

| الرسالة أو العَرَض | الحل |
|---|---|
| `Electron is not installed locally` | `kreft add -D electron` |
| `electron-builder is not installed` | `kreft add -D electron-builder` |
| نافذة بيضاء في التطبيق المحزوم | أعد تشغيل `electron:build` (يلزمه `--base ./`) وتأكد من وجود `dist/index.html` |
| `.deb` أو `.rpm` تفشل على Mac | ابنهما على Linux أو احذفهما من `build.linux.target` |
| خطأ author/maintainer/homepage عند بناء Linux | أضف `author` ببريد و`homepage` و`build.linux.maintainer` في `package.json` |
| لا أستطيع إخفاء القائمة | استعمل `ELECTRON_MENU=hide`؛ وللتطبيقات القديمة أعد توليد `electron/main.js` |

## مثال: تطبيق ملاحظات لسطح المكتب (واجهة فقط)

تطبيق لا يحتاج خادمًا: الملاحظات تُحفظ بـ `saved` في الجهاز، وأوامر النظام عبر الجسر.

```html
<!-- pages/Notes.kreft -->
saved notes = []                         // تبقى بعد إغلاق التطبيق
state text = ''
state info = null

on start { if (Kreftjs.isElectron) info = await kreftDesktop.getInfo() }

action add() {
  if (!text.trim()) return
  notes.unshift({ id: Date.now(), text: text.trim() })
  text = ''
}

action removeNote(n) {
  if (Kreftjs.isElectron) {
    const r = await kreftDesktop.showMessageBox({
      type: 'question', buttons: ['حذف', 'إلغاء'], defaultId: 1, cancelId: 1,
      message: 'حذف هذه الملاحظة؟',
    })
    if (r.response !== 0) return
  }
  notes = notes.filter((x) => x.id !== n.id)
}

action hideMenu() { kreftDesktop.setMenu('hide') }

<view>
  <h1>ملاحظاتي</h1>
  <form novalidate @submit.prevent={add}>
    <input k-model="text" placeholder="اكتب ملاحظة…">
  </form>

  <ul>
    <li k-each="n in notes" k-key="n.id">{n.text} <button @click="removeNote(n)">✕</button></li>
  </ul>

  <p k-if="info">{info.name} {info.version} · {info.platform}</p>
  <button k-if="Kreftjs.isElectron" @click="hideMenu">أخفِ القائمة</button>
</view>
```

## تمارين

1. أنشئ تطبيق سطح مكتب بـ `kreft new notes --electron`، وغيّر الأيقونة، وابنِ `.dmg` أو `.exe`.
2. أضف دالة `ping` خاصة بك عبر `ipcMain` و`preload.js`.
3. ابنِ للنظامين وقارن حجم المثبّتين.
