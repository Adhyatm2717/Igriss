const fs = require('node:fs');
const { assertNotExists, resolveAllowedPath } = require('./pathGuard.cjs');

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
    inverse: { tool: 'delete', args: { path: target } }
  };
}

module.exports = { writeFile };
