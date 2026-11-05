# الفصل الثالث عشر (متقدم): واجهات متقدمة ومكتبة مكوّنات

هنا نبني مكتبة صغيرة قابلة لإعادة الاستخدام: نافذة منبثقة، وجدول عام، وتوجيهات خاصة، ومنطق مشترك (تراجع/إعادة، استطلاع حي، تحديث متفائل). **جرّبنا هذه الأمثلة في المتصفح** عدا ما نذكره صراحة.

## 1) توجيهان خاصان: النقر خارج العنصر والتركيز التلقائي

التوجيهات تُسجَّل على التطبيق قبل `mount`:

```js
const app = Kreftjs.app('App.kreft')
  .component('Field', 'components/Field.kreft')
  .use(router)

// k-click-outside={close}: يستدعي الدالة عند النقر خارج العنصر
app.directive('click-outside', {
  ready(el, binding) {
    el.__out = (e) => { if (!el.contains(e.target)) binding.value && binding.value(e) }
    document.addEventListener('pointerdown', el.__out)
  },
  update(el, binding) {},
  destroy(el) { document.removeEventListener('pointerdown', el.__out) },
})

// k-autofocus: يركّز الحقل عند ظهوره
app.directive('autofocus', { ready(el) { el.focus() } })

app.mount('#app')
```

- `ready` عند ظهور العنصر، و`destroy` عند زواله: نظّف المستمعات هنا دائمًا.
- `binding.value` هو القيمة بعد `=`، و`binding.arg` ما بعد `:` (`k-tooltip:top`).

## 2) نافذة منبثقة (Modal) بـ kreft-portal

```html
<!-- components/Modal.kreft -->
prop open = false
prop title = ''
event close

action esc(e) { if (e.key === 'Escape' && open) send('close') }
on ready { window.addEventListener('keydown', esc) }
on destroy { window.removeEventListener('keydown', esc) }

<view>
  <kreft-portal to="body">
    <div k-if="open" class="backdrop" k-animate="fade">
      <div class="dialog" role="dialog" aria-modal="true" k-click-outside={() => send('close')}>
        <header>
          <h3>{title}</h3>
          <button @click="send('close')" aria-label="إغلاق">✕</button>
        </header>
        <slot></slot>
        <footer><slot name="footer"></slot></footer>
      </div>
    </div>
  </kreft-portal>
</view>

<style>
.backdrop { position: fixed; inset: 0; background: #0006; display: grid; place-items: center; z-index: 100; }
.dialog { background: var(--background, #fff); color: var(--foreground, #111); padding: 20px; min-width: 300px; border: 1px solid var(--border, #ddd); }
.dialog header { display: flex; justify-content: space-between; align-items: center; }
.dialog footer { margin-block-start: 16px; display: flex; gap: 8px; justify-content: flex-end; }
</style>
```

لماذا `kreft-portal`؟ حتى لا تتأثر النافذة بـ `overflow` أو `z-index` للآباء؛ فهي تُرسم في `<body>` مباشرة. واستعملنا:

- **prop `open`** وحدث **`close`**: النافذة لا تغلق نفسها، بل تطلب من أبيها.
- **Esc والنقر خارجها** يرسلان `close`.
- **`k-animate="fade"`** لحركة الدخول والخروج.
- **فتحة `footer` مسمّاة** لأزرار الأب.

ووجدنا في الاختبار أن الإغلاق (✕ وEsc والنقر الخارجي) يعمل كما ينبغي. **تنبيه عن بيئة الاختبار:** متصفح اللوحة المدمج الذي اختبرنا به لا ينفّذ `requestAnimationFrame`، فتعلق حركة الخروج فيه وتبقى النافذة في الـ DOM. هذا ليس خللًا في الإطار؛ لكن إن رأيت ما يشبهه في متصفح غير مرئي أو في خلفية، فجرّب بدون `k-animate` للتأكد.

## 3) جدول عام: فرز وفتحات وأداء

