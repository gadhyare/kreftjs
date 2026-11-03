// kreft electron:init (and kreft new --electron): Google Fonts links are removed, nothing else is touched.   Run: npm test
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

test('electron templates: main.js and preload.js support ELECTRON_DEVTOOLS variable and hide devtools', () => {
  const { TEMPLATES } = require(path.join(__dirname, '..', 'bin/electron.js'));
  const mainCode = TEMPLATES.main();
  const preloadCode = TEMPLATES.preload();

  assert.match(mainCode, /ELECTRON_DEVTOOLS/, 'main.js reads ELECTRON_DEVTOOLS variable');
  assert.match(mainCode, /openDevTools\(\{ mode: devTools\.mode \}\)/, 'main.js opens devtools with configured mode (default right sidebar)');
  assert.match(mainCode, /ipcMain\.handle\('kreft:devtools:open'/, 'main.js has devtools:open IPC');
  assert.match(mainCode, /ipcMain\.handle\('kreft:devtools:close'/, 'main.js has devtools:close IPC');
  assert.match(preloadCode, /__KREFT_ELECTRON__/, 'preload.js exposes __KREFT_ELECTRON__');
  assert.match(preloadCode, /openDevTools:/, 'preload.js exposes openDevTools');
  assert.match(preloadCode, /closeDevTools:/, 'preload.js exposes closeDevTools');
  assert.match(mainCode, /if\s*\(isDev\s*\|\|\s*process\.platform\s*!==\s*'darwin'\)\s*app\.quit\(\)/, 'dev mode quits cleanly on window close');
});

test('dev-client.js: in Electron, the Kreft devtools button is totally hidden', () => {
  const vm = require('node:vm');
  const code = fs.readFileSync(path.join(__dirname, '..', 'tools/dev-client.js'), 'utf8');

  // Case 1: Standard browser -> button is added
  const browserContext = {
    navigator: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    document: {
      body: {},
      head: { appendChild() {} },
      createElement() {
        return { setAttribute(k, v) { this[k] = v; }, style: {} };
      },
      addEventListener() {},
    },
    addEventListener() {},
    location: { origin: 'http://localhost:8000', reload() {} },
    localStorage: { getItem() { return null; } },
    console: { error() {}, log() {} },
  };
  browserContext.window = browserContext;
  browserContext.document.body.appendChild = (el) => { browserContext.button = el; };
  vm.runInNewContext(code, browserContext);
  assert.ok(browserContext.button, 'browser gets the devtools button');
  assert.strictEqual(browserContext.button['data-kreft-devtools-button'], '');

  // Case 2: Electron environment -> button is totally hidden
  const electronContext = {
    kreftDesktop: { isElectron: true },
    __KREFT_ELECTRON__: true,
    navigator: { userAgent: 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/130.0.0.0 Electron/34.2.0 Safari/537.36' },
    document: {
      body: {},
      head: { appendChild(el) { this.style = el; } },
      createElement() {
        return { setAttribute(k, v) { this[k] = v; }, style: {} };
      },
      addEventListener() {},
    },
    addEventListener() {},
    location: { origin: 'http://localhost:8000', reload() {} },
    localStorage: { getItem() { return null; } },
    console: { error() {}, log() {} },
  };
  electronContext.window = electronContext;
  electronContext.document.body.appendChild = (el) => { electronContext.button = el; };
  vm.runInNewContext(code, electronContext);
  assert.strictEqual(electronContext.button, undefined, 'electron does NOT receive the in-page devtools button');
  assert.ok(electronContext.document.head.style, 'electron receives the hiding stylesheet');
  assert.match(electronContext.document.head.style.textContent, /display:\s*none\s*!important/);
});
