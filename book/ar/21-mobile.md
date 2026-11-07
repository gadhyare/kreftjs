# الفصل الحادي والعشرون: تطبيقات الموبايل (iOS وAndroid)

يمكن لـ Kreft أن يحوّل تطبيقك إلى تطبيق iPhone وAndroid. الصفحات هي ملفات `.kreft` نفسها؛ و[Capacitor](https://capacitorjs.com) يضعها داخل نافذة ويب أصلية (WebView) على الهاتف. بهذا يخرج التطبيق الواحد كموقع، وكتطبيق هاتف، وكتطبيق سطح مكتب (الفصل العاشر).

> **تنبيه مهم:** الواجهة الخلفية (قاعدة البيانات والمسارات) **لا تعمل داخل الهاتف**. تعمل على حاسوبك أو على خادم، ويتصل بها التطبيق بعنوان تحدّده أنت (`--api-url`).

## قبل أن تبدأ

| تريد | تحتاج |
|---|---|
| Android | [Android Studio](https://developer.android.com/studio) ومحاكيًا (من **Device Manager** اختر **Create Device**). يعمل على Mac وWindows وLinux. |
| iPhone | حاسوب Mac وبرنامج **Xcode** كاملًا من App Store (ليس أدوات سطر الأوامر وحدها). ثم نفّذ مرة واحدة: `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`. |
| Java | **Java 21 أو 22 أو 23** لبناء Android (لأن Gradle 8.11 لا يعمل مع نسخة أقدم أو أحدث). لا تقلق: أوامر `kreft mobile:*` تجد Java مناسبة وحدها (التي نزّلها Gradle أو المثبّتة أو التي داخل Android Studio) وتكتب `org.gradle.java.home` في `android/gradle.properties`. وإن لم تجد تقول لك ذلك: `brew install --cask temurin@21`. |

## البداية السريعة

```bash
kreft new my-app --mobile    # أو: kreft mobile:init داخل تطبيق موجود
cd my-app
npm install
kreft mobile:run --android   # يبني ويثبّت ويشغّل التطبيق على المحاكي أو الهاتف
```

`kreft mobile:run` هو الأمر الذي ترى به تطبيقك. يبني الموقع، وينسخه إلى `android/`، ويشغّل Gradle، ويثبّت التطبيق ويفتحه. إن كان جهاز Android واحد يعمل (محاكٍ أو هاتف) استعمله وحده؛ وإن كانت عدة أجهزة سألك Capacitor، أو اكتب `--target emulator-5554`. بعد كل تعديل على الكود شغّل الأمر نفسه من جديد.

> ⚠️ شغّل الأوامر **داخل مجلد تطبيقك**، لا داخل مجلد إطار Kreft نفسه. أوامر `mobile:` ترفض العمل خارج تطبيق Kreft ولا تغيّر شيئًا (تقول: `This folder is not a Kreft app`).

## الأوامر

| الأمر | ماذا يفعل |
|---|---|
| `kreft mobile:init` (أو `make:mobile`) | يضيف `capacitor.config.json` وحزم Capacitor والإضافات الأصلية والسكربتات وعدّة الواجهة. |
| `kreft mobile:run [--android] [--ios] [--target id]` | يبني ثم يثبّت التطبيق ويشغّله على المحاكي أو الهاتف. |
| `kreft mobile:build [--android] [--ios] [--api-url …]` | يبني الموقع ويضيف المنصة أول مرة ثم يزامن المشروع الأصلي (لا يفتح شيئًا). |
| `kreft mobile:dev [--android] [--ios] [--target id] [--no-setup]` | تهيئة أول تشغيل، ثم خادم التطوير، ثم التطبيق مع **إعادة تحميل حية**. |
| `kreft mobile:setup` | تهيئة أول تشغيل وحدها (انظر أدناه). |
| `kreft mobile:open [--android] [--ios]` | يفتح مشروع Android Studio أو Xcode. |
| `kreft mobile:ui [--layout] [--gallery]` | يضيف عدّة الواجهة (المكوّنات و`Kreftjs.native` و`edge.css`). |
| `kreft mobile:icons ملف.png` و`kreft mobile:splash ملف.png` | أيقونة التطبيق وشاشة البداية بكل المقاسات. |
| `kreft make:home --mobile` أو `--desktop` | صفحة رئيسية بتصميم تطبيق. |
| `kreft mobile:help` | قائمة مختصرة في الطرفية. |
| `kreft build --pwa` | موقع قابل للتثبيت ويعمل دون اتصال (للويب، لا للتطبيق). |

## أين الخادم؟

التطبيق على الهاتف يحتاج عنوانًا يستطيع الوصول إليه:

| التطبيق يعمل على | عنوان الخادم الذي على حاسوبك |
|---|---|
| محاكي Android | `http://10.0.2.2:8000` |
| محاكي iOS | `http://localhost:8000` |
| هاتف حقيقي على نفس الواي فاي | `http://192.168.x.x:8000` (عنوان حاسوبك؛ شغّل الخادم بـ `kreft dev --host 0.0.0.0`) |
| بعد النشر | `https://api.your-site.com` |

```bash
kreft mobile:build --android --api-url http://10.0.2.2:8000
```

يكتب `--api-url` القيمة في `.env` باسم `PUBLIC_API_URL`، وتستعملها في كودك هكذا:

```js
Kreftjs.api.setup({ base: Kreftjs.env.PUBLIC_API_URL, token: () => Kreftjs.storage.get('token') })
```

سجّل الدخول في التطبيق برموز API لا بجلسات الكوكيز، واستعمل `https://` دائمًا في التطبيق المنشور.

## تهيئة أول تشغيل: `mobile:setup`

مشروع جديد من git لا يحوي `.env` ولا قاعدة بيانات. يشغّل `kreft mobile:dev` تلقائيًا `kreft mobile:setup` قبل بدء الخادم (وتتخطاه بـ `--no-setup`):

1. **`key:generate`** يُنشئ `.env` ومفتاح `APP_KEY` **فقط إن كانا مفقودين**. المفتاح الجيد لا يُستبدل أبدًا (لأن ذلك يُخرج كل المستخدمين من حساباتهم)، ولا يُطبع المفتاح في الطرفية.
2. **`storage:link`** يربط مجلد `storage` للملفات العامة.
3. **`migrate`** يُنفّذ ترحيلات قاعدة البيانات، وقاعدة جديدة تُملأ بالبيانات التجريبية (المستخدم التجريبي).

كل خطوة تعمل فقط عند الحاجة، فتكرارها آمن. المخرجات مثل:

```
  First-run setup
    ✔ APP_KEY is set
    ✔ storage linked (public files)
    ✔ database: 4 migrations ran
```

وإن كان المنفذ `8000` مشغولًا يأخذ `mobile:dev` المنفذ الحر التالي ويُخبر التطبيق به. وفي المحاكي يستعمل العنوان `10.0.2.2` تلقائيًا، ويختار المحاكي المفتوح وحده. **انتبه:** الخادم أثناء الإعادة الحية مفتوح لكل من على شبكتك، فاستعمله على شبكة تثق بها.

## صفحة رئيسية بتصميم تطبيق

صفحة الترحيب في موقع ليست ما يجب أن يفتح عليه التطبيق. يكتب `kreft new my-app --mobile` **شاشة رئيسية للهاتف**: بطاقة ترحيب متدرجة اللون مع تحية بحسب الوقت واسم المستخدم المسجّل، وبلاطات اختصارات تظهر واحدة بعد الأخرى، وبطاقة تعرض أحداث اللمس. والشريطان العلوي والسفلي يأتيان من التخطيط. وبـ `--electron` تحصل على **مساحة عمل لسطح المكتب** (شريط جانبي وشريط أدوات). ومع الاثنين معًا تُظهر `pages/Home.kreft` الواجهة المناسبة بحسب المكان. جرّب أيًّا منهما في المتصفح بإضافة `?platform=mobile` أو `?platform=desktop` إلى العنوان.

## شريطان علوي وسفلي لا يتحرّكان

في `layouts/mobile.kreft` تقع الصفحة بين شريط علوي وشريط سفلي. **الصفحة وحدها تتمرّر**، أما الشريطان فلا يتحرّكان، ولا ترتدّ الصفحة، وهما يبتعدان عن الحافة المقطوعة والشريط السفلي للنظام بنفسيهما. البداية في كتلة `base` أعلى ذلك الملف، وأي صفحة تغيّرها بسطر واحد (وتعود للأصل عند الانتقال لصفحة أخرى):

```html
use edge

on ready {
  edge.setTop({ title: 'السلة', center: true, bg: '#111827', color: '#ffffff',
    right: [{ icon: 'search', id: 'search', onTap: () => openSearch() }, { icon: 'bell', badge: 3 }] })
  edge.setBottom({ labels: 'active', indicator: 'line', floating: true, activeColor: '#38bdf8' })
}
```

| `edge.setTop` | `edge.setBottom` |
|---|---|
| `title` و`subtitle` و`back` | `items`: `[{ label, icon, to, badge }]` |
| `bg` و`color` و`height` | `bg` و`color` و`activeColor` و`height` |
| `center` و`border` و`elevated` و`blur` | `labels`: `always` أو `active` أو `never` |
| `left` و`right`: أزرار `{ icon, id, badge, onTap }` | `indicator`: `pill` أو `line` أو `none` |
| `show: false` يخفي الشريط | `floating` و`blur` و`border` و`haptics` |

و`edge.reset()` يعيد الأصل، و`edge.hideBars()` يخفي الشريطين. وهما مكوّنان عاديان أيضًا: `<edge-top-bar>` و`<edge-bottom-nav>`. ألوان التطبيق كلها متغيّرات في أعلى `edge.css` (`--edge-top-bg` و`--edge-accent` …) وتتبع ألوان `ui.css` فيعمل الوضع الداكن وحده.

## المكوّنات (42 مكوّنًا)

في كل مشروع `--mobile` صفحة `/edge` تعرض كل المكوّنات حيّة، وفي أعلى كل ملف تعليق يسرد خصائصه. أهمها:

| المكوّن | ما هو |
|---|---|
| `edge-shell` و`edge-top-bar` و`edge-bottom-nav` و`edge-side-nav` | الإطار والشريطان والقائمة الجانبية |
| `edge-row` و`edge-column` و`edge-stack` و`edge-spacer` و`edge-divider` | التخطيط |
| `edge-list` و`edge-lazy-grid` و`edge-virtual-list` و`edge-carousel` و`edge-pager` | القوائم والشبكات والتمرير |
| `edge-button` و`edge-text-input` و`edge-select` و`edge-checkbox` و`edge-toggle` و`edge-slider` | الإدخال |
| `edge-modal` و`edge-bottom-sheet` و`edge-menu` و`edge-fab` | النوافذ والقوائم والزر العائم |
| `edge-text` و`edge-icon` (55 أيقونة) و`edge-image` و`edge-badge` و`edge-chip` | العرض |
| `edge-pressable` و`edge-gesture-area` و`edge-refreshable` | اللمس والسحب للتحديث |

القيم المتغيّرة تعود بـ `k-model` كما في الفصل الثالث، مثل `<edge-toggle k-model="notify" label="الإشعارات">`.

## أحداث اللمس

```html
<div @tap={open}>افتح</div>
<li @swipeleft={remove($event)} @longpress={select}>صف</li>
```

`@tap` و`@longpress` و`@swipe` و`@swipeleft` و`@swiperight` و`@swipeup` و`@swipedown`. تعمل بإصبع أو قلم أو فأرة، وتقبل `.once` و`.prevent` و`.stop`.

## الميزات الأصلية: `Kreftjs.native`

تعمل في تطبيق الهاتف (بإضافات Capacitor) وفي Electron وفي المتصفح (بما يملكه المتصفح)، فتبني التطبيق كله في المتصفح أولًا. كل استدعاء يعيد وعدًا (Promise) ولا يفشل بسبب "غير مدعوم"؛ بل يعطي قيمة معقولة.

| المجال | أمثلة |
|---|---|
| المنصة | `native.platform()` يعطي `android` أو `ios` أو `electron` أو `web` |
| الجهاز | `device.info()` و`device.battery()` و`device.language()` |
| الاهتزاز | `haptics.impact('light')` و`haptics.notification('success')` |
| الملفات | `file.pick({ accept: 'image/*' })` و`file.write(path, data)` و`file.read(path)` و`file.save(name, data)` |
| النظام | `system.share({ title, url })` و`system.copy(text)` و`system.network()` و`system.openUrl(url)` (http وhttps وmailto وtel وsms فقط) |
| الحوارات | `dialog.alert` و`dialog.confirm` (تعطي `true` أو `false`) و`dialog.prompt` و`dialog.actionSheet` و`dialog.toast` |
| المنطقة الآمنة | `safeArea()` |
| الموقع | `position.get()` و`position.watch(fn)` |
| الأحداث | `on('pause' \| 'resume' \| 'network', fn)` و`pushBack(fn)` لزر الرجوع في Android |
| الأصول | `asset('img/logo.png')` |

على iPhone تحتاج الكاميرا والموقع والصور نصًّا يشرح السبب في `ios/App/App/Info.plist`.

## شاشة البداية المتحركة

يعرض الهاتف أولًا شاشة البداية الأصلية. تضيف العدّة شاشة **متحركة** تتسلّم منها بلا وميض: يتحرك شعارك، ويظهر اسم التطبيق تدريجيًا، وحين يصبح التطبيق جاهزًا تتلاشى. هي العنصر `<div id="edge-splash">` في `index.html`:

```html
<div id="edge-splash" class="edge-splash" data-anim="pulse" data-web="false">…</div>
```

- `data-anim`: `pulse` (يتنفس الشعار) أو `zoom` أو `rise` أو `none`.
- `data-web="true"` لإظهارها في المتصفح أيضًا (افتراضيًا يتخطاها).
- الألوان: `--edge-splash-bg` و`--edge-splash-fg` في `edge.css`.
- من الكود: `Kreftjs.native.splash.set({ minTime: 1500, anim: 'zoom' })`.
- لا تعلق أبدًا: تختفي بعد 8 ثوانٍ كحد أقصى، ومن طلب من هاتفه حركة أقل يرى تلاشيًا بسيطًا.

وللشاشة والأيقونة الأصليتين (يلزم إنترنت في المرة الأولى):

```bash
kreft mobile:icons logo.png --bg "#ffffff"                          # صورة PNG مقاس 1024x1024
kreft mobile:splash splash.png --bg "#ffffff" --dark-bg "#000000"    # صورة PNG مقاس 2732x2732
```

اجعل لون الخلفية نفسه في الأصلية وفي المتحركة كي لا يظهر وميض.

## النشر على Google Play وApp Store

هذه هي خطوات Capacitor وAndroid Studio وXcode المعتادة. اختبارات الإطار تبني وتشغّل تطبيقات **تجريبية (debug)** على محاكي Android ولا تصنع نسخ المتاجر، فتحقّق من كل خطوة على جهازك.

1. **سمِّه قبل أول بناء.** يعطي `kreft new` المعرّف `com.example.<الاسم>`. ضع معرّفك (`com.yourcompany.myapp`) والاسم في `capacitor.config.json` **قبل** أول `kreft mobile:build`؛ لأن المعرّف يُكتب داخل `android/` و`ios/` عند إنشائهما.
2. الأيقونة وشاشة البداية (الأمران أعلاه).
3. اربطه بخادمك الحقيقي: `--api-url https://api.your-site.com`، ويجب أن يسمح الخادم للتطبيق عبر CORS.
4. أرقام الإصدار: في Android `versionCode` (رقم صحيح يكبر مع كل رفع) و`versionName` في `android/app/build.gradle`، وفي iOS خانتا *Version* و*Build* في Xcode.
5. **Android:** `kreft mobile:open --android` ثم في Android Studio: *Build ← Generate Signed App Bundle / APK*. أنشئ keystore واحفظه وكلمات سره بأمان؛ تحتاج الملف نفسه لكل تحديث. ارفع ملف `.aab` في Google Play Console.
6. **iPhone:** `kreft mobile:open --ios` (Mac وXcode)، اختر فريقًا ثم *Product ← Archive* ثم *Distribute App*. البيع في App Store يحتاج حساب Apple Developer مدفوعًا.
7. قبل الإرسال: جرّب على هاتف حقيقي، واكتب سياسة الخصوصية التي تطلبها المتاجر، واذكر الأذونات التي تستعملها فقط.

## الأمان

- **كل ما داخل التطبيق يستطيع قراءته من يثبّته**: الملفات والكود وكل قيمة `PUBLIC_`. المفاتيح وكلمات السر تبقى على الخادم؛ التطبيق يكلّم خادمك، وخادمك يكلّم الخدمات الأخرى.
- سجّل الدخول برموز API، واحفظ الرمز في التخزين الآمن للهاتف، واستعمل `https://` لكل عنوان.
- `edge-web-view` يعرض عناوين `http(s)` والنسبية فقط، داخل صندوق رمل (sandbox) لا يصل لبيانات تطبيقك.
- لا تضع `--host 0.0.0.0` على شبكة عامة.

## استكشاف الأخطاء

| ما تراه | السبب والحل |
|---|---|
| `invalid source release: 21` | Gradle يعمل على Java أقدم من 21. أوامر `kreft mobile:*` تصلحه وحدها وتكتب السطر في `android/gradle.properties`. |
| `Unsupported class file major version 69` | Gradle يعمل على Java أحدث من 23 (مثل 25 أو 26). استعمل Java 21. |
| `This folder is not a Kreft app` | شغّلت الأمر خارج تطبيق (مثلًا في مجلد الإطار). ادخل مجلد تطبيقك: `cd my-app`. |
| `Capacitor is not installed` | نفّذ `npm install` في التطبيق. |
| لا يفتح شيء بعد `mobile:build` | يجهّز المشروع فقط. استعمل `kreft mobile:run --android` أو `mobile:dev`. |
| الصفحة تفتح لكن البيانات وتسجيل الدخول يفشلان | التطبيق يتصل بعنوان لا يصل إليه الهاتف. ابنِ بـ `--api-url` وراجع جدول العناوين. |
| المحتوى تحت شريط الحالة | Android 15 وما بعده يرسم التطبيق حتى الحافة. أضف `android.adjustMarginsForEdgeToEdge: "force"` إلى `capacitor.config.json` القديم (الجديد فيه). |
| الهاتف يعرض نسخة قديمة بعد إعادة البناء | بناء قديم سجّل Service Worker يقدّم ملفات مخزّنة. البناءات الجديدة تزيله وحدها، وقد يحتاج هاتف فيه ذلك إلى مسح بيانات التطبيق مرة واحدة (`adb shell pm clear com.example.yourapp`). |
| `kreft --version` يعرض رقمًا قديمًا | أمر `kreft` هو المثبّت عالميًا: `npm install -g kreftjs@latest`. |

## ما الذي جُرّب فعلًا؟

نكتب هنا بصراحة ما تحقّقنا منه وما لم نتحقق منه:

- **جُرّب على محاكي Android:** بناء نسخة debug وتشغيلها، والإضافات الأصلية (معلومات الجهاز والشبكة)، وشاشة البداية المتحركة، والأشرطة الثابتة وتخصيصها، وأحداث اللمس، و`kreft mobile:run`، والإعادة الحية بـ `kreft mobile:dev` (تعديل محفوظ ظهر في التطبيق الجاري خلال ثانيتين دون إعادة بناء).
- **لم يُجرَّب:** محاكي iOS وXcode (لا يتوفران في بيئة الاختبار)، ونسخ المتاجر الموقّعة.

## مثال: قائمة مهام للهاتف

صفحة `pages/Tasks.kreft` (أضف مسارها في `routes/web.kreft`). تجمع حقل إدخال وزرًا وقائمة وحوار تأكيد واهتزازًا وإشعارًا عابرًا:

```html
use edge

saved tasks = []
state text = ''

action add() {
  const title = text.trim()
  if (!title) return
  tasks = [{ id: Date.now(), title }, ...tasks]
  text = ''
  Kreftjs.native.haptics.notification('success')
  Kreftjs.native.dialog.toast('أُضيفت المهمة', { tone: 'success' })
}

action remove(task) {
  Kreftjs.native.dialog
    .confirm('حذف «' + task.title + '»؟', { ok: 'حذف', cancel: 'إلغاء', danger: true })
    .then((yes) => { if (yes) tasks = tasks.filter((t) => t.id !== task.id) })
}

on ready { edge.setTop({ title: 'مهامي', center: true }) }

<view>
  <section class="page">
    <edge-text-input k-model="text" placeholder="مهمة جديدة" icon="plus" @enter="add()"></edge-text-input>
    <edge-button label="أضف" icon="check" full @click="add()"></edge-button>
    <edge-text k-if="tasks.length === 0" muted>لا مهام بعد.</edge-text>
    <edge-list items={tasks} inset @select="remove($event)"></edge-list>
  </section>
</view>

<style scoped>
.page { display: flex; flex-direction: column; gap: 12px; padding: 16px; }
</style>
```

اضغط على مهمة لتسأل عن حذفها. القائمة محفوظة (`saved`) فتبقى بعد إغلاق التطبيق.

## تمارين

1. أنشئ تطبيقًا بـ `kreft new notes --mobile` وشغّله بـ `kreft mobile:run --android`، ثم غيّر لون الشريط العلوي من `layouts/mobile.kreft`.
2. أضف زرًّا في الشريط العلوي (`edge.setTop({ right: [...] })`) يشارك نص مهمة عبر `Kreftjs.native.system.share`.
3. غيّر حركة شاشة البداية إلى `zoom` وزد `minTime`، ثم أعد التشغيل بـ `kreft mobile:run` وراقبها.
4. شغّل `kreft mobile:dev --android`، عدّل نصًّا في الصفحة، وراقب ظهوره في المحاكي دون إعادة بناء.
5. ضع معرّفك الخاص في `capacitor.config.json` وابنِ نسخة موقّعة لـ Android (على جهازك).
