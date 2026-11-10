// The platforms the framework supports, and how it says so: Tauri detection in the page API, the Platforms chapter of the docs,
// the Platforms page of the website, and that TV is never presented as available.   Run: npm test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

function native(globals = {}) {
  const node = () => ({ setAttribute() { }, remove() { }, className: '', style: { setProperty() { } }, classList: { add() { }, remove() { }, toggle() { } }, appendChild() { }, addEventListener() { }, click() { } });
  const ctx = vm.createContext({
    console, setTimeout, clearTimeout, URL, Blob: class { }, Promise,
    Kreftjs: { store: () => { }, currentRouter: () => null },
    navigator: { userAgent: 'Mozilla/5.0 (Macintosh)', onLine: true, language: 'en' }, screen: { width: 1200, height: 800 }, devicePixelRatio: 2,
    localStorage: {}, addEventListener() { }, removeEventListener() { }, history: { length: 1, back() { } },
    document: { readyState: 'complete', baseURI: 'http://localhost/', documentElement: node(), body: node(), head: node(), createElement: node, querySelector: () => null, getElementById: () => null, addEventListener() { }, removeEventListener() { } },
    getComputedStyle: () => ({ paddingTop: '0px', paddingRight: '0px', paddingBottom: '0px', paddingLeft: '0px' }),
    requestAnimationFrame: (f) => f(),
    ...globals,
  });
  ctx.window = ctx;
  vm.runInContext(read('templates/mobile/kreftjs-native.js'), ctx);
  return ctx.Kreftjs.native;
}

test('the page API knows the platform: web, Electron and Tauri are told apart', () => {
  const web = native();
  assert.deepStrictEqual([web.platform(), web.isDesktop(), web.isWeb(), web.isNative()], ['web', false, true, false]);
  const electron = native({ kreftDesktop: {} });
  assert.deepStrictEqual([electron.platform(), electron.isDesktop(), electron.isNative()], ['electron', true, false]);
  for (const flag of ['__TAURI__', '__TAURI_INTERNALS__']) {
    const tauri = native({ [flag]: {} });
    assert.deepStrictEqual([tauri.platform(), tauri.isDesktop(), tauri.isWeb(), tauri.isNative()], ['tauri', true, false, false], flag);
  }
  assert.strictEqual(native({ Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' } }).platform(), 'ios');
});

test('Kreftjs.isTauri exists in both copies of the runtime and in the types', () => {
  for (const f of ['kreftjs.js', 'templates/app/frontend/kreftjs.js']) assert.match(read(f), /get isTauri\(\) \{\s*return Boolean\(typeof window !== 'undefined' && \(window\.__TAURI__ \|\| window\.__TAURI_INTERNALS__\)\)/, f);
  assert.strictEqual(read('kreftjs.js'), read('templates/app/frontend/kreftjs.js'), 'the two copies of the runtime are the same');
  assert.strictEqual(read('kreftjs.d.ts'), read('templates/app/frontend/kreftjs.d.ts'));
  assert.match(read('kreftjs.d.ts'), /readonly isTauri: boolean/);
  assert.match(read('kreftjs.d.ts'), /'android' \| 'ios' \| 'electron' \| 'tauri' \| 'web'/);
});

test('the docs have a Platforms chapter: every target, what is tested, and TV as coming soon', () => {
  const docs = read('docs/README.md');
  const chapter = docs.split('\n## One codebase. Every screen.\n')[1].split('\n## ')[0];
  for (const t of ['macOS (Electron)', 'Linux (Electron)', 'Windows (Electron)', 'macOS (Tauri)', 'Linux (Tauri)', 'Windows (Tauri)', '| iOS |', '| Android |', '| HarmonyOS |']) assert.ok(chapter.includes(t), t);
  assert.match(chapter, /### Which one do I choose\?/);
  assert.match(chapter, /### What each target needs/);
  assert.match(chapter, /### TV apps \(coming soon\)/);
  assert.match(chapter, /TV apps are \*\*planned and not available yet\*\*/);
  assert.match(chapter, /Not tested here/);
  assert.doesNotMatch(chapter, /kreft tv:/, 'no TV command is invented');
  const tv = chapter.split('### TV apps (coming soon)')[1].split('### ')[0];
  for (const t of ['Android TV', 'Apple tvOS', 'LG webOS', 'Samsung Tizen']) assert.ok(tv.includes(t), t);
  assert.match(docs, /\| \*\*Platforms\*\* \|.*TV apps are coming soon/);
  // the statuses are honest: only macOS desktop and Android are marked Tested
  const rows = chapter.split('\n').filter((l) => /^\| (macOS|Linux|Windows|iOS|Android|HarmonyOS)/.test(l));
  const tested = rows.filter((l) => /\| Tested \|$/.test(l)).map((l) => l.split('|')[1].trim());
  assert.deepStrictEqual(tested, ['macOS (Electron)', 'macOS (Tauri)', 'Android']);
});

test('the website has a Platforms page, linked from the bar and the menu, that shows TV as coming soon', () => {
  const page = read('demo/pages/Platforms.kreft');
  assert.match(read('demo/index.html'), /path: '\/platforms', component: 'pages\/Platforms\.kreft'/);
  assert.match(read('demo/components/SiteHeader.kreft'), /to="\/platforms">Platforms</);
  assert.match(read('demo/layouts/main.kreft'), /to: '\/platforms'/);
  for (const t of ['macOS', 'Linux', 'Windows', 'Electron', 'Tauri', 'iOS', 'Android', 'HarmonyOS', 'Android TV', 'Apple tvOS', 'LG webOS', 'Samsung Tizen']) assert.ok(page.includes(t), t);
  assert.match(page, /TV apps are not available yet/);
  assert.match(page, /Coming soon/);
  assert.doesNotMatch(page, /kreft tv:/);
  assert.match(page, /@media \(max-width: 760px\)/, 'it adapts to phones');
  // the start page shows the three groups and marks TV as coming soon
  const start = read('demo/pages/Start.kreft');
  assert.match(start, /group: 'TV'[^}]*status: 'Coming soon', tone: 'soon'/);
  assert.match(start, /group: 'Desktop'[^}]*items: \['macOS', 'Linux', 'Windows'\]/);
  assert.match(start, /group: 'Mobile'[^}]*items: \['iOS', 'Android', 'HarmonyOS'\]/);
});

test('the design system defines both colour schemes with the same variables', () => {
  const css = read('demo/ui.css');
  assert.match(css, /the "Horizon" design system/);
  const light = css.slice(css.indexOf(':root {'), css.indexOf('@media (prefers-color-scheme: dark)'));
  const dark = css.slice(css.indexOf(':root[data-theme="dark"]'), css.indexOf(':root[data-theme="light"]'));
  const vars = (block) => [...block.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((m) => m[1]);
  for (const v of ['--background', '--foreground', '--card', '--primary', '--primary-2', '--muted', '--border', '--warm', '--shadow-md', '--terminal-bg']) {
    assert.ok(vars(light).includes(v), 'light has ' + v);
    assert.ok(vars(dark).includes(v), 'dark has ' + v);
  }
  assert.doesNotMatch(css, /#4f46e5|#7c3aed/i, 'the old indigo and violet are gone');
});
