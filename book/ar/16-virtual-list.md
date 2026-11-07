# الفصل السادس عشر (خبير): قوائم ضخمة بلا تباطؤ — النافذة الافتراضية

عرض 1,000 صف سهل. عرض 100,000 صف في جدول واحد يغرق المتصفح: بناء عشرات آلاف العقد في الـ DOM يكلف وقتًا وذاكرة. الحل الذي تستعمله كل الجداول الاحترافية هو **النافذة الافتراضية (Virtualization)**: نرسم الصفوف المرئية فقط، وعند التمرير نستبدل الصفوف التي خرجت من الشاشة.

سنبني هنا مكوّن `VirtualList` عامًا يتحمل أي عدد من العناصر ويبقى التمرير سلسًا. **كل الشيفرة جرِّبت في متصفح** مع 100,000 عنصر.

## 1) الفكرة

بدل أن نرسم القائمة كلها:

1. نعرف ارتفاع الصف الواحد `itemHeight` (يجب أن يكون ثابتًا).
2. من موضع التمرير `scrollTop` وارتفاع الحاوية نعرف **أي نطاق من العناصر ظاهر**.
3. نرسم ذلك النطاق فقط، فوق نطاق صغير إضافي (`overscan`) كي لا يظهر فراغ عند التمرير السريع.
4. نضبط ارتفاع "العمود الفارغ" على `items.length * itemHeight` ليبقى شريط التمرير صادقًا، ونزيح النافذة المرئية بـ `translateY`.

## 2) المكوّن

```html
<!-- components/VirtualList.kreft -->
prop items = []            // كل العناصر (قد تكون ملايين)
prop itemHeight = 48       // ارتفاع الصف الواحد بالبكسل
prop overscan = 6          // صفوف إضافية فوق وتحت النافذة المرئية

state viewport = null      // يملؤه k-ref
state scrollTop = 0
state viewH = 0

// ارتفاع العمود الكامل (شريط التمرير يعتمد عليه)
derive total = items.length * itemHeight

// النطاق المرئي + هامش الأمان
derive start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
derive end = Math.min(items.length, Math.ceil((scrollTop + viewH) / itemHeight) + overscan)
derive visible = items.slice(start, end)
derive offset = start * itemHeight

action onScroll() {
  scrollTop = viewport.scrollTop
  viewH = viewport.clientHeight
}

// نراقب حجم الحاوية (نافذة صغرت أو كبرت) وننظف حين يزول المكوّن
let ro
on ready {
  viewH = viewport.clientHeight
  ro = new ResizeObserver(() => { viewH = viewport.clientHeight })
  ro.observe(viewport)
}
on destroy { ro && ro.disconnect() }

<view>
  <div class="vlist" k-ref="viewport" @scroll="onScroll">
    <div class="vlist__sizer" style="height: {total}px">
      <div class="vlist__window" style="transform: translateY({offset}px)">
        {for (item, i) in visible key item.id}
          <div class="vlist__row" style="height: {itemHeight}px">
            <slot item={item} index={start + i}>{item}</slot>
          </div>
        {/for}
      </div>
    </div>
  </div>
</view>

<style scoped>
.vlist { overflow-y: auto; height: 400px; border: 1px solid var(--border, #ddd); }
.vlist__sizer { position: relative; }
.vlist__window { position: absolute; inset-block-start: 0; inset-inline: 0; }
.vlist__row { box-sizing: border-box; }
</style>
```

لماذا يعمل هذا؟

- **`derive visible`** يُعاد حسابه وحده كلما تغيّر `scrollTop` أو `viewH` أو `items`، فيرسم Kreft الصفوف الجديدة ويزيل الخارجة (وهو يعرف كيف يطابقها بمفتاح `key item.id`).
- **`translateY`** على نافذة الصفوف أرخص من `padding-top` كبير: لا نعيد حساب التخطيط.
- **`k-ref`** يضع عنصر التمرير في `state viewport`، فنقرؤه في `onScroll` بلا بحث في الـ DOM كل مرة.
- **`ResizeObserver`** يلتقط تغيّر حجم الحاوية، و`on destroy` يقطع المراقبة.

## 3) الاستعمال: 100,000 صف

```html
<!-- pages/BigTable.kreft -->
import VirtualList from '../components/VirtualList.kreft'

state rows = Array.from({ length: 100000 }, (_, i) => ({
  id: i + 1,
  name: 'الاسم ' + (i + 1),
  price: (i % 100) + 1,
}))

<view>
  <h1>100,000 صف، ورسم فوري</h1>
  <virtual-list items={rows} itemHeight={44}>
    <template k-slot="{ item, index }">
      <div style="display:flex; gap:12px; align-items:center; height:100%; padding-inline:12px">
        <b>{index + 1}</b>
        <span>{item.name}</span>
        <span style="margin-inline-start:auto">{item.price} $</span>
      </div>
    </template>
  </virtual-list>
</view>
```

- الفتحة الافتراضية هنا **بمعاملات**: `k-slot="{ item, index }"` يفكّك ما مرّره `<slot item={item} index={start + i}>`.
- `index` هو الرقم الحقيقي في القائمة (لأننا أضفنا `start`) لا رقم الصف المرسوم.

## 4) لمسات أداء تكميلية

النافذة الافتراضية وحدها تكفي غالبًا. هذه أدوات إضافية للصفوف الثقيلة:

| الأداة | متى تستعملها | مثال |
|---|---|---|
| `k-once` | صف/خلية لا تتغير أبدًا بعد أول رسم | `<td k-once>{row.id}</td>` |
| `k-memo` | خلية تعتمد على قيمتين فقط | `<tr k-memo="[row.id === selected]">` |
| `key item.id` | دائمًا مع الحلقات | `{for item in visible key item.id}` |
| `derive` للقيم الغالية | احسب مرة لا في كل خلية | `derive priceLabel = (p) => p.toFixed(2) + ' $'` |
| سكربت عادي لما لا تحتاجه الصفحة | ثوابت ودوال مساعدة | `const clamp = (n, a, b) => …` |

تذكّر فخ الفصل الثالث عشر: ما تكتبه بـ `const`/`let` لا تراه الصفحة. كل ما يظهر في `view` يجب أن يكون `state` أو `derive` أو `action` أو `prop`.

## 5) القياس

جرّب الفرق بنفسك: اعرض 100,000 عنصر بدون النافذة الافتراضية (حلقة عادية) ثم معها، وراقب زمن أول رسم وذاكرة التبويب في أدوات المطوّر. في تجربتنا كانت الحلقة العادية تُرسم في مئات المللي ثانية وتشبع الذاكرة، بينما النافذة الافتراضية تُبقي في الـ DOM نحو 30 صفًا فقط مهما كان حجم القائمة.

## تمارين

1. أضف `prop itemKey` ليستعمل المفتاح `item[itemKey]` بدل `item.id` دائمًا.
2. اجعل `itemHeight` متغيّرًا: صفوف بارتفاعات مختلفة تُجمَع في "أقسام" (Variable size virtualization).
3. أضف تمريرًا إلى عنصر معيّن: دالة `scrollToIndex(i)` تضبط `viewport.scrollTop = i * itemHeight`.
