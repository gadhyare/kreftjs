# الفصل الثاني عشر (متقدم): متجر إلكتروني كامل

متجر فيه منتجات وسلة ودفع آمن. التركيز على ما يفرّق التطبيق الجاد عن التجريبي: **معاملة قاعدة بيانات** (الكل أو لا شيء)، و**مفتاح عدم التكرار** (idempotency)، و**أقفال** ضد النقر المزدوج، و**أحداث** و**بريد على الطابور**، و**ذاكرة مؤقتة** للقوائم. كل ما هنا جُرِّب فعلًا بطلبات حقيقية وبمتصفح.

## تصميم المال: أعداد صحيحة

لا تخزّن الأسعار كأعداد عشرية (`0.1 + 0.2 !== 0.3`). خزّنها **بالسنتات** (أعداد صحيحة)، واقسم على 100 عند العرض فقط.

## الخطوة 1: الجداول

```js
module.exports = {
  up(schema) {
    schema.create('products', (table) => {
      table.id()
      table.string('name', 120)
      table.integer('price_cents')            // المال بالسنتات: أعداد صحيحة لا كسور
      table.integer('stock').default(0)
      table.timestamps()
    })

    schema.create('orders', (table) => {
      table.id()
      table.string('email', 190)
      table.string('status', 20).default('pending')
      table.integer('total_cents').default(0)
      table.string('idempotency_key', 80).nullable().unique()
      table.timestamps()
    })

    schema.create('order_items', (table) => {
      table.id()
      table.foreignId('order_id').constrained().cascadeOnDelete()
      table.foreignId('product_id').constrained()
      table.integer('qty')
      table.integer('price_cents')
      table.timestamps()
    })
  },

  down(schema) {
    schema.dropIfExists('order_items')
    schema.dropIfExists('orders')
    schema.dropIfExists('products')
  },
}
```

- `idempotency_key` فريد و`nullable`: يمنع تكرار الطلب نفسه.
- `price_cents` في `order_items` **نسخة** من سعر المنتج وقت الشراء؛ فتغيّر السعر لاحقًا لا يغيّر الطلبات القديمة.

## الخطوة 2: النماذج

```js
const { Model } = require('kreftjs/server')

class Product extends Model {
  static fillable = ['name', 'price_cents', 'stock']

  static scopeInStock(q) { q.where('stock', '>', 0) }
}

module.exports = Product
```

```js
const { Model } = require('kreftjs/server')

class Order extends Model {
  static fillable = ['email', 'status', 'total_cents', 'idempotency_key']

  items() { return this.hasMany(require('./OrderItem')) }
}

module.exports = Order
```

```js
const { Model } = require('kreftjs/server')

class OrderItem extends Model {
  static fillable = ['order_id', 'product_id', 'qty', 'price_cents']

  product() { return this.belongsTo(require('./Product')) }
}

module.exports = OrderItem
```

## الخطوة 3: الحدث والمستمع والبريد

```js
class OrderPlaced {
  constructor(order) {
    this.order = order
  }
}

module.exports = OrderPlaced
```

```js
class LogOrder {
  static event = 'OrderPlaced'

  async handle(event) {
    console.log(`[order] #${event.order.id} total=${event.order.total_cents}`)
  }
}

module.exports = LogOrder
```

```js
const { Mailable } = require('kreftjs/server')

class OrderReceipt extends Mailable {
  constructor(order) {
    super()
    this.order = order
  }

  build() {
    return this.subject(`إيصال الطلب #${this.order.id}`).markdown({
      greeting: 'شكرًا لطلبك',
      lines: [`المجموع: ${(this.order.total_cents / 100).toFixed(2)} $`],
    })
  }
}

module.exports = OrderReceipt
```

## الخطوة 4: قلب المتجر: متحكم الطلبات

```js
const { abort, response, DB, Cache, event, Mail } = require('kreftjs/server')
const Product = require('../../Models/Product')
const Order = require('../../Models/Order')
const OrderItem = require('../../Models/OrderItem')
const OrderPlaced = require('../../Events/OrderPlaced')
const OrderReceipt = require('../../Mail/OrderReceipt')

