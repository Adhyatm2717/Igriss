const NOTCH_WIDTH = 200;
const EXPANDED_WIDTH = 480;
const EXPANDED_HEIGHT = 240;
const NO_NOTCH_PILL_WIDTH = 72;
const NO_NOTCH_PILL_HEIGHT = 12;
const NOTCH_CORNER_RADIUS = 14;
const NO_NOTCH_PILL_CORNER_RADIUS = 6;
const EXPANDED_CORNER_RADIUS = 20;
const HOVER_MARGIN = 30;
const DEFAULT_MENU_BAR_HEIGHT = 24;
const NOTCHED_DISPLAY_MAX_ASPECT_RATIO = 1.58;

function isNotchedDisplay(display) {
  if (!display?.internal) return false;

  const { width, height } = display.bounds;
  const aspectRatio = width / height;
  return aspectRatio < NOTCHED_DISPLAY_MAX_ASPECT_RATIO;
}

function getMenuBarHeight(displayBounds, workAreaBounds) {
  const workAreaInset = workAreaBounds.y - displayBounds.y;
  return workAreaInset > 0 ? workAreaInset : DEFAULT_MENU_BAR_HEIGHT;
}

function getCollapsedSize(menuBarHeight, hasNotch) {
  return hasNotch
    ? { width: NOTCH_WIDTH, height: menuBarHeight }
    : { width: NO_NOTCH_PILL_WIDTH, height: NO_NOTCH_PILL_HEIGHT };
}

function getWindowBounds(displayBounds, size) {
  return {
    x: Math.round(displayBounds.x + (displayBounds.width - size.width) / 2),
    y: displayBounds.y,
    width: size.width,
    height: size.height
  };
}

function getHoverZone(collapsedBounds, expandedBounds, menuBarHeight, expanded) {
  if (expanded) return { ...expandedBounds };

  return {
    x: collapsedBounds.x - HOVER_MARGIN,
    y: collapsedBounds.y,
    width: collapsedBounds.width + HOVER_MARGIN * 2,
    height: menuBarHeight
  };
}

function isPointInBounds(point, bounds) {
  return (
    point.x >= bounds.x &&
    point.x < bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y < bounds.y + bounds.height
  );
}

module.exports = {
  COLLAPSE_DELAY_MS: 300,
  DEFAULT_MENU_BAR_HEIGHT,
  EXPANDED_HEIGHT,
  EXPANDED_WIDTH,
  HOVER_MARGIN,
  HOVER_POLL_INTERVAL_MS: 50,
  NO_NOTCH_PILL_HEIGHT,
  NO_NOTCH_PILL_CORNER_RADIUS,
  NO_NOTCH_PILL_WIDTH,
  NOTCH_WIDTH,
  NOTCH_CORNER_RADIUS,
  EXPANDED_CORNER_RADIUS,
  TRANSITION_DURATION_MS: 200,
  getCollapsedSize,
  getHoverZone,
  getMenuBarHeight,
  getWindowBounds,
  isNotchedDisplay,
  isPointInBounds
};
