// The phone UI kit: edge components, Kreftjs.native, edge.css, the mobile layout, icons and splash
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const kit = path.join(root, 'templates', 'mobile');
const cli = path.join(root, 'bin', 'kreftjs.js');
const run = (args, cwd) => spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-ui-'));
const comps = fs.readdirSync(path.join(kit, 'edge')).filter((f) => f.endsWith('.kreft'));
const kebab = (n) => n.replace(/\.kreft$/, '').replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();

function app(flags = []) {
  const dir = tmp();
  const r = run(['new', 'a1', '--js', ...flags], dir);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  return path.join(dir, 'a1');
}

/* ---------------- the components themselves ---------------- */

test('there are 42 edge components, and each one starts with a comment that says how to use it', () => {
  assert.strictEqual(comps.length, 42);
  for (const c of comps) assert.match(read(kit, 'edge', c), /^<!--[\s\S]*?-->/, c);
});

test('every edge component is in the docs', () => {
  const docs = read(root, 'docs', 'README.md');
  for (const c of comps) assert.ok(docs.includes('`' + kebab(c) + '`') || docs.includes('<' + kebab(c)), kebab(c) + ' is not in docs/README.md');
});

test('the mistakes I made once are never made again (lint over every component)', () => {
  const uiClasses = new Set(read(root, 'templates', 'app', 'frontend', 'ui.css').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{[^}]*\}/g, '{}').match(/\.[a-zA-Z_][\w-]*/g).map((c) => c.slice(1)));
  for (const c of comps) {
    const src = read(kit, 'edge', c);
    const [script] = src.split('<view>');
    const view = src.split('<view>')[1].split('</view>')[0];
    const css = (src.split('<style scoped>')[1] || '').split('</style>')[0];
    assert.ok(!/k-else-if/.test(src), c + ': k-else-if is not a directive, use k-elif');
    assert.ok(!/\$router\.push/.test(src), c + ': the router method is go()');
    assert.ok(!/>\s*:deep\(\*\)/.test(css), c + ': `> :deep(*)` compiles to broken CSS; style slotted children from script');
    for (const m of view.matchAll(/k-ref="(\w+)"/g)) assert.match(script, new RegExp('^state ' + m[1] + ' = null', 'm'), c + ': k-ref="' + m[1] + '" needs `state ' + m[1] + ' = null`, not let');
    for (const tag of view.match(/<(button|input|select|textarea)\b[^>]*>/g) || []) assert.ok(tag.includes('data-edge'), c + ': ' + tag.slice(0, 40) + ' needs data-edge (keeps ui.css from leaking in)');
    for (const tag of view.match(/<[a-z][^>]*>/gi) || []) {
      assert.ok(!/\sstyle="/.test(tag), c + ': a style="" attribute breaks a strict CSP, bind :style instead');
      assert.ok(!(/(?<![:\w-])class="[^"]*\{/.test(tag) && /\s:class=/.test(tag)), c + ': class="…{x}…" together with :class loses the static part: ' + tag.slice(0, 60));
    }
    const own = new Set((css.replace(/\{[^}]*\}/g, '{}').match(/\.[a-zA-Z_][\w-]*/g) || []).map((x) => x.slice(1)));
    const clash = [...own].filter((x) => uiClasses.has(x));
    assert.deepStrictEqual(clash, [], c + ': these class names are also global classes in ui.css: ' + clash);
  }
});

test('the gallery shows every component', () => {
  const g = read(kit, 'pages', 'EdgeGallery.kreft');
  const missing = comps.map(kebab).filter((t) => !g.includes('<' + t) && !['edge-shell', 'edge-top-bar', 'edge-bottom-nav'].includes(t));
  assert.deepStrictEqual(missing, [], 'only the shell and the two bars (the layout shows them) may be missing from the gallery: ' + missing);
});

/* ---------------- installing the kit ---------------- */

