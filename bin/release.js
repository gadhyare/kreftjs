/*
 * kreft mobile:release: a signed, store-ready build of the phone app.
 *
 *   kreft mobile:release --android          a signed .apk (to install or send) and .aab (for Google Play)
 *   kreft mobile:release --ios              an .ipa from an Xcode archive (needs a Mac, Xcode and an Apple team)
 *   kreft mobile:release --harmony          a .hap and .app from hvigor (needs DevEco Studio and a signing configuration)
 *   kreft mobile:release                    every platform whose folder (android/, ios/, harmony/) exists
 *
 * Every build: checks the server address (a store app must use https), sets the version numbers, builds the site, signs,
 * and writes the files to release/<platform>/ with their size and SHA-256. --dry-run shows each step and changes nothing.
 *
 * The steps are made by plan() as data, so they can be shown, tested and run.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { start: spawn, runSync } = require('./win-spawn.js');

const PLATFORMS = ['android', 'ios', 'harmony'];
const METHODS = ['app-store', 'ad-hoc', 'development', 'enterprise'];

const projectRoot = (start = process.cwd()) => {
  const lay = require('./layout.js').layout(start);
  return lay.split ? lay.project : start;
};
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return null; } };
const slug = (s) => String(s || 'app').replace(/^@[^/]+\//, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'app';
const rel = (root, f) => path.relative(root, f) || '.';

// ---- the command line -------------------------------------------------------------------------------------------------------

function parseArgs(args = []) {
  const o = { platforms: [], apk: false, aab: false, hap: false, app: false, bump: false, dryRun: false, createKeystore: false, noApiUrl: false, allowInsecureApi: false, method: 'app-store', out: 'release', errors: [] };
  const value = (i, name) => { const v = args[i + 1]; if (v === undefined || v.startsWith('--')) { o.errors.push(`${name} needs a value`); return null; } return v; };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const eq = a.startsWith('--') && a.includes('=') ? a.indexOf('=') : -1;
    const flag = eq > 0 ? a.slice(0, eq) : a;
    const inline = eq > 0 ? a.slice(eq + 1) : null;
    const take = () => (inline !== null ? inline : (i++, value(i - 1, flag)));
    if (PLATFORMS.includes(flag.slice(2)) && eq < 0) o.platforms.push(flag.slice(2));
    else if (flag === '--apk') o.apk = true;
    else if (flag === '--aab') o.aab = true;
    else if (flag === '--hap') o.hap = true;
    else if (flag === '--app') o.app = true;
    else if (flag === '--bump') o.bump = true;
    else if (flag === '--dry-run') o.dryRun = true;
    else if (flag === '--create-keystore') o.createKeystore = true;
    else if (flag === '--no-api-url') o.noApiUrl = true;
    else if (flag === '--allow-insecure-api') o.allowInsecureApi = true;
    else if (flag === '--api-url') o.apiUrl = take();
    else if (flag === '--version') o.version = take();
    else if (flag === '--build') o.build = take();
    else if (flag === '--team') o.team = take();
    else if (flag === '--method') o.method = take();
    else if (flag === '--out') o.out = take();
    else if (flag === '--help' || flag === '-h') o.help = true;
    else o.errors.push(`unknown option ${a}`);
  }
  if (o.build !== undefined && o.build !== null && !/^[1-9]\d{0,9}$/.test(String(o.build))) o.errors.push(`--build must be a whole number from 1, got "${o.build}"`);
  if (o.version && !/^[0-9A-Za-z][0-9A-Za-z.+_-]{0,30}$/.test(o.version)) o.errors.push(`--version "${o.version}" is not a version number (like 1.2.0)`);
  if (!METHODS.includes(o.method)) o.errors.push(`--method must be one of ${METHODS.join(', ')}, got "${o.method}"`);
  if (o.team && !/^[A-Z0-9]{10}$/.test(o.team)) o.errors.push(`--team is the 10-character Apple Team ID (like ABCDE12345), got "${o.team}"`);
  return o;
}

// a store app must reach its server over https, and not a development address
function apiUrlProblem(url) {
  if (!/^https?:\/\/[^\s]+$/i.test(url)) return `"${url}" is not a full address like https://api.example.com`;
  let u;
  try { u = new URL(url); } catch (_) { return `"${url}" is not a valid address`; }
  if (u.protocol !== 'https:') return `${url} is not https. A store app must use https://.`;
  if (/^(localhost|127\.|10\.0\.2\.2$|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|.*\.local$|0\.0\.0\.0$)/i.test(u.hostname)) return `${url} is an address inside your own network or computer. A phone cannot reach it. Use your real server.`;
  return null;
}

// The address a build would use when none is given. A PUBLIC_API_URL set in the shell wins over .env: that is how the build reads it,
// so it is what would be built into the app.
function currentApiUrl(root) {
  const shell = process.env.PUBLIC_API_URL;
  if (shell !== undefined && shell.trim() !== '') return { url: shell.trim(), source: 'the PUBLIC_API_URL variable of this terminal' };
  try { const m = fs.readFileSync(path.join(root, '.env'), 'utf8').match(/^PUBLIC_API_URL=(.+)$/m); if (m) return { url: m[1].trim(), source: 'PUBLIC_API_URL in your .env' }; } catch (_) { /* no .env */ }
  return { url: null, source: null };
}

