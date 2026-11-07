// Language additions: pipes ({ price | currency }), typed props (prop size: 'sm' | 'lg' = 'sm'), k-match / k-case.
// The rendering tests need jsdom (npm i -D jsdom) and are skipped without it.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const Kreftjs = require(path.join(ROOT, 'kreftjs.js'));
const { splitInterp, exactBrace, typeCheck, caseCond } = Kreftjs.__internal;

let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch (_) { /* not installed */ }
const needDom = JSDOM ? {} : { skip: 'jsdom is not installed' };

/* ---- no DOM needed ---- */
test('a pipe becomes a call; || and |= are left alone', () => {
  const [p] = splitInterp('{ name | upper }');
  assert.match(p.expr, /^Kreftjs\.__pipe\("upper".*\)\(\(name\)\)$/);
  assert.strictEqual(splitInterp('{ a || b }')[0].expr, 'a || b');
  assert.strictEqual(splitInterp("{ x ? 'a|b' : /c|d/.test(y) }")[0].expr, "x ? 'a|b' : /c|d/.test(y)");
  assert.match(splitInterp("{ price | currency:'EUR' | upper }")[0].expr, /__pipe\("upper".*__pipe\("currency".*\)\(\(price\), 'EUR'\)\)$/);
  assert.match(splitInterp("{ n | number(2) }")[0].expr, /\(\(n\), 2\)$/);
  assert.match(exactBrace('{ n | upper }'), /__pipe/, 'attributes too');
});

test('typeCheck understands TypeScript types and lets unknown ones through', () => {
  const sizes = typeCheck("'sm' | 'lg'");
  assert.ok(sizes('sm') && sizes('lg') && !sizes('xl') && !sizes(3));
  assert.ok(typeCheck('string[]')([]) && !typeCheck('string[]')('x'));
  assert.ok(typeCheck('number | null')(null) && typeCheck('number | null')(2) && !typeCheck('number | null')('2'));
  assert.ok(typeCheck('(x: number) => void')(() => {}));
  assert.strictEqual(typeCheck('User'), null);
  assert.strictEqual(typeCheck('string | User'), null);
  assert.strictEqual(typeCheck('any'), null);
});

test('caseCond: one value, or one of several', () => {
  assert.strictEqual(caseCond('status', "'ok'"), "(status) === ('ok')");
  assert.strictEqual(caseCond('status', "'a', 'b'"), "['a', 'b'].includes(status)");
});

/* ---- rendering ---- */
function boot() {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
  const w = dom.window;
  const warns = [];
  w.console.warn = (...a) => warns.push(a.join(' '));
  w.eval(require('node:fs').readFileSync(path.join(ROOT, 'kreftjs.js'), 'utf8'));
  return { w, K: w.Kreftjs, warns };
}

test('pipes render in text and attributes', needDom, () => {
  const { K } = boot();
  const html = K.render(`<p title={name | upper}>{ name | upper } {price | currency:'USD'} {'  hi ' | trim | capitalize} {list | join:' + '} {missing | fallback:'n/a'}</p>`,
    { name: 'kreft', price: 1234.5, list: ['a', 'b'], missing: null });
  assert.match(html, /title="KREFT"/);
  assert.match(html, /KREFT \$1,234\.50 Hi a \+ b n\/a/);
});

test('ago and date read a Kreft database date as UTC', needDom, () => {
  const { K } = boot();
  const stamp = new Date(Date.now() - 2 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' '); // 2 h ago, written the way the database does
  assert.match(K.render('<i>{ at | ago }</i>', { at: stamp }), /2 hours ago/);
});

test('your own function is a pipe, and Kreftjs.pipe adds one', needDom, () => {
  const { K } = boot();
  K.pipe('shout', (v) => String(v).toUpperCase() + '!');
  assert.match(K.render('<i>{ w | shout }</i>', { w: 'hey' }), /HEY!/);
  assert.match(K.render('<i>{ w | twice:2 }</i>', { w: 'ab', twice: (v, n) => v.repeat(n) }), /abab/);
});

test('k-match shows the first matching case, several values, and the default', needDom, () => {
  const { K } = boot();
  const tpl = `<div k-match="s"><b k-case="'ok'">Fine</b><i k-case="'wait', 'queued'">Waiting</i><u k-default>Unknown</u></div>`;
  assert.match(K.render(tpl, { s: 'ok' }), /<b>Fine<\/b>/);
  assert.match(K.render(tpl, { s: 'queued' }), /<i>Waiting<\/i>/);
  const other = K.render(tpl, { s: 'zzz' });
  assert.match(other, /<u>Unknown<\/u>/);
  assert.ok(!/Fine|Waiting/.test(other));
});

test('typed props warn on a wrong value and when a required one is missing', needDom, async () => {
  const { w, K, warns } = boot();
  const files = {
    'Badge.kreft': `prop tone: 'info' | 'warn' = 'info'\nprop label: string\nprop count: number = 0\n<view><b>{label}:{tone}:{count}</b></view>`,
    'App.kreft': `<view><badge label="A" tone="warn"></badge><badge label="B" tone="loud"></badge><badge tone="info"></badge></view>`,
  };
  files['App.kreft'] = `import Badge from './Badge.kreft'\n` + files['App.kreft'];
  w.fetch = async (url) => { const f = files[String(url).split('/').pop()]; return { ok: !!f, status: f ? 200 : 404, text: async () => f }; };
  const root = w.document.getElementById('app');
  await K.app('App.kreft').mount(root);
  await new Promise((r) => setTimeout(r, 50));
  assert.match(root.innerHTML, /A:warn:0/);
  assert.ok(warns.some((m) => /prop "tone" should be 'info' \| 'warn'/.test(m)), warns.join('\n'));
  assert.ok(warns.some((m) => /Missing required prop: "label"/.test(m)), warns.join('\n'));
});
