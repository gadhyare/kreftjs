/*
 * Electron.js Desktop Support for Kreft
 *
 * Commands:
 *   kreftjs electron:init     Add Electron files to an existing project (alias: kreftjs make:electron)
 *   kreftjs electron:dev      Run the app in an Electron desktop window with hot reload (alias: kreftjs electron)
 *   kreftjs electron:build    Build static bundle (kreftjs build) and package desktop installer (electron-builder)
 *
 * CLI flag:
 *   kreftjs new my-app --electron
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function getProjectRoot(start = process.cwd()) {
  const lay = require('./layout.js').layout(start);
  return lay.split ? lay.project : start;
}

const TEMPLATES = {
  main: () => `const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const http = require('http');

const isDev = !app.isPackaged || process.env.NODE_ENV === 'development';
const DEV_PORT = process.env.PORT || 8000;
const DEV_URL = \`http://localhost:\${DEV_PORT}\`;

// Electron DevTools sidebar configuration:
// Control with ELECTRON_DEVTOOLS, KREFT_ELECTRON_DEVTOOLS or CLI flags:
//   ELECTRON_DEVTOOLS=true | 1 | right | show     -> open DevTools as right sidebar
//   ELECTRON_DEVTOOLS=bottom | left | detach     -> open DevTools in chosen position
//   ELECTRON_DEVTOOLS=false | 0 | hide | off     -> hide DevTools
function getDevToolsConfig() {
  const arg = process.argv.find((a) => a.startsWith('--devtools='));
  const raw = (arg ? arg.split('=')[1] : null) ||
    (process.argv.includes('--devtools') ? 'right' : null) ||
    (process.argv.includes('--no-devtools') ? 'false' : null) ||
    process.env.ELECTRON_DEVTOOLS ||
    (process.env.KREFT_ELECTRON_DEVTOOLS || process.env.SOM_ELECTRON_DEVTOOLS) ||
    '';
  const val = String(raw).trim().toLowerCase();
  if (!val) return { show: false, mode: 'right' };
  if (['false', '0', 'hide', 'off', 'no'].includes(val)) return { show: false, mode: 'right' };
  const mode = ['bottom', 'left', 'detach', 'undocked'].includes(val) ? (val === 'undocked' ? 'detach' : val) : 'right';
  return { show: true, mode };
}

let mainWindow = null;

function waitForServer(url, timeout = 15000) {
  const start = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      http.get(url, (res) => {
        if (res.statusCode < 500) return resolve(true);
        retry();
      }).on('error', retry);
    };
    const retry = () => {
      if (Date.now() - start > timeout) return resolve(false);
      setTimeout(check, 100); // the window opens as soon as the dev server answers
    };
    check();
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    // High-precision brutalist geometry (zero border radius on window edges where platform allows)
    frame: true,
    backgroundColor: '#ffffff',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open external links in default system browser, never inside the Electron window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(url);
      }
    } catch (_) {}
    return { action: 'deny' };
  });

  // Block navigation away from the local application origin
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    try {
      const parsed = new URL(targetUrl);
      if (isDev && parsed.origin === new URL(DEV_URL).origin) return;
      if (!isDev && parsed.protocol === 'file:') {
        const distRoot = path.resolve(__dirname, '..', 'dist');
        const targetPath = path.resolve(decodeURIComponent(parsed.pathname));
        if (targetPath === distRoot || targetPath.startsWith(distRoot + path.sep)) return;
      }
      event.preventDefault();
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(targetUrl);
      }
    } catch (_) {
      event.preventDefault();
    }
  });

  const devTools = getDevToolsConfig();

  if (isDev) {
    const ready = await waitForServer(DEV_URL);
    if (ready) {
      await mainWindow.loadURL(DEV_URL);
    } else {
      await mainWindow.loadURL(DEV_URL); // attempt anyway
    }
    if (devTools.show) {
      mainWindow.webContents.openDevTools({ mode: devTools.mode });
    }
    // F12 or Cmd+Option+I toggles DevTools
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
        mainWindow.webContents.toggleDevTools();
      }
    });
  } else {
    // Production: load static bundle from dist/
    const distPath = path.join(__dirname, '..', 'dist', 'index.html');
    await mainWindow.loadFile(distPath);
    if (devTools.show) {
      mainWindow.webContents.openDevTools({ mode: devTools.mode });
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers: Safe desktop bridge exposed to Kreft frontend
ipcMain.handle('kreft:app-info', () => ({
  name: app.getName(),
  version: app.getVersion(),
  platform: process.platform,
  arch: process.arch,
  isPackaged: app.isPackaged,
}));

ipcMain.handle('kreft:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('kreft:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});

ipcMain.handle('kreft:close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('kreft:devtools:open', (_, mode) => {
  if (mainWindow) mainWindow.webContents.openDevTools({ mode: mode || 'right' });
});

ipcMain.handle('kreft:devtools:close', () => {
  if (mainWindow) mainWindow.webContents.closeDevTools();
});

ipcMain.handle('kreft:devtools:toggle', () => {
  if (mainWindow) mainWindow.webContents.toggleDevTools();
});

function pickAllowed(obj, allowed) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(obj, k) && obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

ipcMain.handle('kreft:dialog:message', async (_, options) => {
  const safeOpts = pickAllowed(options, ['type', 'buttons', 'defaultId', 'title', 'message', 'detail', 'cancelId', 'noLink']);
  return mainWindow ? dialog.showMessageBox(mainWindow, safeOpts) : dialog.showMessageBox(safeOpts);
});

ipcMain.handle('kreft:dialog:open', async (_, options) => {
  const safeOpts = pickAllowed(options, ['title', 'defaultPath', 'buttonLabel', 'filters', 'properties', 'message']);
  return mainWindow ? dialog.showOpenDialog(mainWindow, safeOpts) : dialog.showOpenDialog(safeOpts);
});

ipcMain.handle('kreft:dialog:save', async (_, options) => {
  const safeOpts = pickAllowed(options, ['title', 'defaultPath', 'buttonLabel', 'filters', 'message', 'nameFieldLabel', 'showsTagField']);
  return mainWindow ? dialog.showSaveDialog(mainWindow, safeOpts) : dialog.showSaveDialog(safeOpts);
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (isDev || process.platform !== 'darwin') app.quit();
});
`,

  preload: () => `const { contextBridge, ipcRenderer } = require('electron');

// Expose safe desktop bridge onto window.kreftDesktop (window.somDesktop is the same object: the Som.js name)
const desktop = {
  isElectron: true,
  getInfo: () => ipcRenderer.invoke('kreft:app-info'),
  minimize: () => ipcRenderer.invoke('kreft:minimize'),
  maximize: () => ipcRenderer.invoke('kreft:maximize'),
  close: () => ipcRenderer.invoke('kreft:close'),
  openDevTools: (mode) => ipcRenderer.invoke('kreft:devtools:open', mode),
  closeDevTools: () => ipcRenderer.invoke('kreft:devtools:close'),
  toggleDevTools: () => ipcRenderer.invoke('kreft:devtools:toggle'),
  showMessageBox: (options) => ipcRenderer.invoke('kreft:dialog:message', options),
  showOpenDialog: (options) => ipcRenderer.invoke('kreft:dialog:open', options),
  showSaveDialog: (options) => ipcRenderer.invoke('kreft:dialog:save', options),
};
contextBridge.exposeInMainWorld('kreftDesktop', desktop);
contextBridge.exposeInMainWorld('somDesktop', desktop);

contextBridge.exposeInMainWorld('__KREFT_ELECTRON__', true);
contextBridge.exposeInMainWorld('__SOM_ELECTRON__', true);
`,
};

// A new project's index.html loads Google Fonts: a style sheet from another site that the browser must download before it
// draws anything (about 0.6 s on a first visit, and a failed request when offline). A desktop app does not need it.
// Only the exact links Kreft wrote are removed; returns the file's relative path, or null when there was nothing to remove.
function dropWebFonts(root) {
  const lay = require('./layout.js').layout(root);
  const file = path.join(lay.split ? lay.frontend : root, 'index.html');
  if (!fs.existsSync(file)) return null;
  const html = fs.readFileSync(file, 'utf8');
  const links = /^[ \t]*<link\b[^>\n]*href="https:\/\/fonts\.(?:googleapis|gstatic)\.com[^">\n]*"[^>\n]*>[ \t]*\r?\n/gim;
  const out = html.replace(links, '');
  if (out === html) return null;
  fs.writeFileSync(file, out);
  return path.relative(root, file);
}

function init(args = []) {
  const target = typeof args === 'string' ? args : (args[0] && !args[0].startsWith('-') ? args[0] : process.cwd());
  const root = getProjectRoot(target);
  const pkgFile = path.join(root, 'package.json');
  if (!fs.existsSync(pkgFile)) {
    console.error('  No package.json found. Run this inside a Kreft project.');
    process.exit(1);
  }

  const electronDir = path.join(root, 'electron');
  fs.mkdirSync(electronDir, { recursive: true });

  const mainPath = path.join(electronDir, 'main.js');
  const preloadPath = path.join(electronDir, 'preload.js');

  const wroteMain = !fs.existsSync(mainPath);
  if (wroteMain) fs.writeFileSync(mainPath, TEMPLATES.main());
  const wrotePreload = !fs.existsSync(preloadPath);
  if (wrotePreload) fs.writeFileSync(preloadPath, TEMPLATES.preload());

  // Update package.json
  const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
  pkg.main = 'electron/main.js';
  pkg.scripts = pkg.scripts || {};
  pkg.scripts['electron'] = 'kreftjs electron';
  pkg.scripts['electron:dev'] = 'kreftjs electron:dev';
  pkg.scripts['electron:build'] = 'kreftjs electron:build';

  pkg.devDependencies = pkg.devDependencies || {};
  if (!pkg.devDependencies['electron']) pkg.devDependencies['electron'] = '^34.2.0';
  if (!pkg.devDependencies['electron-builder']) pkg.devDependencies['electron-builder'] = '^25.1.8';

  pkg.build = pkg.build || {
    appId: `com.kreftjs.${(pkg.name || 'app').toLowerCase().replace(/[^a-z0-9]/g, '')}`,
    productName: pkg.name ? pkg.name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Kreft Desktop',
    directories: { output: 'dist-electron' },
    files: ['dist/**/*', 'electron/**/*', 'package.json'],
    mac: { target: ['dmg', 'zip'], category: 'public.app-category.developer-tools' },
    win: { target: ['nsis', 'portable'] },
    linux: { target: ['AppImage', 'deb'] },
  };

  fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');

  const droppedFonts = dropWebFonts(root);

  console.log(`
  Electron configured for Kreft:
    CREATED  electron/main.js
    CREATED  electron/preload.js
    UPDATED  package.json  (scripts: electron, electron:dev, electron:build)${droppedFonts ? `
    UPDATED  ${droppedFonts}  (removed the Google Fonts links: a desktop app should start without the network; the system fonts are used)` : ''}

  Next:
    npm install            (install electron & electron-builder)
    kreftjs electron:dev       (start dev server & launch desktop window)
    kreftjs electron:build     (build production installer)
`);
}

