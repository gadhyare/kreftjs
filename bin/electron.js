/*
 * Electron.js Desktop Support for Som.js
 *
 * Commands:
 *   som electron:init     Add Electron files to an existing project (alias: som make:electron)
 *   som electron:dev      Run the app in an Electron desktop window with hot reload (alias: som electron)
 *   som electron:build    Build static bundle (som build) and package desktop installer (electron-builder)
 *
 * CLI flag:
 *   som new my-app --electron
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
      setTimeout(check, 300);
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

  // Open external links in default system browser, not in Electron window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  if (isDev) {
    const ready = await waitForServer(DEV_URL);
    if (ready) {
      await mainWindow.loadURL(DEV_URL);
    } else {
      await mainWindow.loadURL(DEV_URL); // attempt anyway
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
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers: Safe desktop bridge exposed to Som.js frontend
ipcMain.handle('som:app-info', () => ({
  name: app.getName(),
  version: app.getVersion(),
  platform: process.platform,
  arch: process.arch,
  isPackaged: app.isPackaged,
}));

ipcMain.handle('som:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('som:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});

ipcMain.handle('som:close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('som:dialog:message', async (_, options) => {
  return dialog.showMessageBox(mainWindow, options);
});

ipcMain.handle('som:dialog:open', async (_, options) => {
  return dialog.showOpenDialog(mainWindow, options);
});

ipcMain.handle('som:dialog:save', async (_, options) => {
  return dialog.showSaveDialog(mainWindow, options);
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
`,

  preload: () => `const { contextBridge, ipcRenderer } = require('electron');

// Expose safe desktop bridge onto window.somDesktop
contextBridge.exposeInMainWorld('somDesktop', {
  isElectron: true,
  getInfo: () => ipcRenderer.invoke('som:app-info'),
  minimize: () => ipcRenderer.invoke('som:minimize'),
  maximize: () => ipcRenderer.invoke('som:maximize'),
  close: () => ipcRenderer.invoke('som:close'),
  showMessageBox: (options) => ipcRenderer.invoke('som:dialog:message', options),
  showOpenDialog: (options) => ipcRenderer.invoke('som:dialog:open', options),
  showSaveDialog: (options) => ipcRenderer.invoke('som:dialog:save', options),
});
`,
};

function init(args = []) {
  const target = typeof args === 'string' ? args : (args[0] && !args[0].startsWith('-') ? args[0] : process.cwd());
  const root = getProjectRoot(target);
  const pkgFile = path.join(root, 'package.json');
  if (!fs.existsSync(pkgFile)) {
    console.error('  No package.json found. Run this inside a Som.js project.');
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
  pkg.scripts['electron'] = 'som electron';
  pkg.scripts['electron:dev'] = 'som electron:dev';
  pkg.scripts['electron:build'] = 'som electron:build';

  pkg.devDependencies = pkg.devDependencies || {};
  if (!pkg.devDependencies['electron']) pkg.devDependencies['electron'] = '^34.2.0';
  if (!pkg.devDependencies['electron-builder']) pkg.devDependencies['electron-builder'] = '^25.1.8';

  pkg.build = pkg.build || {
    appId: `com.somjs.${(pkg.name || 'app').toLowerCase().replace(/[^a-z0-9]/g, '')}`,
    productName: pkg.name ? pkg.name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Som Desktop',
    directories: { output: 'dist-electron' },
    files: ['dist/**/*', 'electron/**/*', 'package.json'],
    mac: { target: ['dmg', 'zip'], category: 'public.app-category.developer-tools' },
    win: { target: ['nsis', 'portable'] },
    linux: { target: ['AppImage', 'deb'] },
  };

  fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');

  console.log(`
  Electron configured for Som.js:
    CREATED  electron/main.js
    CREATED  electron/preload.js
    UPDATED  package.json  (scripts: electron, electron:dev, electron:build)

  Next:
    npm install            (install electron & electron-builder)
    som electron:dev       (start dev server & launch desktop window)
    som electron:build     (build production installer)
`);
}

function resolveElectronBinary(root) {
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

  const bin = resolveElectronBinary(root);

  // 1. Start dev server child process
  console.log('  Starting Som.js dev server & Electron desktop window…');
  const somCli = path.join(__dirname, 'som.js');
  const server = spawn(process.execPath, [somCli, 'dev', ...args], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, PORT: process.env.PORT || '8000' },
  });

  // 2. Launch Electron after small pause
  let electronProcess = null;
  setTimeout(() => {
    electronProcess = spawn(bin, ['.'], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'development', PORT: process.env.PORT || '8000' },
    });

    electronProcess.on('exit', (code) => {
      server.kill('SIGINT');
      process.exit(code || 0);
    });

    electronProcess.on('error', (err) => {
      if (err.code === 'ENOENT') {
        console.error('\n  Electron is not installed locally. Run:  som add -D electron\n');
      } else {
        console.error('  Electron launch error: ' + err.message);
      }
      server.kill('SIGINT');
      process.exit(1);
    });
  }, 1000);

  const cleanup = () => {
    if (electronProcess) electronProcess.kill();
    server.kill();
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

  // 1. Build Som.js frontend for desktop with relative base
  console.log('\n  Step 1: Building Som.js static bundle with relative base (./)…');
  const somCli = path.join(__dirname, 'som.js');
  const buildProc = spawn(process.execPath, [somCli, 'build', '--base', './', ...args], {
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
        console.error('\n  electron-builder is not installed. Run:  som add -D electron-builder\n');
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
