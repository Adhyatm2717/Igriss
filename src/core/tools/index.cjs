const { createFolder } = require('./createFolder.cjs');
const { deletePath, restore } = require('./delete.cjs');
const { move } = require('./move.cjs');
const { rename } = require('./rename.cjs');
const { writeFile } = require('./writeFile.cjs');

module.exports = {
  createFolder,
  delete: deletePath,
  deletePath,
  move,
  rename,
  restore,
  writeFile
};
