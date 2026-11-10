'use strict';
// Remembered decisions about npm packages: security.allowedPackages / deniedPackages, the "Always allow" and "Never allow" answers,
// and kreft install --allow-package / --deny-package / --forget-package / --packages.   Run: npm test
// An allowed package still goes through the whole security review: the list only saves the question.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const { PassThrough } = require('stream');
const { policy } = require('../bin/security/policy.js');
const rules = require('../bin/security/rules.js');
const { evaluate, spec, install } = require('../bin/security/install.js');
const { confirmPackage } = require('../bin/security/confirm.js');

const integrity = 'sha512-' + Buffer.alloc(64, 1).toString('base64');
const artifact = { version: '1.0.0', resolved: 'https://registry.npmjs.org/example/-/example-1.0.0.tgz', integrity };
const lock = { lockfileVersion: 3, packages: { '': {}, 'node_modules/example': artifact } };
const metadata = new Map([['example@1.0.0', { name: 'example', version: '1.0.0', license: 'MIT', maintainers: [{ name: 'publisher' }], repository: 'https://example.org/source', dist: { integrity, tarball: artifact.resolved } }]]);
const audit = { auditReportVersion: 2, vulnerabilities: {} };

// a project and a fake npm, like the one in test/package-gatekeeper.test.js
function project(t, security = {}, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-rules-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"app","version":"1.0.0"}\n');
  fs.mkdirSync(path.join(dir, 'node_modules'));
  fs.writeFileSync(path.join(dir, 'node_modules', 'old.txt'), 'original');
  fs.writeFileSync(path.join(dir, 'kreftjs.config.json'), JSON.stringify({ db: 'mysql://root:${DB_PASS}@localhost/shop', security, ...extra }, null, 2));
  const calls = [];
  const run = (_cmd, args, options) => {
    calls.push(args);
    const stage = options.cwd;
    if (args[0] === 'install') {
      fs.writeFileSync(path.join(stage, 'package-lock.json'), JSON.stringify(lock));
      fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify({ name: 'app', version: '1.0.0', dependencies: { example: '1.0.0' } }));
    }
    if (args[0] === 'view') return { status: 0, stdout: JSON.stringify(metadata.get('example@1.0.0')) };
    if (args[0] === 'audit') return { status: 0, stdout: JSON.stringify(audit) };
    if (args[0] === 'ci') {
      fs.mkdirSync(path.join(stage, 'node_modules', 'example'), { recursive: true });
      fs.writeFileSync(path.join(stage, 'node_modules', '.package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: { 'node_modules/example': artifact } }));
      fs.writeFileSync(path.join(stage, 'node_modules', 'example', 'package.json'), JSON.stringify({ name: 'example', version: '1.0.0' }));
    }
    return { status: 0, stdout: '' };
  };
  const config = () => JSON.parse(fs.readFileSync(path.join(dir, 'kreftjs.config.json'), 'utf8'));
  return { dir, run, calls, config };
}
const installed = (f) => f.calls.some((c) => c[0] === 'ci');
const noPrompt = () => assert.fail('the question must not be asked');

test('a package rule is a registry name or an exact version, never a range, tag or URL', () => {
  assert.deepEqual(rules.parseRule('lodash'), { name: 'lodash', version: null, text: 'lodash' });
  assert.deepEqual(rules.parseRule('@scope/pkg@1.2.3-beta.1'), { name: '@scope/pkg', version: '1.2.3-beta.1', text: '@scope/pkg@1.2.3-beta.1' });
  for (const bad of ['', 'lodash@^4', 'lodash@latest', 'lodash@1', 'git+https://x/y', 'file:../x', 'foo;rm -rf /', '../x', 'LODASH', 'foo@npm:bar', 'a'.repeat(300)]) assert.throws(() => rules.parseRule(bad), /is not a package rule/, bad);
  assert.ok(rules.covers('lodash', 'lodash', '4.17.21'), 'a name covers every version');
  assert.ok(rules.covers('lodash@4.17.21', 'lodash', '4.17.21'));
  assert.ok(!rules.covers('lodash@4.17.21', 'lodash', '4.17.22'), 'an exact version covers only itself');
  assert.ok(!rules.covers('lodash', 'lodash-es', '1.0.0'), 'and a name is not a prefix');
});

