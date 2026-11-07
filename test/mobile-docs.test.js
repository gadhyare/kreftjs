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
  assert.match(mobile, /'dev', '--host', '0\.0\.0\.0', '--port', port/);
  assert.match(mobile, /KREFT_ALLOWED_HOSTS: allowed/);
  assert.match(mobile, /'10\.0\.2\.2'/);
});
