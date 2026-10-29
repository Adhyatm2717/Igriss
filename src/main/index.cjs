const path = require('node:path');
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const {
  COLLAPSE_DELAY_MS,
  EXPANDED_CORNER_RADIUS,
  EXPANDED_HEIGHT,
  EXPANDED_WIDTH,
  HOVER_POLL_INTERVAL_MS,
  NO_NOTCH_PILL_CORNER_RADIUS,
  NOTCH_CORNER_RADIUS,
  TRANSITION_DURATION_MS,
  getCollapsedSize,
  getHoverZone,
  getMenuBarHeight,
  getWindowBounds,
  isNotchedDisplay,
  isPointInBounds
} = require('../core/notchBounds.cjs');

const EXPANDED_SIZE = { width: EXPANDED_WIDTH, height: EXPANDED_HEIGHT };
let notchWindow;
let hoverPoll;
let expanded = false;
let closing = false;
let outsideSince;

function getGeometry() {
  const display = screen.getPrimaryDisplay();
  const menuBarHeight = getMenuBarHeight(display.bounds, display.workArea);
  const hasNotch = isNotchedDisplay(display);
  const collapsedSize = getCollapsedSize(menuBarHeight, hasNotch);
  const collapsedBounds = getWindowBounds(display.bounds, collapsedSize);
  const expandedBounds = getWindowBounds(display.bounds, EXPANDED_SIZE);

  return { collapsedBounds, expandedBounds, hasNotch, menuBarHeight };
}

function rendererUrlWithGeometry(url, geometry) {
  const rendererUrl = new URL(url);
  rendererUrl.searchParams.set('collapsedWidth', String(geometry.collapsedBounds.width));
  rendererUrl.searchParams.set('collapsedHeight', String(geometry.collapsedBounds.height));
  rendererUrl.searchParams.set('expandedWidth', String(EXPANDED_WIDTH));
  rendererUrl.searchParams.set('expandedHeight', String(EXPANDED_HEIGHT));
  rendererUrl.searchParams.set('notchRadius', String(NOTCH_CORNER_RADIUS));
  rendererUrl.searchParams.set('pillRadius', String(NO_NOTCH_PILL_CORNER_RADIUS));
  rendererUrl.searchParams.set('expandedRadius', String(EXPANDED_CORNER_RADIUS));
  rendererUrl.searchParams.set('transitionDuration', String(TRANSITION_DURATION_MS));
  rendererUrl.searchParams.set('hasNotch', String(geometry.hasNotch));
  return rendererUrl.toString();
}

function loadRenderer(window, geometry) {
  if (process.env.VITE_DEV_SERVER_URL) {
    window.loadURL(rendererUrlWithGeometry(process.env.VITE_DEV_SERVER_URL, geometry));
  } else {
    window.loadFile(path.join(__dirname, '../../dist/renderer/index.html'), {
      query: {
        collapsedWidth: String(geometry.collapsedBounds.width),
        collapsedHeight: String(geometry.collapsedBounds.height),
        expandedWidth: String(EXPANDED_WIDTH),
        expandedHeight: String(EXPANDED_HEIGHT),
        notchRadius: String(NOTCH_CORNER_RADIUS),
        pillRadius: String(NO_NOTCH_PILL_CORNER_RADIUS),
        expandedRadius: String(EXPANDED_CORNER_RADIUS),
        transitionDuration: String(TRANSITION_DURATION_MS),
        hasNotch: String(geometry.hasNotch)
      }
    });
  }
}

function sendRendererState(state) {
  if (notchWindow && !notchWindow.isDestroyed()) {
    notchWindow.webContents.send(`notch:${state}`);
  }
}

function isCursorInHoverZone(point, geometry, isExpanded) {
  const zone = getHoverZone(
    geometry.collapsedBounds,
    geometry.expandedBounds,
    geometry.menuBarHeight,
    isExpanded
  );
  return isPointInBounds(point, zone);
}

function pollHover() {
  if (!notchWindow || notchWindow.isDestroyed()) return;

  const geometry = getGeometry();
  const cursor = screen.getCursorScreenPoint();
  const insideZone = isCursorInHoverZone(cursor, geometry, expanded);

  if (insideZone) {
    outsideSince = undefined;

    if (!expanded) {
      expanded = true;
      notchWindow.setBounds(geometry.expandedBounds);
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
  if (isCursorInHoverZone(cursor, geometry, true)) {
    closing = false;
    outsideSince = undefined;
    sendRendererState('open');
    return;
  }

  expanded = false;
  closing = false;
  notchWindow.setBounds(geometry.collapsedBounds);
}

function createWindow() {
  const geometry = getGeometry();
  expanded = false;
  closing = false;
  outsideSince = undefined;

  notchWindow = new BrowserWindow({
    ...geometry.collapsedBounds,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  notchWindow.setAlwaysOnTop(true, 'screen-saver');
  notchWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
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
