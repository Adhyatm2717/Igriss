const path = require('node:path');
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const {
  COLLAPSE_DELAY_MS,
  EXPANDED_HEIGHT,
  EXPANDED_WIDTH,
  HOVER_POLL_INTERVAL_MS,
  NOTCH_WIDTH,
  TRANSITION_DURATION_MS,
  getExpandedBounds,
  getHoverZone,
  getMenuBarHeight,
  getNotchBounds,
  getNotchShapePath,
  isPointInBounds
} = require('../core/notchBounds.cjs');

let notchWindow;
let hoverPoll;
let expanded = false;
let closing = false;
let outsideSince;

function getGeometry() {
  const display = screen.getPrimaryDisplay();
  const menuBarHeight = getMenuBarHeight(display.bounds, display.workArea);
  const notchBounds = getNotchBounds(display.bounds, menuBarHeight);
  const expandedBounds = getExpandedBounds(display.bounds);

  return {
    displayBounds: display.bounds,
    menuBarHeight,
    notchBounds,
    expandedBounds,
    shapePath: getNotchShapePath(menuBarHeight)
  };
}

function rendererQuery(geometry) {
  return {
    notchWidth: String(NOTCH_WIDTH),
    expandedWidth: String(EXPANDED_WIDTH),
    expandedHeight: String(EXPANDED_HEIGHT),
    menuBarHeight: String(geometry.menuBarHeight),
    transitionDuration: String(TRANSITION_DURATION_MS),
    shapePath: geometry.shapePath
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

function isCursorInZone(point, geometry, isExpanded) {
  const zone = getHoverZone(
    geometry.notchBounds,
    geometry.expandedBounds,
    geometry.menuBarHeight,
    isExpanded
  );
  return isPointInBounds(point, zone);
}

function showExpandedWindow(geometry) {
  notchWindow.setBounds(geometry.expandedBounds);
  notchWindow.showInactive();
  notchWindow.setBounds(geometry.expandedBounds);

  let actualBounds = notchWindow.getBounds();
  console.log('[Igriss] expanded window and primary display bounds', {
    windowBounds: actualBounds,
    displayBounds: geometry.displayBounds
  });

  if (actualBounds.y !== geometry.displayBounds.y) {
    console.warn('[Igriss] window y was clamped; retrying with setPosition');
    notchWindow.setPosition(geometry.expandedBounds.x, geometry.displayBounds.y);
    actualBounds = notchWindow.getBounds();
    console.log('[Igriss] expanded window bounds after position retry', actualBounds);
  }
}

function pollHover() {
  if (!notchWindow || notchWindow.isDestroyed()) return;

  const geometry = getGeometry();
  const cursor = screen.getCursorScreenPoint();
  const insideZone = isCursorInZone(cursor, geometry, expanded);

  if (insideZone) {
    outsideSince = undefined;

    if (!expanded) {
      expanded = true;
      showExpandedWindow(geometry);
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
  if (isCursorInZone(cursor, geometry, true)) {
    closing = false;
    outsideSince = undefined;
    sendRendererState('open');
    return;
  }

  expanded = false;
  closing = false;
  notchWindow.hide();
}

function createWindow() {
  const geometry = getGeometry();
  expanded = false;
  closing = false;
  outsideSince = undefined;

  notchWindow = new BrowserWindow({
    ...geometry.expandedBounds,
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
  notchWindow.hide();
  loadRenderer(notchWindow, geometry);

  notchWindow.once('ready-to-show', () => {
    if (!notchWindow || notchWindow.isDestroyed()) return;
    hoverPoll = setInterval(pollHover, HOVER_POLL_INTERVAL_MS);
  });

  notchWindow.on('closed', () => {
    if (hoverPoll) clearInterval(hoverPoll);
    hoverPoll = undefined;
    notchWindow = undefined;
  });
}

ipcMain.on('notch:collapse-complete', handleCollapseComplete);

app.whenReady().then(() => {
  createWindow();
  if (process.platform === 'darwin') app.dock.hide();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