test('the policy has an empty allow list, checks every entry, and refuses an allow and a deny of the same package', () => {
  assert.deepEqual(policy().allowedPackages, []);
  assert.deepEqual(policy({ allowedPackages: ['lodash@4.17.21'], deniedPackages: ['left-pad'] }).allowedPackages, ['lodash@4.17.21']);
  assert.throws(() => policy({ allowedPackages: 'lodash' }), /allowedPackages must be a string array/);
  assert.throws(() => policy({ allowedPackages: ['lodash@^4'] }), /security\.allowedPackages: .*not a package rule/);
  assert.throws(() => policy({ deniedPackages: ['git+https://x'] }), /security\.deniedPackages: .*not a package rule/);
  assert.throws(() => policy({ allowedPackages: ['lodash'], deniedPackages: ['lodash@4.17.21'] }), /allowedPackages.*deniedPackages.*cannot be both/s);
  assert.throws(() => policy({ allowedPackages: ['lodash@4.17.20'], deniedPackages: ['lodash'] }), /cannot be both/);
  assert.doesNotThrow(() => policy({ allowedPackages: ['lodash@4.17.20'], deniedPackages: ['lodash@4.17.21'] }), 'different exact versions do not clash');
  assert.doesNotThrow(() => policy({ allowedPackages: ['lodash'], deniedPackages: ['lodash-es'] }));
});

test('editing the rules keeps the rest of the settings and every ${NAME} placeholder exactly as written', t => {
  const f = project(t, { minimumTier: 2, deniedLicenses: ['AGPL-3.0-only'] });
  const r = rules.editRules(f.dir, { allow: ['lodash@4.17.21', '@scope/pkg'], deny: ['left-pad'] });
  assert.equal(r.file, path.join(f.dir, 'kreftjs.config.json'));
  const c = f.config();
  assert.equal(c.db, 'mysql://root:${DB_PASS}@localhost/shop', 'the placeholder was not replaced by a value');
  assert.deepEqual(c.security, { minimumTier: 2, deniedLicenses: ['AGPL-3.0-only'], allowedPackages: ['lodash@4.17.21', '@scope/pkg'], deniedPackages: ['left-pad'] });
  assert.deepEqual(fs.readdirSync(f.dir).filter((n) => n.endsWith('.tmp')), [], 'no temporary file is left');
  assert.ok(fs.readFileSync(r.file, 'utf8').endsWith('}\n'));
  rules.editRules(f.dir, { allow: ['lodash@4.17.21'] });
  assert.deepEqual(f.config().security.allowedPackages, ['lodash@4.17.21', '@scope/pkg'], 'the same rule twice is one rule');
});

test('an explicit allow replaces a deny (and the other way round), and forget removes by name or by version', t => {
  const f = project(t, { deniedPackages: ['left-pad'], allowedPackages: ['lodash@4.17.21', 'lodash@4.17.20', 'dayjs'] });
  let r = rules.editRules(f.dir, { allow: ['left-pad'] });
  assert.deepEqual([r.allowed.includes('left-pad'), r.denied], [true, []]);
  assert.match(r.notes[0], /left-pad was denied.*that rule is removed/);
  r = rules.editRules(f.dir, { deny: ['dayjs@1.0.0'] });
  assert.ok(!r.allowed.includes('dayjs'), 'a denied version removes the allow that covered it');
  assert.deepEqual(r.denied, ['dayjs@1.0.0']);
  r = rules.editRules(f.dir, { forget: ['lodash@4.17.20'] });
  assert.deepEqual(r.allowed.filter((e) => e.startsWith('lodash')), ['lodash@4.17.21'], 'forget with a version removes only that version');
  r = rules.editRules(f.dir, { forget: ['lodash'] });
  assert.deepEqual(r.allowed.filter((e) => e.startsWith('lodash')), [], 'forget with a name removes every version');
  assert.match(rules.editRules(f.dir, { forget: ['nothing-here'] }).notes[0], /nothing-here had no rule/);
});

