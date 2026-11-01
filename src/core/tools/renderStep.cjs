const os = require('node:os');
const path = require('node:path');
const { getTrashRoot, resolveAllowedPath } = require('./pathGuard.cjs');

function shellQuote(value) {
  if (/^[A-Za-z0-9_./~:-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function formatAbsolutePath(absolutePath, homeDir) {
  const relative = path.relative(homeDir, absolutePath);
  const displayPath = relative === ''
    ? '~'
    : relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
      ? `~/${relative.split(path.sep).join('/')}`
      : absolutePath;
  return shellQuote(displayPath);
}

/** Returns a display string only. The returned shell-style text is never executed. */
function renderStep(step, options = {}) {
  if (!step || typeof step !== 'object' || !step.args || typeof step.args !== 'object') {
    throw new TypeError('Step must include a tool and args object');
  }

  const homeDir = path.resolve(options.homeDir || os.homedir());
  const displayPath = (value) => formatAbsolutePath(resolveAllowedPath(value, options), homeDir);

  switch (step.tool) {
    case 'move':
    case 'rename':
      return `$ mv ${displayPath(step.args.from)} ${displayPath(step.args.to)}`;
    case 'createFolder':
      return `$ mkdir ${displayPath(step.args.path)}`;
    case 'removeEmptyFolder':
      return `$ rmdir ${displayPath(step.args.path)}`;
    case 'writeFile':
      return `$ writeFile ${displayPath(step.args.path)}`;
    case 'delete': {
      const source = resolveAllowedPath(step.args.path, options);
      const { trashRoot } = getTrashRoot(options);
      const destination = path.join(trashRoot, '<uuid>', path.basename(source));
      return `$ mv ${formatAbsolutePath(source, homeDir)} ${formatAbsolutePath(destination, homeDir)}`;
    }
    default:
      throw new Error(`Unknown tool: ${String(step.tool)}`);
  }
}

module.exports = { renderStep };
