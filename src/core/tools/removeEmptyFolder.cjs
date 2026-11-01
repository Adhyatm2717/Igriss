const fs = require('node:fs');
const { deletePath } = require('./delete.cjs');
const { resolveAllowedPath } = require('./pathGuard.cjs');

function removeEmptyFolder(folderPath, options = {}) {
  const target = resolveAllowedPath(folderPath, options);
  if (!fs.statSync(target).isDirectory()) throw new Error('Path is not a folder');
  if (fs.readdirSync(target).length > 0) throw new Error('Folder is not empty');

  return deletePath(target, options);
}

module.exports = { removeEmptyFolder };
