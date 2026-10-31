/*
 * TypeScript on the server: routes/api.ts and every .ts file in app/ and database/ load like .js files.
 * esbuild (npm i -D esbuild) removes the types and turns import/export into require, file by file,
 * the moment a file is required (like tsx or ts-node). It doesn't check the types: run `npx tsc --noEmit`
 * (npm run typecheck in a project made with som new --ts) for that.
 */
const fs = require('fs');
const path = require('path');

let installed = false;
let esbuild = null;
function loadEsbuild(from) {
  if (esbuild) return esbuild;
  for (const dir of [from, process.cwd(), __dirname].filter(Boolean)) {
    try { esbuild = require(require.resolve('esbuild', { paths: [dir] })); return esbuild; } catch (_) { /* next */ }
  }
  return null;
}

// require('./User') finds User.ts; a .ts file is turned into CommonJS when it loads
function registerTypeScript(projectDir) {
  if (installed) return;
  installed = true;
  const compile = (module, filename) => {
    const es = loadEsbuild(projectDir || path.dirname(filename));
    if (!es) throw new Error(`${path.basename(filename)} is TypeScript: install esbuild once in your project:  som add -D esbuild`);
    const source = fs.readFileSync(filename, 'utf8');
    let out;
    try {
      out = es.transformSync(source, { loader: filename.endsWith('x') ? 'tsx' : 'ts', format: 'cjs', target: 'node20', sourcefile: filename, sourcemap: 'inline' });
    } catch (e) {
      const m = e.errors && e.errors[0];
      throw new Error(m ? `${filename}:${m.location ? m.location.line : '?'}: ${m.text}` : e.message);
    }
    module._compile(out.code, filename);
  };
  for (const ext of ['.ts', '.mts', '.cts']) require.extensions[ext] = compile; // eslint-disable-line n/no-deprecated-api
  process.setSourceMapsEnabled && process.setSourceMapsEnabled(true); // errors point at the .ts lines
}

// the extensions a backend file may have, in the order they are looked for
const EXTS = ['.js', '.cjs', '.ts', '.mts', '.cts'];
const findFile = (base) => EXTS.map((e) => base + e).find((f) => { try { return fs.statSync(f).isFile(); } catch (_) { return false; } }) || null;

module.exports = { registerTypeScript, loadEsbuild, EXTS, findFile };
