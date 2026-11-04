// The welcome pages rotate four headlines, each sliding in with a flash; people who asked for less motion get none
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const HEADLINES = [
  'Build full-stack apps in plain words.',
  'The JavaScript framework that reads like English.',
  'Components, backend and database in one small framework.',
  'A small framework for the whole stack.',
];
const PAGES = ['templates/app/frontend/pages/Home.kreft', 'demo/pages/Start.kreft'];

for (const page of PAGES) {
  test(`${page}: four headlines, a flash animation and a reduced-motion rule`, () => {
    const src = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
    for (const h of HEADLINES) assert.ok(src.includes(`'${h}'`), `${page} misses "${h}"`);
    assert.match(src, /@keyframes rotator-flash/);
    assert.match(src, /prefers-reduced-motion/);
    assert.match(src, /clearInterval\(rotTimer\)/, 'the timer is stopped when the page goes away');
    assert.ok(!/The Enterprise/.test(src), 'the old headline is gone');
  });
}
