/*
 * kreft update [packages...]
 *
 * Updates npm dependencies and/or Kreft runtime files in the current project:
 *
 *   kreft update                 Update all packages (npm update) and refresh kreft.js / kreft.d.ts
 *   kreft update <package...>    Update specific npm package(s)
 *   kreft update --latest        Upgrade dependencies to their latest versions
 *   kreft update --check         Check for outdated packages without installing (npm outdated)
 *   kreft update --core          Update only Kreft runtime files (kreft.js, kreft.d.ts, server.d.ts)
 *   kreft update --npm           Update only npm packages
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { layout } = require('./layout.js');
const pkg = require('../package.json');

const green = (s) => (process.stdout.isTTY ? `\x1b[32m${s}\x1b[0m` : s);
const cyan = (s) => (process.stdout.isTTY ? `\x1b[36m${s}\x1b[0m` : s);
const dim = (s) => (process.stdout.isTTY ? `\x1b[2m${s}\x1b[0m` : s);
const bold = (s) => (process.stdout.isTTY ? `\x1b[1m${s}\x1b[0m` : s);
const red = (s) => (process.stdout.isTTY ? `\x1b[31m${s}\x1b[0m` : s);

module.exports = function update(args = []) {
  const flags = new Set();
  const pkgs = [];
  let targetDir = '.';

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--latest' || a === '-L') flags.add('latest');
    else if (a === '--check' || a === '--dry-run') flags.add('check');
    else if (a === '--core' || a === '--kreft' || a === '--som') flags.add('core'); // --som: the Som.js name
    else if (a === '--npm') flags.add('npm');
    else if (a === '--help' || a === '-h') {
      printHelp();
      return;
    } else if (a.startsWith('--dir=')) {
      targetDir = a.slice(6);
    } else if (a === '--dir') {
      targetDir = args[++i] || '.';
    } else if (!a.startsWith('-')) {
      pkgs.push(a);
    }
  }

  const lay = layout(targetDir);
  const project = lay.project || path.resolve(targetDir);
  const onlyCore = flags.has('core');
  const onlyNpm = flags.has('npm');

  console.log(`\n  ${bold('Kreft ' + pkg.version)} ${dim('— updating packages and runtime')}\n`);

  // 1. Update Kreft runtime files (kreft.js, kreft.d.ts, server.d.ts) unless --npm was requested
  if (!onlyNpm) {
    updateRuntimeFiles(lay, project);
  }

  // 2. Update npm dependencies unless --core was requested
  if (!onlyCore) {
    updateNpmPackages(project, pkgs, flags);
  }

  console.log(`\n  ${green('✓')} All updates completed.\n`);
};

function updateRuntimeFiles(lay, project) {
  const rootPkgDir = path.join(__dirname, '..');
  const sourceKreftJs = path.join(rootPkgDir, 'kreft.js');
  const sourceKreftDts = path.join(rootPkgDir, 'kreft.d.ts');
  const sourceServerDts = path.join(rootPkgDir, 'server.d.ts');

  const targets = [];

  // Check frontend / local kreft.js
  // a project made with Som.js has som.js / som.d.ts: those files keep their names (index.html loads them) but get the new code
  const named = (dir, name, legacy) => (!fs.existsSync(path.join(dir, name)) && fs.existsSync(path.join(dir, legacy)) ? legacy : name);
  const frontKreftJs = path.join(lay.frontend, named(lay.frontend, 'kreft.js', 'som.js'));
  const rootKreftJs = path.join(project, named(project, 'kreft.js', 'som.js'));
  if (fs.existsSync(frontKreftJs) && frontKreftJs !== sourceKreftJs) targets.push({ src: sourceKreftJs, dest: frontKreftJs, label: 'frontend/' + path.basename(frontKreftJs) });
  else if (fs.existsSync(rootKreftJs) && rootKreftJs !== sourceKreftJs) targets.push({ src: sourceKreftJs, dest: rootKreftJs, label: path.basename(rootKreftJs) });

  // Check frontend / local kreft.d.ts
  const frontKreftDts = path.join(lay.frontend, named(lay.frontend, 'kreft.d.ts', 'som.d.ts'));
  const rootKreftDts = path.join(project, named(project, 'kreft.d.ts', 'som.d.ts'));
  if (fs.existsSync(frontKreftDts) && frontKreftDts !== sourceKreftDts) targets.push({ src: sourceKreftDts, dest: frontKreftDts, label: 'frontend/' + path.basename(frontKreftDts) });
  else if (fs.existsSync(rootKreftDts) && rootKreftDts !== sourceKreftDts) targets.push({ src: sourceKreftDts, dest: rootKreftDts, label: path.basename(rootKreftDts) });

  // Check backend server.d.ts
  const backServerDts = path.join(lay.backend, 'server.d.ts');
  const rootServerDts = path.join(project, 'server.d.ts');
  if (fs.existsSync(backServerDts) && backServerDts !== sourceServerDts) targets.push({ src: sourceServerDts, dest: backServerDts, label: 'backend/server.d.ts' });
  else if (fs.existsSync(rootServerDts) && rootServerDts !== sourceServerDts) targets.push({ src: sourceServerDts, dest: rootServerDts, label: 'server.d.ts' });

  // Check tools/vite-plugin-kreft.js
  const localVitePlugin = path.join(project, 'tools', 'vite-plugin-kreft.js');
  const sourceVitePlugin = path.join(rootPkgDir, 'tools', 'vite-plugin-kreft.js');
  if (fs.existsSync(localVitePlugin) && localVitePlugin !== sourceVitePlugin) {
    targets.push({ src: sourceVitePlugin, dest: localVitePlugin, label: 'tools/vite-plugin-kreft.js' });
  }

  const localViteDts = path.join(project, 'tools', 'vite-plugin-kreft.d.ts');
  const sourceViteDts = path.join(rootPkgDir, 'tools', 'vite-plugin-kreft.d.ts');
  if (fs.existsSync(localViteDts) && localViteDts !== sourceViteDts) {
    targets.push({ src: sourceViteDts, dest: localViteDts, label: 'tools/vite-plugin-kreft.d.ts' });
  }

  if (targets.length) {
    console.log(`  ${cyan('Runtime files:')}`);
    for (const t of targets) {
      try {
        if (fs.existsSync(t.dest)) {
          const srcContent = fs.readFileSync(t.src);
          const destContent = fs.readFileSync(t.dest);
          if (srcContent.equals(destContent)) {
            console.log(`    ${dim('SKIP')}  ${t.label} ${dim('(already up to date)')}`);
            continue;
          }
          // Back up existing file to prevent user custom code loss
          const backupPath = t.dest + '.bak';
          fs.copyFileSync(t.dest, backupPath);
        }
        fs.copyFileSync(t.src, t.dest);
        console.log(`    ${green('DONE')}  ${t.label} ${dim('(updated to v' + pkg.version + ', backup saved)')}`);
      } catch (err) {
        console.error(`    ${red('FAIL')}  ${t.label}: ${err.message}`);
      }
    }
    console.log('');
  }

  upgradeAppLayout(lay);
}

function upgradeAppLayout(lay) {
  let layoutFile = path.join(lay.frontend, 'layouts', 'app.kreft');
  if (!fs.existsSync(layoutFile)) layoutFile = path.join(lay.frontend, 'layouts', 'app.som'); // Som.js project
  if (!fs.existsSync(layoutFile)) return;
  let text = fs.readFileSync(layoutFile, 'utf8');
  let changed = false;

  const linkReplacements = [
    [/to:\s*['"]\/['"](?=[\s\S]*?label:\s*['"]Dashboard['"])/, "to: 'dashboard'"],
    [/to:\s*['"]\/users['"]/, "to: 'users'"],
    [/to:\s*['"]\/profile['"]/, "to: 'profile'"],
    [/to:\s*['"]\/welcome['"]/, "to: 'welcome'"],
    [/to:\s*['"]\/docs['"]/, "to: 'docs'"],
    [/to:\s*['"]\/tests['"]/, "to: 'tests.index'"],
    [/<kreft-link to=['"]\/['"] class=['"]sidebar-brand['"]>/, '<kreft-link to="dashboard" class="sidebar-brand">'],
    [/<kreft-link to=['"]\/profile['"] role=['"]menuitem['"]/, '<kreft-link to="profile" role="menuitem"'],
    [/<path d=\{icons\[link\.icon\]\}><\/path>/, '<path d={icons[link.icon] || icons.panel}></path>'],
  ];

  for (const [pattern, repl] of linkReplacements) {
    if (pattern.test(text)) {
      text = text.replace(pattern, repl);
      changed = true;
    }
  }

  if (changed) {
    try {
      fs.writeFileSync(layoutFile, text);
      console.log(`    ${green('DONE')}  frontend/layouts/app.kreft ${dim('(upgraded sidebar navigation to route names)')}`);
    } catch (err) {
      console.error(`    ${red('FAIL')}  frontend/layouts/app.kreft: ${err.message}`);
    }
  }
}

function updateNpmPackages(project, pkgs, flags) {
  const pkgJsonPath = path.join(project, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) {
    console.log(`  ${dim('No package.json found in ' + project + ' — skipping npm update.')}`);
    return;
  }

  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

  if (flags.has('check')) {
    console.log(`  ${cyan('Checking for outdated packages (npm outdated):')}\n`);
    const res = spawnSync(npmCmd, ['outdated'], { stdio: 'inherit', cwd: project });
    if (res.status === 0) {
      console.log(`  ${green('All packages are up to date.')}`);
    }
    return;
  }

  const isLatest = flags.has('latest');
  let cmdArgs = [];

  if (pkgs.length > 0) {
    if (isLatest) {
      cmdArgs = ['install', ...pkgs.map((p) => (p.includes('@') ? p : `${p}@latest`))];
      console.log(`  ${cyan('Upgrading packages to latest:')} ${pkgs.join(', ')}`);
    } else {
      cmdArgs = ['update', ...pkgs];
      console.log(`  ${cyan('Updating packages:')} ${pkgs.join(', ')}`);
    }
  } else {
    if (isLatest) {
      // If --latest specified without pkgs, run npm update or inspect package.json
      cmdArgs = ['update'];
      console.log(`  ${cyan('Updating all packages in')} ${path.relative(process.cwd(), project) || '.'}...`);
    } else {
      cmdArgs = ['update'];
      console.log(`  ${cyan('Updating all packages in')} ${path.relative(process.cwd(), project) || '.'}...`);
    }
  }

  console.log(`  ${dim('$ ' + npmCmd + ' ' + cmdArgs.join(' '))}\n`);
  const result = spawnSync(npmCmd, cmdArgs, { stdio: 'inherit', cwd: project });

  if (result.error) {
    console.error(`  ${red('Error running npm:')} ${result.error.message}`);
    process.exitCode = 1;
  } else if (result.status !== 0) {
    console.error(`  ${red('npm exited with status')} ${result.status}`);
    process.exitCode = result.status || 1;
  } else {
    console.log(`\n  ${green('DONE')}  npm packages updated.`);
  }
}

function printHelp() {
  console.log(`
  Usage:
    kreft update [package...]     Update project packages and Kreft runtime files
    kreft update                  Update all packages in package.json and refresh kreft.js
    kreft update <name>           Update a specific package (e.g. kreft update esbuild)
    kreft update --latest         Upgrade packages to their latest versions
    kreft update --check          Check for outdated packages (npm outdated)
    kreft update --core           Update only Kreft runtime files (kreft.js, kreft.d.ts, server.d.ts)
    kreft update --npm            Update only npm dependencies
`);
}
