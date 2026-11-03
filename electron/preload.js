const { contextBridge, ipcRenderer } = require('electron');

// Expose safe desktop bridge onto window.kreftDesktop
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

contextBridge.exposeInMainWorld('__KREFT_ELECTRON__', true);
