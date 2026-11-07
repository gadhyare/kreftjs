/*
 * Mobile apps (iOS and Android) for Kreft, with Capacitor.
 *
 *   kreft mobile:init            add Capacitor to this project (capacitor.config.json, package.json entries)
 *   kreft mobile:build [--android|--ios] [--api-url https://…]
 *                                build the site (relative base, PWA files), then `cap add` (first time) and `cap sync`
 *   kreft mobile:open [--android|--ios]    open Android Studio or Xcode
 *   kreft mobile:dev [--android|--ios]     run on a device or emulator with the dev server (live reload)
 *   kreft mobile:help
 *
 * The backend does not run inside the phone: --api-url sets the server the app talks to (written to .env
 * as PUBLIC_API_URL before the build). In the app: Kreftjs.api.setup({ base: Kreftjs.env.PUBLIC_API_URL, token: … }).
 */
const fs = require('fs');
const path = require('path');
const { start: spawn } = require('./win-spawn.js');

const CAP = '^7.0.0';
// the native plugins behind Kreftjs.native (device, haptics, files, share, network …). Each one is tiny; they only do something in the phone app.
const PLUGINS = ['app', 'device', 'haptics', 'network', 'share', 'status-bar', 'splash-screen', 'keyboard', 'filesystem', 'geolocation', 'clipboard', 'browser'];

function projectRoot(start = process.cwd()) {
  const lay = require('./layout.js').layout(start);
  return lay.split ? lay.project : start;
}

