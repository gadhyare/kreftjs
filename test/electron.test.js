// kreftjs electron:init (and kreftjs new --electron): Google Fonts links are removed, nothing else is touched.   Run: npm test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HTML = `<!doctype html>
<html>
<head>
  <title>App</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap">
  <link rel="stylesheet" href="https://cdn.example.com/other.css">
  <link rel="stylesheet" href="ui.css">
</head>
<body><div id="app"></div></body>
</html>
`;

test('electron:init removes the Google Fonts links of index.html and nothing else', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-electron-'));
  const log = console.log;
  try {
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'demo-app' }));
    fs.writeFileSync(path.join(tmp, 'index.html'), HTML);
    console.log = () => { };
    require(path.join(__dirname, '..', 'bin/electron.js')).init(tmp);
    console.log = log;

    const out = fs.readFileSync(path.join(tmp, 'index.html'), 'utf8');
    assert.doesNotMatch(out, /fonts\.(googleapis|gstatic)\.com/);
    assert.match(out, /cdn\.example\.com\/other\.css/, 'a link to another site is not ours to remove');
    assert.match(out, /href="ui\.css"/);
    assert.ok(fs.existsSync(path.join(tmp, 'electron', 'main.js')));

    const again = out;
    console.log = () => { };
    require(path.join(__dirname, '..', 'bin/electron.js')).init(tmp);
    console.log = log;
    assert.strictEqual(fs.readFileSync(path.join(tmp, 'index.html'), 'utf8'), again, 'running it twice changes nothing more');
  } finally {
    console.log = log;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('electron templates: main.js reads the configuration for DevTools and the menu, the bridge keeps its functions', () => {
  const { TEMPLATES } = require(path.join(__dirname, '..', 'bin/electron.js'));
  const mainCode = TEMPLATES.main();
  const preloadCode = TEMPLATES.preload();

  assert.match(mainCode, /kreft\.resolved\.json/, 'main.js reads the checked configuration (ELECTRON_DEVTOOLS and ELECTRON_MENU are read by the CLI, not here)');
  assert.match(mainCode, /openDevTools\(\{ mode: C\.devtools\.mode \}\)/, 'main.js opens devtools with the configured mode');
  assert.match(mainCode, /ipcMain\.handle\('kreft:devtools:open'/, 'main.js has devtools:open IPC');
  assert.match(mainCode, /ipcMain\.handle\('kreft:devtools:close'/, 'main.js has devtools:close IPC');
  assert.match(preloadCode, /__KREFT_ELECTRON__/, 'preload.js exposes __KREFT_ELECTRON__');
  assert.match(preloadCode, /openDevTools:/, 'preload.js exposes openDevTools');
  assert.match(preloadCode, /closeDevTools:/, 'preload.js exposes closeDevTools');
  assert.match(mainCode, /if \(isDev \|\| process\.platform !== 'darwin'\) app\.quit\(\)/, 'dev mode quits cleanly on window close');
});

test('dev-client.js: there is no floating DevTools button anywhere; Alt+Shift+D opens the panel', () => {
  const vm = require('node:vm');
  const code = fs.readFileSync(path.join(__dirname, '..', 'tools/dev-client.js'), 'utf8');
  assert.doesNotMatch(code, /data-kreft-devtools-button/, 'the floating K button is gone');
  for (const [name, extra, ua] of [['a browser', {}, 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36'], ['Electron', { kreftDesktop: { isElectron: true }, __KREFT_ELECTRON__: true }, 'Mozilla/5.0 Electron/34.2.0']]) {
    const added = [];
    const listeners = {};
    const ctx = {
      ...extra,
      navigator: { userAgent: ua },
      document: { body: { appendChild: (el) => added.push(el) }, head: { appendChild: (el) => added.push(el) }, createElement: () => ({ setAttribute() {}, style: {}, addEventListener() {} }), addEventListener() {} },
      addEventListener(type, fn) { listeners[type] = fn; },
      location: { origin: 'http://localhost:8000', reload() {} },
      localStorage: { getItem() { return null; } },
      console: { error() {}, log() {} },
    };
    ctx.window = ctx;
    vm.runInNewContext(code, ctx);
    assert.strictEqual(added.length, 0, `${name}: nothing is added to the page by the dev client at start`);
    assert.strictEqual(typeof ctx.__kreftOpenDevtools, 'function', `${name}: pages can open the panel themselves`);
    assert.ok(listeners.keydown, `${name}: Alt+Shift+D is listened for`);
  }
});
