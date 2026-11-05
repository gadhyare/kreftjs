# الفصل الثاني: لغة Kreft

ملف `.kreft` له ثلاثة أجزاء:

1. **السكربت:** كل ما هو خارج `<view>` و`<style>`. كل سطر يبدأ بكلمة مفتاحية.
2. **`<view>`:** HTML المكوّن.
3. **`<style>`** (اختياري): CSS. أضف `scoped` ليسري على هذا المكوّن فقط.

## الكلمات المفتاحية

| الكلمة | مثال | المعنى |
|---|---|---|
| `state` | `state count = 0` | قيمة قابلة للتغيّر. عند تغيّرها تتحدث الصفحة. |
| `derive` | `derive double = count * 2` | قيمة تُحسب من قيم أخرى وتتحدث وحدها. |
| `action` | `action add(n) { count += n }` | دالة تستدعيها من الصفحة أو من أفعال أخرى. |
| `when` | `when count > 10 { … }` | ينفّذ الكتلة كلما صار الشرط صحيحًا. |
| `watch` | `watch count { … }` | ينفّذ الكتلة كلما تغيّرت القيمة. داخلها `value` الجديدة و`old` السابقة. |
| `on` | `on ready { … }` | دورة الحياة: `start` و`ready` و`update` و`show` و`hide` و`destroy`. |
| `prop` | `prop start = 0` | قيمة يمررها الأب. ما بعد `=` هو الافتراضي. |
| `event` | `event save, remove` | أحداث يرسلها المكوّن لأبيه بـ `send('save', data)`. |
| `use` | `use cart` | يستعمل مخزنًا مشتركًا (store) أو منطقًا مشتركًا من ملف `.js`. |
| `share` / `receive` | `share theme = 'dark'` | يعطي قيمة لكل ما بداخل المكوّن / يأخذ قيمة شاركها أب. |
| `import` | `import Card from './Card.kreft'` | يستعمل مكوّنًا آخر أو وحدة JavaScript. |
| `saved` | `saved todos = []` | كـ `state` لكن محفوظة في المتصفح (localStorage). |
| `load` | `load users = api.get('/api/users')` | يجلب بيانات ويعطيك `users.data` و`users.loading` و`users.error` و`users.reload()`. |

داخل السكربت تستعمل الأسماء **مباشرة**: اكتب `count++` وليس `this.count++`.

## state: الحالة

```html
state count = 0

<view>
  <button @click="count++">النقر: {count}</button>
</view>
```

كل تغيير على `state` يحدّث الجزء المتأثر فقط من الصفحة، لا الصفحة كلها. التغييرات العميقة تُرصد أيضًا: `todos.push(...)` و`todo.done = true`.

## derive: القيم المشتقة

`derive` قيمة تُحسب من قيم أخرى. هي ليست دالة تستدعيها: تُعيد حساب نفسها تلقائيًا كلما تغيّرت القيم التي تقرؤها.

```html
state price = 10
state qty = 2

derive total = price * qty            // 20
derive label = `الإجمالي: ${total} $` // يستعمل derive آخر

action more() { qty++ }               // يتحدّث total وlabel وحدهما

<view>
  <p>{label}</p>
  <button @click={more}>+1</button>
</view>
```

- اكتب `{total}` وليس `{total()}`.
- لا تعيّن قيمة لـ `derive`. غيّر الـ `state` الذي يقرؤه.
- يمكنه استعمال مشتقات أخرى.

## action: الأفعال

الفعل الذي يستخدم `await` يصبح غير متزامن (async) تلقائيًا:

```html
state users = []
state busy = false

action async_example() {
  busy = true
  users = await api.get('/api/users')
  busy = false
}
```

## when و watch و on

```html
state todos = []
derive remaining = todos.filter((t) => !t.done).length

// ينفّذ عندما يصير الشرط صحيحًا
when todos.length && remaining === 0 {
  bus.send('toast', 'أنجزت كل المهام!')
}

// ينفّذ عند كل تغيّر
watch remaining {
  document.title = `(${value}) مهام`
}

on ready { console.log('المكوّن على الشاشة') }
on destroy { console.log('سيُزال المكوّن: نظّف هنا') }
```

متى أستعمل أيًّا منها؟

- **`derive`** لحساب قيمة ستعرضها.
- **`watch`** لتنفيذ عمل جانبي عند التغيّر: حفظ، أو استدعاء API، أو كتابة في `document.title`.
- **`when`** عندما يهمك لحظة تحوّل الشرط إلى صحيح.
- **`action`** دالة تستدعيها أنت بنفسك.

## مثال كامل