// What was really built into the site: the address in dist/app.js, or null when there is no build to look at.
// A release is only signed when it is the address that was decided here, not one that came from somewhere else.
function builtApiUrl(root) {
  try {
    const m = fs.readFileSync(path.join(root, 'dist', 'app.js'), 'utf8').match(/"PUBLIC_API_URL":"([^"]*)"/);
    return m ? m[1] : '';
  } catch (_) { return null; }
}
function verifyBuiltApiUrl(root, expected) {
  const built = builtApiUrl(root);
  if (built === null) return null;
  const want = expected || '';
  if (built === want) return null;
  return want ? `The build contains the server address "${built || '(none)'}", not ${want}. A PUBLIC_API_URL from somewhere else won over the one you gave. Nothing was signed.`
    : `The build contains the server address "${built}", but you asked for none (--no-api-url). Nothing was signed.`;
}

// ---- Android -------------------------------------------------------------------------------------------------------------------

const SIGNING_MARK = '// kreft:release-signing';
const SIGNING_TOP = `${SIGNING_MARK}
def keystoreProperties = new Properties()
def keystoreFile = rootProject.file('keystore.properties')
if (keystoreFile.exists()) {
    keystoreFile.withInputStream { keystoreProperties.load(it) }
}
`;
const SIGNING_BLOCK = `    signingConfigs {
        release {
            if (keystoreFile.exists()) {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }
`;

// Makes app/build.gradle sign the release build with android/keystore.properties. Does nothing when it is set up already
// (by this command or by hand, as the docs describe). Returns { text, changed }.
function patchGradleSigning(text) {
  if (text.includes(SIGNING_MARK) || /signingConfig\s+signingConfigs\.release/.test(text)) return { text, changed: false };
  let out = text.replace(/(apply plugin: 'com\.android\.application'\r?\n)/, `$1\n${SIGNING_TOP}`);
  if (out === text) return { text, changed: false, problem: "app/build.gradle has no \"apply plugin: 'com.android.application'\" line, so the signing could not be added. Add it by hand: see the release guide." };
  const before = out;
  out = out.replace(/(\n)(\s*)buildTypes \{\s*\n(\s*)release \{\n/, (m, nl, ind, ind2) => `${nl}${SIGNING_BLOCK}${ind}buildTypes {\n${ind2}release {\n${ind2}    signingConfig signingConfigs.release\n`);
  if (out === before) return { text, changed: false, problem: 'app/build.gradle has no buildTypes { release { … } } block in the usual form, so the signing could not be added. Add it by hand: see the release guide.' };
  return { text: out, changed: true };
}

function readGradleVersion(text) {
  const code = text.match(/versionCode\s+(\d+)/);
  const name = text.match(/versionName\s+"([^"]*)"/);
  return { code: code ? Number(code[1]) : null, name: name ? name[1] : null };
}

function patchGradleVersion(text, { code, name }) {
  let out = text;
  if (code !== undefined && code !== null) out = out.replace(/versionCode\s+\d+/, `versionCode ${code}`);
  if (name) out = out.replace(/versionName\s+"[^"]*"/, `versionName "${name}"`);
  return out;
}

const IGNORE_LINES = ['*.jks', '*.keystore', 'keystore.properties'];
function patchIgnore(text) {
  const have = new Set(text.split(/\r?\n/).map((l) => l.trim()));
  const missing = IGNORE_LINES.filter((l) => !have.has(l));
  if (!missing.length) return { text, changed: false };
  return { text: text.replace(/\n*$/, '\n') + '\n# release signing: never commit these (added by kreft mobile:release)\n' + missing.join('\n') + '\n', changed: true };
}

function parseProperties(text) {
  const out = {};
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_.]+)\s*=\s*(.*)$/);
    if (m && !line.trim().startsWith('#')) out[m[1]] = m[2];
  }
  return out;
}

