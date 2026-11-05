# الفصل الثالث: المكوّنات ومشاركة الحالة

## استخدام مكوّن

سجّله مرة واحدة بمساره، أو استورده حيث تحتاجه:

```js
Kreftjs.app('App.kreft')
  .component('UserCard', 'components/UserCard.kreft')
  .mount('#app')
```

```html
import UserCard from './UserCard.kreft'

<view>
  <user-card name="سارة أحمد" age={30}></user-card>
</view>
```

في الصفحة (`view`) اكتب أسماء المكوّنات بنمط **kebab-case** (`<user-card>`).

## Props: من الأب إلى الابن

```html
<!-- UserCard.kreft -->
prop name
prop age = 0
prop admin = false

<view>
  <div class="card">{name} ({age}) <b k-if="admin">مدير</b></div>
</view>
```

```html
<user-card name="سارة أحمد" age={30} admin></user-card>
```

نوع القيمة الافتراضية يحدد كيف تُقرأ الخصائص النصية: `age="30"` تصير الرقم `30`، و`admin` بلا قيمة تصير `true`. الابن لا يستطيع تغيير prop؛ أرسل حدثًا بدلًا من ذلك.

## الأحداث: من الابن إلى الأب

```html
<!-- TodoItem.kreft -->
prop todo
event remove

<view>
  <li>{todo.text} <button @click="send('remove', todo.id)">✕</button></li>
</view>
```

```html
<!-- الأب -->
action removeTodo(id) { todos = todos.filter((t) => t.id !== id) }

<view>
  <todo-item k-each="t in todos" k-key="t.id" todo={t} @remove={removeTodo}></todo-item>
</view>
```

## k-model على مكوّن

```html
<!-- Toggle.kreft -->
prop modelValue = false
event update:modelValue

<view>
  <button @click="send('update:modelValue', !modelValue)">{modelValue ? 'مفعّل' : 'معطّل'}</button>
</view>
```

```html
<toggle k-model="darkMode"></toggle>
```

النماذج المسمّاة: `k-model:title="pageTitle"` يستعمل `prop title` والحدث `update:title`.

## الفتحات (Slots)

```html
<!-- Card.kreft -->
prop items = []

<view>
  <div class="card">
    <header><slot name="header">عنوان افتراضي</slot></header>
    <slot></slot>
    <li k-each="item in items"><slot name="item" item={item}>{item}</slot></li>
  </div>
</view>
```

```html
<card items={users}>
  <template k-slot:header>المستخدمون</template>
  <p>محتوى الجسم</p>
  <template k-slot:item="{ item }"><b>{item.name}</b></template>
</card>
```

## الأنماط (Styles)

- `<style>` يسري على الصفحة كلها.
- `<style scoped>` يسري على هذا المكوّن فقط.
- `.parent :deep(.child)` يصل إلى المكوّنات الأبناء من CSS محصور.
- الخصائص مثل `class` التي تضعها على وسم المكوّن تنتقل إلى عنصره الجذر.

## الاحتفاظ والانتظار (Keep و Wait)

**Keep** يضع المكوّن جانبًا بدل أن يزيله. النص المكتوب وموضع التمرير والحالة كلها تبقى حين يعود:

```html
<kreft-component :is="tab" keep></kreft-component>
<kreft-view keep></kreft-view>
<kreft-view keep="5"></kreft-view>   <!-- احتفظ بخمسة على الأكثر؛ الأقدم استعمالًا يذهب -->
```

```html
on show { timer.start() }   <!-- عاد (وكذلك أول مرة) -->
on hide { timer.stop() }    <!-- وُضع جانبًا -->
```

**Wait** يعرض بديلًا إلى أن يجهز كل ما بداخله (المكوّنات الكسولة، وكل `load`، وكل `on start` ينتظر):

```html
<kreft-wait>
  <user-profile id={5}></user-profile>
  <p k-waiting>جارٍ التحميل…</p>
  <p k-failed="error">تعذر التحميل: {error.message}</p>
</kreft-wait>
```

## مشاركة الحالة

| الحاجة | الأداة |
|---|---|
| من الأب إلى الابن | `prop` |
| من الابن إلى الأب | `event` + `send()` أو `k-model` |
| مكوّنات كثيرة في أي مكان | المخازن: `Kreftjs.store()` + `use` |
| أب إلى كل ما بداخله | `share` / `receive` |
| رسائل "حدث شيء ما" | `bus.send()` / `bus.on()` |