```html
<!-- components/DataTable.kreft: جدول عام مع فرز وفتحات للخلايا -->
prop rows = []
prop columns = []          // [{ key: 'name', label: 'الاسم' }, …]
prop rowKey = 'id'
event select

state sortKey = ''
state dir = 1
state selected = null

derive sorted = !sortKey ? rows : [...rows].sort((a, b) => (a[sortKey] > b[sortKey] ? 1 : a[sortKey] < b[sortKey] ? -1 : 0) * dir)

action sortBy(key) {
  if (sortKey === key) dir = -dir
  else { sortKey = key; dir = 1 }
}
action pick(row) { selected = row[rowKey]; send('select', row) }

<view>
  <table>
    <thead>
      <tr>
        <th k-each="c in columns" k-key="c.key" @click="sortBy(c.key)" style="cursor:pointer">
          {c.label} <span k-if="sortKey === c.key">{dir === 1 ? '▲' : '▼'}</span>
        </th>
      </tr>
    </thead>
    <tbody>
      {for row in sorted key row[rowKey]}
        <tr k-memo="[row, selected === row[rowKey]]" class={selected === row[rowKey] ? 'on' : ''} @click="pick(row)">
          <td k-each="c in columns" k-key="c.key">
            <slot name="cell" row={row} column={c}>{row[c.key]}</slot>
          </td>
        </tr>
      {empty}
        <tr><td colspan={columns.length}><slot name="empty">لا بيانات</slot></td></tr>
      {/for}
    </tbody>
  </table>
</view>

<style scoped>
.on { background: #8881; }
th, td { text-align: start; padding: 6px 10px; border-block-end: 1px solid #8883; }
</style>
```

الأفكار:

- **`derive sorted`**: القيمة المرتبة تُحسب وحدها كلما تغيّر `rows` أو `sortKey` أو `dir`.
- **فتحة `cell` بمعاملات** (`row` و`column`): الأب يقرر كيف تُعرض أي خلية.
- **`k-memo="[row, selected === row[rowKey]]"`**: عند اختيار صف جديد يُعاد رسم صفين فقط، لا الجدول كله.
- **فتحة `empty`** عندما لا بيانات.

الاستعمال:

```html
state rows = [
  { id: 1, name: 'قهوة', price: 15 },
  { id: 2, name: 'تمر', price: 25 },
  { id: 3, name: 'عود', price: 99 },
]
state columns = [{ key: 'name', label: 'الاسم' }, { key: 'price', label: 'السعر' }]
state picked = null

<data-table rows={rows} columns={columns} @select="(r) => picked = r.name">
  <template k-slot:cell="{ row, column }">
    <b k-if="column.key === 'price'">{row.price} $</b>
    <span k-else>{row[column.key]}</span>
  </template>
</data-table>
```

> **فخ شاهدناه بأعيننا:** كتبنا في أول تجربة `const rows = [...]` بدل `state rows = [...]` فظهر الجدول فارغًا ("لا بيانات") **بلا أي خطأ**. السبب: السطر الذي لا يبدأ بكلمة مفتاحية JavaScript عادي لا تراه الصفحة. كل ما تحتاجه الصفحة يجب أن يكون `state` أو `derive` أو `action`.

نتائج اختبارنا: النقر على رأس "السعر" مرتين يعرض الصفوف تنازليًا (عود ثم تمر ثم قهوة)، والنقر على صف يضعه "المختار".

## 4) منطق مشترك: تراجع وإعادة

```js
// logic/undo.js: تراجع وإعادة لأي قيمة (يستعملها أي مكوّن)
export function useUndo(initial, limit = 50) {
  const s = Kreftjs.state({ value: initial, past: [], future: [] })

  function set(next) {
    s.past = [...s.past, JSON.stringify(s.value)].slice(-limit)
    s.value = next
    s.future = []
  }
  function undo() {
    if (!s.past.length) return
    s.future = [JSON.stringify(s.value), ...s.future]
    s.value = JSON.parse(s.past[s.past.length - 1])
    s.past = s.past.slice(0, -1)
  }
  function redo() {
    if (!s.future.length) return
    s.past = [...s.past, JSON.stringify(s.value)]
    s.value = JSON.parse(s.future[0])
    s.future = s.future.slice(1)
  }

  return {
    get value() { return s.value },
    get canUndo() { return s.past.length > 0 },
    get canRedo() { return s.future.length > 0 },
    set, undo, redo,
  }
}
```

يُستعمل في أي مكوّن بسطر واحد:

```html
import { useUndo } from '../logic/undo.js'
use history = useUndo({ title: 'عنوان', items: [] })

action rename(e) { history.set({ ...history.value, title: e.target.value }) }
action addItem() { history.set({ ...history.value, items: [...history.value.items, 'عنصر'] }) }

<input value={history.value.title} @input="rename($event)">
<button @click="addItem">أضف</button>
<button disabled={!history.canUndo} @click="history.undo()">تراجع</button>
<button disabled={!history.canRedo} @click="history.redo()">إعادة</button>
```

اختبرنا: إضافة عنصرين ثم تراجع (1 عنصر) ثم إعادة (2 عنصر).