test('kreft new --mobile: kit, layout, gallery, native plugins; every template compiles', () => {
  const dir = app(['--mobile', '--no-auth']);
  const f = path.join(dir, 'frontend');
  assert.strictEqual(fs.readdirSync(path.join(f, 'components', 'edge')).length, 42);
  const html = read(f, 'index.html');
  assert.match(html, /<link rel="stylesheet" href="edge\.css">/);
  assert.match(html, /<script src="kreftjs-native\.js"><\/script>/);
  assert.match(html, /layout: 'mobile'/);
  for (const c of comps) assert.ok(html.includes(`.component('${c.replace('.kreft', '')}', 'components/edge/${c}')`), c);
  assert.match(read(f, 'routes', 'web.kreft'), /Route\.view\('\/edge', 'pages\/EdgeGallery\.kreft'\)/);
  assert.match(read(f, 'routes', 'web.kreft'), /Route\.view\('\/', 'pages\/Home\.kreft'\)\.layout\('mobile'\)/);
  const layout = read(f, 'layouts', 'mobile.kreft');
  assert.match(layout, /label: 'Home'/);
  assert.doesNotMatch(layout, /\/dashboard|\/profile|\/users/, 'a --no-auth app has no such pages');
  const pkg = JSON.parse(read(dir, 'package.json'));
  for (const p of require('../bin/mobile.js').PLUGINS) assert.ok(pkg.dependencies['@capacitor/' + p], p);
  const b = run(['build'], dir);
  assert.strictEqual(b.status, 0, b.stdout + b.stderr);
  assert.ok(fs.existsSync(path.join(dir, 'dist', 'kreftjs-native.js')) && fs.existsSync(path.join(dir, 'dist', 'edge.css')));
});

