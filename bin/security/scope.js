'use strict';
/*
 * Which packages of the dependency graph does an installation judge?
 *
 * `kreft install luxon` adds luxon and whatever luxon needs. The packages the project already had (electron-builder, Tauri,
 * Capacitor…) are not part of that decision, so a problem that was already there must not stop you from installing something else.
 * The review therefore judges the requested packages and the NEW packages they bring. Findings in the packages that were already
 * in the project are still reported, as warnings, but they do not block.
 *
 * A package counts as already in the project only when it is in the existing lockfile with exactly the same version and
 * integrity (wherever it sat). Without a previous lockfile there is no baseline, so a package reachable from a dependency
 * the project's package.json already lists is also left alone. Once a lockfile exists, a NEW or CHANGED node is judged
 * even when an existing root happens to share it: changed bytes are a new package.
 */
const SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];

// where "name" resolves to when it is required from the package at location `from` ('' is the project itself)
function resolveLocation(packages, from, name) {
  let base = from;
  for (;;) {
    const candidate = (base ? base + '/' : '') + 'node_modules/' + name;
    if (packages[candidate]) return candidate;
    if (!base) return null;
    const i = base.lastIndexOf('/node_modules/');
    base = i === -1 ? '' : base.slice(0, i);
  }
}

function reach(lock, rootNames) {
  const packages = lock.packages || {};
  const seen = new Set();
  const queue = [];
  for (const name of rootNames) { const loc = resolveLocation(packages, '', name); if (loc && !seen.has(loc)) { seen.add(loc); queue.push(loc); } }
  while (queue.length) {
    const loc = queue.shift();
    const node = packages[loc] || {};
    for (const name of Object.keys({ ...node.dependencies, ...node.optionalDependencies, ...node.peerDependencies })) {
      const next = resolveLocation(packages, loc, name);
      if (next && !seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  return seen;
}

// the set of locations in `lock` that this installation judges
function judgedLocations(lock, { requested, manifest = {}, previousLock = null }) {
  const requestedNames = new Set(requested);
  const existingNames = new Set();
  for (const section of SECTIONS) for (const name of Object.keys(manifest[section] || {})) if (!requestedNames.has(name)) existingNames.add(name);
  const fromRequested = reach(lock, requestedNames);
  const existing = reach(lock, existingNames);
  const before = (previousLock && previousLock.packages) || {};
  // exact unchanged identity/integrity, wherever it sat in the old lockfile (a package that only moved is not new bytes)
  const beforeIdentities = new Set(Object.values(before).filter((p) => p && p.integrity).map((p) => `${p.version}\u0000${p.integrity}`));
  const judged = new Set();
  for (const loc of fromRequested) {
    const now = lock.packages[loc];
    if (!now) continue;
    const unchanged = Boolean(now.integrity) && beforeIdentities.has(`${now.version}\u0000${now.integrity}`);
    if (unchanged) continue;                 // exact same bytes as before: grandfathered
    // With a previous lockfile we know what changed: a new or changed node is judged even when an existing root shares it.
    // Without one there is no baseline, so a package the project already needed is still not judged.
    if (existing.has(loc) && !previousLock) continue;
    judged.add(loc);
  }
  // what was asked for is always judged: a new version of a package the project has is a new package
  for (const name of requestedNames) { const loc = resolveLocation(lock.packages || {}, '', name); if (loc) judged.add(loc); }
  return judged;
}

// findings that protect the installation itself keep blocking everywhere; the rest do not block for packages that were already there
const ALWAYS_BLOCKING = new Set(['source', 'integrity', 'metadata-mismatch', 'denied-package', 'malicious-advisory']);

module.exports = { judgedLocations, reach, resolveLocation, ALWAYS_BLOCKING };
