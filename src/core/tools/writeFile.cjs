const fs = require('node:fs');
const path = require('node:path');
const { assertNotExists, resolveAllowedPath } = require('./pathGuard.cjs');
const { deletePath } = require('./delete.cjs');
const { purge } = require('./purge.cjs');

function writeFile(filePath, content, options = {}) {
  const target = resolveAllowedPath(filePath, options);
  if (typeof content !== 'string' && !Buffer.isBuffer(content) && !(content instanceof Uint8Array)) {
    throw new TypeError('File content must be a string or byte array');
  }
  assertNotExists(target);
  fs.writeFileSync(target, content, { flag: 'wx' });
  const bytesWritten = Buffer.isBuffer(content) || content instanceof Uint8Array
    ? content.byteLength
    : Buffer.byteLength(content);

  return {
    result: { path: target, bytesWritten },
    inverse: { tool: 'undoWriteFile', args: { path: target, content } }
  };
}

function undoWriteFile(filePath, content, options = {}) {
  const removed = deletePath(filePath, options);
  const transactionDirectory = path.dirname(removed.result.trashPath);
  purge(removed.result.trashPath, options);
  purge(transactionDirectory, options);
  return {
    result: { path: removed.result.originalPath },
    inverse: { tool: 'writeFile', args: { path: removed.result.originalPath, content } }
  };
}

module.exports = { undoWriteFile, writeFile };