### المخازن (Stores)

أنشئ المخزن مرة واحدة:

```js
Kreftjs.store('cart', {
  items: [],
  get count() { return this.items.length },
  get total() { return this.items.reduce((s, p) => s + p.price, 0) },
  add(product) { this.items.push(product) },
})
```

استعمله في أي ملف `.kreft`. كل المكوّنات ترى البيانات نفسها:

```html
use cart

<view>
  <span>السلة: {cart.count} · {cart.total}</span>
  <button @click="cart.add(product)">أضف</button>
</view>
```

لكل مخزن أيضًا `$patch` (يغيّر عدة قيم دفعة واحدة) و`$reset()` (يعود للبداية) و`$watch(fn)` (يعمل عند كل تغيير ويتوقف وحده حين يزول المكوّن).

### المنطق المشترك

المنطق الذي تحتاجه مكوّنات كثيرة يوضع في ملف `.js` كدالة. يمكنه استعمال `Kreftjs.state` و`Kreftjs.watch` و`Kreftjs.onDestroy` وغيرها:

```js
// logic/mouse.js
export function trackMouse() {
  const pos = Kreftjs.state({ x: 0, y: 0 })
  const move = (e) => { pos.x = e.clientX; pos.y = e.clientY }
  window.addEventListener('pointermove', move)
  Kreftjs.onDestroy(() => window.removeEventListener('pointermove', move))
  return pos
}
```

```html
import { trackMouse } from '../logic/mouse.js'
use mouse = trackMouse()

<view><p>{mouse.x}, {mouse.y}</p></view>
```

### share و receive

```html
<!-- Layout.kreft -->
state settings = { theme: 'dark', lang: 'ar' }
share settings = settings

<!-- أي مكوّن بداخله مهما كان عمقه -->
receive settings

<view><p>السمة: {settings.theme}</p></view>
```

شارك كائن `state` فيتحدث كل المستقبِلين حين يتغير. و`Kreftjs.app(…).share('key', value)` يشارك مع التطبيق كله.

### ناقل الأحداث (Event bus)

```html
<!-- الإرسال -->
action save() { bus.send('toast', 'تم الحفظ!') }

<!-- الاستماع -->
state message = ''
on ready { bus.on('toast', (text) => (message = text)) }
```

المستمعون المضافون في `on start` أو `on ready` يُزالون تلقائيًا حين يزول المكوّن. والآخرون يبقون حتى تستدعي `bus.off('toast', fn)`.

## الحفظ في المتصفح: saved

اكتب `saved` بدل `state` فتُحفظ القيمة في localStorage، وتنجو من إعادة التحميل وإغلاق المتصفح.

```html
saved todos = []
saved theme = 'light'
saved token = '' as 'auth.token'    <!-- اختر مفتاح التخزين بنفسك -->
```

- كل تغيير يُحفظ وحده، حتى العميق منه: `todos.push(…)` و`todo.done = true`.
- المفتاح الافتراضي `<Component>.<name>`، مثل `Home.todos`. استعمل `as '…'` لتشارك قيمة واحدة بين مكوّنات.
- تغيير في تبويب آخر من الموقع نفسه يظهر في هذا التبويب أيضًا.

المخزن يحتفظ بقيمه البسيطة إذا أضفت `saved`:

```js
Kreftjs.store('cart', { items: [] }, { saved: true })            // أو { saved: ['items'] } لبعض الحقول
```

ومن JavaScript:

```js
const theme = Kreftjs.saved('theme', 'light')    // signal: theme.value = 'dark' تُحفظ
Kreftjs.storage.set('user', { name: 'سارة' })
Kreftjs.storage.get('user')
Kreftjs.storage.remove('user')
Kreftjs.storage.clear()                          // يزيل ما حفظه Kreft فقط
```

> **تحذير:** localStorage يخص متصفحًا واحدًا وموقعًا واحدًا، وسعته نحو 5 ميغابايت، ويقرؤه أي شخص يستعمل ذلك المتصفح وأي سكربت يعمل في صفحتك. لا تخزّن فيه كلمات مرور أو أسرارًا طويلة الأمد.

## تمارين

1. اصنع مكوّن `Rating` له `prop value` وحدث `update:value`، واستعمله بـ `k-model`.
2. اصنع مخزن `toast` وعرض رسائل من أي مكوّن، بدل الـ bus.
3. اصنع مكوّن `Modal` بفتحات `header` و`footer`، يظهر بـ `kreft-portal`.
