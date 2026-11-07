// App-style home pages: kreft new --mobile / --electron, kreft make:home
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const cli = path.join(__dirname, '..', 'bin', 'kreftjs.js');
const run = (args, cwd) => spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-home-'));
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');

function make(flags) {
  const dir = tmp();
  const r = run(['new', 'app1', '--js', '--no-auth', ...flags], dir);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  return path.join(dir, 'app1', 'frontend');
}

test('--mobile: the home page is the phone screen, built from edge components, inside the layout that holds the bars', () => {
  const f = make(['--mobile']);
  assert.match(read(f, 'pages', 'Home.kreft'), /<home-mobile>/);
  assert.doesNotMatch(read(f, 'pages', 'Home.kreft'), /home-desktop/);
  const m = read(f, 'components', 'HomeMobile.kreft');
  assert.match(m, /<edge-gesture-area @tap="hit\(\)"/);
  assert.match(m, /<edge-pressable k-each="t in tiles"/);
  assert.doesNotMatch(m, /<edge-shell>|<edge-bottom-nav/, 'the bars come from layouts/mobile.kreft');
  assert.match(read(f, 'index.html'), /\.component\('HomeMobile', 'components\/HomeMobile\.kreft'\)/);
  assert.match(read(f, 'index.html'), /layout: 'mobile'/);
  assert.ok(!fs.existsSync(path.join(f, 'components', 'HomeDesktop.kreft')));
});

test('--electron: the home page is the desktop workspace with a sidebar and the desktop bridge', () => {
  const f = make(['--electron']);
  assert.match(read(f, 'pages', 'Home.kreft'), /<home-desktop>/);
  const d = read(f, 'components', 'HomeDesktop.kreft');
  assert.match(d, /class="side"/);
  assert.match(d, /kreftDesktop\.getInfo/);
  assert.match(read(f, 'index.html'), /\.component\('HomeDesktop'/);
});

test('both: Home.kreft switches by platform and ?platform= overrides it', () => {
  const f = make(['--mobile', '--electron']);
  const h = read(f, 'pages', 'Home.kreft');
  assert.match(h, /<home-desktop k-if="desktop">/);
  assert.match(h, /<home-mobile k-else>/);
  assert.match(h, /get\('platform'\)/);
});

test('a project without --mobile or --electron keeps the web welcome page', () => {
  const f = make([]);
  assert.ok(!fs.existsSync(path.join(f, 'components', 'HomeMobile.kreft')));
  assert.match(read(f, 'pages', 'Home.kreft'), /welcome-container/);
});

test('no-auth projects get no links to pages that do not exist; with auth they get the dashboard', () => {
  const noAuth = read(make(['--mobile']), 'components', 'HomeMobile.kreft');
  assert.doesNotMatch(noAuth, /\/dashboard|\/profile|\/users/);
  const dir = tmp();
  assert.strictEqual(run(['new', 'app2', '--js', '--auth', '--mobile'], dir).status, 0);
  const withAuth = read(dir, 'app2', 'frontend', 'components', 'HomeMobile.kreft');
  assert.match(withAuth, /\/dashboard/);
  assert.match(withAuth, /\/profile/);
});

test('the generated pages build', () => {
  const f = make(['--mobile', '--electron']);
  const r = run(['build'], path.dirname(f));
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
});

test('make:home rewrites an existing project and keeps the other platform', () => {
  const f = make(['--mobile']);
  const root = path.dirname(f);
  assert.strictEqual(run(['make:home', '--desktop'], root).status, 0);
  assert.ok(fs.existsSync(path.join(f, 'components', 'HomeDesktop.kreft')));
  assert.match(read(f, 'pages', 'Home.kreft'), /home-mobile/); // the phone one is still there
  assert.strictEqual(run(['make:home', '--desktop'], root).status, 0); // twice: no duplicate registration
  assert.strictEqual((read(f, 'index.html').match(/component\('HomeDesktop'/g) || []).length, 1);
});
