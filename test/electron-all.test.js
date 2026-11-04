const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'bin', 'electron.js'), 'utf8');
const docs = fs.readFileSync(path.join(__dirname, '..', 'docs', 'README.md'), 'utf8');

test('electron:build --all expands to --mac --win --linux', () => {
  assert.match(src, /args\.includes\('--all'\)/);
  assert.match(src, /\['--mac', '--win', '--linux'\]/);
});

test('the docs list every electron:build flag', () => {
  for (const cmd of ['kreft electron:build --mac', 'kreft electron:build --win', 'kreft electron:build --linux',
    'kreft electron:build --mac --win --linux', 'kreft electron:build --all']) {
    assert.ok(docs.includes(cmd), cmd);
  }
});
