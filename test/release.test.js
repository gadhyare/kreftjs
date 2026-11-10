// kreft mobile:release: the arguments, the guards, the Android signing patch, and the plan for each platform.
// A real Android release build was run by hand for this feature (see the docs); here nothing starts Gradle, Xcode or hvigor.   Run: npm test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const R = require('../bin/release.js');
const KREFT = path.join(__dirname, '..', 'bin', 'kreftjs.js');

// what Capacitor 7 writes
const GRADLE = `apply plugin: 'com.android.application'

android {
    namespace "com.acme.app"
    compileSdk rootProject.ext.compileSdkVersion
    defaultConfig {
        applicationId "com.acme.app"
        versionCode 7
        versionName "1.0"
    }
    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}
`;

function app({ android = true, ios = false, harmony = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-release-'));
  fs.mkdirSync(path.join(dir, 'frontend'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'backend'));
  fs.writeFileSync(path.join(dir, 'frontend', 'index.html'), '<!doctype html><script src="kreftjs.js"></script>');
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'demo-app', version: '2.3.4' }));
  fs.writeFileSync(path.join(dir, 'capacitor.config.json'), JSON.stringify({ appId: 'com.acme.demo', appName: 'Demo App' }));
  if (android) { fs.mkdirSync(path.join(dir, 'android', 'app'), { recursive: true }); fs.writeFileSync(path.join(dir, 'android', 'app', 'build.gradle'), GRADLE); }
  if (ios) fs.mkdirSync(path.join(dir, 'ios', 'App', 'App.xcworkspace'), { recursive: true });
  if (harmony) fs.mkdirSync(path.join(dir, 'harmony'), { recursive: true });
  return dir;
}
const cleanup = (d) => fs.rmSync(d, { recursive: true, force: true });
const kreft = (args, cwd) => cp.spawnSync(process.execPath, [KREFT, ...args], { cwd, encoding: 'utf8' });

test('the arguments: platforms, formats, versions, and every mistake is reported', () => {
  const o = R.parseArgs(['--android', '--ios', '--api-url', 'https://a.test', '--version=1.2.0', '--build', '9', '--bump', '--team', 'ABCDE12345', '--method', 'ad-hoc', '--out=dist-rel', '--dry-run', '--aab']);
  assert.deepStrictEqual(o.platforms, ['android', 'ios']);
  assert.deepStrictEqual([o.apiUrl, o.version, o.build, o.bump, o.team, o.method, o.out, o.dryRun, o.aab, o.apk], ['https://a.test', '1.2.0', '9', true, 'ABCDE12345', 'ad-hoc', 'dist-rel', true, true, false]);
  assert.deepStrictEqual(R.parseArgs(['--harmony', '--hap']).platforms, ['harmony']);
  const bad = R.parseArgs(['--nope', '--build', '0', '--method', 'x', '--team', 'abc', '--version', '!!', '--api-url']);
  assert.ok(bad.errors.length >= 6, bad.errors.join(' | '));
  for (const re of [/unknown option --nope/, /--build must be a whole number/, /--method must be one of/, /10-character Apple Team ID/, /not a version number/, /--api-url needs a value/]) assert.ok(bad.errors.some((e) => re.test(e)), String(re));
});

test('a store app must reach a real server over https', () => {
  assert.strictEqual(R.apiUrlProblem('https://api.example.com'), null);
  assert.strictEqual(R.apiUrlProblem('https://api.example.com/v1'), null);
  assert.match(R.apiUrlProblem('http://api.example.com'), /not https/);
  for (const u of ['https://localhost:8000', 'https://127.0.0.1', 'https://10.0.2.2:8000', 'https://192.168.1.20', 'https://10.1.2.3', 'https://172.16.0.5', 'https://nas.local']) assert.match(R.apiUrlProblem(u), /inside your own network|cannot reach/, u);
  assert.match(R.apiUrlProblem('api.example.com'), /not a full address/);
});

