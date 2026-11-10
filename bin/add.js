'use strict';
const { layout } = require('./layout.js');
const readline = require('readline');
function promptConfirm(question) {
  if (!process.stdin.isTTY) return Promise.resolve(false);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question + ' [y/N] ', answer => { rl.close(); resolve(/^y(es)?$/i.test(answer.trim())); }));
}
module.exports = async function add(args = []) {
  try {
    const targets = [];
    const options = {};
    let targetDir = '.', force = false, install = true;
    const ops = { allow: [], deny: [], forget: [] };
    let listRules = false;
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (['--help', '-h'].includes(a)) {
        console.log(`kreft install <packages...> (aliases: add, i)
  --dev, -D             Save exact dev dependencies
  --check, --dry-run    Resolve and report without changing dependencies
  --json                Machine-readable report
  --verbose             Show every package as it is checked (default: one line that updates, and a summary)
  --dir <directory>     Project directory
  --yes, -y             Allow installation after checks (required in CI)
  --force, -f           Desktop configuration replacement only
  --no-install          Desktop scaffolding only
Package rules (remembered decisions; these edit kreftjs.config.json and install nothing):
  --allow-package <p>   Allow a package for good: no Allow / Disallow question next time (lodash or lodash@4.17.21)
  --deny-package <p>    Disallow a package for good: it is blocked
  --forget-package <p>  Remove the rule for a package
  --packages            List the allowed and denied packages
  At the question you can also answer [r] Always allow or [n] Never allow to save the rule.
  A rule never overrides a security finding: a package that fails the review stays blocked.
  kreft add electron tauri  Set up desktop runtimes
Security policy: security in kreftjs.config.json. Scripts stay disabled.
Aliases, URLs, workspaces and non-npm lockfiles fail explicitly.
Reports: .kreft/security/latest.json and latest.txt`);
        return;
      }
      if (['-D', '--dev', '--save-dev'].includes(a)) options.dev = true;
      else if (['--check', '--dry-run'].includes(a)) options.dryRun = true;
      else if (a === '--json') options.json = true;
      else if (a === '--verbose') options.verbose = true;
      else if (['--force', '-f'].includes(a)) force = true;
      else if (['--yes', '-y'].includes(a)) options.yes = true;
      else if (a === '--no-install') install = false;
      else if (a === '--packages') listRules = true;
      else if (['--allow-package', '--deny-package', '--forget-package'].some(f => a === f || a.startsWith(f + '='))) {
        const flag = a.split('=')[0];
        const value = a.includes('=') ? a.slice(flag.length + 1) : args[++i];
        if (!value || value.startsWith('-')) throw Error(`${flag} needs a package, like lodash or lodash@4.17.21`);
        ops[{ '--allow-package': 'allow', '--deny-package': 'deny', '--forget-package': 'forget' }[flag]].push(value);
      }
      else if (a.startsWith('--dir=')) targetDir = a.slice(6);
      else if (a === '--dir') { targetDir = args[++i]; if (!targetDir || targetDir.startsWith('-')) throw Error('--dir requires a directory'); }
      else if (a.startsWith('-')) throw Error(`Unsupported option ${a}; mandatory policy cannot be bypassed. See kreft install --help`);
      else targets.push(a);
    }
    if (listRules || ops.allow.length || ops.deny.length || ops.forget.length) {
      if (targets.length) throw Error('Edit package rules and install packages as separate commands');
      const rules = require('./security/rules.js');
      const project = layout(targetDir).project;
      const edited = ops.allow.length || ops.deny.length || ops.forget.length ? rules.editRules(project, ops) : null;
      const now = edited || rules.listRules(project);
      if (options.json) { console.log(JSON.stringify({ file: now.file || null, allowed: now.allowed, denied: now.denied, notes: edited ? edited.notes : [] })); return; }
      const rel = now.file ? require('path').relative(process.cwd(), now.file) || now.file : null;
      if (edited) console.log(`Updated ${rel}`);
      else console.log(rel ? `Package rules in ${rel}:` : 'No package rules yet (no kreftjs.config.json).');
      console.log(`  allowed: ${now.allowed.length ? now.allowed.join(', ') : '(none)'}`);
      console.log(`  denied:  ${now.denied.length ? now.denied.join(', ') : '(none)'}`);
      for (const n of (edited ? edited.notes : [])) console.log(`  note: ${n}`);
      if (edited) console.log('A rule never overrides a security finding: an allowed package that fails the review is still blocked.');
      return;
    }
    const desktopRuntimes = ['electron', 'tauri'].filter(r => targets.includes(r));
    if (desktopRuntimes.length && !options.dryRun) {
      if (targets.length !== desktopRuntimes.length) throw Error('Run desktop setup and registry package installation as separate commands');
      await require('./desktop/add.js').addRuntimes(desktopRuntimes, { dir: targetDir, force, install, confirm: promptConfirm });
      return;
    }
    if (!targets.length) throw Error('Supply at least one package; see kreft install --help');
    if (!install) throw Error('--no-install is for desktop scaffolding; use --check for package review');
    const report = await require('./security/install.js').install(targets, { ...options, confirm: options.yes ? undefined : report => require('./security/confirm.js').confirmPackage(report, { output: options.json ? process.stderr : process.stdout, verbose: options.verbose }),
      progress: options.verbose ? require('./security/progress.js').makeProgress({ verbose: true, plain: options.json, color: true }) : undefined, project: layout(targetDir).project });
    if (!report.allowed) process.exitCode = 1;
    return report;
  } catch (error) {
    console.error(require('./security/colors.js').colors(process.stderr).red(`Kreft package installation failed: ${error.message}`));
    process.exitCode = 1;
  }
};
