const NOTCH_WIDTH = 185;
const NOTCH_HEIGHT = 32;
const NOTCH_BOTTOM_RADIUS = 9;
const NOTCH_TOP_FLARE = 5.5;
const PANEL_WIDTH = 404;
const PANEL_HEIGHT = 123;
const PANEL_BOTTOM_RADIUS = 32;
const TOP_ROW_CENTER_CLEARANCE = 24;
const TOP_ROW_CENTER_WIDTH = NOTCH_WIDTH + NOTCH_TOP_FLARE * 2 + TOP_ROW_CENTER_CLEARANCE;
const PANEL_HOVER_MARGIN = 20;
const EXPAND_DURATION_MS = 250;
const COLLAPSE_DURATION_MS = 200;
const COLLAPSE_DELAY_MS = 300;
const HOVER_POLL_INTERVAL_MS = 50;
const CONTENT_FADE_DURATION_MS = 120;

const NOTCH_WINDOW_WIDTH = NOTCH_WIDTH + NOTCH_TOP_FLARE * 2;
const PANEL_WINDOW_WIDTH = PANEL_WIDTH + NOTCH_TOP_FLARE * 2;

function getNotchBounds(displayBounds) {
  return {
    x: displayBounds.x + (displayBounds.width - NOTCH_WINDOW_WIDTH) / 2,
    y: displayBounds.y,
    width: NOTCH_WINDOW_WIDTH,
    height: NOTCH_HEIGHT
  };
}

function getPanelBounds(displayBounds) {
  return {
    x: displayBounds.x + (displayBounds.width - PANEL_WINDOW_WIDTH) / 2,
    y: displayBounds.y,
    width: PANEL_WINDOW_WIDTH,
    height: PANEL_HEIGHT
  };
}

function getHoverZone(notchBounds, panelBounds, expanded) {
  if (!expanded) return { ...notchBounds };

  return {
    x: panelBounds.x - PANEL_HOVER_MARGIN,
    y: panelBounds.y - PANEL_HOVER_MARGIN,
    width: panelBounds.width + PANEL_HOVER_MARGIN * 2,
    height: panelBounds.height + PANEL_HOVER_MARGIN * 2
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

function getShapePath(baseWidth, height, bottomRadius) {
  const viewWidth = PANEL_WINDOW_WIDTH;
  const left = (viewWidth - baseWidth) / 2;
  const right = left + baseWidth;
  const outerLeft = left - NOTCH_TOP_FLARE;
  const outerRight = right + NOTCH_TOP_FLARE;
  const bottom = height - bottomRadius;

  return [
    `M ${outerLeft} 0`,
    `H ${outerRight}`,
    `C ${outerRight} 0 ${right} 0 ${right} ${NOTCH_TOP_FLARE}`,
    `V ${bottom}`,
    `Q ${right} ${height} ${right - bottomRadius} ${height}`,
    `H ${left + bottomRadius}`,
    `Q ${left} ${height} ${left} ${bottom}`,
    `V ${NOTCH_TOP_FLARE}`,
    `C ${left} 0 ${outerLeft} 0 ${outerLeft} 0`,
    'Z'
  ].join(' ');
}

const NOTCH_SHAPE_PATH = getShapePath(NOTCH_WIDTH, NOTCH_HEIGHT, NOTCH_BOTTOM_RADIUS);
const PANEL_SHAPE_PATH = getShapePath(PANEL_WIDTH, PANEL_HEIGHT, PANEL_BOTTOM_RADIUS);

module.exports = {
  COLLAPSE_DELAY_MS,
  COLLAPSE_DURATION_MS,
  CONTENT_FADE_DURATION_MS,
  EXPAND_DURATION_MS,
  HOVER_POLL_INTERVAL_MS,
  NOTCH_BOTTOM_RADIUS,
  NOTCH_HEIGHT,
  NOTCH_SHAPE_PATH,
  NOTCH_TOP_FLARE,
  NOTCH_WIDTH,
  NOTCH_WINDOW_WIDTH,
  PANEL_BOTTOM_RADIUS,
  PANEL_HEIGHT,
  PANEL_HOVER_MARGIN,
  PANEL_SHAPE_PATH,
  PANEL_WIDTH,
  PANEL_WINDOW_WIDTH,
  TOP_ROW_CENTER_CLEARANCE,
  TOP_ROW_CENTER_WIDTH,
  getHoverZone,
  getNotchBounds,
  getPanelBounds,
  getShapePath,
  isPointInBounds
};