test('with auth the bottom bar gets the dashboard, users and profile', () => {
  const layout = read(app(['--mobile', '--auth']), 'frontend', 'layouts', 'mobile.kreft');
  for (const to of ['/dashboard', '/users', '/profile']) assert.ok(layout.includes(`to: '${to}'`), to);
  assert.strictEqual((layout.match(/to: '\//g) || []).length >= 5, true);
});

test('--mobile with --electron keeps the dashboard layout; the phone home page draws its own bars', () => {
  const f = path.join(app(['--mobile', '--electron', '--no-auth']), 'frontend');
  assert.doesNotMatch(read(f, 'index.html'), /layout: 'mobile'/);
  assert.ok(!fs.existsSync(path.join(f, 'layouts', 'mobile.kreft')));
  const m = read(f, 'components', 'HomeMobile.kreft');
  assert.match(m, /<edge-shell>/);
  assert.match(m, /<edge-bottom-nav items=\{tabs\}/);
});

test('mobile:ui adds the kit to an existing app, once, and --layout / --gallery add the rest', () => {
  const dir = app(['--no-auth']);
  const f = path.join(dir, 'frontend');
  assert.ok(!fs.existsSync(path.join(f, 'components', 'edge')));
  assert.strictEqual(run(['mobile:ui'], dir).status, 0);
  const once = read(f, 'index.html');
  assert.strictEqual(run(['mobile:ui'], dir).status, 0);
  assert.strictEqual(read(f, 'index.html'), once, 'a second run changes nothing');
  assert.doesNotMatch(once, /layout: 'mobile'/);
  assert.strictEqual(run(['mobile:ui', '--layout', '--gallery'], dir).status, 0);
  assert.match(read(f, 'index.html'), /layout: 'mobile'/);
  assert.ok(fs.existsSync(path.join(f, 'pages', 'EdgeGallery.kreft')));
  assert.strictEqual((read(f, 'routes', 'web.kreft').match(/EdgeGallery/g) || []).length, 1);
  fs.writeFileSync(path.join(f, 'components', 'edge', 'EdgeBadge.kreft'), 'my change');
  run(['mobile:ui'], dir);
  assert.strictEqual(read(f, 'components', 'edge', 'EdgeBadge.kreft'), 'my change', 'your edits are never overwritten');
});

test('mobile:ui refuses outside an app', () => {
  const empty = tmp();
  const r = run(['mobile:ui'], empty);
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /not a Kreft app/);
  assert.deepStrictEqual(fs.readdirSync(empty), []);
});

/* ---------------- Kreftjs.native, run in a sandbox with a browser-shaped stub ---------------- */

function sandbox() {
  const stores = {};
  const data = {};
  const ls = {};
  Object.defineProperties(ls, {
    getItem: { value: (k) => (k in data ? data[k] : null) }, setItem: { value: (k, v) => { data[k] = String(v); ls[k] = data[k]; } },
    removeItem: { value: (k) => { delete data[k]; delete ls[k]; } },
  });
  const node = () => ({ setAttribute() {}, remove() {}, className: '', style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, addEventListener() {}, click() {} });
  const ctx = vm.createContext({
    console, setTimeout, clearTimeout, URL, Blob: class {}, Promise,
    Kreftjs: { store: (n, o) => (stores[n] = o), currentRouter: () => null },
    navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14)', onLine: true, language: 'so' }, screen: { width: 360, height: 800 }, devicePixelRatio: 2,
    localStorage: ls, addEventListener() {}, removeEventListener() {}, history: { length: 3, back() { ctx.wentBack = true; } },
    document: { readyState: 'complete', baseURI: 'http://localhost/app/', documentElement: node(), body: node(), head: node(), createElement: node, querySelector: () => null, getElementById: () => null, addEventListener() {}, removeEventListener() {} },
    getComputedStyle: () => ({ paddingTop: '0px', paddingRight: '0px', paddingBottom: '0px', paddingLeft: '0px' }),
    requestAnimationFrame: (f) => f(),
  });
  ctx.window = ctx;
  vm.runInContext(read(kit, 'kreftjs-native.js'), ctx);
  return { ctx, N: ctx.Kreftjs.native, K: ctx.Kreftjs, stores };
}

test('Kreftjs.native in a browser: platform, device, files, urls, assets and the back button', async () => {
  const { N, K, stores, ctx } = sandbox();
  const plain = (v) => JSON.parse(JSON.stringify(v)); // values made inside the sandbox have another Object, so compare them as plain data
  assert.strictEqual(N.platform(), 'web');
  assert.strictEqual(N.isNative(), false);
  const info = await N.device.info();
  assert.strictEqual(info.platform, 'web');
  assert.strictEqual(info.operatingSystem, 'android');
  assert.strictEqual(info.screen.width, 360);
  assert.strictEqual(await N.device.language(), 'so');
  assert.deepStrictEqual(plain(await N.system.network()), { connected: true, connectionType: 'unknown' });
  assert.strictEqual(await N.system.openUrl('javascript:alert(1)'), false);
  assert.strictEqual(await N.system.openUrl('file:///etc/passwd'), false);
  await N.file.write('notes/a.txt', 'hello');
  assert.strictEqual(await N.file.read('notes/a.txt'), 'hello');
  assert.deepStrictEqual(plain(await N.file.list('notes')), ['notes/a.txt']);
  await N.file.remove('notes/a.txt');
  assert.strictEqual(await N.file.read('notes/a.txt'), null);
  assert.strictEqual(N.asset('/img/a.png'), 'http://localhost/app/img/a.png');
  assert.deepStrictEqual(plain(N.safeArea()), { top: 0, right: 0, bottom: 0, left: 0 });
  // the back button: the newest handler first; false passes it on; with none left the page goes back
  const seen = [];
  const off1 = N.pushBack(() => { seen.push('sheet'); return true; });
  const off2 = N.pushBack(() => { seen.push('modal'); return false; });
  N.back();
  assert.deepStrictEqual(plain(seen), ['modal', 'sheet']);
  off1(); off2();
  N.back();
  assert.strictEqual(ctx.wentBack, true);
  // icons
  assert.ok(K.edgeIcons.has('home') && !K.edgeIcons.has('nope'));
  K.edgeIcons.add('nope', 'M0 0h24');
  assert.ok(K.edgeIcons.has('nope'));
  assert.ok(Object.keys(K.edgeIcons.paths).length >= 50);
  // the edge store
  const edge = stores.edge;
  assert.strictEqual(edge.top.title, '');
  edge.bottom.items = [{ label: 'Home', to: '/' }];
  edge.setTop({ title: 'Cart', bg: '#111' });
  edge.setBottom({ labels: 'never' });
  assert.strictEqual(edge.top.bg, '#111');
  assert.strictEqual(edge.bottom.labels, 'never');
  edge.reset();
  assert.strictEqual(edge.top.title, '');
  assert.strictEqual(edge.bottom.labels, 'always');
  assert.strictEqual(edge.bottom.items.length, 1, 'reset keeps the buttons');
  edge.hideBars();
  assert.strictEqual(edge.top.show, false);
  edge.showBars();
  assert.strictEqual(edge.bottom.show, true);
});

/* ---------------- icons and splash ---------------- */

function png(file, w, h) {
  const crc = (buf) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let x = 0xffffffff; for (const b of buf) x = t[(x ^ b) & 0xff] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0;
  const raw = Buffer.concat(Array.from({ length: h }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(w)])));
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

