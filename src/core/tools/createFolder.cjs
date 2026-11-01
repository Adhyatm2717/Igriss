const fs = require('node:fs');
const { assertNotExists, resolveAllowedPath } = require('./pathGuard.cjs');

function createFolder(folderPath, options = {}) {
  const target = resolveAllowedPath(folderPath, options);
  assertNotExists(target);
  fs.mkdirSync(target);

  return {
    result: { path: target },
    inverse: { tool: 'removeEmptyFolder', args: { path: target } }
  };
}

module.exports = { createFolder };
