const fs = require('node:fs');
const path = require('node:path');
const { assertNotExists, resolveAllowedPath } = require('./pathGuard.cjs');

function rename(from, to, options = {}) {
  const source = resolveAllowedPath(from, options);
  const destination = resolveAllowedPath(to, options);
  if (source === destination) throw new Error('Source and destination must be different');
  if (path.dirname(source) !== path.dirname(destination)) {
    throw new Error('Rename must stay in the same directory; use move to change directories');
  }
  assertNotExists(destination);
  fs.renameSync(source, destination);

  return {
    result: { from: source, to: destination },
    inverse: { tool: 'rename', args: { from: destination, to: source } }
  };
}

module.exports = { rename };
