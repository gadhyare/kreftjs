const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const http = require('http');

const isDev = !app.isPackaged || process.env.NODE_ENV === 'development';
const DEV_PORT = process.env.PORT || 8000;
const DEV_URL = `http://localhost:${DEV_PORT}`;

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
    process.env.KREFT_ELECTRON_DEVTOOLS ||
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
