# الفصل التاسع عشر (خبير): معالج إعداد متعدد الخطوات مع استئناف وحراسة المسارات

المعالج (Wizard) يجمع كل مهارات هذا الكتاب في مثال واحد: مخزن محفوظ للاستئناف، ومكوّنات متعددة تتبدل بـ `keep`، وتحقق لكل خطوة قبل الانتقال، وحراسة للمسارات تمنع القفز، وحركة خفيفة. سنبني "إعداد الحساب" من ثلاث خطوات.

**جُرِّبت الشيفرة** خطوة خطوة في المتصفح.

## 1) المخزن المحفوظ (القلب النابض)

حالة المعالج تعيش في مخزن واحد محفوظ، فتنجو من إعادة التحميل وتُشارك بين الصفحات:

```js
// logic/wizard.js — أنشئه مرة قبل الموجِّه
Kreftjs.store('wizard', {
  step: 1,
  data: { name: '', email: '', plan: 'basic' },
  completed: false,
  next() { if (this.step < 3) this.step++ },
  prev() { if (this.step > 1) this.step-- },
  finish() { this.completed = true },
}, { saved: true })
```

- `saved: true` يحفظ `step` و`data` و`completed` في `localStorage` (الدوال لا تُحفظ).
- كل مكوّن يكتب `use wizard` فيرى الحالة نفسها ويغيّرها، وكل تغيير يحدّث كل من يقرؤها.

## 2) الخطوات الثلاث

كل خطوة مكوّن مستقل يربط حقوله مباشرة بالمخزن:

```html
<!-- pages/wizard/Step1.kreft -->
use wizard

<view>
  <h2>١) معلوماتك</h2>
  <label>الاسم
    <input k-model="wizard.data.name" placeholder="اسمك الكامل">
  </label>
  <label>البريد
    <input type="email" k-model="wizard.data.email" placeholder="you@example.com">
  </label>
</view>
```

```html
<!-- pages/wizard/Step2.kreft -->
use wizard

<view>
  <h2>٢) خطتك</h2>
  <label><input type="radio" value="basic" k-model="wizard.data.plan"> أساسية</label>
  <label><input type="radio" value="pro" k-model="wizard.data.plan"> احترافية</label>
</view>
```

```html
<!-- pages/wizard/Step3.kreft -->
use wizard

<view>
  <h2>٣) راجع بياناتك</h2>
  <dl>
    <dt>الاسم</dt><dd>{wizard.data.name}</dd>
    <dt>البريد</dt><dd>{wizard.data.email}</dd>
    <dt>الخطة</dt><dd>{wizard.data.plan}</dd>
  </dl>
</view>
```

## 3) صفحة المعالج

```html
<!-- pages/wizard/Wizard.kreft -->
use wizard

state errors = {}

const stepRules = {
  1: { name: 'required|min:2', email: 'required|email' },
  2: { plan: 'required' },
  3: {},
}

action next() {
  errors = validate(wizard.data, stepRules[wizard.step] || {})
  if (Object.keys(errors).length) return      // أبقِ المستخدم في خطوته
  wizard.next()
}
action prev() { wizard.prev() }
action finish() { wizard.finish(); $router.go('/wizard/done') }

derive pct = Math.round(((wizard.step - 1) / 2) * 100)

<view>
  <h1>إعداد الحساب</h1>

  <div class="progress" aria-hidden="true">
    <div class="bar" style="width: {pct}%"></div>
  </div>

  <!-- keep يبقي حالة كل خطوة حين نعود إليها -->
  <kreft-component :is="'Step' + wizard.step" keep></kreft-component>

  <p k-if="Object.keys(errors).length" class="errors">
    {Object.values(errors).flat().join(' · ')}
  </p>

  <div class="actions">
    <button k-if="wizard.step > 1" @click="prev">السابق</button>
    <button k-if="wizard.step < 3" class="primary" @click="next">التالي</button>
    <button k-if="wizard.step === 3" class="primary" @click="finish">إنهاء</button>
  </div>
</view>

<style scoped>
.progress { height: 8px; background: var(--border, #ddd); border-radius: 4px; overflow: hidden; }
.bar { height: 100%; background: var(--accent, #4a7); transition: width .25s ease; }
.actions { display: flex; gap: 8px; margin-block-start: 16px; }
.errors { color: var(--danger, #b33); }
</style>
```

