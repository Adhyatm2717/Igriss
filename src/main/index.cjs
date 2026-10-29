const path = require('node:path');
const { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, Tray } = require('electron');
const {
  COLLAPSE_DELAY_MS,
  COLLAPSE_DURATION_MS,
  CONTENT_FADE_DURATION_MS,
  EXPAND_DURATION_MS,
  HOVER_POLL_INTERVAL_MS,
  NOTCH_HEIGHT,
  NOTCH_SHAPE_PATH,
  NO_NOTCH_TAB_HEIGHT,
  NO_NOTCH_TAB_SHAPE_PATH,
  getIdleHoverBounds,
  getNoNotchBounds,
  isNotchedDisplay,
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
let tray;
let trayMenu;
let hoverPoll;
let expanded = false;
let closing = false;
let outsideSince;
let focusRequested = false;

function getGeometry() {
  const display = screen.getPrimaryDisplay();
  const hasNotch = isNotchedDisplay(display);
  const notchBounds = hasNotch ? getNotchBounds(display.bounds) : getNoNotchBounds(display.bounds);
  const idleHoverBounds = getIdleHoverBounds(display.bounds, hasNotch);
  const panelBounds = getPanelBounds(display.bounds);

  return { displayBounds: display.bounds, hasNotch, idleHoverBounds, notchBounds, panelBounds };
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
    idleShape: geometry.hasNotch ? NOTCH_SHAPE_PATH : NO_NOTCH_TAB_SHAPE_PATH,
    idleShapeHeight: String(geometry.hasNotch ? NOTCH_HEIGHT : NO_NOTCH_TAB_HEIGHT),
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

function sendRendererState(state, payload) {
  if (notchWindow && !notchWindow.isDestroyed()) {
    notchWindow.webContents.send(`notch:${state}`, payload);
  }
}

function getHoverBounds(geometry, isExpanded) {
  return isExpanded
    ? getHoverZone(geometry.notchBounds, geometry.panelBounds, true)
    : geometry.idleHoverBounds;
}

function openPanel(focusInput = false) {
  if (!notchWindow || notchWindow.isDestroyed()) return;
  const geometry = getGeometry();
  expanded = true;
  closing = false;
  outsideSince = undefined;
  focusRequested = focusInput;
  notchWindow.setBounds(geometry.panelBounds);
  notchWindow.setIgnoreMouseEvents(false);
  notchWindow.showInactive();
  notchWindow.setBounds(geometry.panelBounds);
  sendRendererState('open', { focusInput });
}

function createTray() {
  const iconPath = path.join(__dirname, '../../assets/igrissTemplate.png');
  const retinaPath = path.join(__dirname, '../../assets/igriss2xTemplate.png');
  const image = nativeImage.createFromPath(iconPath);
  const retinaImage = nativeImage.createFromPath(retinaPath);
  image.addRepresentation({ scaleFactor: 2, dataURL: retinaImage.toDataURL() });
  image.setTemplateImage(true);
  tray = new Tray(image);
  tray.setToolTip('Igriss');
  trayMenu = Menu.buildFromTemplate([
    { label: 'Open Igriss', click: () => openPanel(true) },
    { type: 'separator' },
    { label: 'Quit Igriss', click: () => app.quit() }
  ]);
  tray.on('click', () => openPanel(true));
  tray.on('right-click', () => tray?.popUpContextMenu(trayMenu));
}

function pollHover() {
  if (!notchWindow || notchWindow.isDestroyed()) return;

  const geometry = getGeometry();
  const cursor = screen.getCursorScreenPoint();
  const insideZone = isPointInBounds(cursor, getHoverBounds(geometry, expanded));

  if (insideZone) {
    outsideSince = undefined;
    if (!expanded) {
      openPanel(false);
    } else if (closing) {
      closing = false;
      sendRendererState('open', { focusInput: false });
    }
    return;
  }

  if (!expanded || closing) return;
  if (focusRequested) return;
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
    sendRendererState('open', { focusInput: false });
    return;
  }

  expanded = false;
  closing = false;
  focusRequested = false;
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
  focusRequested = false;
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
  createTray();
  if (process.platform === 'darwin') app.dock.hide();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  if (hoverPoll) clearInterval(hoverPoll);
  hoverPoll = undefined;
  tray?.destroy();
  tray = undefined;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
