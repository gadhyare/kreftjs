// Regression test: `kreft build --prerender` keeps the per-page SEO tags.   Run: npm test
// Needs jsdom (npm i -D jsdom); the test is skipped when it is not installed.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');

let jsdomModules = null;
try { jsdomModules = path.dirname(path.dirname(require.resolve('jsdom/package.json'))); } catch (_) { /* not installed */ }

const INDEX = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <base href="/">
  <title>Site</title>
  <meta name="description" content="Default description">
  <link rel="canonical" href="https://example.com/">
  <meta property="og:url" content="https://example.com/">
</head>
<body>
  <div id="app"></div>
  <script src="kreft.js"></script>
  <script>
    const router = Kreft.router({
      errors: 'errors',
      routes: [
        { path: '/', component: 'pages/Home.kreft', meta: { title: 'Home', seo: { description: 'Home page', canonical: 'https://example.com/', lang: 'ar', dir: 'rtl',
          alternates: { en: 'https://example.com/en', ar: 'https://example.com/' },
          og: { image: 'https://example.com/a.png' }, schema: { '@type': 'WebSite', name: 'x<\\/script><b>' } } } },
        { path: '/about', component: 'pages/About.kreft', meta: { title: 'About', description: 'About us' } },
        { path: '/plain', component: 'pages/Plain.kreft' },
      ],
    })
    Kreft.app('App.kreft').use(router).mount('#app')
  </script>
