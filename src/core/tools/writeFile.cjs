const fs = require('node:fs');
const crypto = require('node:crypto');
const { assertNotExists, resolveAllowedPath } = require('./pathGuard.cjs');
const { deletePath } = require('./delete.cjs');

function writeFile(filePath, content, options = {}) {
  const target = resolveAllowedPath(filePath, options);
  if (typeof content !== 'string' && !Buffer.isBuffer(content) && !(content instanceof Uint8Array)) {
    throw new TypeError('File content must be a string or byte array');
  }
  assertNotExists(target);
  fs.writeFileSync(target, content, { flag: 'wx' });
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
  const bytesWritten = bytes.byteLength;
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');

  return {
    result: { path: target, bytesWritten, sha256 },
    inverse: { tool: 'delete', args: { path: target, expectedSha256: sha256 } }
  };
}

module.exports = { writeFile };
