/*
 * kreft build --prerender — saves every page of the router as ready HTML (static site generation).
 *
 *   kreft build --prerender                    every route without :params
 *   kreft build --prerender /users/1,/users/2  also these addresses
 *
 * Each page opens in a simulated browser (jsdom), waits until its data has loaded, and the result
 * is written to dist/<path>/index.html. Visitors and search engines get the content at once;
 * then Kreft starts and the page works as usual.
 * Needs jsdom, once per project:  npm i -D jsdom
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

// the head tags a page sets for search engines and link previews (the title is handled apart)
const SEO_TAGS = [
  'meta[name="description"]', 'meta[name="keywords"]', 'meta[name="robots"]', 'meta[name="author"]',
  'meta[name^="twitter:"]', 'meta[property^="og:"]',
  'link[rel="canonical"]', 'link[rel="alternate"][hreflang]',
  'script[type="application/ld+json"][data-kreft-seo]',
].join(',');

// what makes two head tags "the same tag": the page's version replaces the original's
function tagKey(el) {
  const tag = el.localName;
  if (tag === 'meta') return `meta:${el.getAttribute('name') || el.getAttribute('property')}`;
  if (tag === 'link') return `link:${el.getAttribute('rel')}:${el.getAttribute('hreflang') || ''}`;
  return `${tag}:${el.getAttribute('type')}`;
}

// the serialized SEO tags of a rendered page; JSON-LD cannot close its own <script>.
// A tag that holds the address of the temporary server (og:url falls back to the page's own address)
// is left out: the app fills it in with the real address when it starts.
function seoTags(document, origin) {
  return [...document.head.querySelectorAll(SEO_TAGS)].filter((el) => el.hasAttribute('data-kreft-seo')).map((el) => { // only what the page set
    if (el.localName !== 'script') return el.outerHTML;
    const copy = el.cloneNode(false);
    copy.textContent = el.textContent.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
    return copy.outerHTML;
  }).filter((html) => !html.includes(origin));
}

// puts the page's SEO tags into the static document, replacing the original's copy of each.
// A canonical address (or og:url) written in index.html belongs to the home page: on any other page it
// would tell search engines that the page is a copy of the home page, so only a page's own is kept.
function applyTags(doc, tags, isHome) {
  if (!isHome) doc.head.querySelectorAll('link[rel="canonical"], meta[property="og:url"]').forEach((el) => el.remove());
  const holder = doc.createElement('template');
  for (const html of tags) {
    holder.innerHTML = html;
    const el = holder.content.firstElementChild;
    if (!el) continue;
    const key = tagKey(el);
    for (const old of [...doc.head.querySelectorAll(el.localName)]) if (tagKey(old) === key) old.remove();
    doc.head.appendChild(el);
  }
}

// opens a page of a running app in a simulated browser and returns what it drew:
// { html, id, title, tags, htmlAttrs, path, routes, errorStatus, problems }
// How the simulated browser loads files. jsdom 27 and newer take `resources: { userAgent, interceptors }`;
// older ones have a ResourceLoader class and a top-level `userAgent`. Without special needs: 'usable'.
// external: false → images, styles and fonts from other sites are not downloaded (a server drawing pages
// for crawlers has no use for them); scripts still are.
function jsdomResources(jsdom, { origin, userAgent, external }) {
  if (!userAgent && external) return { resources: 'usable' };
  const sameSite = (url) => { try { return new URL(url).origin === origin; } catch (_) { return false; } };
  if (typeof jsdom.requestInterceptor === 'function') {
    const resources = {};
    if (userAgent) resources.userAgent = userAgent;
    if (!external) {
      resources.interceptors = [jsdom.requestInterceptor((request, context) => {
        const el = context && context.element;
        if (el && el.localName !== 'script' && !sameSite(request.url)) return new Response('', { status: 200 });
      })];
    }
    return { resources };
  }
  if (typeof jsdom.ResourceLoader === 'function') {
    class Loader extends jsdom.ResourceLoader {
      fetch(url, options) {
        if (!external && options && options.element && options.element.localName !== 'script' && !sameSite(url)) return null;
        return super.fetch(url, options);
      }
    }
    return { resources: new Loader(userAgent ? { userAgent } : {}), ...(userAgent ? { userAgent } : {}) };
  }
  return { resources: 'usable', ...(userAgent ? { userAgent } : {}) };
}

// opens a page of a running app in a simulated browser and returns what it drew:
// { html, id, title, tags, htmlAttrs, path, routes, errorStatus, problems }
function createRenderer({ jsdom, origin, basePath, maxWait = 10000, userAgent, external = true }) {
  const { JSDOM, VirtualConsole } = jsdom;
  const loading = jsdomResources(jsdom, { origin, userAgent, external });
  return async function render(route) {
    const problems = [];
    const vc = new VirtualConsole();
    vc.on('error', (...a) => problems.push(a.join(' ')));
    vc.on('jsdomError', (e) => { if (!/scrollTo|EventSource/.test(e.message)) problems.push(e.message); });
    let pending = 0, last = Date.now();
    const dom = await JSDOM.fromURL(origin + basePath + route.replace(/^\//, ''), {
      runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, ...loading,
      beforeParse(w) {
        w.__KREFT_DEV__ = true; // lets us find the app and its router
        w.scrollTo = () => { };
        w.fetch = (u, o) => {
          pending++;
          last = Date.now();
          const headers = new Headers(o && o.headers);
          if (userAgent) headers.set('User-Agent', userAgent); // the app's own API calls are this server's too
          return fetch(new URL(String(u), w.location.href).href, { ...o, headers }).finally(() => { pending--; last = Date.now(); });
        };
      },
    });
    const w = dom.window;
    try {
      // wait until nothing has loaded for a moment
      const started = Date.now();
      // a script or file that never answers must not hold the page (or the server) for ever
      let giveUp;
      await Promise.race([new Promise((r) => w.addEventListener('load', r)), new Promise((r) => { giveUp = setTimeout(r, maxWait); })]);
      clearTimeout(giveUp);
      while (Date.now() - started < maxWait && (pending > 0 || Date.now() - last < 300)) await new Promise((r) => setTimeout(r, 50));
      await new Promise((r) => setTimeout(r, 50));
      const Kreftjs = w.Kreftjs;
      const rootInst = Kreft && Kreftjs.__devtools.instances().find((i) => !i.parent);
      const container = rootInst && rootInst.hot && rootInst.hot.start().parentNode;
      const router = rootInst && rootInst.appContext.config.globals.$router;
      return {
        problems,
        path: router ? router.route.path : route,
        errorStatus: router && router.route.error ? Number(router.route.error.status) || 500 : 0, // the app showed errors/404.kreft (or another)
        title: w.document.title,
        tags: seoTags(w.document, origin),
        htmlAttrs: ['lang', 'dir', 'data-kreft-orig-lang', 'data-kreft-orig-dir'].filter((a) => w.document.documentElement.hasAttribute(a)).map((a) => [a, w.document.documentElement.getAttribute(a)]),
        html: container ? container.innerHTML : null,
        id: container && container.id,
        routes: router ? router.routes.filter((r) => !/[:*]/.test(r.path) && !r.redirect && r.component).map((r) => r.path) : [],
      };
    } finally {
      w.close();
    }
  };
}

// the original page with the rendered view inside the app element; returns the document
function compose(JSDOM, original, page, route) {
  const doc = new JSDOM(original).window.document;
  const el = doc.getElementById(page.id);
  const source = doc.createElement('template');
  source.setAttribute('data-kreft-ssg-source', '');
  source.innerHTML = el.innerHTML; // the app's own in-page view, if it has one
  el.innerHTML = page.html;
  el.setAttribute('data-kreft-ssg', '');
  el.removeAttribute('k-cloak');
  el.parentNode.insertBefore(source, el.nextSibling);
  if (page.title) doc.title = page.title;
  applyTags(doc, page.tags, route === '/');
  for (const [a, v] of page.htmlAttrs) doc.documentElement.setAttribute(a, v); // a page in another language
  if (route !== '/' && !doc.querySelector('base')) {
    const b = doc.createElement('base');
    b.setAttribute('href', '/');
    doc.head.insertBefore(b, doc.head.firstChild);
  }
  return doc;
}

function loadJsdom(root) {
  return require(require.resolve('jsdom', { paths: [root, process.cwd(), __dirname] }));
}

module.exports = async function prerender(dist, root, extra) {
  let jsdom;
  try {
    jsdom = loadJsdom(root);
  } catch (_) {
    throw new Error('it needs jsdom. Install it once in your project:\n\n    kreft add -D jsdom\n');
  }
  const { JSDOM } = jsdom;
  if (typeof fetch !== 'function') throw new Error('it needs Node.js 18 or newer.');

  const indexFile = path.join(dist, 'index.html');
  const original = fs.readFileSync(indexFile, 'utf8');
  const baseHref = (original.match(/<base\s[^>]*href\s*=\s*["']([^"']*)["']/i) || [])[1];
  const basePath = (baseHref || '/').replace(/\/?$/, '/');

  const resolvedDist = path.resolve(dist);
  const isInsideDist = (target) => {
    const r = path.resolve(target);
    return r === resolvedDist || r.startsWith(resolvedDist + path.sep);
  };

  // a small server for the built files: /<base>/x → dist/x, page paths → index.html
  const server = http.createServer((req, res) => {
    let p;
    try {
      p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    } catch (_) {
      res.writeHead(400);
      return res.end();
    }
    if (p.includes('\0')) {
      res.writeHead(400);
      return res.end();
    }
    if (p.startsWith(basePath)) p = '/' + p.slice(basePath.length);
    const file = path.resolve(resolvedDist, '.' + (p.startsWith('/') ? p : '/' + p));
    if (!isInsideDist(file)) {
      res.writeHead(403);
      return res.end();
    }
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

  const render = createRenderer({ jsdom, origin, basePath });

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

      if (page.errorStatus) { console.log(`  skipped ${route}: the app shows an error page (${page.errorStatus})`); continue; }
      const doc = compose(JSDOM, original, page, route);
      const out = route === '/' ? indexFile : path.resolve(resolvedDist, route.replace(/^\//, ''), 'index.html');
      if (!isInsideDist(out)) { console.log(`  skipped ${route}: invalid output path`); continue; }
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, '<!doctype html>\n' + doc.documentElement.outerHTML + '\n');
      written.push(route);
    }
  } finally {
    server.close();
  }
  console.log(`\n  Prerendered ${written.length} page${written.length === 1 ? '' : 's'}: ${written.join('  ')}`);
};

module.exports.createRenderer = createRenderer;
module.exports.compose = compose;
module.exports.loadJsdom = loadJsdom;