test('editing never writes a file the installer would refuse, and a broken file is reported, not overwritten', t => {
  const f = project(t, { minimumTier: 9 });
  const before = fs.readFileSync(path.join(f.dir, 'kreftjs.config.json'), 'utf8');
  assert.throws(() => rules.editRules(f.dir, { allow: ['lodash'] }), /minimumTier/);
  assert.equal(fs.readFileSync(path.join(f.dir, 'kreftjs.config.json'), 'utf8'), before, 'nothing was written');
  assert.throws(() => rules.editRules(f.dir, { allow: ['lodash@^4'] }), /is not a package rule/);
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-rules-new-'));
  t.after(() => fs.rmSync(empty, { recursive: true, force: true }));
  fs.writeFileSync(path.join(empty, 'package.json'), '{"name":"x"}');
  const made = rules.editRules(empty, { deny: ['left-pad'] });
  assert.deepEqual(JSON.parse(fs.readFileSync(made.file, 'utf8')), { security: { deniedPackages: ['left-pad'] } }, 'with no settings file one is made');
  assert.deepEqual(rules.listRules(empty), { file: made.file, allowed: [], denied: ['left-pad'] });
  fs.writeFileSync(path.join(empty, 'kreftjs.config.json'), '{"security": []}');
  assert.throws(() => rules.editRules(empty, { allow: ['a'] }), /must be an object/);
});

test('an allowed package installs without the question, and the review still ran', async t => {
  for (const entry of ['example@1.0.0', 'example']) {
    const f = project(t, { allowedPackages: [entry] });
    const messages = [];
    const r = await install(['example'], { project: f.dir, confirm: noPrompt, progress: (m) => messages.push(m) }, f);
    assert.equal(r.status, 'installed', entry);
    assert.equal(r.decision, 'allow');
    assert.equal(r.decisionSource, 'allowedPackages');
    assert.ok(f.calls.some((c) => c[0] === 'audit') && f.calls.some((c) => c[0] === 'view'), 'registry metadata and advisories were still checked');
    assert.ok(messages.some((m) => /Allowed by security\.allowedPackages.*example@1\.0\.0/.test(m)), 'it says why there was no question');
  }
});

test('an allow rule for another version does not skip the question', async t => {
  const f = project(t, { allowedPackages: ['example@2.0.0'] });
  let asked = 0;
  const r = await install(['example'], { project: f.dir, confirm: async () => { asked++; return false; } }, f);
  assert.equal(asked, 1);
  assert.equal(r.status, 'cancelled');
  assert.equal(installed(f), false);
});

test('allowing a package never lets it past a security finding', async t => {
  const f = project(t, { allowedPackages: ['example'], deniedLicenses: ['MIT'] });
  const r = await install(['example'], { project: f.dir, confirm: noPrompt }, f);
  assert.equal(r.allowed, false);
  assert.equal(r.status, 'blocked');
  assert.ok(r.packages[0].violations.some((v) => v.code === 'license'));
  assert.equal(installed(f), false, 'nothing was installed');
  assert.equal(fs.readFileSync(path.join(f.dir, 'node_modules', 'old.txt'), 'utf8'), 'original');
  const tier = project(t, { allowedPackages: ['example'], minimumTier: 1 });
  assert.equal((await install(['example'], { project: tier.dir, confirm: noPrompt }, tier)).status, 'blocked');
});

