import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  COLLAPSE_DELAY_MS,
  COLLAPSE_DURATION_MS,
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
  TOP_ROW_CENTER_WIDTH,
  getHoverZone,
  getNotchBounds,
  getPanelBounds,
  getShapePath,
  isPointInBounds
} = require('./notchBounds.cjs');

describe('notch and panel geometry', () => {
  const displayBounds = { x: 0, y: 0, width: 1512, height: 982 };

  it('keeps the specified MacBook Pro point dimensions as named constants', () => {
    expect({ NOTCH_WIDTH, NOTCH_HEIGHT, NOTCH_BOTTOM_RADIUS, NOTCH_TOP_FLARE }).toEqual({
      NOTCH_WIDTH: 185,
      NOTCH_HEIGHT: 32,
      NOTCH_BOTTOM_RADIUS: 9,
      NOTCH_TOP_FLARE: 5.5
    });
    expect({ PANEL_WIDTH, PANEL_HEIGHT, PANEL_BOTTOM_RADIUS }).toEqual({
      PANEL_WIDTH: 404,
      PANEL_HEIGHT: 123,
      PANEL_BOTTOM_RADIUS: 32
    });
    expect({ EXPAND_DURATION_MS, COLLAPSE_DURATION_MS, COLLAPSE_DELAY_MS }).toEqual({
      EXPAND_DURATION_MS: 250,
      COLLAPSE_DURATION_MS: 200,
      COLLAPSE_DELAY_MS: 300
    });
    expect(HOVER_POLL_INTERVAL_MS).toBe(50);
    expect(TOP_ROW_CENTER_WIDTH).toBe(NOTCH_WIDTH + NOTCH_TOP_FLARE * 2 + 24);
  });

  it('centers the idle and panel windows on display bounds at the top edge', () => {
    expect(getNotchBounds(displayBounds)).toEqual({
      x: 658,
      y: 0,
      width: NOTCH_WINDOW_WIDTH,
      height: NOTCH_HEIGHT
    });
    expect(getPanelBounds(displayBounds)).toEqual({
      x: 548.5,
      y: 0,
      width: PANEL_WINDOW_WIDTH,
      height: PANEL_HEIGHT
    });
  });

  it('creates a 185px notch body with 5.5px top flares and the panel endpoints', () => {
    expect(NOTCH_SHAPE_PATH.startsWith('M 109.5 0 H 305.5')).toBe(true);
    expect(PANEL_SHAPE_PATH.startsWith('M 0 0 H 415')).toBe(true);
    expect(NOTCH_SHAPE_PATH).toContain(`V ${NOTCH_HEIGHT - NOTCH_BOTTOM_RADIUS}`);
    expect(PANEL_SHAPE_PATH).toContain(`V ${PANEL_HEIGHT - PANEL_BOTTOM_RADIUS}`);
    expect(getShapePath(NOTCH_WIDTH, NOTCH_HEIGHT, NOTCH_BOTTOM_RADIUS)).toBe(NOTCH_SHAPE_PATH);

    const tokenize = (path) => path.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)/g);
    const notchTokens = tokenize(NOTCH_SHAPE_PATH);
    const panelTokens = tokenize(PANEL_SHAPE_PATH);
    expect(notchTokens).toHaveLength(panelTokens.length);
    expect(notchTokens.filter((token) => /^[A-Za-z]$/.test(token))).toEqual(
      panelTokens.filter((token) => /^[A-Za-z]$/.test(token))
    );
  });
});

describe('notch hover zones', () => {
  const displayBounds = { x: 0, y: 0, width: 1512, height: 982 };
  const notchBounds = getNotchBounds(displayBounds);
  const panelBounds = getPanelBounds(displayBounds);

  it('uses the visible notch bounds as its idle hover zone', () => {
    const zone = getHoverZone(notchBounds, panelBounds, false);

    expect(zone).toEqual(notchBounds);
    expect(isPointInBounds({ x: notchBounds.x, y: 0 }, zone)).toBe(true);
    expect(isPointInBounds({ x: notchBounds.x - 1, y: 0 }, zone)).toBe(false);
    expect(isPointInBounds({ x: notchBounds.x, y: NOTCH_HEIGHT }, zone)).toBe(false);
  });

  it('extends the expanded panel hover zone by the named 20px margin', () => {
    const zone = getHoverZone(notchBounds, panelBounds, true);

    expect(zone).toEqual({
      x: panelBounds.x - PANEL_HOVER_MARGIN,
      y: panelBounds.y - PANEL_HOVER_MARGIN,
      width: panelBounds.width + PANEL_HOVER_MARGIN * 2,
      height: panelBounds.height + PANEL_HOVER_MARGIN * 2
    });
    expect(isPointInBounds({ x: zone.x, y: zone.y }, zone)).toBe(true);
    expect(isPointInBounds({ x: zone.x + zone.width, y: zone.y }, zone)).toBe(false);
  });
});