class OrderController {
  async store(req) {
    const data = await req.validate({
      email: 'required|email',
      items: 'required|array|min:1',
    })
    const key = req.header('idempotency-key') || null

    // قفل واحد لكل مفتاح: النقر المزدوج لا يصنع طلبين
    const { order, fresh } = await Cache.lock('checkout:' + (key || data.email), 15, async () => {
      if (key) {
        const old = await Order.where('idempotency_key', key).first()
        if (old) return { order: old, fresh: false }
      }

      // الكل أو لا شيء: أي فشل يتراجع عن كل ما سبق
      const created = await DB.transaction(async () => {
        let total = 0
        const lines = []
        for (const row of data.items) {
          const qty = Number(row.qty)
          if (!Number.isInteger(qty) || qty < 1) abort(422, 'الكمية غير صالحة')
          const product = await Product.findOrFail(row.product_id)
          if (product.stock < qty) abort(409, `نفد من المخزون: ${product.name}`)
          await product.decrement('stock', qty)
          total += product.price_cents * qty
          lines.push({ product_id: product.id, qty, price_cents: product.price_cents })
        }
        const made = await Order.create({ email: data.email, total_cents: total, idempotency_key: key })
        for (const line of lines) await OrderItem.create({ ...line, order_id: made.id })
        return made
      })
      return { order: created, fresh: true }
    })

    if (fresh) {                       // إعادة الإرسال بالمفتاح نفسه لا تكرر الحدث ولا البريد
      await event(new OrderPlaced(order))
      await Mail.to(order.email).queue(new OrderReceipt(order))
    }
    return response(await Order.query().with('items.product').findOrFail(order.id), 201)
  }

  async show(req, id) {
    return Order.query().with('items.product').findOrFail(id)
  }
}

module.exports = OrderController
```

لنقرأه بتأنٍّ:

1. **التحقق:** `email` صالح و`items` مصفوفة غير فارغة. تفاصيل كل عنصر نتحقق منها بأنفسنا لأننا نحتاج رسائل بعينها.
2. **القفل `Cache.lock(name, 15, callback)`:** مفتاح القفل هو `Idempotency-Key` أو البريد. إن ضغط العميل "ادفع" مرتين بسرعة يدخل المقطع الحرج واحد فقط في كل مرة، ويُحرَّر القفل تلقائيًا.
3. **التكرار:** داخل القفل نبحث عن طلب بالمفتاح نفسه. إن وُجد نُرجعه دون إنشاء جديد، ونضع `fresh: false`.
4. **المعاملة `DB.transaction`:** نخصم المخزون لكل صنف، فإن نفد صنف في منتصف السلة نرمي `abort(409)` فيتراجع **كل** ما سبق، ومنه الأصناف التي خُصمت قبله.
5. **بعد النجاح فقط** (`fresh`): نطلق الحدث ونضع البريد على الطابور. وهذا خطأ شائع: لو أطلقنا الحدث والبريد حتى عند إعادة الإرسال بالمفتاح نفسه لوصل الإيصال مرتين. العلامة `fresh` تمنع ذلك (اختبرنا الحالتين).

```js
const { order, fresh } = await Cache.lock(/* … */)
if (fresh) {                       // إعادة الإرسال بالمفتاح نفسه لا تكرر الحدث ولا البريد
  await event(new OrderPlaced(order))
  await Mail.to(order.email).queue(new OrderReceipt(order))
}
```

### المنتجات مع ذاكرة مؤقتة

```js
const { Cache } = require('kreftjs/server')
const Product = require('../../Models/Product')

class ProductController {
  async index(req) {
    return Cache.remember('products:list', 30, () => Product.query().inStock().orderBy('name').get())
  }
}

module.exports = ProductController
```

`Cache.remember('products:list', 30, fn)` يحسب القائمة مرة كل 30 ثانية مهما كثر الزوار. احرص على إبطالها عند تغيير المنتجات: `await Cache.forget('products:list')`. (الجدير بالذكر أن المخزون المعروض قد يتأخر حتى 30 ثانية، لكن الدفع نفسه يقرأ المخزون الحقيقي من القاعدة دائمًا.)

### البذور والمسارات

```js
const { Seeder } = require('kreftjs/server')
const Product = require('../../app/Models/Product')

