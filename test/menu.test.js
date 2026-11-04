// The website's top menu and footer link to the Playground, and the bar still fits a 320 px phone
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('the top menu has Docs, Playground and Examples, in that order, linking to real pages', () => {
  const header = read('demo/components/SiteHeader.kreft');
  const nav = header.slice(header.indexOf('<nav class="top'), header.indexOf('</nav>'));
  const links = [...nav.matchAll(/to="([^"]+)"[^>]*>([^<]+)</g)].map((m) => [m[1], m[2]]);
  assert.deepStrictEqual(links, [['/docs', 'Docs'], ['/playground', 'Playground'], ['/basics', 'Examples']]);
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'demo/pages/Playground.kreft')), 'the page behind /playground exists');
  assert.match(read('demo/layouts/main.kreft'), /to: '\/playground'/, 'and it is in the side menu too');
});

test('the footer of the start page links to the Playground', () => {
  assert.match(read('demo/layouts/plain.kreft'), /<kreft-link to="\/playground">Playground<\/kreft-link>/);
});

test('the bar fits small phones: Examples leaves the bar, and the 360 px rules tighten it', () => {
  const header = read('demo/components/SiteHeader.kreft');
  assert.match(header, /@media \(max-width: 440px\) \{\s*\.top \.nav-extra \{ display: none; \}/);
  assert.match(header, /@media \(max-width: 360px\) \{[\s\S]*\.bar-inner \{ padding: 0 10px; \}/);
  assert.match(header, /class="nav-extra">Examples</);
});
