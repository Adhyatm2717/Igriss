function getNotchBounds(displayBounds, size) {
  return {
    x: Math.round(displayBounds.x + (displayBounds.width - size.width) / 2),
    y: displayBounds.y,
    width: size.width,
    height: size.height
  };
}

module.exports = { getNotchBounds };