// the answers keytool needs, free of characters that mean something in a distinguished name
const dn = (s) => String(s || 'App').replace(/<.*>/, '').replace(/[^\p{L}\p{N} ._-]/gu, '').trim() || 'App';

function keytoolPath(env) {
  const home = env.JAVA_HOME || process.env.JAVA_HOME;
  const exe = process.platform === 'win32' ? 'keytool.exe' : 'keytool';
  if (home && fs.existsSync(path.join(home, 'bin', exe))) return path.join(home, 'bin', exe);
  return 'keytool';
}

function apksignerPath() {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(require('os').homedir(), process.platform === 'darwin' ? 'Library/Android/sdk' : 'Android/Sdk');
  const dir = path.join(sdk, 'build-tools');
  try {
    const versions = fs.readdirSync(dir).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).reverse();
    for (const v of versions) {
      const f = path.join(dir, v, process.platform === 'win32' ? 'apksigner.bat' : 'apksigner');
      if (fs.existsSync(f)) return f;
    }
  } catch (_) { /* no SDK here */ }
  return null;
}

// ---- iOS -----------------------------------------------------------------------------------------------------------------------

// the current build number of the iOS project (CURRENT_PROJECT_VERSION in project.pbxproj), or null
function readIosBuild(root) {
  try {
    const m = fs.readFileSync(path.join(root, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj'), 'utf8').match(/CURRENT_PROJECT_VERSION = (\d+);/);
    return m ? Number(m[1]) : null;
  } catch (_) { return null; }
}

function exportOptionsPlist({ method, team }) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>${esc(method)}</string>
  <key>teamID</key>
  <string>${esc(team)}</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>stripSwiftSymbols</key>
  <true/>
  <key>uploadSymbols</key>
  <true/>
</dict>
</plist>
`;
}

// ---- the plan: what will be done, as data ------------------------------------------------------------------------------------------

function context(root, o) {
  const pkg = readJson(path.join(root, 'package.json')) || {};
  const cap = readJson(path.join(root, 'capacitor.config.json')) || {};
  const name = cap.appName || pkg.productName || pkg.name || path.basename(root);
  const version = o.version || String(pkg.version || '1.0.0').replace(/^v/, '');
  return { pkg, cap, name, id: cap.appId || null, slug: slug(name), version, out: path.resolve(root, o.out) };
}

function plan(platform, root, o, c = context(root, o), tools = {}) {
  const steps = [];
  const url = o.noApiUrl ? null : (o.apiUrl || currentApiUrl(root).url);
  const site = { apiUrl: url, title: o.noApiUrl ? 'Build the site and copy it into the app (no server address: PUBLIC_API_URL is ignored)' : 'Build the site and copy it into the app', kind: 'site', platform, noApi: o.noApiUrl, args: ['--' + platform, ...(url ? ['--api-url', url] : [])] };
  const outDir = path.join(c.out, platform);

  if (platform === 'android') {
    const dir = path.join(root, 'android');
    const gradle = path.join(dir, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
    const tasks = [...(o.apk || !o.aab ? ['assembleRelease'] : []), ...(o.aab || !o.apk ? ['bundleRelease'] : [])];
    steps.push(site,
      { title: 'Set the version numbers and the signing in android/app/build.gradle', kind: 'android-config' },
      { title: `Build and sign with Gradle (${tasks.join(', ')})`, kind: 'run', cmd: gradle, args: [...tasks, '--no-daemon'], cwd: dir, android: true },
      { title: `Copy the files to ${rel(root, outDir)}/`, kind: 'android-collect', outDir, tasks });
  } else if (platform === 'ios') {
    const ios = path.join(root, 'ios', 'App');
    const hasWorkspace = fs.existsSync(path.join(ios, 'App.xcworkspace'));
    const archive = path.join(outDir, `${c.slug}.xcarchive`);
    const plist = path.join(outDir, 'ExportOptions.plist');
    const team = o.team || process.env.APPLE_TEAM_ID || '';
    const code = o.build ? String(o.build) : o.bump ? String((readIosBuild(root) || 0) + 1) : null;
    steps.push(site,
      { title: `Archive the app with Xcode (Release, team ${team || '?'})`, kind: 'run', cmd: 'xcodebuild', cwd: root,
        args: [hasWorkspace ? '-workspace' : '-project', hasWorkspace ? path.join(ios, 'App.xcworkspace') : path.join(ios, 'App.xcodeproj'),
          '-scheme', 'App', '-configuration', 'Release', '-destination', 'generic/platform=iOS', '-archivePath', archive,
          '-allowProvisioningUpdates', 'archive', `DEVELOPMENT_TEAM=${team}`, `MARKETING_VERSION=${c.version}`, ...(code ? [`CURRENT_PROJECT_VERSION=${code}`] : [])] },
      { title: `Write ExportOptions.plist (method ${o.method})`, kind: 'ios-plist', file: plist, method: o.method, team },
      { title: `Export the .ipa (${o.method})`, kind: 'run', cmd: 'xcodebuild', cwd: root,
        args: ['-exportArchive', '-archivePath', archive, '-exportPath', outDir, '-exportOptionsPlist', plist, '-allowProvisioningUpdates'] },
      { title: `Collect the files in ${rel(root, outDir)}/`, kind: 'ios-collect', outDir });
  } else {
    const dir = path.join(root, 'harmony');
    const hv = tools.hvigor || 'hvigorw';
    const wantHap = o.hap || !o.app, wantApp = o.app || !o.hap;
    steps.push({ title: 'Build the site and copy it into harmony/', kind: 'harmony-site', noApi: o.noApiUrl, apiUrl: url, args: url ? ['--api-url', url] : [] },
      { title: 'Set the version in harmony/AppScope/app.json5', kind: 'harmony-config' });
    if (wantHap) steps.push({ title: 'Build the .hap (hvigor assembleHap)', kind: 'run', cmd: hv, args: ['--mode', 'module', '-p', 'product=default', '-p', 'buildMode=release', 'assembleHap', '--no-daemon'], cwd: dir });
    if (wantApp) steps.push({ title: 'Build the .app bundle for AppGallery (hvigor assembleApp)', kind: 'run', cmd: hv, args: ['--mode', 'project', '-p', 'product=default', '-p', 'buildMode=release', 'assembleApp', '--no-daemon'], cwd: dir });
    steps.push({ title: `Collect the files in ${rel(root, outDir)}/`, kind: 'harmony-collect', outDir });
  }
  return steps;
}

// ---- checks before anything is changed ---------------------------------------------------------------------------------------------------

function preflight(root, o) {
  const problems = [];
  const found = !o.apiUrl && !o.noApiUrl ? currentApiUrl(root) : { url: null, source: null };
  const fromEnv = found.url;
  const url = o.noApiUrl ? null : (o.apiUrl || fromEnv);
  if (!url && !o.noApiUrl) problems.push('The app needs the address of your server. Add --api-url https://api.your-site.com (or PUBLIC_API_URL in .env). If the app needs no server (pages only), add --no-api-url.');
  if (url && !o.allowInsecureApi) {
    const p = apiUrlProblem(url);
    if (p) problems.push(`${p}${fromEnv ? ` It comes from ${found.source} (left over from a test build?).` : ''}\n       If the app needs no server, add --no-api-url (the .env value is then ignored). Otherwise use --api-url https://your-real-server. (--allow-insecure-api skips this check, for a test build.)`);
  }
  for (const p of o.platforms) {
    if (!fs.existsSync(path.join(root, p))) {
      problems.push(p === 'harmony'
        ? 'There is no harmony/ folder. Run: kreft harmony:init'
        : `There is no ${p}/ folder. Run: kreft mobile:build --${p}`);
    }
  }
  if (o.platforms.includes('android') && !o.createKeystore && !o.dryRun && fs.existsSync(path.join(root, 'android')) && !fs.existsSync(path.join(root, 'android', 'keystore.properties'))) {
    problems.push('There is no signing key (android/keystore.properties). A release build must be signed, or no phone and no store will accept it. Make one now: kreft mobile:release --android --create-keystore   (or follow the manual steps in the release guide).');
  }
  if (o.platforms.includes('ios') && !o.dryRun) {
    if (process.platform !== 'darwin') problems.push('An iOS release can only be built on a Mac (it needs Xcode).');
    else if (runSync('xcodebuild', ['-version'], { stdio: 'ignore' }).status !== 0) problems.push('Xcode is not set up: "xcodebuild" does not run. Install Xcode, open it once, then: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer');
  }
  if (o.platforms.includes('ios') && !(o.team || process.env.APPLE_TEAM_ID)) problems.push('An iOS release needs your Apple Team ID: --team ABCDE12345 (or APPLE_TEAM_ID). You find it at developer.apple.com > Membership.');
  return problems;
}

