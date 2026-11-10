'use strict';
const fs = require('fs');
const path = require('path');
const { runSync } = require('../win-spawn.js');
const { policy } = require('./policy.js');
const rules = require('./rules.js');
const scope = require('./scope.js');
const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const write = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 2) + '\n');
const NAME = '(?:@[a-z0-9][a-z0-9._~-]*/)?[a-z0-9][a-z0-9._~-]*';
function spec(raw) {
  const m = new RegExp(`^(${NAME})(?:@([^\\s]+))?$`).exec(raw);
  if (!m || raw.length > 512) throw Error(`Invalid registry package specification: ${raw}`);
  const version = m[2] || 'latest';
  if (!/^[a-zA-Z0-9.*~^+<>=| -]+$/.test(version) || /^(file|git|https?|npm|workspace):/.test(version)) throw Error(`Only npm registry names, tags and versions are supported: ${raw}; aliases and URL sources are rejected`);
  return { name: m[1], version, raw };
}
function nodes(lock) {
  if (!lock.packages || lock.lockfileVersion < 2) throw Error('npm lockfile version 2 or 3 is required');
  return Object.entries(lock.packages).filter(([k]) => k).map(([location, p]) => ({ ...p, location, name: p.name || location.split('node_modules/').pop() }));
}
// `judged` (a Set of locations) limits what can block: findings in other packages are kept as warnings. See scope.js. Without it every package is judged.
function evaluate(lock, metadata, audit, p, judged = null) {
  const packages = nodes(lock).map(n => {
    const evidence = [], warnings = [], violations = [];
    const m = metadata.get(`${n.name}@${n.version}`);
    const finding = (code, detail) => violations.push({ code, detail });
    if (!n.version || !/^\d+\.\d+\.\d+(?:[-+].*)?$/.test(n.version) || n.link || !/^https:\/\//.test(n.resolved || '')) finding('source', 'Only exact HTTPS registry artifacts are supported');
    if (!/^sha(512|384|256)-[A-Za-z0-9+/]+=*(?:\s|$)/.test(n.integrity || '')) finding('integrity', 'Missing strong integrity metadata');
    if (p.deniedPackages.includes(n.name) || p.deniedPackages.includes(`${n.name}@${n.version}`)) finding('denied-package', 'Package is explicitly denied by project policy');
    if (!m) warnings.push('Registry metadata unavailable');
    else {
      if (m.name !== n.name || m.version !== n.version || m.dist?.integrity !== n.integrity || m.dist?.tarball !== n.resolved) finding('metadata-mismatch', 'Registry identity, artifact or integrity differs from resolved lockfile');
      else evidence.push('Registry identity and integrity match the lockfile');
      const license = typeof m.license === 'string' ? m.license : m.license?.type;
      if (p.checkLicenses && (!license || !/^[A-Za-z0-9.+-]+$/.test(license))) warnings.push('License missing or SPDX expression requires manual review');
      if (p.checkLicenses && p.deniedLicenses.some(x => (license || '').split(/[^A-Za-z0-9.+-]+/).includes(x))) finding('license', `Prohibited license: ${license}`);
      if (m.deprecated) warnings.push(`Deprecated: ${m.deprecated}`);
      if (['preinstall', 'install', 'postinstall', 'prepare'].some(k => m.scripts?.[k]) || n.hasInstallScript) warnings.push('Lifecycle scripts are suppressed');
      if (m.dist?.attestations) warnings.push('Provenance advertised but not cryptographically verified');
      if (p.checkMaintenance && !(m.maintainers?.length && m.repository)) warnings.push('Maintenance identity or repository evidence missing');
    }
    const advisory = audit?.vulnerabilities?.[n.name];
    if (advisory && (!Array.isArray(advisory.nodes) || advisory.nodes.includes(n.location))) {
      evidence.push({ advisory });
      if ((advisory.severity === 'critical' && p.blockCriticalVulnerabilities) || (advisory.severity === 'high' && p.blockHighVulnerabilities)) finding('vulnerability', advisory);
      if (p.blockMaliciousPackages && (advisory.via || []).some(v => typeof v === 'object' && /malware|malicious/i.test(v.title || ''))) finding('malicious-advisory', advisory);
    }
    if (!audit) warnings.push('Advisory service unavailable or audit disabled');
    // Registry claims alone cannot establish Trusted status. Tier 1 is deliberately not issued.
    const tier = m && audit && evidence.length && !warnings.some(w => /unavailable|missing|manual review|Deprecated/.test(w)) ? 2 : 3;
    if (tier > p.minimumTier && !(tier === 3 && p.allowUnverified && p.minimumTier === 2)) finding('minimum-tier', `Tier ${tier} falls below required Tier ${p.minimumTier}`);
    if (p.failOnUnknownSecurityStatus && (!m || !audit)) finding('unknown-security-status', 'Required registry or advisory evidence unavailable');
    // A package the project already had: advisories, tier and license findings are reported but do not block this installation.
    let existingFindings = [];
    if (judged && !judged.has(n.location)) {
      existingFindings = violations.filter(v => !scope.ALWAYS_BLOCKING.has(v.code));
      for (let i = violations.length - 1; i >= 0; i--) if (existingFindings.includes(violations[i])) violations.splice(i, 1);
      for (const v of existingFindings) warnings.push(`Already in your project, not blocking this install: ${v.code}: ${typeof v.detail === 'string' ? v.detail : (v.detail && v.detail.severity ? `${v.detail.severity} advisory` : JSON.stringify(v.detail).slice(0, 120))}`);
    }
    return { ...n, tier: violations.length ? 'blocked' : tier, classification: violations.length ? 'Blocked' : tier === 2 ? 'Established' : 'Unverified', metadata: m || null, evidence, warnings, violations, ...(judged && !judged.has(n.location) ? { existing: true, existingFindings: existingFindings.map(v => v.code) } : {}) };
  });
  return { schemaVersion: 1, createdAt: new Date().toISOString(), policy: p, packages, allowed: packages.every(n => !n.violations.length), limitations: ['No complete malware detection or source-code review', 'Provenance is unverified; Trusted is never assigned', 'Suspicious dependency changes require comparison and manual review', 'Optional packages not installed on this platform remain in the reviewed lock graph'] };
}
function render(report) {
  return `${report.status === 'cancelled' ? 'DISALLOWED' : report.allowed ? 'APPROVED' : 'BLOCKED'} — Kreft package security\n` + report.packages.map(n => `${n.name}@${n.version} [${n.location}] ${n.classification}\n` + n.violations.map(v => `  BLOCK ${v.code}: ${typeof v.detail === 'string' ? v.detail : JSON.stringify(v.detail)}`).join('\n') + '\n' + n.warnings.map(w => `  WARNING ${w}`).join('\n')).join('\n') + '\n' + report.limitations.join('\n') + '\n';
}
// The report for people: a summary, the blocked packages, and the warnings grouped by reason. Every package, one by one, is in the
// report file (.kreft/security/latest.txt) and in the terminal with --verbose. `reportFile` is the path to mention, or null.
function renderCompact(report, reportFile = null) {
  const pkgs = report.packages || [];
  const status = report.status === 'cancelled' ? 'DISALLOWED' : report.allowed ? 'APPROVED' : 'BLOCKED';
  const lines = [`${status} — Kreft package security`];
  const counts = {};
  for (const n of pkgs) counts[n.classification] = (counts[n.classification] || 0) + 1;
  const order = ['Trusted', 'Established', 'Unverified', 'Blocked'];
  const summary = order.filter(k => counts[k]).map(k => `${counts[k]} ${k}`).join(', ');
  lines.push(`Reviewed ${pkgs.length} package${pkgs.length === 1 ? '' : 's'}${summary ? `: ${summary}` : ''}.`);
  const asked = (report.requested || []).map(r => {
    const node = pkgs.find(n => n.location === `node_modules/${r.name}`);
    return node ? `${node.name}@${node.version} (${node.classification})` : r.name;
  });
  if (asked.length) lines.push(`Requested: ${asked.join(', ')}`);
  const blocked = pkgs.filter(n => n.violations.length);
  if (blocked.length) {
    lines.push(`Blocked (${blocked.length}):`);
    for (const n of blocked.slice(0, 20)) {
      for (const v of n.violations) {
        const detail = typeof v.detail === 'string' ? v.detail : JSON.stringify(v.detail);
        lines.push(`  ${n.name}@${n.version}  ${v.code}: ${detail.length > 200 ? detail.slice(0, 199) + '…' : detail}`);
      }
    }
    if (blocked.length > 20) lines.push(`  …and ${blocked.length - 20} more`);
  }
  const grouped = new Map();
  for (const n of pkgs) for (const w of new Set(n.warnings)) grouped.set(w, (grouped.get(w) || 0) + 1);
  if (grouped.size) {
    lines.push('Warnings:');
    for (const [w, count] of [...grouped].sort((a, b) => b[1] - a[1]).slice(0, 8)) lines.push(`  ${w} (${count} package${count === 1 ? '' : 's'})`);
    if (grouped.size > 8) lines.push(`  …and ${grouped.size - 8} more kinds`);
  }
  lines.push(reportFile ? `Every package, one by one: ${reportFile}   (or run again with --verbose)` : 'Every package, one by one: run again with --verbose');
  return lines.join('\n') + '\n' + (report.limitations || []).join('\n') + '\n';
}
function renderStatus(report) {
  const lines = ['  Package Security Assessment Report:', '  ' + '─'.repeat(60), ...(report.requested || []).map(r => {
    const node = (report.packages || []).find(n => n.location === `node_modules/${r.name}`);
    const tier = node?.classification === 'Established' ? '  [TIER 2: ESTABLISHED COMMUNITY]'
      : node?.classification === 'Unverified' ? '  [TIER 3: UNVERIFIED]' : '';
    return `  • ${node ? node.name + '@' + node.version : r.name}: ${node?.classification || 'Unknown'}${tier}`;
  }), '  ' + '─'.repeat(60)];
  if (report.status === 'blocked') {
    const direct = (report.requested || []).some(r => report.packages.some(n => n.location === `node_modules/${r.name}` && n.violations.length));
    lines.push(direct ? 'Installation blocked by package security policy.' : 'Installation blocked by project dependency security policy.');
    // why: the packages that blocked it, with the rule (the full list is in the report and with --verbose)
    const why = report.packages.filter(n => n.violations.length);
    for (const n of why.slice(0, 5)) for (const v of n.violations.slice(0, 1)) {
      const detail = typeof v.detail === 'string' ? v.detail : (v.detail && v.detail.severity ? `${v.detail.severity} advisory` : JSON.stringify(v.detail));
      lines.push(`  ✖ ${n.name}@${n.version}  ${v.code}: ${detail.length > 110 ? detail.slice(0, 109) + '…' : detail}`);
    }
    if (why.length > 5) lines.push(`  …and ${why.length - 5} more blocked (run again with --verbose)`);
  }
  if (report.existingWithFindings) lines.push(`Note: ${report.existingWithFindings} package${report.existingWithFindings === 1 ? '' : 's'} already in your project ${report.existingWithFindings === 1 ? 'has' : 'have'} security findings. ${report.existingWithFindings === 1 ? 'It does' : 'They do'} not block this install. Run with --verbose to see ${report.existingWithFindings === 1 ? 'it' : 'them'}.`);
  if (report.status === 'installed' && report.skippedScripts && report.skippedScripts.length) lines.push(`Install scripts were not run (by design) for: ${report.skippedScripts.slice(0, 6).join(', ')}${report.skippedScripts.length > 6 ? ', …' : ''}. If one of them does not work, review it and run:  npm rebuild <name>`);
  if (report.status === 'installed') lines.push('Installed successfully.');
  if (report.status === 'cancelled') lines.push('Installation cancelled.');
  if (report.error) lines.push(`Installation failed: ${report.error}`);
  return lines.join('\n') + '\n';
}
// inside the project by name AND by where it really is: the nearest existing folder is resolved through links
function insideProject(project, target) {
  const real = (p) => { let cur = p; const rest = []; while (!fs.existsSync(cur)) { rest.unshift(path.basename(cur)); const up = path.dirname(cur); if (up === cur) break; cur = up; } return path.join(fs.realpathSync(cur), ...rest); };
  const base = real(project);
  const t = real(target);
  return t.startsWith(base + path.sep);
}
async function install(targets, options = {}, injected = {}) {
  const progress = message => { if (options.progress) options.progress(message); };
  progress(`Kreft: checking npm packages: ${targets.join(', ')}...`);
  const project = path.resolve(options.project || '.');
  const p = policy(require('../kreftjs-config.js').readConfig(project).security);
  if (p.reports.enabled && !insideProject(project, path.resolve(project, p.reports.directory))) throw Error('security.reports.directory must be inside the project (a link that leads outside it does not count)');
  const manifestPath = path.join(project, 'package.json');
  const original = fs.readFileSync(manifestPath);
  const manifest = JSON.parse(original);
  if (manifest.workspaces || fs.existsSync(path.join(project, 'npm-shrinkwrap.json')) || ['yarn.lock', 'pnpm-lock.yaml'].some(f => fs.existsSync(path.join(project, f))) || manifest.packageManager && !manifest.packageManager.startsWith('npm@')) throw Error('Secure installation currently requires a standalone npm project with package-lock.json; other package managers, workspaces and shrinkwrap are unsupported');
  const requested = targets.map(spec);
  // A sibling staging directory permits atomic rename even when the project is on another volume.
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const [name, version] of Object.entries(manifest[section] || {})) spec(`${name}@${version}`);
  }
  if (manifest.overrides) throw Error('npm overrides require manual review and are currently unsupported');
  // Staging folders left by an earlier run that was interrupted (Ctrl+C, a closed terminal, a crash) are only copies of package.json and
  // the lockfile. Those older than an hour cannot belong to a run that is still going, so they are removed.
  try {
    for (const name of fs.readdirSync(project)) {
      const isStage = /^\.kreft-security-stage-/.test(name), isBackup = /^\.kreft-node-modules-/.test(name);
      if (!isStage && !isBackup) continue;
      const old = path.join(project, name);
      const info = fs.lstatSync(old);   // only real folders (never a file or a link) that Kreft made
      if (!info.isDirectory()) continue;
      // the old node_modules kept while the new one was moved in: if the move was cut off and the project has none, it comes back
      if (isBackup) {   // a backup of a run that is still going (another terminal) is not ours to touch
        const pid = Number((name.match(/^\.kreft-node-modules-(\d+)-/) || [])[1]);
        let alive = false; try { if (pid) { process.kill(pid, 0); alive = pid !== process.pid; } } catch (e) { alive = e.code === 'EPERM'; }
        if (alive) continue;
      }
      if (isBackup && !fs.existsSync(path.join(project, 'node_modules'))) { fs.renameSync(old, path.join(project, 'node_modules')); continue; }
      if (Date.now() - info.mtimeMs > 3600 * 1000) fs.rmSync(old, { recursive: true, force: true });
    }
  } catch (_) { /* a folder that cannot be read or removed is left alone */ }
  const stage = fs.mkdtempSync(path.join(project, '.kreft-security-stage-'));
  // If the process is stopped (Ctrl+C, closing the terminal) the staging folder goes with it, so a cancelled check leaves nothing behind.
  // Not while the reviewed packages are being moved into place: stopping halfway there could lose the new tree, so that short step finishes.
  let promoting = false;
  const onSignal = (signal) => { if (promoting) return; try { fs.rmSync(stage, { recursive: true, force: true }); } catch (_) { /* gone already */ } process.exit(signal === 'SIGINT' ? 130 : 143); };
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  const handlers = signals.map((s) => [s, () => onSignal(s)]);
  for (const [s, h] of handlers) process.on(s, h);
  const lockPath = path.join(project, 'package-lock.json');
  const previousLock = fs.existsSync(lockPath) ? fs.readFileSync(lockPath) : null;
  const npm = (args, tolerate = false) => {
    const r = (injected.run || runSync)('npm', [args[0], '--ignore-scripts', '--fund=false', '--fetch-retries=2', '--fetch-timeout=20000', ...args.slice(1)], { cwd: stage, encoding: 'utf8', timeout: 180000, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, npm_config_ignore_scripts: 'true', npm_config_audit: 'false', npm_config_package_lock: 'true' } });
    if (r.error || r.signal || r.status !== 0 && !tolerate) throw Error(`npm ${args[0]} failed: ${r.error?.message || r.stderr || 'nonzero exit'}`);
    return r;
  };
  let report;
  let prompted = false;
  try {
    write(path.join(stage, 'package.json'), manifest);
    if (previousLock) {
      for (const n of nodes(JSON.parse(previousLock))) if (n.link || !/^https:\/\//.test(n.resolved || '')) throw Error(`Unsupported existing lockfile source: ${n.location}`);
      fs.writeFileSync(path.join(stage, 'package-lock.json'), previousLock);
    }
    const npmrc = path.join(project, '.npmrc');
    if (fs.existsSync(npmrc)) fs.copyFileSync(npmrc, path.join(stage, '.npmrc'));
    progress('Resolving exact versions and dependency graph (scripts disabled)...');
    npm(['install', '--package-lock-only', '--save-exact', '--audit=false', ...(options.dev ? ['--save-dev'] : []), '--', ...requested.map(x => x.raw)]);
    let lock = read(path.join(stage, 'package-lock.json'));
    const graph = nodes(lock);
    // Reject unsafe sources before invoking metadata lookups or fetching any package bodies.
    for (const n of graph) if (n.link || !/^https:\/\//.test(n.resolved || '')) throw Error(`Unsupported dependency source: ${n.location}`);
    const { inspectMetadata, viewPackage } = require('./metadata.js');
    const metadata = await inspectMetadata(graph, {
      progress,
      fetch: injected.view || (injected.run
        ? key => JSON.parse(npm(['view', key, '--json']).stdout)
        : key => viewPackage(key, stage))
    });
    let audit = null;
    if (p.auditOnInstall) {
      progress('Checking npm security advisories and project policy...');
      try { const r = npm(['audit', '--json', '--package-lock-only'], true); const a = JSON.parse(r.stdout); if (!a.error && a.auditReportVersion === 2 && a.vulnerabilities && (r.status === 0 || r.status === 1)) audit = a; } catch (_) { /* missing evidence is enforced by policy */ }
    }
    // Judge what is being installed: the requested packages and the new packages they bring. What the project already had is only reported.
    const judged = scope.judgedLocations(lock, { requested: requested.map(r => r.name), manifest, previousLock: previousLock ? JSON.parse(previousLock) : null });
    report = evaluate(lock, metadata, audit, p, judged);
    report.judgedCount = judged.size;
    const existingWithFindings = report.packages.filter(n => n.existing && n.existingFindings && n.existingFindings.length).length;
    report.existingWithFindings = existingWithFindings;
    if (existingWithFindings) progress(`${existingWithFindings} package${existingWithFindings === 1 ? '' : 's'} already in your project ${existingWithFindings === 1 ? 'has' : 'have'} security findings. ${existingWithFindings === 1 ? 'It does' : 'They do'} not block this install (only ${judged.size} new package${judged.size === 1 ? '' : 's'} ${judged.size === 1 ? 'is' : 'are'} judged); see --verbose or the report.`);
    report.requested = requested;
    report.status = report.allowed ? 'approved' : 'blocked';
    progress(report.allowed ? 'Security check complete: project policy passed.' : 'Security check complete: installation blocked by project policy.');
    if (!report.allowed || options.dryRun) return report;
    if (options.confirm) {
      // A package the developer allowed for good skips the question. The review above already passed (a blocked package never
      // gets here), so an allowed package is still fully checked: the list only saves the typing.
      const pre = rules.preapproved(p, report);
      if (pre) {
        report.decision = 'allow';
        report.decisionSource = 'allowedPackages';
        progress(`Allowed by security.allowedPackages in your project settings: ${pre.join(', ')}. The security checks above passed.`);
      } else {
        prompted = true;
        const accepted = await options.confirm(report);
        const allow = accepted === true || accepted === 'always';
        report.decision = allow ? 'allow' : 'disallow';
        report.decisionSource = 'prompt';
        if (accepted === 'always' || accepted === 'never') {
          // remember the choice in kreftjs.config.json; if that cannot be written, the choice still counts for this run
          try {
            report.remembered = rules.remember(project, report, accepted === 'always' ? 'allow' : 'deny');
            progress(`${accepted === 'always' ? 'Always allowed' : 'Never allowed'}: ${report.remembered.entries.join(', ')} saved in ${path.relative(project, report.remembered.file) || report.remembered.file}.`);
          } catch (e) {
            progress(`Could not save your choice (${e.message}). It applies to this installation only.`);
          }
        }
        if (!allow) {
          report.policyAllowed = true;
          report.allowed = false;
          report.status = 'cancelled';
          return report;
        }
      }
    }
    // npm ci checks the approved integrity values as it downloads and extracts, with no lifecycle execution.
    progress('Installing approved packages and verifying integrity (scripts disabled)...');
    npm(['ci', '--audit=false', '--include=dev', '--include=optional', '--include=peer']);
    if (JSON.stringify(read(path.join(stage, 'package-lock.json'))) !== JSON.stringify(lock)) throw Error('Approved dependency graph changed during installation');
    const hidden = read(path.join(stage, 'node_modules', '.package-lock.json'));
    for (const [location, node] of Object.entries(hidden.packages || {})) {
      const approved = lock.packages[location];
      if (!approved || node.version !== approved.version || node.integrity !== approved.integrity || node.resolved !== approved.resolved) throw Error(`Installed dependency differs from approval: ${location}`);
      const installed = read(path.join(stage, location, 'package.json'));
      if (installed.version !== approved.version || installed.name !== (approved.name || location.split('node_modules/').pop())) throw Error(`Installed package identity mismatch: ${location}`);
    }
    for (const n of graph) {
      if (!n.optional && !n.devOptional && !hidden.packages?.[n.location]) throw Error(`Required approved package missing after installation: ${n.location}`);
    }
    // scripts were not run (that is the point of the check): say which packages have one, so a package that needs it is not a surprise
    report.skippedScripts = graph.filter(n => n.hasInstallScript && hidden.packages?.[n.location]).map(n => `${n.name}@${n.version}`);
    report.omittedOptionalPackages = graph.filter(n => !hidden.packages?.[n.location]).map(n => n.location);
    for (const r of requested) {
      const n = lock.packages[`node_modules/${r.name}`];
      if (!n) throw Error(`Requested package missing from approved graph: ${r.name}`);
      const stagedManifest = read(path.join(stage, 'package.json'));
      const section = options.dev ? 'devDependencies' : 'dependencies';
      if (stagedManifest[section]?.[r.name] !== n.version) throw Error(`Requested dependency is not pinned exactly: ${r.name}`);
    }
    if (!fs.readFileSync(manifestPath).equals(original) || (previousLock ? !fs.existsSync(lockPath) || !fs.readFileSync(lockPath).equals(previousLock) : fs.existsSync(lockPath))) throw Error('Project manifest or lockfile changed during security review; retry');
    const modules = path.join(project, 'node_modules');
    const backup = path.join(project, `.kreft-node-modules-${process.pid}-${Date.now()}`);
    let moved = false, promoted = false;
    promoting = true;
    try {
      if (fs.existsSync(modules)) { fs.renameSync(modules, backup); moved = true; }
      fs.renameSync(path.join(stage, 'node_modules'), modules); promoted = true;
      fs.copyFileSync(path.join(stage, 'package.json'), manifestPath);
      fs.copyFileSync(path.join(stage, 'package-lock.json'), lockPath);
    } catch (e) {
      fs.writeFileSync(manifestPath, original);
      if (previousLock) fs.writeFileSync(lockPath, previousLock); else fs.rmSync(lockPath, { force: true });
      if (promoted) fs.rmSync(modules, { recursive: true, force: true });
      if (moved) fs.renameSync(backup, modules);
      throw e;
    }
    if (moved) fs.rmSync(backup, { recursive: true, force: true });
    report.status = 'installed';
    progress(`Installed successfully: ${requested.map(r => r.name).join(', ')}`);
    return report;
  } catch (e) {
    if (report) { report.allowed = false; report.status = 'failed'; report.error = e.message; }
    else report = { schemaVersion: 1, allowed: false, status: 'failed', packages: [], limitations: [], error: e.message };
    throw e;
  } finally {
    for (const [s, h] of handlers) process.removeListener(s, h);
    fs.rmSync(stage, { recursive: true, force: true });
    if (report) {
      // The developer said No: nothing is written to the project, not even the report. (A blocked package, a dry run and an
      // installation do write it: it explains the result or records what was installed.)
      const writeReport = p.reports.enabled && report.status !== 'cancelled';
      if (writeReport) {
        const directory = path.resolve(project, p.reports.directory);
        if (!insideProject(project, directory)) throw Error('security.reports.directory must be inside the project (a link that leads outside it does not count)');
        fs.mkdirSync(directory, { recursive: true });
        if (p.reports.format.includes('json')) write(path.join(directory, 'latest.json'), report);
        if (p.reports.format.includes('text')) fs.writeFileSync(path.join(directory, 'latest.txt'), render(report) + (report.error || ''));
      }
      if (!options.json) console.log(require('./colors.js').colorReport(options.verbose ? render(report) : prompted && report.status === 'cancelled' ? '' : prompted && report.status === 'installed' ? renderStatus({ status: 'installed', skippedScripts: report.skippedScripts, requested: [], packages: [] }) : renderStatus(report)));
      else console.log(JSON.stringify(report));
    }
  }
}
module.exports = { install, evaluate, spec, nodes, render, renderCompact, renderStatus };
