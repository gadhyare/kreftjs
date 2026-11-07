# الفصل السابع عشر (خبير): مكوّن مركّب — قائمة اختيار ذكية (Combobox)

المكوّنات البسيطة تأخذ `props` وتعرض HTML. المكوّنات **المركّبة** تحزم عدة قطع تتعاون معًا: زناد وفتحة منبثقة وحقل بحث وقائمة خيارات ولوحة مفاتيح. هنا نبني `Combobox` كاملًا قابلًا لإعادة الاستخدام: يختار من قائمة، يبحث، يتنقّل بالأسهم، يغلق بـ Esc أو بالنقر خارجه، ويعمل بـ `k-model`.

**جرِّب هذه الشيفرة في المتصفح** كما هي.

## 1) المكوّن

```html
<!-- components/Combobox.kreft -->
prop modelValue = null        // القيمة المختارة (id)
prop options = []             // [{ id, label }, …]
prop placeholder = 'اختر…'
prop searchable = false
event update:modelValue

state open = false
state query = ''
state active = 0              // فهرس الخيار المظلَّل
state trigger = null          // يملؤه k-ref
state rect = { top: 0, left: 0, width: 0 }

derive selected = options.find((o) => o.id === modelValue) || null
derive filtered = !searchable || !query ? options : options.filter((o) => o.label.includes(query))
derive shown = filtered.slice(0, 50)      // لا نرسم أكثر من 50

action toggle() {
  if (!open && trigger) {
    const r = trigger.getBoundingClientRect()
    rect = { top: r.bottom, left: r.left, width: r.width }
  }
  open = !open
  active = 0
}

action pick(o) {
  send('update:modelValue', o.id)
  open = false
  query = ''
}

action onKey(e) {
  if (e.key === 'Escape') { open = false; return }
  if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { toggle(); return }
  if (!open) return
  if (e.key === 'ArrowDown') active = Math.min(active + 1, shown.length - 1)
  else if (e.key === 'ArrowUp') active = Math.max(active - 1, 0)
  else if (e.key === 'Enter') { if (shown[active]) pick(shown[active]) }
}

<view>
  <div class="combobox" tabindex="0" @keydown="onKey($event)" k-click-outside={() => open = false}>
    <button type="button" class="combobox__trigger" k-ref="trigger" @click="toggle" aria-haspopup="listbox">
      <span>{selected ? selected.label : placeholder}</span> <span>▾</span>
    </button>

    <kreft-portal to="body">
      <div k-if="open" class="combobox__menu" role="listbox" k-animate="scale"
           style="position:fixed; top:{rect.top}px; left:{rect.left}px; width:{rect.width}px">
        <input k-if="searchable" class="combobox__search" k-model="query" placeholder="ابحث…">
        <ul>
          {for (o, i) in shown key o.id}
            <li role="option" class={i === active ? 'active' : ''}
                @mouseenter="active = i" @click="pick(o)">
              <slot name="option" option={o}>{o.label}</slot>
            </li>
          {empty}
            <li class="combobox__empty">لا نتائج</li>
          {/for}
        </ul>
      </div>
    </kreft-portal>
  </div>
</view>

<style scoped>
.combobox { position: relative; }
.combobox__trigger { width: 100%; display: flex; justify-content: space-between; gap: 8px; }
.combobox__menu { background: var(--background, #fff); color: var(--foreground, #111);
  border: 1px solid var(--border, #ddd); max-height: 240px; overflow-y: auto; z-index: 200; }
.combobox__search { width: 100%; border: 0; border-block-end: 1px solid var(--border, #ddd); padding: 8px; }
.combobox__menu ul { list-style: none; margin: 0; padding: 4px; }
.combobox__menu li { padding: 6px 8px; cursor: pointer; border-radius: 4px; }
.combobox__menu li.active { background: var(--accent, #8883); }
.combobox__empty { padding: 8px; opacity: .6; }
</style>
```

النقاط المهمة:

- **`k-model` على مكوّن** (كما في الفصل الثالث): المكوّن يملك `prop modelValue` ويرسل `update:modelValue`، فيكتب الأب `<combobox k-model="city">`.
- **`k-click-outside`** توجيه مخصص من الفصل الثالث عشر يغلق القائمة عند النقر خارجها.
- **`kreft-portal`** يرسم القائمة في `<body>` فلا يقتطعها `overflow` لآب؛ ولذلك نحسب موضعها يدويًا من `trigger.getBoundingClientRect()`.
- **فتحة `option` بمعاملات**: من يستعمل المكوّن يقرر شكل كل خيار.
- **`shown = filtered.slice(0, 50)`**: حد أقصى للرسم مهما كثرت النتائج (تكمّله البحث).
- **`k-animate="scale"`** لحركة دخول وخروج خفيفة.

## 2) الاستعمال

```html
<!-- pages/City.kreft -->
import Combobox from '../components/Combobox.kreft'

state cities = [
  { id: 'mo', label: 'مقديشو' },
  { id: 'hr', label: 'هرجيسا' },
  { id: 'bos', label: 'بوصاصو' },
  { id: 'ki', label: 'كيسمايو' },
]

state city = null

<view>
  <p>المدينة المختارة: {cities.find((c) => c.id === city)?.label || '—'}</p>
  <combobox k-model="city" options={cities} searchable placeholder="اختر مدينة">
    <template k-slot:option="{ option }">
      <b>{option.label}</b> <small style="opacity:.6">{option.id.toUpperCase()}</small>
    </template>
  </combobox>
</view>
```

## 3) خيارات تُحمَّل من الخادم (غير متزامن)

لن تفيدك القائمة الثابتة في تطبيق حقيقي. حوّل البحث إلى طلب خادم بتأخير بسيط، كما فعلنا في بحث المدونة:

```html
<!-- components/AsyncCombobox.kreft -->
prop modelValue = null
event update:modelValue

state open = false
state text = ''
state query = ''          // ما نبحث به فعلًا (بعد التأخير)

let timer
watch text {
  clearTimeout(timer)
  timer = setTimeout(() => { query = value }, 300)
}
on destroy { clearTimeout(timer) }

// يعيد الجلب وحده كلما تغيّر query
load results = api.get('/api/cities', { query: { q: query || undefined } })

action pick(c) { send('update:modelValue', c.id); open = false; text = c.label }

<view>
  <input k-model="text" @focus="open = true" placeholder="ابحث عن مدينة…"
         k-click-outside={() => open = false}>
  <div k-if="open" class="menu">
    <p k-if="results.loading">جارٍ البحث…</p>
    {for c in results.data || [] key c.id}
      <button @click="pick(c)">{c.label}</button>
    {empty}
      <p>لا نتائج لـ "{query}".</p>
    {/for}
  </div>
</view>
```

- **`text` و`query`**: نفصل ما يكتبه المستخدم عمّا نطلبه، فيتجمع الإدخال السريع في طلب واحد.
- **`load results`** يقرأ `query` فيجلب من جديد عند تغيّرها، ويعطيك `loading` و`error` و`reload()`.

## تمارين

1. أضف إلى `Combobox` خاصية `prop clearable` مع زر ✕ يفرغ الاختيار.
2. اجعل القائمة تفتح للأعلى إذا لم يتسع أسفلها (قارن `rect.top` بارتفاع النافذة).
3. حوّل `AsyncCombobox` ليدعم اختيارًا متعددًا: `modelValue` مصفوفة و`pick` يبدّل العنصر بدل اختياره وحيدًا.
