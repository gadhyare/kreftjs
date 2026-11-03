/*
 * npm packages in the browser.
 *
 *   import dayjs from 'dayjs'                        (in a .kreft file)
 *   import { debounce } from 'lodash'
 *   import 'bootstrap/dist/css/bootstrap.min.css'
 *
 * kreft dev answers /__kreft/deps/<package> with the package as one browser-ready ES module, made by
 * esbuild (npm i -D esbuild), and adds an import map so the browser knows where 'dayjs' is.
 * kreft build writes the same files into dist/deps/. Without esbuild, packages that already ship
 * ES modules still work in kreft dev; older CommonJS ones (like lodash) need esbuild.
 */
const fs = require('fs');
const path = require('path');

const NAME = /^(@[^/]+\/)?[^/@.][^/]*/; // the package name at the start of 'dayjs/plugin/utc' or '@scope/pkg/x'
const isBare = (spec) => !/^(\.{0,2}\/|[a-z][a-z0-9+.-]*:)/i.test(spec);
const IDENT = /^[A-Za-z_$][\w$]*$/;

function loadEsbuild(root) {
  try { return require(require.resolve('esbuild', { paths: [root, process.cwd(), __dirname] })); }
  catch (_) { return null; }
}
function resolveFrom(root, spec) {
  try { return require.resolve(spec, { paths: [root] }); } catch (_) { return null; }
}
function packageJson(root, spec) {
  const name = (spec.match(NAME) || [spec])[0];
  try { return { name, dir: path.dirname(require.resolve(name + '/package.json', { paths: [root] })), pkg: JSON.parse(fs.readFileSync(require.resolve(name + '/package.json', { paths: [root] }), 'utf8')) }; }
  catch (_) {
    // some packages don't let you load their package.json: find the folder by hand
    for (let dir = root; ; dir = path.dirname(dir)) {
      const p = path.join(dir, 'node_modules', name, 'package.json');
      if (fs.existsSync(p)) return { name, dir: path.dirname(p), pkg: JSON.parse(fs.readFileSync(p, 'utf8')) };
      if (dir === path.dirname(dir)) return null;
    }
  }
}
// the names a CommonJS package exports, so `import { debounce } from 'lodash'` works
function commonJsNames(root, spec) {
  const file = resolveFrom(root, spec);
  if (!file) return [];
  try {
    const m = require(file);
    return m && (typeof m === 'object' || typeof m === 'function') ? Object.keys(m).filter((k) => IDENT.test(k) && k !== 'default') : [];
  } catch (_) {
    return []; // a package made only for browsers: default import only
  }
}
function isEsm(root, spec) {
  const info = packageJson(root, spec);
  if (!info) return false;
  const { pkg } = info;
  const ex = pkg.exports && (pkg.exports['.'] || pkg.exports);
  return pkg.type === 'module' || !!pkg.module || (ex && typeof ex === 'object' && !!(ex.import || ex.browser || ex.module));
}

const cache = new Map();
// one package (or a file inside it) as a single ES module for the browser.
// bundle() is async (kreft dev); bundleSync() is the same for kreft build.
function prepare(root, spec, minify) {
  const esbuild = loadEsbuild(root);
  if (!esbuild) throw Object.assign(new Error(`To use "${spec}" in the browser, install esbuild once:  kreft add -D esbuild`), { code: 'NO_ESBUILD' });
  // only packages by name: never a path that would bundle (and show) one of your own server files
  if (!isBare(spec) || spec.split('/').some((p) => p === '..' || p === '.')) throw Object.assign(new Error(`"${spec}" is not a package name.`), { code: 'MISSING' });
  const file = resolveFrom(root, spec);
  if (!file) throw Object.assign(new Error(`The package "${spec}" is not installed. Run:  kreft add ${(spec.match(NAME) || [spec])[0]}`), { code: 'MISSING' });
  const key = spec + '|' + fs.statSync(file).mtimeMs + '|' + minify + '|' + root;
  const s = JSON.stringify(spec);
  let tries;
  if (isEsm(root, spec)) tries = [`export * from ${s}; export { default } from ${s};`, `export * from ${s};`];
  else {
    const names = commonJsNames(root, spec);
    tries = [`import m from ${s}; export default m;${names.length ? ` export const { ${names.join(', ')} } = m;` : ''}`];
  }
  const options = (contents) => ({
    stdin: { contents, resolveDir: root, loader: 'js', sourcefile: spec }, bundle: true, write: false, format: 'esm', platform: 'browser',
    target: 'es2020', minify, logLevel: 'silent', legalComments: minify ? 'none' : 'inline',
    define: { 'process.env.NODE_ENV': JSON.stringify(minify ? 'production' : 'development'), global: 'globalThis' },
  });
  return { esbuild, key, tries, options };
}
const failed = (spec, e) => new Error(`Could not prepare "${spec}" for the browser: ${(e && e.message || '').split('\n')[0]}`);

async function bundle(root, spec, { minify = false } = {}) {
  const { esbuild, key, tries, options } = prepare(root, spec, minify);
  if (cache.has(key)) return cache.get(key);
  let lastError;
  for (const contents of tries) {
    try { const code = (await esbuild.build(options(contents))).outputFiles[0].text; cache.set(key, code); return code; }
    catch (e) { lastError = e; }
  }
  throw failed(spec, lastError);
}
function bundleSync(root, spec, { minify = true } = {}) {
  const { esbuild, key, tries, options } = prepare(root, spec, minify);
  if (cache.has(key)) return cache.get(key);
  let lastError;
  for (const contents of tries) {
    try { const code = esbuild.buildSync(options(contents)).outputFiles[0].text; cache.set(key, code); return code; }
    catch (e) { lastError = e; }
  }
  throw failed(spec, lastError);
}

// a file inside an installed package, like 'bootstrap/dist/css/bootstrap.min.css' → its path on disk
// (only inside that package's folder, so /__kreft/npm/ can't be used to read anything else)
function packageFile(root, spec) {
  const info = packageJson(root, spec);
  if (!info) return null;
  const rest = spec.slice(info.name.length).replace(/^\//, '');
  const file = path.resolve(info.dir, rest);
  if (file !== info.dir && !file.startsWith(info.dir + path.sep)) return null;
  try { return fs.statSync(file).isFile() ? file : null; } catch (_) { return null; }
}
// a safe file name for a package in dist/deps/: '@scope/pkg/x' → '@scope__pkg__x.js'
const safeName = (spec) => spec.replace(/[^\w@.-]+/g, '__') + '.js';

// the folder with package.json: the app folder or one of its parents
function projectDir(start) {
  for (let dir = path.resolve(start); ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    if (dir === path.dirname(dir)) return path.resolve(start);
  }
}

// the import map: 'dayjs' → /__kreft/deps/dayjs, 'dayjs/' → /__kreft/deps/dayjs/ (for 'dayjs/plugin/utc')
function importMap(root, base = '/__kreft/deps/') {
  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')); } catch (_) { return null; }
  const names = Object.keys(pkg.dependencies || {});
  if (!names.length) return null;
  const imports = {};
  names.forEach((n) => { imports[n] = base + n; imports[n + '/'] = base + n + '/'; });
  return { imports };
}

module.exports = { bundle, bundleSync, importMap, isBare, packageJson, packageFile, projectDir, safeName, loadEsbuild, NAME };
