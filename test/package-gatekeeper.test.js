'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { policy } = require('../bin/security/policy.js');
const { evaluate, spec, install } = require('../bin/security/install.js');
const integrity = 'sha512-' + Buffer.alloc(64, 1).toString('base64');
const artifact = { version: '1.0.0', resolved: 'https://registry.npmjs.org/example/-/example-1.0.0.tgz', integrity };
const lock = { lockfileVersion: 3, packages: { '': {}, 'node_modules/example': artifact } };
const metadata = new Map([['example@1.0.0', { name: 'example', version: '1.0.0', license: 'MIT', maintainers: [{ name: 'publisher' }], repository: 'https://example.org/source', dist: { integrity, tarball: artifact.resolved } }]]);
const audit = { auditReportVersion: 2, vulnerabilities: {} };
test('strict schema rejects typos, weak controls and malformed nested settings', () => {
  for (const input of [{ minimumTier: 4 }, { verifyIntegrity: false }, { typo: true }, { reports: null }, { reports: { format: ['yaml'] } }, { checkLicenses: 'yes' }]) assert.throws(() => policy(input));
});
test('registry specifications reject command injection, aliases and alternate sources', () => {
  for (const value of ['foo;touch /tmp/x', 'foo@$(id)', 'foo@npm:bar', 'git+https://foo', 'foo@file:../foo', '../foo', '--help', 'fоо']) assert.throws(() => spec(value));
  assert.equal(spec('@scope/name@^2.1.0').version, '^2.1.0');
});
test('evidence-based classification never promotes popularity or absent advisories to Trusted', () => {
  const r = evaluate(lock, metadata, audit, policy());
  assert.equal(r.allowed, true);
  assert.equal(r.packages[0].classification, 'Established');
  assert.equal(evaluate(lock, new Map(), audit, policy()).allowed, false);
  assert.equal(evaluate(lock, metadata, null, policy()).allowed, false);
  assert.equal(evaluate(lock, metadata, audit, policy({ minimumTier: 1 })).allowed, false);
});
test('transitive vulnerability, malware, prohibited licenses and integrity mismatch block', () => {
  const advisory = { vulnerabilities: { example: { severity: 'high', nodes: ['node_modules/example'], via: [{ title: 'Malicious package', url: 'https://example.org/advisory' }] } } };
  assert.equal(evaluate(lock, metadata, advisory, policy()).allowed, false);
  assert.equal(evaluate(lock, metadata, audit, policy({ deniedLicenses: ['MIT'] })).allowed, false);
  const changed = structuredClone(lock); changed.packages['node_modules/example'].integrity = 'sha512-AAAA';
  assert.equal(evaluate(changed, metadata, audit, policy()).allowed, false);
});
function fixture(t, { blocked = false, failCi = false, mutate = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-gate-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"app","version":"1.0.0"}\n');
  fs.mkdirSync(path.join(dir, 'node_modules'));
  fs.writeFileSync(path.join(dir, 'node_modules', 'old.txt'), 'original');
  fs.writeFileSync(path.join(dir, 'kreftjs.config.json'), JSON.stringify({ security: { deniedPackages: blocked ? ['example'] : [] } }));
  const calls = [];
  const run = (_cmd, args, options) => {
    calls.push(args);
    assert.ok(args.includes('--ignore-scripts'));
    const stage = options.cwd;
    if (args[0] === 'install') {
      fs.writeFileSync(path.join(stage, 'package-lock.json'), JSON.stringify(lock));
      fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify({ name: 'app', version: '1.0.0', dependencies: { example: '1.0.0' } }));
    }
    if (args[0] === 'view') return { status: 0, stdout: JSON.stringify(metadata.get('example@1.0.0')) };
    if (args[0] === 'audit') return { status: 0, stdout: JSON.stringify(audit) };
    if (args[0] === 'ci') {
      if (failCi) return { status: 1, stderr: 'EINTEGRITY' };
      fs.mkdirSync(path.join(stage, 'node_modules', 'example'), { recursive: true });
      fs.writeFileSync(path.join(stage, 'node_modules', '.package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: { 'node_modules/example': artifact } }));
      fs.writeFileSync(path.join(stage, 'node_modules', 'example', 'package.json'), JSON.stringify({ name: 'example', version: mutate ? '2.0.0' : '1.0.0' }));
    }
    return { status: 0, stdout: '' };
  };
  return { dir, run, calls };
}
test('blocked installation preserves manifest, lockfile and existing node_modules', async t => {
  const f = fixture(t, { blocked: true });
  const original = fs.readFileSync(path.join(f.dir, 'package.json'), 'utf8');
  const result = await install(['example'], { project: f.dir }, f);
  assert.equal(result.allowed, false);
  assert.equal(fs.readFileSync(path.join(f.dir, 'package.json'), 'utf8'), original);
  assert.equal(fs.existsSync(path.join(f.dir, 'package-lock.json')), false);
  assert.equal(fs.readFileSync(path.join(f.dir, 'node_modules', 'old.txt'), 'utf8'), 'original');
  assert.equal(f.calls.some(c => c[0] === 'ci'), false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.dir, '.kreft/security/latest.json'))).status, 'blocked');
});
test('dry run resolves policy and reports without installing', async t => {
  const f = fixture(t);
  assert.equal((await install(['example'], { project: f.dir, dryRun: true }, f)).allowed, true);
  assert.equal(f.calls.some(c => c[0] === 'ci'), false);
  assert.equal(fs.existsSync(path.join(f.dir, 'package-lock.json')), false);
});
test('approved install promotes verified graph and pins exact version', async t => {
  const f = fixture(t);
  assert.equal((await install(['example'], { project: f.dir }, f)).status, 'installed');
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.dir, 'package.json'))).dependencies.example, '1.0.0');
  assert.equal(fs.existsSync(path.join(f.dir, 'node_modules', 'example', 'package.json')), true);
  assert.equal(fs.readdirSync(f.dir).some(n => n.startsWith('.kreft-security-stage-')), false);
});
test('integrity failures and installed graph drift never alter the project', async t => {
  for (const settings of [{ failCi: true }, { mutate: true }]) {
    const f = fixture(t, settings);
    await assert.rejects(install(['example'], { project: f.dir }, f));
    assert.equal(fs.readFileSync(path.join(f.dir, 'node_modules', 'old.txt'), 'utf8'), 'original');
    assert.equal(fs.existsSync(path.join(f.dir, 'package-lock.json')), false);
  }
});
test('Disallow after security review cancels without changing dependencies', async t => {
  const f = fixture(t);
  const original = fs.readFileSync(path.join(f.dir, 'package.json'), 'utf8');
  let prompts = 0;
  const r = await install(['example'], { project: f.dir, confirm: async report => {
    prompts++;
    assert.equal(report.allowed, true);
    assert.equal(f.calls.some(c => c[0] === 'ci'), false);
    return false;
  } }, f);
  assert.equal(prompts, 1);
  assert.equal(r.status, 'cancelled');
  assert.equal(r.decision, 'disallow');
  assert.equal(f.calls.some(c => c[0] === 'ci'), false);
  assert.equal(fs.readFileSync(path.join(f.dir, 'package.json'), 'utf8'), original);
  assert.equal(fs.readFileSync(path.join(f.dir, 'node_modules', 'old.txt'), 'utf8'), 'original');
  assert.equal(fs.existsSync(path.join(f.dir, 'package-lock.json')), false);
});
test('Allow installs approved packages and records the decision', async t => {
  const f = fixture(t);
  const r = await install(['example'], { project: f.dir, confirm: async () => true }, f);
  assert.equal(r.status, 'installed');
  assert.equal(r.decision, 'allow');
});
test('blocked packages and dry runs never offer an Allow bypass', async t => {
  for (const blocked of [true, false]) {
    const f = fixture(t, { blocked });
    await install(['example'], { project: f.dir, dryRun: !blocked, confirm: () => assert.fail('Must not prompt') }, f);
    assert.equal(f.calls.some(c => c[0] === 'ci'), false);
  }
});
test('confirmation displays after checks and accepts Allow through non-TTY streams', async () => {
  const { PassThrough } = require('stream');
  const { confirmPackage } = require('../bin/security/confirm.js');
  const input = new PassThrough(), output = new PassThrough();
  let text = ''; output.on('data', chunk => { text += chunk; });
  const report = { ...evaluate(lock, metadata, audit, policy()), requested: [spec('example')] };
  const answer = confirmPackage(report, { input, output });
  assert.match(text, /example@1\.0\.0[\s\S]*1\) Allow[\s\S]*2\) Disallow/);
  input.end('allow\n');
  assert.equal(await answer, true);
  assert.match(text, /Allowed. Installing/);
});
test('EOF and Disallow visibly cancel confirmation in non-TTY terminals', async () => {
  const { PassThrough } = require('stream');
  const { confirmPackage } = require('../bin/security/confirm.js');
  for (const response of ['', 'd\n']) {
    const input = new PassThrough(), output = new PassThrough();
    let text = ''; output.on('data', chunk => { text += chunk; });
    const answer = confirmPackage({ ...evaluate(lock, metadata, audit, policy()), requested: [spec('example')] }, { input, output });
    input.end(response);
    assert.equal(await answer, false);
    assert.match(text, /Allow[\s\S]*Disallow/);
    assert.match(text, /cancelled/);
  }
});
test('progress is visible before registry work and confirmation follows completed checks', async t => {
  const f = fixture(t), messages = [];
  const run = (...args) => { assert.ok(messages.length); return f.run(...args); };
  const r = await install(['example'], { project: f.dir, progress: message => messages.push(message), confirm: async () => {
    assert.match(messages.at(-1), /Security check complete/);
    return false;
  } }, { run });
  assert.equal(r.status, 'cancelled');
  assert.match(messages[0], /checking npm packages/);
});
test('metadata checks run with bounded concurrency, deduplicate versions and retain failures', async () => {
  const { inspectMetadata } = require('../bin/security/metadata.js');
  let active = 0, peak = 0, fetched = 0;
  const messages = [];
  const graph = Array.from({ length: 10 }, (_, i) => ({ name: `pkg${i}`, version: '1.0.0' }));
  const metadata = await inspectMetadata([...graph, graph[0]], {
    progress: message => messages.push(message),
    fetch: async key => {
      fetched++; active++; peak = Math.max(peak, active);
      await new Promise(resolve => setImmediate(resolve));
      active--;
      if (key === 'pkg3@1.0.0') throw Error('Registry unavailable');
      return { name: key };
    }
  });
  assert.equal(fetched, 10);
  assert.equal(peak, 4);
  assert.equal(metadata.size, 10);
  assert.equal(metadata.get('pkg3@1.0.0'), null);
  assert.match(messages.at(-1), /\[10\/10\]/);
});

test('numbered installation menu matches the create-app choice style', async () => {
  const { PassThrough } = require('stream');
  const { confirmPackage } = require('../bin/security/confirm.js');
  for (const [response, expected] of [['1', true], ['2', false], ['3', 'always'], ['4', 'never'], ['', false]]) {
    const input = new PassThrough(), output = new PassThrough();
    let text = ''; output.on('data', chunk => { text += chunk; });
    const answer = confirmPackage({ ...evaluate(lock, metadata, audit, policy()), requested: [spec('example')] }, { input, output });
    assert.match(text, /Security checks passed for example@1\.0\.0/);
    assert.match(text, /1\) Allow installation once/);
    assert.match(text, /2\) Disallow installation once \(default\)/);
    assert.match(text, /Installation \[1\/2\/3\/4\]:/);
    input.end(response + '\n');
    assert.equal(await answer, expected);
  }
});
