// The documentation keeps up with the commands, and its links work
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const docs = fs.readFileSync(path.join(root, 'docs', 'README.md'), 'utf8');
const cli = fs.readFileSync(path.join(root, 'bin', 'kreftjs.js'), 'utf8');

// the same ids docs/markdown.js gives headings (a repeated heading gets -2, -3 …)
function headingIds(text) {
  const ids = new Set(), used = new Map();
  let fenced = false;
  for (const line of text.split('\n')) {
    if (/^```/.test(line)) { fenced = !fenced; continue; }
    const m = !fenced && line.match(/^#{1,6}\s+(.*)$/);
    if (!m) continue;
    let id = m[1].toLowerCase().replace(/<[^>]+>/g, '').replace(/[`*]/g, '').trim().replace(/[^\p{L}\p{M}\p{N}\s-]/gu, '').replace(/\s/g, '-');
    const seen = used.get(id) || 0;
    used.set(id, seen + 1);
    ids.add(seen ? `${id}-${seen + 1}` : id);
  }
  return ids;
}

test('every mobile and home command the CLI has is in the documentation', () => {
  const names = [...cli.matchAll(/^\s+'(mobile:[a-z]+|make:home|make:mobile)':/gm)].map((m) => m[1]);
  assert.ok(names.length >= 7, names.join(','));
  for (const n of names) assert.ok(docs.includes('kreft ' + n) || docs.includes('`mobile:' + n.replace(/^mobile:/, '')) || docs.includes('`' + n + '`'), n + ' is not in docs/README.md');
});

test('the documentation has the mobile sections people look for', () => {
  const ids = headingIds(docs);
  for (const id of ['mobile-apps-ios-and-android', 'run-it-on-an-emulator-a-simulator-or-a-phone', 'mobile-and-desktop-in-one-app', 'home-pages-made-for-apps', 'touch-events',
    'the-phone-ui-kit', 'top-bar-and-bottom-bar-that-never-move', 'components', 'native-features-kreftjsnative', 'app-icon-and-splash-screen', 'writing-your-own-edge-components',
    'mobile-troubleshooting', 'mobile-what-to-know']) assert.ok(ids.has(id), id + ' is missing');
});

