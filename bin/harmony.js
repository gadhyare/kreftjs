/*
 * HarmonyOS (Huawei) Support for Kreft
 *
 * Commands:
 *   kreft harmony:init      Add a harmony/ project (ArkTS + a web view) to an existing Kreft project (alias: kreft make:harmony)
 *   kreft harmony:build     Build the site and copy it into the HarmonyOS project (--api-url https://…; --hap: also make the .hap)
 *   kreft harmony:open      Open harmony/ in DevEco Studio
 *   kreft harmony:help      Prerequisites, files and options
 *
 * CLI flag:
 *   kreft new my-app --harmony
 *
 * HarmonyOS NEXT cannot run Android apps and Capacitor does not target it, so the app is a small native ArkTS shell with
 * one full-screen Web component that loads your built site from the app's own files (rawfile). The backend does not run
 * inside the phone: --api-url sets the server the app talks to.
 */
const fs = require('fs');
const path = require('path');
const { start: spawn, runSync } = require('./win-spawn.js');

function projectRoot(start = process.cwd()) {
  const lay = require('./layout.js').layout(start);
  return lay.split ? lay.project : start;
}

const slug = (s) => String(s || 'app').toLowerCase().replace(/[^a-z0-9]/g, '') || 'app';
const title = (s) => (s ? String(s).replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Kreft App');
const json = (o) => JSON.stringify(o, null, 2) + '\n';

const RAWFILE = path.join('entry', 'src', 'main', 'resources', 'rawfile');
const SDK = '5.0.0(12)'; // HarmonyOS NEXT, API 12

const FILES = {
  'AppScope/app.json5': (c) => json({ app: { bundleName: c.id, vendor: c.vendor, versionCode: 1000000, versionName: c.version, icon: '$media:app_icon', label: '$string:app_name' } }),
  'AppScope/resources/base/element/string.json': (c) => json({ string: [{ name: 'app_name', value: c.name }] }),
  'build-profile.json5': () => json({
    app: { signingConfigs: [], products: [{ name: 'default', signingConfig: 'default', compatibleSdkVersion: SDK, runtimeOS: 'HarmonyOS' }] },
    modules: [{ name: 'entry', srcPath: './entry', targets: [{ name: 'default', applyToProducts: ['default'] }] }],
  }),
  'hvigor/hvigor-config.json5': () => json({ modelVersion: '5.0.0', dependencies: {} }),
  'hvigorfile.ts': () => `import { appTasks } from '@ohos/hvigor-ohos-plugin';

export default {
  system: appTasks,
  plugins: []
}
`,
  'oh-package.json5': (c) => json({ modelVersion: '5.0.0', description: c.name, dependencies: {}, devDependencies: {} }),
  'entry/build-profile.json5': () => json({ apiType: 'stageMode', buildOption: {}, targets: [{ name: 'default' }] }),
  'entry/hvigorfile.ts': () => `import { hapTasks } from '@ohos/hvigor-ohos-plugin';

export default {
  system: hapTasks,
  plugins: []
}
`,
  'entry/oh-package.json5': () => json({ name: 'entry', version: '1.0.0', description: 'Kreft app', main: '', author: '', license: '', dependencies: {} }),
  'entry/src/main/module.json5': () => json({
    module: {
      name: 'entry',
      type: 'entry',
      description: '$string:module_desc',
      mainElement: 'EntryAbility',
      deviceTypes: ['phone', 'tablet', '2in1'],
      deliveryWithInstall: true,
      installationFree: false,
      pages: '$profile:main_pages',
      abilities: [{
        name: 'EntryAbility',
        srcEntry: './ets/entryability/EntryAbility.ets',
        description: '$string:EntryAbility_desc',
        icon: '$media:icon',
        label: '$string:EntryAbility_label',
        startWindowIcon: '$media:icon',
        startWindowBackground: '$color:start_window_background',
        exported: true,
        skills: [{ entities: ['entity.system.home'], actions: ['action.system.home'] }],
      }],
      requestPermissions: [{ name: 'ohos.permission.INTERNET' }], // the app talks to your API over the network
    },
  }),
  'entry/src/main/ets/entryability/EntryAbility.ets': () => `import { UIAbility } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { hilog } from '@kit.PerformanceAnalysisKit';

export default class EntryAbility extends UIAbility {
  onWindowStageCreate(windowStage: window.WindowStage): void {
    windowStage.loadContent('pages/Index', (err) => {
      if (err.code) {
        hilog.error(0x0000, 'kreft', 'Failed to load the content: %{public}s', JSON.stringify(err));
      }
    });
  }
}
`,
  'entry/src/main/ets/pages/Index.ets': () => `import { webview } from '@kit.ArkWeb';

// The whole app is one web view. Your Kreft site is copied into resources/rawfile by \`kreft harmony:build\`.
@Entry
@Component
struct Index {
  controller: webview.WebviewController = new webview.WebviewController();

  build() {
    Column() {
      Web({ src: $rawfile('index.html'), controller: this.controller })
        .javaScriptAccess(true)
        .domStorageAccess(true)
        .fileAccess(true)
        .width('100%')
        .height('100%')
    }
    .width('100%')
    .height('100%')
  }
}
`,
  'entry/src/main/resources/base/element/string.json': (c) => json({ string: [
    { name: 'module_desc', value: c.name },
    { name: 'EntryAbility_desc', value: c.name },
    { name: 'EntryAbility_label', value: c.name },
  ] }),
  'entry/src/main/resources/base/element/color.json': () => json({ color: [{ name: 'start_window_background', value: '#FFFFFF' }] }),
  'entry/src/main/resources/base/profile/main_pages.json': () => json({ src: ['pages/Index'] }),
};

function config(root) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  return {
    id: `com.kreftjs.${slug(pkg.name)}`,
    vendor: 'kreftjs',
    name: title(pkg.name),
    version: String(pkg.version || '1.0.0').replace(/[^0-9.].*$/, '') || '1.0.0',
  };
}

