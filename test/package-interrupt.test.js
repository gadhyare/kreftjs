'use strict';
// Stopping `kreft install` (Ctrl+C, closing the terminal) must leave the project as it was: no .kreft-security-stage-* folder, no report,
// no change. Staging folders that an older run left behind are removed. Run: npm test
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const { install } = require('../bin/security/install.js');

const integrity = 'sha512-' + Buffer.alloc(64, 1).toString('base64');
const artifact = { version: '1.0.0', resolved: 'https://registry.npmjs.org/example/-/example-1.0.0.tgz', integrity };
const lock = { lockfileVersion: 3, packages: { '': {}, 'node_modules/example': artifact } };
const meta = { name: 'example', version: '1.0.0', license: 'MIT', maintainers: [{ name: 'p' }], repository: 'https://example.org/s', dist: { integrity, tarball: artifact.resolved } };

function project(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-interrupt-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"app","version":"1.0.0"}\n');
  fs.mkdirSync(path.join(dir, 'node_modules'));
  fs.writeFileSync(path.join(dir, 'node_modules', 'old.txt'), 'original');
  return dir;
}
const fakeNpm = (onView) => (_cmd, args, options) => {
  if (args[0] === 'install') {
    fs.writeFileSync(path.join(options.cwd, 'package-lock.json'), JSON.stringify(lock));
    fs.writeFileSync(path.join(options.cwd, 'package.json'), JSON.stringify({ name: 'app', version: '1.0.0', dependencies: { example: '1.0.0' } }));
  }
  if (args[0] === 'view') { if (onView) onView(); return { status: 0, stdout: JSON.stringify(meta) }; }
  if (args[0] === 'audit') return { status: 0, stdout: JSON.stringify({ auditReportVersion: 2, vulnerabilities: {} }) };
  if (args[0] === 'ci') {
    fs.mkdirSync(path.join(options.cwd, 'node_modules', 'example'), { recursive: true });
    fs.writeFileSync(path.join(options.cwd, 'node_modules', '.package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: { 'node_modules/example': artifact } }));
    fs.writeFileSync(path.join(options.cwd, 'node_modules', 'example', 'package.json'), JSON.stringify({ name: 'example', version: '1.0.0' }));
  }
  return { status: 0, stdout: '' };
};
const entries = (dir) => fs.readdirSync(dir).sort();
const aged = (dir, name, hours) => { const f = path.join(dir, name); fs.mkdirSync(f); fs.writeFileSync(path.join(f, 'package.json'), '{}'); const t = new Date(Date.now() - hours * 3600e3); fs.utimesSync(f, t, t); return f; };

test('a staging folder left by an interrupted run is removed on the next run; a recent one and other files are not', async t => {
  const dir = project(t);
  const stale1 = aged(dir, '.kreft-security-stage-OLD111', 2);
  const stale2 = aged(dir, '.kreft-security-stage-OLD222', 30);
  const fresh = aged(dir, '.kreft-security-stage-LIVE33', 0.1);   // a run that may still be going (in another terminal)
  const mine = aged(dir, '.kreft-security-staged-notours', 5);     // not our name
  fs.writeFileSync(path.join(dir, '.kreft-security-stage-file'), 'a file, not a folder of ours');
  fs.utimesSync(path.join(dir, '.kreft-security-stage-file'), new Date(0), new Date(0));
  await install(['example'], { project: dir, dryRun: true }, { run: fakeNpm() });
  assert.equal(fs.existsSync(stale1), false, 'two hours old: removed');
  assert.equal(fs.existsSync(stale2), false, 'a day old: removed');
  assert.equal(fs.existsSync(fresh), true, 'six minutes old: kept, a run could still be using it');
  assert.equal(fs.existsSync(mine), true, 'a folder with another name is never touched');
  assert.equal(fs.readFileSync(path.join(dir, '.kreft-security-stage-file'), 'utf8'), 'a file, not a folder of ours');
  assert.deepEqual(entries(dir).filter((n) => n.startsWith('.kreft-security-stage-') && n !== '.kreft-security-stage-LIVE33' && n !== '.kreft-security-stage-file'), [], "this run's own folder is gone too");
});

test('a finished run leaves no staging folder, and does not keep listening for signals', async t => {
  const dir = project(t);
  const before = ['SIGINT', 'SIGTERM', 'SIGHUP'].map((s) => process.listenerCount(s));
  for (const options of [{ dryRun: true }, { confirm: async () => false }, { confirm: async () => true }]) {
    await install(['example'], { project: dir, ...options }, { run: fakeNpm() });
    assert.deepEqual(entries(dir).filter((n) => n.startsWith('.kreft-security-stage-')), [], JSON.stringify(Object.keys(options)));
    assert.deepEqual(['SIGINT', 'SIGTERM', 'SIGHUP'].map((s) => process.listenerCount(s)), before, 'the signal handlers are removed again');
  }
});

// a separate process, so a real signal can be sent to it
function runAndInterrupt(dir, signal) {
  const script = `
    const fs = require('fs'), path = require('path');
    const { install } = require(${JSON.stringify(path.join(__dirname, '..', 'bin', 'security', 'install.js'))});
    const lock = ${JSON.stringify(lock)}, meta = ${JSON.stringify(meta)};
    const run = (_c, args, o) => {
      if (args[0] === 'install') { fs.writeFileSync(path.join(o.cwd, 'package-lock.json'), JSON.stringify(lock)); fs.writeFileSync(path.join(o.cwd, 'package.json'), JSON.stringify({ name: 'app', version: '1.0.0', dependencies: { example: '1.0.0' } })); }
      if (args[0] === 'audit') return { status: 0, stdout: '{"auditReportVersion":2,"vulnerabilities":{}}' };
      return { status: 0, stdout: '' };
    };
    // the registry lookup is asynchronous, like the real one: the signal arrives while the check is going on
    const view = async () => { process.kill(process.pid, ${JSON.stringify(signal)}); await new Promise((r) => setTimeout(r, 200)); return meta; };
    install(['example'], { project: ${JSON.stringify(dir)}, confirm: async () => { console.log('REACHED THE QUESTION'); return true; } }, { run, view }).then(() => { console.log('FINISHED'); });
  `;
  return cp.spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 30000 });
}