// ---- running the steps ---------------------------------------------------------------------------------------------------------------

const sha256 = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const size = (f) => { const b = fs.statSync(f).size; return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB'; };

function newest(dir, re) {
  const hits = [];
  const walk = (d, depth) => {
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      const f = path.join(d, e.name);
      if (e.isDirectory() && depth < 8 && e.name !== 'node_modules') walk(f, depth + 1);
      else if (e.isFile() && re.test(e.name)) hits.push({ f, t: fs.statSync(f).mtimeMs });
    }
  };
  walk(dir, 0);
  hits.sort((a, b) => b.t - a.t);
  return hits.map((h) => h.f);
}

function exec(cmd, args, cwd, extraEnv = {}) {
  return new Promise((resolve) => {
    let p;
    try { p = spawn(cmd, args, { cwd, stdio: 'inherit', env: { ...process.env, ...extraEnv } }); } catch (e) { console.error('  ' + e.message); return resolve(1); }
    p.on('error', (e) => { console.error(`  Could not run ${cmd}: ${e.message}`); resolve(1); });
    p.on('exit', (code) => resolve(code || 0));
  });
}

function createKeystore(root, c, env) {
  const dir = path.join(root, 'android');
  const props = path.join(dir, 'keystore.properties');
  const jks = path.join(dir, 'upload-keystore.jks');
  if (fs.existsSync(props) || fs.existsSync(jks)) return { problem: 'android/keystore.properties or android/upload-keystore.jks already exists. It is not replaced: a lost keystore means the app can never be updated. Remove --create-keystore, or move the old files away on purpose.' };
  const password = crypto.randomBytes(18).toString('base64url');
  const r = runSync(keytoolPath(env), ['-genkeypair', '-keystore', jks, '-alias', 'upload', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000',
    '-storepass:env', 'KREFT_KEYSTORE_PASSWORD', '-keypass:env', 'KREFT_KEYSTORE_PASSWORD', '-dname', `CN=${dn(c.name)}, O=${dn(c.pkg.author && (c.pkg.author.name || c.pkg.author))}`],
  { env: { ...process.env, ...env, KREFT_KEYSTORE_PASSWORD: password }, encoding: 'utf8' });
  if (r.error || r.status) return { problem: 'keytool failed: ' + ((r.stderr || r.error && r.error.message || '').toString().trim() || 'it is part of Java; install Java 21 and try again') };
  try {
    fs.writeFileSync(props, `storeFile=../upload-keystore.jks\nstorePassword=${password}\nkeyAlias=upload\nkeyPassword=${password}\n`, { mode: 0o600 });
  } catch (e) {
    // a keystore whose password was never saved is useless and would block the next try
    fs.rmSync(jks, { force: true });
    return { problem: `could not write android/keystore.properties (${e.message}). The new keystore was removed; nothing was kept.` };
  }
  return { jks, props };
}

