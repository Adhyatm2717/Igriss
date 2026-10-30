const fs = require('node:fs');
const path = require('node:path');
const { getTrashRoot, resolveTrashPath } = require('./pathGuard.cjs');

function purge(targetPath, options = {}) {
  const target = resolveTrashPath(targetPath, options);
  const { trashRoot } = getTrashRoot(options);
  if (target !== trashRoot && !target.startsWith(`${trashRoot}${path.sep}`)) {
    throw new Error('Purge target must be inside ~/.igriss/temp');
  }
  fs.rmSync(target, { recursive: true, force: false });
  return { result: { purgedPath: target }, inverse: null };
}

module.exports = { purge };
