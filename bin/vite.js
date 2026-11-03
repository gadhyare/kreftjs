/*
 * Vite.js Bundler & Dev Server Integration for Kreft
 *
 * Commands:
 *   kreft vite:init       Add Vite configuration and dependencies to an existing project (alias: kreft make:vite)
 *   kreft vite:dev        Start ultra-fast Vite dev server with instant HMR and backend proxy (alias: kreft vite)
 *   kreft vite:build      Build optimized static frontend with Rollup and code-splitting
 *   kreft vite:preview    Preview production bundle locally using Vite
 *
 * CLI flag:
 *   kreft new my-app --vite
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

function getProjectRoot(start = process.cwd()) {
  const lay = require('./layout.js').layout(start);
  return lay.split ? lay.project : start;
}

function resolveViteBinary(root) {
  const jsCli = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  if (fs.existsSync(jsCli)) return { cmd: process.execPath, prefixArgs: [jsCli], shell: false };
  const local = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite');
  if (fs.existsSync(local)) return { cmd: local, prefixArgs: [], shell: false };
  return null;
}

function generateViteConfig({ isSplit, isTs, frontRel = 'frontend', outRel = 'dist' }) {
  const rootDir = isSplit ? `'${frontRel}'` : "'.' ";
  const outDir = isSplit ? `'../${outRel}'` : `'${outRel}'`;

  return `import { defineConfig } from 'vite';
import kreftjs from 'kreftjs/vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [kreftjs()],
  root: ${rootDir.trim()},
  build: {
    outDir: ${outDir},
    emptyOutDir: true,
  },
  server: {
    port: 8000,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
      },
    },
  },
});
`;
}

function init(args = [], opts = {}) {
  const target = typeof args === 'string' ? args : (args[0] && !args[0].startsWith('-') ? args[0] : process.cwd());
  const root = getProjectRoot(target);
  const pkgFile = path.join(root, 'package.json');
  if (!fs.existsSync(pkgFile)) {
    console.error('  No package.json found. Run this inside a Kreft project.');
    process.exit(1);
  }

  const lay = require('./layout.js').layout(root);
  const isTs = opts.ts || fs.existsSync(path.join(root, 'tsconfig.json'));
  const configName = isTs ? 'vite.config.ts' : 'vite.config.js';
  const configPath = path.join(root, configName);

  if (!fs.existsSync(configPath)) {
    const isSplit = lay.split;
    const frontRel = path.relative(root, lay.frontend) || 'frontend';
    const content = generateViteConfig({ isSplit, isTs, frontRel, outRel: 'dist' });
    fs.writeFileSync(configPath, content);
  }

  // Update package.json
  const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
  pkg.scripts = pkg.scripts || {};
  pkg.scripts['vite'] = 'kreft vite';
  pkg.scripts['vite:dev'] = 'kreft vite:dev';
  pkg.scripts['vite:build'] = 'kreft vite:build';
  pkg.scripts['vite:preview'] = 'kreft vite:preview';

  pkg.devDependencies = pkg.devDependencies || {};
  if (!pkg.devDependencies['vite']) {
    pkg.devDependencies['vite'] = '^6.2.0';
  }

  fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');

  console.log(`
  Vite configured for Kreft:
    CREATED  ${configName}
    UPDATED  package.json  (scripts: vite, vite:dev, vite:build, vite:preview)

  Next:
    npm install            (install vite)
    kreft vite:dev           (start ultra-fast Vite dev server with instant HMR)
    kreft vite:build         (build production bundle with Rollup)
`);
}

function dev(args = []) {
  const root = getProjectRoot();
  const lay = require('./layout.js').layout(root);
  const hasConfig = ['vite.config.js', 'vite.config.ts', 'vite.config.mjs'].some((f) => fs.existsSync(path.join(root, f)));

  if (!hasConfig) {
    console.log('  Vite configuration not found. Initializing…');
    init([], { ts: fs.existsSync(path.join(root, 'tsconfig.json')) });
  }

  const viteBin = resolveViteBinary(root);
  const hasLocalVite = Boolean(viteBin);

  // Check if project has a backend (routes/api.js, database, or server/)
  const hasBackend = fs.existsSync(lay.backend) ||
    fs.existsSync(path.join(root, 'routes', 'api.js')) ||
    fs.existsSync(path.join(root, 'server'));

  const children = [];

  const cleanup = () => {
    children.forEach((c) => {
      try { c.kill('SIGINT'); } catch (_) {}
    });
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  if (hasBackend) {
    console.log('  Starting Kreft backend on port 8001 (proxied by Vite) & Vite frontend…');
    const kreftCli = path.join(__dirname, 'kreftjs.js');
    const backendArgs = ['dev', '--port', '8001', '--no-hot'];

    // Forward relevant database / backend flags if present in args
    for (let i = 0; i < args.length; i++) {
      if (['--db', '--api', '--delay', '--migrations', '--backend', '--server'].includes(args[i])) {
        backendArgs.push(args[i]);
        if (args[i + 1] && !args[i + 1].startsWith('-')) backendArgs.push(args[++i]);
      } else if (args[i] === '--seed') {
        backendArgs.push('--seed');
      }
    }

    const backendProc = spawn(process.execPath, [kreftCli, ...backendArgs], {
      cwd: root,
      stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...process.env, PORT: '8001' },
    });
    children.push(backendProc);
  } else {
    console.log('  Starting Vite dev server…');
  }

  const runVite = () => {
    const cleanArgs = args.filter((a) => !['--db', '--api', '--delay', '--migrations', '--backend', '--server', '--seed'].includes(a) && !/[;&|`$<>]/.test(String(a)));
    const cmd = hasLocalVite ? viteBin.cmd : 'npx';
    const cmdArgs = hasLocalVite ? [...viteBin.prefixArgs, ...cleanArgs] : ['vite', ...cleanArgs];

    const viteProc = spawn(cmd, cmdArgs, {
      cwd: root,
      stdio: 'inherit',
      env: process.env,
      shell: hasLocalVite ? viteBin.shell : process.platform === 'win32',
    });
    children.push(viteProc);

    viteProc.on('exit', (code) => {
      cleanup();
      process.exit(code || 0);
    });
  };

  if (hasBackend) {
    // Give backend server a moment to bind before starting Vite
    setTimeout(runVite, 400);
  } else {
    runVite();
  }
}

function build(args = []) {
  const root = getProjectRoot();
  const viteBin = resolveViteBinary(root);
  const cleanArgs = args.filter((a) => !/[;&|`$<>]/.test(String(a)));
  const cmd = viteBin ? viteBin.cmd : 'npx';
  const cmdArgs = viteBin ? [...viteBin.prefixArgs, 'build', ...cleanArgs] : ['vite', 'build', ...cleanArgs];

  console.log('  Building Kreft frontend with Vite & Rollup…\n');
  const proc = spawn(cmd, cmdArgs, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' },
    shell: viteBin ? viteBin.shell : process.platform === 'win32',
  });

  proc.on('exit', (code) => {
    process.exit(code || 0);
  });
}

function preview(args = []) {
  const root = getProjectRoot();
  const viteBin = resolveViteBinary(root);
  const cleanArgs = args.filter((a) => !/[;&|`$<>]/.test(String(a)));
  const cmd = viteBin ? viteBin.cmd : 'npx';
  const cmdArgs = viteBin ? [...viteBin.prefixArgs, 'preview', ...cleanArgs] : ['vite', 'preview', ...cleanArgs];

  const proc = spawn(cmd, cmdArgs, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    shell: viteBin ? viteBin.shell : process.platform === 'win32',
  });

  proc.on('exit', (code) => {
    process.exit(code || 0);
  });
}

module.exports = { init, dev, run: dev, build, preview };
