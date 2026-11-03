// kreft build writes dist/.htaccess: page addresses open index.html, but /api/ and missing files stay real 404s
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CLI = path.join(__dirname, '..', 'bin', 'kreftjs.js');

function site(...flags) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-htaccess-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><html><head><base href="/"></head><body><div id="app"></div><script src="kreftjs.js"></script><script>Kreftjs.app("App.kreft").mount("#app")</script></body></html>');
  fs.writeFileSync(path.join(dir, 'App.kreft'), '<view><p>hi</p></view>\n');
  const out = path.join(dir, 'out');
  const r = spawnSync(process.execPath, [CLI, 'build', dir, '--out', out, ...flags], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  return { dir, out };
}

test('build: .htaccess sends page addresses to index.html, not /api/ or files', () => {
  const { dir, out } = site();
  try {
    const rules = fs.readFileSync(path.join(out, '.htaccess'), 'utf8');
    assert.match(rules, /RewriteBase \/\n/);
    assert.match(rules, /RewriteCond %\{REQUEST_FILENAME\} !-f/);
    // a folder without an index.html (the docs/ folder next to the /docs page) must not end in a 403
    assert.match(rules, /RewriteCond %\{REQUEST_FILENAME\}\/index\.html !-f/);
    assert.doesNotMatch(rules, /!-d/);
    assert.match(rules, /RewriteCond %\{REQUEST_URI\} !\^\/api\//);
    assert.match(rules, /RewriteCond %\{REQUEST_URI\} !\\\.\[A-Za-z0-9\]\+\$/);
    assert.match(rules, /RewriteRule \. \/index\.html \[L\]/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('build --base /app/: the rules follow the folder; --no-htaccess writes nothing', () => {
  const a = site('--base', '/app/');
  try {
    const rules = fs.readFileSync(path.join(a.out, '.htaccess'), 'utf8');
    assert.match(rules, /RewriteBase \/app\//);
    assert.match(rules, /!\^\/app\/api\//);
    assert.match(rules, /RewriteRule \. \/app\/index\.html \[L\]/);
  } finally { fs.rmSync(a.dir, { recursive: true, force: true }); }
  const b = site('--no-htaccess');
  try { assert.ok(!fs.existsSync(path.join(b.out, '.htaccess'))); }
  finally { fs.rmSync(b.dir, { recursive: true, force: true }); }
});
