/*
 * PWA output for `kreft build --pwa` (also used by the mobile commands):
 *   manifest.webmanifest  name, colours, icon, start_url
 *   sw.js                 offline shell: pages and files are cached after the first visit; /api/ is never cached
 *   pwa-register.js       registers sw.js (a file, not inline code, so it works under a strict CSP)
 * and the matching <link>, <meta> and <script> tags in index.html.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function listFiles(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listFiles(p, base, out);
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

function apply(dist, root, opts = {}) {
  const read = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return {}; } };
  const pkg = read(path.join(opts.project || root, 'package.json'));
  const name = opts.name || pkg.productName || pkg.name || path.basename(path.resolve(root));
  const themeColor = opts.themeColor || '#ffffff';
  const scope = './';

  const icon = [path.join(root, 'icon.png'), path.join(opts.project || root, 'build', 'icon.png')].find((f) => fs.existsSync(f));
  const icons = [];
  if (icon) { fs.copyFileSync(icon, path.join(dist, 'icon.png')); icons.push({ src: 'icon.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }); }

  const manifest = { name, short_name: String(name).slice(0, 12), start_url: scope, scope, display: 'standalone', background_color: themeColor, theme_color: themeColor, icons };
  fs.writeFileSync(path.join(dist, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2) + '\n');

  const skip = new Set(['sw.js', '.htaccess']);
  const files = listFiles(dist).filter((f) => !skip.has(f) && !f.endsWith('.map'));
  const version = crypto.createHash('sha1').update(files.map((f) => f + fs.statSync(path.join(dist, f)).size).join('|')).digest('hex').slice(0, 10);
  fs.writeFileSync(path.join(dist, 'sw.js'), `// Written by kreft build --pwa. A new build has a new version, so the old cache is dropped.
const CACHE = 'kreft-${version}';
const SHELL = ${JSON.stringify(['./', ...files.filter((f) => f !== 'index.html')])};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return; // data always goes to the network
  if (req.mode === 'navigate') { // page addresses: network first, the cached index.html when offline
    e.respondWith(fetch(req).catch(() => caches.match('./').then((r) => r || caches.match('index.html'))));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  })));
});
`);
  fs.writeFileSync(path.join(dist, 'pwa-register.js'),
    `// not inside the phone app or Electron: they ship their own files, and a service worker would keep serving the old ones after an update
const native = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !location.protocol.startsWith('capacitor') && !native && !window.__KREFT_ELECTRON__) {\n  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));\n}\n`);

  const file = path.join(dist, 'index.html');
  let html = fs.readFileSync(file, 'utf8');
  const tags = `  <link rel="manifest" href="manifest.webmanifest">\n  <meta name="theme-color" content="${esc(themeColor)}">\n  <meta name="mobile-web-app-capable" content="yes">\n  <meta name="apple-mobile-web-app-capable" content="yes">\n  <meta name="apple-mobile-web-app-title" content="${esc(manifest.short_name)}">\n${icons.length ? '  <link rel="apple-touch-icon" href="icon.png">\n' : ''}`;
  if (!html.includes('manifest.webmanifest')) html = html.replace(/<\/head>/i, () => tags + '</head>');
  if (!html.includes('pwa-register.js')) html = html.replace(/<\/body>/i, () => '  <script src="pwa-register.js"></script>\n</body>');
  // phones: draw under the notch; the app pads itself with env(safe-area-inset-*)
  html = html.replace(/(<meta[^>]*name=["']viewport["'][^>]*content=["'])([^"']*)(["'])/i, (m, a, c, z) => /viewport-fit/.test(c) ? m : a + c + ', viewport-fit=cover' + z);
  fs.writeFileSync(file, html);
  return { name, files: files.length + 3 };
}

module.exports = { apply };
