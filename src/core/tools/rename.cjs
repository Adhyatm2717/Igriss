const fs = require('node:fs');
const path = require('node:path');
const { assertNotExists, resolveAllowedPath } = require('./pathGuard.cjs');

function rename(from, to, options = {}) {
  const source = resolveAllowedPath(from, options);
  const destination = resolveAllowedPath(to, options);
  const requestedDestination = path.join(path.dirname(source), path.basename(path.resolve(to)));
  const sameDirectory = path.dirname(source) === path.dirname(requestedDestination);
  const caseOnly = sameDirectory
    && path.basename(source).toLocaleLowerCase() === path.basename(requestedDestination).toLocaleLowerCase()
    && path.basename(source) !== path.basename(requestedDestination);
  if (source === destination && !caseOnly) throw new Error('Source and destination must be different');
  if (!sameDirectory || path.dirname(source) !== path.dirname(destination)) {
    throw new Error('Rename must stay in the same directory; use move to change directories');
  }
  if (!caseOnly) assertNotExists(destination);
  fs.renameSync(source, requestedDestination);
  const finalDestination = resolveAllowedPath(requestedDestination, options);

  return {
    result: { from: source, to: finalDestination },
    inverse: { tool: 'rename', args: { from: finalDestination, to: source } }
  };
}

module.exports = { rename };
