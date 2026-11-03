/*
 * Kreft Configuration Repository & Loader: config(key, defaultValue)
 *
 * Automatically loads all configuration files from the project's config/ directory:
 *   config/app.js         -> config('app.name')
 *   config/database.js    -> config('database.default')
 *   config/redis.js       -> config('redis.host')
 *   config/auth.js        -> config('auth.guards')
 *   kreft.config.json       -> config('tables.notes.rules')
 *
 * Supports dot notation, default fallbacks, runtime setters, and hot reloading.
 *
 * Usage:
 *   const { config } = require('kreft/server')
 *   const appName = config('app.name', 'Kreft App')
 *   const dbHost = config('database.connections.mysql.host', '127.0.0.1')
 *   config.set('app.env', 'production')
 */
const fs = require('fs');
const path = require('path');

const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

class ConfigRepository {
  constructor(initialItems = {}) {
    this.items = { ...initialItems };
    this.loaded = false;
    this.configDir = null;
  }

  // Get configuration value using dot-notation: config.get('database.connections.sqlite.database', 'demo.db')
  get(key, defaultValue = null) {
    if (key === undefined || key === null || key === '') {
      return this.items;
    }

    const segments = String(key).split('.');
    let current = this.items;

    for (const segment of segments) {
      if (BAD_KEYS.has(segment) || current === null || current === undefined || typeof current !== 'object') {
        return defaultValue;
      }
      current = current[segment];
    }

    return current !== undefined ? current : defaultValue;
  }

  // Check if a configuration key exists
  has(key) {
    if (!key) return false;
    const segments = String(key).split('.');
    let current = this.items;

    for (const segment of segments) {
      if (BAD_KEYS.has(segment) || current === null || current === undefined || typeof current !== 'object' || !(segment in current)) {
        return false;
      }
      current = current[segment];
    }

    return true;
  }

  // Set configuration value at runtime using dot-notation: config.set('app.debug', false)
  set(key, value) {
    if (typeof key === 'object' && key !== null) {
      for (const [k, v] of Object.entries(key)) {
        this.set(k, v);
      }
      return this;
    }

    const segments = String(key).split('.');
    if (segments.some((s) => BAD_KEYS.has(s))) {
      return this;
    }

    let current = this.items;

    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i];
      if (
        !(segment in current) ||
        current[segment] === null ||
        typeof current[segment] !== 'object' ||
        Array.isArray(current[segment])
      ) {
        current[segment] = {};
      }
      current = current[segment];
    }

    current[segments[segments.length - 1]] = value;
    return this;
  }

  // Return all loaded configuration items
  all() {
    return this.items;
  }

  // Discover and load all files in config/ and kreft.config.json
  load(projectRoot = process.cwd()) {
    const root = path.resolve(projectRoot);
    const candidateDirs = [
      path.join(root, 'config'),
      path.join(root, 'backend', 'config'),
      path.join(root, 'app', 'config'),
    ];

    let foundDir = null;
    for (const dir of candidateDirs) {
      try {
        if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
          foundDir = dir;
          break;
        }
      } catch (_) {}
    }

    this.configDir = foundDir;
    const loadedConfigs = {};

    // 1. Load from config/*.js, config/*.cjs, config/*.ts, config/*.mts, config/*.cts, config/*.json
    if (foundDir) {
      try {
        require('./typescript.js').registerTypeScript(root);
        const files = fs.readdirSync(foundDir);
        for (const file of files) {
          if (!/\.(c?js|[mc]?ts|json)$/i.test(file) || file.endsWith('.d.ts')) continue;
          const configKey = path.basename(file, path.extname(file)).toLowerCase();
          const fullPath = path.join(foundDir, file);
          try {
            // Delete require cache so reload() picks up file edits
            delete require.cache[require.resolve(fullPath)];
            const mod = require(fullPath);
            loadedConfigs[configKey] = mod && mod.__esModule && mod.default ? mod.default : mod;
          } catch (err) {
            console.error(`[Kreft Config] Error reading config file "${file}":`, err.message);
          }
        }
      } catch (_) {}
    }

    // 2. Load and merge kreft.config.json if present
    const kreftConfigPath = path.join(root, 'kreft.config.json');
    if (fs.existsSync(kreftConfigPath)) {
      try {
        delete require.cache[require.resolve(kreftConfigPath)];
        const kreftJson = require(kreftConfigPath);
        if (kreftJson && typeof kreftJson === 'object') {
          for (const [k, v] of Object.entries(kreftJson)) {
            if (!(k in loadedConfigs)) {
              loadedConfigs[k] = v;
            } else if (typeof loadedConfigs[k] === 'object' && typeof v === 'object') {
              loadedConfigs[k] = { ...v, ...loadedConfigs[k] };
            }
          }
        }
      } catch (_) {}
    }

    // Merge into repository
    this.items = { ...this.items, ...loadedConfigs };
    this.loaded = true;
    return this;
  }

  // Reload all configuration files from disk
  reload(projectRoot) {
    this.items = {};
    this.loaded = false;
    return this.load(projectRoot || this.configDir || process.cwd());
  }
}

// Global instance
const repo = new ConfigRepository();

// Primary helper function: config(key, defaultValue)
function config(key, defaultValue = null) {
  if (!repo.loaded) {
    repo.load();
  }

  if (arguments.length === 0) {
    return repo;
  }

  if (typeof key === 'object' && key !== null) {
    return repo.set(key);
  }

  return repo.get(key, defaultValue);
}

// Attach helper methods to config function
config.get = (key, defaultValue = null) => {
  if (!repo.loaded) repo.load();
  return repo.get(key, defaultValue);
};

config.has = (key) => {
  if (!repo.loaded) repo.load();
  return repo.has(key);
};

config.set = (key, value) => {
  if (!repo.loaded) repo.load();
  return repo.set(key, value);
};

config.all = () => {
  if (!repo.loaded) repo.load();
  return repo.all();
};

config.load = (projectRoot) => repo.load(projectRoot);
config.reload = (projectRoot) => repo.reload(projectRoot);
config.repository = repo;

// Also expose on global for ergonomic access across controllers & middleware
if (typeof global !== 'undefined') {
  global.config = config;
}

module.exports = {
  config,
  Config: config,
  ConfigRepository,
};
