/*
 * PHP-style namespace loader and resolver for Kreft backend:
 *
 *   const { use, namespace } = require('kreft/server')
 *
 *   // 1. Single class import:
 *   const User = use('App\\Models\\User')
 *   const UserController = use('App\\Http\\Controllers\\Admin\\UserController')
 *
 *   // 2. Namespace grouping / multi-import:
 *   const { User, Post, Role } = namespace('App\\Models')
 *   const { DashboardController, UserController } = namespace('App\\Http\\Controllers\\Admin')
 *
 *   // 3. Or use() on a namespace returns the namespace proxy:
 *   const Models = use('App\\Models')
 *   const users = await Models.User.all()
 */
const fs = require('fs');
const path = require('path');
const app = require('./app.js');
const { findFile, EXTS } = require('./typescript.js');

const BAD_SEGMENTS = new Set(['.', '..', '__proto__', 'constructor', 'prototype']);

function getAppRoots(baseDir) {
  const roots = [];
  const appDir = app.baseDir();
  if (appDir) {
    if (path.basename(appDir) === 'app' && fs.existsSync(appDir)) roots.push(appDir);
    const inAppDir = path.join(appDir, 'app');
    if (fs.existsSync(inAppDir)) roots.push(inAppDir);
    const inBackendApp = path.join(appDir, 'backend', 'app');
    if (fs.existsSync(inBackendApp)) roots.push(inBackendApp);
  }
  const root = path.resolve(baseDir || process.cwd());
  try {
    const { layout } = require('../layout.js');
    const lay = layout(root);
    if (lay.backend) {
      const fromLay = path.join(lay.backend, 'app');
      if (fs.existsSync(fromLay)) roots.push(fromLay);
    }
  } catch (_) {}
  const backendApp = path.join(root, 'backend', 'app');
  if (fs.existsSync(backendApp)) roots.push(backendApp);
  const direct = path.join(root, 'app');
  if (fs.existsSync(direct)) roots.push(direct);

  const seen = new Set();
  const deduped = [];
  for (const r of roots) {
    let real = r;
    try { real = fs.realpathSync(r); } catch (_) {}
    if (!seen.has(real)) {
      seen.add(real);
      deduped.push(r);
    }
  }
  return deduped.length ? deduped : [direct];
}

function getAppRoot(baseDir) {
  return getAppRoots(baseDir)[0];
}

function isInsideApp(targetPath, appRoot) {
  const rootResolved = path.resolve(appRoot);
  const targetResolved = path.resolve(targetPath);
  if (targetResolved === rootResolved || targetResolved.startsWith(rootResolved + path.sep)) return true;
  try {
    const realRoot = fs.realpathSync(rootResolved);
    const realTarget = fs.realpathSync(targetResolved);
    return realTarget === realRoot || realTarget.startsWith(realRoot + path.sep);
  } catch (_) {
    return false;
  }
}

function resolveCandidatePaths(target, baseDir) {
  if (typeof target !== 'string' || target.includes('\0')) return [];
  let clean = target.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  clean = clean.replace(/^App\//i, '');
  const segments = clean.split('/').filter(Boolean);
  if (segments.some((s) => BAD_SEGMENTS.has(s))) return [];

  const roots = getAppRoots(baseDir);
  const candidates = [];
  for (const appRoot of roots) {
    const full = path.resolve(appRoot, ...segments);
    if (isInsideApp(full, appRoot)) {
      candidates.push({ full, appRoot });
    }
  }
  return candidates;
}

function resolvePath(target, baseDir) {
  const candidates = resolveCandidatePaths(target, baseDir);
  return candidates.length ? candidates[0].full : null;
}

function use(target) {
  if (!target || typeof target !== 'string') {
    throw new Error('use() requires a namespace string, e.g. use("App\\\\Models\\\\User")');
  }
  const base = app.baseDir() || process.cwd();
  const candidates = resolveCandidatePaths(target, base);

  // 1. Check if it's already indexed in app classes
  const found = app.find(target);
  if (found) return found;

  // 2. Check direct file path in candidate app roots
  for (const { full, appRoot } of candidates) {
    const file = findFile(full);
    if (file && isInsideApp(file, appRoot)) {
      return app.unwrap(require(file));
    }
    // 3. If it's a directory, return a namespace proxy
    if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
      return namespace(target);
    }
  }

  // 4. Try resolving with parent directory and class name
  const parts = target.replace(/\\/g, '/').split('/');
  const className = parts.pop();
  const parent = parts.join('/');
  if (parent && className && !BAD_SEGMENTS.has(className)) {
    const parentCandidates = resolveCandidatePaths(parent, base);
    for (const { full: parentPath, appRoot } of parentCandidates) {
      const candidate = findFile(path.join(parentPath, className));
      if (candidate && isInsideApp(candidate, appRoot)) return app.unwrap(require(candidate));
    }
  }

  throw new Error(`Cannot resolve namespace "${target}". File or class not found in app/.`);
}

function namespace(nsPrefix) {
  const base = app.baseDir() || process.cwd();
  const candidates = resolveCandidatePaths(nsPrefix, base);
  if (!candidates.length) throw new Error(`Invalid namespace "${nsPrefix}".`);

  return new Proxy({}, {
    get(target, prop) {
      if (typeof prop === 'symbol') return target[prop];
      if (prop === 'then' || prop === 'inspect' || BAD_SEGMENTS.has(String(prop)) || String(prop).includes('/') || String(prop).includes('\\') || String(prop).includes('\0')) return target[prop];
      if (Object.prototype.hasOwnProperty.call(target, prop)) return target[prop];

      // Try file in each candidate directory
      for (const { full: dirPath, appRoot } of candidates) {
        const candidateFile = findFile(path.join(dirPath, prop));
        if (candidateFile && isInsideApp(candidateFile, appRoot)) {
          const mod = app.unwrap(require(candidateFile));
          target[prop] = mod;
          return mod;
        }
      }

      // Try subdirectory as a sub-namespace
      for (const { full: dirPath, appRoot } of candidates) {
        const subDir = path.join(dirPath, prop);
        if (isInsideApp(subDir, appRoot) && fs.existsSync(subDir) && fs.statSync(subDir).isDirectory()) {
          const nestedNs = `${String(nsPrefix).replace(/\\/g, '/')}/${prop}`;
          const sub = namespace(nestedNs);
          target[prop] = sub;
          return sub;
        }
      }

      // Try app.find
      const lookup = `${String(nsPrefix).replace(/\//g, '\\')}\\${prop}`;
      const found = app.find(lookup) || app.find(prop);
      if (found) {
        target[prop] = found;
        return found;
      }

      return undefined;
    },
    has(target, prop) {
      if (prop in target) return true;
      for (const { full: dirPath } of candidates) {
        const candidateFile = findFile(path.join(dirPath, prop));
        if (candidateFile) return true;
      }
      return false;
    },
    ownKeys() {
      const keys = new Set();
      for (const { full: dirPath } of candidates) {
        if (!fs.existsSync(dirPath)) continue;
        for (const e of fs.readdirSync(dirPath, { withFileTypes: true })) {
          if (e.isDirectory()) {
            keys.add(e.name);
            continue;
          }
          const ext = path.extname(e.name);
          if (EXTS.includes(ext) && !e.name.endsWith('.d.ts')) {
            keys.add(path.basename(e.name, ext));
          }
        }
      }
      return Array.from(keys);
    },
    getOwnPropertyDescriptor(target, prop) {
      return { enumerable: true, configurable: true, writable: false };
    },
  });
}

module.exports = { use, namespace };
