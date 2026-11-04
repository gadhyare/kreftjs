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

// the phone layout is compact: smaller type, the main button on its own line and the other two side by side, two-column lists
for (const page of PAGES) {
  test(`${page}: a compact layout for phones`, () => {
    const src = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
    const phone = src.slice(src.indexOf('@media (max-width: 640px) {\n  .welcome-container'));
    assert.match(phone, /\.hero-headline \{ font-size: 26px/);
    assert.match(phone, /\.pill-btn\.primary \{ grid-column: 1 \/ -1/);
    assert.match(phone, /dl \{ grid-template-columns: 1fr 1fr/, 'the 12 words in two columns');
    assert.match(phone, /\.inside ul \{ grid-template-columns: 1fr 1fr/, 'the parts in two columns');
    assert.match(phone, /@media \(max-width: 340px\)/, 'one column only on the narrowest phones');
    // the rest of the page's styles must still be there (a wrong edit once cut them away)
    for (const rule of ['.hero-grid {', '.terminal-card {', '.floating-preview {', '.pill-btn {', '.rotator {', '.version-pill {']) {
      assert.ok(src.includes('\n' + rule) || src.includes(rule), `${page} lost ${rule}`);
    }
    assert.ok(src.split('\n').length > 600, 'the page is still whole');
  });
}
