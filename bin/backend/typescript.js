/*
 * TypeScript support across backend and frontend:
 *   - Backend: routes/api.ts, config/*.ts, server/*.ts, and every .ts file in app/ and database/ load like .js files.
 *   - Frontend: .ts modules (e.g. frontend/logic/*.ts) and .kreft components with TypeScript syntax work natively in
 *     both `kreft dev` and `kreft build`.
 *
 * Uses `esbuild` when installed in the project, or falls back to Kreft's built-in zero-dependency TypeScript
 * compiler (`Kreftjs.stripTypeScript` + ESM-to-CJS transform) so TypeScript projects work out of the box with zero setup.
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const Kreftjs = require('../../kreftjs.js');

let installed = false;
let esbuild = null;
function loadEsbuild(from) {
  if (esbuild) return esbuild;
  for (const dir of [from, process.cwd(), __dirname].filter(Boolean)) {
    try { esbuild = require(require.resolve('esbuild', { paths: [dir] })); return esbuild; } catch (_) { /* next */ }
  }
  return null;
}

// Converts ES module import/export syntax into CommonJS require/module.exports for Node.js require() hooks
function esmToCjs(code) {
  let uid = 0;
  const namedExports = [];
  let hasDefaultExport = false;

  // 1. import * as ns from 'spec'
  code = code.replace(/^[ \t]*import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+(['"][^'"]+['"])[ \t]*;?/gm, 'const $1 = require($2);');

  // 2. import Def, { a, b as c } from 'spec'
  code = code.replace(/^[ \t]*import\s+([A-Za-z_$][\w$]*)\s*,\s*\{([^}]*)\}\s*from\s+(['"][^'"]+['"])[ \t]*;?/gm, (_, def, specs, mod) => {
    const tmp = `__kreft_imp_${++uid}`;
    const mapped = specs.replace(/\b([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)/g, '$1: $2');
    return `const ${tmp} = require(${mod}); const ${def} = ${tmp} && ${tmp}.__esModule && ${tmp}.default !== undefined ? ${tmp}.default : ${tmp}; const {${mapped}} = ${tmp};`;
  });

  // 3. import { a, b as c } from 'spec'
  code = code.replace(/^[ \t]*import\s*\{([^}]*)\}\s*from\s+(['"][^'"]+['"])[ \t]*;?/gm, (_, specs, mod) => {
    const mapped = specs.replace(/\b([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)/g, '$1: $2');
    return `const {${mapped}} = require(${mod});`;
  });

  // 4. import Def from 'spec'
  code = code.replace(/^[ \t]*import\s+([A-Za-z_$][\w$]*)\s+from\s+(['"][^'"]+['"])[ \t]*;?/gm, (_, def, mod) => {
    const tmp = `__kreft_imp_${++uid}`;
    return `const ${tmp} = require(${mod}); const ${def} = ${tmp} && ${tmp}.__esModule && ${tmp}.default !== undefined ? ${tmp}.default : ${tmp};`;
  });

  // 5. import 'spec'
  code = code.replace(/^[ \t]*import\s+(['"][^'"]+['"])[ \t]*;?/gm, 'require($1);');

  // 6. export { a, b as c } from 'spec'
  code = code.replace(/^[ \t]*export\s*\{([^}]*)\}\s*from\s+(['"][^'"]+['"])[ \t]*;?/gm, (_, specs, mod) => {
    const tmp = `__kreft_exp_${++uid}`;
    const assigns = specs.split(',').map((s) => s.trim()).filter(Boolean).map((p) => {
      const [from, to] = p.split(/\s+as\s+/);
      return `exports[${JSON.stringify((to || from).trim())}] = ${tmp}[${JSON.stringify(from.trim())}];`;
    }).join(' ');
    return `const ${tmp} = require(${mod}); ${assigns}`;
  });

  // 7. export * from 'spec'
  code = code.replace(/^[ \t]*export\s+\*\s+from\s+(['"][^'"]+['"])[ \t]*;?/gm, 'Object.assign(exports, require($1));');

  // 8. export default class / function Name
  code = code.replace(/^[ \t]*export\s+default\s+((?:async\s+)?function(?:\s*\*)?\s+([A-Za-z_$][\w$]*)|class\s+([A-Za-z_$][\w$]*))/gm, (_, decl, fnName, clsName) => {
    hasDefaultExport = true;
    const id = fnName || clsName;
    namedExports.push(`module.exports = ${id}; exports.default = ${id};`);
    return decl;
  });

  // 9. export default expr
  code = code.replace(/^[ \t]*export\s+default\s+/gm, () => {
    hasDefaultExport = true;
    return 'module.exports = exports.default = ';
  });

  // 10. export const / let / var / function / class
  code = code.replace(/^[ \t]*export\s+((?:const|let|var)\s+([A-Za-z_$][\w$]*)|(?:async\s+)?function(?:\s*\*)?\s+([A-Za-z_$][\w$]*)|class\s+([A-Za-z_$][\w$]*))/gm, (_, decl, vName, fnName, clsName) => {
    const id = vName || fnName || clsName;
    namedExports.push(`exports.${id} = ${id};`);
    return decl;
  });

  // 11. export { a, b as c }
  code = code.replace(/^[ \t]*export\s*\{([^}]*)\}[ \t]*;?/gm, (_, specs) => {
    return specs.split(',').map((s) => s.trim()).filter(Boolean).map((p) => {
      const [from, to] = p.split(/\s+as\s+/);
      const target = (to || from).trim();
      if (target === 'default') {
        hasDefaultExport = true;
        return `module.exports = exports.default = ${from.trim()};`;
      }
      return `exports.${target} = ${from.trim()};`;
    }).join(' ');
  });

  if (namedExports.length) {
    code += '\n' + namedExports.join('\n');
  }
  if (hasDefaultExport) {
    code += `\nif (module.exports && (typeof module.exports === 'object' || typeof module.exports === 'function')) { try { if (!('default' in module.exports)) Object.defineProperty(module.exports, 'default', { value: module.exports, enumerable: false, configurable: true }); Object.defineProperty(module.exports, '__esModule', { value: true, enumerable: false, configurable: true }); } catch (_) {} }`;
  }
  return code;
}

