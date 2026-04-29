const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getState: () => ipcRenderer.invoke('get-state'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  completeFirstRun: () => ipcRenderer.invoke('complete-first-run'),
  restartServer: () => ipcRenderer.invoke('restart-server'),
  copyTunnelUrl: () => ipcRenderer.invoke('copy-tunnel-url'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  onServerStatus: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('server-status', handler);
    return () => ipcRenderer.removeListener('server-status', handler);
  },
  onTunnelStatus: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('tunnel-status', handler);
    return () => ipcRenderer.removeListener('tunnel-status', handler);
  },
  onServerEvent: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('server-event', handler);
    return () => ipcRenderer.removeListener('server-event', handler);
  },
});
