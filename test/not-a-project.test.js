// kreft dev / kreft serve in a folder that is not a Kreft project say so instead of serving an empty folder
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CLI = path.join(__dirname, '..', 'bin', 'kreftjs.js');

test('kreft dev in an empty folder refuses; --force or an index.html lets it start', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-empty-'));
  try {
    const run = (...a) => spawnSync(process.execPath, [CLI, ...a], { cwd: dir, encoding: 'utf8', timeout: 2500, killSignal: 'SIGKILL' });
    const refused = run('dev', '--port', '0');
    assert.strictEqual(refused.status, 1);
    assert.match(refused.stderr, /is not a Kreft project/);
    assert.match(refused.stderr, /kreft new my-app/);
    // with --force, or a page to show, the server starts (and is killed by the timeout: no "not a Kreft project")
    assert.doesNotMatch(run('dev', '--port', '0', '--force').stderr, /is not a Kreft project/);
    fs.writeFileSync(path.join(dir, 'index.html'), '<h1>hi</h1>');
    assert.doesNotMatch(run('dev', '--port', '0').stderr, /is not a Kreft project/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
