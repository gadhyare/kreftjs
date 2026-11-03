// Sitemap and robots.txt output.   Run: npm test
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { SEO } = require(path.join(__dirname, '..', 'bin/backend/support.js'));

test('sitemap: patterns are left out, duplicates collapse, dates are only written when given', () => {
  const xml = SEO.sitemap(['/', '/about', '/about', '/posts/:id', '/files/*', { path: '/news', lastmod: new Date('2026-01-02T10:00:00Z'), priority: 0.5 }], { baseUrl: 'https://example.com/' });
  assert.deepStrictEqual([...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]), ['https://example.com/', 'https://example.com/about', 'https://example.com/news']);
  assert.strictEqual((xml.match(/<lastmod>/g) || []).length, 1, 'no invented "today" dates');
  assert.match(xml, /<lastmod>2026-01-02<\/lastmod>/);
  assert.doesNotMatch(xml, /changefreq/, 'only written when given');
  assert.match(xml, /<priority>0\.5<\/priority>/);
});

test('sitemap: addresses are XML-escaped', () => {
  const xml = SEO.sitemap(['/a?x=1&y=2'], { baseUrl: 'https://example.com' });
  assert.match(xml, /<loc>https:\/\/example\.com\/a\?x=1&amp;y=2<\/loc>/);
});

test('robots: points to the sitemap', () => {
  assert.match(SEO.robots({ sitemapUrl: 'https://example.com/sitemap.xml', disallow: ['/admin'] }), /Disallow: \/admin[\s\S]*Sitemap: https:\/\/example\.com\/sitemap\.xml/);
});

test('sitemap: alternate languages, and database dates become plain dates', () => {
  const xml = SEO.sitemap([{ path: '/about', lastmod: '2026-01-02 10:00:00', alternates: { en: '/about', ar: 'https://example.com/ar/about' } }], { baseUrl: 'https://example.com' });
  assert.match(xml, /xmlns:xhtml=/);
  assert.match(xml, /<lastmod>2026-01-02<\/lastmod>/);
  assert.match(xml, /<xhtml:link rel="alternate" hreflang="en" href="https:\/\/example\.com\/about"\/>/);
  assert.match(xml, /<xhtml:link rel="alternate" hreflang="ar" href="https:\/\/example\.com\/ar\/about"\/>/);
});

test('renderTags: hreflang alternates', () => {
  assert.match(SEO.renderTags({ title: 'x', alternates: { ar: 'https://example.com/ar' } }), /<link rel="alternate" hreflang="ar" href="https:\/\/example\.com\/ar">/);
});

// ----- pages from your data: backend/routes/seo.js, answered by the server
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const seoPages = require(path.join(__dirname, '..', 'bin/backend/seo-pages.js'));

test('seo.js patterns: :params and trailing *', () => {
  assert.deepStrictEqual(seoPages.matchPath('/posts/:slug', '/posts/hello'), { slug: 'hello' });
  assert.strictEqual(seoPages.matchPath('/posts/:slug', '/posts'), null);
  assert.strictEqual(seoPages.matchPath('/posts/:slug', '/posts/a/b'), null);
  assert.deepStrictEqual(seoPages.matchPath('/', '/'), {});
  assert.deepStrictEqual(seoPages.matchPath('/docs/*', '/docs/a/b/c'), {});
  assert.deepStrictEqual(seoPages.matchPath('/posts/:slug', '/posts/caf%C3%A9'), { slug: 'café' });
});

test('seo.js inject: the page\'s own title, description and canonical are replaced; the tags are marked for the browser', () => {
  const html = '<!doctype html><html><head><title>Shop</title><meta name="description" content="Default"><meta name="viewport" content="width=device-width"><link rel="canonical" href="https://example.com/"></head><body></body></html>';
  const out = seoPages.inject(html, SEO.renderTags({ title: 'Post', description: 'About it', canonical: 'https://example.com/posts/a' }));
  assert.strictEqual((out.match(/<title/g) || []).length, 1);
  assert.match(out, /<title>Post<\/title>/);
  assert.strictEqual((out.match(/name="description"/g) || []).length, 1);
  assert.match(out, /content="About it"/);
  assert.match(out, /name="viewport"/, 'tags it does not set stay');
  assert.strictEqual((out.match(/rel="canonical"/g) || []).length, 1);
  assert.match(out, /<meta data-kreft-seo="" data-kreft-ssr="" name="description"/);
});

