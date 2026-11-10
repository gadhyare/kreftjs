/*
 * kreft add electron / kreft add tauri / kreft add electron tauri
 *
 * Sets a desktop runtime up in the project: config/<runtime>.config.js with every setting, the generated native files,
 * the package.json scripts, and the packages (npm install). The two runtimes are independent: each has its own config file,
 * folder and scripts, so they can be installed in the same project.
 *
 * An existing config file is never replaced without a yes: asked on a terminal, kept otherwise unless --force.
 */
const fs = require('fs');
const path = require('path');
const desktop = require('./config.js');
const { runSync } = require('../win-spawn.js');

const NAMES = { electron: 'Electron', tauri: 'Tauri' };

// What the packages of these runtimes would bring. The whole manifest (dependencies, devDependencies, optional and peer
// dependencies of the project plus the runtime packages) is resolved in a temporary folder WITHOUT downloading or running anything.
// A package in security.deniedPackages (by name or exact version), or one whose address is not on the npm registry in use, is a
// problem. Returns { problems, lock }: the lock file that was checked is the one to install from (npm ci).
const SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
function registryOf(root) {
  const r = runSync('npm', ['config', 'get', 'registry'], { cwd: root, encoding: 'utf8' });
  const url = String(r.stdout || '').trim();
  return /^https:\/\//.test(url) ? url.replace(/\/*$/, '/') : 'https://registry.npmjs.org/';
}
function manifestFor(own, runtimes) {
  const ranges = {};
  if (runtimes.includes('electron')) { const E = require('../electron.js'); ranges.electron = E.ELECTRON_VERSION; ranges['electron-builder'] = E.BUILDER_VERSION; }
  if (runtimes.includes('tauri')) ranges['@tauri-apps/cli'] = require('../tauri.js').TAURI_CLI_VERSION;
  const dev = { ...ranges, ...(own.devDependencies || {}) };   // init adds a runtime package only when the project has none
  const m = { name: own.name || 'check', version: own.version || '0.0.0', private: true };
  for (const k of SECTIONS) if (own[k] || k === 'devDependencies') m[k] = k === 'devDependencies' ? dev : own[k];
  for (const k of ['overrides', 'workspaces', 'packageManager', 'engines']) if (own[k] !== undefined) m[k] = own[k];
  return m;
}
// the problems of a resolved lock file: a disallowed package, or one whose address is not a file of a registry in use
function judgeLock(lock, denied, registries) {
  const rules = require('../security/rules.js');
  const out = [];
  for (const [loc, p] of Object.entries(lock.packages || {})) {
    if (!loc) continue;
    const name = p.name || loc.split('node_modules/').pop();
    if (denied.some((e) => rules.covers(e, name, p.version))) { out.push(`${name}@${p.version} is in security.deniedPackages (kreftjs.config.json). Remove the rule to install it: kreft add --forget-package ${name}`); continue; }
    // the address must start with a registry in use (host AND path), not just be any https:// address
    const from = [...registries].find((reg) => String(p.resolved || '').startsWith(reg));
    if (p.link || !from || !p.integrity) out.push(`${name}@${p.version} does not come from the npm registry in use (${p.resolved || 'no address'}${p.integrity ? '' : ', no integrity value'}).`);
  }
  return out;
}
function checkTree(root, runtimes) {
  const os = require('os');
  const rules = require('../security/rules.js');
  const denied = rules.listRules(root).denied;
  const registries = new Set([registryOf(root), 'https://registry.npmjs.org/']);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kreft-desktop-check-'));
  try {
    const own = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify(manifestFor(own, runtimes)));
    for (const f of ['package-lock.json', '.npmrc']) if (fs.existsSync(path.join(root, f))) fs.copyFileSync(path.join(root, f), path.join(tmp, f));
    const r = runSync('npm', ['install', '--package-lock-only', '--ignore-scripts', '--fund=false', '--audit=false'], { cwd: tmp, encoding: 'utf8', timeout: 180000 });
    if (r.error || r.status) return { problems: [`could not check the packages (npm said: ${String(r.stderr || r.error && r.error.message || 'failed').split('\n').find((l) => /ERR|error/i.test(l)) || 'failed'}). Check your internet connection and try again.`] };
    const lockText = fs.readFileSync(path.join(tmp, 'package-lock.json'), 'utf8');
    return { problems: judgeLock(JSON.parse(lockText), denied, registries), lock: lockText, manifest: manifestFor(own, runtimes) };
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

async function addRuntimes(runtimes, { dir = '.', force = false, install = true, confirm = null } = {}) {
  const root = require('../layout.js').layout(dir).project || path.resolve(dir);
  if (!fs.existsSync(path.join(root, 'package.json'))) {
    console.error('\n  No package.json here. Run this inside a Kreft project (kreft new my-app makes one).\n');
    process.exit(1);
  }
  // The packages of a desktop runtime come from npm like any other, so they are held to the project's rules first: the whole tree
  // npm would install (not only the names listed here) is resolved WITHOUT downloading or running anything, and refused when a
  // package in it is disallowed (security.deniedPackages, by name or by exact version) or does not come from the npm registry.
  const checked = checkTree(root, runtimes);
  if (checked.problems.length) {
    console.error('\n  Not installed, and nothing was changed:\n' + checked.problems.map((x) => '    ' + x).join('\n') + '\n');
    process.exit(1);
  }
  const originalPackageJson = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
  const result = {};
  for (const rt of runtimes) {
    const existing = desktop.configFile(root, rt);
    let state = 'created';
    if (existing) {
      let replace = force;
      if (!replace && confirm) replace = await confirm(`\n  ${path.relative(root, existing)} already exists. Replace it with the default settings? Your changes will be lost. [y/N] `);
      if (replace) {
        fs.copyFileSync(existing, existing + '.bak'); // a replaced file is never lost
        fs.writeFileSync(existing, desktop.template(rt, desktop.isEsmProject(root)));
        state = 'replaced';
        console.log(`  Replaced ${path.relative(root, existing)} (the old one is saved as ${path.basename(existing)}.bak).`);
      } else {
        state = 'kept';
        console.log(`\n  ${path.relative(root, existing)} already exists: kept as it is.${process.stdin.isTTY ? '' : ' (Use --force to replace it with the defaults.)'}`);
      }
    }
    require(rt === 'electron' ? '../electron.js' : '../tauri.js').init(root);
    result[rt] = { state, file: desktop.configFile(root, rt) };
  }
  if (install) {
    // The lock file that was checked is the one that is installed (npm ci installs exactly what the lock says). The manifest the
    // check used must be the one in the project now; if it is not, nothing is installed.
    const now = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const same = SECTIONS.every((k) => JSON.stringify(now[k] || {}) === JSON.stringify(checked.manifest[k] || {}));
    if (!same) {
      fs.writeFileSync(path.join(root, 'package.json'), originalPackageJson);
      console.error('\n  package.json did not match the packages that were checked, so nothing was installed (package.json is as it was). Run:  kreft add ' + runtimes.join(' ') + '  again.\n');
      process.exit(1);
    }
    fs.writeFileSync(path.join(root, 'package-lock.json'), checked.lock);
    console.log('  Installing the checked packages (npm ci)…\n');
    const r = runSync('npm', ['ci'], { cwd: root, stdio: 'inherit' });
    if (r.error || r.status) console.error('\n  npm ci failed. Run it yourself in ' + root + ' and then:  kreft ' + runtimes[0] + ':dev\n');
    else if (runtimes.includes('electron') && require('../electron.js').approveElectronScript(root)) console.log('  Allowed the install script of the installed Electron in package.json (allowScripts), so npm keeps downloading the app.');
  }
  return result;
}

module.exports = { addRuntimes, NAMES, judgeLock, manifestFor };