- **`validate`** قبل `wizard.next()`: لا ينتقل المستخدم إلا بعد أن تسلم حقول خطوته.
- **`keep`** على `<kreft-component :is>` يبقي ما كتبه المستخدم في الخطوة 1 حين يعود إليها من الخطوة 2.
- **`derive pct`** يحرّك شريط التقدم وحده.

## 4) التسجيل والحراسة

سجّل مكوّنات الخطوات وأنشئ الموجّه (أنشئ المخزن أولًا):

```js
Kreftjs.store('wizard', { /* كما أعلاه */ }, { saved: true })

const wizard = Kreftjs.store('wizard')   // نقرؤه في الحراسة

const router = Kreftjs.router({
  routes: [
    { path: '/wizard', component: 'pages/wizard/Wizard.kreft', guard: () => auth.user ? true : '/login' },
    { path: '/wizard/done', component: 'pages/wizard/Done.kreft', guard: () => wizard.completed ? true : '/wizard' },
  ],
})

Kreftjs.app('App.kreft')
  .component('Step1', 'pages/wizard/Step1.kreft')
  .component('Step2', 'pages/wizard/Step2.kreft')
  .component('Step3', 'pages/wizard/Step3.kreft')
  .use(router)
  .mount('#app')
```

- حراسة `/wizard` تتطلب الدخول، وحراسة `/wizard/done` تمنع فتح صفحة الإنجاز قبل `finish()`: من يكتب العنوان مباشرة يُعاد إلى `/wizard`.
- `guard` يعيد `true` للمرور أو مسارًا للذهاب إليه (راجع الفصل الرابع).

## 5) صفحة الإنجاز

```html
<!-- pages/wizard/Done.kreft -->
use wizard

action startOver() { wizard.$reset(); $router.go('/wizard') }

<view>
  <div k-animate="pop">
    <h2>اكتمل الإعداد 🎉</h2>
    <p>مرحبًا {wizard.data.name} — خطتك {wizard.data.plan}.</p>
    <button @click="startOver">ابدأ من جديد</button>
  </div>
</view>
```

`wizard.$reset()` يعيد المخزن إلى قيمه الأولى (الخطوة 1 وبيانات فارغة)، فتُحذف كل الآثار المحفوظة.

## 6) لمسة حركة: انتقال بين الخطوات

`keep` يُبقي الخطوة ولا يزيلها، فلا تصلح له حركة الدخول/الخروج مباشرة. إن أردت انتقالًا متحركًا استبدل `keep` بـ `k-if` مع `k-animate.after` (ينتظر خروج القديم قبل دخول الجديد):

```html
<div k-if="wizard.step === 1" k-animate.after="slide"><step1></step1></div>
<div k-if="wizard.step === 2" k-animate.after="slide"><step2></step2></div>
<div k-if="wizard.step === 3" k-animate.after="slide"><step3></step3></div>
```

التضحية أنك تفقد `keep` (لا يُحفظ ما كتبته في الخطوة 1 حين تنتقل). اختر حسب حاجتك: **الاحتفاظ** (keep) أو **الحركة** (k-animate.after).

## 7) جرّب الاستئناف بنفسك

1. افتح `/wizard` واملأ الخطوة 1 وانتقل للثانية.
2. حدّث الصفحة (F5) — ستجد نفسك في الخطوة 2 وبياناتك محفوظة (بفضل `saved`).
3. اكتب `/wizard/done` مباشرة — يعيدك الحارس إلى `/wizard` لأنك لم تُنهِ بعد.
4. أنهِ الخطوات ثم افتح `/wizard/done` — تمر هذه المرة.

## تمارين

1. أضف خطوة رابعة "صورة" ترفع ملفًا وتخزّن مساره في `wizard.data`.
2. اجعل الحارس يمنع أيضًا العودة إلى خطوة سابقة بعد الإنهاء (أعد التوجيه إلى `/wizard/done`).
3. استبدل `keep` بنسخة `k-animate.after` واحفظ البيانات المؤقتة في `saved` كي لا تضيع عند الانتقال.
