const path = require('node:path');
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const {
  COLLAPSE_DELAY_MS,
  COLLAPSE_DURATION_MS,
  CONTENT_FADE_DURATION_MS,
  EXPAND_DURATION_MS,
  HOVER_POLL_INTERVAL_MS,
  NOTCH_HEIGHT,
  NOTCH_SHAPE_PATH,
  PANEL_WIDTH,
  PANEL_HEIGHT,
  PANEL_SHAPE_PATH,
  PANEL_WINDOW_WIDTH,
  TOP_ROW_CENTER_WIDTH,
  getHoverZone,
  getNotchBounds,
  getPanelBounds,
  isPointInBounds
} = require('../core/notchBounds.cjs');

let notchWindow;
let hoverPoll;
let expanded = false;
let closing = false;
let outsideSince;

function getGeometry() {
  const display = screen.getPrimaryDisplay();
  const notchBounds = getNotchBounds(display.bounds);
  const panelBounds = getPanelBounds(display.bounds);

  return { displayBounds: display.bounds, notchBounds, panelBounds };
}

function rendererQuery(geometry) {
  return {
    notchHeight: String(NOTCH_HEIGHT),
    panelWidth: String(PANEL_WIDTH),
    panelShapeWidth: String(PANEL_WINDOW_WIDTH),
    panelHeight: String(PANEL_HEIGHT),
    centerZoneWidth: String(TOP_ROW_CENTER_WIDTH),
    expandDuration: String(EXPAND_DURATION_MS),
    collapseDuration: String(COLLAPSE_DURATION_MS),
    contentFadeDuration: String(CONTENT_FADE_DURATION_MS),
    notchShape: NOTCH_SHAPE_PATH,
    panelShape: PANEL_SHAPE_PATH
  };
}

function loadRenderer(window, geometry) {
  if (process.env.VITE_DEV_SERVER_URL) {
    const url = new URL(process.env.VITE_DEV_SERVER_URL);
    for (const [key, value] of Object.entries(rendererQuery(geometry))) {
      url.searchParams.set(key, value);
    }
    window.loadURL(url.toString());
  } else {
    window.loadFile(path.join(__dirname, '../../dist/renderer/index.html'), {
      query: rendererQuery(geometry)
    });
  }
}

function sendRendererState(state) {
  if (notchWindow && !notchWindow.isDestroyed()) {
    notchWindow.webContents.send(`notch:${state}`);
  }
}

function getHoverBounds(geometry, isExpanded) {
  return getHoverZone(geometry.notchBounds, geometry.panelBounds, isExpanded);
}

function pollHover() {
  if (!notchWindow || notchWindow.isDestroyed()) return;

  const geometry = getGeometry();
  const cursor = screen.getCursorScreenPoint();
  const insideZone = isPointInBounds(cursor, getHoverBounds(geometry, expanded));

  if (insideZone) {
    outsideSince = undefined;
    if (!expanded) {
      expanded = true;
      closing = false;
      notchWindow.setBounds(geometry.panelBounds);
      notchWindow.setIgnoreMouseEvents(false);
      notchWindow.showInactive();
      notchWindow.setBounds(geometry.panelBounds);
      sendRendererState('open');
    } else if (closing) {
      closing = false;
      sendRendererState('open');
    }
    return;
  }

  if (!expanded || closing) return;
  if (outsideSince === undefined) outsideSince = Date.now();

  if (Date.now() - outsideSince >= COLLAPSE_DELAY_MS) {
    outsideSince = undefined;
    closing = true;
    sendRendererState('close');
  }
}

function handleCollapseComplete(event) {
  if (!notchWindow || event.sender !== notchWindow.webContents || !closing) return;

  const geometry = getGeometry();
  const cursor = screen.getCursorScreenPoint();
  if (isPointInBounds(cursor, getHoverBounds(geometry, true))) {
    closing = false;
    outsideSince = undefined;
    sendRendererState('open');
    return;
  }

  expanded = false;
  closing = false;
  notchWindow.setBounds(geometry.notchBounds);
  notchWindow.setFocusable(false);
  notchWindow.setIgnoreMouseEvents(true, { forward: true });
}

function handleInputFocus(event) {
  if (!notchWindow || event.sender !== notchWindow.webContents || !expanded) return;
  notchWindow.setFocusable(true);
  notchWindow.focus();
}

function handleInputBlur(event) {
  if (!notchWindow || event.sender !== notchWindow.webContents) return;
  notchWindow.setFocusable(false);
}

function createWindow() {
  const geometry = getGeometry();
  expanded = false;
  closing = false;
  outsideSince = undefined;

  notchWindow = new BrowserWindow({
    ...geometry.notchBounds,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    fullscreenable: false,
    skipTaskbar: true,
    enableLargerThanScreen: true,
    roundedCorners: false,
    backgroundColor: '#00000000',
    type: 'panel',
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  notchWindow.setAlwaysOnTop(true, 'screen-saver');
  notchWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    skipTransformProcessType: true
  });
  notchWindow.setIgnoreMouseEvents(true, { forward: true });
  loadRenderer(notchWindow, geometry);

  notchWindow.once('ready-to-show', () => {
    if (!notchWindow || notchWindow.isDestroyed()) return;
    notchWindow.showInactive();
    hoverPoll = setInterval(pollHover, HOVER_POLL_INTERVAL_MS);
  });

  notchWindow.on('closed', () => {
    if (hoverPoll) clearInterval(hoverPoll);
    hoverPoll = undefined;
    notchWindow = undefined;
  });
}

ipcMain.on('notch:collapse-complete', handleCollapseComplete);
ipcMain.on('notch:input-focus', handleInputFocus);
ipcMain.on('notch:input-blur', handleInputBlur);

app.whenReady().then(() => {
  const { width, height } = screen.getPrimaryDisplay().bounds;
  console.log('[Igriss] primary display size in points', { width, height });
  if (width !== 1512 || height !== 982) {
    console.warn('[Igriss] geometry was specified for 1512x982 points');
  }

  createWindow();
  if (process.platform === 'darwin') app.dock.hide();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