async function freePort() {
  return new Promise((ok) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
}

let canLoopback = false;
try {
  canLoopback = spawnSync(process.execPath, ['-e', `
    const net = require('node:net');
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const c = net.connect({ host: '127.0.0.1', port: s.address().port }, () => {
        c.end(); s.close(); process.exit(0);
      });
      c.on('error', () => { s.close(); process.exit(1); });
    });
    s.on('error', () => process.exit(1));
  `]).status === 0;
} catch (_) {}

const get = (port, url) => new Promise((ok, fail) => http.get({ port, host: '127.0.0.1', path: url, headers: { Accept: 'text/html' } }, (res) => {
  let body = ''; res.on('data', (d) => (body += d)); res.on('end', () => ok({ status: res.statusCode, body }));
}).on('error', fail));

for (const command of ['dev', 'serve']) test(`server (kreft ${command}): pages from seo.js get their own tags and status in the first response`, { skip: !canLoopback && 'loopback network connection is restricted' }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-seo-'));
  fs.mkdirSync(path.join(tmp, 'frontend'));
  fs.mkdirSync(path.join(tmp, 'backend', 'routes'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'frontend', 'index.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Shop</title><meta name="description" content="Default"></head><body><div id="app"></div></body></html>');
  fs.writeFileSync(path.join(tmp, 'backend', 'routes', 'api.js'), 'module.exports = (Route) => {}\n');
  fs.writeFileSync(path.join(tmp, 'backend', 'routes', 'seo.js'), `module.exports = {
    '/posts/:slug': async ({ slug }) => slug === 'missing' ? null : { title: 'Post ' + slug, description: 'About "' + slug + '"', schema: { name: '</script>' } },
  }\n`);
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'bin/kreft.js'), command, path.join(tmp, 'frontend'), '--backend', path.join(tmp, 'backend'), '--port', String(port), ...(command === 'dev' ? ['--no-hot'] : [])], { cwd: tmp, stdio: 'ignore', env: { ...process.env, ...(command === 'serve' ? { APP_ENV: 'production', APP_KEY: 'base64:' + Buffer.alloc(32, 7).toString('base64') } : {}) } });
  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i++) { try { await get(port, '/'); up = true; } catch (_) { await new Promise((ok) => setTimeout(ok, 100)); } }
    assert.ok(up, 'the server did not start');

    const post = await get(port, '/posts/hello');
    assert.strictEqual(post.status, 200);
    assert.match(post.body, /<title>Post hello<\/title>/);
    assert.match(post.body, /name="description" content="About &quot;hello&quot;"/);
    assert.strictEqual((post.body.match(/name="description"/g) || []).length, 1, 'the default description is replaced');
    assert.doesNotMatch(post.body, /<\/script>"/, 'JSON-LD cannot close its <script>');
    assert.match(post.body, /\\u003c\/script\\u003e/);

    const missing = await get(port, '/posts/missing');
    assert.strictEqual(missing.status, 404, 'a page that does not exist is a real 404');
    assert.match(missing.body, /content="noindex"/);

    const other = await get(port, '/about');
    assert.strictEqual(other.status, 200);
    assert.match(other.body, /<title>Shop<\/title>/, 'an address seo.js does not list is the normal page');
  } finally {
    child.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('server (kreft serve): FORCE_HTTPS redirects plain requests, but believes a proxy that ends TLS', { skip: !canLoopback && 'loopback network connection is restricted' }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-https-'));
  fs.mkdirSync(path.join(tmp, 'frontend'));
  fs.writeFileSync(path.join(tmp, 'frontend', 'index.html'), '<!doctype html><html><head><title>Shop</title></head><body></body></html>');
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'bin/kreft.js'), 'serve', path.join(tmp, 'frontend'), '--port', String(port)], {
    cwd: tmp, stdio: 'ignore',
    env: { ...process.env, APP_ENV: 'production', FORCE_HTTPS: 'true', APP_URL: 'https://example.com', APP_KEY: 'base64:' + Buffer.alloc(32, 7).toString('base64') },
  });
  const ask = (proto) => new Promise((ok, fail) => http.get({ port, host: '127.0.0.1', path: '/about', headers: { Accept: 'text/html', ...(proto ? { 'X-Forwarded-Proto': proto } : {}) } }, (res) => {
    res.resume(); res.on('end', () => ok({ status: res.statusCode, location: res.headers.location }));
  }).on('error', fail));
  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i++) { try { await ask('https'); up = true; } catch (_) { await new Promise((ok) => setTimeout(ok, 100)); } }
    assert.ok(up, 'the server did not start');

    const bare = await ask(null);
    assert.strictEqual(bare.status, 301, 'no proxy header and FORCE_HTTPS: plain requests are redirected');
    assert.strictEqual(bare.location, 'https://example.com/about');
    const plain = await ask('http');
    assert.strictEqual(plain.status, 301, 'the proxy says it was plain HTTP');
    assert.strictEqual((await ask('https')).status, 200, 'the proxy says it was HTTPS: no redirect loop');
    assert.strictEqual((await ask('https, http')).status, 200, 'the first proxy in the chain counts');
  } finally {
    child.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('X-Forwarded-Proto: believed from this machine or from TRUSTED_PROXIES, not from anyone else', () => {
  const { isTrustedProxy } = require(path.join(__dirname, '..', 'bin/backend/http.js'));
  const from = (addr) => ({ socket: { remoteAddress: addr } });
  const saved = process.env.TRUSTED_PROXIES;
  try {
    delete process.env.TRUSTED_PROXIES;
    assert.strictEqual(isTrustedProxy(from('127.0.0.1')), true);
    assert.strictEqual(isTrustedProxy(from('::1')), true);
    assert.strictEqual(isTrustedProxy(from('::ffff:127.0.0.1')), true);
    assert.strictEqual(isTrustedProxy(from('203.0.113.7')), false, 'a visitor connecting directly');
    assert.strictEqual(isTrustedProxy(from('10.0.0.5')), false, 'a private address is not trusted unless listed');
    assert.strictEqual(isTrustedProxy({}), false);
    process.env.TRUSTED_PROXIES = '10.0.0.5, 10.0.0.6';
    assert.strictEqual(isTrustedProxy(from('10.0.0.5')), true);
    assert.strictEqual(isTrustedProxy(from('::ffff:10.0.0.6')), true);
    assert.strictEqual(isTrustedProxy(from('10.0.0.7')), false);
    process.env.TRUSTED_PROXIES = '*';
    assert.strictEqual(isTrustedProxy(from('203.0.113.7')), true);
  } finally {
    if (saved === undefined) delete process.env.TRUSTED_PROXIES; else process.env.TRUSTED_PROXIES = saved;
  }
});
