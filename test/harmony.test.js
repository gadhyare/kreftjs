// kreft harmony:init (and kreft new --harmony): the harmony/ project is written, nothing is overwritten, the site is copied.   Run: npm test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('harmony:init writes a HarmonyOS project and does not overwrite', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-harmony-'));
  const log = console.log;
  try {
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'demo-app', version: '1.2.3-beta' }));
    console.log = () => { };
    const h = require(path.join(__dirname, '..', 'bin/harmony.js'));
    h.init(tmp);
    console.log = log;

    const h5 = (f) => fs.readFileSync(path.join(tmp, 'harmony', f), 'utf8');
    const app = JSON.parse(h5('AppScope/app.json5'));
    assert.strictEqual(app.app.bundleName, 'com.kreftjs.demoapp');
    assert.strictEqual(app.app.versionName, '1.2.3');
    assert.match(h5('entry/src/main/ets/pages/Index.ets'), /\$rawfile\('index\.html'\)/);
    assert.match(h5('entry/src/main/module.json5'), /ohos\.permission\.INTERNET/);
    for (const f of ['build-profile.json5', 'hvigorfile.ts', 'entry/hvigorfile.ts', 'entry/src/main/ets/entryability/EntryAbility.ets', 'entry/src/main/resources/base/profile/main_pages.json', 'AppScope/resources/base/media/app_icon.png']) {
      assert.ok(fs.existsSync(path.join(tmp, 'harmony', f)), f);
    }
    JSON.parse(h5('build-profile.json5')); // every .json5 written here is also valid JSON
    assert.match(h5('.gitignore'), /^\/entry\/src\/main\/resources\/rawfile\/$/m);
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
    assert.strictEqual(pkg.scripts['harmony:build'], 'kreft harmony:build');

    fs.writeFileSync(path.join(tmp, 'harmony', 'entry/src/main/ets/pages/Index.ets'), '// mine');
    console.log = () => { };
    h.init(tmp);
    console.log = log;
    assert.strictEqual(h5('entry/src/main/ets/pages/Index.ets'), '// mine');
  } finally {
    console.log = log;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('harmony:init puts the router in hash mode inside the app only, once, and respects a mode already chosen', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-harmony-'));
  const log = console.log;
  try {
    fs.mkdirSync(path.join(tmp, 'frontend'));
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'demo-app' }));
    const file = path.join(tmp, 'frontend', 'index.html');
    fs.writeFileSync(file, "<script>\n    const router = Kreftjs.router({\n      routes: ['routes/web.kreft'],\n    })\n</script>\n");
    const h = require(path.join(__dirname, '..', 'bin/harmony.js'));
    console.log = () => { };
    h.init(tmp);
    h.init(tmp);
    console.log = log;
    const html = fs.readFileSync(file, 'utf8');
    assert.strictEqual(html.match(/mode:/g).length, 1, 'added once');
    assert.match(html, /https\?:\$\/\.test\(location\.protocol\) \? 'history' : 'hash'/);
    assert.match(html, /routes: \['routes\/web\.kreft'\]/);

    const own = "Kreftjs.router({ mode: 'history', routes: [] })";
    fs.writeFileSync(file, own);
    console.log = () => { };
    h.init(tmp);
    console.log = log;
    assert.strictEqual(fs.readFileSync(file, 'utf8'), own);
  } finally {
    console.log = log;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('the kreft command knows the harmony commands', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'bin/kreftjs.js'), 'utf8');
  for (const c of ['harmony:init', 'harmony:build', 'harmony:open', 'make:harmony', '--harmony']) assert.ok(src.includes(c), c);
});
