const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function isWithin(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function requireAbsolutePath(input) {
  if (typeof input !== 'string' || input.length === 0 || !path.isAbsolute(input)) {
    throw new Error('Path must be a non-empty absolute path');
  }
  if (input.includes('\\0')) throw new Error('Null bytes are not allowed in paths');
  let checked = input;
  // Decode repeatedly so double-encoded traversal is rejected too. The decoded
  // value is for validation only; filesystem paths retain their literal names.
  for (let pass = 0; pass < 4; pass += 1) {
    if (checked.split(/[\\/]+/).includes('..')) {
      throw new Error('Path traversal is not allowed');
    }
    try {
      const decoded = decodeURIComponent(checked);
      if (decoded === checked) break;
      checked = decoded;
    } catch {
      break;
    }
  }
  if (checked.split(/[\\/]+/).includes('..')) {
    throw new Error('Path traversal is not allowed');
  }
  if (['*', '?', '[', ']', '{', '}'].some((character) => input.includes(character))) {
    throw new Error('Glob patterns are not allowed; provide a concrete path');
  }
  return path.resolve(input);
}

function findExistingAncestor(target) {
  let current = target;
  const suffix = [];

  while (true) {
    try {
      fs.lstatSync(current);
      return { existing: current, suffix };
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
      const parent = path.dirname(current);
      if (parent === current) throw new Error(`No existing ancestor for path: ${target}`);
      suffix.unshift(path.basename(current));
      current = parent;
    }
  }
}

function getConfiguredPaths(options = {}) {
  const home = options.homeDir || os.homedir();
  const allowedRoots = options.allowedRoots || [
    path.join(home, 'Desktop'),
    path.join(home, 'Downloads'),
    path.join(home, 'Documents')
  ];
  return {
    allowedRoots: allowedRoots.map((root) => path.resolve(root)),
    igrissHome: path.resolve(options.igrissHome || path.join(home, '.igriss'))
  };
}

function resolveAllowedPath(input, options = {}) {
  const candidate = requireAbsolutePath(input);
  const { allowedRoots, igrissHome } = getConfiguredPaths(options);

  if (isWithin(candidate, igrissHome)) {
    throw new Error('Paths inside ~/.igriss are not allowed');
  }

  const lexicalRoots = allowedRoots.filter((root) => isWithin(candidate, root));
  if (lexicalRoots.length === 0) throw new Error('Path is outside the allowed roots');
  if (lexicalRoots.some((root) => candidate === root)) {
    throw new Error('A protected root cannot be used as a file path');
  }

  const existing = findExistingAncestor(candidate);
  const realAncestor = fs.realpathSync(existing.existing);
  const realCandidate = path.resolve(realAncestor, ...existing.suffix);
  const realRoots = allowedRoots
    .map((root) => {
      try {
        return fs.realpathSync(root);
      } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return undefined;
        throw error;
      }
    })
    .filter(Boolean);

  if (!realRoots.some((root) => isWithin(realCandidate, root))) {
    throw new Error('Path resolves outside the allowed roots');
  }
  if (realRoots.some((root) => realCandidate === root)) {
    throw new Error('A protected root cannot be used as a file path');
  }

  let realIgrissHome;
  try {
    realIgrissHome = fs.realpathSync(igrissHome);
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
  }
  if (isWithin(realCandidate, realIgrissHome || igrissHome)) {
    throw new Error('Paths inside ~/.igriss are not allowed');
  }

  try {
    if (fs.lstatSync(candidate).isSymbolicLink()) {
      throw new Error('Symbolic link paths are not allowed');
    }
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
  }

  return realCandidate;
}

function assertNotExists(target) {
  try {
    fs.lstatSync(target);
    throw new Error(`Destination already exists: ${target}`);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return;
    throw error;
  }
}

function getTrashRoot(options = {}) {
  const { igrissHome } = getConfiguredPaths(options);
  const requestedTrashRoot = path.resolve(options.trashRoot || path.join(igrissHome, 'temp'));
  if (requestedTrashRoot !== path.join(igrissHome, 'temp')) {
    throw new Error('Trash root must be ~/.igriss/temp');
  }
  let trashRoot = requestedTrashRoot;
  try {
    trashRoot = fs.realpathSync(requestedTrashRoot);
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
  }
  return { igrissHome, trashRoot };
}

function ensureTrashRoot(options = {}) {
  const { igrissHome, trashRoot } = getTrashRoot(options);
  try {
    if (fs.lstatSync(igrissHome).isSymbolicLink()) {
      throw new Error('~/.igriss cannot be a symbolic link');
    }
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
  }
  fs.mkdirSync(trashRoot, { recursive: true });
  const realHome = fs.realpathSync(igrissHome);
  const realTrash = fs.realpathSync(trashRoot);
  if (!isWithin(realTrash, realHome)) throw new Error('Trash root resolves outside ~/.igriss');
  return { igrissHome, trashRoot: realTrash, realTrash };
}

function resolveTrashPath(input, options = {}) {
  const candidate = requireAbsolutePath(input);
  const { igrissHome, trashRoot } = getTrashRoot(options);
  if (!isWithin(candidate, trashRoot)) throw new Error('Path is outside ~/.igriss/temp');

  const realTrash = fs.realpathSync(trashRoot);
  const existing = findExistingAncestor(candidate);
  const realAncestor = fs.realpathSync(existing.existing);
  const realCandidate = path.resolve(realAncestor, ...existing.suffix);
  if (!isWithin(realCandidate, realTrash)) throw new Error('Path resolves outside ~/.igriss/temp');

  try {
    if (fs.lstatSync(candidate).isSymbolicLink()) throw new Error('Symbolic link paths are not allowed');
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
  }
  if (!isWithin(realCandidate, fs.realpathSync(igrissHome))) {
    throw new Error('Path resolves outside ~/.igriss');
  }
  return realCandidate;
}

module.exports = {
  assertNotExists,
  ensureTrashRoot,
  getConfiguredPaths,
  getTrashRoot,
  isWithin,
  resolveAllowedPath,
  resolveTrashPath
};