// Transpile a TypeScript source string into JavaScript ('cjs' for Node require, 'esm' for browser modules)
function transpileTs(source, { filename = 'module.ts', format = 'cjs', projectDir = null } = {}) {
  const es = loadEsbuild(projectDir || path.dirname(filename));
  if (es) {
    const out = es.transformSync(source, {
      loader: filename.endsWith('x') ? 'tsx' : 'ts',
      format,
      target: format === 'esm' ? 'es2020' : 'node20',
      sourcefile: filename,
      sourcemap: 'inline',
    });
    return out.code;
  }

  // Fallback 1: Node 22.6+ native stripTypeScriptTypes (when no `enum` is used)
  let jsCode = null;
  if (typeof Module.stripTypeScriptTypes === 'function' && !/\benum\s+[A-Za-z_$]/.test(source)) {
    try {
      jsCode = Module.stripTypeScriptTypes(source);
    } catch (_) {
      jsCode = null;
    }
  }
  // Fallback 2: Kreft built-in zero-dependency TypeScript stripper
  if (jsCode == null) {
    jsCode = Kreftjs.stripTypeScript(source);
  }

  return format === 'cjs' ? esmToCjs(jsCode) : jsCode;
}

// require('./User') finds User.ts; a .ts file is turned into CommonJS when it loads
function registerTypeScript(projectDir) {
  if (installed) return;
  installed = true;
  const compile = (module, filename) => {
    const source = fs.readFileSync(filename, 'utf8');
    let code;
    try {
      code = transpileTs(source, { filename, format: 'cjs', projectDir });
    } catch (e) {
      const m = e.errors && e.errors[0];
      throw new Error(m ? `${filename}:${m.location ? m.location.line : '?'}: ${m.text}` : e.message);
    }
    module._compile(code, filename);
  };
  for (const ext of ['.ts', '.mts', '.cts']) require.extensions[ext] = compile; // eslint-disable-line n/no-deprecated-api
  process.setSourceMapsEnabled && process.setSourceMapsEnabled(true); // errors point at the .ts lines
}

// the extensions a backend file may have, in the order they are looked for
const EXTS = ['.js', '.cjs', '.ts', '.mts', '.cts'];
const findFile = (base) => EXTS.map((e) => base + e).find((f) => { try { return fs.statSync(f).isFile(); } catch (_) { return false; } }) || null;

module.exports = { registerTypeScript, loadEsbuild, transpileTs, esmToCjs, EXTS, findFile };