test('android: the signing is added to build.gradle once, and a setup you made by hand is left alone', () => {
  const a = R.patchGradleSigning(GRADLE);
  assert.strictEqual(a.changed, true);
  assert.ok(a.text.includes(R.SIGNING_MARK));
  assert.match(a.text, /rootProject\.file\('keystore\.properties'\)/);
  assert.match(a.text, /signingConfigs \{\s*release \{/);
  assert.match(a.text, /buildTypes \{\s*release \{\s*signingConfig signingConfigs\.release\s*minifyEnabled false/, 'the release build type uses it, its own lines stay');
  assert.ok(a.text.indexOf('def keystoreProperties') < a.text.indexOf('android {'), 'the helper is above the android block');
  assert.strictEqual(R.patchGradleSigning(a.text).changed, false, 'a second run changes nothing');
  assert.strictEqual(R.patchGradleSigning(a.text).text, a.text);
  const byHand = GRADLE.replace('release {\n', 'release {\n            signingConfig signingConfigs.release\n');
  assert.strictEqual(R.patchGradleSigning(byHand).changed, false, 'the manual setup from the docs is recognised');
  assert.match(R.patchGradleSigning('android { }').problem, /apply plugin/);
  assert.match(R.patchGradleSigning("apply plugin: 'com.android.application'\nandroid { }").problem, /buildTypes/);
});

test('android: the version numbers are read and written, and the keystore files are ignored by git', () => {
  assert.deepStrictEqual(R.readGradleVersion(GRADLE), { code: 7, name: '1.0' });
  const t = R.patchGradleVersion(GRADLE, { code: 8, name: '2.3.4' });
  assert.deepStrictEqual(R.readGradleVersion(t), { code: 8, name: '2.3.4' });
  assert.strictEqual(R.patchGradleVersion(GRADLE, {}), GRADLE, 'nothing given, nothing changed');
  const g = R.patchIgnore('*.apk\n');
  assert.strictEqual(g.changed, true);
  for (const l of ['*.jks', '*.keystore', 'keystore.properties']) assert.ok(g.text.split('\n').includes(l), l);
  assert.strictEqual(R.patchIgnore(g.text).changed, false);
  assert.deepStrictEqual(R.parseProperties('# c\nstoreFile=../a.jks\nstorePassword = x y\n'), { storeFile: '../a.jks', storePassword: 'x y' });
});

test('android: --create-keystore makes a key and a private properties file, and never replaces one', { skip: cp.spawnSync('keytool', ['-help'], { stdio: 'ignore' }).error ? 'keytool (Java) is not installed' : false }, () => {
  const dir = app();
  try {
    const c = R.context(dir, R.parseArgs([]));
    const k = R.createKeystore(dir, c, {});
    assert.ok(!k.problem, k.problem);
    const props = R.parseProperties(fs.readFileSync(k.props, 'utf8'));
    assert.deepStrictEqual([props.storeFile, props.keyAlias], ['../upload-keystore.jks', 'upload']);
    assert.ok(props.storePassword.length >= 20 && props.storePassword === props.keyPassword);
    assert.ok(fs.existsSync(k.jks));
    if (process.platform !== 'win32') assert.strictEqual(fs.statSync(k.props).mode & 0o077, 0, 'only you can read the passwords');
    const list = cp.spawnSync('keytool', ['-list', '-keystore', k.jks, '-storepass', props.storePassword], { encoding: 'utf8' });
    assert.match(list.stdout, /upload/);
    assert.match(R.createKeystore(dir, c, {}).problem, /already exists.*not replaced/s);
  } finally { cleanup(dir); }
});

test('android: --create-keystore with a key that exists keeps it and carries on; a half-missing pair is never "repaired"', { skip: cp.spawnSync('keytool', ['-help'], { stdio: 'ignore' }).error ? 'keytool (Java) is not installed' : false }, () => {
  const dir = app();
  try {
    const c = R.context(dir, R.parseArgs([]));
    const first = R.ensureKeystore(dir, c, {});
    assert.strictEqual(first.state, 'created');
    const jks = fs.readFileSync(first.jks), props = fs.readFileSync(first.props, 'utf8');
    const again = R.ensureKeystore(dir, c, {});
    assert.strictEqual(again.state, 'kept', 'the same command run again goes on with the key it has');
    assert.ok(fs.readFileSync(again.jks).equals(jks) && fs.readFileSync(again.props, 'utf8') === props, 'neither file was touched');
    fs.rmSync(first.props);
    assert.match(R.ensureKeystore(dir, c, {}).problem, /Only one of .* exists. Nothing was replaced/);
    assert.ok(fs.existsSync(first.jks), 'the key that is left is not deleted or replaced');
  } finally { cleanup(dir); }
});

test('android: the plan builds the site, signs, runs Gradle with the tasks asked for, and collects the files', () => {
  const dir = app();
  try {
    const p = (extra = []) => R.plan('android', dir, R.parseArgs(['--android', '--api-url', 'https://a.test', ...extra]));
    let steps = p();
    assert.deepStrictEqual(steps[0].args, ['--android', '--api-url', 'https://a.test']);
    const gradle = steps.find((s) => s.kind === 'run');
    assert.deepStrictEqual(gradle.args, ['assembleRelease', 'bundleRelease', '--no-daemon'], 'both by default');
    assert.strictEqual(path.basename(gradle.cmd), process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
    assert.strictEqual(gradle.cwd, path.join(dir, 'android'));
    assert.strictEqual(gradle.android, true, 'run with the Java the build needs');
    assert.deepStrictEqual(p(['--apk']).find((s) => s.kind === 'run').args, ['assembleRelease', '--no-daemon']);
    assert.deepStrictEqual(p(['--aab']).find((s) => s.kind === 'run').args, ['bundleRelease', '--no-daemon']);
    assert.deepStrictEqual(p(['--apk', '--aab']).find((s) => s.kind === 'run').args, ['assembleRelease', 'bundleRelease', '--no-daemon']);
    assert.deepStrictEqual(steps.map((s) => s.kind), ['site', 'android-config', 'run', 'android-collect']);
    assert.strictEqual(steps[3].outDir, path.join(dir, 'release', 'android'));
  } finally { cleanup(dir); }
});

test('ios: the plan archives with Xcode, exports an ipa, and carries the team, version and build', () => {
  const dir = app({ ios: true });
  try {
    const steps = R.plan('ios', dir, R.parseArgs(['--ios', '--api-url', 'https://a.test', '--team', 'ABCDE12345', '--version', '1.4.0', '--build', '12', '--method', 'ad-hoc']));
    const [archive, exp] = steps.filter((s) => s.kind === 'run');
    assert.strictEqual(archive.cmd, 'xcodebuild');
    assert.ok(archive.args.includes('-workspace') && archive.args.includes(path.join(dir, 'ios', 'App', 'App.xcworkspace')));
    for (const a of ['-scheme', 'App', '-configuration', 'Release', 'generic/platform=iOS', 'archive', '-allowProvisioningUpdates', 'DEVELOPMENT_TEAM=ABCDE12345', 'MARKETING_VERSION=1.4.0', 'CURRENT_PROJECT_VERSION=12']) assert.ok(archive.args.includes(a), a);
    assert.ok(exp.args.includes('-exportArchive') && exp.args.includes('-exportOptionsPlist'));
    assert.strictEqual(steps.find((s) => s.kind === 'ios-plist').method, 'ad-hoc');
    const plist = R.exportOptionsPlist({ method: 'app-store', team: 'ABCDE12345' });
    assert.match(plist, /<key>method<\/key>\s*<string>app-store<\/string>/);
    assert.match(plist, /<key>teamID<\/key>\s*<string>ABCDE12345<\/string>/);
    assert.match(plist, /<key>signingStyle<\/key>\s*<string>automatic<\/string>/);
    // --bump reads the number the project has now
    fs.mkdirSync(path.join(dir, 'ios', 'App', 'App.xcodeproj'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj'), 'CURRENT_PROJECT_VERSION = 41;\nCURRENT_PROJECT_VERSION = 41;');
    assert.strictEqual(R.readIosBuild(dir), 41);
    const bumped = R.plan('ios', dir, R.parseArgs(['--ios', '--bump', '--team', 'ABCDE12345'])).find((s) => s.kind === 'run');
    assert.ok(bumped.args.includes('CURRENT_PROJECT_VERSION=42'));
  } finally { cleanup(dir); }
});

test('harmonyos: the plan builds the site, sets the version, and runs hvigor for the .hap and the .app', () => {
  const dir = app({ android: false, harmony: true });
  try {
    const steps = (extra = []) => R.plan('harmony', dir, R.parseArgs(['--harmony', '--api-url', 'https://a.test', ...extra]), undefined, { hvigor: '/x/hvigorw' });
    const runs = steps().filter((s) => s.kind === 'run');
    assert.deepStrictEqual(runs.map((s) => s.args.includes('assembleHap') ? 'hap' : 'app'), ['hap', 'app'], 'both by default');
    assert.ok(runs[0].args.includes('buildMode=release') && runs[0].cmd === '/x/hvigorw' && runs[0].cwd === path.join(dir, 'harmony'));
    assert.strictEqual(steps(['--hap']).filter((s) => s.kind === 'run').length, 1);
    assert.ok(steps(['--app']).find((s) => s.kind === 'run').args.includes('assembleApp'));
    assert.deepStrictEqual(steps()[0].args, ['--api-url', 'https://a.test']);
  } finally { cleanup(dir); }
});

test('before anything runs: server address, signing key, folders, Xcode and team are checked', () => {
  const dir = app();
  try {
    const check = (args) => R.preflight(dir, R.parseArgs(args));
    assert.ok(check(['--android']).some((p) => /address of your server/.test(p)), 'no server address');
    assert.ok(check(['--android', '--no-api-url', '--create-keystore']).length === 0, '--no-api-url and --create-keystore are enough');
    assert.ok(check(['--android', '--api-url', 'http://x.test', '--create-keystore']).some((p) => /not https/.test(p)));
    assert.ok(check(['--android', '--api-url', 'https://a.test']).some((p) => /no signing key/.test(p)), 'no keystore.properties');
    assert.ok(check(['--android', '--api-url', 'https://a.test', '--dry-run']).length === 0, 'a dry run shows the plan anyway');
    assert.ok(check(['--ios', '--api-url', 'https://a.test', '--dry-run']).some((p) => /no ios\/ folder.*mobile:build --ios/.test(p)));
    assert.ok(check(['--harmony', '--api-url', 'https://a.test', '--dry-run']).some((p) => /no harmony\/ folder.*harmony:init/.test(p)));
    fs.mkdirSync(path.join(dir, 'ios'));
    assert.ok(check(['--ios', '--api-url', 'https://a.test', '--dry-run']).some((p) => /Apple Team ID/.test(p)));
    fs.writeFileSync(path.join(dir, '.env'), 'PUBLIC_API_URL=https://from-env.test\n');
    assert.ok(!check(['--android', '--create-keystore']).some((p) => /address of your server/.test(p)), 'PUBLIC_API_URL in .env is used');
  } finally { cleanup(dir); }
});

test('an app with no server: --no-api-url ignores a stale PUBLIC_API_URL in .env and builds without any address', () => {
  const dir = app();
  try {
    fs.writeFileSync(path.join(dir, '.env'), 'PUBLIC_API_URL=http://10.0.2.2:8000\n');
    // without the flag the leftover test address stops the release, and says where it comes from and what to do
    const blocked = R.preflight(dir, R.parseArgs(['--android', '--create-keystore']));
    assert.strictEqual(blocked.length, 1);
    assert.match(blocked[0], /not https/);
    assert.match(blocked[0], /comes from PUBLIC_API_URL in your \.env/);
    assert.match(blocked[0], /--no-api-url/);
    // an address typed on the command line is not blamed on .env
    assert.doesNotMatch(R.preflight(dir, R.parseArgs(['--android', '--create-keystore', '--api-url', 'http://x.test']))[0], /comes from/);
    // with the flag: no problem, and the plan builds the site without an address and says so
    assert.deepStrictEqual(R.preflight(dir, R.parseArgs(['--android', '--create-keystore', '--no-api-url'])), []);
    const site = R.plan('android', dir, R.parseArgs(['--android', '--no-api-url']))[0];
    assert.deepStrictEqual(site.args, ['--android']);
    assert.strictEqual(site.noApi, true);
    assert.match(site.title, /no server address.*ignored/);
    assert.strictEqual(R.plan('android', dir, R.parseArgs(['--android', '--api-url', 'https://a.test']))[0].noApi, false);
    fs.mkdirSync(path.join(dir, 'harmony'));
    assert.strictEqual(R.plan('harmony', dir, R.parseArgs(['--harmony', '--no-api-url']), undefined, { hvigor: 'h' })[0].noApi, true);
    // the run step puts an empty PUBLIC_API_URL in the environment, which wins over .env
    assert.match(fs.readFileSync(path.join(__dirname, '..', 'bin', 'release.js'), 'utf8'), /process\.env\.PUBLIC_API_URL = s\.noApi \? ''/);
  } finally { cleanup(dir); }
});

test('the command: --dry-run shows every step and changes nothing; mistakes stop it with a message', () => {
  const dir = app({ ios: true, harmony: true });
  try {
    const snapshot = () => JSON.stringify([fs.readdirSync(dir).sort(), fs.readFileSync(path.join(dir, 'android', 'app', 'build.gradle'), 'utf8')]);
    const before = snapshot();
    const r = kreft(['mobile:release', '--api-url', 'https://api.example.com', '--team', 'ABCDE12345', '--dry-run'], dir);
    assert.strictEqual(r.status, 0, r.stderr);
    for (const re of [/dry run: nothing is changed/, /Demo App 2\.3\.4/, /\n  android\n/, /\n  ios\n/, /\n  harmony\n/, /gradlew.*assembleRelease bundleRelease/, /xcodebuild.*archive/, /xcodebuild -exportArchive|-exportArchive/, /assembleHap/, /assembleApp/]) assert.match(r.stdout, re);
    assert.strictEqual(snapshot(), before, 'a dry run writes nothing (no release/, no gradle change)');

    let bad = kreft(['mobile:release', '--android'], dir);
    assert.strictEqual(bad.status, 1);
    assert.match(bad.stderr, /address of your server/);
    bad = kreft(['mobile:release', '--build', 'x'], dir);
    assert.strictEqual(bad.status, 1);
    assert.match(bad.stderr, /--build must be a whole number/);
    const help = kreft(['mobile:release', '--help'], dir);
    assert.strictEqual(help.status, 0);
    for (const t of ['--android', '--ios', '--harmony', '--create-keystore', '--team', '--bump', '--dry-run', '.apk', '.ipa', '.hap']) assert.ok(help.stdout.includes(t), t);
    const empty = app({ android: false });
    try { assert.match(kreft(['mobile:release', '--api-url', 'https://a.test'], empty).stderr, /no android\/, ios\/ or harmony\/ folder/); } finally { cleanup(empty); }
    const notApp = fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-notapp-'));
    try { fs.writeFileSync(path.join(notApp, 'package.json'), '{}'); assert.match(kreft(['mobile:release', '--android'], notApp).stderr, /not a Kreft app/); } finally { cleanup(notApp); }
  } finally { cleanup(dir); }
});

test('the command is wired in, listed in the help, and documented', () => {
  const cli = fs.readFileSync(path.join(__dirname, '..', 'bin', 'kreftjs.js'), 'utf8');
  assert.match(cli, /'mobile:release': \(a\) => require\('\.\/release\.js'\)\.main\(a\)/);
  assert.match(cli, /kreft mobile:release +A signed release/);
  const docs = fs.readFileSync(path.join(__dirname, '..', 'docs', 'README.md'), 'utf8');
  const guide = docs.split('### Publishing your app to Google Play and the App Store')[1].split('### Writing your own edge components')[0];
  for (const t of ['kreft mobile:release', '--create-keystore', '--bump', '--dry-run', '--team', '--method', 'release/android', 'SHA-256']) assert.ok(guide.includes(t), 'the release guide mentions ' + t);
});
