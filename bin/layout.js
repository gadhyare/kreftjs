/*
 * Where a project's parts are.
 *
 * New projects (som new) keep frontend and backend apart:
 *   frontend/   the only folder a browser can reach: index.html, pages, components, routes/web.som …
 *   backend/    never served: routes/api.js, app/, database/ (and server/)
 *   .env, package.json, node_modules/   at the top, next to both
 *
 * Older projects have everything in one folder; that still works.
 */
const fs = require('fs');
const path = require('path');

const isFile = (f) => { try { return fs.statSync(f).isFile(); } catch (_) { return false; } };
const isDir = (f) => { try { return fs.statSync(f).isDirectory(); } catch (_) { return false; } };

function projectDir(start) {
  const here = path.resolve(start);
  if (isFile(path.join(here, 'frontend', 'index.html')) || (isDir(path.join(here, 'frontend')) && isDir(path.join(here, 'backend')))) {
    return here;
  }
  for (let dir = here; ; dir = path.dirname(dir)) {
    if (isFile(path.join(dir, 'package.json'))) return dir;
    if (dir === path.dirname(dir)) return here;
  }
}

// layout('.') → { project, split, frontend, backend, public, source, import, export, config }
function layout(start = '.') {
  const here = path.resolve(start);
  // started inside frontend/, backend/, source/, public/ etc.: the project is the folder above
  const up = path.dirname(here);
  const knownFront = ['frontend', 'source', 'Source', 'src', 'public', 'Public'];
  const knownBack = ['backend', 'app', 'server'];
  const isSub = [...knownFront, ...knownBack].includes(path.basename(here));
  const hasParentFront = knownFront.some((d) => isFile(path.join(up, d, 'index.html')));
  const base = isSub && (hasParentFront || isFile(path.join(up, 'index.html'))) ? up : here;
  const project = projectDir(base);

  // find frontend directory: frontend, source, Source, src, public, Public
  const frontFound = knownFront.find((d) => isFile(path.join(project, d, 'index.html')));
  const frontend = frontFound ? path.join(project, frontFound) : path.join(project, 'frontend');

  // find backend directory: backend, app, server
  const backFound = knownBack.find((d) => isDir(path.join(project, d)));
  const backend = backFound ? path.join(project, backFound) : path.join(project, 'backend');

  // find optional auxiliary directories: public, source, import, export, config
  const findAux = (names) => {
    const n = names.find((name) => isDir(path.join(project, name)));
    return n ? path.join(project, n) : null;
  };

  const publicDir = findAux(['public', 'Public']);
  const sourceDir = findAux(['source', 'Source', 'src']);
  const importDir = findAux(['import', 'Import', 'imports', 'Imports']);
  const exportDir = findAux(['export', 'Export', 'exports', 'Exports']);
  const configDir = findAux(['config', 'Config']);

  const split = Boolean(frontFound) || isFile(path.join(frontend, 'index.html'));
  return {
    project,
    split,
    frontend: split ? frontend : here,
    backend: split && isDir(backend) ? backend : project,
    public: publicDir,
    source: sourceDir,
    import: importDir,
    export: exportDir,
    config: configDir,
  };
}

module.exports = { layout, projectDir };
