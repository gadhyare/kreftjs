/*
 * PHP-style namespace loader and resolver for Som.js backend:
 *
 *   const { use, namespace } = require('somjs/server')
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

function resolvePath(target, baseDir) {
  let clean = String(target || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  clean = clean.replace(/^App\//i, '');
  return path.join(baseDir, 'app', clean);
}

function use(target) {
  if (!target || typeof target !== 'string') {
    throw new Error('use() requires a namespace string, e.g. use("App\\\\Models\\\\User")');
  }
  const base = app.baseDir() || process.cwd();

  // 1. Check if it's already indexed in app classes
  const found = app.find(target);
  if (found) return found;

  // 2. Check direct file path in app/
  const fullPath = resolvePath(target, base);
  const file = findFile(fullPath);
  if (file) {
    return app.unwrap(require(file));
  }

  // 3. If it's a directory, return a namespace proxy
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
    return namespace(target);
  }

  // 4. Try resolving with parent directory and class name
  const parts = target.replace(/\\/g, '/').split('/');
  const className = parts.pop();
  const parent = parts.join('/');
  if (parent) {
    const parentPath = resolvePath(parent, base);
    const candidate = findFile(path.join(parentPath, className));
    if (candidate) return app.unwrap(require(candidate));
  }

  throw new Error(`Cannot resolve namespace "${target}". File or class not found in app/.`);
}

function namespace(nsPrefix) {
  const base = app.baseDir() || process.cwd();
  const dirPath = resolvePath(nsPrefix, base);

  return new Proxy({}, {
    get(target, prop) {
      if (typeof prop === 'symbol') return target[prop];
      if (prop === 'then' || prop === 'inspect' || prop === 'prototype' || prop === 'constructor') return target[prop];
      if (prop in target) return target[prop];

      // Try file in this directory
      const candidateFile = findFile(path.join(dirPath, prop));
      if (candidateFile) {
        const mod = app.unwrap(require(candidateFile));
        target[prop] = mod;
        return mod;
      }

      // Try subdirectory as a sub-namespace
      const subDir = path.join(dirPath, prop);
      if (fs.existsSync(subDir) && fs.statSync(subDir).isDirectory()) {
        const nestedNs = `${String(nsPrefix).replace(/\\/g, '/')}/${prop}`;
        const sub = namespace(nestedNs);
        target[prop] = sub;
        return sub;
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
      const candidateFile = findFile(path.join(dirPath, prop));
      return Boolean(candidateFile);
    },
    ownKeys() {
      if (!fs.existsSync(dirPath)) return [];
      const keys = [];
      for (const e of fs.readdirSync(dirPath, { withFileTypes: true })) {
        if (e.isDirectory()) {
          keys.push(e.name);
          continue;
        }
        const ext = path.extname(e.name);
        if (EXTS.includes(ext) && !e.name.endsWith('.d.ts')) {
          keys.push(path.basename(e.name, ext));
        }
      }
      return keys;
    },
    getOwnPropertyDescriptor(target, prop) {
      return { enumerable: true, configurable: true, writable: false };
    },
  });
}

module.exports = { use, namespace };
