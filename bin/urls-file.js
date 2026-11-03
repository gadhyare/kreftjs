/*
 * A list of page addresses from a file, for `som build --prerender --urls urls.js` and `som sitemap --urls urls.js`.
 *
 *   urls.json   ["/posts/1", "/posts/2"]  or  [{ "path": "/posts/1", "lastmod": "2026-01-02" }]
 *   urls.txt    one address per line (# starts a comment)
 *   urls.js     module.exports = ['/posts/1'] or an (async) function that returns the list
 */
const fs = require('fs');
const path = require('path');

module.exports = async function loadUrls(file) {
  const full = path.resolve(file);
  if (!fs.existsSync(full)) throw new Error(`--urls: ${file} does not exist.`);
  let list;
  if (/\.json$/i.test(full)) list = JSON.parse(fs.readFileSync(full, 'utf8'));
  else if (/\.txt$/i.test(full)) list = fs.readFileSync(full, 'utf8').split('\n').map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);
  else {
    list = require(full);
    if (list && list.default) list = list.default;
    if (typeof list === 'function') list = await list();
  }
  if (!Array.isArray(list)) throw new Error(`--urls: ${file} must give a list of addresses.`);
  return list
    .map((u) => (typeof u === 'string' ? u : u && u.path ? u : null))
    .filter(Boolean)
    .filter((u) => { const p = typeof u === 'string' ? u : u.path; return typeof p === 'string' && p.startsWith('/') && !/[:*]/.test(p); });
};