test('"Always allow" installs, saves the exact version reviewed, and the next install does not ask', async t => {
  const f = project(t, { minimumTier: 2 });
  const messages = [];
  const first = await install(['example'], { project: f.dir, confirm: async () => 'always', progress: (m) => messages.push(m) }, f);
  assert.equal(first.status, 'installed');
  assert.equal(first.decision, 'allow');
  assert.equal(first.decisionSource, 'prompt');
  assert.deepEqual(first.remembered.entries, ['example@1.0.0']);
  assert.deepEqual(f.config().security, { minimumTier: 2, allowedPackages: ['example@1.0.0'] });
  assert.equal(f.config().db, 'mysql://root:${DB_PASS}@localhost/shop');
  assert.ok(messages.some((m) => /Always allowed: example@1\.0\.0 saved in kreftjs\.config\.json/.test(m)));
  const second = await install(['example'], { project: f.dir, confirm: noPrompt }, f);
  assert.equal(second.status, 'installed');
  assert.equal(second.decisionSource, 'allowedPackages');
});

test('"Never allow" cancels, saves a deny, and the next install is blocked without a question', async t => {
  const f = project(t);
  const first = await install(['example'], { project: f.dir, confirm: async () => 'never' }, f);
  assert.equal(first.status, 'cancelled');
  assert.equal(first.decision, 'disallow');
  assert.deepEqual(first.remembered.entries, ['example']);
  assert.equal(installed(f), false);
  assert.equal(fs.readFileSync(path.join(f.dir, 'node_modules', 'old.txt'), 'utf8'), 'original', 'dependencies unchanged');
  assert.deepEqual(f.config().security.deniedPackages, ['example']);
  const second = await install(['example'], { project: f.dir, confirm: noPrompt }, f);
  assert.equal(second.status, 'blocked');
  assert.ok(second.packages[0].violations.some((v) => v.code === 'denied-package'));
  assert.equal(installed(f), false);
});

test('"Allow once" and "Disallow once" still change nothing on disk', async t => {
  for (const [answer, status] of [[true, 'installed'], [false, 'cancelled']]) {
    const f = project(t, { minimumTier: 2 });
    const before = fs.readFileSync(path.join(f.dir, 'kreftjs.config.json'), 'utf8');
    const r = await install(['example'], { project: f.dir, confirm: async () => answer }, f);
    assert.equal(r.status, status);
    assert.equal(r.remembered, undefined);
    assert.equal(fs.readFileSync(path.join(f.dir, 'kreftjs.config.json'), 'utf8'), before, 'the settings file is untouched');
  }
});

test('if the choice cannot be saved, it still counts for this installation and says so', async t => {
  const f = project(t);
  const original = rules.remember;
  rules.remember = () => { throw Error('disk is read-only'); };
  t.after(() => { rules.remember = original; });
  const messages = [];
  const r = await install(['example'], { project: f.dir, confirm: async () => 'always', progress: (m) => messages.push(m) }, f);
  assert.equal(r.status, 'installed');
  assert.equal(r.remembered, undefined);
  assert.ok(messages.some((m) => /Could not save your choice \(disk is read-only\).*this installation only/.test(m)));
});

test('--yes and dry runs never read or change the rules', async t => {
  const f = project(t);
  const before = fs.readFileSync(path.join(f.dir, 'kreftjs.config.json'), 'utf8');
  assert.equal((await install(['example'], { project: f.dir }, f)).status, 'installed', 'no confirm function: installed as before');
  assert.equal((await install(['example'], { project: f.dir, dryRun: true, confirm: noPrompt }, project(t))).status, 'approved');
  assert.equal(fs.readFileSync(path.join(f.dir, 'kreftjs.config.json'), 'utf8'), before);
});

// every file and folder of a project, hidden ones included, with a fingerprint of each file
function snapshot(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const f = path.join(d, e.name);
      const rel = path.relative(dir, f);
      if (e.isDirectory()) { out.push('dir ' + rel); walk(f); } else out.push(`${require('crypto').createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 16)} ${rel}`);
    }
  };
  walk(dir);
  return out;
}

