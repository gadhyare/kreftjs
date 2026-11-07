# الفصل الثامن عشر (خبير): مزامنة بين التبويبات والعمل دون اتصال

Kreft يحفظ الحالة المشتركة بين التبويبات **تلقائيًا** (راجع `saved` في الفصل الثالث): غيّر قيمة في تبويب فتراها في الآخر. هنا نبني فوق ذلك طبقتين احترافيتين:

1. **حضور (Presence):** من المفتوح الآن؟ رسائل حيّة بين التبويبات عبر `BroadcastChannel`.
2. **طابور دون اتصال (Offline queue):** الأوامر تُحفظ وتُرسل عند عودة الاتصال، دون أن يفقد المستخدم ما كتبه.

**الشيفرة جُرِّبت** بفتح تبويبين وحجب الشبكة.

## 1) المنطق المشترك: الحضور بين التبويبات

```js
// logic/tabs.js — من مفتوح الآن في "الغرفة"؟
export function usePresence(room = 'default') {
  const channel = new BroadcastChannel('kreft-' + room)
  const me = Math.random().toString(36).slice(2, 8)
  const s = Kreftjs.state({ peers: [] })

  const ping = () => channel.postMessage({ type: 'ping', id: me, at: Date.now() })

  channel.onmessage = (e) => {
    if (e.data.id === me) return                     // رسالتنا نحن
    if (e.data.type === 'ping') {
      s.peers = [...s.peers.filter((p) => p.id !== e.data.id), { id: e.data.id, at: e.data.at }]
    } else if (e.data.type === 'bye') {
      s.peers = s.peers.filter((p) => p.id !== e.data.id)
    }
  }

  ping()
  const timer = setInterval(() => {
    ping()
    s.peers = s.peers.filter((p) => Date.now() - p.at < 6000)   // نسقط الصامت منذ 6 ثوانٍ
  }, 3000)

  window.addEventListener('beforeunload', () => channel.postMessage({ type: 'bye', id: me }))
  Kreftjs.onDestroy(() => {
    clearInterval(timer)
    channel.postMessage({ type: 'bye', id: me })
    channel.close()
  })

  return {
    get peers() { return s.peers },
    get count() { return s.peers.length },
  }
}
```

- كل تبويب يبثّ `ping` كل 3 ثوانٍ، والآخرون يجدّدون وجوده.
- التبويب الصامت (أُغلق أو جُمّد) يختفي بعد 6 ثوانٍ.
- `Kreftjs.onDestroy` ينظّف المؤقت والقناة حين يزول المكوّن — وكما في الفصل الثالث، المستمع المضاف في `on ready`/`on start` يُنظَّف وحده، أما هنا ننظّف يدويًا لأننا في ملف `.js`.

## 2) المنطق المشترك: طابور دون اتصال

```js
// logic/offline.js — الأمر يُحفظ ويُرسل عند عودة الاتصال
export function useOfflineQueue() {
  const s = Kreftjs.state({
    online: navigator.onLine,
    pending: Kreftjs.storage.get('offline-queue') || [],
  })

  async function flush() {
    const list = s.pending
    if (!list.length) return
    const done = []
    for (const item of list) {
      try {
        await api.post(item.url, item.body)
        done.push(item)
      } catch (e) {
        break                       // ما زلنا دون اتصال: توقف وأبقِ الباقي
      }
    }
    s.pending = list.filter((x) => !done.includes(x))
    Kreftjs.storage.set('offline-queue', s.pending)
  }

  function enqueue(url, body) {
    s.pending = [...s.pending, { url, body }]
    Kreftjs.storage.set('offline-queue', s.pending)
    if (s.online) flush()
  }

  window.addEventListener('online', () => { s.online = true; flush() })
  window.addEventListener('offline', () => { s.online = false })

  return {
    get online() { return s.online },
    get pending() { return s.pending },
    enqueue, flush,
  }
}
```

- الطابور محفوظ في `Kreftjs.storage`، فينجو من إغلاق التبويب والجهاز.
- `flush` يرسل بالترتيب ويتوقف عند أول فشل (لا يرسل ما بعده خارج الترتيب).
- لا نرسل في كل مرة مباشرة: الأوامر تتكدس ثم تُغسل دفعة عند عودة الشبكة.

## 3) تطبيق ملاحظات يجمع الاثنين

```html
<!-- pages/Sync.kreft -->
import { usePresence } from '../logic/tabs.js'
import { useOfflineQueue } from '../logic/offline.js'

use presence = usePresence('notes')
use queue = useOfflineQueue()

// saved يتزامن بين التبويبات وحده (الفصل الثالث)
saved notes = []
saved draft = ''

action add() {
  if (!draft.trim()) return
  const text = draft
  notes = [{ id: Date.now(), text }, ...notes]
  draft = ''
  queue.enqueue('/api/notes', { text })
}

<view>
  <h1>مزامنة حيّة</h1>

  <p>
    التبويبات المفتوحة الآن: <b>{presence.count}</b>
    <span k-if="!queue.online" class="offline">· دون اتصال، ستُرسل لاحقًا</span>
  </p>

  <div class="row">
    <input k-model="draft" @keydown.enter="add()" placeholder="اكتب ملاحظة…">
    <button @click="add">أضف</button>
  </div>

  {for n in notes key n.id}
    <p class="note">{n.text}</p>
  {empty}
    <p>لا ملاحظات بعد.</p>
  {/for}

  <p k-if="queue.pending.length" class="pending">في الانتظار: {queue.pending.length} عنصر</p>
</view>

<style scoped>
.row { display: flex; gap: 8px; }
.offline { color: var(--danger, #b33); }
.pending { opacity: .7; }
</style>
```

## 4) ما لاحظناه أثناء الاختبار

- فتحنا التبويب نفسه مرتين: إضافة ملاحظة في الأول ظهرت في الثاني **فورًا** (بفضل `saved`).
- عدّاد "التبويبات المفتوحة" أصبح 1 ثم عاد 0 عند إغلاق التبويب الثاني (بعد 6 ثوانٍ كحد أقصى).
- بحجب الشبكة (DevTools › Network › Offline) ثم الإضافة: ظهرت الملاحظة محليًا وعداد "في الانتظار" = 1، وعند إعادة الاتصال أُرسل الطلب واختفى العداد.

## تنبيهات

- `BroadcastChannel` يعمل بين تبويبات **نفس الموقع** فقط، ولا يعمل بين متصفحين مختلفين.
- مزامنة `saved` بين التبويبات تقوم على حدث `storage` القياسي، فلا تغيّر القيمة المفتاحية (`as '…'`) إلا بقصد.
- الطابور هنا يحفظ الطلبات بلا مصادقة إضافية: في تطبيق حقيقي أضف رمز المستخدم ورتّب الأوامر، وفكّر في تعارض "آخر من يكتب يفوز".

## تمارين

1. أضف إلى `usePresence` اسم المستخدم ليعرض "سارة تعدّل الآن" بدل معرّف عشوائي.
2. اجعل الطابور يرسل أيضًا الأوامر المحذوفة (`DELETE`) بترتيبها مع الإنشاء.
3. أضف مؤشر "قيد المزامنة" دوّارًا يظهر أثناء `flush` وزر "أعد المحاولة الآن".