class DatabaseSeeder extends Seeder {
  async run() {
    await Product.create({ name: 'قهوة عربية', price_cents: 1500, stock: 10 })
    await Product.create({ name: 'تمر سكري', price_cents: 2500, stock: 3 })
    await Product.create({ name: 'عود', price_cents: 9900, stock: 0 })
  }
}

module.exports = DatabaseSeeder
```

```js
// backend/routes/api.js
const { Route } = require('kreftjs/server')
const ProductController = require('../app/Http/Controllers/ProductController')
const OrderController = require('../app/Http/Controllers/OrderController')

Route.get('/products', [ProductController, 'index'])
Route.post('/orders', [OrderController, 'store']).middleware('throttle:20,1')
Route.get('/orders/{order}', [OrderController, 'show'])
```

## نتائج التجربة الفعلية

شغّلنا `kreft dev --seed` ثم أرسلنا هذه الطلبات:

| التجربة | النتيجة |
|---|---|
| طلب عادي | `201` مع الطلب وبنوده ومنتجاته، والمخزون نقص |
| إعادة الطلب بـ `Idempotency-Key` نفسه | يعيد **الطلب الأول نفسه**، لا طلب جديد، لا خصم، لا بريد |
| سلة: صنف متوفر + صنف الكمية فيه أكبر من المخزون | `409` برسالة `نفد من المخزون: تمر سكري` **والصنف الأول لم يُخصم** (تراجع كامل) |
| بريد غير صالح وسلة فارغة | `422` مع رسالتي الحقلين |
| كمية صفر | `422` برسالة `الكمية غير صالحة` |
| بعد كل طلب ناجح | سطر `[order] #N` من المستمع، وبريد الإيصال يظهر في الطرفية (مهمة على الطابور) |

## الخطوة 5: السلة في المتصفح

نعرّف مخزن السلة مرة واحدة في `index.html` ونحفظه بـ `saved: true`:

```js
Kreftjs.store('cart', {
  items: [],
  get count() { return this.items.reduce((n, i) => n + i.qty, 0) },
  get total() { return this.items.reduce((s, i) => s + i.qty * i.price_cents, 0) },
  add(p) {
    const line = this.items.find((i) => i.id === p.id)
    if (line) line.qty++
    else this.items.push({ id: p.id, name: p.name, price_cents: p.price_cents, qty: 1 })
  },
  remove(id) { this.items = this.items.filter((i) => i.id !== id) },
  clear() { this.items = [] },
}, { saved: true })
```

اختبرنا في المتصفح: الإضافة مرتين لنفس المنتج تزيد `qty`، والسلة تبقى بعد إعادة تحميل الصفحة.

### صفحة المتجر

```html
<!-- pages/Shop.kreft -->
use cart

load products = api.get('/api/products')

derive money = (cents) => (cents / 100).toFixed(2) + ' $'

<view>
  <h1>المتجر</h1>

  <p k-if="products.loading">جارٍ التحميل…</p>
  <p k-elif="products.error">تعذر التحميل <button @click={products.reload}>حاول مجددًا</button></p>
  <div k-else class="grid">
    {for p in products.data || [] key p.id}
      <article class="card">
        <h3>{p.name}</h3>
        <p>{money(p.price_cents)} · المتوفر: {p.stock}</p>
        <button @click="cart.add(p)">أضف إلى السلة</button>
      </article>
    {empty}
      <p>لا منتجات الآن.</p>
    {/for}
  </div>
</view>

<style scoped>
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
</style>
```

### صفحة السلة والدفع

