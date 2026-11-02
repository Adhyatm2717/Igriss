const { randomUUID } = require('node:crypto');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  assertNotExists,
  ensureTrashRoot,
  getTrashRoot,
  resolveAllowedPath,
  resolveTrashPath
} = require('./pathGuard.cjs');

function deletePath(filePath, options = {}) {
  const source = resolveAllowedPath(filePath, options);
  if (options.expectedSha256) {
    let currentSha256;
    try {
      currentSha256 = crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
    } catch (error) {
      if (error.code === 'ENOENT') throw new Error(`Cannot undo writeFile; file is missing: ${source}`);
      throw error;
    }
    if (currentSha256 !== options.expectedSha256) {
      throw new Error(`Cannot undo writeFile; file checksum changed: ${source}`);
    }
  }
  const { trashRoot } = ensureTrashRoot(options);
  const id = (options.idFactory || randomUUID)();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('Trash transaction id must be a UUID');
  }
  const transactionDirectory = path.join(trashRoot, id);
  fs.mkdirSync(transactionDirectory);
  const trashPath = resolveTrashPath(path.join(transactionDirectory, path.basename(source)), options);
  assertNotExists(trashPath);
  fs.renameSync(source, trashPath);

  return {
    result: { path: source, originalPath: source, trashPath },
    inverse: { tool: 'restore', args: { from: trashPath, to: source } }
  };
}

function restore(from, to, options = {}) {
  const source = resolveTrashPath(from, options);
  const { trashRoot } = getTrashRoot(options);
  const transactionDirectory = path.dirname(source);
  if (path.dirname(transactionDirectory) !== trashRoot) {
    throw new Error('Restore source must be directly inside a trash transaction directory');
  }

  const destination = resolveAllowedPath(to, options);
  assertNotExists(destination);
  fs.renameSync(source, destination);
  // The transaction directory is now empty; remove only that empty directory.
  fs.rmdirSync(transactionDirectory);

  return {
    result: { from: source, to: destination },
    inverse: { tool: 'delete', args: { path: destination } }
  };
}

module.exports = { delete: deletePath, deletePath, restore };
