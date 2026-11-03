/*
 * Kreft Vite Plugin
 *
 * Full-featured Vite.js support for Kreft:
 *   • Compiles .kreft components into native ES modules
 *   • Scoped CSS (<style scoped>) extracted into Vite virtual CSS modules with instant HMR
 *   • Route files (routes/*.kreft) automatically transformed and registered
 *   • Component HMR preserves live state and reactivity
 *   • Precompiles view expressions ahead of time (zero eval / CSP-safe)
 *   • Automatically resolves and aliases 'kreft' and 'som' (the Som.js name)
 *
 * Usage (vite.config.js):
 *   import { defineConfig } from 'vite';
 *   import kreft from 'kreft/vite';
 *
 *   export default defineConfig({
 *     plugins: [kreft()],
 *   });
 */

const fs = require('fs');
const path = require('path');
const Kreft = require('../kreft.js');

const {
  expandBlocks, prepareTemplate, splitKreft, splitInterp, exactBrace, stripBrace,
  interpToExpr, quoteBraceAttrs, expandSelfClosing, scopeCss, hashString,
  simplePathRE, fnExpRE, forAliasRE
} = Kreft.__internal;

/* ------------------------------------------------------------------ helpers */
function extractImportedNames(what) {
  if (!what) return [];
  const names = [];
  const parts = what.split(',').map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    if (part.startsWith('{') || part.endsWith('}')) {
      const inside = part.replace(/^\{|\}$/g, '').trim();
      inside.split(',').map((s) => s.trim()).filter(Boolean).forEach((s) => {
        const asMatch = s.match(/\bas\s+([A-Za-z_$][\w$]*)$/);
        if (asMatch) names.push(asMatch[1]);
        else if (/^[A-Za-z_$][\w$]*$/.test(s)) names.push(s);
      });
    } else {
      const starMatch = part.match(/^\*\s+as\s+([A-Za-z_$][\w$]*)$/);
      if (starMatch) names.push(starMatch[1]);
      else if (/^[A-Za-z_$][\w$]*$/.test(part)) names.push(part);
    }
  }
  return names;
}

/* ------------------------------------------------------------------ expressions → functions */
const EVAL = (expr) => ['$s', `with($s){return(${expr})}`];
const STMT = (expr) => ['$s,$event,$args', `with($s){${expr}}`];
const ASSIGN = (expr) => ['$s,$v', `with($s){${expr}=$v}`];

function addFn(fns, [params, code]) {
  const key = params + '\u0000' + code;
  if (fns.has(key)) return;
  const src = `function (${params.split(',').join(', ')}) { ${code} }`;
  try { new Function('return ' + src); } catch (_) { return; }
  fns.set(key, src);
}

function addHandler(fns, expr) {
  if (!expr || !expr.trim()) return;
  if (simplePathRE.test(expr.trim()) || fnExpRE.test(expr)) addFn(fns, EVAL(expr));
  else addFn(fns, STMT(expr));
}

function addEval(fns, expr) {
  if (expr != null && expr !== '') addFn(fns, EVAL(expr));
}

const STRUCTURAL = new Set(['if', 'elif', 'else', 'each', 'key', 'ref', 'skip', 'cloak', 'slot', 'empty', 'once', 'animate', 'waiting', 'failed']);

function collectExpressions(template, fns) {
  const html = prepareTemplate(template);
  scanHtml(html, {
    attr(name, value) {
      if (name[0] === ':' || name === 'k-bind' || name.startsWith('k-bind:')) return addEval(fns, value);
      if (name[0] === '@' || name.startsWith('k-on:')) return addHandler(fns, stripBrace(value));
      if (name.startsWith('k-')) {
        const v = stripBrace(value);
        const dir = name.slice(2).split('.')[0].split(':')[0];
        if (dir === 'if' || dir === 'elif' || dir === 'key') return addEval(fns, v);
        if (dir === 'each') {
          const m = v.match(forAliasRE);
          if (m) addEval(fns, m[3].trim());
          return;
        }
        if (dir === 'model') { addEval(fns, v); addFn(fns, ASSIGN(v)); return; }
        if (!STRUCTURAL.has(dir) && v) addEval(fns, v);
        return;
      }
      if (value.includes('{')) {
        const expr = exactBrace(value) ?? interpToExpr(value);
        if (expr != null) addEval(fns, expr);
      }
    },
    text(t) {
      if (!t.includes('{')) return;
      const parts = splitInterp(t);
      if (!parts.some((p) => p.expr != null)) return;
      const code = `with($s){return ${parts.map((p) => (p.expr != null ? `$d(${p.expr})` : JSON.stringify(p.text))).join('+')}}`;
      addFn(fns, ['$s,$d', code]);
    },
  });
}

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', times: '×',
  middot: '·', hellip: '…', mdash: '—', ndash: '–', larr: '←', rarr: '→', uarr: '↑', darr: '↓', laquo: '«', raquo: '»', bull: '•'
};
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') {
    const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isNaN(cp) || cp < 0 || cp > 0x10ffff ? m : String.fromCodePoint(cp);
  }
  return ENTITIES[e.toLowerCase()] ?? m;
});