test('saying No changes nothing on disk: not a dependency, not a setting, not even a report or a temporary folder', async t => {
  for (const answer of [false, undefined, 'disallow-by-closing']) {
    const f = project(t, { minimumTier: 2 });
    fs.writeFileSync(path.join(f.dir, '.env'), 'APP_KEY=secret\n');
    fs.mkdirSync(path.join(f.dir, '.kreft'));
    fs.writeFileSync(path.join(f.dir, '.kreft', 'mine.txt'), 'my own file');
    const before = snapshot(f.dir);
    const r = await install(['example'], { project: f.dir, confirm: async () => (answer === 'disallow-by-closing' ? false : answer === undefined ? false : answer) }, f);
    assert.equal(r.status, 'cancelled');
    assert.equal(installed(f), false, 'npm ci never ran');
    assert.deepEqual(snapshot(f.dir), before, 'every file and folder is exactly as it was');
    assert.ok(!fs.existsSync(path.join(f.dir, '.kreft', 'security')), 'no report folder');
    assert.deepEqual(fs.readdirSync(f.dir).filter((n) => n.startsWith('.kreft-')), [], 'no staging or backup folder is left');
  }
});

test('a project that already has a report keeps it untouched when you say No', async t => {
  const f = project(t);
  fs.mkdirSync(path.join(f.dir, '.kreft', 'security'), { recursive: true });
  fs.writeFileSync(path.join(f.dir, '.kreft', 'security', 'latest.txt'), 'the report of an earlier run');
  const before = snapshot(f.dir);
  assert.equal((await install(['example'], { project: f.dir, confirm: async () => false }, f)).status, 'cancelled');
  assert.deepEqual(snapshot(f.dir), before);
});

test('only the answers that say so write anything: Always allow and Never allow change the settings file, nothing else', async t => {
  for (const [answer, key] of [['always', 'allowedPackages'], ['never', 'deniedPackages']]) {
    const f = project(t);
    const before = snapshot(f.dir);
    await install(['example'], { project: f.dir, confirm: async () => answer }, f);
    const after = snapshot(f.dir);
    const changed = [...new Set([...before, ...after])].filter((l) => before.includes(l) !== after.includes(l)).map((l) => l.split(' ').pop());
    const names = [...new Set(changed)].filter((n) => !/^node_modules|package(-lock)?\.json$/.test(n));
    assert.deepEqual(names.filter((n) => !n.startsWith('.kreft')), ['kreftjs.config.json'], answer + ': the settings file is the only other file that changed');
    assert.ok(f.config().security[key].includes(answer === 'always' ? 'example@1.0.0' : 'example'));
  }
});

test('the question offers four answers and the two that remember say so', async () => {
  const ask = async (text) => {
    const input = new PassThrough(), output = new PassThrough();
    let shown = ''; output.on('data', (c) => { shown += c; });
    const answer = confirmPackage({ ...evaluate(lock, metadata, audit, policy()), requested: [spec('example')] }, { input, output });
    input.end(text);
    return { value: await answer, shown };
  };
  const first = await ask('a\n');
  assert.match(first.shown, /1\) Allow installation once[\s\S]*2\) Disallow installation once \(default\)[\s\S]*3\) Always allow[\s\S]*4\) Never allow[\s\S]*Installation \[1\/2\/3\/4\]/);
  for (const [text, value] of [['1\n', true], ['2\n', false], ['3\n', 'always'], ['4\n', 'never'], ['a\n', true], ['allow\n', true], ['y\n', true], ['r\n', 'always'], ['ALWAYS\n', 'always'], ['always allow\n', 'always'],
    ['n\n', 'never'], ['never\n', 'never'], ['d\n', false], ['disallow\n', false], ['\n', false], ['maybe\n', false], ['', false]]) {
    assert.equal((await ask(text)).value, value, JSON.stringify(text));
  }
  assert.match((await ask('r\n')).shown, /Always allowed: the choice is saved/);
  assert.match((await ask('n\n')).shown, /Never allowed: the choice is saved.*cancelled; dependencies unchanged/s);
  assert.match((await ask('d\n')).shown, /Disallowed\. Installation cancelled/);
});