function write(file, content) {
  if (fs.existsSync(file)) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return true;
}

function init(args = []) {
  const target = typeof args === 'string' ? args : (args[0] && !args[0].startsWith('-') ? args[0] : process.cwd());
  const root = projectRoot(target);
  if (!fs.existsSync(path.join(root, 'package.json'))) {
    console.error('  No package.json found. Run this inside a Kreft project.');
    process.exit(1);
  }
  const c = config(root);
  const dir = path.join(root, 'harmony');
  const created = [];
  for (const [rel, make] of Object.entries(FILES)) {
    if (write(path.join(dir, rel), make(c))) created.push('harmony/' + rel);
  }
  if (write(path.join(dir, '.gitignore'), '/node_modules/\n/oh_modules/\n/.hvigor/\n/build/\n/entry/build/\n/entry/.preview/\n/.idea/\nlocal.properties\n/entry/' + RAWFILE.split(path.sep).slice(1).join('/') + '/\n')) created.push('harmony/.gitignore');

  // icons: build/icon.png if the project has one, else the Kreft logo (or a plain default if the package has no logo file)
  const icon = require('./app-icon.js').ensureIcon(root);
  if (icon.made) created.push('build/icon.png');
  for (const rel of ['AppScope/resources/base/media/app_icon.png', 'entry/src/main/resources/base/media/icon.png']) {
    const dest = path.join(dir, rel);
    if (!fs.existsSync(dest)) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(icon.file, dest); created.push('harmony/' + rel); }
  }
  fs.mkdirSync(path.join(dir, RAWFILE), { recursive: true });
  const routerFile = useHashInApp(root);

  const pkgFile = path.join(root, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
  pkg.scripts = pkg.scripts || {};
  pkg.scripts['harmony:build'] = 'kreft harmony:build';
  pkg.scripts['harmony:open'] = 'kreft harmony:open';
  fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');

  console.log(`
  HarmonyOS configured for Kreft:
${created.map((f) => '    CREATED  ' + f).join('\n') || '    (harmony/ already exists, nothing overwritten)'}
    UPDATED  package.json  (scripts: harmony:build, harmony:open)${routerFile ? `
    UPDATED  ${routerFile}  (the router uses #/addresses inside the app, normal addresses on the website)` : ''}

  Next:
    Install DevEco Studio   https://developer.huawei.com/consumer/en/deveco-studio/
    kreft harmony:build --api-url https://your-server.example
    kreft harmony:open      (run it on the emulator or a phone from DevEco Studio)
`);
}

// Inside the app the pages come from the app's own files (not http), where an address like /login does not exist.
// The hash mode (#/login) works there, so the router uses it when the page was not loaded over http(s). The website keeps its normal addresses.
const MODE_LINE = "mode: /^https?:$/.test(location.protocol) ? 'history' : 'hash', // HarmonyOS app: addresses like #/login";
function useHashInApp(root) {
  const file = [path.join(root, 'frontend', 'index.html'), path.join(root, 'index.html')].find((f) => fs.existsSync(f));
  if (!file) return null;
  const html = fs.readFileSync(file, 'utf8');
  const m = html.match(/Kreftjs\.router\(\{[ \t]*\n?/);
  if (!m) return null;
  const body = html.slice(m.index, html.indexOf('})', m.index));
  if (/\bmode\s*:/.test(body)) return null; // the project chose a mode already
  const at = m.index + m[0].length;
  const indent = (html.slice(at).match(/^[ \t]*/) || [''])[0] || '      ';
  const nl = m[0].endsWith('\n') ? '' : '\n';
  fs.writeFileSync(file, html.slice(0, at) + nl + indent + MODE_LINE + '\n' + (nl ? indent : '') + html.slice(at));
  return path.relative(root, file);
}

function setApiUrl(root, url) {
  if (!/^https?:\/\/[^\s]+$/i.test(url)) { console.error('  --api-url must be a full address, like https://api.example.com'); process.exit(1); }
  const file = path.join(root, '.env');
  let txt = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const line = 'PUBLIC_API_URL=' + url;
  txt = /^PUBLIC_API_URL=.*$/m.test(txt) ? txt.replace(/^PUBLIC_API_URL=.*$/m, line) : txt + (txt && !txt.endsWith('\n') ? '\n' : '') + line + '\n';
  fs.writeFileSync(file, txt);
  console.log('  PUBLIC_API_URL=' + url + ' (in .env)');
  // A PUBLIC_API_URL set in the terminal would win over .env when the site is built. The address given on the command line is the one to use.
  if (process.env.PUBLIC_API_URL && process.env.PUBLIC_API_URL !== url) console.log(`  Note: this terminal has PUBLIC_API_URL=${process.env.PUBLIC_API_URL}. The address you gave is used instead.`);
  process.env.PUBLIC_API_URL = url;
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b);
  }
}

// The built site goes into entry/src/main/resources/rawfile. A fresh copy each time, so deleted files do not stay behind.
function copySite(root) {
  const dist = path.join(root, 'dist');
  const raw = path.join(root, 'harmony', RAWFILE);
  fs.rmSync(raw, { recursive: true, force: true });
  copyDir(dist, raw);
  return raw;
}

function hvigorBin() {
  for (const name of process.platform === 'win32' ? ['hvigorw.bat', 'hvigorw.cmd', 'hvigor.cmd'] : ['hvigorw', 'hvigor']) {
    const r = runSync(process.platform === 'win32' ? 'where' : 'which', [name], { encoding: 'utf8' });
    if (!r.error && r.status === 0 && r.stdout) return r.stdout.toString().split(/\r?\n/)[0].trim();
  }
  return null;
}

function build(args = []) {
  const root = projectRoot();
  if (!fs.existsSync(path.join(root, 'package.json'))) { console.error('  No package.json found. Run this inside a Kreft project.'); process.exit(1); }
  if (!fs.existsSync(path.join(root, 'harmony', 'build-profile.json5'))) { console.log('  HarmonyOS files not found. Initializing…'); init(root); }
  const i = args.indexOf('--api-url');
  if (i >= 0) setApiUrl(root, args[i + 1] || '');

  console.log('\n  Step 1: Building the site (relative base)…');
  const build = spawn(process.execPath, [path.join(__dirname, 'kreftjs.js'), 'build', '--base', './', '--no-htaccess'], { cwd: root, stdio: 'inherit' });
  build.on('exit', (code) => {
    if (code) { console.error('  Build failed with code ' + code); process.exit(code); }
    // The app ships its files inside itself: no service worker, one would keep serving old files after an update.
    try { fs.rmSync(path.join(root, 'dist', 'sw.js'), { force: true }); } catch (_) {}
    console.log('\n  Step 2: Copying the build into harmony/…');
    const raw = copySite(root);
    console.log('  Copied to ' + path.relative(root, raw));

    if (!args.includes('--hap')) {
      console.log('\n  Done. Open the project and run it:  kreft harmony:open   (DevEco Studio makes the .hap and signs it)\n');
      return;
    }
    const hv = hvigorBin();
    if (!hv) { console.error('\n  hvigor was not found on this computer. Install DevEco Studio, or open the project in it:  kreft harmony:open\n'); process.exit(1); }
    console.log('\n  Step 3: Making the .hap with hvigor…');
    const pack = spawn(hv, ['--mode', 'module', '-p', 'product=default', 'assembleHap', '--no-daemon'], { cwd: path.join(root, 'harmony'), stdio: 'inherit' });
    pack.on('error', (err) => { console.error('  hvigor error: ' + err.message); process.exit(1); });
    pack.on('exit', (c) => {
      if (!c) console.log('\n  The .hap is in harmony/entry/build/default/outputs/default/ (it must be signed in DevEco Studio before it installs on a phone).\n');
      process.exit(c || 0);
    });
  });
}

function open(args = []) {
  const root = projectRoot();
  const dir = path.join(root, 'harmony');
  if (!fs.existsSync(dir)) { console.error('  No harmony/ folder. Run:  kreft harmony:init'); process.exit(1); }
  const r = process.platform === 'darwin' ? runSync('open', ['-a', 'DevEco-Studio', dir], { stdio: 'inherit' })
    : { status: 1 };
  if (r.status) console.log(`\n  Open this folder in DevEco Studio (File > Open):\n    ${dir}\n`);
}

function help() {
  console.log(`
  HarmonyOS apps (Huawei phones and tablets, HarmonyOS NEXT)

    kreft harmony:init      Add harmony/ to this project (alias: kreft make:harmony)
    kreft harmony:build     Build the site and copy it into harmony/ (--api-url https://api.example.com)
                            --hap also runs hvigor to make the .hap (needs DevEco Studio's command line tools)
    kreft harmony:open      Open harmony/ in DevEco Studio
    kreft new my-app --harmony   A new project with HarmonyOS support

  You need
    DevEco Studio           https://developer.huawei.com/consumer/en/deveco-studio/ (it brings the HarmonyOS SDK and the emulator)
    A Huawei developer account to sign the app for a real phone (the emulator needs no account)

  How it works
    harmony/ is a normal ArkTS project (stage model, API 12). Its one page is a full-screen Web component that loads
    your built site from the app's own files, so the app works without a network. The backend does not run inside
    the phone: build with --api-url so the app knows where your server is.

  Files
    harmony/entry/src/main/ets/pages/Index.ets   the web view (change the settings here)
    harmony/entry/src/main/module.json5          abilities, device types, permissions (INTERNET is on)
    harmony/AppScope/app.json5                   bundle name (com.kreftjs.<name>), version, icon
    harmony/entry/src/main/resources/rawfile/    your site, written by harmony:build (not committed)

  Tips
    harmony:init sets the router to #/addresses inside the app (frontend/index.html); the website keeps normal addresses.
    window.kreftDesktop and the Electron helpers do not exist here.
`);
}

module.exports = { init, build, open, help, hvigorBin, FILES, RAWFILE };
