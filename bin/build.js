/*
 * som build — turns a Som.js app into production files.
 *
 *   som build                  build this folder into ./dist
 *   som build ./site           build another folder
 *   som build --out public     choose the output folder
 *   som build --base /         change <base href> in index.html
 *   som build --prerender      also save every page as ready HTML (needs: npm i -D jsdom)
 *   som build --include docs   also copy another folder into the output
 *
 * What it does:
 *   1. Compiles every .som file ahead of time into app.js (no .som files are downloaded in production).
 *   2. Turns every expression in the views into a real function, so the app runs without
 *      eval / new Function — it works under a strict Content-Security-Policy.
 *   3. Collects all <style> blocks (scoped ones already scoped) into app.css.
 *   4. Moves inline <script> code from index.html into main.js.
 *   5. Copies som.js and every other file (images, fonts, .js) next to them.
 *
 * No dependencies — only Node.js.
 */
const fs = require('fs');
const path = require('path');
const Som = require('../som.js');

const { expandBlocks, splitSom, splitInterp, exactBrace, stripBrace, interpToExpr, quoteBraceAttrs, expandSelfClosing,
  scopeCss, hashString, propType, simplePathRE, fnExpRE, forAliasRE } = Som.__internal;

const deps = require('./deps.js');
const SERVER_DIRS = new Set();
const SKIP = new Set(['node_modules', '.git', '.vscode', '.idea', 'package.json', 'package-lock.json', '.DS_Store']);

