/*
 * kreft.config.json: { "db": "sqlite:database/app.db", "tables": { "posts": true, "users": { "write": false, "hidden": ["password"] } } }
 * Looked for in the folder being served, then its parents (so `kreft serve dist` finds the project's file).
 * "${NAME}" in a value is replaced with that value from .env or the environment.
 */
const fs = require('fs');
const path = require('path');

function readConfig(start) {
  for (let dir = path.resolve(start); ; dir = path.dirname(dir)) {
    const candidates = [
      path.join(dir, 'kreft.config.json'),
      path.join(dir, 'config', 'kreft.config.json'),
      path.join(dir, 'config', 'kreft.json'),
      path.join(dir, 'Config', 'kreft.config.json'),
      path.join(dir, 'Config', 'kreft.json'),
      // Som.js names
      path.join(dir, 'som.config.json'),
      path.join(dir, 'config', 'som.config.json'),
      path.join(dir, 'config', 'som.json'),
      path.join(dir, 'Config', 'som.config.json'),
      path.join(dir, 'Config', 'som.json'),
    ];
    for (const file of candidates) {
      if (fs.existsSync(file)) {
        // "${NAME}" in the file is replaced with that value from .env or the environment
        try { return { ...JSON.parse(fs.readFileSync(file, 'utf8'), (k, v) => (k === '__proto__' || k === 'constructor' || k === 'prototype' ? undefined : typeof v === 'string' ? v.replace(/\$\{(\w+)\}/g, (_, n) => process.env[n] || '') : v)), dir, file }; }
        catch (e) { console.error(`  ${file} is not valid JSON: ${e.message}`); process.exit(1); }
      }
    }
    if (dir === path.dirname(dir) || fs.existsSync(path.join(dir, 'package.json'))) return { dir: fs.existsSync(path.join(dir, 'package.json')) ? dir : path.resolve(start) };
  }
}

module.exports = { readConfig };
