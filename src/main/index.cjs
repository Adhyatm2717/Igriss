const path = require('node:path');
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const { getNotchBounds } = require('../core/notchBounds.cjs');

const COLLAPSED_SIZE = { width: 200, height: 32 };
const EXPANDED_SIZE = { width: 480, height: 240 };
let notchWindow;

function positionWindow(window, size) {
  const { bounds } = screen.getPrimaryDisplay();
  window.setBounds(getNotchBounds(bounds, size));
}

function createWindow() {
  notchWindow = new BrowserWindow({
    ...COLLAPSED_SIZE,
    x: 0,
    y: 0,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  positionWindow(notchWindow, COLLAPSED_SIZE);
  notchWindow.setAlwaysOnTop(true, 'screen-saver');
  notchWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  if (process.env.VITE_DEV_SERVER_URL) {
    notchWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    notchWindow.loadFile(path.join(__dirname, '../../dist/renderer/index.html'));
  }

  notchWindow.once('ready-to-show', () => notchWindow.show());
  notchWindow.on('closed', () => {
    notchWindow = undefined;
  });
}

ipcMain.on('notch:set-expanded', (_event, expanded) => {
  if (!notchWindow || typeof expanded !== 'boolean') return;

  const size = expanded ? EXPANDED_SIZE : COLLAPSED_SIZE;
  positionWindow(notchWindow, size);
});

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock.hide();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
