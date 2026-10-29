const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const listener = () => callback();
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('igriss', {
  notch: {
    onOpen(callback) {
      return subscribe('notch:open', callback);
    },
    onClose(callback) {
      return subscribe('notch:close', callback);
    },
    collapseComplete() {
      ipcRenderer.send('notch:collapse-complete');
    }
  }
});
