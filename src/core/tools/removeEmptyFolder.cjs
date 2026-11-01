const fs = require('node:fs');
const { resolveAllowedPath } = require('./pathGuard.cjs');

function removeEmptyFolder(folderPath, options = {}) {
  const target = resolveAllowedPath(folderPath, options);
  if (!fs.statSync(target).isDirectory()) throw new Error('Path is not a folder');
  if (fs.readdirSync(target).length > 0) throw new Error('Folder is not empty');

  fs.rmdirSync(target);

  return {
    result: { path: target },
    inverse: { tool: 'createFolder', args: { path: target } }
  };
}

module.exports = { removeEmptyFolder };
