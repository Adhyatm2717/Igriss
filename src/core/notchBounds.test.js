import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  COLLAPSE_MARGIN,
  EXPANDED_HEIGHT,
  EXPANDED_WIDTH,
  HOVER_MARGIN,
  NOTCH_WIDTH,
  getExpandedBounds,
  getHoverZone,
  getMenuBarHeight,
  getNotchBounds,
  getNotchShapePath,
  isPointInBounds
} = require('./notchBounds.cjs');

describe('notch geometry', () => {
  const displayBounds = { x: 100, y: 24, width: 1512, height: 982 };

  it('uses the primary display work-area inset as the menu bar height', () => {
    expect(
      getMenuBarHeight(displayBounds, { x: 100, y: 54, width: 1512, height: 952 })
    ).toBe(30);
  });

  it('centers a notch-sized top row and the full expanded bounds on display bounds', () => {
    const menuBarHeight = 30;

    expect(getNotchBounds(displayBounds, menuBarHeight)).toEqual({
      x: 756,
      y: 24,
      width: NOTCH_WIDTH,
      height: menuBarHeight
    });
    expect(getExpandedBounds(displayBounds)).toEqual({
      x: 616,
      y: 24,
      width: EXPANDED_WIDTH,
      height: EXPANDED_HEIGHT
    });
  });

  it('starts the solid shape with an exact NOTCH_WIDTH row and curves into the panel', () => {
    const path = getNotchShapePath(30);

    expect(path.startsWith(`M 140 0 H 340 V 30 `)).toBe(true);
    expect(path).toContain(`L ${EXPANDED_WIDTH} ${EXPANDED_HEIGHT - 20}`);
    expect(path).toContain('Q 0 240 0 220');
  });
});

describe('notch hover zones', () => {
  const displayBounds = { x: 0, y: 0, width: 1512, height: 982 };
  const notchBounds = getNotchBounds(displayBounds, 30);
  const expandedBounds = getExpandedBounds(displayBounds);

  it('keeps the closed hover zone centered at NOTCH_WIDTH plus 40px', () => {
    const zone = getHoverZone(notchBounds, expandedBounds, 30, false);

    expect(zone).toEqual({
      x: notchBounds.x - HOVER_MARGIN,
      y: 0,
      width: NOTCH_WIDTH + 40,
      height: 30
    });
    expect(isPointInBounds({ x: zone.x, y: 29 }, zone)).toBe(true);
    expect(isPointInBounds({ x: zone.x - 1, y: 29 }, zone)).toBe(false);
    expect(isPointInBounds({ x: zone.x + 40, y: 30 }, zone)).toBe(false);
  });

  it('adds a 20px margin around the expanded window for collapse detection', () => {
    const zone = getHoverZone(notchBounds, expandedBounds, 30, true);

    expect(zone).toEqual({
      x: expandedBounds.x - COLLAPSE_MARGIN,
      y: expandedBounds.y - COLLAPSE_MARGIN,
      width: expandedBounds.width + COLLAPSE_MARGIN * 2,
      height: expandedBounds.height + COLLAPSE_MARGIN * 2
    });
    expect(isPointInBounds({ x: zone.x, y: zone.y }, zone)).toBe(true);
    expect(isPointInBounds({ x: zone.x + zone.width, y: zone.y }, zone)).toBe(false);
  });
});