const kreft = (args, cwd) => cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'kreftjs.js'), ...args], { cwd, encoding: 'utf8' });

test('kreft install --allow-package, --deny-package, --forget-package and --packages edit and list the rules', t => {
  const f = project(t, { minimumTier: 2 });
  let r = kreft(['install', '--packages'], f.dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /allowed: \(none\)[\s\S]*denied:  \(none\)/);
  r = kreft(['install', '--allow-package', 'lodash@4.17.21', '--allow-package=@scope/pkg', '--deny-package', 'left-pad'], f.dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Updated kreftjs\.config\.json/);
  assert.match(r.stdout, /allowed: lodash@4\.17\.21, @scope\/pkg/);
  assert.match(r.stdout, /denied:  left-pad/);
  assert.match(r.stdout, /never overrides a security finding/);
  assert.deepEqual(f.config().security, { minimumTier: 2, allowedPackages: ['lodash@4.17.21', '@scope/pkg'], deniedPackages: ['left-pad'] });
  assert.equal(f.config().db, 'mysql://root:${DB_PASS}@localhost/shop');
  r = kreft(['install', '--forget-package', 'left-pad', '--json'], f.dir);
  assert.deepEqual(JSON.parse(r.stdout).denied, []);
  assert.deepEqual(JSON.parse(kreft(['install', '--packages', '--json'], f.dir).stdout).allowed, ['lodash@4.17.21', '@scope/pkg']);
  assert.ok(fs.existsSync(path.join(f.dir, 'node_modules', 'old.txt')), 'editing rules installs nothing and touches no packages');
});

test('the rule flags reject bad input and cannot be mixed with an installation', t => {
  const f = project(t);
  const before = fs.readFileSync(path.join(f.dir, 'kreftjs.config.json'), 'utf8');
  for (const [args, re] of [[['install', '--allow-package', 'git+https://x/y'], /is not a package rule/], [['install', '--allow-package', 'lodash@^4'], /is not a package rule/],
    [['install', '--allow-package'], /--allow-package needs a package/], [['install', '--deny-package', '--yes'], /--deny-package needs a package/],
    [['install', 'lodash', '--deny-package', 'left-pad'], /separate commands/], [['install', '--allow-package', 'a', '--deny-package', 'a'], null]]) {
    const r = kreft(args, f.dir);
    if (re) { assert.equal(r.status, 1, args.join(' ')); assert.match(r.stderr, re, args.join(' ')); }
  }
  const same = kreft(['install', '--allow-package', 'a', '--deny-package', 'a'], f.dir);
  assert.equal(same.status, 0, 'the later flag wins, and says the other rule was removed');
  assert.match(same.stdout, /note: a was allowed/);
  fs.writeFileSync(path.join(f.dir, 'kreftjs.config.json'), before);
  assert.equal(JSON.parse(kreft(['install', '--packages', '--json'], f.dir).stdout).allowed.length, 0);
});

test('the help and the documentation describe the rules and say they never bypass the review', () => {
  const help = kreft(['install', '--help'], os.tmpdir()).stdout;
  for (const t of ['--allow-package', '--deny-package', '--forget-package', '--packages', 'Always allow', 'Never allow', 'never overrides a security finding']) assert.ok(help.includes(t), 'help: ' + t);
  const doc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'package-security.md'), 'utf8');
  for (const t of ['allowedPackages', 'deniedPackages', '--allow-package', '--deny-package', '--forget-package', 'Always allow', 'Never allow', 'never bypasses']) assert.ok(doc.includes(t), 'docs: ' + t);
  assert.doesNotMatch(doc, /does not persist a policy exception/, 'the old sentence that said choices are never remembered is gone');
});