test('mobile:icons and mobile:splash check the picture and colours before running the tool', () => {
  const m = require('../bin/mobile.js');
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'android'));
  const big = path.join(dir, 'icon.png'); png(big, 1024, 1024);
  const small = path.join(dir, 'small.png'); png(small, 64, 32);
  const notPng = path.join(dir, 'x.png'); fs.writeFileSync(notPng, 'hello');
  assert.deepStrictEqual(m.pngSize(big), { width: 1024, height: 1024 });
  assert.strictEqual(m.pngSize(notPng), null);
  const ok = m.assetPlan('icons', [big, '--bg', '#ffffff'], dir);
  assert.deepStrictEqual(ok.names, ['icon-only.png', 'icon-foreground.png']);
  assert.deepStrictEqual(ok.warnings, []);
  assert.ok(ok.cli.includes('--android') && !ok.cli.includes('--ios'), 'only the platforms that exist');
  assert.deepStrictEqual(ok.cli.slice(ok.cli.indexOf('--iconBackgroundColor')), ['--iconBackgroundColor', '#ffffff']);
  const warn = m.assetPlan('icons', [small], dir);
  assert.strictEqual(warn.warnings.length, 2);
  const sp = m.assetPlan('splash', [big, '--bg', '#111827', '--dark-bg', '#000'], dir);
  assert.deepStrictEqual(sp.names, ['splash.png', 'splash-dark.png']);
  assert.ok(sp.cli.includes('--splashBackgroundColorDark'));
  assert.throws(() => m.assetPlan('icons', [notPng], dir), /must be a PNG/);
  assert.throws(() => m.assetPlan('icons', [path.join(dir, 'none.png')], dir), /does not exist/);
  assert.throws(() => m.assetPlan('icons', [big, '--bg', 'red'], dir), /Colours look like/);
  assert.throws(() => m.assetPlan('icons', [], dir), /Give the picture/);
});

/* ---------------- the animated splash screen ---------------- */

test('the animated splash: an element in index.html, styles in edge.css, a native API, and Capacitor waits for it', async () => {
  const dir = app(['--mobile', '--no-auth']);
  const f = path.join(dir, 'frontend');
  const html = read(f, 'index.html');
  assert.strictEqual((html.match(/id="edge-splash"/g) || []).length, 1);
  assert.match(html, /data-anim="pulse" data-web="false"/);
  assert.match(html, /<img class="edge-splash-logo" src="logo-mark\.svg"/);
  assert.ok(html.indexOf('id="edge-splash"') > html.indexOf('<div id="app"></div>'), 'a sibling of #app, so mounting the app does not remove it');
  const cfg = JSON.parse(read(dir, 'capacitor.config.json'));
  assert.strictEqual(cfg.plugins.SplashScreen.launchAutoHide, false, 'the native splash waits until the page says go');
  const css = read(f, 'edge.css');
  for (const a of ['pulse', 'zoom', 'rise']) assert.match(css, new RegExp('data-anim="' + a + '"'));
  assert.match(css, /prefers-reduced-motion[\s\S]*edge-splash/, 'less motion for people who ask for it');
  assert.match(css, /html\.platform-android \.edge-splash/, 'shown in the phone app only (a browser skips it)');
  // running the installer again changes nothing; a splash setting the person wrote stays
  assert.strictEqual(run(['mobile:ui'], dir).status, 0);
  assert.strictEqual((read(f, 'index.html').match(/id="edge-splash"/g) || []).length, 1);
  fs.writeFileSync(path.join(dir, 'capacitor.config.json'), JSON.stringify({ appId: 'a.b', appName: 'x', webDir: 'dist', plugins: { SplashScreen: { launchAutoHide: true } } }));
  run(['mobile:ui'], dir);
  assert.strictEqual(JSON.parse(read(dir, 'capacitor.config.json')).plugins.SplashScreen.launchAutoHide, true, 'never over the person\'s own setting');
  // the API, in a sandbox
  const { N } = sandbox();
  assert.strictEqual(N.splash.config.minTime, 900);
  N.splash.set({ minTime: 1500, anim: 'zoom' });
  assert.strictEqual(N.splash.config.minTime, 1500);
  await N.splash.hide();
  assert.strictEqual(await N.splash.hide(), undefined, 'hiding twice is fine');
});
