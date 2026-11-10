'use strict';
// What kreft install shows: one live progress line instead of a line per package, and a short report instead of a block per package.
// A mobile app has over a hundred packages in its graph. The full list is in the report file and with --verbose.   Run: npm test
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { PassThrough } = require('stream');
const { makeProgress } = require('../bin/security/progress.js');
const { render, renderCompact } = require('../bin/security/install.js');
const { confirmPackage } = require('../bin/security/confirm.js');

// what is on the screen: in each line, only the text after the last "clear this line" counts
const screen = (text) => text.split('\n').map((l) => l.split('\r\x1b[2K').pop()).join('\n');
const fakeOut = (isTTY, columns = 100) => { const o = { isTTY, columns, text: '', write(s) { this.text += s; return true; } }; return o; };
const feed = (progress, total, { unavailable = [] } = {}) => {
  progress(`Reviewing ${total} unique package versions across the full project (up to 4 checks at once)...`);
  for (let i = 1; i <= total; i++) progress(`Checked registry metadata [${i}/${total}]: @scope/pkg-${i}@1.0.${i}${unavailable.includes(i) ? ' (unavailable; policy will evaluate missing evidence)' : ''}`);
};

test('on a terminal the checks are ONE line that updates in place, then a one-line summary', () => {
  const out = fakeOut(true);
  const progress = makeProgress({ out });
  feed(progress, 108);
  progress('Checking npm security advisories and project policy...');
  assert.equal(out.text.split('\r\x1b[2K').length - 1, 109, 'the line is redrawn 108 times and cleared once');
  const visible = screen(out.text);
  assert.doesNotMatch(visible, /Checked registry metadata \[/, 'no per-package line is left on the screen');
  assert.match(visible, /Checking 108 package versions against the npm registry\.\.\./);
  assert.match(visible, /✓ Checked 108 package versions in the registry\.\n/);
  assert.match(visible, /Checking npm security advisories and project policy\.\.\.\n$/, 'the next message starts on its own line');
  assert.match(out.text, /\[██████████████████████ ?\] ?108\/108|\[█{20}\] 108\/108/, 'a full bar at the end');
  assert.match(out.text, /\[░{20}\]|\[█░{19}\] 1\/108/, 'and an empty one at the start');
  const lines = visible.split('\n').filter((l) => l.trim());
  assert.ok(lines.length <= 4, 'what is left on the screen is a few lines, got ' + lines.length);
});

test('a long package name is cut to the width of the terminal, never wrapped', () => {
  const out = fakeOut(true, 40);
  const progress = makeProgress({ out });
  progress('Reviewing 2 unique package versions across the full project (up to 4 checks at once)...');
  progress('Checked registry metadata [1/2]: @a-very-long-scope/a-very-long-package-name-indeed@10.20.30');
  const drawn = out.text.split('\r\x1b[2K').pop().split('\n')[0];
  assert.ok(drawn.length <= 40, `the line is ${drawn.length} characters in a 40 column terminal`);
  assert.match(drawn, /…$/);
});

test('without a terminal (CI, a pipe) only a few lines are printed', () => {
  const out = fakeOut(false);
  feed(makeProgress({ out }), 108);
  const lines = out.text.split('\n').filter(Boolean);
  assert.deepEqual(lines.map((l) => l.trim()), ['Checking 108 package versions against the npm registry...', 'checked 1/108', 'checked 25/108', 'checked 50/108', 'checked 75/108', 'checked 100/108', 'checked 108/108', '✓ Checked 108 package versions in the registry.']);
  assert.doesNotMatch(out.text, /\x1b/, 'no escape codes in a log');
  const json = fakeOut(true);
  feed(makeProgress({ out: json, plain: true }), 30);
  assert.doesNotMatch(json.text, /\x1b/, '--json is never drawn with a live line');
});

test('--verbose shows every message exactly as the installer sent it', () => {
  const out = fakeOut(true);
  feed(makeProgress({ out, verbose: true }), 40);
  assert.equal(out.text.split('\n').filter((l) => /^Checked registry metadata \[\d+\/40\]: /.test(l)).length, 40);
  assert.doesNotMatch(out.text, /\x1b/);
});

test('packages the registry could not answer for are counted in the summary', () => {
  const out = fakeOut(false);
  feed(makeProgress({ out }), 10, { unavailable: [2, 7] });
  assert.match(out.text, /✓ Checked 10 package versions in the registry \(2 unavailable: the policy treats missing evidence as a finding\)\./);
  const one = fakeOut(false);
  const p = makeProgress({ out: one });
  p('Reviewing 1 unique package versions across the full project (up to 4 checks at once)...');
  p('Checked registry metadata [1/1]: ms@2.1.3');
  assert.match(one.text, /Checking 1 package version against/);
  assert.match(one.text, /✓ Checked 1 package version in the registry\.\n/);
});

// a report like the ones the installer makes
const node = (name, version, extra = {}) => ({ name, version, location: `node_modules/${name}`, classification: 'Established', tier: 2, violations: [], warnings: [], evidence: [], ...extra });
const report = (n, { blocked = 0, warn = 0, status, allowed } = {}) => {
  const packages = Array.from({ length: n }, (_, i) => node(`pkg-${i}`, '1.0.0', {
    ...(i < blocked ? { classification: 'Blocked', tier: 'blocked', violations: [{ code: 'minimum-tier', detail: 'Tier 3 falls below required Tier 2' }] } : {}),
    warnings: i < warn ? ['Provenance advertised but not cryptographically verified'] : [],
  }));
  packages.unshift(node('dayjs', '1.11.23'));
  return { packages, requested: [{ name: 'dayjs', version: 'latest', raw: 'dayjs' }], limitations: ['No complete malware detection or source-code review'], allowed: allowed ?? !blocked, status: status || (blocked ? 'blocked' : 'approved') };
};

test('the report is a summary: counts, what was asked for, what is blocked, and the warnings grouped by reason', () => {
  const text = renderCompact(report(106, { blocked: 2, warn: 25 }), '.kreft/security/latest.txt');
  const lines = text.split('\n').filter(Boolean);
  assert.ok(lines.length < 16, `the report is ${lines.length} lines, not one block per package`);
  assert.match(text, /^BLOCKED — Kreft package security\n/);
  assert.match(text, /Reviewed 107 packages: 105 Established, 2 Blocked\./);
  assert.match(text, /Requested: dayjs@1\.11\.23 \(Established\)/);
  assert.match(text, /Blocked \(2\):\n  pkg-0@1\.0\.0  minimum-tier: Tier 3 falls below required Tier 2\n  pkg-1@1\.0\.0  minimum-tier/);
  assert.match(text, /Provenance advertised but not cryptographically verified \(25 packages\)/);
  assert.match(text, /Every package, one by one: \.kreft\/security\/latest\.txt   \(or run again with --verbose\)/);
  assert.match(text, /No complete malware detection/, 'the limits are still stated');
  assert.equal(text.split('Provenance advertised').length - 1, 1, 'a warning that applies to 25 packages is printed once');
});

test('a small clean install is just a few lines, and the status words are kept', () => {
  const ok = renderCompact(report(0));
  assert.match(ok, /^APPROVED — Kreft package security\nReviewed 1 package: 1 Established\.\nRequested: dayjs@1\.11\.23 \(Established\)\n/);
  assert.doesNotMatch(ok, /Blocked|Warnings:/);
  assert.match(ok, /run again with --verbose/, 'with no report file it points at --verbose');
  assert.match(renderCompact({ ...report(0), status: 'cancelled', allowed: false }), /^DISALLOWED — /);
});

test('the blocked list is capped, so a bad graph cannot fill the screen', () => {
  const text = renderCompact(report(60, { blocked: 45 }));
  assert.match(text, /Blocked \(45\):/);
  assert.equal(text.split('\n').filter((l) => /^  pkg-\d+@/.test(l)).length, 20);
  assert.match(text, /…and 25 more/);
  const long = report(1, { blocked: 1 });
  long.packages[1].violations[0].detail = { advisory: 'x'.repeat(1000) };
  assert.ok(renderCompact(long).split('\n').every((l) => l.length < 260), 'a huge advisory is cut to a line');
});

test('the full report is unchanged: every package, one by one, with its warnings (this is the file and --verbose)', () => {
  const full = render(report(106, { blocked: 2, warn: 25 }));
  assert.ok(full.split('\n').length > 150);
  for (const name of ['dayjs@1.11.23', 'pkg-0@1.0.0', 'pkg-105@1.0.0']) assert.ok(full.includes(name), name);
  assert.match(full, /BLOCK minimum-tier: Tier 3 falls below required Tier 2/);
});

test('the question shows the summary, not every package; --verbose shows everything', async () => {
  const ask = async (verbose) => {
    const input = new PassThrough(), output = new PassThrough();
    let text = ''; output.on('data', (c) => { text += c; });
    const answer = confirmPackage(report(106, { warn: 25 }), { input, output, verbose });
    input.end('d\n');
    await answer;
    return text;
  };
  const compact = await ask(false);
  assert.ok(compact.split('\n').length < 20, 'the screen before the question is short');
  assert.match(compact, /dayjs@1\.11\.23: Established/);
  assert.doesNotMatch(compact, /Reviewed|Warnings:|pkg-50|Provenance/);
  assert.match(compact, /Security checks passed for dayjs@1\.11\.23[\s\S]*1\) Allow installation once/);
  const full = await ask(true);
  assert.ok(full.split('\n').length > 150);
  assert.match(full, /pkg-50@1\.0\.0 \[node_modules\/pkg-50\]/);
});