test('every link inside the documentation points to a heading that exists', () => {
  const ids = headingIds(docs);
  const body = docs.replace(/```[\s\S]*?```/g, ''); // code samples may contain anything
  const broken = [...body.matchAll(/\]\(#([^)\s]+)\)/g)].map((m) => m[1]).filter((id) => !ids.has(id));
  assert.deepStrictEqual([...new Set(broken)], [], 'links to headings that do not exist: ' + [...new Set(broken)]);
});

test('the documented Java range is the one the CLI enforces', () => {
  const mobile = fs.readFileSync(path.join(root, 'bin', 'mobile.js'), 'utf8');
  const [min, max] = [Number(mobile.match(/JAVA_MIN = (\d+)/)[1]), Number(mobile.match(/JAVA_MAX = (\d+)/)[1])];
  assert.ok(docs.includes(`Java ${min}, ${min + 1} or ${max}`), 'docs/README.md must say Java ' + min + ' to ' + max);
});

test('mobile:dev shares the dev server on the network and allows the phone host names', () => {
  const mobile = fs.readFileSync(path.join(root, 'bin', 'mobile.js'), 'utf8');
  assert.match(mobile, /'dev', '--seed', '--host', '0\.0\.0\.0', '--port', port/, 'a new database is seeded');
  assert.match(mobile, /--no-setup/, 'the first-run setup can be skipped');
  assert.match(mobile, /setupApp\(root\)/, 'and runs before the server starts');
  assert.match(mobile, /KREFT_ALLOWED_HOSTS: allowed/);
  assert.match(mobile, /'10\.0\.2\.2'/);
});

test('the documentation covers what a person needs around the commands', () => {
  const row = docs.split('\n').find((l) => l.startsWith('| `kreft new my-app`'));
  for (const f of ['--mobile', '--electron', '--vite', '--redis']) assert.ok(row.includes(f), 'the kreft new row must list ' + f);
  assert.match(docs, /\| Splash screen \| `splash\.set\(/, 'the native API table has a Splash row');
  assert.ok(docs.split('## Environment variables')[1].split('## API cheat sheet')[0].includes('`PUBLIC_API_URL`'), 'PUBLIC_API_URL is in the environment variables');
  assert.ok(docs.split('## Production checklist')[1].split('## Known limits')[0].includes('--api-url'), 'the production checklist has the phone app rows');
  assert.match(docs.split('## Security overview')[1].split('## Production checklist')[0], /### In the phone app/, 'the security overview has a phone app part');
  assert.ok(docs.split('## Known limits')[1].split('# Reference')[0].includes('Phone apps run'), 'known limits mention phone apps');
  const ids = headingIds(docs);
  assert.ok(ids.has('publishing-your-app-to-google-play-and-the-app-store'));
  assert.ok(!docs.includes('a card that shows the touch events)'), 'the home page text matches the new design');
  assert.match(docs, /Use a network you trust/, 'live reload says the dev server is open to the network');
});

test('the root README, the generated README and the types know about the phone apps', () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.match(readme, /kreft mobile:run --android/);
  assert.match(readme, /\| \*\*Phone apps\*\* \|/);
  const dts = fs.readFileSync(path.join(root, 'kreftjs.d.ts'), 'utf8');
  assert.match(dts, /splash: \{ config: \{ minTime: number/);
  assert.strictEqual(dts, fs.readFileSync(path.join(root, 'templates', 'app', 'frontend', 'kreftjs.d.ts'), 'utf8'), 'the template copy is the same file');
});

test('the docs describe what mobile:dev really does, as checked on the emulator', () => {
  assert.match(docs, /\| `kreft mobile:dev \[--android\] \[--ios\] \[--target id\] \[--no-setup\]` \|/);
  assert.match(docs, /picks the running emulator by itself, uses `10\.0\.2\.2`/);
  assert.match(docs, /takes the next free port if 8000 is busy/);
  assert.match(docs, /live reload with `kreft mobile:dev` \(a saved edit shows in the running app within seconds\)/);
  assert.doesNotMatch(docs, /native plugins are checked in the Android emulator; iOS has not/, 'the old, narrower caveat is gone');
});

/* ---------------- the Arabic book: chapter 21 ---------------- */

const chapter = fs.readFileSync(path.join(root, 'book', 'ar', '21-mobile.md'), 'utf8');

test('the Arabic book has the mobile chapter, listed in its index, naming every mobile command', () => {
  const index = fs.readFileSync(path.join(root, 'book', 'ar', 'README.md'), 'utf8');
  assert.match(index, /\]\(21-mobile\.md\)/, 'the index links to chapter 21');
  assert.match(chapter, /^# الفصل الحادي والعشرون: /m);
  const names = [...cli.matchAll(/^\s+'(mobile:[a-z]+|make:home|make:mobile)':/gm)].map((m) => m[1]);
  for (const n of names) assert.ok(chapter.includes('kreft ' + n) || chapter.includes('`' + n + '`') || chapter.includes('`kreft ' + n.replace('mobile:', 'mobile:')), n + ' is not in chapter 21');
  for (const must of ['kreft mobile:run', '10.0.2.2', 'edge.setTop', 'Kreftjs.native', 'edge-splash', 'org.gradle.java.home', 'Generate Signed App Bundle', '--api-url', 'mobile:setup']) assert.ok(chapter.includes(must), 'chapter 21 must mention ' + must);
  assert.match(chapter, /لم يُجرَّب/, 'it says plainly what was not tested');
});

test('the example in chapter 21 compiles and uses only parts that exist', () => {
  const m = /صفحة `pages\/Tasks\.kreft`[\s\S]*?```html\n([\s\S]*?)```/.exec(chapter);
  assert.ok(m, 'the example is in the chapter');
  const os = require('os');
  const { spawnSync } = require('child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-book-'));
  const run = (args, cwd) => spawnSync(process.execPath, [path.join(root, 'bin', 'kreftjs.js'), ...args], { cwd, encoding: 'utf8' });
  assert.strictEqual(run(['new', 'a1', '--js', '--mobile', '--no-auth'], dir).status, 0);
  const app = path.join(dir, 'a1');
  fs.writeFileSync(path.join(app, 'frontend', 'pages', 'Tasks.kreft'), m[1]);
  const routes = path.join(app, 'frontend', 'routes', 'web.kreft');
  fs.appendFileSync(routes, "\nRoute.view('/tasks', 'pages/Tasks.kreft').name('tasks').title('Tasks').layout('mobile')\n");
  const b = run(['build'], app);
  assert.strictEqual(b.status, 0, b.stdout + b.stderr);
  assert.ok(fs.readFileSync(path.join(app, 'dist', 'app.js'), 'utf8').includes('edge-list'), 'the page is in the build');
  for (const tag of m[1].match(/<edge-[a-z-]+/g)) assert.ok(fs.existsSync(path.join(app, 'frontend', 'components', 'edge', tag.slice(1).split('-').map((p) => p[0].toUpperCase() + p.slice(1)).join('') + '.kreft')), tag + ' exists');
});
