import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  EXPANDED_HEIGHT,
  EXPANDED_WIDTH,
  HOVER_MARGIN,
  NO_NOTCH_PILL_HEIGHT,
  NO_NOTCH_PILL_WIDTH,
  NOTCH_WIDTH,
  getCollapsedSize,
  getHoverZone,
  getMenuBarHeight,
  getWindowBounds,
  isNotchedDisplay,
  isPointInBounds
} = require('./notchBounds.cjs');

describe('notch window geometry', () => {
  const displayBounds = { x: 100, y: 0, width: 1512, height: 982 };

  it('centers the expanded bounds at the top of the primary display', () => {
    expect(
      getWindowBounds(displayBounds, { width: EXPANDED_WIDTH, height: EXPANDED_HEIGHT })
    ).toEqual({ x: 616, y: 0, width: 480, height: 240 });
  });

  it('uses the menu bar height for a notched display and a small pill without a notch', () => {
    expect(getCollapsedSize(31, true)).toEqual({ width: NOTCH_WIDTH, height: 31 });
    expect(getCollapsedSize(31, false)).toEqual({
      width: NO_NOTCH_PILL_WIDTH,
      height: NO_NOTCH_PILL_HEIGHT
    });
  });

  it('reads menu bar height from the top work-area inset with a fallback', () => {
    expect(getMenuBarHeight(displayBounds, { x: 100, y: 30, width: 1512, height: 952 })).toBe(30);
    expect(getMenuBarHeight(displayBounds, displayBounds)).toBe(24);
  });

  it('identifies a built-in display with notch-like proportions', () => {
    expect(isNotchedDisplay({ internal: true, bounds: displayBounds })).toBe(true);
    expect(isNotchedDisplay({ internal: true, bounds: { width: 1440, height: 900 } })).toBe(false);
    expect(isNotchedDisplay({ internal: false, bounds: displayBounds })).toBe(false);
  });
});

describe('notch hover zone', () => {
  const collapsed = { x: 656, y: 0, width: 200, height: 30 };
  const expanded = { x: 516, y: 0, width: 480, height: 240 };

  it('adds a 30px horizontal margin and stays within the menu bar vertically', () => {
    const zone = getHoverZone(collapsed, expanded, 30, false);

    expect(zone).toEqual({ x: 656 - HOVER_MARGIN, y: 0, width: 200 + 2 * HOVER_MARGIN, height: 30 });
    expect(isPointInBounds({ x: 626, y: 29 }, zone)).toBe(true);
    expect(isPointInBounds({ x: 625, y: 29 }, zone)).toBe(false);
    expect(isPointInBounds({ x: 700, y: 30 }, zone)).toBe(false);
  });

  it('extends the hover zone to the full expanded window', () => {
    const zone = getHoverZone(collapsed, expanded, 30, true);

    expect(zone).toEqual(expanded);
    expect(isPointInBounds({ x: 516, y: 239 }, zone)).toBe(true);
    expect(isPointInBounds({ x: 996, y: 239 }, zone)).toBe(false);
    expect(isPointInBounds({ x: 516, y: 240 }, zone)).toBe(false);
  });
});