```html
<!-- pages/Cart.kreft -->
use cart

state order = null
state failure = ''
state key = crypto.randomUUID()          // مفتاح واحد لهذه المحاولة: النقر المزدوج لا يكرر الطلب
state checkout = form({ email: '' }, { email: 'required|email' })

derive money = (cents) => (cents / 100).toFixed(2) + ' $'

action pay() {
  failure = ''
  let result = false
  try {
    result = await checkout.$submit((values) =>
      api.post('/api/orders', {
        email: values.email,
        items: cart.items.map((i) => ({ product_id: i.id, qty: i.qty })),
      }, { headers: { 'Idempotency-Key': key } })
    )
  } catch (e) {
    failure = e.message                 // مثل: نفد من المخزون
    key = crypto.randomUUID()
    return
  }
  if (result) {
    order = result
    cart.clear()
    key = crypto.randomUUID()
  }
}


<view>
  <h1>السلة</h1>

  <div k-if="order" class="ok">
    تم الطلب رقم #{order.id} · المجموع {money(order.total_cents)}
  </div>

  <p k-elif="!cart.items.length">السلة فارغة.</p>

  <div k-else>
    <table>
      <tr k-each="line in cart.items" k-key="line.id">
        <td>{line.name}</td>
        <td>{line.qty} × {money(line.price_cents)}</td>
        <td><button @click="cart.remove(line.id)">حذف</button></td>
      </tr>
    </table>
    <p><b>المجموع: {money(cart.total)}</b></p>

    <p k-if="failure" class="error">{failure}</p>
    <form novalidate @submit.prevent={pay}>
      <input type="email" dir="ltr" k-model="checkout.email" placeholder="you@example.com">
      <p k-if="checkout.$error('email')" class="error">{checkout.$error('email')}</p>
      <button disabled={checkout.$busy}>أكمل الطلب</button>
    </form>
  </div>
</view>
```

أشياء تعلّمناها من الاختبار الفعلي:

1. **`novalidate` على النموذج.** مع `type="email"` يمنع المتصفح إرسال النموذج قبل أن تعمل قواعد Kreft، فلا تظهر رسالة الخطأ. أضف `novalidate` لتتولى `form()` التحقق.
2. **`key` ثابت لكل محاولة.** نولّد `crypto.randomUUID()` مرة، فالنقر المزدوج يرسل المفتاح نفسه. وبعد نجاح الدفع أو فشله نولّد مفتاحًا جديدًا.
3. **أخطاء الخادم غير 422** (كنفاد المخزون `409`) ترميها `$submit`، فنلتقطها بـ `try/catch` ونعرض `e.message`.
4. **الدفع الناجح** يعرض رقم الطلب ويفرّغ السلة.

اختبرناها في المتصفح: بريد خاطئ يعرض رسالة الحقل، ودفع صحيح يعرض "تم الطلب رقم #4 · المجموع 65.00 $" ويفرّغ السلة، وكمية أكبر من المخزون تعرض "نفد من المخزون: تمر سكري".

المسارات في `routes/web.kreft`:

```js
Route.view('/shop', 'pages/Shop.kreft').name('shop').title('المتجر')
Route.view('/cart', 'pages/Cart.kreft').name('cart').title('السلة')
```

## ما الذي ينقص قبل الإنتاج؟

هذا مثال تعليمي. قبل متجر حقيقي أضف:

- **الدفع الفعلي** عبر مزوّد دفع (Stripe وغيره) مع webhook، ولا تثق بمبلغ يأتي من المتصفح؛ احسبه دائمًا على الخادم كما فعلنا.
- **المصادقة** على الطلبات وربطها بحساب المستخدم.
- **قائمة الفحص** في الفصل السابع (HTTPS و`APP_KEY` و`MAIL_URL` و`QUEUE_CONNECTION`).
- **اختبارات** المعاملة: اختبر أن المخزون لا يتغير عند فشل صنف.

## اختبار المعاملة آليًا

```js
// tests/orders.test.js (فكرة)
const test = require('node:test')
const assert = require('node:assert/strict')
// … أعدّ قاعدة في الذاكرة كما في الفصل التاسع، وأنشئ منتجين مخزون الثاني 1
// ثم حاول طلب (1 من الأول، 5 من الثاني) وتوقّع الرفض، وتأكد أن مخزون الأول لم يتغير.
```

## تمارين

1. أضف حالة للطلب (`paid`, `shipped`) وحدثًا `OrderShipped` له مستمع يرسل بريدًا.
2. أضف مهمة مجدولة تلغي الطلبات `pending` الأقدم من 24 ساعة وتعيد مخزونها داخل معاملة.
3. أضف صفحة طلباتي بمسار `GET /orders` تحت `auth` وتعرض طلبات المستخدم فقط.