// --create-keystore: makes the key when there is none. When there already is one it is kept as it is and the release goes on,
// so the same command can be run again. Returns { state: 'created' | 'kept' } or { problem }.
function ensureKeystore(root, c, env) {
  const dir = path.join(root, 'android');
  const props = path.join(dir, 'keystore.properties');
  const jks = path.join(dir, 'upload-keystore.jks');
  if (fs.existsSync(props) && fs.existsSync(jks)) return { state: 'kept', jks, props };
  if (fs.existsSync(props) || fs.existsSync(jks)) return { problem: 'Only one of android/keystore.properties and android/upload-keystore.jks exists. Nothing was replaced. Put the missing one back from your backup, or move the other away on purpose and run again.' };
  const k = createKeystore(root, c, env);
  return k.problem ? k : { state: 'created', jks: k.jks, props: k.props };
}

async function runSteps(platform, steps, root, o, c) {
  const artifacts = [];
  if (platform === 'android') {
    // outputs of an earlier build are removed first, so a file found afterwards is the one this run made (Gradle skips unchanged work, so its age says nothing)
    for (const d of [['apk', 'release'], ['bundle', 'release']]) fs.rmSync(path.join(root, 'android', 'app', 'build', 'outputs', ...d), { recursive: true, force: true });
  }
  const mobile = require('./mobile.js');
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    console.log(`\n  [${platform} ${i + 1}/${steps.length}] ${s.title}`);
    if (s.kind === 'site') {
      // What is built in is what was decided here. A value set in the real environment wins over .env and over --api-url, so it is set to
      // the decided address (or to nothing), and the finished build is checked below.
      process.env.PUBLIC_API_URL = s.noApi ? '' : (s.apiUrl || '');
      await mobile.build(s.args, { quiet: true });
      const wrong = verifyBuiltApiUrl(root, s.noApi ? '' : s.apiUrl);
      if (wrong) { console.error('\n  ' + wrong + '\n'); return { ok: false, artifacts }; }
    } else if (s.kind === 'harmony-site') {
      const code = await exec(process.execPath, [path.join(__dirname, 'kreftjs.js'), 'harmony:build', ...s.args], root, { PUBLIC_API_URL: s.noApi ? '' : (s.apiUrl || '') });
      if (code) return { ok: false, artifacts };
      const wrong = verifyBuiltApiUrl(root, s.noApi ? '' : s.apiUrl);
      if (wrong) { console.error('\n  ' + wrong + '\n'); return { ok: false, artifacts }; }
    } else if (s.kind === 'android-config') {
      const env = mobile.androidEnv();
      if (o.createKeystore) {
        const k = ensureKeystore(root, c, env);
        if (k.problem) { console.error('\n  ' + k.problem + '\n'); return { ok: false, artifacts }; }
        if (k.state === 'kept') console.log('  The signing key already exists (android/upload-keystore.jks): it is used as it is, not replaced. You do not need --create-keystore again.');
        else {
          console.log(`  Made android/upload-keystore.jks and android/keystore.properties (the password is in that file).`);
          console.log('\n  IMPORTANT: copy both files somewhere safe, outside this project (a password manager or an encrypted drive).\n  Without them you can never update the app. They are kept out of git.\n');
        }
      }
      if (!fs.existsSync(path.join(root, 'android', 'keystore.properties'))) {
        console.error('\n  There is no signing key. A release build must be signed, or no phone and no store will accept it.\n  Make one now:   kreft mobile:release --android --create-keystore\n  Or follow the manual steps in the release guide (docs: "Publishing your app to Google Play and the App Store").\n');
        return { ok: false, artifacts };
      }
      const gradleFile = path.join(root, 'android', 'app', 'build.gradle');
      let text = fs.readFileSync(gradleFile, 'utf8');
      const signing = patchGradleSigning(text);
      if (signing.problem) { console.error('\n  ' + signing.problem + '\n'); return { ok: false, artifacts }; }
      text = signing.text;
      const have = readGradleVersion(text);
      const code = o.build ? Number(o.build) : o.bump ? (have.code || 0) + 1 : have.code;
      text = patchGradleVersion(text, { code, name: c.version });
      fs.writeFileSync(gradleFile, text);
      const ign = path.join(root, 'android', '.gitignore');
      const ig = patchIgnore(fs.existsSync(ign) ? fs.readFileSync(ign, 'utf8') : '');
      if (ig.changed) fs.writeFileSync(ign, ig.text);
      c.versionCode = code;
      console.log(`  versionName ${c.version}, versionCode ${code}${signing.changed ? '; signing added to build.gradle' : ''}${ig.changed ? '; keystore files added to android/.gitignore' : ''}`);
    } else if (s.kind === 'android-collect') {
      const base = path.join(root, 'android', 'app', 'build', 'outputs');
      const found = [];
      if (s.tasks.includes('assembleRelease')) found.push([path.join(base, 'apk', 'release', 'app-release.apk'), 'apk']);
      if (s.tasks.includes('bundleRelease')) found.push([path.join(base, 'bundle', 'release', 'app-release.aab'), 'aab']);
      fs.mkdirSync(s.outDir, { recursive: true });
      const signer = apksignerPath();
      for (const [file, ext] of found) {
        if (!fs.existsSync(file)) { console.error(`  Gradle did not make ${rel(root, file)}.`); return { ok: false, artifacts }; }
        const dest = path.join(s.outDir, `${c.slug}-${c.version}-${c.versionCode}.${ext}`);
        fs.copyFileSync(file, dest);
        let verified = null;
        if (ext === 'apk' && !signer) console.warn('  Warning: apksigner was not found, so the signature of the APK is not checked. Install the Android SDK build-tools.');
        if (ext === 'apk' && signer) {
          const v = runSync(signer, ['verify', '--print-certs', dest], { encoding: 'utf8' });
          verified = v.status === 0 ? (v.stdout.match(/certificate SHA-256 digest: (\w+)/) || [])[1] || true : false;
          if (verified === false) { console.error(`  ${rel(root, dest)} is not correctly signed:\n${v.stderr || v.stdout}`); return { ok: false, artifacts }; }
        }
        artifacts.push({ platform, file: dest, sha: sha256(dest), size: size(dest), note: verified ? 'signature checked' : ext === 'aab' ? 'upload this to Google Play' : !signer ? 'signature NOT checked: apksigner was not found (install Android build-tools)' : '' });
      }
    } else if (s.kind === 'ios-plist') {
      fs.mkdirSync(path.dirname(s.file), { recursive: true });
      fs.writeFileSync(s.file, exportOptionsPlist({ method: s.method, team: s.team }));
    } else if (s.kind === 'ios-collect') {
      const ipas = newest(s.outDir, /\.ipa$/);
      if (!ipas.length) { console.error('  Xcode did not make an .ipa. Read the Xcode output above (a signing or provisioning problem is the usual cause).'); return { ok: false, artifacts }; }
      artifacts.push({ platform, file: ipas[0], sha: sha256(ipas[0]), size: size(ipas[0]), note: o.method === 'app-store' ? 'upload with Transporter or Xcode Organizer' : '' });
    } else if (s.kind === 'harmony-config') {
      const f = path.join(root, 'harmony', 'AppScope', 'app.json5');
      let text = fs.readFileSync(f, 'utf8');
      const have = Number((text.match(/"versionCode"\s*:\s*(\d+)/) || [])[1] || 1000000);
      const code = o.build ? Number(o.build) : o.bump ? have + 1 : have;
      text = text.replace(/"versionName"\s*:\s*"[^"]*"/, `"versionName": "${c.version}"`).replace(/"versionCode"\s*:\s*\d+/, `"versionCode": ${code}`);
      fs.writeFileSync(f, text);
      c.versionCode = code;
      const bp = readJson(path.join(root, 'harmony', 'build-profile.json5'));
      if (!bp || !bp.app || !(bp.app.signingConfigs || []).length) console.warn('  Note: harmony/build-profile.json5 has no signing configuration, so the files will be unsigned. Sign in DevEco Studio:\n        File > Project Structure > Signing Configs (tick "Automatically generate signature"), then build again.');
      console.log(`  versionName ${c.version}, versionCode ${code}`);
    } else if (s.kind === 'harmony-collect') {
      fs.mkdirSync(s.outDir, { recursive: true });
      const made = [...newest(path.join(root, 'harmony', 'entry', 'build'), /\.hap$/), ...newest(path.join(root, 'harmony', 'build'), /\.(app|hap)$/)];
      const seen = new Set();
      for (const f of made) {
        if (seen.has(path.basename(f))) continue;
        seen.add(path.basename(f));
        const dest = path.join(s.outDir, `${c.slug}-${c.version}-${path.basename(f)}`);
        fs.copyFileSync(f, dest);
        artifacts.push({ platform, file: dest, sha: sha256(dest), size: size(dest), note: /unsigned/.test(f) ? 'NOT signed: sign it in DevEco Studio before it installs' : '' });
      }
      if (!artifacts.length) { console.error('  hvigor made no .hap or .app. Read its output above.'); return { ok: false, artifacts }; }
    } else if (s.kind === 'run') {
      const code = await exec(s.cmd, s.args, s.cwd, s.android ? mobile.androidEnv() : {});
      if (code) { console.error(`\n  Step failed (${s.cmd} exited with ${code}).`); return { ok: false, artifacts }; }
    }
  }
  return { ok: true, artifacts };
}