```html
<!-- TodoPage.kreft -->
state todos = []
state text = ''

derive remaining = todos.filter((t) => !t.done).length

action add() {
  if (!text.trim()) return
  todos.push({ id: Date.now(), text, done: false })
  text = ''
}

action clearDone() {
  todos = todos.filter((t) => !t.done)
}

when todos.length && remaining === 0 {
  bus.send('toast', 'All done!')
}

<view>
  <form @submit.prevent={add}>
    <input k-model="text" placeholder="مهمة جديدة">
  </form>
  <label k-each="todo in todos" k-key="todo.id">
    <input type="checkbox" k-model="todo.done"> {todo.text}
  </label>
  <p>{remaining} متبقية · <button @click={clearDone}>احذف المنجز</button></p>
</view>
```

## ما يجب أن تعرفه

- سطر لا يبدأ بكلمة مفتاحية هو JavaScript عادي (`let timer`, `const max = 10`). تستعمله أفعالك لكن الصفحة (`view`) لا تراه. استعمل `state` أو `derive` أو `action` لكل ما تحتاجه الصفحة.
- كل دوال Kreft متاحة في السكربت: `bus` و`store` و`signal` و`watch` و`tick` و`send` و`props` و`$route` و`$router`.
- رسائل الخطأ تسمي الملف والسطر، مثل: `"state" needs a name, like: state count = 0 (Bad.kreft, line 3)`.

## دورة الحياة

| الخطاف | يعمل |
|---|---|
| `on start` | قبل أن يظهر المكوّن. مناسب للبيانات الأولى. |
| `on ready` | المكوّن على الشاشة. |
| `on update` | بعد تغيّر الصفحة. |
| `on show` / `on hide` | مكوّن [محتفَظ به](03-components-and-state.md) يعود / يُوضع جانبًا. |
| `on destroy` | يُزال المكوّن. نظّف هنا. |

## القوالب (Templates)

### عرض القيم

```html
<h1>أهلًا {name}</h1>
<p>{count} عنصر · المجموع {total.toFixed(2)}</p>
<p>{isAdmin ? 'مدير' : 'مستخدم'}</p>
```

القيم تُهرَّب (escaped) دائمًا فهي آمنة للعرض. لعرض `{` حرفيًا اكتب `\{`. وفي القوالب اكتب `{a < b}` مع مسافة، لأن `<` متبوعة بحرف مباشرة تبدأ وسمًا.

### الخصائص (Attributes)

```html
<img src={user.photo} alt={user.name}>         <!-- القيمة كما هي -->
<button disabled={count === 0}>تصفير</button>   <!-- false تزيل الخاصية -->
<div class="card {active ? 'on' : ''}">         <!-- بناء نص -->
<a href="/users/{user.id}">الملف الشخصي</a>
```

`:class` و`:style` يقبلان كائنات أيضًا: `:class="{ done: todo.done }"`.

### الأحداث

```html
<button @click={add}>إضافة</button>
<button @click="add(5)">أضف 5</button>
<input @input="search($event.target.value)">
<form @submit.prevent={save}>
<input @keyup.enter={send}>
```

المعدِّلات: `.prevent` و`.stop` و`.self` و`.once` و`.capture` و`.passive`. المفاتيح: `.enter` و`.esc` و`.space` و`.tab` و`.up` و`.down` و`.ctrl` و`.shift` و`.alt` و`.meta` و`.exact`.

### التوجيهات (Directives)

| التوجيه | ماذا يفعل |
|---|---|
| `k-if` / `k-elif` / `k-else` | يضيف العنصر أو يزيله. |
| `k-each="item in list"` + `k-key="item.id"` | يكرر العنصر. أيضًا `(item, i) in list` و`(value, key) in object` و`n in 10`. |
| `k-model="name"` | ربط ثنائي الاتجاه لـ input وtextarea وselect وcheckbox وradio. المعدِّلات: `.trim` `.number` `.lazy`. |
| `k-show` | يخفي بـ CSS بدل أن يزيل. |
| `k-text` / `k-html` | يضبط نصًا أو HTML. `k-html` يُنظَّف من السكربتات لكن اربط HTML تثق به فقط. |
| `k-ref="box"` | يعطيك العنصر: `state box = null` يستقبله. |
| `k-skip` | يترك العنصر كما هو (لعينات الشيفرة التي فيها `{ }`). |
| `k-once` | يرسم العنصر مرة واحدة ولا يحدّثه. |
| `k-memo="[a, b]"` | يحدّث العنصر فقط إذا تغيّرت `a` أو `b`. |
| `k-animate="fade"` | يحرّك العنصر عند مجيئه وذهابه. |
| `<template k-if>` / `<template k-each>` | يجمّع عناصر دون غلاف. |
| `<kreft-component :is="name">` | يعرض مكوّنًا يُختار أثناء التشغيل. |
| `<kreft-portal to="body">` | يرسم المحتوى في مكان آخر (نوافذ منبثقة، تنبيهات). |

### الحلقات