test('--verbose is in the help and the documentation', () => {
  const help = cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'kreftjs.js'), 'install', '--help'], { encoding: 'utf8' }).stdout;
  assert.match(help, /--verbose +Show every package as it is checked/);
  const doc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'package-security.md'), 'utf8');
  for (const t of ['--verbose', 'Package Security Assessment Report', 'latest.txt']) assert.ok(doc.includes(t), 'docs: ' + t);
});

test('package colors follow terminal capability and NO_COLOR; reports remain plain by default', () => {
  const { colors, colorReport } = require('../bin/security/colors.js');
  assert.equal(colors({ isTTY: true }, {}).green('Allowed'), '\x1b[32mAllowed\x1b[0m');
  assert.equal(colors({ isTTY: false }, {}).red('Blocked'), 'Blocked');
  assert.equal(colors({ isTTY: true }, { NO_COLOR: '' }).cyan('Checking'), 'Checking');
  assert.equal(colors({ isTTY: true }, { TERM: 'dumb' }).cyan('Checking'), 'Checking');
  assert.equal(colorReport('APPROVED\nWarnings:\nBLOCKED', { isTTY: false }), 'APPROVED\nWarnings:\nBLOCKED');
});

test('normal status hides dependency details but explains a project policy block', () => {
  const { renderStatus } = require('../bin/security/install.js');
  const r = report(106, { warn: 25 });
  r.status = 'blocked';
  r.allowed = false;
  const text = renderStatus(r);
  assert.match(text, /dayjs@1\.11\.23: Established/);
  assert.match(text, /blocked by project dependency security policy/);
  assert.doesNotMatch(text, /pkg-|Warnings|Provenance|via|severity/);
});