function resolveElectronBinary(root) {
  // 1. Resolve native Electron executable directly from node_modules/electron
  // This bypasses npm's cli.js wrapper which noisily prints "...exited with signal SIGINT" on exit
  try {
    const pkgDir = path.join(root, 'node_modules', 'electron');
    if (fs.existsSync(pkgDir)) {
      const execPath = require(pkgDir);
      if (typeof execPath === 'string' && fs.existsSync(execPath)) return execPath;
    }
  } catch (_) {}

  try {
    const pathTxt = path.join(root, 'node_modules', 'electron', 'path.txt');
    if (fs.existsSync(pathTxt)) {
      const rel = fs.readFileSync(pathTxt, 'utf8').trim();
      const direct = path.join(root, 'node_modules', 'electron', 'dist', rel);
      if (fs.existsSync(direct)) return direct;
    }
  } catch (_) {}

  const local = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron');
  if (fs.existsSync(local)) return local;
  return 'electron';
}

function resolveBuilderBinary(root) {
  const local = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder');
  if (fs.existsSync(local)) return local;
  return 'electron-builder';
}

function dev(args = []) {
  const root = getProjectRoot();
  const electronMain = path.join(root, 'electron', 'main.js');
  if (!fs.existsSync(electronMain)) {
    console.log('  Electron files not found. Initializing…');
    init();
  }

  // Load .env if present
  try { require('./env.js').load(root); } catch (_) {}

  const bin = resolveElectronBinary(root);

  // Extract devtools settings from CLI args or environment
  let devToolsEnv = process.env.ELECTRON_DEVTOOLS || (process.env.KREFT_ELECTRON_DEVTOOLS || process.env.SOM_ELECTRON_DEVTOOLS) || '';
  const devToolsArg = args.find((a) => a === '--devtools' || a.startsWith('--devtools=') || a === '--no-devtools');
  if (devToolsArg) {
    if (devToolsArg === '--devtools') devToolsEnv = 'right';
    else if (devToolsArg === '--no-devtools') devToolsEnv = 'false';
    else devToolsEnv = devToolsArg.split('=')[1] || 'right';
  }

  const serverArgs = args.filter((a) => a !== '--devtools' && !a.startsWith('--devtools=') && a !== '--no-devtools');

  // 1. Start dev server child process
  console.log('  Starting Kreft dev server & Electron desktop window…');
  const kreftCli = path.join(__dirname, 'kreftjs.js');
  const server = spawn(process.execPath, [kreftCli, 'dev', ...serverArgs], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, PORT: process.env.PORT || '8000', KREFT_ELECTRON: 'true' },
  });

  // 2. Launch Electron after small pause
  let electronProcess = null;
  setTimeout(() => {
    const electronArgs = ['.'];
    if (devToolsArg) electronArgs.push(devToolsArg);
    electronProcess = spawn(bin, electronArgs, {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'development',
        PORT: process.env.PORT || '8000',
        ...(devToolsEnv ? { ELECTRON_DEVTOOLS: devToolsEnv } : {}),
      },
    });

    electronProcess.on('exit', (code) => {
      if (server && !server.killed) {
        try { server.kill('SIGTERM'); } catch (_) {}
      }
      process.exit(code || 0);
    });

    electronProcess.on('error', (err) => {
      if (err.code === 'ENOENT') {
        console.error('\n  Electron is not installed locally. Run:  kreftjs add -D electron\n');
      } else {
        console.error('  Electron launch error: ' + err.message);
      }
      if (server && !server.killed) {
        try { server.kill('SIGTERM'); } catch (_) {}
      }
      process.exit(1);
    });
  }, 1000);

  const cleanup = () => {
    if (electronProcess && !electronProcess.killed) {
      try { electronProcess.kill('SIGTERM'); } catch (_) {}
    }
    if (server && !server.killed) {
      try { server.kill('SIGTERM'); } catch (_) {}
    }
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

function build(args = []) {
  const root = getProjectRoot();
  const electronMain = path.join(root, 'electron', 'main.js');
  if (!fs.existsSync(electronMain)) {
    console.log('  Electron files not found. Initializing…');
    init();
  }

  // 1. Build Kreft frontend for desktop with relative base
  console.log('\n  Step 1: Building Kreft static bundle with relative base (./)…');
  const kreftCli = path.join(__dirname, 'kreftjs.js');
  const buildProc = spawn(process.execPath, [kreftCli, 'build', '--base', './', ...args], {
    cwd: root,
    stdio: 'inherit',
  });

  buildProc.on('exit', (code) => {
    if (code !== 0) {
      console.error('  Build failed with code ' + code);
      process.exit(code || 1);
    }

    // 2. Run electron-builder
    console.log('\n  Step 2: Packaging desktop executable with electron-builder…');
    const builderBin = resolveBuilderBinary(root);
    const packProc = spawn(builderBin, args, {
      cwd: root,
      stdio: 'inherit',
    });

    packProc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        console.error('\n  electron-builder is not installed. Run:  kreftjs add -D electron-builder\n');
      } else {
        console.error('  Packaging error: ' + err.message);
      }
      process.exit(1);
    });

    packProc.on('exit', (c) => process.exit(c || 0));
  });
}

module.exports = {
  init,
  dev,
  run: dev,
  build,
  TEMPLATES,
};
