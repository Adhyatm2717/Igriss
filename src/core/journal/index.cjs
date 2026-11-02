const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const defaultTools = require('../tools/index.cjs');

const MAX_UNDO_COMMANDS = 7;
const PLAN_TOOLS = ['move', 'rename', 'createFolder', 'removeEmptyFolder', 'writeFile', 'delete', 'find'];
const INVERSE_TOOLS = ['move', 'rename', 'createFolder', 'removeEmptyFolder', 'writeFile', 'delete', 'restore'];
const PATH_ARGUMENTS = {
  move: ['from', 'to'],
  rename: ['from', 'to'],
  createFolder: ['path'],
  removeEmptyFolder: ['path'],
  writeFile: ['path'],
  delete: ['path'],
  restore: ['from', 'to']
};

function cloneJson(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return { type: 'Buffer', data: Array.from(value) };
  }
  if (typeof value !== 'object') throw new TypeError('Journal data must contain only plain JSON values');
  if (seen.has(value)) throw new TypeError('Journal data cannot contain circular references');
  seen.add(value);
  let result;
  if (Array.isArray(value)) {
    result = value.map((item) => cloneJson(item, seen));
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Journal data must contain only plain JSON objects');
    }
    result = {};
    for (const [key, item] of Object.entries(value)) result[key] = cloneJson(item, seen);
  }
  seen.delete(value);
  return result;
}

function validateDisplayPath(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || value.startsWith('~') || value.includes('\0')) {
    throw new Error('Journal paths must be absolute paths; relative and ~ paths are rejected');
  }
  if (value.split(path.sep).includes('..') || path.resolve(value) !== value) {
    throw new Error('Journal paths must be fully resolved absolute paths');
  }
  if (['*', '?', '[', ']', '{', '}'].some((character) => value.includes(character))) {
    throw new Error('Journal paths must be concrete; glob characters are rejected');
  }
}

function validateEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry) || !Array.isArray(entry.steps)
    || typeof entry.id !== 'string' || typeof entry.timestamp !== 'string'
    || typeof entry.request !== 'string'
    || !['done', 'undone', 'partially_undone'].includes(entry.status)) {
    throw new Error('Invalid journal entry');
  }
  for (const step of entry.steps) {
    if (!step || typeof step !== 'object' || typeof step.tool !== 'string' || !step.args) {
      throw new Error('Invalid journal step');
    }
    if (!PLAN_TOOLS.includes(step.tool)) throw new Error(`Unknown journal tool: ${step.tool}`);
    for (const key of PATH_ARGUMENTS[step.tool] || []) {
      validateDisplayPath(step.args[key]);
    }
    if (step.inverse) {
      if (!INVERSE_TOOLS.includes(step.inverse.tool)) throw new Error(`Unknown inverse tool: ${step.inverse.tool}`);
      for (const key of PATH_ARGUMENTS[step.inverse.tool] || []) {
        validateDisplayPath(step.inverse.args?.[key]);
      }
    }
    cloneJson(step);
  }
  cloneJson(entry);
}

function assertExists(target) {
  try {
    fs.lstatSync(target);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      throw new Error(`Undo precondition failed: source is missing: ${target}`);
    }
    throw error;
  }
}

function assertFree(target) {
  try {
    fs.lstatSync(target);
    throw new Error(`Undo precondition failed: destination is occupied: ${target}`);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return;
    throw error;
  }
}