function readPkg(root) {
  try { return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')); } catch (_) { return null; }
}

// an app id like com.example.myapp, from the package name
function appId(name) {
  const slug = String(name || 'app').replace(/^@[^/]+\//, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  return 'com.example.' + (/^[a-z]/.test(slug) ? slug : 'app' + slug);
}

function configFor(root) {
  const pkg = readPkg(root) || {};
  const name = pkg.productName || pkg.name || path.basename(root);
  return {
    appId: appId(pkg.name || name),
    appName: String(name),
    webDir: 'dist',
    server: { androidScheme: 'https' },
    android: { adjustMarginsForEdgeToEdge: 'force' }, // Android 15+ draws apps under the status bar: keep the page below it
  };
}

// the mobile commands change package.json and write files, so they only run inside a Kreft app (one with an index.html)
function requireApp(dir) {
  const lay = require('./layout.js').layout(dir);
  const pkg = readPkg(dir);
  const isFramework = pkg && pkg.name === 'kreftjs' && fs.existsSync(path.join(dir, 'kreftjs.js')) && fs.existsSync(path.join(dir, 'bin', 'kreftjs.js'));
  if (isFramework || !fs.existsSync(path.join(lay.frontend, 'index.html'))) {
    console.error(`\n  This folder is not a Kreft app${isFramework ? ' (it is the Kreft framework itself)' : ' (no index.html here)'}:\n      ${dir}\n\n  Go into your app first, or make one:\n      kreft new my-app --mobile\n      cd my-app\n`);
    process.exit(1);
  }
}

function init(target) {
  const root = typeof target === 'string' ? target : projectRoot();
  if (typeof target !== 'string') requireApp(root); // kreft new passes its own new folder
  const cfgFile = path.join(root, 'capacitor.config.json');
  if (!fs.existsSync(cfgFile)) {
    fs.writeFileSync(cfgFile, JSON.stringify(configFor(root), null, 2) + '\n');
    console.log('  Wrote capacitor.config.json');
  }
  const pkgFile = path.join(root, 'package.json');
  const pkg = readPkg(root);
  if (pkg) {
    pkg.dependencies = { ...pkg.dependencies };
    pkg.devDependencies = { ...pkg.devDependencies };
    pkg.scripts = { ...pkg.scripts };
    let changed = false;
    const need = (obj, k, v) => { if (!obj[k]) { obj[k] = v; changed = true; } };
    need(pkg.dependencies, '@capacitor/core', CAP);
    need(pkg.dependencies, '@capacitor/android', CAP);
    need(pkg.dependencies, '@capacitor/ios', CAP);
    for (const n of PLUGINS) need(pkg.dependencies, '@capacitor/' + n, CAP);
    need(pkg.devDependencies, '@capacitor/cli', CAP);
    need(pkg.scripts, 'mobile:build', 'kreft mobile:build');
    need(pkg.scripts, 'mobile:android', 'kreft mobile:build --android');
    need(pkg.scripts, 'mobile:ios', 'kreft mobile:build --ios');
    if (changed) { fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n'); console.log('  Added Capacitor to package.json. Run:  npm install'); }
  }
  const ignore = path.join(root, '.gitignore');
  if (fs.existsSync(ignore)) {
    const txt = fs.readFileSync(ignore, 'utf8');
    const add = ['android/app/build', 'ios/App/Pods', 'ios/App/build'].filter((l) => !txt.includes(l));
    if (add.length) fs.appendFileSync(ignore, (txt.endsWith('\n') ? '' : '\n') + add.join('\n') + '\n');
  }
  // the UI kit (edge components, Kreftjs.native, edge.css). kreft new --mobile asks for the layout and gallery as well.
  if (typeof target !== 'string') { try { require('./mobile-ui.js').install(root, {}); } catch (e) { console.warn('  Could not add the phone UI kit: ' + e.message); } }
  console.log('\n  Mobile support is ready. Next:\n    npm install\n    kreft mobile:build --android --api-url https://your-server.example\n');
}

function platforms(args) {
  const p = ['android', 'ios'].filter((x) => args.includes('--' + x));
  return p;
}

function setApiUrl(root, url) {
  if (!/^https?:\/\/[^\s]+$/i.test(url)) { console.error('  --api-url must be a full address, like https://api.example.com'); process.exit(1); }
  const file = path.join(root, '.env');
  let txt = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const line = 'PUBLIC_API_URL=' + url;
  txt = /^PUBLIC_API_URL=.*$/m.test(txt) ? txt.replace(/^PUBLIC_API_URL=.*$/m, line) : txt + (txt && !txt.endsWith('\n') ? '\n' : '') + line + '\n';
  fs.writeFileSync(file, txt);
  console.log('  PUBLIC_API_URL=' + url + ' (in .env)');
}

// Capacitor 7 projects use Gradle 8.11: it needs Java 21 to build Android, and cannot start on Java 24 or newer
// ("Unsupported class file major version 69"). An older Java fails with "invalid source release: 21".
// So Android commands run with a Java from 21 to 23: the current one if it fits, else one found on this computer.
const JAVA_MIN = 21, JAVA_MAX = 23;
const javaFits = (n) => n >= JAVA_MIN && n <= JAVA_MAX;
function javaMajor(home) {
  const bin = home ? path.join(home, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : 'java';
  const r = require('child_process').spawnSync(bin, ['-version'], { encoding: 'utf8' });
  const m = /version "(\d+)(?:\.(\d+))?/.exec((r.stderr || '') + (r.stdout || ''));
  return m ? (m[1] === '1' ? Number(m[2]) : Number(m[1])) : 0;
}
function javaHomes() {
  const home = require('os').homedir();
  const out = [];
  // Java 21 that Gradle downloaded for itself, then installed JDKs, then the Java inside Android Studio
  const jdks = path.join(home, '.gradle', 'jdks');
  const dirs = (d) => { try { return fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => path.join(d, e.name)); } catch (_) { return []; } };
  for (const vendor of dirs(jdks)) for (const jdk of dirs(vendor)) for (const sub of ['Contents/Home', '']) out.push(path.join(jdk, sub));
  if (process.platform === 'darwin') {
    for (const v of ['21', '22', '23']) {
      const r = require('child_process').spawnSync('/usr/libexec/java_home', ['-v', v], { encoding: 'utf8' });
      if (r.status === 0 && r.stdout.trim()) out.push(r.stdout.trim());
    }
  }
  out.push('/usr/lib/jvm/java-21-openjdk-amd64', '/usr/lib/jvm/java-21-openjdk', '/usr/lib/jvm/temurin-21-jdk-amd64',
    'C:\\Program Files\\Eclipse Adoptium\\jdk-21', 'C:\\Program Files\\Java\\jdk-21');
  out.push('/Applications/Android Studio.app/Contents/jbr/Contents/Home', 'C:\\Program Files\\Android\\Android Studio\\jbr',
    '/opt/android-studio/jbr', path.join(home, 'android-studio', 'jbr'));
  return out;
}
function findJava21() {
  return javaHomes().find((c) => fs.existsSync(path.join(c, 'bin')) && javaFits(javaMajor(c))) || null;
}
let javaEnv = null;
function androidEnv() {
  if (javaEnv) return javaEnv;
  javaEnv = {};
  if (javaFits(javaMajor(process.env.JAVA_HOME))) return javaEnv;
  const found = findJava21();
  if (found) {
    javaEnv = { JAVA_HOME: found, PATH: path.join(found, 'bin') + path.delimiter + (process.env.PATH || '') };
    console.log(`  Using Java ${javaMajor(found)} from ${found}`);
  } else {
    console.warn('\n  Android builds need a Java from 21 to 23 (Capacitor 7 / Gradle 8.11): older and newer ones fail.\n  Install Java 21, then run again:  brew install --cask temurin@21   (or from https://adoptium.net)\n  Or point to it yourself:  export JAVA_HOME="/path/to/jdk-21"\n');
  }
  return javaEnv;
}

function run(cmd, args, cwd) {
  return new Promise((resolve) => {
    const android = args.includes('android') || args.includes('--android');
    const p = spawn(cmd, args, { cwd, stdio: 'inherit', env: { ...process.env, ...(android ? androidEnv() : {}) } });
    p.on('error', (e) => { console.error('  Could not run ' + cmd + ': ' + e.message); resolve(1); });
    p.on('exit', (c) => resolve(c || 0));
  });
}

function capBin(root) {
  const bin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'cap.cmd' : 'cap');
  return fs.existsSync(bin) ? bin : null;
}

async function build(args = []) {
  const root = projectRoot();
  requireApp(root);
  if (!fs.existsSync(path.join(root, 'capacitor.config.json'))) { console.log('  Capacitor is not set up yet. Initializing…'); init(root); }
  const i = args.indexOf('--api-url');
  if (i >= 0) setApiUrl(root, args[i + 1] || '');
  const plats = platforms(args);

  console.log('\n  Step 1: Building the site (relative base, PWA files)…');
  const kreftCli = path.join(__dirname, 'kreftjs.js');
  const code = await run(process.execPath, [kreftCli, 'build', '--base', './', '--pwa', '--no-htaccess'], root);
  if (code) { console.error('  Build failed with code ' + code); process.exit(code); }

  const cap = capBin(root);
  if (!cap) { console.error('\n  Capacitor is not installed. Run:  npm install\n'); process.exit(1); }
  for (const p of plats.length ? plats : ['android', 'ios']) {
    if (!plats.length && !fs.existsSync(path.join(root, p))) continue; // no flag: sync only the platforms that exist
    if (!fs.existsSync(path.join(root, p))) {
      console.log(`\n  Adding ${p}…`);
      const c = await run(cap, ['add', p], root);
      if (c) process.exit(c);
    }
  }
  console.log('\n  Step 2: Copying the build into the native projects…');
  const c = await run(cap, ['sync', ...plats], root);
  if (c) process.exit(c);
  console.log('\n  Done. Open the native project:  kreft mobile:open --android   (or --ios)\n');
}

async function open(args = []) {
  const root = projectRoot();
  requireApp(root);
  const cap = capBin(root);
  if (!cap) { console.error('\n  Capacitor is not installed. Run:  npm install\n'); process.exit(1); }
  process.exit(await run(cap, ['open', platforms(args)[0] || 'android'], root));
}

async function dev(args = []) {
  const root = projectRoot();
  requireApp(root);
  const cap = capBin(root);
  if (!cap) { console.error('\n  Capacitor is not installed. Run:  npm install\n'); process.exit(1); }
  const plat = platforms(args)[0] || 'android';
  const port = process.env.PORT || '8000';
  const ip = Object.values(require('os').networkInterfaces()).flat().find((n) => n && n.family === 'IPv4' && !n.internal);
  const url = `http://${ip ? ip.address : 'localhost'}:${port}`;
  console.log(`  Dev server: ${url}  (the phone must be on the same network)`);
  const server = spawn(process.execPath, [path.join(__dirname, 'kreftjs.js'), 'dev'], { cwd: root, stdio: 'inherit', env: { ...process.env, PORT: port, HOST: '0.0.0.0' } });
  const stop = () => { try { server.kill('SIGTERM'); } catch (_) {} process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  const c = await run(cap, ['run', plat, '--live-reload', '--host', ip ? ip.address : 'localhost', '--port', port], root);
  try { server.kill('SIGTERM'); } catch (_) {}
  process.exit(c);
}

// ---- app icon and splash screen: kreft mobile:icons logo.png --bg "#ffffff"   kreft mobile:splash splash.png --bg "#ffffff" --dark-bg "#000000"
// Uses Capacitor's own asset tool (npx @capacitor/assets), which makes every size for Android and iOS from one picture.
function pngSize(file) {
  const b = fs.readFileSync(file);
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47 || b.toString('ascii', 12, 16) !== 'IHDR') return null; // not a PNG
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}
function assetPlan(kind, args, root) {
  const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  const image = args.find((a, i) => !a.startsWith('-') && !['--bg', '--dark-bg'].includes(args[i - 1]));
  const bg = flag('--bg'), darkBg = flag('--dark-bg');
  const colour = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i;
  for (const c of [bg, darkBg]) if (c && !colour.test(c)) throw new Error(`Colours look like "#ffffff" (got "${c}").`);
  if (!image) throw new Error(`Give the picture: kreft mobile:${kind} path/to/${kind === 'icons' ? 'icon' : 'splash'}.png`);
  const from = path.resolve(image);
  if (!fs.existsSync(from)) throw new Error(`${image} does not exist.`);
  const size = pngSize(from);
  if (!size) throw new Error(`${image} must be a PNG picture.`);
  const need = kind === 'icons' ? 1024 : 2732;
  const warnings = [];
  if (size.width < need || size.height < need) warnings.push(`${image} is ${size.width}x${size.height}; ${need}x${need} gives the sharpest result.`);
  if (size.width !== size.height) warnings.push(`${image} is not square; it will be cropped.`);
  const names = kind === 'icons' ? ['icon-only.png', 'icon-foreground.png'] : ['splash.png', ...(darkBg ? ['splash-dark.png'] : [])];
  const cli = ['--yes', '@capacitor/assets', 'generate', ...['android', 'ios'].filter((p) => fs.existsSync(path.join(root, p))).map((p) => '--' + p)];
  if (kind === 'icons') { if (bg) cli.push('--iconBackgroundColor', bg); if (darkBg) cli.push('--iconBackgroundColorDark', darkBg); }
  else { if (bg) cli.push('--splashBackgroundColor', bg); if (darkBg) cli.push('--splashBackgroundColorDark', darkBg); }
  return { from, names, cli, warnings };
}
async function assetsCmd(kind, args = []) {
  const root = projectRoot();
  requireApp(root);
  let plan;
  try { plan = assetPlan(kind, args, root); } catch (e) { console.error('\n  ' + e.message + '\n'); process.exit(1); }
  if (plan.cli.length === 3) { console.error('\n  There is no android/ or ios/ folder yet. Run:  kreft mobile:build --android\n'); process.exit(1); }
  plan.warnings.forEach((w) => console.warn('  ' + w));
  const dir = path.join(root, 'assets');
  fs.mkdirSync(dir, { recursive: true });
  for (const n of plan.names) fs.copyFileSync(plan.from, path.join(dir, n));
  console.log(`  Copied the picture to assets/${plan.names.join(', assets/')}`);
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const c = await run(npx, plan.cli, root);
  if (c) { console.error('\n  The icon tool failed (it needs the internet the first time).\n'); process.exit(c); }
  console.log(`\n  Done. The ${kind === 'icons' ? 'app icons' : 'splash screens'} are in android/ and ios/. Build again:  kreft mobile:build --android\n`);
}

function help() {
  console.log(`
  Mobile apps (iOS and Android) with Capacitor

    kreft new my-app --mobile          a new project with mobile support
    kreft mobile:init                  add Capacitor to this project
    kreft mobile:build --android       build the site and sync it into android/   (--ios for iOS; no flag: both that exist)
    kreft mobile:build --api-url https://api.example.com
                                       the address of your server (the backend does not run inside the phone)
    kreft mobile:open --android        open Android Studio (--ios: Xcode)
    kreft mobile:icons logo.png --bg "#ffffff"     make the app icon in every size (a 1024x1024 PNG)
    kreft mobile:splash splash.png --bg "#ffffff" --dark-bg "#000000"     make the splash screen (a 2732x2732 PNG)
    kreft mobile:ui [--layout] [--gallery]    add the edge components, Kreftjs.native and edge.css to this app
    kreft mobile:dev --android         run on a device or emulator with live reload

  Also: kreft build --pwa makes a normal website installable and usable offline (manifest.webmanifest + sw.js).
`);
}

module.exports = { PLUGINS, pngSize, assetPlan, init, icons: (a) => assetsCmd('icons', a), splash: (a) => assetsCmd('splash', a), build, open, dev, help, appId, configFor, androidEnv, javaMajor, findJava21 };
