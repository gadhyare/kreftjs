'use strict';
// `kreft install luxon` judges luxon and the NEW packages it brings. A problem in a package the project already had (electron-builder,
// Tauri, Capacitor…) is reported but does not stop you installing something else. What protects the installation itself still blocks.
// Run: npm test
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { policy } = require('../bin/security/policy.js');
const { evaluate, install, renderStatus } = require('../bin/security/install.js');
const { judgedLocations, resolveLocation, reach, ALWAYS_BLOCKING } = require('../bin/security/scope.js');

const integrity = (n) => 'sha512-' + Buffer.alloc(64, n).toString('base64');
const entry = (name, version, extra = {}) => ({ version, resolved: `https://registry.npmjs.org/${name}/-/${name.split('/').pop()}-${version}.tgz`, integrity: integrity(version.length + name.length), ...extra });
const lockOf = (pkgs, root = {}) => ({ lockfileVersion: 3, packages: { '': root, ...pkgs } });
const metaFor = (lock) => new Map(Object.entries(lock.packages).filter(([k]) => k).map(([loc, n]) => {
  const name = n.name || loc.split('node_modules/').pop();
  return [`${name}@${n.version}`, { name, version: n.version, license: 'MIT', maintainers: [{ name: 'm' }], repository: 'https://example.org/r', dist: { integrity: n.integrity, tarball: n.resolved } }];
}));
const audit = (vulns = {}) => ({ auditReportVersion: 2, vulnerabilities: vulns });
const advisory = (name, severity = 'high', extra = {}) => ({ [name]: { name, severity, nodes: [`node_modules/${name}`], via: [{ title: 'Prototype pollution', url: 'https://example.org/a' }], ...extra } });

// a project with an old dependency (oldpkg, which needs old-child) and a request for example (which needs child)
const graph = () => lockOf({
  'node_modules/oldpkg': entry('oldpkg', '1.0.0', { dependencies: { 'old-child': '1.0.0' } }),
  'node_modules/old-child': entry('old-child', '1.0.0'),
  'node_modules/example': entry('example', '1.0.0', { dependencies: { child: '1.0.0', shared: '1.0.0' } }),
  'node_modules/child': entry('child', '1.0.0'),
  'node_modules/shared': entry('shared', '1.0.0'),
}, { dependencies: { oldpkg: '1.0.0', example: '1.0.0' } });
const manifest = { name: 'app', dependencies: { oldpkg: '1.0.0', shared: '1.0.0' } };

test('node resolution: a package finds its dependency next to it, nested, or higher up', () => {
  const packages = { 'node_modules/a': {}, 'node_modules/b': {}, 'node_modules/a/node_modules/b': {}, 'node_modules/@s/pkg': {}, 'node_modules/@s/pkg/node_modules/c': {}, 'node_modules/c': {} };
  assert.equal(resolveLocation(packages, '', 'b'), 'node_modules/b');
  assert.equal(resolveLocation(packages, 'node_modules/a', 'b'), 'node_modules/a/node_modules/b', 'its own nested copy first');
  assert.equal(resolveLocation(packages, 'node_modules/@s/pkg', 'c'), 'node_modules/@s/pkg/node_modules/c', 'a scoped package');
  assert.equal(resolveLocation(packages, 'node_modules/@s/pkg/node_modules/c', 'a'), 'node_modules/a', 'then up the tree');
  assert.equal(resolveLocation(packages, 'node_modules/a', 'nothing'), null);
});

test('the judged packages are the requested ones and the new ones they bring, not what the project already had', () => {
  const lock = graph();
  const j = judgedLocations(lock, { requested: ['example'], manifest });
  assert.deepEqual([...j].sort(), ['node_modules/child', 'node_modules/example'], 'example and its new dependency');
  assert.ok(!j.has('node_modules/oldpkg') && !j.has('node_modules/old-child'), 'the old dependency tree is not judged');
  assert.ok(!j.has('node_modules/shared'), 'a package the project already depended on is not judged just because the new one uses it too');
  assert.deepEqual([...reach(lock, new Set(['oldpkg']))].sort(), ['node_modules/old-child', 'node_modules/oldpkg']);
});

