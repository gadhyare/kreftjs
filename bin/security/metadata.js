'use strict';
const { start } = require('../win-spawn.js');

function viewPackage(key, cwd) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = start('npm', ['view', key, '--json', '--ignore-scripts', '--fund=false', '--fetch-retries=1', '--fetch-timeout=15000'], {
        cwd, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, npm_config_ignore_scripts: 'true', npm_config_audit: 'false' }
      });
    } catch (error) { reject(error); return; }
    let stdout = '', stderr = '', bytes = 0, settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(value);
    };
    const timer = setTimeout(() => { child.kill(); finish(Error(`Metadata request timed out: ${key}`)); }, 45000);
    const collect = target => chunk => {
      bytes += chunk.length;
      if (bytes > 16 * 1024 * 1024) { child.kill(); finish(Error(`Metadata response too large: ${key}`)); return; }
      if (target === 'stdout') stdout += chunk; else stderr += chunk;
    };
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', collect('stdout')); child.stderr.on('data', collect('stderr'));
    child.once('error', error => finish(error));
    child.once('close', code => {
      if (code !== 0) { finish(Error(`Registry metadata unavailable: ${key}`)); return; }
      try { finish(null, JSON.parse(stdout)); } catch (error) { finish(error); }
    });
  });
}

async function inspectMetadata(graph, { fetch, progress = () => {} }) {
  const keys = [...new Set(graph.map(n => `${n.name}@${n.version}`))];
  const metadata = new Map();
  let next = 0, complete = 0;
  progress(`Reviewing ${keys.length} unique package versions across the full project (up to 4 checks at once)...`);
  async function worker() {
    while (next < keys.length) {
      const key = keys[next++];
      let value = null;
      try { value = await fetch(key); } catch (_) { /* Missing evidence remains subject to policy. */ }
      metadata.set(key, value);
      progress(`Checked registry metadata [${++complete}/${keys.length}]: ${key}${value ? '' : ' (unavailable; policy will evaluate missing evidence)'}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, keys.length) }, worker));
  return metadata;
}
module.exports = { viewPackage, inspectMetadata };
