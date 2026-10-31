/**
 * @gadhyare/safe-add
 *
 * Programmatic API & Security Gatekeeper for Node.js package management.
 * Can be required into any script or build pipeline to verify packages before installation.
 */
const safeAdd = require('./bin/safe-add.js');

module.exports = {
  install: safeAdd.runSafeAdd,
  runSafeAdd: safeAdd.runSafeAdd,
  parsePackageName: safeAdd.parsePackageName,
  checkTyposquatting: safeAdd.checkTyposquatting,
  fetchNpmRegistryMetadata: safeAdd.fetchNpmRegistryMetadata,
  fetchWeeklyDownloads: safeAdd.fetchWeeklyDownloads,
  scanLifecycleScripts: safeAdd.scanLifecycleScripts,
  containsNonAsciiOrHomoglyphs: safeAdd.containsNonAsciiOrHomoglyphs,
  levenshtein: safeAdd.levenshtein,
};