test('a lockfile that already had a package, with the same version and integrity, means it is not new', () => {
  const lock = graph();
  const previous = lockOf({ 'node_modules/child': lock.packages['node_modules/child'] });
  assert.ok(!judgedLocations(lock, { requested: ['example'], manifest: {}, previousLock: previous }).has('node_modules/child'), 'child was in the old lockfile as it is');
  const bumped = structuredClone(previous); bumped.packages['node_modules/child'].version = '0.9.0';
  assert.ok(judgedLocations(lock, { requested: ['example'], manifest: {}, previousLock: bumped }).has('node_modules/child'), 'a different version is a new package');
  const rebuilt = structuredClone(previous); rebuilt.packages['node_modules/child'].integrity = integrity(99);
  assert.ok(judgedLocations(lock, { requested: ['example'], manifest: {}, previousLock: rebuilt }).has('node_modules/child'), 'and so is different bytes');
});

test('asking for a package the project already has (an upgrade) judges it', () => {
  const lock = graph();
  const j = judgedLocations(lock, { requested: ['oldpkg'], manifest });
  assert.ok(j.has('node_modules/oldpkg'));
  assert.ok(!j.has('node_modules/old-child') || j.has('node_modules/old-child'), 'its dependencies are judged only if new');
  assert.ok(j.has('node_modules/old-child'), 'with no existing roots left, its dependency counts as new');
});

test('a problem in a package the project already had is a warning, and the installation goes on', () => {
  const lock = graph();
  const judged = judgedLocations(lock, { requested: ['example'], manifest });
  const r = evaluate(lock, metaFor(lock), audit(advisory('oldpkg', 'high')), policy(), judged);
  assert.equal(r.allowed, true);
  const old = r.packages.find((n) => n.name === 'oldpkg');
  assert.deepEqual([old.violations, old.existing, old.existingFindings, old.classification], [[], true, ['vulnerability'], 'Established']);
  assert.ok(old.warnings.some((w) => /Already in your project, not blocking this install: vulnerability: high advisory/.test(w)), 'it is still reported');
  const strictly = evaluate(lock, metaFor(lock), audit(advisory('oldpkg', 'high')), policy());
  assert.equal(strictly.allowed, false, 'without a scope every package is judged, as before');
});

test('a problem in a NEW package still blocks, whether it is the requested one or what it brings', () => {
  const lock = graph();
  const judged = judgedLocations(lock, { requested: ['example'], manifest });
  for (const bad of ['example', 'child']) {
    const r = evaluate(lock, metaFor(lock), audit(advisory(bad, 'critical')), policy(), judged);
    assert.equal(r.allowed, false, bad);
    assert.ok(r.packages.find((n) => n.name === bad).violations.some((v) => v.code === 'vulnerability'));
  }
  const tier = structuredClone(lock);
  const meta = metaFor(tier); meta.delete('child@1.0.0');
  assert.equal(evaluate(tier, meta, audit(), policy(), judged).allowed, false, 'missing evidence for a new package blocks');
});

test('what protects the installation itself blocks even for packages the project already had', () => {
  assert.deepEqual([...ALWAYS_BLOCKING].sort(), ['denied-package', 'integrity', 'malicious-advisory', 'metadata-mismatch', 'source']);
  const judged = judgedLocations(graph(), { requested: ['example'], manifest });
  // the registry data comes from the untouched graph; only the lockfile is changed
  const run = (mutate, a = audit(), p = policy()) => { const l = graph(); mutate(l); return evaluate(l, metaFor(graph()), a, p, judged); };
  const noIntegrity = run((l) => { delete l.packages['node_modules/oldpkg'].integrity; });
  assert.equal(noIntegrity.allowed, false, 'an existing package without integrity metadata');
  assert.ok(noIntegrity.packages.find((n) => n.name === 'oldpkg').violations.some((v) => v.code === 'integrity'));
  assert.equal(run((l) => { l.packages['node_modules/oldpkg'].resolved = 'http://registry.example.org/oldpkg.tgz'; }).allowed, false, 'an existing package from a plain http address');
  const malware = audit(advisory('oldpkg', 'high', { via: [{ title: 'Malicious package', url: 'https://example.org/m' }] }));
  assert.equal(run(() => { }, malware).allowed, false, 'an existing package with a malware advisory');
  assert.equal(run(() => { }, audit(), policy({ deniedPackages: ['oldpkg'] })).allowed, false, 'an existing package you denied yourself');
  assert.equal(run((l) => { l.packages['node_modules/oldpkg'].integrity = integrity(1); }).allowed, false, 'an existing package whose bytes do not match the registry');
});