لماذا `JSON.stringify` في `past`؟ لحفظ **لقطة** مستقلة؛ فتغييرات لاحقة على كائنات الحالة لا تلوّث التاريخ.

## 5) تحديث متفائل (Optimistic UI)

غيّر الواجهة فورًا لتبدو سريعة، ثم أكّد من الخادم، وتراجع إن فشل:

```js
// logic/optimistic.js: غيّر الواجهة فورًا، ثم أكّد من الخادم، وتراجع عند الفشل
export async function optimistic(apply, rollback, request) {
  apply()                          // الواجهة تتغير الآن
  try {
    return await request()         // ثم نسأل الخادم
  } catch (e) {
    rollback()                     // فشل: أعد القيمة
    throw e
  }
}
```

```html
state likes = 10
state note = ''

action like() {
  const old = likes
  try {
    await optimistic(
      () => { likes++ },                    // الآن
      () => { likes = old },                // عند الفشل
      () => api.post('/api/like')           // الطلب الفعلي
    )
  } catch (e) { note = e.message }
}

<button @click="like">♥ {likes}</button> <span class="error">{note}</span>
```

اختبرناه بطلب يفشل عمدًا: العدّاد ارتفع إلى 11 فورًا، ثم رجع إلى 10 وظهرت رسالة "فشل الخادم".

## 6) استطلاع حي (Polling) يحترم التبويب والتنظيف

```js
// logic/poll.js: يجلب كل بضع ثوانٍ، ويتوقف إن كانت الصفحة مخفية، وينظّف نفسه
export function usePoll(fetcher, every = 5000) {
  const s = Kreftjs.state({ data: null, error: null, loading: true, updated: null })
  let timer = null

  async function tick() {
    if (document.hidden) return                  // لا طلبات والتبويب غير مرئي
    try {
      s.data = await fetcher()
      s.error = null
      s.updated = new Date()
    } catch (e) {
      s.error = e                                // نُبقي آخر بيانات سليمة
    } finally {
      s.loading = false
    }
  }

  tick()
  timer = setInterval(tick, every)
  document.addEventListener('visibilitychange', tick)    // عند العودة للتبويب حدّث فورًا
  Kreftjs.onDestroy(() => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', tick)
  })

  return {
    get data() { return s.data },
    get error() { return s.error },
    get loading() { return s.loading },
    get updated() { return s.updated },
    refresh: tick,
  }
}
```

الاستعمال في لوحة أرقام:

```html
<!-- pages/Dashboard.kreft: لوحة أرقام حيّة -->
import { usePoll } from '../logic/poll.js'

use stats = usePoll(() => api.get('/api/stats'), 3000)

derive money = (cents) => ((cents || 0) / 100).toFixed(2) + ' $'
derive time = (d) => (d ? d.toLocaleTimeString('ar') : '—')

<view>
  <h1>لوحة المتجر</h1>

  <p k-if="stats.loading">جارٍ التحميل…</p>
  <p k-if="stats.error" class="error">انقطع الاتصال، نعرض آخر بيانات سليمة.</p>

  <div k-if="stats.data" class="cards">
    <div class="card"><h4>الطلبات</h4><b>{stats.data.orders}</b></div>
    <div class="card"><h4>الإيرادات</h4><b>{money(stats.data.revenue_cents)}</b></div>
    <div class="card"><h4>منتجات قاربت على النفاد</h4><b>{stats.data.low_stock}</b></div>
  </div>

  <p>آخر تحديث: {time(stats.updated)} <button @click="stats.refresh()">حدّث الآن</button></p>
</view>

<style scoped>
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
.card b { font-size: 28px; }
</style>
```

لماذا هذا التصميم جيد؟

- **`document.hidden`**: لا طلبات والتبويب مخفي.
- **`visibilitychange`**: عند العودة يُحدَّث فورًا.
- **أخطاء الشبكة** لا تمسح آخر بيانات سليمة؛ نعرض رسالة ونبقي الأرقام.
- **`Kreftjs.onDestroy`** ينظّف المؤقت والمستمع حين تُغادر الصفحة.

اختبرناه: ظهرت الأرقام الحية وتحدّثت (آخر تحديث بتوقيت جديد)، وزر "حدّث الآن" يعمل. وملاحظة: لم نستطع التأكد من توقف الطلبات بعد مغادرة الصفحة في بيئتنا بسبب تجمّد حركة الانتقال فيها؛ فاختبر ذلك في متصفحك بفتح تبويب الشبكة.

واجهته الخلفية (متحكم صغير بذاكرة مؤقتة 5 ثوانٍ):

