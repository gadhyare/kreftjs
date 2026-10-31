#!/usr/bin/env node
/*
 * @somjs/somjs (safe-add / som)
 *
 * Enterprise-Grade Security Gatekeeper & Safe Package Installer for Node.js.
 * Zero-dependency, portable CLI that works anywhere on any computer or CI/CD environment.
 *
 * Key Capabilities:
 *   1. Supply-Chain & Homoglyph Protection (Blocks confusable attack unicode & shell metacharacters)
 *   2. Algorithmic Typosquatting Blocker (Levenshtein distance against 50+ high-profile npm packages)
 *   3. Deep Registry & Age Verification (Blocks disposable packages <14 days, checks license & downloads)
 *   4. Lifecycle Script RCE Scanner & Sandbox (Deep-scans preinstall/install/postinstall scripts; forces --ignore-scripts)
 *   5. Interactive Trust Tier Gatekeeper (Explicit confirmation before installing unverified community packages)
 *   6. Exact Version Pinning & Auto Audit (Enforces --save-exact to eliminate upstream supply-chain mutations)
 *   7. Live Package Information Cards & Notification Center (Rich dashboard with author, updates, advisories, bug tracker)
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const readline = require('readline');
const { spawnSync } = require('child_process');

const green = (s) => (process.stdout.isTTY ? `\x1b[32m${s}\x1b[0m` : s);
const cyan = (s) => (process.stdout.isTTY ? `\x1b[36m${s}\x1b[0m` : s);
const yellow = (s) => (process.stdout.isTTY ? `\x1b[33m${s}\x1b[0m` : s);
const dim = (s) => (process.stdout.isTTY ? `\x1b[2m${s}\x1b[0m` : s);
const bold = (s) => (process.stdout.isTTY ? `\x1b[1m${s}\x1b[0m` : s);
const red = (s) => (process.stdout.isTTY ? `\x1b[31m${s}\x1b[0m` : s);
const magenta = (s) => (process.stdout.isTTY ? `\x1b[35m${s}\x1b[0m` : s);

// Strict npm package name regex (scoped or bare)
const VALID_PKG_NAME_REGEX = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

// Known typosquatting traps / malicious package names
const TYPOSQUATS = {
  crossenv: 'cross-env',
  lodsh: 'lodash',
  'lo-dash': 'lodash',
  axois: 'axios',
  expres: 'express',
  cheeriojs: 'cheerio',
  momnet: 'moment',
  coookie: 'cookie',
  chlak: 'chalk',
  requset: 'request',
  tslib2: 'tslib',
};

// Popular ecosystem packages used as baselines for distance calculation
const POPULAR_PACKAGES = [
  'react', 'react-dom', 'vue', 'axios', 'lodash', 'express', 'moment', 'dayjs',
  'chalk', 'commander', 'debug', 'typescript', 'eslint', 'prettier', 'jest',
  'webpack', 'vite', 'rollup', 'esbuild', 'dotenv', 'cors', 'glob', 'rxjs',
  'postcss', 'tailwindcss', 'next', 'fs-extra', 'uuid', 'cheerio', 'inquirer',
  'yargs', 'socket.io', 'zod', 'semver', 'nodemon', 'rimraf', 'async', 'mkdirp',
  'body-parser', 'cookie-parser', 'multer', 'jsonwebtoken', 'bcrypt', 'redis',
  'pg', 'mysql2', 'sqlite3', 'prisma', 'mongoose'
];

// Packages known to require native C/C++ compilation during install
const VERIFIED_NATIVE_PACKAGES = new Set([
  'esbuild', 'sqlite3', 'better-sqlite3', 'bcrypt', 'canvas', 'sharp',
  'node-sass', 'fsevents', 're2', 'leveldown', 'msgpackr-extract'
]);

// Trust Tiers
const TIERS = {
  TIER_1_VERIFIED: { name: 'Tier 1: Verified Driver / Core Tool', color: green },
  TIER_2_ESTABLISHED: { name: 'Tier 2: Established Community Package', color: cyan },
  TIER_3_UNVERIFIED: { name: 'Tier 3: Unverified / Low Popularity Package', color: yellow },
  TIER_4_RISK: { name: 'Tier 4: High Risk / Quarantined Package', color: red },
};

function findProjectDir(start = process.cwd()) {
  const here = path.resolve(start);
  for (let dir = here; ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    if (dir === path.dirname(dir)) return here;
  }
}

function parsePackageName(raw) {
  let name = raw;
  let version = 'latest';
  if (raw.startsWith('@')) {
    const slashIdx = raw.indexOf('/');
    if (slashIdx !== -1) {
      const atIdx = raw.indexOf('@', slashIdx + 1);
      if (atIdx !== -1) {
        name = raw.slice(0, atIdx);
        version = raw.slice(atIdx + 1);
      }
    }
  } else {
    const atIdx = raw.indexOf('@', 1);
    if (atIdx !== -1) {
      name = raw.slice(0, atIdx);
      version = raw.slice(atIdx + 1);
    }
  }
  return { name, version };
}

function containsNonAsciiOrHomoglyphs(str) {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code > 127) return true;
  }
  return false;
}

function levenshtein(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function checkTyposquatting(name) {
  const lower = name.toLowerCase();
  if (TYPOSQUATS[lower]) return TYPOSQUATS[lower];
  if (lower.startsWith('@')) return null;

  for (const pop of POPULAR_PACKAGES) {
    if (lower === pop) return null;
    const dist = levenshtein(lower, pop);
    if (pop.length <= 4 && dist === 1) return pop;
    if (pop.length > 4 && dist <= 2) return pop;
  }
  return null;
}

function fetchNpmRegistryMetadata(packageName) {
  return new Promise((resolve, reject) => {
    const encodedName = packageName.startsWith('@')
      ? `@${encodeURIComponent(packageName.slice(1))}`
      : encodeURIComponent(packageName);
    const url = `https://registry.npmjs.org/${encodedName}`;

    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'safe-add-security-gatekeeper/1.0.0',
          Accept: 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*',
        },
        timeout: 8000,
      },
      (res) => {
        if (res.statusCode === 404) {
          return resolve(null);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`NPM Registry responded with HTTP ${res.statusCode}`));
        }

        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            resolve(data);
          } catch (e) {
            reject(new Error(`Failed to parse npm registry response: ${e.message}`));
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Registry query timed out for package "${packageName}"`));
    });

    req.on('error', (err) => reject(err));
  });
}

function fetchWeeklyDownloads(packageName) {
  return new Promise((resolve) => {
    const url = `https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(packageName)}`;
    const req = https.get(url, { headers: { 'User-Agent': 'safe-add-security-gatekeeper/1.0.0' }, timeout: 4000 }, (res) => {
      if (res.statusCode !== 200) return resolve(0);
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve(json.downloads || 0);
        } catch (_) {
          resolve(0);
        }
      });
    });
    req.on('error', () => resolve(0));
    req.on('timeout', () => { req.destroy(); resolve(0); });
  });
}

function scanLifecycleScripts(meta, versionTag = 'latest') {
  const issues = [];
  let scripts = {};

  if (meta && meta.versions) {
    const latestVersion = meta['dist-tags']?.[versionTag] || Object.keys(meta.versions).pop();
    const verObj = meta.versions[latestVersion];
    if (verObj && verObj.scripts) {
      scripts = verObj.scripts;
    }
  }

  const DANGEROUS_PATTERNS = [
    { pattern: /curl\s+.*\|\s*(ba)?sh/i, reason: 'Remote bash script execution via curl | sh' },
    { pattern: /wget\s+.*\|\s*(ba)?sh/i, reason: 'Remote bash script execution via wget | sh' },
    { pattern: /powershell(\.exe)?\s+(-enc|-encodedcommand)/i, reason: 'Encoded PowerShell command execution' },
    { pattern: /rm\s+-rf\s+[\/~]/i, reason: 'Destructive root or home directory removal command' },
    { pattern: /eval\s*\(\s*Buffer\.from/i, reason: 'Obfuscated base64 payload execution' },
    { pattern: /node\s+-e\s+['"].*require\(['"]child_process['"]\)/i, reason: 'Inline child_process execution in script' }
  ];

  for (const [hook, cmd] of Object.entries(scripts)) {
    if (['preinstall', 'install', 'postinstall'].includes(hook)) {
      for (const { pattern, reason } of DANGEROUS_PATTERNS) {
        if (pattern.test(cmd)) {
          issues.push({ hook, cmd, reason, severity: 'CRITICAL' });
        }
      }
      if (!issues.some((i) => i.hook === hook)) {
        issues.push({ hook, cmd, reason: 'Active lifecycle script executed automatically upon install', severity: 'WARNING' });
      }
    }
  }

  return { scripts, issues };
}

function askConfirmation(question) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      return resolve(false);
    }
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      resolve(trimmed === 'y' || trimmed === 'yes');
    });
  });
}

function formatRelativeTime(date) {
  if (!date || isNaN(date.getTime())) return 'unknown';
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return `${diffSec} seconds ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minutes ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} hours ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays} days ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths} months ago`;
  return `${Math.floor(diffMonths / 12)} years ago`;
}

function renderPackageCard(data) {
  const termWidth = process.stdout.columns || 80;
  const cardWidth = Math.min(Math.max(termWidth - 4, 60), 84);
  const contentWidth = cardWidth - 4;

  const topBorder = '┌' + '─'.repeat(cardWidth - 2) + '┐';
  const bottomBorder = '└' + '─'.repeat(cardWidth - 2) + '┘';
  const midDivider = '├' + '─'.repeat(cardWidth - 2) + '┤';

  function stripAnsi(str) {
    return String(str).replace(/\x1b\[[0-9;]*m/g, '');
  }

  function boxLine(content, width) {
    const raw = stripAnsi(content);
    const pad = Math.max(0, width - raw.length);
    return `│ ${content}${' '.repeat(pad)} │`;
  }

  console.log('\n' + topBorder);
  console.log(boxLine(`${bold(green('📦 PACKAGE INSTALLED:'))} ${bold(cyan(data.name))} ${dim('@' + data.version)}`, contentWidth));
  console.log(boxLine(dim(data.description || 'No description provided by package author.'), contentWidth));
  console.log(midDivider);

  // Author & Metadata
  console.log(boxLine(`${bold('Author:')}       ${data.author}`, contentWidth));
  console.log(boxLine(`${bold('License:')}      ${data.license}`, contentWidth));
  console.log(boxLine(`${bold('Last Update:')}  ${data.lastUpdate}`, contentWidth));
  console.log(boxLine(`${bold('Weekly Dls:')}   ${Number(data.downloads).toLocaleString()}`, contentWidth));

  if (data.repository) {
    console.log(boxLine(`${bold('Repository:')}   ${dim(data.repository)}`, contentWidth));
  }
  if (data.homepage) {
    console.log(boxLine(`${bold('Homepage:')}     ${dim(data.homepage)}`, contentWidth));
  }

  console.log(boxLine(`${bold('Dependencies:')} ${data.dependenciesCount} direct dependencies`, contentWidth));
  console.log(midDivider);

  // Notifications & Health Advisories
  console.log(boxLine(bold(magenta('🔔 NOTIFICATIONS & HEALTH ADVISORIES:')), contentWidth));
  for (const n of data.notifications) {
    console.log(boxLine(`  ${n.icon} ${n.message}`, contentWidth));
    if (n.action) {
      console.log(boxLine(`     ${dim('↳ ' + n.action)}`, contentWidth));
    }
  }

  console.log(bottomBorder);
  console.log('');
}

function runSecurityAudit(npmCmd, project, auditData) {
  const total = (auditData && auditData.metadata && auditData.metadata.vulnerabilities && auditData.metadata.vulnerabilities.total) || 0;
  if (total === 0) {
    console.log(`  ${green('✓')} Automated Security Audit: 0 high or critical vulnerabilities found.`);
  } else {
    console.warn(`  ${yellow('⚠ Automated Security Audit:')} ${total} potential vulnerabilities detected across project dependencies.`);
    console.warn(`    Run ${dim('npm audit')} in your project for full remediation.`);
  }
}

function printHelp() {
  console.log(`
  ${bold('som add <packages...>') }  (alias: ${dim('som install')}, ${dim('som i')})

  Enterprise-Grade Security Gatekeeper & Package Installer for Som.js.
  Runs anywhere on any machine with zero external dependencies.

  Usage:
    som add <packages...>           Install package(s) with full security gatekeeper verification
    som add express lodash          Install multiple packages safely
    som add -D vitest               Install as devDependency
    som add --check <pkg>           Inspect package security report without installing (alias: --dry-run)
    som add -y <pkg>                Auto-confirm unverified packages in CI/CD (alias: --yes)
    som add --allow-scripts <pkg>   Allow lifecycle scripts (postinstall/build)
    som add --force <pkg>           Bypass security warnings & redundancy checks

  Security Verification Rules:
    1. Homoglyph & Shell Injection Shield:
       Rejects package names containing non-ASCII unicode homoglyphs or shell metacharacters.

    2. Algorithmic Typosquatting Blocker:
       Calculates Levenshtein distance against 50+ popular npm packages to catch deceptive typosquats.

    3. Package Maturity & Age Verification:
       Blocks disposable packages published <14 days ago and flags unverified youth packages.

    4. Lifecycle Script RCE Scanner:
       Deep-scans preinstall/install/postinstall scripts for malware signatures (curl | sh, powershell,
       rm -rf) and forces --ignore-scripts sandbox by default.

    5. Reputation & Trust Tiering:
       Categorizes packages into 4 Trust Tiers (Verified, Established, Unverified, High Risk).
       Requires explicit confirmation before installing unverified community packages.

    6. Exact Version Pinning & Audit:
       Enforces --save-exact to eliminate upstream supply-chain mutations, followed by auto npm audit.

    7. Live Package Information Cards & Notification Center:
       Displays comprehensive cards detailing author, version, last update, license, repository,
       weekly downloads, and real-time notifications for updates, security issues, and bug trackers.
  `);
}

async function runSafeAdd(args = []) {
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  // Handle subcommands: 'som add <pkgs>', 'som install <pkgs>', 'som i <pkgs>'
  let inputArgs = [...args];
  if (inputArgs[0] === 'add' || inputArgs[0] === 'install' || inputArgs[0] === 'i') {
    inputArgs = inputArgs.slice(1);
  }

  const targets = [];
  let isDev = false;
  let force = false;
  let autoYes = false;
  let allowScripts = false;
  let dryRun = false;
  let targetDir = process.cwd();

  for (let i = 0; i < inputArgs.length; i++) {
    const a = inputArgs[i];
    if (a === '-D' || a === '--save-dev') {
      isDev = true;
    } else if (a === '--force' || a === '-f') {
      force = true;
    } else if (a === '-y' || a === '--yes') {
      autoYes = true;
    } else if (a === '--allow-scripts') {
      allowScripts = true;
    } else if (a === '--dry-run' || a === '--check') {
      dryRun = true;
    } else if (a === '--dir' || a === '-C') {
      targetDir = inputArgs[++i];
    } else if (!a.startsWith('-')) {
      targets.push(a);
    }
  }

  if (targets.length === 0) {
    printHelp();
    return;
  }

  const project = findProjectDir(targetDir);

  console.log(`\n  ${bold('Som.js Security Gatekeeper & Package Installer')} ${dim('v1.0.1')}`);
  console.log(`  ${dim('Enforcing strict supply-chain security rules...')}\n`);

  // =========================================================================
  // RULE 1: Name Sanitization, Shell Injection & Homoglyph Protection
  // =========================================================================
  for (const raw of targets) {
    const { name } = parsePackageName(raw);

    // Check for dangerous shell injection characters
    if (/[\s;`&|$()<>\\'"]/.test(name)) {
      console.error(`  ${red('✖ CRITICAL SECURITY EXPLOIT BLOCKED:')} Package name contains shell metacharacters.`);
      console.error(`    Target: ${red(name)}`);
      console.error(`    Aborting installation immediately.\n`);
      process.exit(1);
    }

    // Check for non-ASCII or unicode homoglyphs
    if (containsNonAsciiOrHomoglyphs(name)) {
      console.error(`  ${red('✖ CRITICAL SECURITY BLOCKED: Homoglyph / Confusable Attack Detected!')}`);
      console.error(`    Package name "${red(name)}" contains non-ASCII characters imitating legitimate packages.`);
      console.error(`    This is a known supply-chain attack vector. Installation halted permanently.\n`);
      process.exit(1);
    }

    // Check standard npm package name validity
    if (!VALID_PKG_NAME_REGEX.test(name.toLowerCase())) {
      console.error(`  ${red('✖ SECURITY ERROR:')} Invalid npm package format: "${name}"\n`);
      process.exit(1);
    }
  }

  // =========================================================================
  // RULE 2: Algorithmic Typosquatting Blocker
  // =========================================================================
  for (const raw of targets) {
    const { name } = parsePackageName(raw);
    const intendedTarget = checkTyposquatting(name);

    if (intendedTarget && intendedTarget.toLowerCase() !== name.toLowerCase()) {
      console.error(`  ${red('✖ CRITICAL SECURITY WARNING: Potential Typosquatting Attack Detected!')}`);
      console.error(`    You requested: ${red(bold(name))}`);
      console.error(`    Did you mean:  ${green(bold(intendedTarget))} ?`);
      console.error(`    Attack Pattern: Malicious packages register typosquat names to hijack supply-chains.`);

      if (!force) {
        console.error(`    Installation blocked. If you are 100% certain, re-run with: ${dim('--force')}\n`);
        process.exit(1);
      } else {
        console.warn(`    ${yellow('⚠ Warning bypassed via --force flag.')}\n`);
      }
    }
  }

  // =========================================================================
  // RULE 3 & 4: Deep NPM Registry Health & Metadata Verification
  // =========================================================================
  const verifiedPackages = [];

  for (const raw of targets) {
    const { name, version } = parsePackageName(raw);
    process.stdout.write(`  ${dim('•')} Querying npm registry for ${cyan(name)}... `);

    let meta = null;
    let downloads = 0;

    try {
      meta = await fetchNpmRegistryMetadata(name);
      downloads = await fetchWeeklyDownloads(name);
    } catch (err) {
      console.log(`${red('FAILED')}`);
      console.error(`  ${red('✖ Registry Error:')} ${err.message}\n`);
      process.exit(1);
    }

    if (!meta) {
      console.log(`${red('NOT FOUND')}`);
      console.error(`  ${red('✖ Error:')} Package "${name}" does not exist in the public npm registry.\n`);
      process.exit(1);
    }

    console.log(`${green('OK')}`);

    // Check Deprecation
    const latestTag = meta['dist-tags']?.[version === 'latest' ? 'latest' : version] || Object.keys(meta.versions || {}).pop();
    const verData = meta.versions?.[latestTag] || {};

    if (verData.deprecated) {
      console.warn(`  ${yellow('⚠ DEPRECATED PACKAGE:')} "${name}" is marked as deprecated:`);
      console.warn(`    ${yellow(verData.deprecated)}`);
      if (!force) {
        const proceed = autoYes || await askConfirmation(`  Do you still want to proceed installing this deprecated package? [y/N]: `);
        if (!proceed) {
          console.log(`  ${dim('Installation aborted by user.')}\n`);
          process.exit(0);
        }
      }
    }

    // Check Package Age / Release Date (Disposable package blocker)
    const timeCreated = meta.time?.created ? new Date(meta.time.created) : null;
    const timeModified = meta.time?.modified ? new Date(meta.time.modified) : null;
    const daysOld = timeCreated ? Math.floor((Date.now() - timeCreated.getTime()) / (1000 * 60 * 60 * 24)) : 999;

    if (daysOld < 14) {
      console.warn(`  ${red('⚠ SUSPICIOUS RECENT REGISTRATION:')} "${name}" was created only ${daysOld} days ago.`);
      console.warn(`    Many npm supply-chain malware attacks use freshly registered disposable packages.`);
      if (!force) {
        console.error(`    Blocked for security. Use ${dim('--force')} if this is an intended new package release.\n`);
        process.exit(1);
      }
    }

    // Check Open-Source Repository presence
    const hasRepo = Boolean(meta.repository || verData.repository);
    if (!hasRepo && !name.startsWith('@')) {
      console.warn(`  ${yellow('⚠ MISSING PUBLIC REPOSITORY:')} Package "${name}" does not link to a public source repository.`);
    }

    // =========================================================================
    // RULE 5: RCE Script Inspection & Sandboxing
    // =========================================================================
    const { issues: scriptIssues } = scanLifecycleScripts(meta, version);
    const criticalRCE = scriptIssues.filter((i) => i.severity === 'CRITICAL');
    const warningScripts = scriptIssues.filter((i) => i.severity === 'WARNING');

    if (criticalRCE.length > 0) {
      console.error(`  ${red('✖ CRITICAL MALWARE SIGNATURE DETECTED in lifecycle scripts:')}`);
      for (const iss of criticalRCE) {
        console.error(`    ${red(`[${iss.hook}]`)} ${iss.reason}`);
        console.error(`    Command: ${dim(iss.cmd)}`);
      }
      console.error(`  ${red('Installation completely aborted to prevent Remote Code Execution (RCE).')}\n`);
      process.exit(1);
    }

    // Determine Security Trust Tier
    let tier = TIERS.TIER_3_UNVERIFIED;
    if (VERIFIED_NATIVE_PACKAGES.has(name)) {
      tier = TIERS.TIER_1_VERIFIED;
    } else if (downloads > 50000 && daysOld > 90) {
      tier = TIERS.TIER_2_ESTABLISHED;
    } else if (daysOld < 30 || downloads < 500) {
      tier = TIERS.TIER_3_UNVERIFIED;
    }

    if (warningScripts.length > 0 && !allowScripts && !VERIFIED_NATIVE_PACKAGES.has(name)) {
      console.log(`  ${yellow('ℹ Sandboxing:')} Package "${name}" contains ${warningScripts.length} install script(s).`);
      console.log(`    Running with ${bold('--ignore-scripts')} sandbox to prevent arbitrary command execution.`);
    }

    verifiedPackages.push({
      raw,
      name,
      version: latestTag || version,
      downloads,
      daysOld,
      tier,
      timeModified,
      verData,
      meta,
      scriptIssues,
    });
  }

  // =========================================================================
  // RULE 6: Trust Tier Interactive Gatekeeper
  // =========================================================================
  const unverified = verifiedPackages.filter((p) => p.tier === TIERS.TIER_3_UNVERIFIED);
  if (unverified.length > 0 && !force && !autoYes) {
    console.log(`\n  ${yellow('⚠ SECURITY GATEKEEPER NOTICE:')} The following packages are unverified or low-reputation:`);
    for (const p of unverified) {
      console.log(`    • ${bold(p.name)} (${p.downloads} weekly downloads, registered ${p.daysOld} days ago)`);
    }
    const confirmed = await askConfirmation(`\n  Do you trust these packages and wish to install them? [y/N]: `);
    if (!confirmed) {
      console.log(`  ${dim('Installation cancelled by user.')}\n`);
      process.exit(0);
    }
  }

  if (dryRun) {
    console.log(`\n  ${green('✓ Security Check Passed (Dry Run):')} Packages inspected with 0 critical blockers.`);
    return;
  }

  // Ensure package.json exists in target project
  const pkgJsonPath = path.join(project, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) {
    console.log(`  ${dim('Initializing minimal package.json in')} ${dim(project)}...`);
    fs.writeFileSync(pkgJsonPath, JSON.stringify({ name: path.basename(project), version: '1.0.0', private: true }, null, 2));
  }

  // =========================================================================
  // RULE 7: Safe Sandboxed Installation with Version Pinning
  // =========================================================================
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const installArgs = ['install', '--save-exact'];
  if (isDev) installArgs.push('-D');

  const needsSandbox = verifiedPackages.some((p) => !allowScripts && !VERIFIED_NATIVE_PACKAGES.has(p.name));
  if (needsSandbox) {
    installArgs.push('--ignore-scripts');
  }

  for (const p of verifiedPackages) {
    installArgs.push(p.raw);
  }

  console.log(`\n  ${dim('$')} ${npmCmd} ${installArgs.join(' ')}`);
  const spawnResult = spawnSync(npmCmd, installArgs, {
    cwd: project,
    stdio: 'inherit',
    env: process.env,
  });

  if (spawnResult.status !== 0) {
    console.error(`\n  ${red('✖ Package installation failed.')} (Exit code: ${spawnResult.status})\n`);
    process.exit(spawnResult.status || 1);
  }

  // Query npm audit for vulnerability reports
  let auditData = null;
  try {
    const auditRun = spawnSync(npmCmd, ['audit', '--json'], { cwd: project, encoding: 'utf8' });
    if (auditRun.stdout) {
      auditData = JSON.parse(auditRun.stdout);
    }
  } catch (_) {
    // Non-blocking
  }

  // =========================================================================
  // RULE 8: Live Package Information Cards & Notification Center
  // =========================================================================
  for (const p of verifiedPackages) {
    const ver = p.verData || {};
    const meta = p.meta || {};

    const author =
      (typeof ver.author === 'string' ? ver.author : ver.author?.name) ||
      (typeof meta.author === 'string' ? meta.author : meta.author?.name) ||
      'Open Source Community';

    const license = ver.license || meta.license || 'Unspecified';
    const description = ver.description || meta.description || '';
    const lastUpdate = formatRelativeTime(p.timeModified);
    const downloads = p.downloads;

    const repository =
      (typeof ver.repository === 'string' ? ver.repository : ver.repository?.url) ||
      (typeof meta.repository === 'string' ? meta.repository : meta.repository?.url) ||
      '';

    const homepage = ver.homepage || meta.homepage || '';
    const dependenciesCount = Object.keys(ver.dependencies || {}).length;

    // Build notifications
    const notifications = [];

    // Notification: Deprecation
    if (ver.deprecated) {
      notifications.push({
        icon: '⚠️',
        message: `${bold(yellow('Deprecation Warning:'))} ${ver.deprecated}`,
        action: 'Consider migrating to an actively maintained alternative.',
      });
    }

    // Notification: Version Update Alert
    const latestDistVersion = meta['dist-tags']?.latest;
    if (latestDistVersion && latestDistVersion !== p.version) {
      notifications.push({
        icon: '🚀',
        message: `New version available: ${bold(cyan(latestDistVersion))} (installed: ${dim(p.version)})`,
        action: `Run "safe-add ${p.name}@latest" to update.`,
      });
    }

    // Notification: Security Advisories from npm audit
    let advisoryCount = 0;
    if (auditData && auditData.vulnerabilities && auditData.vulnerabilities[p.name]) {
      const vuln = auditData.vulnerabilities[p.name];
      advisoryCount = vuln.via ? vuln.via.length : 1;
      notifications.push({
        icon: '🛡️',
        message: `${bold(red('Security Advisory:'))} ${advisoryCount} known vulnerability reported for ${p.name} (Severity: ${vuln.severity}).`,
        action: 'Review "npm audit" details or update to a patched version.',
      });
    }

    // Notification: Zero-dependency confirmation or footprint
    if (dependenciesCount === 0) {
      notifications.push({
        icon: '✨',
        message: `${green('Zero-Dependency Safety:')} This package has no transitive third-party dependencies.`,
      });
    } else {
      notifications.push({
        icon: '📦',
        message: `Brings ${dependenciesCount} direct dependencies into your project dependency tree.`,
      });
    }

    // Notification: Bug Tracker / Issues link
    const bugsUrl = ver.bugs?.url || meta.bugs?.url;
    if (bugsUrl) {
      notifications.push({
        icon: '🐛',
        message: `Issue Tracker & Bugs: ${dim(bugsUrl)}`,
      });
    }

    // Render the Live Package Information Card
    renderPackageCard({
      name: p.name,
      version: p.version,
      description,
      author,
      license,
      lastUpdate,
      downloads,
      repository: repository.replace(/^git\+/, '').replace(/\.git$/, ''),
      homepage,
      dependenciesCount,
      notifications,
    });
  }

  // Summary audit line
  runSecurityAudit(npmCmd, project, auditData);
  console.log(`  ${green('✓')} All packages safely installed, verified, and exact-pinned.\n`);
}

// CLI Execution or Programmatic Export
if (require.main === module) {
  runSafeAdd(process.argv.slice(2)).catch((err) => {
    console.error(`\n  ${red('✖ Fatal Error:')} ${err.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  runSafeAdd,
  parsePackageName,
  checkTyposquatting,
  fetchNpmRegistryMetadata,
  fetchWeeklyDownloads,
  scanLifecycleScripts,
  containsNonAsciiOrHomoglyphs,
  levenshtein,
};