test('a licence or tier problem in an existing package is a warning too', () => {
  const lock = graph();
  const judged = judgedLocations(lock, { requested: ['example'], manifest });
  const meta = metaFor(lock);
  meta.set('oldpkg@1.0.0', { ...meta.get('oldpkg@1.0.0'), license: 'AGPL-3.0-only', maintainers: [], repository: undefined });
  const r = evaluate(lock, meta, audit(), policy({ deniedLicenses: ['AGPL-3.0-only'] }), judged);
  assert.equal(r.allowed, true);
  const old = r.packages.find((n) => n.name === 'oldpkg');
  assert.deepEqual(old.violations, []);
  assert.ok(old.existingFindings.includes('license') && old.existingFindings.includes('minimum-tier'));
});

// ---- the whole installation, with a fake npm ---------------------------------------------------------------------------------------
function fixture(t, { auditVulns = {}, existingDeps = { oldpkg: '1.0.0' } } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-scope-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'app', version: '1.0.0', dependencies: existingDeps }) + '\n');
  fs.mkdirSync(path.join(dir, 'node_modules'));
  const lock = graph();
  const calls = [];
  const run = (_cmd, args, options) => {
    calls.push(args);
    const stage = options.cwd;
    if (args[0] === 'install') {
      fs.writeFileSync(path.join(stage, 'package-lock.json'), JSON.stringify(lock));
      fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify({ name: 'app', version: '1.0.0', dependencies: { ...existingDeps, example: '1.0.0' } }));
    }
    if (args[0] === 'view') { const key = args.find((a) => /^(@?[^@\s]+)@\d/.test(a)); return { status: 0, stdout: JSON.stringify(metaFor(lock).get(key)) }; }
    if (args[0] === 'audit') return { status: 0, stdout: JSON.stringify(audit(auditVulns)) };
    if (args[0] === 'ci') {
      for (const [loc, n] of Object.entries(lock.packages)) {
        if (!loc) continue;
        fs.mkdirSync(path.join(stage, loc), { recursive: true });
        fs.writeFileSync(path.join(stage, loc, 'package.json'), JSON.stringify({ name: n.name || loc.split('node_modules/').pop(), version: n.version }));
      }
      fs.writeFileSync(path.join(stage, 'node_modules', '.package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: Object.fromEntries(Object.entries(lock.packages).filter(([k]) => k)) }));
    }
    return { status: 0, stdout: '' };
  };
  return { dir, run, calls, lock };
}

test('installing something is not blocked by a high advisory in a package that was already in the project', async t => {
  const f = fixture(t, { auditVulns: advisory('oldpkg', 'high') });
  const messages = [];
  const r = await install(['example'], { project: f.dir, progress: (m) => messages.push(m) }, f);
  assert.equal(r.status, 'installed');
  assert.equal(r.allowed, true);
  assert.equal(r.existingWithFindings, 1);
  assert.equal(r.judgedCount, 3, 'example and what it brings (child, shared) were judged');
  assert.ok(messages.some((m) => /1 package already in your project has security findings\. It does not block this install \(only 3 new packages are judged\)/.test(m)), messages.join(' | '));
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.dir, 'package.json'), 'utf8')).dependencies.example, '1.0.0', 'and it was installed');
});

test('a vulnerable package that the new one brings still blocks, and nothing is changed', async t => {
  const f = fixture(t, { auditVulns: { ...advisory('oldpkg', 'high'), ...advisory('child', 'critical') } });
  const before = fs.readFileSync(path.join(f.dir, 'package.json'), 'utf8');
  const r = await install(['example'], { project: f.dir }, f);
  assert.equal(r.status, 'blocked');
  assert.deepEqual(r.packages.filter((n) => n.violations.length).map((n) => n.name), ['child'], 'only the new package blocks, not oldpkg');
  assert.equal(f.calls.some((c) => c[0] === 'ci'), false, 'nothing was installed');
  assert.equal(fs.readFileSync(path.join(f.dir, 'package.json'), 'utf8'), before);
});

