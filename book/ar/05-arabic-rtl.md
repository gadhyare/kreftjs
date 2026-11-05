# الفصل الخامس: العربية والترجمة والاتجاه (RTL)

Kreft يترجم النصوص ويقلب الاتجاه للغات التي تُكتب من اليمين إلى اليسار: العربية والعبرية والفارسية والأردية. هذا الفصل مخصص لنا.

## ملفات الترجمة

المشروع الجديد يأتي بمجلد `lang/` في جذره، وفيه العربية والإنجليزية جاهزتان: `lang/ar.json` و`lang/ar/messages.json` و`lang/ar/validation.json` و`lang/ar/pagination.json` (ويُقرأ أيضًا `frontend/lang/` و`backend/lang/` و`resources/lang/`). استعمل `lang/ar.json` للنصوص البسيطة، أو `lang/ar/messages.json` للمفاتيح المجمّعة.

```json
// lang/ar/messages.json
{
  "welcome": "أهلًا بك في تطبيقي",
  "hello": "مرحبًا، :name",
  "items": "{0} لا توجد عناصر|{1} عنصر واحد|{2} عنصران|[3,10] :count عناصر|[11,*] :count عنصرًا"
}
```

```json
// lang/en/messages.json
{
  "welcome": "Welcome to my app",
  "hello": "Hello, :name",
  "items": "{0} No items|{1} One item|[2,*] :count items"
}
```

وفي أي صفحة:

```html
<h1>{$t('messages.hello', { name: user.name })}</h1>
<p>{$choice('messages.items', count)}</p>
```

- الرسالة تستعمل `:name` للقيم.
- للجمع افصل الصيغ بـ `|`، وحدّد المجال بين `{}` للقيمة الواحدة (`{0}` و`{2}`) أو `[من,إلى]` (`[3,10]` و`[11,*]`). هذا يناسب العربية تمامًا: صفر، وواحد، واثنان، وجمع القلة (3–10)، وما فوق (11+) بصيغة التمييز المنصوب.

## تبديل اللغة

```js
Kreftjs.locale('ar')          // يتبدّل <html lang> و dir وتُعاد رسم كل الصفحات
Kreftjs.fallbackLocale('en')  // اللغة الاحتياطية
Kreftjs.locales()             // اللغات المحمّلة
Kreftjs.translations('ar', { 'app.title': 'تطبيقي' })  // نصوص إضافية من الشيفرة
```

## مبدّل لغة كامل (مع التذكّر)

```html
<!-- components/LangSwitch.kreft -->
saved lang = 'ar' as 'app.lang'

watch lang { Kreftjs.locale(value) }
on start { Kreftjs.locale(lang) }

<view>
  <button class="lang" @click="lang = lang === 'ar' ? 'en' : 'ar'">
    {lang === 'ar' ? 'English' : 'العربية'}
  </button>
</view>
```

- `saved` يتذكر الاختيار بعد إعادة التحميل.
- `watch` يطبّق اللغة عند كل تغيير.
- `on start` يطبّقها عند فتح الصفحة.

## الاتجاه

يُضبط `dir` تلقائيًا من اللغة، ويمكنك ربطه بيدك:

```html
<view dir={isArabic ? 'rtl' : 'ltr'}>…</view>
```

## اكتب CSS ينقلب وحده

استعمل الخصائص المنطقية (logical properties) بدل left/right:

| تجنّب | استعمل |
|---|---|
| `margin-left` / `margin-right` | `margin-inline-start` / `margin-inline-end` |
| `padding-left` / `padding-right` | `padding-inline-start` / `padding-inline-end` |
| `left: 0` / `right: 0` | `inset-inline-start: 0` / `inset-inline-end: 0` |
| `text-align: left` / `right` | `text-align: start` / `end` |
| `border-left` / `border-right` | `border-inline-start` / `border-inline-end` |

