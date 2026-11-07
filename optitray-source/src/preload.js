const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tray', {
  hide: () => ipcRenderer.send('hide'),
  quit: () => ipcRenderer.send('quit'),
  menu: () => ipcRenderer.send('menu'),
  setPinned: (v) => ipcRenderer.send('set-pinned', v),
  onOpenTool: (fn) => ipcRenderer.on('open-tool', (_e, id) => fn(id)),
  onPinned: (fn) => ipcRenderer.on('pinned', (_e, v) => fn(v)),
});