```js
const { Cache } = require('kreftjs/server')
const Order = require('../../Models/Order')
const Product = require('../../Models/Product')

class StatsController {
  // يُحسب مرة كل 5 ثوانٍ مهما كثر الزوار
  async index() {
    return Cache.remember('stats', 5, async () => ({
      orders: await Order.query().count(),
      revenue_cents: await Order.query().sum('total_cents'),
      low_stock: await Product.where('stock', '<', 5).count(),
      at: new Date().toISOString(),
    }))
  }
}

module.exports = StatsController
```

مهما كثر الزوار، تُحسب الأرقام مرة كل 5 ثوانٍ: رأينا أن طلبين متتاليين أعادا الطابع الزمني `at` نفسه.

## 7) تبويبات تحتفظ بحالتها

```html
state tab = 'one'

<button @click="tab = 'one'">واحد</button>
<button @click="tab = 'two'">اثنان</button>
<kreft-component :is="tab === 'one' ? 'Counter' : 'Field'" keep></kreft-component>
```

مع `keep` تبقى حالة التبويب (نص مكتوب، عدّاد) عند الرجوع إليه، ويمكنك استعمال `on show` و`on hide` لإيقاف مؤقتات التبويب غير الظاهر.

## 8) تجميع كل ذلك في صفحة واحدة

```html
<!-- pages/Lab.kreft: مختبر المكوّنات المتقدمة -->
import Modal from '../components/Modal.kreft'
import DataTable from '../components/DataTable.kreft'
import { useUndo } from '../logic/undo.js'
import { optimistic } from '../logic/optimistic.js'

state open = false
state picked = null
state tab = 'one'
state likes = 10
state note = ''

use history = useUndo({ title: 'عنوان', items: [] })

state rows = [
  { id: 1, name: 'قهوة', price: 15 },
  { id: 2, name: 'تمر', price: 25 },
  { id: 3, name: 'عود', price: 99 },
]
state columns = [{ key: 'name', label: 'الاسم' }, { key: 'price', label: 'السعر' }]

action rename(e) { history.set({ ...history.value, title: e.target.value }) }
action addItem() { history.set({ ...history.value, items: [...history.value.items, 'عنصر ' + (history.value.items.length + 1)] }) }

action like() {
  const old = likes
  try {
    await optimistic(
      () => { likes++ },
      () => { likes = old },
      () => new Promise((ok, no) => setTimeout(() => (Math.random() < 0 ? ok() : no(new Error('فشل الخادم'))), 400))
    )
  } catch (e) { note = e.message }
}

<view>
  <h1>مختبر</h1>

  <h3>نافذة منبثقة</h3>
  <button @click="open = true">افتح</button>
  <modal open={open} title="مرحبًا" @close="open = false">
    <p>هذه نافذة في <code>body</code> عبر kreft-portal.</p>
    <template k-slot:footer><button @click="open = false">حسنًا</button></template>
  </modal>

  <h3>جدول مع فرز وفتحة</h3>
  <data-table rows={rows} columns={columns} @select="(r) => picked = r.name">
    <template k-slot:cell="{ row, column }">
      <b k-if="column.key === 'price'">{row.price} $</b>
      <span k-else>{row[column.key]}</span>
    </template>
  </data-table>
  <p>المختار: {picked || '—'}</p>

  <h3>تراجع وإعادة</h3>
  <input value={history.value.title} @input="rename($event)">
  <button @click="addItem">أضف عنصرًا</button>
  <button disabled={!history.canUndo} @click="history.undo()">تراجع</button>
  <button disabled={!history.canRedo} @click="history.redo()">إعادة</button>
  <p>{history.value.title} · {history.value.items.length} عناصر</p>

  <h3>تحديث متفائل</h3>
  <button @click="like">♥ {likes}</button> <span class="error">{note}</span>

  <h3>تبويبات تحتفظ بحالتها</h3>
  <button @click="tab = 'one'">واحد</button> <button @click="tab = 'two'">اثنان</button>
  <kreft-component :is="tab === 'one' ? 'Counter' : 'Field'" keep></kreft-component>
</view>
```

## تمارين

1. أضف توجيهًا `k-tooltip:top={message}` يعرض تلميحًا عند المرور.
2. وسّع `DataTable` بترقيم صفحات داخلي (`pageSize`) وبحث نصي.
3. اجعل `useUndo` يدعم اختصارات لوحة المفاتيح Ctrl+Z وCtrl+Shift+Z وينظّف المستمع بـ `onDestroy`.
