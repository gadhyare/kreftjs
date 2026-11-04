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

// the welcome pages fit every screen: no sideways scroll, the code window and live card stack on small screens
for (const page of PAGES) {
  test(`${page}: says it is a Laravel-friendly JavaScript framework and is built to be responsive`, () => {
    const src = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
    assert.match(src, /JavaScript framework · Laravel-friendly/);
    assert.match(src, /✓ Laravel-friendly/);
    assert.match(src, /familiar if you know Laravel/);
    assert.match(src, /grid-template-columns: minmax\(0, 1fr\)/, 'a one-column grid that may shrink');
    assert.match(src, /overflow-x: clip/, 'the glow circles cannot widen the page');
    assert.match(src, /\.hero-visual \{ flex-direction: column/, 'code window and live card stack on small screens');
    for (const w of ['1100px', '960px', '640px', '380px']) assert.ok(src.includes(`@media (max-width: ${w})`), `a rule for screens up to ${w}`);
    assert.match(src, /env\(safe-area-inset-left\)/, 'phones with a notch');
  });
}