```html
<ul>
  {for user in users key user.id}
    <li>{user.name}</li>
  {empty}
    <li>لا يوجد مستخدمون بعد</li>
  {/for}
</ul>
```

- `key user.id` اختياري؛ يمكّن Kreft من الاحتفاظ بالصفوف الصحيحة ونقلها.
- `{empty}` اختياري ويظهر عند فراغ القائمة.
- `{for (user, i) in users}` يعطي الفهرس، و`{for (value, key) in object}` يمر على كائن، و`{for n in 5}` يعدّ من 1 إلى 5.
- `k-each` على عنصر يفعل الشيء نفسه: `<li k-each="user in users" k-key="user.id">`.

### الحركات (Animations)

```html
<p k-if="open" k-animate="fade">مرحبًا</p>
<div k-show="menu" k-animate="slide">…</div>

<ul>
  {for item in items key item.id animate slide}
    <li>{item.name}</li>
  {/for}
</ul>
```

الجاهز: `fade` و`slide` و`scale` و`pop`. وحركتك الخاصة هي CSS بهذه الفئات (استبدل `name`):

| الفئة | متى |
|---|---|
| `name-in` | طوال وقت الدخول (ضع `transition` هنا). |
| `name-in-from` | اللحظة الأولى: من أين يأتي. |
| `name-out` | طوال وقت الخروج. |
| `name-out-to` | إلى أين يذهب. |
| `name-move` | عنصر قائمة ينتقل إلى مكانه الجديد. |

```css
.drop-in, .drop-out { transition: all .3s ease }
.drop-in-from { opacity: 0; transform: translateY(-30px) }
.drop-out-to  { opacity: 0; transform: translateX(60px) }
```

- ينتظر Kreft أطول `transition` أو `animation` قبل أن يزيل العنصر.
- `k-animate.after` يدع العنصر القديم يخرج قبل أن يدخل الجديد.
- لا شيء يتحرك عند فتح الصفحة أول مرة؛ أضف `.first` ليتحرك حينها أيضًا.

### صفحات أسرع

Kreft يغيّر أصلًا النص أو الخاصية التي تغيّرت فقط. للصفحات الكبيرة جدًا:

```html
<footer k-once>فُتحت في {openedAt}</footer>

{for row in rows key row.id}
  <tr k-memo="[row.id === selected]" class={row.id === selected ? 'on' : ''}>…</tr>
{/for}
```

مع `k-memo`، اختيار صف آخر يعيد رسم صفين فقط لا كل الصفوف.

### توجيهاتك الخاصة

```js
const app = Kreftjs.app('App.kreft')

app.directive('focus', {
  ready(el, binding) { el.focus() },
  update(el, binding) {},
  destroy(el, binding) {},
})

app.mount('#app')
```

```html
<input k-focus>
<div k-tooltip:top={message}></div>   <!-- binding.arg = 'top', binding.value = message -->
```

## استخدام Kreft من JavaScript

يمكنك كتابة المكوّنات ككائنات عادية. القواعد نفسها: القيم حالة، والـ getters قيم مشتقة، والدوال أفعال.

```js
Kreftjs.app({
  count: 0,
  get double() { return this.count * 2 },
  add() { this.count++ },
  template: `<button @click={add}>{count} × 2 = {double}</button>`,
}).mount('#app')
```

| JavaScript | يقابل في `.kreft` |
|---|---|
| `Kreftjs.state({ … })` | `state` + `derive` + `action` معًا، للشيفرة خارج المكوّنات. |
| `Kreftjs.signal(0)` | قيمة واحدة تُقرأ وتُكتب بـ `.value`. |
| `Kreftjs.derived(() => …)` | `derive` |
| `Kreftjs.watch(source, (value, old) => …)` | `watch` |
| `Kreftjs.effect(() => …)` | يعمل مجددًا كلما تغيّر ما يقرؤه. |
| `Kreftjs.tick()` | ينتظر حتى تتحدث الصفحة. |

```js
const price = Kreftjs.signal(10)
const qty = Kreftjs.signal(2)
const total = Kreftjs.derived(() => price.value * qty.value)

console.log(total.value)   // 20
qty.value = 3
console.log(total.value)   // 30
```

وهناك `Kreftjs.render(view, data)` يحوّل قالبًا وبيانات إلى نص HTML، مع عمل كل التوجيهات وتهريب كل القيمة. استعمله لرسائل البريد ونسخ الطباعة.

## تمارين

1. اكتب عدّادًا مع زري زيادة ونقصان، وقيمة مشتقة `double`، و`watch` يطبع القيمة عند تغيّرها.
2. اكتب قائمة مهام تحفظ نفسها عند إعادة التحميل (تلميح: `saved` بدل `state`).
3. اكتب مكوّن بحث يرشّح قائمة أسماء وهو تكتب، باستعمال `derive` و`k-model`.