function printPlan(platform, steps, root) {
  console.log(`\n  ${platform}`);
  steps.forEach((s, i) => {
    console.log(`    ${i + 1}. ${s.title}`);
    if (s.kind === 'run') console.log(`         $ ${[s.cmd, ...s.args].map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}   (in ${rel(root, s.cwd)})`);
    if (s.kind === 'site') console.log(`         $ kreft mobile:build ${s.args.join(' ')}`);
  });
}

function help() {
  console.log(`
  kreft mobile:release: a signed build of the phone app, ready for a store or for installing

    kreft mobile:release --android --api-url https://api.example.com     .apk and .aab
    kreft mobile:release --ios --team ABCDE12345 --api-url https://…     .ipa (a Mac with Xcode)
    kreft mobile:release --harmony --api-url https://…                   .hap and .app (DevEco Studio)
    kreft mobile:release --api-url https://…                             every platform that has a folder

  Common
    --api-url <https://…>     The server the app talks to (or PUBLIC_API_URL in .env). A store app must use https and a
                              real address.
    --no-api-url              The app needs no server (pages only). PUBLIC_API_URL in .env is ignored and not built in.
    --version <1.2.0>         The version people see (default: "version" in package.json)
    --build <number>          The build number the stores compare (Android versionCode, iOS build, HarmonyOS versionCode)
    --bump                    Add 1 to the current build number instead
    --out <folder>            Where the files go (default: release/, in .gitignore)
    --dry-run                 Show every step and change nothing

  Android      --apk | --aab (default: both)    --create-keystore  makes the signing key (see below)
  iOS          --team <ID> (or APPLE_TEAM_ID)   --method app-store | ad-hoc | development | enterprise
  HarmonyOS    --hap | --app (default: both)    signing is set in DevEco Studio

  Your signing key. Android: android/keystore.properties and the .jks it names. --create-keystore makes both once, with a
  random password. Copy them somewhere safe: without them the app can never be updated. They are never committed.
  Full guide: docs/README.md, "Publishing your app to Google Play and the App Store"
`);
}

