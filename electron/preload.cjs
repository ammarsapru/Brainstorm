const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: (url) => shell.openExternal(url),
  onShardTextClip: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('shard-clip-text', handler);
    return () => ipcRenderer.removeListener('shard-clip-text', handler);
  },
  onShardImageClip: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('shard-clip-image', handler);
    return () => ipcRenderer.removeListener('shard-clip-image', handler);
  },
});