function createJournal(options = {}) {
  const journalPath = path.resolve(options.journalPath || path.join(os.homedir(), '.igriss', 'journal.json'));
  const tools = options.tools || defaultTools;
  const now = options.now || (() => new Date());
  const makeId = options.idFactory || crypto.randomUUID;
  let entries = null;

  function writeAtomic() {
    const directory = path.dirname(journalPath);
    fs.mkdirSync(directory, { recursive: true });
    const temporary = path.join(directory, `.${path.basename(journalPath)}.${makeId()}.tmp`);
    fs.writeFileSync(temporary, `${JSON.stringify(entries, null, 2)}\n`, { flag: 'wx' });
    fs.renameSync(temporary, journalPath);
  }

  function load() {
    if (entries !== null) return cloneJson(entries);
    try {
      const parsed = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
      if (!Array.isArray(parsed)) throw new Error('Journal root must be an array');
      for (const entry of parsed) validateEntry(entry);
      entries = parsed;
    } catch (error) {
      if (error.code === 'ENOENT') {
        entries = [];
      } else {
        try {
          const stamp = now().toISOString().replace(/[:.]/g, '-');
          const backup = path.join(path.dirname(journalPath), `journal.corrupt.${stamp}.json`);
          fs.renameSync(journalPath, backup);
        } catch {
          // Recovery is best effort; callers must not crash on corrupt journal data.
        }
        entries = [];
      }
    }
    return cloneJson(entries);
  }

  function append(entry) {
    if (entries === null) load();
    const safeEntry = cloneJson(entry);
    validateEntry(safeEntry);
    const previous = entries;
    entries.push(safeEntry);
    try {
      writeAtomic();
    } catch (error) {
      entries = previous.slice(0, -1);
      throw error;
    }
    return cloneJson(safeEntry);
  }

  function resolvePlanStep(step) {
    if (!step || !PLAN_TOOLS.includes(step.tool) || typeof tools[step.tool] !== 'function') {
      throw new Error(`Unknown or unavailable tool: ${String(step?.tool)}`);
    }
    const args = cloneJson(step.args || {});
    if (step.tool === 'writeFile' && args.content?.type === 'Buffer' && Array.isArray(args.content.data)) {
      args.content = Buffer.from(args.content.data);
    }
    for (const key of PATH_ARGUMENTS[step.tool] || []) {
      const value = args[key];
      validateDisplayPath(value);
      const { resolveAllowedPath } = require('../tools/pathGuard.cjs');
      args[key] = resolveAllowedPath(value, options.toolOptions || {});
    }
    return { tool: step.tool, args };
  }

  function checkInverse(inverse) {
    const args = inverse.args || {};
    switch (inverse.tool) {
      case 'move':
      case 'rename':
        assertExists(args.from);
        assertFree(args.to);
        break;
      case 'restore':
        assertExists(args.from);
        assertFree(args.to);
        break;
      case 'delete':
        assertExists(args.path);
        if (args.expectedSha256) {
          const current = crypto.createHash('sha256').update(fs.readFileSync(args.path)).digest('hex');
          if (current !== args.expectedSha256) {
            throw new Error(`Undo precondition failed: file checksum changed: ${args.path}`);
          }
        }
        break;
      case 'removeEmptyFolder':
        assertExists(args.path);
        break;
      case 'createFolder':
        assertFree(args.path);
        break;
      case 'writeFile':
        assertFree(args.path);
        break;
      default:
        throw new Error(`Unsupported inverse tool: ${String(inverse.tool)}`);
    }
  }

  function runInverse(inverse) {
    checkInverse(inverse);
    switch (inverse.tool) {
      case 'move': return tools.move(inverse.args.from, inverse.args.to, options.toolOptions || {});
      case 'rename': return tools.rename(inverse.args.from, inverse.args.to, options.toolOptions || {});
      case 'restore': return tools.restore(inverse.args.from, inverse.args.to, options.toolOptions || {});
      case 'delete': return tools.delete(inverse.args.path, {
        ...(options.toolOptions || {}),
        expectedSha256: inverse.args.expectedSha256
      });
      case 'removeEmptyFolder': return tools.removeEmptyFolder(inverse.args.path, options.toolOptions || {});
      case 'createFolder': return tools.createFolder(inverse.args.path, options.toolOptions || {});
      case 'writeFile': return tools.writeFile(inverse.args.path, inverse.args.content, options.toolOptions || {});
      default: throw new Error(`Unsupported inverse tool: ${String(inverse.tool)}`);
    }
  }

  function executeAndRecord(command, steps) {
    if (typeof command !== 'string') throw new TypeError('Command text must be a string');
    if (!Array.isArray(steps)) throw new TypeError('Steps must be an array');
    const completed = [];
    const results = [];
    try {
      for (const inputStep of steps) {
        const step = resolvePlanStep(inputStep);
        const operation = tools[step.tool](...toolArguments(step, options.toolOptions || {}));
        const recorded = {
          tool: step.tool,
          args: step.args,
          result: cloneJson(operation.result),
          inverse: cloneJson(operation.inverse)
        };
        validateEntry({ id: 'pending', timestamp: now().toISOString(), request: command, status: 'done', steps: [recorded] });
        completed.push(recorded);
        results.push(cloneJson(operation.result));
      }
      const entry = {
        id: makeId(),
        timestamp: now().toISOString(),
        request: command,
        status: 'done',
        steps: completed
      };
      append(entry);
      return { entry: cloneJson(entry), results };
    } catch (error) {
      const rollbackErrors = [];
      for (const step of completed.slice().reverse()) {
        try { runInverse(step.inverse); } catch (rollbackError) { rollbackErrors.push(rollbackError.message); }
      }
      const message = rollbackErrors.length
        ? `${error.message}; rollback also failed: ${rollbackErrors.join('; ')}`
        : error.message;
      return { error: new Error(message) };
    }
  }

  function toolArguments(step, toolOptions) {
    const args = step.args;
    switch (step.tool) {
      case 'move':
      case 'rename': return [args.from, args.to, toolOptions];
      case 'createFolder':
      case 'removeEmptyFolder': return [args.path, toolOptions];
      case 'writeFile': return [args.path, args.content, toolOptions];
      case 'delete': return [args.path, { ...toolOptions, expectedSha256: args.expectedSha256 }];
      case 'find': return [args, toolOptions];
      default: throw new Error(`Unknown tool: ${step.tool}`);
    }
  }

  function undo(count) {
    if (!Number.isInteger(count) || count < 0 || count > MAX_UNDO_COMMANDS) {
      return { error: new Error(`Undo count must be an integer from 0 to ${MAX_UNDO_COMMANDS}`) };
    }
    if (entries === null) load();
    const targets = count === 0 ? [] : entries.filter((entry) => entry.status === 'done').slice(-count).reverse();
    const undone = [];
    for (const entry of targets) {
      for (let index = entry.steps.length - 1; index >= 0; index -= 1) {
        const step = entry.steps[index];
        try {
          runInverse(step.inverse);
        } catch (error) {
          entry.status = 'partially_undone';
          entry.undoFailure = { stepIndex: index, reason: error.message };
          writeAtomic();
          return { error: new Error(`Undo stopped for command ${entry.id} at step ${index}: ${error.message}`), undone };
        }
      }
      entry.status = 'undone';
      delete entry.undoFailure;
      writeAtomic();
      undone.push(entry.id);
    }
    return { undone };
  }

  return { append, executeAndRecord, load, undo, journalPath };
}

module.exports = { createJournal, MAX_UNDO_COMMANDS };