async function main(args = []) {
  const o = parseArgs(args);
  if (o.help) return help();
  if (o.errors.length) { console.error('\n  ' + o.errors.join('\n  ') + '\n\n  kreft mobile:release --help\n'); process.exit(1); }
  const root = projectRoot();
  const lay = require('./layout.js').layout(root);
  if (!fs.existsSync(path.join(lay.frontend, 'index.html'))) { console.error('\n  This folder is not a Kreft app (no index.html). Go into your app first.\n'); process.exit(1); }
  if (!o.platforms.length) o.platforms = PLATFORMS.filter((p) => fs.existsSync(path.join(root, p)));
  if (!o.platforms.length) { console.error('\n  There is no android/, ios/ or harmony/ folder yet. Add one first:\n    kreft new my-app --mobile    (or: kreft mobile:init)     kreft harmony:init\n  or choose a platform: kreft mobile:release --android\n'); process.exit(1); }

  const problems = preflight(root, o);
  if (problems.length) { console.error('\n  Cannot make a release yet:\n' + problems.map((p) => '   - ' + p).join('\n') + '\n'); process.exit(1); }

  const c = context(root, o);
  c.versionCode = o.build ? Number(o.build) : null;
  const hv = o.platforms.includes('harmony') ? (require('./harmony.js').hvigorBin ? require('./harmony.js').hvigorBin() : null) : null;
  const plans = o.platforms.map((p) => [p, plan(p, root, o, c, { hvigor: hv })]);

  console.log(`\n  kreft mobile:release: ${c.name} ${c.version}${o.dryRun ? '  (dry run: nothing is changed)' : ''}`);
  if (o.dryRun) { for (const [p, steps] of plans) printPlan(p, steps, root); console.log('\n  Run again without --dry-run to build.\n'); return; }

  if (o.platforms.includes('harmony') && !hv) { console.error('\n  hvigor was not found. Install DevEco Studio and put its command line tools on the PATH (hvigorw), or build from DevEco Studio:\n    kreft harmony:open\n'); process.exit(1); }
  // the release folder is never committed
  const gi = path.join(root, '.gitignore');
  try { const t = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : ''; if (!/^\/?release\/?$/m.test(t)) fs.writeFileSync(gi, t.replace(/\n*$/, '\n') + '/release/\n'); } catch (_) { /* read-only */ }

  const all = [];
  let failed = null;
  for (const [p, steps] of plans) {
    const r = await runSteps(p, steps, root, o, c);
    all.push(...r.artifacts);
    if (!r.ok) { failed = p; break; }
  }
  if (all.length) {
    console.log('\n  Release files:');
    for (const a of all) console.log(`    ${rel(process.cwd(), a.file)}  (${a.size})${a.note ? '  ' + a.note : ''}\n      sha256 ${a.sha}`);
  }
  if (failed) { console.error(`\n  The ${failed} release failed. The files above (if any) were made before it stopped.\n`); process.exit(1); }
  console.log('\n  Done. Test the release file on a real device before you upload it.\n');
}

module.exports = { main, currentApiUrl, builtApiUrl, verifyBuiltApiUrl, ensureKeystore, readIosBuild, parseArgs, plan, preflight, apiUrlProblem, patchGradleSigning, patchGradleVersion, readGradleVersion, patchIgnore, parseProperties, exportOptionsPlist, context, createKeystore, help, SIGNING_MARK };
