/*
 * The phone UI kit: edge components (top bar, bottom bar, sheets …), the native API and edge.css, copied into a project.
 *
 *   kreft mobile:ui              add the kit to this project (also done by kreft new --mobile and kreft mobile:init)
 *   kreft mobile:ui --layout     also use layouts/mobile.kreft for every page (a top bar and a bottom bar that never move)
 *   kreft mobile:ui --gallery    also add the /edge page that shows every component
 *
 * The files are copied, not linked: they are yours to change. Running it again only adds what is missing.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'templates', 'mobile');

function copy(from, to, overwrite) {
  if (fs.existsSync(to) && !overwrite) return false;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  return true;
}

function components() {
  return fs.readdirSync(path.join(SRC, 'edge')).filter((f) => /^Edge\w+\.kreft$/.test(f)).map((f) => f.replace(/\.kreft$/, '')).sort();
}

function patchIndex(front, { layout }) {
  const file = path.join(front, 'index.html');
  if (!fs.existsSync(file)) return false;
  let html = fs.readFileSync(file, 'utf8');
  const before = html;
  if (!html.includes('edge.css')) html = html.replace(/<\/head>/i, '  <link rel="stylesheet" href="edge.css">\n</head>');
  if (!html.includes('kreftjs-native.js')) html = html.replace(/(<script\b[^>]*\bsrc=["'][^"']*kreftjs\.js["'][^>]*><\/script>)/i, '$1\n  <script src="kreftjs-native.js"></script>');
  const add = components().filter((n) => !html.includes(`.component('${n}'`));
  if (add.length) {
    const m = html.match(/^([ \t]*)\.component\(/m) || html.match(/^([ \t]*)\.use\(router\)/m);
    if (m) html = html.replace(m[0], add.map((n) => `${m[1]}.component('${n}', 'components/edge/${n}.kreft')\n`).join('') + m[0]);
    else console.warn('  Could not find where components are listed in index.html. Register the files in components/edge/ yourself.');
  }
  if (layout) html = html.replace(/(layout:\s*)'(?!mobile')[^']*'(,\s*\/\/ every page goes inside )layouts\/app\.kreft/, "$1'mobile'$2layouts/mobile.kreft").replace(/(layout:\s*)'(?!mobile')[^']*'/, "$1'mobile'");
  if (html !== before) fs.writeFileSync(file, html);
  return html !== before;
}

function patchRoutes(front, { layout, gallery }) {
  const file = path.join(front, 'routes', 'web.kreft');
  if (!fs.existsSync(file)) return;
  let txt = fs.readFileSync(file, 'utf8');
  const before = txt;
  if (layout) txt = txt.replace(/(Route\.view\('\/(?:welcome)?', 'pages\/Home\.kreft'\))\.layout\('none'\)/g, "$1.layout('mobile')");
  if (gallery && !txt.includes('EdgeGallery')) txt = txt.replace(/\n(\/\/ Documentation)/, "\n// Every edge component, live (kreft mobile:ui --gallery)\nRoute.view('/edge', 'pages/EdgeGallery.kreft').name('edge').title('Components').layout('mobile')\n\n$1");
  if (gallery && !txt.includes('EdgeGallery')) txt += "\nRoute.view('/edge', 'pages/EdgeGallery.kreft').name('edge').title('Components')\n";
  if (txt !== before) fs.writeFileSync(file, txt);
}

// the bottom buttons of layouts/mobile.kreft: Home, then what this project has (at most 5 buttons)
function bottomItems(front) {
  const has = (f) => fs.existsSync(path.join(front, f));
  const items = [{ label: 'Home', icon: 'home', to: '/' }];
  if (has('pages/Dashboard.kreft')) items.push({ label: 'Dashboard', icon: 'grid', to: '/dashboard' });
  if (has('pages/Users.kreft')) items.push({ label: 'Users', icon: 'users', to: '/users' });
  if (has('pages/Profile.kreft')) items.push({ label: 'Profile', icon: 'user', to: '/profile' });
  if (has('docs/Docs.kreft') || fs.existsSync(path.join(front, '..', 'docs', 'Docs.kreft'))) items.push({ label: 'Docs', icon: 'book', to: '/docs' });
  return items.slice(0, 5).map((i) => `      { label: '${i.label}', icon: '${i.icon}', to: '${i.to}' },`).join('\n');
}

function install(target, opts = {}) {
  const front = require('./layout.js').layout(target).frontend;
  const added = [];
  for (const n of components()) if (copy(path.join(SRC, 'edge', n + '.kreft'), path.join(front, 'components', 'edge', n + '.kreft'))) added.push(n);
  copy(path.join(SRC, 'kreftjs-native.js'), path.join(front, 'kreftjs-native.js'));
  copy(path.join(SRC, 'edge.css'), path.join(front, 'edge.css'));
  if (opts.layout) {
    const to = path.join(front, 'layouts', 'mobile.kreft');
    if (copy(path.join(SRC, 'layouts', 'mobile.kreft'), to)) {
      const txt = fs.readFileSync(to, 'utf8');
      fs.writeFileSync(to, txt.replace(/( *\{ label: 'Home', icon: 'home', to: '\/' \},\n)( *\{ label: 'Docs', icon: 'book', to: '\/docs' \},)/, () => bottomItems(front)));
    }
  }
  if (opts.gallery) copy(path.join(SRC, 'pages', 'EdgeGallery.kreft'), path.join(front, 'pages', 'EdgeGallery.kreft'));
  patchIndex(front, opts);
  patchRoutes(front, opts);
  return { front, added };
}

function run(args = []) {
  const dir = args.find((a) => !a.startsWith('-'));
  const root = dir ? path.resolve(dir) : process.cwd();
  const lay = require('./layout.js').layout(root);
  if (!fs.existsSync(path.join(lay.frontend, 'index.html'))) {
    console.error(`\n  This folder is not a Kreft app (no index.html here):\n      ${root}\n`);
    process.exit(1);
  }
  const r = install(root, { layout: args.includes('--layout'), gallery: args.includes('--gallery') });
  console.log(`  Phone UI kit: ${r.added.length ? 'added ' + r.added.length + ' components to components/edge/' : 'already there'} (kreftjs-native.js, edge.css${args.includes('--layout') ? ', layouts/mobile.kreft' : ''}${args.includes('--gallery') ? ', pages/EdgeGallery.kreft' : ''}).`);
}

module.exports = { install, run, components };