module.exports = function build(args) {
  let folder = null, out = null, base = null, prerender = null;
  const include = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out' || args[i] === '-o') out = args[++i];
    else if (args[i] === '--base') base = args[++i];
    else if (args[i] === '--include') include.push(args[++i]); // another folder to copy in, like the docs
    else if (args[i] === '--prerender') prerender = args[i + 1] && !args[i + 1].startsWith('-') && args[i + 1].includes('/') ? args[++i].split(',') : [];
    else folder = args[i];
  }
  // a project with frontend/ and backend/: build frontend/ into dist/ at the top (backend/ is never built)
  const lay = require('./layout.js').layout(folder || '.');
  const root = folder ? path.resolve(folder) : lay.frontend;
  const dist = out ? path.resolve(out) : path.join(lay.split && !folder ? lay.project : root, 'dist'); // --out is read from where you run the command
  const started = Date.now();

  if (!fs.existsSync(path.join(root, 'index.html'))) fail(`No index.html in ${root}`);
  if (dist === root) fail('The output folder must be different from the app folder.');
  const project = deps.projectDir(root);
  const env = require('./env.js');
  env.loadEnv(project); // PUBLIC_ values from .env go into app.js, as Som.env
  // server code never goes into the built site: server/, backend app/ and routes/
  if (!lay.split) for (const dir of [root, project]) ['server', 'app', 'routes'].forEach((d) => SERVER_DIRS.add(path.join(dir, d)));
  SERVER_DIRS.add(lay.backend === lay.project ? path.join(project, 'server') : lay.backend);
  const bare = new Set(), cssLinks = [];    // npm packages used by the .som files, and imported CSS files

  // ---- 1. find and compile every .som file
  const somFiles = walk(root, dist).filter((f) => f.endsWith('.som'));
  const fns = new Map();             // precompiled expression functions: key → source
  const components = [];
  let css = '';
  const errors = [];

  addRouterTemplates(fns);           // the router's own <som-link> and <som-view> templates

  // .som files in --include folders too: they land in the output as <folder>/…, so that is their path there
  const jobs = somFiles.map((file) => [file, toUrlPath(path.relative(root, file)), root]);
  for (const dir of include) {
    const from = path.resolve(dir);
    if (!fs.existsSync(from)) fail(`--include: ${dir} does not exist.`);
    for (const file of walk(from, null).filter((f) => f.endsWith('.som'))) {
      jobs.push([file, toUrlPath(path.join(path.basename(from), path.relative(from, file))), path.dirname(from)]);
    }
  }
  const { createProgressBar, renderBox, bold, cyan, green, dim } = require('./terminal.js');
  console.log(`\n  ${bold('Som.js Build')} ${dim('— ' + (path.relative(process.cwd(), root) || '.') + ' → ' + (path.relative(process.cwd(), dist) || 'dist'))}\n`);
  const templateBar = createProgressBar(jobs.length, { label: 'Compiling templates' });
  for (const [file, rel, base] of jobs) {
    templateBar.tick(rel);
    // routes/web.som and other route files: plain JavaScript with Route in scope, kept as a function
    if (/^routes\//.test(rel)) {
      const src = fs.readFileSync(file, 'utf8');
      try { new Function('Route', src); } catch (e) { errors.push(`  ${rel}: ${e.message}`); continue; }
      components.push(`// ${rel}\nSom.__routes(${JSON.stringify(rel)}, function (Route) {\n${src}\n});`);
      continue;
    }
    try {
      const out = compileFile(file, rel, base);
      out.bare.forEach((b) => bare.add(b));
      out.cssImports.forEach((c) => { if (!cssLinks.some((x) => x.spec === c.spec)) cssLinks.push(c); });
      components.push(out.code);
      css += out.css;
      collectExpressions(out.template, fns);
    } catch (e) {
      errors.push(`  ${rel}: ${e.message}`);
    }
  }
  templateBar.complete(`Compiled ${jobs.length} template${jobs.length === 1 ? '' : 's'}`);
  if (errors.length) fail('Could not build:\n' + errors.join('\n'));

  // ---- 2. write the output folder
  fs.rmSync(dist, { recursive: true, force: true });
  fs.mkdirSync(dist, { recursive: true });

  const precompiled = [...fns].map(([key, src]) => `F[${JSON.stringify(key)}] = ${src};`).join('\n');
  const appJs = `/* Built by som build — do not edit. Rebuild from your .som files instead. */
${env.envScript(env.publicEnv())}
(function (Som) {
  if (!Som) throw new Error('Load som.js before app.js');
  var F = Som.__precompiled;
${indent(precompiled)}

${indent(components.join('\n\n'))}
})(window.Som);
`;
  // app.js uses `with`, so it must stay a classic (non-module, non-strict) script — check it parses
  try { new Function(appJs); } catch (e) { fail('Internal error: app.js does not parse: ' + e.message); }
  write(dist, 'app.js', appJs);
  // the ready-made s-animate styles (fade, slide, scale, pop), first so your own CSS wins
  write(dist, 'app.css', '/* Som.js s-animate presets */\n' + Som.__presetCss + '\n\n' + css.trim() + '\n');

  // copy everything else (images, fonts, plain .js files…)
  for (const file of walk(root, dist)) {
    const rel = path.relative(root, file);
    if (file.endsWith('.som') || file.endsWith('.d.ts') || rel === 'index.html') continue;
    fs.mkdirSync(path.dirname(path.join(dist, rel)), { recursive: true });
    if (/\.ts$/i.test(file)) { // a TypeScript module: its JavaScript, as name.js
      write(path.dirname(path.join(dist, rel)), path.basename(rel).replace(/\.ts$/i, '.js'), tsToJs(file, project));
      continue;
    }
    fs.copyFileSync(file, path.join(dist, rel));
  }
  if (lay.public && lay.public !== root && lay.public !== dist && fs.existsSync(lay.public)) {
    for (const file of walk(lay.public, dist)) {
      const rel = path.relative(lay.public, file);
      if (file.endsWith('.som') || file.endsWith('.d.ts') || rel === 'index.html') continue;
      const to = path.join(dist, rel);
      if (!fs.existsSync(to)) {
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(file, to);
      }
    }
  }
  fs.copyFileSync(path.join(__dirname, '..', 'som.js'), path.join(dist, 'som.js'));
  for (const dir of include) {
    const from = path.resolve(dir);
    if (!fs.existsSync(from)) fail(`--include: ${dir} does not exist.`);
    for (const file of walk(from, null)) {
      if (file.endsWith('.som')) continue; // compiled into app.js above
      const to = path.join(dist, path.basename(from), path.relative(from, file));
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(file, to);
    }
  }

  // ---- 3. index.html: som.js + app.js + app.css, inline scripts moved to main.js
  let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  // an included folder that sits next to the app ('../docs/Docs.som') is inside the output: 'docs/Docs.som'
  for (const dir of include) {
    const up = toUrlPath(path.relative(root, path.resolve(dir)));
    if (up.startsWith('../')) html = html.split(`'${up}/`).join(`'${path.basename(up)}/`).split(`"${up}/`).join(`"${path.basename(up)}/`);
  }
  let mainJs = '';
  let sawSom = false, placedMain = false;
  html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (tag, attrs, body) => {
    const src = (attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (src && /(^|\/)som(\.min)?\.js$/i.test(src)) {
      sawSom = true;
      return '<script src="som.js"></script>\n  <script src="app.js"></script>';
    }
    if (!src && body.trim() && !/type\s*=\s*["'](?!text\/javascript|module)/i.test(attrs)) {
      if (/type\s*=\s*["']module["']/i.test(attrs)) return tag; // leave modules as they are
      mainJs += body.replace(/^\n+|\s+$/g, '') + '\n\n';
      if (placedMain) return ''; // every inline script goes into one main.js, loaded where the first one was
      placedMain = true;
      return '<script src="main.js"></script>';
    }
    return tag;
  });
  html = html.replace(/(<script\b[^>]*\bsrc=["'][^"']+?)\.ts(["'])/gi, '$1.js$2');
  if (!sawSom) fail('index.html has no <script src="…som.js">. Add one so the build knows where to load Som.js.');
  if (mainJs) write(dist, 'main.js', mainJs);
  // ---- 4. npm packages: each one bundled into deps/, found through an import map; imported CSS as <link>s
  const map = {};
  for (const spec of [...bare].sort()) {
    let code;
    try { code = deps.bundleSync(project, spec, { minify: true }); }
    catch (e) { fail(e.message); }
    fs.mkdirSync(path.join(dist, 'deps'), { recursive: true });
    write(path.join(dist, 'deps'), deps.safeName(spec), code);
    map[spec] = './deps/' + deps.safeName(spec);
  }
  const links = cssLinks.map(({ spec, local }) => {
    if (local) return spec;
    const file = deps.packageFile(project, spec);
    if (!file) fail(`The CSS file "${spec}" was not found in node_modules. Run:  som add ${(spec.match(deps.NAME) || [spec])[0]}`);
    const info = deps.packageJson(project, spec);
    copyCss(file, info.dir, path.join(dist, 'vendor', info.name));
    return toUrlPath(path.join('vendor', info.name, path.relative(info.dir, file)));
  });
  if (Object.keys(map).length) {
    const own = html.match(/<script\s+type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/i);
    if (own) {
      let mine = {};
      try { mine = JSON.parse(own[1]); } catch (_) { fail('The import map in index.html is not valid JSON.'); }
      html = html.replace(own[0], () => `<script type="importmap">${JSON.stringify({ ...mine, imports: { ...map, ...(mine.imports || {}) } })}</script>`);
    } else html = html.replace(/<head[^>]*>/i, (m) => `${m}\n  <script type="importmap">${JSON.stringify({ imports: map })}</script>`);
  }
  html = html.replace(/<\/head>/i, () => links.map((l) => `  <link rel="stylesheet" href="${l}">\n`).join('') + '  <link rel="stylesheet" href="app.css" data-som-presets>\n</head>');
  if (base != null) {
    const b = base.endsWith('/') ? base : base + '/';
    html = /<base\b[^>]*>/i.test(html)
      ? html.replace(/<base\b[^>]*>/i, `<base href="${b}">`)
      : html.replace(/<head>/i, `<head>\n  <base href="${b}">`);
  }
  write(dist, 'index.html', html);

  const report = () => {
    const files = walk(dist, null).map((f) => [path.relative(dist, f), fs.statSync(f).size]);
    const kb = (n) => (n / 1024).toFixed(1).padStart(7) + ' kB';
    const lines = [
      `  ${bold('Build Complete')}  ${green('✔')}  ${dim(jobs.length + ' template' + (jobs.length === 1 ? '' : 's') + ' in ' + (Date.now() - started) + 'ms')}`,
      '---',
      ...files.sort().map(([f, n]) => `  ${cyan(kb(n))}  ${toUrlPath(f)}`),
      '---',
      `  ${bold('Output:')}  ${dist}`,
      `  ${bold('Preview:')} som dev ${path.relative(process.cwd(), dist) || '.'}`,
    ];
    console.log('\n' + renderBox(lines, { width: 66, borderColor: green }) + '\n');
  };
  if (prerender) return require('./prerender.js')(dist, root, prerender).then(report, (e) => fail('Could not prerender: ' + e.message));
  report();
};

// a frontend .ts file → the browser's JavaScript (types removed); its own './x.ts' imports become './x.js'
function tsToJs(file, project) {
  const es = require('./backend/typescript.js').loadEsbuild(project);
  if (!es) fail(`${path.basename(file)} is TypeScript: install esbuild once in your project:  som add -D esbuild`);
  const out = es.transformSync(fs.readFileSync(file, 'utf8'), { loader: 'ts', format: 'esm', target: 'es2020', sourcefile: file, minify: false });
  return out.code.replace(/((?:from|import)\s*\(?\s*['"])(\.{1,2}\/[^'"]+?)\.ts(['"])/g, '$1$2.js$3');
}

/* ------------------------------------------------------------------ one .som file → JS */
function compileFile(file, rel, root) {
  const sp = splitSom(fs.readFileSync(file, 'utf8'), rel);
  const name = sp.name;

  // the script must parse; report the .som line if it doesn't
  const run = `function ($scope, $h) { with ($scope) {\n${sp.code}\n} }`;
  try { new Function('return ' + run); } catch (e) { throw new Error(`script error: ${e.message}`); }

  // props: keep the default as a function so every instance gets its own copy
  const props = Object.entries(sp.props).map(([p, expr]) => {
    if (expr == null) return `${JSON.stringify(p)}: {}`;
    let sample;
    try { sample = new Function(`return (${expr})`)(); } catch (_) { /* uses something only known at runtime */ }
    if (typeof sample === 'function') return `${JSON.stringify(p)}: { type: Function, default: (${expr}) }`;
    const type = propType(sample);
    return `${JSON.stringify(p)}: { ${type ? `type: ${type.name}, ` : ''}default: function () { return (${expr}); } }`;
  });

  // imports: other .som files become component references; .js modules load with import()
  const comps = [], values = [], bare = [], cssImports = [];
  for (const stmt of sp.imports) {
    const m = stmt.match(/^import\s+(?:([\s\S]+?)\s+from\s+)?(['"])(.+?)\2/);
    if (!m) throw new Error(`can't read import: ${stmt}`);
    const [, what, , spec] = m;
    if (/^som(\.js)?$/.test(spec)) continue;
    let target = /^\.{1,2}\//.test(spec) ? toUrlPath(path.relative(root, path.resolve(path.dirname(file), spec))) : spec;
    if (/^\.{1,2}\//.test(spec) && /\.ts$/i.test(spec)) target = target.replace(/\.ts$/i, '.js'); // TypeScript files are built into .js
    if (/\.som$/i.test(spec)) {
      if (what && /^[A-Za-z_$][\w$]*$/.test(what.trim())) comps.push(`${JSON.stringify(what.trim())}: ${JSON.stringify(target)}`);
      continue;
    }
    const local = /^\.{1,2}\//.test(spec);
    if (/\.css(?:[?#].*)?$/i.test(spec)) { cssImports.push({ spec: local ? target : spec, local }); continue; } // becomes a <link> in index.html
    if (deps.isBare(spec)) bare.push(spec);
    values.push({ what, target, local });
  }

  // styles: scoped ones get this component's attribute
  let scopeId = null, css = '';
  for (const st of sp.styles) {
    let text = st.css;
    if (st.scoped) {
      scopeId = scopeId || 'data-s-' + hashString(rel);
      text = scopeCss(text, scopeId);
    }
    css += `/* ${rel} */\n${text.trim()}\n\n`;
  }

  const parts = [
    `name: ${JSON.stringify(name)}`,
    `template: ${JSON.stringify(sp.template)}`,
    `props: { ${props.join(', ')} }`,
    sp.events.length ? `events: ${JSON.stringify(sp.events)}` : null,
    sp.layout !== undefined ? `layout: ${JSON.stringify(sp.layout)}` : null,
    scopeId ? `scopeId: ${JSON.stringify(scopeId)}` : null,
    `components: { ${comps.join(', ')} }`,
    values.length ? `loadValues: ${loadValuesSource(values)}` : null,
    `run: ${run}`,
  ].filter(Boolean);

  return {
    code: `// ${rel}\nSom.__define(${JSON.stringify(rel)}, {\n  ${parts.join(',\n  ').replace(/\n/g, '\n  ')}\n});`,
    css,
    template: sp.template,
    bare,
    cssImports,
  };
}

// `import { a, b as c } from './x.js'` → loaded with import() when the component is first used
function loadValuesSource(values) {
  const lines = values.map(({ what, target, local }, i) => {
    // files in the app resolve from <base href>, like .som paths; URLs and package names stay as written
    const url = local ? `new URL(${JSON.stringify(target)}, document.baseURI).href` : JSON.stringify(target);
    const picks = [];
    if (what) what.split(/,(?![^{]*\})/).map((s) => s.trim()).forEach((part) => {
      if (part.startsWith('* as ')) picks.push(`v[${JSON.stringify(part.slice(5).trim())}] = m${i};`);
      else if (part[0] === '{') part.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean).forEach((p) => {
        const [from, to] = p.split(/\s+as\s+/);
        picks.push(`v[${JSON.stringify((to || from).trim())}] = m${i}[${JSON.stringify(from.trim())}];`);
      });
      else picks.push(`v[${JSON.stringify(part)}] = m${i}.default;`);
    });
    return `return Som.__import(${url}).then(function (m${i}) { ${picks.join(' ')} })`;
  });
  return `function () { var v = {}; return Promise.resolve()${lines.map((l) => `.then(function () { ${l}; })`).join('')}.then(function () { return v; }); }`;
}

/* ------------------------------------------------------------------ expressions → functions
 * The browser runtime turns each expression into code with exactly these shapes. Building the same
 * text here and keying it the same way means the runtime finds a ready function instead of calling eval. */
const EVAL = (expr) => ['$s', `with($s){return(${expr})}`];
const STMT = (expr) => ['$s,$event,$args', `with($s){${expr}}`];
const ASSIGN = (expr) => ['$s,$v', `with($s){${expr}=$v}`];

function addFn(fns, [params, code]) {
  const key = params + '\u0000' + code;
  if (fns.has(key)) return;
  const src = `function (${params.split(',').join(', ')}) { ${code} }`;
  try { new Function('return ' + src); } catch (_) { return; } // invalid code: the runtime will report it as usual
  fns.set(key, src);
}
function addHandler(fns, expr) {
  if (!expr || !expr.trim()) return;
  if (simplePathRE.test(expr.trim()) || fnExpRE.test(expr)) addFn(fns, EVAL(expr));
  else addFn(fns, STMT(expr));
}
function addEval(fns, expr) { if (expr != null && expr !== '') addFn(fns, EVAL(expr)); }

function addRouterTemplates(fns) {
  ['href', 'classes'].forEach((e) => addEval(fns, e));
  addHandler(fns, 'navigate($event)');
}

const STRUCTURAL = new Set(['if', 'elif', 'else', 'each', 'key', 'ref', 'skip', 'cloak', 'slot', 'empty', 'once', 'animate', 'waiting', 'failed']);

function collectExpressions(template, fns) {
  const html = quoteBraceAttrs(expandBlocks(expandSelfClosing(template)));
  scanHtml(html, {
    attr(name, value) {
      if (name[0] === ':' || name === 's-bind' || name.startsWith('s-bind:')) return addEval(fns, value);
      if (name[0] === '@' || name.startsWith('s-on:')) return addHandler(fns, stripBrace(value));
      if (name.startsWith('s-')) {
        const v = stripBrace(value);
        const dir = name.slice(2).split('.')[0].split(':')[0];
        if (dir === 'if' || dir === 'elif' || dir === 'key') return addEval(fns, v);
        if (dir === 'each') {
          const m = v.match(forAliasRE);
          if (m) addEval(fns, m[3].trim());
          return;
        }
        if (dir === 'model') { addEval(fns, v); addFn(fns, ASSIGN(v)); return; }
        if (!STRUCTURAL.has(dir) && v) addEval(fns, v); // s-show, s-text, s-html, your own directives
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

/* ------------------------------------------------------------------ a small HTML scanner
 * Reports every attribute and every text node the way the browser's parser would see them. */
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', times: '×',
  middot: '·', hellip: '…', mdash: '—', ndash: '–', larr: '←', rarr: '→', uarr: '↑', darr: '↓', laquo: '«', raquo: '»', bull: '•' };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
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
      const tag = html.slice(i + 1, j).toLowerCase();
      // attributes
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
        if (name) on.attr(name, decode(value), tag);
        j = Math.max(k, j + 1);
      }
      i = j + 1;
      if (tag === 'script' || tag === 'style') { // raw text: not compiled by Som
        const e = html.toLowerCase().indexOf(`</${tag}`, i);
        i = e < 0 ? html.length : e;
      } else if (tag === 'pre' || tag === 'textarea' || tag === 'listing') {
        dropNewline = true;
      }
      continue;
    }
    text += html[i++];
  }
  flush();
}

/* ------------------------------------------------------------------ helpers */
// a CSS file from a package, with the fonts and images it points to (url(...) and @import), and nothing else
function copyCss(file, pkgDir, toDir, seen = new Set()) {
  if (seen.has(file)) return;
  seen.add(file);
  const target = path.join(toDir, path.relative(pkgDir, file));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(file, target);
  if (!/\.css$/i.test(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  const refs = [...text.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)|@import\s+(['"])([^'"]+)\3/g)].map((m) => m[2] || m[4]);
  for (const ref of refs) {
    if (/^(data:|https?:|\/\/|#)/i.test(ref)) continue;
    const dep = path.resolve(path.dirname(file), ref.replace(/[?#].*$/, ''));
    if (!dep.startsWith(pkgDir + path.sep)) continue; // only files inside the package
    try { if (fs.statSync(dep).isFile()) copyCss(dep, pkgDir, toDir, seen); } catch (_) { /* a missing font: the browser will say so */ }
  }
}

function walk(dir, exclude) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    if (entry.name === 'storage' && (entry.isSymbolicLink() || entry.isDirectory())) continue;
    // the database, its settings and its migrations stay on the server, never in the built site
    if (/\.(db|sqlite3?)(-wal|-shm)?$/i.test(entry.name) || entry.name === 'som.config.json' || (entry.isDirectory() && entry.name === 'database')) continue;
    const full = path.join(dir, entry.name);
    if (exclude && full === exclude) continue;
    if (SERVER_DIRS.has(full)) continue; // server/ code runs on the server only
    if (/^\.env(\..*)?$/.test(entry.name)) continue; // secrets stay on the server
    if (entry.isSymbolicLink()) {
      try { if (fs.statSync(full).isDirectory()) continue; } catch (_) { continue; }
    }
    if (entry.isDirectory()) out.push(...walk(full, exclude));
    else out.push(full);
  }
  return out;
}
const toUrlPath = (p) => p.split(path.sep).join('/');
const indent = (s) => s.split('\n').map((l) => (l ? '  ' + l : l)).join('\n');
function write(dir, name, content) { fs.writeFileSync(path.join(dir, name), content); }
function fail(msg) {
  console.error('\n  ' + msg + '\n');
  process.exit(1);
}