test('the default report says why it was blocked, and how many existing packages had findings', async t => {
  const f = fixture(t, { auditVulns: { ...advisory('oldpkg', 'high'), ...advisory('child', 'critical') } });
  const r = await install(['example'], { project: f.dir }, f);
  const text = renderStatus(r);
  assert.match(text, /Installation blocked by project dependency security policy\./, 'example itself is fine; what it brings is not');
  assert.match(text, /✖ child@1\.0\.0  vulnerability: critical advisory/);
  assert.match(text, /Note: 1 package already in your project has security findings\. It does not block this install/);
  const ok = fixture(t, { auditVulns: advisory('oldpkg', 'high') });
  const done = renderStatus(await install(['example'], { project: ok.dir, dryRun: true }, ok));
  assert.doesNotMatch(done, /blocked|✖/);
  assert.match(done, /Note: 1 package already in your project/);
  const direct = fixture(t, { auditVulns: advisory('example', 'critical') });
  assert.match(renderStatus(await install(['example'], { project: direct.dir }, direct)), /Installation blocked by package security policy\.\n  ✖ example@1\.0\.0  vulnerability/);
});

test('more than five blocked packages are summarised, so the report stays short', () => {
  const packages = Array.from({ length: 8 }, (_, i) => ({ name: `bad-${i}`, version: '1.0.0', location: `node_modules/bad-${i}`, classification: 'Blocked', violations: [{ code: 'vulnerability', detail: { severity: 'high' } }], warnings: [] }));
  const text = renderStatus({ status: 'blocked', requested: [{ name: 'bad-0' }], packages });
  assert.equal(text.split('\n').filter((l) => l.includes('✖')).length, 5);
  assert.match(text, /…and 3 more blocked \(run again with --verbose\)/);
});

test('the documentation explains what is judged, what is only reported, and what blocks everywhere', () => {
  const doc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'package-security.md'), 'utf8');
  for (const needle of ['### What is judged: only what you install', 'Already in your project, not blocking this install', 'malware advisory', 'missing integrity metadata', 'deniedPackages', 'reachable from a dependency your `package.json` already lists']) assert.ok(doc.includes(needle), needle);
});

test('a shared dependency whose version changed is judged, even when the project already needs it', () => {
  // the project already had oldpkg -> shared@1.0.0; installing example now brings shared@1.1.0
  const previous = lockOf({
    'node_modules/oldpkg': entry('oldpkg', '1.0.0', { dependencies: { 'old-child': '1.0.0', shared: '1.0.0' } }),
    'node_modules/old-child': entry('old-child', '1.0.0'),
    'node_modules/shared': entry('shared', '1.0.0'),
  }, { dependencies: { oldpkg: '1.0.0' } });
  const lock = lockOf({
    'node_modules/oldpkg': entry('oldpkg', '1.0.0', { dependencies: { 'old-child': '1.0.0', shared: '1.1.0' } }),
    'node_modules/old-child': entry('old-child', '1.0.0'),
    'node_modules/example': entry('example', '1.0.0', { dependencies: { child: '1.0.0', shared: '1.1.0' } }),
    'node_modules/child': entry('child', '1.0.0'),
    'node_modules/shared': entry('shared', '1.1.0', { integrity: integrity(77) }),
  }, { dependencies: { oldpkg: '1.0.0', example: '1.0.0' } });
  const manifest = { name: 'app', dependencies: { oldpkg: '1.0.0' } };
  const judged = judgedLocations(lock, { requested: ['example'], manifest, previousLock: previous });
  assert.ok(judged.has('node_modules/shared'), 'changed shared bytes are a new package');
  const r = evaluate(lock, metaFor(lock), audit(advisory('shared', 'critical')), policy(), judged);
  assert.equal(r.allowed, false, 'a critical advisory in the changed shared node blocks');
  assert.ok(r.packages.find((n) => n.name === 'shared').violations.some((v) => v.code === 'vulnerability'));
  // the same package, unchanged, stays grandfathered
  const still = lockOf({
    'node_modules/oldpkg': entry('oldpkg', '1.0.0', { dependencies: { 'old-child': '1.0.0', shared: '1.0.0' } }),
    'node_modules/old-child': entry('old-child', '1.0.0'),
    'node_modules/example': entry('example', '1.0.0', { dependencies: { child: '1.0.0', shared: '1.0.0' } }),
    'node_modules/child': entry('child', '1.0.0'),
    'node_modules/shared': entry('shared', '1.0.0'),
  }, { dependencies: { oldpkg: '1.0.0', example: '1.0.0' } });
  assert.ok(!judgedLocations(still, { requested: ['example'], manifest, previousLock: previous }).has('node_modules/shared'), 'unchanged shared bytes stay grandfathered');
});
