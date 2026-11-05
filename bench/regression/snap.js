// Regression test for the list rendering of kreftjs.js: runs list scenarios in headless Chrome and prints HTML snapshots.
// Usage:  node snap.js path/to/kreftjs.js > snap.json      (run it for the old and the new runtime, then `cmp` the two files)
// Needs puppeteer-core (npm i puppeteer-core) and Chrome (set CHROME if it is not at the macOS default path).
const puppeteer = require('puppeteer-core'), http = require('http'), fs = require('fs')
const SRC = process.argv[2]
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/k.js')) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end(fs.readFileSync(SRC)) }
  res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><meta charset=utf-8><div id="root"></div><script src="/k.js"></script>')
})
const scenarios = String.raw`
const out = []; const warns = []
const ow = console.warn; console.warn = (...a) => { warns.push(a.map(String).join(' ').slice(0, 120)); }
const norm = (el) => [...el.querySelectorAll('input')].map((i) => i.value).join(',') + '|' + el.innerHTML.replace(/ data-s-[a-z0-9]+=""/g, '').replace(/<!---->/g, '').replace(/ ?\bfade-[a-z-]+\b/g, '').replace(/ class="\s*"/g, '').replace(/ style=""/g, '').replace(/\s+/g, ' ').replace(/> </g, '><').trim()
const tick = () => Kreftjs.tick()
let n = 0
async function scenario(name, S, tpl, steps, extra = {}) {
  const host = document.createElement('div'); host.id = 'h' + (n++); document.body.appendChild(host)
  const comp = Object.assign({ template: tpl }, extra)
  for (const k of Object.keys(S)) Object.defineProperty(comp, k, { get() { return S[k] }, set(v) { S[k] = v }, enumerable: true })
  comp.fn = (name, ...a) => steps.fns[name](...a)
  const app = Kreftjs.app(comp)
  if (steps.components) for (const [k, v] of Object.entries(steps.components)) app.component(k, v)
  app.mount('#' + host.id)
  await tick(); await new Promise((r) => setTimeout(r, 5))
  out.push([name, 'initial', norm(host)])
  let i = 0
  for (const step of steps.list) {
    await step(host); await tick(); await new Promise((r) => setTimeout(r, 5))
    out.push([name, 'step' + (++i), norm(host)])
  }
}
const mk = (n, s = 0) => Array.from({ length: n }, (_, i) => ({ id: s + i + 1, t: 'item' + (s + i + 1) }))
const S1 = Kreftjs.state({ items: mk(5), sel: 0 })
await scenario('keyed', S1, '<ul>{for it in items key it.id}<li class={sel === it.id ? "on" : ""} @click="sel = it.id">{it.id}:{it.t}</li>{/for}</ul>', {
  fns: {}, list: [
    () => S1.items.push(...mk(2, 5)),
    () => S1.items.unshift({ id: 99, t: 'first' }),
    () => S1.items.splice(3, 2),
    () => S1.items.reverse(),
    () => { const a = S1.items.slice(); const t = a[1]; a[1] = a[a.length - 2]; a[a.length - 2] = t; S1.items = a },
    () => { document.querySelector('#h0 li:nth-child(3)').click() },
    () => { S1.items[2].t = 'changed' },
    () => { S1.items = [] },
    () => { S1.items = mk(3, 50) },
    () => { S1.items = S1.items.filter((x) => x.id !== 51) },
  ] })
const S2 = Kreftjs.state({ items: ['a', 'b', 'c'] })
await scenario('unkeyed', S2, '<p k-each="(x, i) in items">{i}-{x}</p>', { fns: {}, list: [() => S2.items.push('d'), () => S2.items.shift(), () => { S2.items = ['z'] }] })
const S3 = Kreftjs.state({ items: [], q: '' })
await scenario('empty', S3, '<div>{for it in items key it}<i>{it}</i>{empty}<b>none</b>{/for}</div>', { fns: {}, list: [() => S3.items.push('x'), () => S3.items.push('y'), () => { S3.items = [] }, () => S3.items.push('q')] })
const S4 = Kreftjs.state({ o: { a: 1, b: 2 }, m: [[1, 2], [3]] })
await scenario('nested+object', S4, '<div>{for (v, k) in o}<span>{k}={v}</span>{/for}{for row in m key row.length + "-" + row[0]}<p>{for c in row key c}<u>{c}</u>{/for}</p>{/for}</div>', { fns: {}, list: [() => { S4.o.c = 3 }, () => { S4.m[0].push(9) }, () => S4.m.push([7, 8]), () => { delete S4.o.a }] })
const S5 = Kreftjs.state({ items: mk(3), on: true, text: ['x', 'y', 'z'] })
await scenario('ifelse+model', S5, '<ul>{for it in items key it.id}<li><b k-if="it.id % 2">odd</b><i k-else>even</i><input k-model="text[it.id - 1]"></li>{/for}</ul>', { fns: {}, list: [() => { S5.items = S5.items.slice().reverse() }, () => { S5.text[0] = 'new' }, () => S5.items.push(...mk(1, 3))] })
const S6 = Kreftjs.state({ rows: mk(4), sel: 2 })
await scenario('memo', S6, '<table>{for r in rows key r.id}<tr k-memo="[r.id === sel, r.t]" class={r.id === sel ? "on" : ""}><td>{r.t}</td></tr>{/for}</table>', { fns: {}, list: [() => { S6.sel = 3 }, () => { S6.rows[0].t = 'zz' }, () => { S6.rows = S6.rows.slice(1) }] })
const S7 = Kreftjs.state({ items: mk(3) })
await scenario('component+slot', S7, '<div>{for it in items key it.id}<my-card n={it.id}><b>{it.t}</b></my-card>{/for}</div>', { fns: {}, components: { MyCard: { props: ['n'], template: '<section>card {n}: <slot></slot></section>' } }, list: [() => S7.items.reverse(), () => S7.items.push(...mk(1, 3)), () => S7.items.splice(0, 1)] })
const S8 = Kreftjs.state({ items: [{ id: 1 }, { id: 1 }, { id: 2 }] })
await scenario('dupkeys', S8, '<ul>{for it in items key it.id}<li>{it.id}</li>{/for}</ul>', { fns: {}, list: [() => S8.items.push({ id: 3 })] })
const S9 = Kreftjs.state({ items: mk(3), a: 'x' })
await scenario('attrs', S9, '<ul>{for it in items key it.id}<li id="r{it.id}" title={it.t} data-a="p {a} q" class="base {a}">{it.t}</li>{/for}</ul>', { fns: {}, list: [() => { S9.a = 'y' }, () => S9.items.pop()] })

// قوائم كبيرة: ترتيبات متنوعة (تختبر خوارزمية النقل) وحذف كل الصفوف دفعة واحدة
const S10 = Kreftjs.state({ items: mk(40) })
const rnd = (() => { let x = 7; return () => (x = (x * 1103515245 + 12345) & 0x7fffffff) })()
const shuffled = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = rnd() % (i + 1); [b[i], b[j]] = [b[j], b[i]] } return b }
await scenario('bigkeyed', S10, '<ul>{for it in items key it.id}<li>{it.id}</li>{/for}</ul><p>after</p>', { fns: {}, list: [
  () => { const a = S10.items.slice(); const t = a[1]; a[1] = a[38]; a[38] = t; S10.items = a },
  () => { S10.items = shuffled(S10.items) },
  () => { S10.items = shuffled(S10.items).slice(5) },
  () => { S10.items = S10.items.concat(mk(6, 100)) },
  () => { S10.items = S10.items.slice().reverse() },
  () => { S10.items = [...mk(3, 200), ...S10.items.slice(10, 20), ...mk(2, 300), ...S10.items.slice(25)] },
  () => { S10.items = S10.items.filter((x, i) => i % 3 !== 0) },
  () => { S10.items = mk(30, 500) },
  () => { S10.items = [] },
  () => { S10.items = mk(25, 700) },
  () => { S10.items.splice(10, 5) },
  () => { S10.items = shuffled(mk(20, 700)) },
] })
const S11 = Kreftjs.state({ items: mk(30) })
await scenario('twolists', S11, '<ul>{for it in items key it.id}<li>{it.id}</li>{/for}</ul><ol>{for it in items key it.id}<li>{it.t}</li>{/for}</ol>', { fns: {}, list: [() => { S11.items = [] }, () => { S11.items = mk(25, 40) }, () => { S11.items = shuffled(S11.items) }] })
const S12 = Kreftjs.state({ items: mk(3) })
await scenario('animated', S12, '<ul>{for it in items key it.id animate fade}<li>{it.id}</li>{/for}</ul>', { fns: {}, list: [
  () => S12.items.push(...mk(2, 3)), async () => { await new Promise((r) => setTimeout(r, 400)) },
  () => { S12.items.splice(1, 1) }, async () => { await new Promise((r) => setTimeout(r, 400)) },
  () => { S12.items.reverse() }, async () => { await new Promise((r) => setTimeout(r, 400)) },
] })

// حالات الجذر: k-if على الجذر، وصفوف بعدة جذور، ونص فقط، وقوائم متداخلة، وإعادة ترتيب وحذف وإفراغ
const S13 = Kreftjs.state({ items: mk(6), flag: true })
await scenario('rootif', S13, '<div>{for it in items key it.id}<b k-if="it.id % 2 === 0 || flag">E{it.id}</b><i k-else>O{it.id}</i>{/for}</div>', { fns: {}, list: [
  () => { S13.flag = false }, () => { S13.items = S13.items.slice().reverse() }, () => { S13.flag = true }, () => S13.items.splice(1, 2), () => { S13.items = [] }, () => { S13.items = mk(20, 30) }] })
const S14 = Kreftjs.state({ items: mk(4) })
await scenario('multiroot', S14, '<div><template k-each="it in items" k-key="it.id"><b>{it.id}</b><i>{it.t}</i></template></div>', { fns: {}, list: [
  () => { S14.items = S14.items.slice().reverse() }, () => S14.items.push(...mk(2, 4)), () => S14.items.splice(0, 2), () => { S14.items = [] }] })
const S15 = Kreftjs.state({ items: ['a', 'b', 'c'] })
await scenario('textonly', S15, '<p>{for x in items}{x},{/for}</p>', { fns: {}, list: [() => S15.items.push('d'), () => S15.items.reverse(), () => { S15.items = [] }] })
const S16 = Kreftjs.state({ groups: [{ id: 1, kids: mk(3) }, { id: 2, kids: mk(2, 10) }] })
await scenario('nestedcompact', S16, '<table>{for g in groups key g.id}<tbody><tr><th>{g.id}</th></tr>{for k in g.kids key k.id}<tr><td>{k.t}</td></tr>{/for}</tbody>{/for}</table>', { fns: {}, list: [
  () => S16.groups[0].kids.reverse(), () => S16.groups[1].kids.push({ id: 99, t: 'new' }), () => S16.groups.reverse(), () => { S16.groups = [] }, () => { S16.groups = [{ id: 5, kids: mk(20, 100) }] }, () => { S16.groups[0].kids = [] }] })
const S17 = Kreftjs.state({ items: mk(30), sel: 0 })
await scenario('bigtable', S17, '<table><tbody>\n  {for it in items key it.id}\n    <tr class={sel === it.id ? "on" : ""}><td>{it.id}</td><td><a @click="sel = it.id">{it.t}</a></td></tr>\n  {/for}\n</tbody></table>', { fns: {}, list: [
  () => { S17.sel = 5 }, () => { document.querySelector('#h' + (n - 1) + ' a').click() }, () => { S17.items = S17.items.slice(3).reverse() }, () => { S17.items = [] }, () => { S17.items = mk(18, 200) }] })
console.warn = ow
return { out, warns }
`
;(async () => {
  await new Promise((r) => server.listen(0, r))
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-first-run'] })
  const page = await browser.newPage(); const errs = []
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)))
  await page.goto('http://localhost:' + server.address().port + '/')
  const res = await page.evaluate(`(async () => { ${scenarios} })()`)
  console.log(JSON.stringify({ res, errs }, null, 1))
  await browser.close(); server.close()
})()
