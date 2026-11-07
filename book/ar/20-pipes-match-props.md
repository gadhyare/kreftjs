# الفصل العشرون: الأنابيب و`k-match` وأنواع الخصائص

ثلاث إضافات تجعل القوالب أقصر وأوضح. كلها تعمل مع `kreft dev` ومع `kreft build` ومع سياسة CSP الصارمة، والصيغة القديمة لا تتأثر.

## 1) الأنابيب (Pipes)

بدل استدعاء دوال مساعدة داخل القالب، مرّر القيمة عبر أنبوب بعلامة `|`:

```html
<p>{ price | currency:'EUR' }</p>
<p>{ createdAt | ago }</p>
<p>{ title | capitalize | truncate:30 }</p>
<a title={name | upper}>{ tags | join:' · ' }</a>
```

- الوسائط بعد نقطتين: `truncate:30` و`currency:'EUR'`، أو بين قوسين: `number(2)`.
- تُسلسل الأنابيب من اليسار إلى اليمين.
- `||` و`|=` ليستا أنبوبًا، وكذلك `|` داخل نص أو تعبير نمطي أو قوسين.
- الأرقام والتواريخ تتبع لغة التطبيق الحالية (`Kreftjs.locale`)، فيتغير شكل العملة والتاريخ مع اللغة.

**الأنابيب الجاهزة:** `upper` و`lower` و`capitalize` و`trim` و`truncate:n` و`currency:'USD'` و`number:digits` و`percent:digits` و`date:'short'|'medium'|'long'` و`time` و`ago` و`bytes` و`json` و`fallback:'قيمة'` و`join:sep` و`first` و`last` و`slice:a:b` و`reverse` و`sortBy:'key':'desc'` و`count`.

**أنبوبك الخاص:** أي دالة في المكوّن تصلح أنبوبًا، وتتقدّم على الجاهز عند تطابق الاسم:

```js
// في سكربت المكوّن
state name = 'ali'
const wrap = (v, left = '«', right = '»') => left + v + right
```
```html
<p>{ name | wrap }</p>        <!-- «ali» -->
<p>{ name | wrap:'[':']' }</p> <!-- [ali] -->
```

ولتعريف أنبوب لكل التطبيق: `Kreftjs.pipe('shout', (v) => String(v).toUpperCase() + '!')`.

> **تنبيه:** `a | b` كانت تعني عملية OR على مستوى البتات. إن كنت تستخدمها في قالب فاكتبها `(a | b)` داخل دالة، فالقالب الآن يفسّرها أنبوبًا.

## 2) `k-match` و`k-case` و`k-default`

بدل سلسلة `k-if` و`k-elif`:

```html
<div k-match="status">
  <b k-case="'ok'">تم</b>
  <i k-case="'wait', 'queued'">بالانتظار</i>   <!-- أكثر من قيمة -->
  <u k-default>غير معروف</u>
</div>
```

- المقارنة صارمة (`===`).
- تُعرض أول حالة مطابقة فقط، و`k-default` للحالة التي لا يطابقها شيء (يوضع آخرًا).
- الأبناء المباشرون فقط هم الحالات، ويعملون كما يعمل `k-if`: مكوّنات و`<template>` و`k-animate`.

## 3) خصائص بأنواع

اكتب النوع بصيغة TypeScript، وتحصل على تحذير أثناء التطوير عند قيمة خاطئة أو خاصية مطلوبة غائبة:

```html
prop tone: 'info' | 'warn' = 'info'   // قيم محددة، والافتراضي info
prop label: string                     // مطلوبة: غيابها يحذّر
prop count?: number                    // اختيارية
prop items: string[] = []
prop onSave: (id: number) => void
```

يُتحقق من: `string` و`number` و`boolean` و`null` و`undefined` و`object` و`Date` و`T[]` والدوال والقيم الحرفية (`'sm'` و`3` و`true`) والاتحاد بينها. أما أسماء أنواعك (`User`) و`any` و`unknown` فلا تُفحص.

الخصائص التي لها قيمة افتراضية أو `?` أو تقبل `null`/`undefined` ليست مطلوبة. والنوع `number` أو `boolean` أو `string` يحوّل أيضًا القيمة المكتوبة نصًا في الوسم (`count="5"` تصبح `5`).

## تمارين

1. اعرض سعرًا بالدينار الكويتي وتاريخ إنشاء بصيغة `ago` في صفحة طلبات.
2. حوّل سلسلة `k-if` من أربع حالات لحالة الطلب إلى `k-match`.
3. أضف إلى مكوّن `Badge` الخاصية `prop tone: 'info' | 'warn' | 'danger' = 'info'` وجرّب `tone="loud"` لترى التحذير.