</body>
</html>
`;


// writes the fixture site (no build) into <tmp>/site
function writeSite(tmp) {
  fs.symlinkSync(jsdomModules, path.join(tmp, 'node_modules'), 'dir'); // so the build can find jsdom
  const site = path.join(tmp, 'site');
  fs.mkdirSync(path.join(site, 'pages'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'kreft.js'), path.join(site, 'kreft.js'));
  fs.writeFileSync(path.join(site, 'index.html'), INDEX);
  fs.writeFileSync(path.join(site, 'App.kreft'), '<view><kreft-view></kreft-view></view>\n');
  fs.mkdirSync(path.join(site, 'errors'));
  fs.writeFileSync(path.join(site, 'errors', '404.kreft'), '<view><h1>Not found</h1></view>\n');
  for (const name of ['Home', 'About', 'Plain']) fs.writeFileSync(path.join(site, 'pages', name + '.kreft'), `<view><h1>${name}</h1></view>\n`);
  return site;
}

// builds the fixture site with --prerender into a temporary folder; returns { tmp, dist }
function buildSite() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-prerender-'));
  const site = writeSite(tmp);
  const run = spawnSync(process.execPath, [path.join(ROOT, 'bin/kreft.js'), 'build', site, '--out', path.join(tmp, 'dist'), '--prerender'], { cwd: tmp, encoding: 'utf8' });
  assert.strictEqual(run.status, 0, run.stdout + run.stderr);
  return { tmp, dist: path.join(tmp, 'dist') };
}

test('prerender: every page keeps its own description, canonical, Open Graph and JSON-LD', { skip: !jsdomModules && 'jsdom is not installed' }, () => {
  const { tmp } = buildSite();
  try {
    const home = fs.readFileSync(path.join(tmp, 'dist', 'index.html'), 'utf8');
    const about = fs.readFileSync(path.join(tmp, 'dist', 'about', 'index.html'), 'utf8');
    const count = (html, re) => (html.match(re) || []).length;

    assert.match(home, /<title>Home<\/title>/);
    assert.match(home, /<meta name="description" content="Home page"[^>]*>/);
    assert.strictEqual(count(home, /name="description"/g), 1, 'the default description is replaced, not repeated');
    assert.match(home, /<link rel="canonical" href="https:\/\/example\.com\/"[^>]*>/);
    assert.match(home, /<meta property="og:image"[^>]*content="https:\/\/example\.com\/a\.png"/);
    assert.match(home, /<meta name="twitter:card"[^>]*content="summary_large_image"/);
    const ld = home.match(/<script type="application\/ld\+json" data-kreft-seo[^>]*>([\s\S]*?)<\/script>/);
    assert.ok(ld, 'JSON-LD is in the page');
    assert.strictEqual(JSON.parse(ld[1]).name, 'x</script><b>', 'the data survives, but cannot close the <script>');

    assert.match(home, /<html[^>]*lang="ar"/);
    assert.match(home, /<html[^>]*dir="rtl"/);
    assert.strictEqual(count(home, /<link[^>]*rel="alternate"[^>]*hreflang=/g), 2, 'one alternate link per language');
    assert.doesNotMatch(about, /hreflang|dir="rtl"|lang="ar"/, 'another page does not get them');

    assert.match(about, /<title>About<\/title>/);
    assert.match(about, /<meta name="description" content="About us"[^>]*>/);
    assert.strictEqual(count(about, /name="description"/g), 1);
    assert.doesNotMatch(about, /rel="canonical"/, 'a page without its own canonical does not inherit the home page\'s');
    assert.doesNotMatch(about, /og:url/, 'nor its og:url');
    assert.doesNotMatch(about, /127\.0\.0\.1/, 'the address of the temporary server never reaches the page');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('router: a page without SEO of its own does not keep the last page\'s tags; error pages are noindex', { skip: !jsdomModules && 'jsdom is not installed' }, async () => {
  const { JSDOM, VirtualConsole } = require(require.resolve('jsdom', { paths: [jsdomModules] }));
  const { tmp, dist } = buildSite();
  const server = http.createServer((req, res) => {
    const file = path.join(dist, new URL(req.url, 'http://x').pathname);
    const send = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(dist, 'index.html');
    res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.css': 'text/css' }[path.extname(send)] || 'text/html' });
    res.end(fs.readFileSync(send));
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  let dom;
  try {
    dom = await JSDOM.fromURL(`http://127.0.0.1:${server.address().port}/`, {
      runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: new VirtualConsole(),
      beforeParse(w) { w.__KREFT_DEV__ = true; w.scrollTo = () => { }; },
    });
    const w = dom.window;
    await new Promise((ok) => w.addEventListener('load', ok));
    await new Promise((ok) => setTimeout(ok, 500));
    const router = w.Kreft.__devtools.instances().find((i) => !i.parent).appContext.config.globals.$router;
    const get = (sel) => { const el = w.document.head.querySelector(sel); return el && (el.getAttribute('content') || el.getAttribute('href')); };

    assert.strictEqual(get('meta[name="description"]'), 'Home page');
    assert.strictEqual(get('link[rel="canonical"]'), 'https://example.com/');

    assert.strictEqual(w.document.documentElement.getAttribute('lang'), 'ar');
    assert.strictEqual(w.document.head.querySelectorAll('link[rel="alternate"][hreflang]').length, 2);

    await router.go('/plain');
    await new Promise((ok) => setTimeout(ok, 200));
    assert.strictEqual(w.document.documentElement.getAttribute('lang'), 'en', 'the language of index.html comes back');
    assert.strictEqual(w.document.documentElement.getAttribute('dir'), null);
    assert.strictEqual(w.document.head.querySelectorAll('link[rel="alternate"][hreflang]').length, 0, 'so does the lack of alternates');
    assert.strictEqual(get('meta[name="description"]'), 'Default description', 'the description from index.html comes back');
    assert.strictEqual(get('link[rel="canonical"]'), 'https://example.com/', 'the canonical from index.html comes back');
    assert.strictEqual(get('meta[property="og:image"]'), null, 'a tag only the last page set is gone');
    assert.strictEqual(w.document.head.querySelector('script[type="application/ld+json"]'), null, 'so is its JSON-LD');

    w.Kreft.seo({ description: 'From a component' }); // adds to the route's tags
    assert.strictEqual(get('meta[name="description"]'), 'From a component');

    await router.go('/about');
    await new Promise((ok) => setTimeout(ok, 200));
    assert.strictEqual(get('meta[name="description"]'), 'About us', 'the route replaces what a component added');

    await router.go('/does-not-exist');
    await new Promise((ok) => setTimeout(ok, 200));
    assert.strictEqual(get('meta[name="robots"]'), 'noindex', 'an error page is not indexed');
    assert.strictEqual(get('meta[name="description"]'), 'Default description', 'and does not keep the last page\'s description');
    await router.go('/about');
    await new Promise((ok) => setTimeout(ok, 200));
    assert.strictEqual(get('meta[name="robots"]'), null, 'a real page is indexable again');
  } finally {
    if (dom) dom.window.close();
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('server: crawlers get the page already drawn, and a 404 for an address the app does not have', { skip: !jsdomModules && 'jsdom is not installed' }, async () => {
  const net = require('node:net');
  const { spawn } = require('node:child_process');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-ssr-'));
  const site = writeSite(tmp);
  const port = await new Promise((ok) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
  const child = spawn(process.execPath, [path.join(ROOT, 'bin/kreft.js'), 'dev', site, '--port', String(port), '--no-hot'], { cwd: tmp, stdio: 'ignore' });
  const get = (url, ua) => new Promise((ok, fail) => http.get({ port, host: '127.0.0.1', path: url, headers: { Accept: 'text/html', 'User-Agent': ua } }, (res) => {
    let body = ''; res.on('data', (d) => (body += d)); res.on('end', () => ok({ status: res.statusCode, body, headers: res.headers }));
  }).on('error', fail));
  const BOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
  const HUMAN = 'Mozilla/5.0 (Macintosh) AppleWebKit/605 Safari/605';
  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i++) { try { await get('/', HUMAN); up = true; } catch (_) { await new Promise((ok) => setTimeout(ok, 100)); } }
    assert.ok(up, 'the server did not start');

    const bot = await get('/about', BOT);
    assert.strictEqual(bot.status, 200);
    assert.match(bot.body, /<h1>About<\/h1>/, 'the content is in the first answer');
    assert.match(bot.body, /<title>About<\/title>/);
    assert.match(bot.body, /name="description"[^>]*content="About us"|content="About us"[^>]*name="description"/);
    assert.match(String(bot.headers.vary), /User-Agent/i);

    const human = await get('/about', HUMAN);
    assert.doesNotMatch(human.body, /<h1>About<\/h1>/, 'a browser gets the normal page and draws it itself');

    const lost = await get('/does-not-exist', BOT);
    assert.strictEqual(lost.status, 404, 'a page the app does not have is a real 404 for crawlers');
    assert.match(lost.body, /Not found/);
    assert.match(lost.body, /content="noindex"/);
    assert.strictEqual((await get('/does-not-exist', HUMAN)).status, 200, 'a browser gets the app, which shows its own 404 page');
  } finally {
    child.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ----- the page-drawing server in production (kreft serve, HTTPS enforced), many crawlers at once
test('server (kreft serve, behind an HTTPS proxy): crawlers get the drawn page, together with the security headers; many at once all do', { skip: !jsdomModules && 'jsdom is not installed' }, async () => {
  const net = require('node:net');
  const { spawn } = require('node:child_process');
  const { encodePath } = require(path.join(ROOT, 'bin/ssr.js'));
  assert.strictEqual(encodePath('/a b/café%'), '/a%20b/caf%C3%A9%25', 'an address the server already decoded is encoded again for the simulated browser');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-ssr-prod-'));
  const site = writeSite(tmp);
  const port = await new Promise((ok) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
  const child = spawn(process.execPath, [path.join(ROOT, 'bin/kreft.js'), 'serve', site, '--port', String(port)], {
    cwd: tmp, stdio: 'ignore',
    env: { ...process.env, APP_ENV: 'production', APP_KEY: 'base64:' + Buffer.alloc(32, 7).toString('base64') },
  });
  // a proxy in front says how the visitor came in
  const get = (url, ua, proto = 'https') => new Promise((ok, fail) => http.get({ port, host: '127.0.0.1', path: url, headers: { Accept: 'text/html', 'User-Agent': ua, 'X-Forwarded-Proto': proto } }, (res) => {
    let body = ''; res.on('data', (d) => (body += d)); res.on('end', () => ok({ status: res.statusCode, body, headers: res.headers }));
  }).on('error', fail));
  const BOT = 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)';
  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i++) { try { await get('/', 'x'); up = true; } catch (_) { await new Promise((ok) => setTimeout(ok, 100)); } }
    assert.ok(up, 'the server did not start');

    assert.strictEqual((await get('/about', 'Mozilla/5.0 Safari', 'http')).status, 301, 'a visitor on plain HTTP is sent to HTTPS');
    assert.strictEqual((await get('/about', BOT, 'http')).status, 301, 'so is a crawler');

    const one = await get('/about?ref=mail', BOT);
    assert.strictEqual(one.status, 200);
    assert.match(one.body, /<h1>About<\/h1>/);
    assert.match(String(one.headers['x-frame-options']), /SAMEORIGIN/);
    assert.match(String(one.headers['strict-transport-security']), /max-age/);

    // more crawlers than pages drawn at the same time: they wait for their turn, none gets the empty page
    const many = await Promise.all(['/about', '/plain', '/about', '/', '/plain', '/about'].map((u) => get(u, BOT)));
    for (const r of many) assert.match(r.body, /<h1>(About|Plain|Home)<\/h1>/);
  } finally {
    child.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
