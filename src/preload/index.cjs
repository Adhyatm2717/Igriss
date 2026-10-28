const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('igriss', {
  notch: {
    setExpanded(expanded) {
      if (typeof expanded === 'boolean') {
        ipcRenderer.send('notch:set-expanded', expanded);
      }
    }
  }
});
