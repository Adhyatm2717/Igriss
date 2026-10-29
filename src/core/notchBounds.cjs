const NOTCH_WIDTH = 200;
const EXPANDED_WIDTH = 480;
const EXPANDED_HEIGHT = 240;
const HOVER_MARGIN = 20;
const COLLAPSE_MARGIN = 20;
const COLLAPSE_DELAY_MS = 300;
const HOVER_POLL_INTERVAL_MS = 50;
const TRANSITION_DURATION_MS = 200;
const BOTTOM_CORNER_RADIUS = 20;
const EAR_CURVE_HEIGHT = 48;

function getMenuBarHeight(displayBounds, workAreaBounds) {
  return Math.max(0, workAreaBounds.y - displayBounds.y);
}

function getNotchBounds(displayBounds, menuBarHeight) {
  return {
    x: Math.round(displayBounds.x + (displayBounds.width - NOTCH_WIDTH) / 2),
    y: displayBounds.y,
    width: NOTCH_WIDTH,
    height: menuBarHeight
  };
}

function getExpandedBounds(displayBounds) {
  return {
    x: Math.round(displayBounds.x + (displayBounds.width - EXPANDED_WIDTH) / 2),
    y: displayBounds.y,
    width: EXPANDED_WIDTH,
    height: EXPANDED_HEIGHT
  };
}

function getHoverZone(notchBounds, expandedBounds, menuBarHeight, expanded) {
  if (expanded) {
    return {
      x: expandedBounds.x - COLLAPSE_MARGIN,
      y: expandedBounds.y - COLLAPSE_MARGIN,
      width: expandedBounds.width + COLLAPSE_MARGIN * 2,
      height: expandedBounds.height + COLLAPSE_MARGIN * 2
    };
  }

  return {
    x: notchBounds.x - HOVER_MARGIN,
    y: notchBounds.y,
    width: notchBounds.width + HOVER_MARGIN * 2,
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

function getNotchShapePath(menuBarHeight) {
  const left = (EXPANDED_WIDTH - NOTCH_WIDTH) / 2;
  const right = left + NOTCH_WIDTH;
  const earBottom = menuBarHeight + EAR_CURVE_HEIGHT;
  const bottom = EXPANDED_HEIGHT - BOTTOM_CORNER_RADIUS;

  return [
    `M ${left} 0`,
    `H ${right}`,
    `V ${menuBarHeight}`,
    `C ${right} ${menuBarHeight + 12} ${right} ${menuBarHeight + 24} ${right + 24} ${menuBarHeight + 24}`,
    `C ${right + 60} ${menuBarHeight + 24} ${EXPANDED_WIDTH - 40} ${menuBarHeight + 36} ${EXPANDED_WIDTH} ${earBottom}`,
    `L ${EXPANDED_WIDTH} ${bottom}`,
    `Q ${EXPANDED_WIDTH} ${EXPANDED_HEIGHT} ${EXPANDED_WIDTH - BOTTOM_CORNER_RADIUS} ${EXPANDED_HEIGHT}`,
    `H ${BOTTOM_CORNER_RADIUS}`,
    `Q 0 ${EXPANDED_HEIGHT} 0 ${bottom}`,
    `L 0 ${earBottom}`,
    `C 40 ${menuBarHeight + 36} ${left - 60} ${menuBarHeight + 24} ${left - 24} ${menuBarHeight + 24}`,
    `C ${left} ${menuBarHeight + 24} ${left} ${menuBarHeight + 12} ${left} ${menuBarHeight}`,
    'Z'
  ].join(' ');
}

module.exports = {
  BOTTOM_CORNER_RADIUS,
  COLLAPSE_DELAY_MS,
  COLLAPSE_MARGIN,
  EAR_CURVE_HEIGHT,
  EXPANDED_HEIGHT,
  EXPANDED_WIDTH,
  HOVER_MARGIN,
  HOVER_POLL_INTERVAL_MS,
  NOTCH_WIDTH,
  TRANSITION_DURATION_MS,
  getExpandedBounds,
  getHoverZone,
  getMenuBarHeight,
  getNotchBounds,
  getNotchShapePath,
  isPointInBounds
};