```css
.sidebar {
  position: fixed;
  inset-inline-start: 0;           /* يسار في LTR، يمين في RTL */
  padding-inline-start: 24px;
  border-inline-end: 1px solid var(--border);
}

[dir="rtl"] .back-arrow { transform: scaleX(-1); }    /* اقلب أيقونة */
```

## نصائح عملية للتطبيقات العربية

1. **الأرقام:** استعمل `Intl.NumberFormat('ar-EG')` للأرقام الهندية أو `ar-SA`/`ar-MA` لما تفضله بلدك:
   ```html
   derive fmt = new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-US')
   <p>{fmt.format(total)}</p>
   ```
2. **التواريخ:** `new Date().toLocaleDateString('ar', { dateStyle: 'long' })`. اختر التقويم بـ `ar-SA-u-ca-islamic` إذا أردت الهجري.
3. **الخطوط:** اختر خطًا عربيًا (مثل Cairo أو Tajawal). في تطبيقات سطح المكتب لا تعتمد على تحميل خط من الإنترنت؛ ضمّن الخط محليًا.
4. **الأيقونات الاتجاهية:** الأسهم والرجوع تحتاج `scaleX(-1)` في RTL كما في المثال.
5. **النص المختلط:** اللاتينية داخل العربية قد تبدّل ترتيب علامات الترقيم. غلّف المقطع بـ `<bdi>` أو `unicode-bidi: isolate`.
6. **حقول الإدخال:** للبريد والرقم السري وأرقام الهاتف أضف `dir="ltr"` حتى تُكتب صحيحة.

```html
<input type="email" dir="ltr" k-model="form.email" placeholder="name@example.com">
```

## على الخادم

لغة الطلب تأتي من `?lang=` أو كوكي `lang` أو `Accept-Language`، ورسائل الخادم تُقرأ من `lang/<locale>/`، والعربية جاهزة في المشروع الجديد:

```json
// lang/ar/validation.json  (موجود أصلًا في المشروع الجديد)
{
  "required": "حقل :attribute مطلوب.",
  "email": "يجب أن يكون :attribute عنوان بريد إلكتروني صالح.",
  "min": { "string": "يجب أن يحتوي :attribute على :min أحرف على الأقل." },
  "attributes": { "email": "البريد الإلكتروني", "password": "كلمة المرور" },
  "not_common_password": "كلمة المرور شائعة جدًا أو سهلة التخمين. اختر غيرها."
}
```

المفتاح `attributes` يترجم أسماء الحقول داخل الرسائل: فتظهر "حقل البريد الإلكتروني مطلوب" بدل "حقل email مطلوب".

وللتخصيص الدقيق لنموذج بعينه استعمل `messages()` في `FormRequest`.

## مثال: صفحة هبوط ثنائية اللغة مع SEO

```html
<!-- pages/Home.kreft -->
import LangSwitch from '../components/LangSwitch.kreft'

state count = 3

<view>
  <header class="top">
    <h1>{$t('messages.hello', { name: 'الزائر' })}</h1>
    <lang-switch></lang-switch>
  </header>
  <p>{$choice('messages.items', count)}</p>
  <button @click="count++">+</button>
</view>

<style scoped>
.top {
  display: flex;
  justify-content: space-between;
  padding-inline: 24px;
}
</style>
```

ولظهور الصفحة صحيحة لمحركات البحث بلغتين، أعلن البدائل في `backend/routes/seo.js` (انظر فصل النشر):

```js
module.exports = {
  '/': {
    title: 'متجري',
    description: 'كل ما يحتاجه بيتك',
    alternates: { en: 'https://example.com/', ar: 'https://example.com/ar/' },
  },
}
```

## تمارين

1. اجعل تطبيقك ثنائي اللغة (عربي/إنجليزي) واحفظ اللغة المختارة.
2. حوّل كل `margin-left` و`padding-right` في CSS تطبيقك إلى خصائص منطقية وجرّب التبديل.
3. اكتب مكوّن سعر يعرض المبلغ بالأرقام الهندية عند العربية.
