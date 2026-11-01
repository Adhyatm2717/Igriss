const { createFolder } = require('./createFolder.cjs');
const { deletePath, restore } = require('./delete.cjs');
const { move } = require('./move.cjs');
const { purge } = require('./purge.cjs');
const { rename } = require('./rename.cjs');
const { removeEmptyFolder } = require('./removeEmptyFolder.cjs');
const { renderStep } = require('./renderStep.cjs');
const { undoWriteFile, writeFile } = require('./writeFile.cjs');

module.exports = {
  createFolder,
  delete: deletePath,
  deletePath,
  move,
  purge,
  rename,
  removeEmptyFolder,
  renderStep,
  restore,
  undoWriteFile,
  writeFile
};