test('Ctrl+C in the middle of the check removes the staging folder and changes nothing', t => {
  const dir = project(t);
  fs.writeFileSync(path.join(dir, 'kreftjs.config.json'), '{"db":"x"}\n');
  const snapshot = () => entries(dir).map((n) => n + ':' + (fs.statSync(path.join(dir, n)).isFile() ? fs.readFileSync(path.join(dir, n), 'utf8') : fs.readdirSync(path.join(dir, n)).join(',')));
  const before = snapshot();
  const r = runAndInterrupt(dir, 'SIGINT');
  assert.equal(r.status, 130, 'the exit status of an interrupted process: ' + r.stderr);
  assert.doesNotMatch(r.stdout, /REACHED THE QUESTION|FINISHED/, 'it stopped before the question');
  assert.deepEqual(snapshot(), before, 'every file and folder is exactly as it was: no staging folder, no report');
});

test('closing the terminal or a SIGTERM does the same', t => {
  for (const [signal, code] of [['SIGTERM', 143], ['SIGHUP', 143]]) {
    const dir = project(t);
    const before = entries(dir);
    const r = runAndInterrupt(dir, signal);
    assert.equal(r.status, code, signal);
    assert.deepEqual(entries(dir), before, signal + ': nothing left behind');
  }
});

test('the signal handler does not interrupt the step that moves the reviewed packages into place', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'bin', 'security', 'install.js'), 'utf8');
  assert.match(src, /const onSignal = \(signal\) => \{ if \(promoting\) return;/);
  assert.ok(src.indexOf('promoting = true;') < src.indexOf("fs.renameSync(modules, backup)"), 'protected before the first move');
  assert.match(src, /for \(const \[s, h\] of handlers\) process\.removeListener\(s, h\);/);
});
