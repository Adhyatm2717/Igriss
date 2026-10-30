const fs = require('node:fs');
const { assertNotExists, resolveAllowedPath } = require('./pathGuard.cjs');

function move(from, to, options = {}) {
  const source = resolveAllowedPath(from, options);
  const destination = resolveAllowedPath(to, options);
  if (source === destination) throw new Error('Source and destination must be different');
  assertNotExists(destination);
  fs.renameSync(source, destination);

  return {
    result: { from: source, to: destination },
    inverse: { tool: 'move', args: { from: destination, to: source } }
  };
}

module.exports = { move };
