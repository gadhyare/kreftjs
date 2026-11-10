'use strict';
const defaults = {
  enabled: true, minimumTier: 2, blockCriticalVulnerabilities: true,
  blockHighVulnerabilities: true, blockMaliciousPackages: true, ignoreScripts: true,
  verifyIntegrity: true, auditOnInstall: true, allowUnverified: false,
  checkDependencies: true, checkLicenses: true, checkMaintenance: true,
  failOnUnknownSecurityStatus: true, deniedLicenses: [], deniedPackages: [], allowedPackages: [],
  reports: { enabled: true, format: ['json', 'text'], directory: '.kreft/security' }
};
function policy(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('security must be an object');
  for (const key of Object.keys(input)) if (!(key in defaults)) throw Error(`Unknown security setting: ${key}`);
  const p = { ...defaults, ...input, reports: { ...defaults.reports, ...input.reports } };
  for (const [k, v] of Object.entries(defaults)) if (typeof v === 'boolean' && typeof p[k] !== 'boolean') throw Error(`security.${k} must be boolean`);
  if (![1, 2, 3].includes(p.minimumTier)) throw Error('security.minimumTier must be 1, 2 or 3');
  for (const k of ['deniedLicenses', 'deniedPackages', 'allowedPackages']) if (!Array.isArray(p[k]) || p[k].some(x => typeof x !== 'string')) throw Error(`security.${k} must be a string array`);
  // package rules: a registry name, or name@exact-version. An allow and a deny of the same package contradict each other.
  const rules = require('./rules.js');
  for (const k of ['deniedPackages', 'allowedPackages']) for (const e of p[k]) { try { rules.parseRule(e); } catch (err) { throw Error(`security.${k}: ${err.message}`); } }
  const clash = rules.conflict(p.allowedPackages, p.deniedPackages);
  if (clash) throw Error(`security: "${clash[0]}" is in allowedPackages and "${clash[1]}" is in deniedPackages. A package cannot be both: remove one (kreft install --forget-package <name>).`);
  if (input.reports !== undefined && (!input.reports || typeof input.reports !== 'object' || Array.isArray(input.reports))) throw Error('security.reports must be an object');
  if (Object.keys(p.reports).some(k => !(k in defaults.reports)) || typeof p.reports.enabled !== 'boolean' || !Array.isArray(p.reports.format) || p.reports.format.some(x => !['json', 'text'].includes(x)) || typeof p.reports.directory !== 'string' || !p.reports.directory.trim()) throw Error('Invalid security.reports settings');
  // This implementation never allows a switch to silently weaken graph or byte verification.
  for (const k of ['enabled', 'ignoreScripts', 'verifyIntegrity', 'checkDependencies']) if (!p[k]) throw Error(`security.${k}=false is unsupported by the secure npm installer`);
  return p;
}
module.exports = { defaults, policy };