function scanHtml(html, on) {
  let i = 0, text = '', dropNewline = false;
  const flush = () => {
    if (text) {
      let t = decode(text);
      if (dropNewline && t[0] === '\n') t = t.slice(1);
      on.text(t);
    }
    text = '';
    dropNewline = false;
  };
  while (i < html.length) {
    if (html.startsWith('<!--', i)) {
      flush();
      const e = html.indexOf('-->', i + 4);
      i = e < 0 ? html.length : e + 3;
      continue;
    }
    if (html[i] === '<' && html[i + 1] === '/') {
      flush();
      const e = html.indexOf('>', i);
      i = e < 0 ? html.length : e + 1;
      continue;
    }
    if (html[i] === '<' && /[A-Za-z]/.test(html[i + 1] || '')) {
      flush();
      let j = i + 1;
      while (j < html.length && !/[\s/>]/.test(html[j])) j++;
      while (j < html.length && html[j] !== '>') {
        if (/[\s/]/.test(html[j])) { j++; continue; }
        let k = j;
        while (k < html.length && !/[\s"'>/=]/.test(html[k])) k++;
        const name = html.slice(j, k).toLowerCase();
        let value = '';
        let q = k;
        while (/\s/.test(html[q] || '')) q++;
        if (html[q] === '=') {
          q++;
          while (/\s/.test(html[q] || '')) q++;
          if (html[q] === '"' || html[q] === "'") {
            const end = html.indexOf(html[q], q + 1);
            value = html.slice(q + 1, end < 0 ? html.length : end);
            k = end < 0 ? html.length : end + 1;
          } else {
            let e = q;
            while (e < html.length && !/[\s>]/.test(html[e])) e++;
            value = html.slice(q, e);
            k = e;
          }
        }
        on.attr(name, value);
        j = k;
      }
      i = j < html.length && html[j] === '>' ? j + 1 : j;
      dropNewline = true;
      continue;
    }
    text += html[i];
    i++;
  }
  flush();
}

/* ------------------------------------------------------------------ the plugin */
function kreftPlugin(options = {}) {
  const include = options.include || /\.(?:kreft|som)$/; // .som: files of a Som.js project
  const exclude = options.exclude || /node_modules/;
  const precompile = options.precompile !== false;
  const isComponentFile = (f) => /\.(?:kreft|som)$/.test(f);
  const kreftRuntimePath = path.resolve(__dirname, '..', 'kreft.js');

  const filter = (id) => {
    if (include instanceof RegExp && !include.test(id)) return false;
    if (typeof include === 'string' && !id.includes(include)) return false;
    if (Array.isArray(include) && !include.some((p) => (p instanceof RegExp ? p.test(id) : id.includes(p)))) return false;
    if (exclude instanceof RegExp && exclude.test(id)) return false;
    if (typeof exclude === 'string' && id.includes(exclude)) return false;
    if (Array.isArray(exclude) && exclude.some((p) => (p instanceof RegExp ? p.test(id) : id.includes(p)))) return false;
    return true;
  };

  // Cache parsed styles for handleHotUpdate comparison
  const fileCache = new Map();

  return {
    name: 'kreft:vite',
    enforce: 'pre',

    config(userConfig) {
      return {
        resolve: {
          alias: [
            { find: /^kreft$/, replacement: kreftRuntimePath },
            { find: /^som$/, replacement: kreftRuntimePath },
          ],
        },
        optimizeDeps: {
          exclude: ['kreft', 'som'],
        },
      };
    },

    configureServer(server) {
      // Serve runtime if requested directly as script
      server.middlewares.use((req, res, next) => {
        const url = req.url ? req.url.split('?')[0] : '';
        if (url === '/kreft.js' || url === '/kreft.min.js') {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.end(fs.readFileSync(kreftRuntimePath, 'utf8'));
          return;
        }
        next();
      });
    },

    resolveId(id) {
      if (id.includes('?kreft&type=style')) {
        return id;
      }
      return null;
    },

    load(id) {
      if (id.includes('?kreft&type=style')) {
        const [filePath, query] = id.split('?');
        if (!isComponentFile(filePath) || !filter(filePath)) return null;
        const params = new URLSearchParams(query);
        const index = parseInt(params.get('index') || '0', 10);
        const isScoped = params.get('scoped') === 'true';

        let content = '';
        try {
          content = fs.readFileSync(filePath, 'utf8');
        } catch (_) {
          return null;
        }

        const sp = splitKreft(content, filePath);
        const style = sp.styles[index];
        if (!style) return '';

        let css = style.css;
        if (isScoped || style.scoped) {
          const scopeId = 'data-s-' + hashString(filePath);
          css = scopeCss(css, scopeId);
        }
        return { code: css, map: null };
      }
      return null;
    },

    transform(code, id) {
      const [filePath, query] = id.split('?');
      if (!isComponentFile(filePath)) return null;
      if (query && query.includes('type=style')) return null;
      if (!filter(filePath)) return null;

      // 1. Route files: routes/web.kreft or any .kreft file without <view>
      if (!/<view(\s[^>]*)?>([\s\S]*)<\/view>/i.test(code)) {
        const baseName = path.basename(filePath);
        return {
          code: `import Kreft from 'kreft';

export function routes(Route) {
${code}
}

if (typeof window !== 'undefined' && window.Kreft && window.Kreft.__routes) {
  window.Kreft.__routes(${JSON.stringify(baseName)}, routes);
  window.Kreft.__routes(${JSON.stringify(filePath)}, routes);
}

if (import.meta.hot) {
  import.meta.hot.accept((newMod) => {
    if (newMod && newMod.default && typeof window !== 'undefined' && window.Kreft && window.Kreft.__routes) {
      window.Kreft.__routes(${JSON.stringify(baseName)}, newMod.default);
      window.Kreft.__routes(${JSON.stringify(filePath)}, newMod.default);
    }
  });
}

export default routes;
`,
          map: null,
        };
      }

      // 2. Component file
      const sp = splitKreft(code, filePath);
      fileCache.set(filePath, { code, sp });

      const hasScoped = sp.styles.some((s) => s.scoped);
      const scopeId = hasScoped ? 'data-s-' + hashString(filePath) : null;

      // Style imports (Vite will process each as virtual CSS module)
      const styleImports = sp.styles.map((s, idx) => {
        const queryStr = `?kreft&type=style&index=${idx}${s.scoped ? '&scoped=true' : ''}.css`;
        return `import ${JSON.stringify(filePath + queryStr)};`;
      }).join('\n');

      // Component script imports
      const topImports = [];
      const components = [];
      const values = [];

      for (const stmt of sp.imports) {
        const m = stmt.match(/^import\s+(?:([\s\S]+?)\s+from\s+)?(['"])(.+?)\2/);
        if (!m) continue;
        const [, what, , spec] = m;
        if (/^(?:kreft|som)(\.js)?$/.test(spec)) continue;
        if (/\.css(?:[?#].*)?$/i.test(spec)) {
          topImports.push(`import ${JSON.stringify(spec)};`);
          continue;
        }
        if (/\.(?:kreft|som)$/i.test(spec)) {
          topImports.push(`import ${what} from ${JSON.stringify(spec)};`);
          const names = extractImportedNames(what);
          names.forEach((name) => {
            components.push(`${JSON.stringify(name)}: ${name}`);
          });
          continue;
        }
        // .js / .ts / npm module
        topImports.push(stmt.endsWith(';') ? stmt : stmt + ';');
        const names = extractImportedNames(what);
        names.forEach((name) => {
          values.push(`${JSON.stringify(name)}: ${name}`);
        });
      }

      // Props mapping
      const props = Object.entries(sp.props).map(([p, expr]) => {
        if (expr == null) return `${JSON.stringify(p)}: {}`;
        return `${JSON.stringify(p)}: { default: function () { return (${expr}); } }`;
      });

      // Precompiled expressions (for fast runtime & CSP compliance)
      const fns = new Map();
      if (precompile) {
        collectExpressions(sp.template, fns);
      }
      const precompiledSrc = [...fns]
        .map(([key, fnSrc]) => `F[${JSON.stringify(key)}] = ${fnSrc};`)
        .join('\n');

      const runCode = 'with ($scope) {\n' + sp.code + '\n}';
      const baseName = path.basename(filePath);

      const output = `import Kreft from 'kreft';
${topImports.join('\n')}
${styleImports}

var F = (typeof window !== 'undefined' && window.Kreft && window.Kreft.__precompiled) || {};
${precompiledSrc}

var __run = function ($scope, $h) {
${runCode}
};

var __def = Kreft.__makeDef({
  name: ${JSON.stringify(sp.name)},
  template: ${JSON.stringify(sp.template)},
  props: { ${props.join(', ')} },
  events: ${JSON.stringify(sp.events)},
  layout: ${sp.layout !== undefined ? JSON.stringify(sp.layout) : 'undefined'},
  scopeId: ${scopeId ? JSON.stringify(scopeId) : 'null'},
  components: { ${components.join(', ')} },
  run: __run
}, { ${values.join(', ')} });

if (typeof window !== 'undefined' && window.Kreft && window.Kreft.__registerDef) {
  window.Kreft.__registerDef(${JSON.stringify(filePath)}, __def);
  window.Kreft.__registerDef(${JSON.stringify(baseName)}, __def);
  window.Kreft.__registerDef(${JSON.stringify(sp.name + '.kreft')}, __def);
}

if (import.meta.hot) {
  import.meta.hot.accept((newMod) => {
    if (newMod && newMod.default && typeof window !== 'undefined' && window.Kreft && window.Kreft.__hotDef) {
      window.Kreft.__hotDef(${JSON.stringify(filePath)}, newMod.default);
      window.Kreft.__hotDef(${JSON.stringify(baseName)}, newMod.default);
      window.Kreft.__hotDef(${JSON.stringify(sp.name + '.kreft')}, newMod.default);
    }
  });
}

export default __def;
`;

      return {
        code: output,
        map: null,
      };
    },

    handleHotUpdate(ctx) {
      if (!isComponentFile(ctx.file)) return;

      const cached = fileCache.get(ctx.file);
      if (!cached) return;

      try {
        const freshContent = fs.readFileSync(ctx.file, 'utf8');
        const freshSp = splitKreft(freshContent, ctx.file);

        // Check if only styles changed
        const onlyStyleChanged =
          cached.sp.template === freshSp.template &&
          cached.sp.code === freshSp.code &&
          JSON.stringify(cached.sp.props) === JSON.stringify(freshSp.props) &&
          JSON.stringify(cached.sp.imports) === JSON.stringify(freshSp.imports);

        fileCache.set(ctx.file, { code: freshContent, sp: freshSp });

        if (onlyStyleChanged) {
          // Invalidate and reload only the style modules
          const mods = [];
          for (const mod of ctx.modules) {
            if (mod.id && mod.id.includes('?kreft&type=style')) {
              ctx.server.moduleGraph.invalidateModule(mod);
              mods.push(mod);
            }
          }
          if (mods.length) return mods;
        }
      } catch (_) {
        // Fall back to standard HMR
      }
    },

    transformIndexHtml(html) {
      if (html.includes('__KREFT_VITE__')) return html;
      return html.replace(/<head[^>]*>/i, (m) => `${m}\n    <script>window.__KREFT_VITE__ = true;</script>`);
    },
  };
}

module.exports = kreftPlugin;
module.exports.default = kreftPlugin;
module.exports.kreft = kreftPlugin;
module.exports.som = kreftPlugin; // the Som.js names
module.exports.somPlugin = kreftPlugin;
module.exports.kreftPlugin = kreftPlugin;
