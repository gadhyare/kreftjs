// config/electron.config.js and config/tauri.config.js: defaults, precedence, validation, kreft add, and the files made from them.
// Nothing here starts Electron or Rust (test/desktop-runtime.test.js does, with KREFT_TEST_DESKTOP=1).   Run: npm test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const bin = (f) => require(path.join(__dirname, '..', 'bin', f));
const cfg = bin('desktop/config.js');
const schema = bin('desktop/schema.js');
const adapterE = bin('desktop/electron-adapter.js');
const adapterT = bin('desktop/tauri-adapter.js');
const { addRuntimes } = bin('desktop/add.js');

function project(extra = {}, { esm = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-desktop-'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'demo-app', version: '1.2.3', ...(esm ? { type: 'module' } : {}), ...extra }));
  return dir;
}
const cleanup = (dir) => fs.rmSync(dir, { recursive: true, force: true });
const quiet = async (fn) => { const log = console.log, warn = console.warn; console.log = () => { }; console.warn = () => { }; try { return await fn(); } finally { console.log = log; console.warn = warn; } };
const write = (dir, rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
const rejects = async (promise, re) => { try { await promise; } catch (e) { assert.match(e.message, re); return e; } assert.fail('expected an error matching ' + re); };

// ---- defaults -----------------------------------------------------------------------------------------------------------

for (const rt of ['electron', 'tauri']) {
  test(`${rt}: the defaults hide the menu, keep DevTools closed at start, and turn them off in production`, async () => {
    const dir = project();
    try {
      const { config: c } = await cfg.resolve(rt, dir, { env: {} });
      assert.strictEqual(c.menu.visibility, 'hidden');
      assert.deepStrictEqual([c.devtools.development, c.devtools.production, c.devtools.openOnStart], [true, false, false]);
      assert.strictEqual(c.window.width, 1200);
      assert.strictEqual(c.window.height, 800);
      assert.strictEqual(c.window.minWidth, 800);
      assert.strictEqual(c.app.name, 'Demo App', 'the name comes from package.json');
      assert.strictEqual(c.app.id, 'com.kreftjs.demoapp');
      assert.strictEqual(c.app.version, '1.2.3');
      assert.strictEqual(c.window.title, 'Demo App');
      assert.strictEqual(c.contextMenu.enabled, true);
      assert.strictEqual(c.tray.enabled, false);
      assert.strictEqual(c.updates.enabled, false);
    } finally { cleanup(dir); }
  });
}

test('electron: the security defaults are the safe ones', async () => {
  const dir = project();
  try {
    const { config: c, warnings } = await cfg.resolve('electron', dir, { env: {} });
    assert.deepStrictEqual(
      [c.security.contextIsolation, c.security.sandbox, c.security.nodeIntegration, c.security.webSecurity, c.security.allowRunningInsecureContent, c.security.blockNewWindows],
      [true, true, false, true, false, true]);
    assert.deepStrictEqual(c.security.permissions, []);
    assert.deepStrictEqual(warnings, [], 'the defaults raise no warnings');
  } finally { cleanup(dir); }
});

test('the two runtimes get their own options: Electron has sandbox, Tauri has capabilities', () => {
  const e = schema.defaultOf(schema.SCHEMA, 'electron'), t = schema.defaultOf(schema.SCHEMA, 'tauri');
  assert.ok('sandbox' in e.security && !('sandbox' in t.security));
  assert.ok('capabilities' in t.security && !('capabilities' in e.security));
  assert.ok('electron' in e.packaging && !('tauri' in e.packaging));
  assert.strictEqual(e.devtools.mode, 'right');
  assert.strictEqual(t.devtools.mode, 'detach');
});

// ---- the config file: CommonJS and ESM -------------------------------------------------------------------------------------

for (const esm of [false, true]) {
  for (const rt of ['electron', 'tauri']) {
    test(`${rt}: the file kreft writes is valid, equals the defaults, and loads in a ${esm ? 'ESM' : 'CommonJS'} project`, async () => {
      const dir = project({}, { esm });
      try {
        const r = await cfg.ensureConfigFile(dir, rt);
        assert.strictEqual(r.state, 'created');
        const text = fs.readFileSync(r.file, 'utf8');
        assert.match(text, esm ? /export default \{/ : /module\.exports = \{/);
        assert.match(text, new RegExp(`import\\('kreftjs/desktop'\\)\\.${rt === 'electron' ? 'ElectronConfig' : 'TauriConfig'}`), 'editor autocomplete through JSDoc');
        const { config } = await cfg.resolve(rt, dir, { env: {} });
        const plain = (c) => { const x = JSON.parse(JSON.stringify(c)); for (const k of ['name', 'id', 'version', 'description', 'author', 'homepage', 'copyright']) delete x.app[k]; delete x.window.title; delete x.tray.tooltip; return x; };
        const defaults = cfg.derive(schema.defaultOf(schema.SCHEMA, rt), cfg.readPackage(dir));
        assert.deepStrictEqual(plain(config), plain(defaults), 'the template shows every option with its default');
      } finally { cleanup(dir); }
    });
  }
}

test('a config file may export a function, which receives the mode and the platform', async () => {
  const dir = project();
  try {
    write(dir, 'config/electron.config.js', "module.exports = ({ mode, runtime }) => ({ window: { title: mode + '-' + runtime } })");
    assert.strictEqual((await cfg.resolve('electron', dir, { env: {}, mode: 'production' })).config.window.title, 'production-electron');
    write(dir, 'config/tauri.config.js', "module.exports = async () => ({ window: { width: 1111 } })");
    assert.strictEqual((await cfg.resolve('tauri', dir, { env: {} })).config.window.width, 1111);
  } finally { cleanup(dir); }
});

test('a CommonJS file in an ESM project (and the other way round) gives a message that says what to change', async () => {
  const esm = project({}, { esm: true }), cjs = project();
  try {
    write(esm, 'config/electron.config.js', 'module.exports = { window: { width: 900 } }');
    await rejects(cfg.resolve('electron', esm, { env: {} }), /export default|\.cjs/);
    write(cjs, 'config/electron.config.js', 'export default { window: { width: 900 } }');
    // Node 22.12+ loads ESM syntax from a CommonJS project by itself; older Node says what to change
    try { assert.strictEqual((await cfg.resolve('electron', cjs, { env: {} })).config.window.width, 900); } catch (e) { assert.match(e.message, /module\.exports|\.mjs/); }
    write(cjs, 'config/electron.config.js', 'module.exports = 42');
    await rejects(cfg.resolve('electron', cjs, { env: {} }), /must export an object/);
  } finally { cleanup(esm); cleanup(cjs); }
});

// ---- precedence ---------------------------------------------------------------------------------------------------------------

test('precedence: defaults < kreftjs.config.json < shared env < file < runtime env < command line', async () => {
  const dir = project();
  try {
    write(dir, 'kreftjs.config.json', JSON.stringify({ desktop: { window: { width: 900, height: 700, minWidth: 500, minHeight: 300 } } }));
    write(dir, 'config/tauri.config.js', 'module.exports = { window: { height: 650, minHeight: 310 } }');
    const run = (env, args) => cfg.resolve('tauri', dir, { env, args }).then((r) => r.config.window);
    assert.deepStrictEqual(await run({}, []), { ...(await run({}, [])), width: 900, height: 650, minWidth: 500, minHeight: 310 }, 'the file beats the shared file');
    let w = await run({ KREFT_DESKTOP_WINDOW_HEIGHT: '600' }, []);
    assert.strictEqual(w.height, 650, 'but a shared environment value is below the file');
    w = await run({ KREFT_TAURI_WINDOW_HEIGHT: '640' }, []);
    assert.strictEqual(w.height, 640, 'the runtime environment beats the file');
    w = await run({ KREFT_TAURI_WINDOW_HEIGHT: '640' }, ['--set', 'window.height=620']);
    assert.strictEqual(w.height, 620, 'the command line beats everything');
    assert.strictEqual(w.width, 900, 'what nobody changed comes from the layer below');
  } finally { cleanup(dir); }
});

test('the older ELECTRON_MENU and ELECTRON_DEVTOOLS variables still work, and the short flags map to the settings', async () => {
  const dir = project();
  try {
    const r = (env, args) => cfg.resolve('electron', dir, { env, args }).then((x) => x.config);
    assert.strictEqual((await r({ ELECTRON_MENU: 'show' }, [])).menu.visibility, 'visible');
    assert.strictEqual((await r({ ELECTRON_MENU: 'hide' }, [])).menu.visibility, 'hidden');
    assert.strictEqual((await r({ ELECTRON_MENU: 'auto' }, [])).menu.visibility, 'auto');
    const d = (await r({ ELECTRON_DEVTOOLS: 'bottom' }, [])).devtools;
    assert.deepStrictEqual([d.openOnStart, d.mode], [true, 'bottom']);
    assert.strictEqual((await r({ ELECTRON_DEVTOOLS: 'false' }, [])).devtools.openOnStart, false);
    assert.strictEqual((await r({}, ['--devtools'])).devtools.openOnStart, true);
    assert.strictEqual((await r({}, ['--devtools=left'])).devtools.mode, 'left');
    assert.strictEqual((await r({ ELECTRON_DEVTOOLS: 'true' }, ['--no-devtools'])).devtools.openOnStart, false, 'the command line wins over the environment');
    assert.strictEqual((await r({}, ['--menu=visible'])).menu.visibility, 'visible');
    const passed = await cfg.resolve('electron', dir, { env: {}, args: ['--port', '9000', '--mac', '--set', 'window.width=1000'] });
    assert.deepStrictEqual(passed.rest, ['--port', '9000', '--mac'], 'flags that are not settings go on to the dev server and electron-builder');
  } finally { cleanup(dir); }
});

test('every setting has its own environment variable name, and the names do not collide', () => {
  for (const rt of ['electron', 'tauri']) {
    const names = schema.leaves().map(([p]) => schema.envName(rt, p));
    assert.strictEqual(new Set(names).size, names.length);
  }
  assert.strictEqual(schema.envName('electron', ['window', 'minWidth']), 'KREFT_ELECTRON_WINDOW_MIN_WIDTH');
  assert.strictEqual(schema.envName('tauri', ['devtools', 'openOnStart']), 'KREFT_TAURI_DEVTOOLS_OPEN_ON_START');
});

// ---- validation ---------------------------------------------------------------------------------------------------------------

test('unknown options are rejected with a suggestion and the list of valid ones', async () => {
  const dir = project();
  try {
    write(dir, 'config/electron.config.js', 'module.exports = { windw: { widht: 5 }, window: { widht: 5 } }');
    const e = await rejects(cfg.resolve('electron', dir, { env: {} }), /unknown option/);
    assert.match(e.message, /Did you mean "window"\?/);
    assert.match(e.message, /Did you mean "width"\?/);
    assert.match(e.message, /config\/electron\.config\.js/, 'it says where the mistake is');
  } finally { cleanup(dir); }
});

test('wrong types, ranges and values are rejected with what is expected', async () => {
  const dir = project();
  try {
    write(dir, 'config/electron.config.js', `module.exports = { window: { width: '1000', height: 10, backgroundColor: 'red' }, menu: { visibility: 'hiden' }, devtools: { openOnStart: 'yes' }, security: { permissions: 'geolocation' } }`);
    const e = await rejects(cfg.resolve('electron', dir, { env: {} }), /problems/);
    for (const re of [/window\.width: expected a number/, /window\.height: must be at least 150/, /window\.backgroundColor/, /Did you mean "hidden"\?/, /devtools\.openOnStart: expected true or false/, /security\.permissions: expected a list/]) assert.match(e.message, re);
    assert.ok(e.errors.length >= 5, 'all the problems are reported together, not one at a time');
  } finally { cleanup(dir); }
});

test('an option the runtime does not have is rejected in its own file, with where it belongs', async () => {
  const dir = project();
  try {
    write(dir, 'config/tauri.config.js', "module.exports = { security: { sandbox: true }, menu: { visibility: 'auto' }, devtools: { development: false, mode: 'right' }, contextMenu: { items: ['copy'] }, packaging: { electron: { mac: ['dmg'] } } }");
    const e = await rejects(cfg.resolve('tauri', dir, { env: {} }), /not supported by Tauri/);
    assert.match(e.message, /security\.sandbox: is not supported by Tauri/);
    assert.match(e.message, /menu\.visibility: "auto" is not allowed in tauri \(that value is for Electron\)/);
    assert.match(e.message, /devtools\.development: Tauri debug builds always contain DevTools/);
    assert.match(e.message, /devtools\.mode: "right" is not allowed.*Use one of: detach/);
    assert.match(e.message, /contextMenu\.items: is not supported by Tauri/);
    assert.match(e.message, /packaging\.electron: is not supported by Tauri.*packaging\.tauri/);
    write(dir, 'config/electron.config.js', "module.exports = { security: { capabilities: ['dialog:default'] }, advanced: { tauriConf: {} }, updates: { pubkey: 'x' } }");
    await rejects(cfg.resolve('electron', dir, { env: {} }), /security\.capabilities: is not supported by Electron/);
  } finally { cleanup(dir); }
});

test('the shared file serves both runtimes: an option one runtime lacks is ignored there, with a warning', async () => {
  const dir = project();
  try {
    write(dir, 'kreftjs.config.json', JSON.stringify({ desktop: { security: { sandbox: false }, menu: { visibility: 'auto' }, window: { width: 950 } } }));
    const t = await cfg.resolve('tauri', dir, { env: {} });
    assert.strictEqual(t.config.window.width, 950);
    assert.strictEqual(t.config.menu.visibility, 'hidden', 'auto is not a Tauri value, so it is ignored');
    assert.ok(t.warnings.some((w) => w.path === 'security.sandbox' && /ignored/.test(w.message)));
    const e = await cfg.resolve('electron', dir, { env: {} });
    assert.strictEqual(e.config.security.sandbox, false, 'but Electron uses it');
    assert.strictEqual(e.config.menu.visibility, 'auto');
    assert.ok(e.warnings.some((w) => w.path === 'security.sandbox' && /sandbox is off|is off/.test(w.message)), 'and warns that it is unsafe');
    write(dir, 'kreftjs.config.json', JSON.stringify({ desktop: { windw: {} } }));
    await rejects(cfg.resolve('tauri', dir, { env: {} }), /unknown option/);
  } finally { cleanup(dir); }
});

test('bad values from the environment or the command line name the variable or flag', async () => {
  const dir = project();
  try {
    const e = await rejects(cfg.resolve('electron', dir, { env: { KREFT_ELECTRON_WINDOW_WIDTH: 'abc', ELECTRON_MENU: 'sometimes' }, args: ['--set', 'window.widht=3', '--set', 'oops'] }), /problems/);
    assert.match(e.message, /environment variable KREFT_ELECTRON_WINDOW_WIDTH/);
    assert.match(e.message, /environment variable ELECTRON_MENU/);
    assert.match(e.message, /command line \(--set window\.widht=3\)/);
    assert.match(e.message, /expected --set group\.option=value/);
  } finally { cleanup(dir); }
});

test('rules that involve several options: sizes, menu ids, tray, updates', async () => {
  const dir = project();
  const set = async (rt, obj) => { write(dir, `config/${rt}.config.js`, 'module.exports = ' + JSON.stringify(obj)); return cfg.resolve(rt, dir, { env: {} }); };
  try {
    await rejects(set('electron', { window: { width: 500, minWidth: 600 } }), /window\.minWidth: is 600, larger than window\.width/);
    await rejects(set('electron', { window: { x: 5 } }), /x and y go together/);
    await rejects(set('electron', { menu: { visibility: 'visible', template: [{ label: 'File', submenu: [{ label: 'New' }] }] } }), /needs an id/);
    await rejects(set('electron', { menu: { template: [{ label: 'A', id: 'x' }, { label: 'B', id: 'x' }] } }), /used twice/);
    await rejects(set('electron', { tray: { enabled: true, closeToTray: true, menu: [{ label: 'Show', action: 'show' }] } }), /needs an entry with action "quit"/);
    await rejects(set('electron', { tray: { enabled: true, menu: [{ label: 'Sync', action: 'emit' }] } }), /needs an id/);
    await rejects(set('electron', { updates: { enabled: true } }), /updates\.url/);
    await rejects(set('tauri', { updates: { enabled: true, url: 'https://x.test/u.json' } }), /updates\.pubkey/);
    await rejects(set('tauri', { updates: { enabled: true, url: 'http://x.test/u.json', pubkey: 'k' } }), /must start with https/);
    await rejects(set('tauri', { menu: { template: [{ label: 'X', submenu: [{ role: 'reload' }] }] } }), /"reload" is not allowed in tauri/);
    const ok = await set('electron', { menu: { visibility: 'visible', template: [{ label: 'File', submenu: [{ label: 'New', id: 'file-new', accelerator: 'CmdOrCtrl+N' }, { type: 'separator' }, { role: 'quit' }] }] } });
    assert.strictEqual(ok.config.menu.template[0].submenu[0].id, 'file-new');
    const warn = await set('electron', { security: { nodeIntegration: true, sandbox: false, contextIsolation: false }, devtools: { production: true } });
    assert.ok(['security.nodeIntegration', 'security.sandbox', 'security.contextIsolation', 'devtools.production'].every((p) => warn.warnings.some((w) => w.path === p)), 'unsafe settings are allowed but each one warns');
  } finally { cleanup(dir); }
});

// ---- kreft add ---------------------------------------------------------------------------------------------------------------

test('kreft add electron tauri: both runtimes in one project, each with its own file, folder and scripts', async () => {
  const dir = project();
  try {
    await quiet(() => addRuntimes(['electron', 'tauri'], { dir, install: false }));
    for (const f of ['config/electron.config.js', 'config/tauri.config.js', 'electron/main.js', 'electron/preload.js', 'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml', 'src-tauri/src/main.rs', 'src-tauri/src/kreft_generated.rs', 'src-tauri/capabilities/default.json', 'build/icon.png']) {
      assert.ok(fs.existsSync(path.join(dir, f)), f);
    }
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    assert.strictEqual(pkg.scripts['electron:dev'], 'kreft electron:dev');
    assert.strictEqual(pkg.scripts['tauri:dev'], 'kreft tauri:dev');
    assert.ok(pkg.devDependencies.electron && pkg.devDependencies['@tauri-apps/cli']);
    assert.strictEqual(pkg.main, 'electron/main.js');
    // changing one does not touch the other
    write(dir, 'config/tauri.config.js', 'module.exports = { window: { width: 900 } }');
    assert.strictEqual((await cfg.resolve('electron', dir, { env: {} })).config.window.width, 1200);
    assert.strictEqual((await cfg.resolve('tauri', dir, { env: {} })).config.window.width, 900);
  } finally { cleanup(dir); }
});

test('an existing config file is never replaced without a yes', async () => {
  const dir = project();
  try {
    await quiet(() => addRuntimes(['electron'], { dir, install: false }));
    const file = path.join(dir, 'config', 'electron.config.js');
    fs.appendFileSync(file, '\n// mine\n');
    const mine = fs.readFileSync(file, 'utf8');

    await quiet(() => addRuntimes(['electron'], { dir, install: false }));
    assert.strictEqual(fs.readFileSync(file, 'utf8'), mine, 'not on a terminal and no --force: kept');

    let asked = null;
    await quiet(() => addRuntimes(['electron'], { dir, install: false, confirm: async (q) => { asked = q; return false; } }));
    assert.match(asked, /already exists.*Replace it.*\[y\/N\]/s, 'on a terminal it asks');
    assert.strictEqual(fs.readFileSync(file, 'utf8'), mine, 'a no keeps it');

    await quiet(() => addRuntimes(['electron'], { dir, install: false, confirm: async () => true }));
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /\/\/ mine/, 'a yes replaces it');
    assert.strictEqual(fs.readFileSync(file + '.bak', 'utf8'), mine, 'and the old file is saved');

    fs.appendFileSync(file, '\n// again\n');
    await quiet(() => addRuntimes(['electron'], { dir, install: false, force: true }));
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /\/\/ again/, '--force replaces it');
    assert.match(fs.readFileSync(file + '.bak', 'utf8'), /\/\/ again/);
  } finally { cleanup(dir); }
});

test('kreft add electron is wired into the add command and its help', () => {
  const add = fs.readFileSync(path.join(__dirname, '..', 'bin', 'add.js'), 'utf8');
  assert.match(add, /\['electron', 'tauri'\]\.filter/);
  assert.match(add, /kreft add electron tauri/);
  assert.match(add, /--no-install/);
});

// ---- what is made from the settings: Electron ------------------------------------------------------------------------------------

test('electron: the resolved file and the electron-builder configuration are made from the settings', async () => {
  const dir = project({ description: 'Notes', author: { name: 'Ada', email: 'ada@acme.test' } });
  try {
    write(dir, 'config/electron.config.js', `module.exports = {
      app: { id: 'com.acme.notes', name: 'Acme Notes' },
      packaging: { category: 'Office', electron: { mac: ['dmg'], win: ['nsis'], linux: ['deb'], extraResources: ['assets'] } },
      updates: { enabled: true, url: 'https://updates.acme.test/notes', channel: 'beta' },
      tray: { enabled: true, icon: 'build/tray.png' },
      advanced: { builder: { mac: { hardenedRuntime: true }, compression: 'maximum' } } }`);
    const { config } = await cfg.resolve('electron', dir, { env: {} });
    adapterE.writeRuntimeFiles(dir, config);
    const resolved = JSON.parse(fs.readFileSync(path.join(dir, 'electron', 'kreft.resolved.json'), 'utf8'));
    assert.deepStrictEqual(resolved.advanced, {}, 'advanced.builder is for electron-builder only');
    assert.strictEqual(resolved.menu.visibility, 'hidden');
    const b = JSON.parse(fs.readFileSync(path.join(dir, 'electron', 'builder.config.json'), 'utf8'));
    assert.strictEqual(b.appId, 'com.acme.notes');
    assert.strictEqual(b.productName, 'Acme Notes');
    assert.deepStrictEqual(b.mac.target, ['dmg']);
    assert.strictEqual(b.mac.hardenedRuntime, true, 'advanced.builder is merged in');
    assert.strictEqual(b.compression, 'maximum', 'and wins');
    assert.strictEqual(b.linux.category, 'Office');
    assert.match(b.linux.maintainer, /Ada <ada@acme\.test>/);
    assert.deepStrictEqual(b.publish, [{ provider: 'generic', url: 'https://updates.acme.test/notes', channel: 'beta' }]);
    assert.ok(b.files.includes('build/tray.png') && b.files.includes('electron/kreft.resolved.json') && b.files.includes('build/icon.png'));
    assert.deepStrictEqual(b.extraResources, ['assets']);
    assert.strictEqual(b.extraMetadata.main, 'electron/main.js');
  } finally { cleanup(dir); }
});

test('electron: main.js is a bootstrap that carries no settings and reads the resolved file', () => {
  const main = adapterE.TEMPLATES.main();
  assert.match(main, /kreft-template: electron-main@1/);
  assert.match(main, /kreft\.resolved\.json/);
  assert.doesNotMatch(main, /width: 1200|height: 800/, 'no setting is written into the bootstrap');
  for (const need of ['contextIsolation: sec.contextIsolation', 'sandbox: sec.sandbox', 'nodeIntegration: sec.nodeIntegration', 'webSecurity: sec.webSecurity', 'devTools: devtoolsAllowed', "'devtools-opened'", 'setPermissionRequestHandler']) assert.ok(main.includes(need), need);
  assert.match(adapterE.TEMPLATES.preload(), /__KREFT_ELECTRON__/);
  assert.doesNotMatch(adapterE.TEMPLATES.preload(), /ipcRenderer\.send\(|require\('fs'\)/, 'the preload exposes named functions only');
});

test('electron: an older hand-written main.js is saved as .bak and replaced; the generated one is brought up to date silently', async () => {
  const dir = project();
  try {
    write(dir, 'electron/main.js', "// my own main.js\nrequire('electron')");
    const notes = adapterE.writeBootstrap(dir);
    assert.match(notes[0], /older Kreft.*main\.js\.bak/s);
    assert.strictEqual(fs.readFileSync(path.join(dir, 'electron', 'main.js.bak'), 'utf8'), "// my own main.js\nrequire('electron')");
    assert.deepStrictEqual(adapterE.writeBootstrap(dir), [], 'a second run says nothing');
    fs.writeFileSync(path.join(dir, 'electron', 'main.js'), '// kreft-template: electron-main@0\nold');
    assert.deepStrictEqual(adapterE.writeBootstrap(dir), []);
    assert.match(fs.readFileSync(path.join(dir, 'electron', 'main.js'), 'utf8'), /electron-main@1/);
  } finally { cleanup(dir); }
});

// ---- what is made from the settings: Tauri ---------------------------------------------------------------------------------------

const tauriFiles = async (obj) => {
  const dir = project({ description: 'Notes' });
  write(dir, 'config/tauri.config.js', 'module.exports = ' + JSON.stringify(obj || {}));
  write(dir, 'build/tray.png', 'png');
  const { config } = await cfg.resolve('tauri', dir, { env: {} });
  const notes = adapterT.sync(dir, config);
  const read = (f) => fs.readFileSync(path.join(dir, 'src-tauri', f), 'utf8');
  return { dir, config, notes, conf: JSON.parse(read('tauri.conf.json')), caps: JSON.parse(read('capabilities/default.json')), rs: read('src/kreft_generated.rs'), cargo: read('Cargo.toml'), main: read('src/main.rs') };
};

test('tauri: the defaults make a valid Tauri 2 configuration with no tray, no plugins and no DevTools in release', async () => {
  const t = await tauriFiles();
  try {
    assert.strictEqual(t.conf.$schema, 'https://schema.tauri.app/config/2');
    assert.strictEqual(t.conf.identifier, 'com.kreftjs.demoapp');
    const w = t.conf.app.windows[0];
    assert.deepStrictEqual([w.label, w.create, w.width, w.height, w.minWidth, w.minHeight, w.resizable, w.decorations, w.center], ['main', false, 1200, 800, 800, 600, true, true, true]);
    assert.strictEqual(t.conf.app.security.csp, null);
    assert.strictEqual(t.conf.bundle.targets, 'all');
    assert.deepStrictEqual(t.caps.permissions, ['core:default']);
    assert.strictEqual(t.caps.windows[0], 'main');
    assert.match(t.cargo, /tauri = \{ version = "2", features = \[\] \}/, 'no devtools feature: a release build has no DevTools');
    assert.doesNotMatch(t.cargo, /plugin/);
    assert.match(t.rs, /Menu::new\(h\)/, 'no menu on Windows and Linux');
    assert.match(t.rs, /hide_menu/);
    assert.match(t.rs, /#\[cfg\(not\(debug_assertions\)\)\]\nfn toggle_devtools\(_w: &tauri::WebviewWindow\) \{\}/, 'DevTools do nothing in a release build');
    assert.doesNotMatch(t.rs, /open_devtools\(&window\);/, 'closed at start');
    assert.doesNotMatch(t.rs, /TrayIconBuilder::with_id/);
    assert.match(t.rs, /\/\/ Generated by .*DO NOT EDIT/s);
    assert.match(t.main, /kreft_generated::apply\(tauri::Builder::default\(\)\)/);
  } finally { cleanup(t.dir); }
});

test('tauri: every group turns into the right configuration, permission, feature and Rust', async () => {
  const t = await tauriFiles({
    window: { title: 'T', width: 900, height: 600, maxWidth: 1400, x: 10, y: 20, frame: false, theme: 'dark', alwaysOnTop: true, maximized: true },
    menu: { visibility: 'visible', template: [{ label: 'File', submenu: [{ label: 'New', id: 'file-new', accelerator: 'CmdOrCtrl+N' }, { type: 'separator' }, { role: 'quit' }] }] },
    contextMenu: { enabled: false },
    devtools: { production: true, openOnStart: true },
    webview: { zoomFactor: 1.5, userAgent: 'Agent/1' },
    security: { csp: "default-src 'self'", capabilities: ['dialog:default'], globalTauri: false },
    tray: { enabled: true, icon: 'build/tray.png', closeToTray: true, clickAction: 'show', menu: [{ label: 'Show', action: 'show' }, { label: 'Sync', action: 'emit', id: 'sync' }, { type: 'separator' }, { label: 'Quit', action: 'quit' }] },
    notifications: { enabled: true },
    updates: { enabled: true, url: 'https://u.test/{{target}}/{{current_version}}', pubkey: 'KEY' },
    packaging: { category: 'Productivity', tauri: { targets: ['dmg', 'nsis'], resources: ['data'], macMinimumSystemVersion: '12.0' } },
    advanced: { tauriConf: { app: { macOSPrivateApi: true }, bundle: { longDescription: 'Long' } } },
  });
  try {
    const w = t.conf.app.windows[0];
    assert.deepStrictEqual([w.maxWidth, w.x, w.y, w.decorations, w.theme, w.alwaysOnTop, w.maximized, w.userAgent], [1400, 10, 20, false, 'Dark', true, true, 'Agent/1']);
    assert.strictEqual(w.center, undefined, 'x and y given: not centered');
    assert.deepStrictEqual([t.conf.app.security.csp, t.conf.app.withGlobalTauri], ["default-src 'self'", false]);
    assert.deepStrictEqual(t.conf.bundle.targets, ['dmg', 'nsis']);
    assert.deepStrictEqual([t.conf.bundle.category, t.conf.bundle.resources, t.conf.bundle.macOS.minimumSystemVersion, t.conf.bundle.createUpdaterArtifacts], ['Productivity', ['data'], '12.0', true]);
    assert.deepStrictEqual(t.conf.plugins.updater, { pubkey: 'KEY', endpoints: ['https://u.test/{{target}}/{{current_version}}'] });
    assert.strictEqual(t.conf.app.macOSPrivateApi, true, 'advanced.tauriConf is merged in');
    assert.strictEqual(t.conf.bundle.longDescription, 'Long');
    assert.deepStrictEqual(t.caps.permissions, ['core:default', 'notification:default', 'updater:default', 'dialog:default']);
    assert.match(t.cargo, /features = \["tray-icon", "image-png", "devtools"\]/);
    assert.match(t.cargo, /tauri-plugin-notification = "2"/);
    assert.match(t.cargo, /tauri-plugin-updater = "2"/);
    assert.match(t.rs, /MenuItem::with_id\(h, "file-new", "New", true, Some\("CmdOrCtrl\+N"\)\)/);
    assert.match(t.rs, /PredefinedMenuItem::quit\(h, None\)/);
    assert.match(t.rs, /Submenu::with_items\(h, "File"/);
    assert.match(t.rs, /contextmenu/, 'the right-click menu is switched off by a script');
    assert.match(t.rs, /open_devtools\(&window\);/);
    assert.doesNotMatch(t.rs, /#\[cfg\(not\(debug_assertions\)\)\]\nfn toggle_devtools/, 'production DevTools are on');
    assert.match(t.rs, /set_zoom\(1\.5_f64\)/);
    assert.match(t.rs, /TrayIconBuilder::with_id\("kreft-tray"\)/);
    assert.match(t.rs, /"kreft:tray", "sync"/);
    assert.match(t.rs, /prevent_close/);
    assert.match(t.rs, /tauri_plugin_notification::init\(\)/);
    assert.match(t.rs, /tauri_plugin_updater::Builder::new\(\)/);
    assert.ok(fs.existsSync(path.join(t.dir, 'src-tauri', 'icons', 'kreft-tray.png')), 'the tray icon is copied next to the Rust code');
  } finally { cleanup(t.dir); }
});

test('tauri: sync writes the same files twice, keeps a Cargo.toml you extended, and never touches your main.rs', async () => {
  const t = await tauriFiles();
  try {
    const cargo = path.join(t.dir, 'src-tauri', 'Cargo.toml');
    fs.writeFileSync(cargo, fs.readFileSync(cargo, 'utf8').replace('[dependencies]', '[dependencies]\nrand = "0.8"'));
    const main = path.join(t.dir, 'src-tauri', 'src', 'main.rs');
    fs.writeFileSync(main, 'mod kreft_generated;\n// my code\nfn main() {}\n');
    write(t.dir, 'config/tauri.config.js', "module.exports = { notifications: { enabled: true } }");
    const { config } = await cfg.resolve('tauri', t.dir, { env: {} });
    assert.deepStrictEqual(adapterT.sync(t.dir, config), []);
    assert.match(fs.readFileSync(cargo, 'utf8'), /rand = "0\.8"/, 'your dependency stays');
    assert.match(fs.readFileSync(cargo, 'utf8'), /tauri-plugin-notification/, 'and the generated block follows the settings');
    assert.match(fs.readFileSync(main, 'utf8'), /\/\/ my code/);
    fs.writeFileSync(main, 'fn main() {}\n');
    assert.match(adapterT.sync(t.dir, config)[0], /does not call kreft_generated::apply/, 'a main.rs that ignores the settings is reported, not overwritten');
    assert.strictEqual(fs.readFileSync(main, 'utf8'), 'fn main() {}\n');
  } finally { cleanup(t.dir); }
});

test('tauri: a project from an earlier Kreft (old Cargo.toml and main.rs) is moved over', async () => {
  const dir = project();
  try {
    write(dir, 'src-tauri/Cargo.toml', '[package]\nname = "demo-app"\nversion = "0.1.0"\nedition = "2021"\n\n[build-dependencies]\ntauri-build = { version = "2", features = [] }\n\n[dependencies]\ntauri = { version = "2", features = [] }\nserde = { version = "1", features = ["derive"] }\nserde_json = "1"\n');
    write(dir, 'src-tauri/src/main.rs', '// Hides the extra console window on Windows in release builds.\n#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]\n\nfn main() {\n    tauri::Builder::default()\n        .run(tauri::generate_context!())\n        .expect("error");\n}\n');
    const { config } = await cfg.resolve('tauri', dir, { env: {} });
    assert.deepStrictEqual(adapterT.sync(dir, config), []);
    assert.match(fs.readFileSync(path.join(dir, 'src-tauri', 'Cargo.toml'), 'utf8'), /kreft-generated/);
    assert.match(fs.readFileSync(path.join(dir, 'src-tauri', 'src', 'main.rs'), 'utf8'), /kreft_generated::apply/);
  } finally { cleanup(dir); }
});

// ---- types, docs, build -------------------------------------------------------------------------------------------------------

test('desktop.d.ts is made from the schema and is up to date; the package exports it', () => {
  assert.strictEqual(fs.readFileSync(bin('desktop/dts.js').FILE, 'utf8'), bin('desktop/dts.js').generate(), 'run: npm run desktop:types');
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.deepStrictEqual(pkg.exports['./desktop'], { types: './desktop.d.ts', default: './desktop.js' });
  assert.ok(pkg.files.includes('desktop.js') && pkg.files.includes('desktop.d.ts'));
  const d = require('kreftjs/desktop');
  assert.deepStrictEqual(d.defineElectronConfig({ a: 1 }), { a: 1 });
  const dts = fs.readFileSync(path.join(__dirname, '..', 'desktop.d.ts'), 'utf8');
  for (const name of ['ElectronConfig', 'TauriConfig', 'defineElectronConfig', 'defineTauriConfig', 'SharedDesktopConfig', 'DesktopConfigContext']) assert.ok(dts.includes(name), name);
  assert.match(dts, /\/\*\* "hidden": no menu bar/, 'the descriptions come along for the editor');
});

test('the documented example configurations are valid', async () => {
  const docs = fs.readFileSync(path.join(__dirname, '..', 'docs', 'README.md'), 'utf8');
  const section = docs.split('## Desktop configuration')[1].split('\n## ')[0];
  const blocks = [...section.matchAll(/```js\n\/\/ example: (electron|tauri)\n([\s\S]*?)```/g)];
  assert.ok(blocks.length >= 4, 'the docs have working examples');
  for (const [, rt, code] of blocks) {
    const dir = project();
    try {
      write(dir, `config/${rt}.config.js`, code);
      await cfg.resolve(rt, dir, { env: {} });
    } catch (e) { assert.fail(`the ${rt} example in the docs is not valid:\n${code}\n${e.message}`); } finally { cleanup(dir); }
  }
});

test('the configuration files and the electron folder never go into the built website', async () => {
  const dir = project();
  try {
    write(dir, 'index.html', '<!doctype html><html><head><title>x</title></head><body><div id="app"></div><script src="kreftjs.js"></script></body></html>');
    write(dir, 'kreftjs.js', '/* runtime */');
    write(dir, 'config/electron.config.js', 'module.exports = {}');
    write(dir, 'config/tauri.config.js', 'module.exports = {}');
    write(dir, 'electron/kreft.resolved.json', '{}');
    const r = require('node:child_process').spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'kreftjs.js'), 'build', dir, '--out', path.join(dir, 'out')], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stderr || r.stdout);
    assert.ok(fs.existsSync(path.join(dir, 'out', 'index.html')));
    assert.ok(!fs.existsSync(path.join(dir, 'out', 'config', 'electron.config.js')));
    assert.ok(!fs.existsSync(path.join(dir, 'out', 'config', 'tauri.config.js')));
    assert.ok(!fs.existsSync(path.join(dir, 'out', 'electron')));
  } finally { cleanup(dir); }
});

test('the option tables in the documentation are made from the schema and list every option', () => {
  const docs = require('../bin/desktop/docs.js');
  const text = fs.readFileSync(docs.FILE, 'utf8');
  const block = text.slice(text.indexOf(docs.START), text.indexOf(docs.END) + docs.END.length);
  assert.strictEqual(block, docs.generate(), 'run: node bin/desktop/docs.js --write');
  for (const [p] of schema.leaves()) assert.ok(block.includes('`' + p.join('.') + '`'), p.join('.') + ' is in the docs');
  for (const heading of ['## Desktop configuration', '### Add a runtime', '### What is used, in this order', '### Electron and Tauri are not the same', '### Both runtimes in one project', '### What has been tested']) assert.ok(text.includes(heading), heading);
  assert.match(text, /An existing config file is never replaced without a yes/);
});
