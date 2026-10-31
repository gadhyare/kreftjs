/*
 * som build --prerender — saves every page of the router as ready HTML (static site generation).
 *
 *   som build --prerender                    every route without :params
 *   som build --prerender /users/1,/users/2  also these addresses
 *
 * Each page opens in a simulated browser (jsdom), waits until its data has loaded, and the result
 * is written to dist/<path>/index.html. Visitors and search engines get the content at once;
 * then Som.js starts and the page works as usual.
 * Needs jsdom, once per project:  npm i -D jsdom
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

module.exports = async function prerender(dist, root, extra) {
  let JSDOM, VirtualConsole;
  try {
    ({ JSDOM, VirtualConsole } = require(require.resolve('jsdom', { paths: [root, process.cwd(), __dirname] })));
  } catch (_) {
    throw new Error('it needs jsdom. Install it once in your project:\n\n    som add -D jsdom\n');
  }
  if (typeof fetch !== 'function') throw new Error('it needs Node.js 18 or newer.');

  const indexFile = path.join(dist, 'index.html');
  const original = fs.readFileSync(indexFile, 'utf8');
  const baseHref = (original.match(/<base\s[^>]*href\s*=\s*["']([^"']*)["']/i) || [])[1];
  const basePath = (baseHref || '/').replace(/\/?$/, '/');

  // a small server for the built files: /<base>/x → dist/x, page paths → index.html
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.startsWith(basePath)) p = '/' + p.slice(basePath.length);
    const file = path.join(dist, p);
    const send = (f) => {
      const ext = path.extname(f);
      res.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' }[ext] || 'application/octet-stream' });
      res.end(f === indexFile ? original : fs.readFileSync(f));
    };
    try { if (fs.statSync(file).isFile()) return send(file); } catch (_) { /* not a file */ }
    if (!path.extname(p) && /text\/html/.test(req.headers.accept || '')) return send(indexFile); // a page, not an API call
    if (!path.extname(p)) { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end('{"message":"Not available while prerendering"}'); }
    res.writeHead(404);
    res.end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;

  async function render(route) {
    const problems = [];
    const vc = new VirtualConsole();
    vc.on('error', (...a) => problems.push(a.join(' ')));
    vc.on('jsdomError', (e) => { if (!/scrollTo|EventSource/.test(e.message)) problems.push(e.message); });
    let pending = 0, last = Date.now();
    const dom = await JSDOM.fromURL(origin + basePath + route.replace(/^\//, ''), {
      runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
      beforeParse(w) {
        w.__SOM_DEV__ = true; // lets us find the app and its router
        w.scrollTo = () => {};
        w.fetch = (u, o) => {
          pending++;
          last = Date.now();
          return fetch(new URL(String(u), w.location.href).href, o).finally(() => { pending--; last = Date.now(); });
        };
      },
    });
    const w = dom.window;
    // wait until nothing has loaded for a moment (at most 10 s)
    const started = Date.now();
    await new Promise((r) => w.addEventListener('load', r));
    while (Date.now() - started < 10000 && (pending > 0 || Date.now() - last < 300)) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 50));
    const Som = w.Som;
    const rootInst = Som && Som.__devtools.instances().find((i) => !i.parent);
    const container = rootInst && rootInst.hot && rootInst.hot.start().parentNode;
    const router = rootInst && rootInst.appContext.config.globals.$router;
    const result = {
      problems,
      router,
      path: router ? router.route.path : route,
      title: w.document.title,
      html: container ? container.innerHTML : null,
      id: container && container.id,
      routes: router ? router.routes.filter((r) => !/[:*]/.test(r.path) && !r.redirect && r.component).map((r) => r.path) : [],
    };
    w.close();
    return result;
  }

  const written = [];
  try {
    const first = await render('/');
    if (!first.html) throw new Error('the app did not start (is there an element with an id that the app mounts on?)');
    if (!first.id) throw new Error('the element the app mounts on needs an id, like <div id="app">');
    const routes = [...new Set(['/', ...first.routes, ...extra.map((p) => (p.startsWith('/') ? p : '/' + p))])];
    for (const route of routes) {
      const page = route === '/' ? first : await render(route);
      if (!page.html) { console.log(`  skipped ${route}: the app did not start`); continue; }
      if (page.path.replace(/\/$/, '') !== route.replace(/\/$/, '')) { console.log(`  skipped ${route}: it goes to ${page.path}`); continue; }
      page.problems.forEach((p) => console.log(`  ${route}: ${p.split('\n')[0]}`));

      // the original page with the rendered view inside the app element
      const doc = new JSDOM(original).window.document;
      const el = doc.getElementById(page.id);
      const source = doc.createElement('template');
      source.setAttribute('data-som-ssg-source', '');
      source.innerHTML = el.innerHTML; // the app's own in-page view, if it has one
      el.innerHTML = page.html;
      el.setAttribute('data-som-ssg', '');
      el.removeAttribute('s-cloak');
      el.parentNode.insertBefore(source, el.nextSibling);
      if (page.title) doc.title = page.title;
      if (route !== '/' && !doc.querySelector('base')) {
        const b = doc.createElement('base');
        b.setAttribute('href', '/');
        doc.head.insertBefore(b, doc.head.firstChild);
      }
      const out = route === '/' ? indexFile : path.join(dist, route.replace(/^\//, ''), 'index.html');
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, '<!doctype html>\n' + doc.documentElement.outerHTML + '\n');
      written.push(route);
    }
  } finally {
    server.close();
  }
  console.log(`\n  Prerendered ${written.length} page${written.length === 1 ? '' : 's'}: ${written.join('  ')}`);
};
