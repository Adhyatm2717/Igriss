import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const tools = require('../src/core/tools/index.cjs');

function snapshotTree(root) {
  const records = [];
  function visit(directory, relative = '') {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const name = path.join(relative, entry.name).split(path.sep).join('/');
      if (entry.isSymbolicLink()) {
        records.push(`L ${name} ${fs.readlinkSync(absolute)}`);
      } else if (entry.isDirectory()) {
        records.push(`D ${name}`);
        visit(absolute, path.join(relative, entry.name));
      } else if (entry.isFile()) {
        const digest = crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
        records.push(`F ${name} ${digest}`);
      } else {
        records.push(`O ${name}`);
      }
    }
  }
  visit(root);
  return records.join('\n');
}

function runInverse(inverse, options) {
  const { args } = inverse;
  switch (inverse.tool) {
    case 'move': return tools.move(args.from, args.to, options);
    case 'rename': return tools.rename(args.from, args.to, options);
    case 'createFolder': return tools.createFolder(args.path, options);
    case 'removeEmptyFolder': return tools.removeEmptyFolder(args.path, options);
    case 'writeFile': return tools.writeFile(args.path, args.content, options);
    case 'undoWriteFile': return tools.undoWriteFile(args.path, args.content, options);
    case 'delete': return tools.delete(args.path, options);
    case 'restore': return tools.restore(args.from, args.to, options);
    default: throw new Error(`Unexpected inverse tool: ${inverse.tool}`);
  }
}

const sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'igriss-smoke-')));
const desktop = path.join(sandbox, 'Desktop');
const igrissHome = path.join(sandbox, '.igriss');
const trashRoot = path.join(igrissHome, 'temp');
fs.mkdirSync(desktop);
fs.mkdirSync(trashRoot, { recursive: true });
let nextId = 0;
const options = {
  homeDir: sandbox,
  allowedRoots: [desktop],
  igrissHome,
  trashRoot,
  idFactory: () => `20000000-0000-4000-8000-${String(++nextId).padStart(12, '0')}`
};

try {
  for (let index = 1; index <= 12; index += 1) {
    const name = `Screenshot ${String(index).padStart(2, '0')}.png`;
    fs.writeFileSync(path.join(desktop, name), Buffer.from(`fake screenshot ${index}\n`));
  }
  const original = snapshotTree(sandbox);
  const inverses = [];
  const dates = ['2026-10-30', '2026-10-31', '2026-11-01'];

  function execute(step) {
    process.stdout.write(`${tools.renderStep(step, options)}\n`);
    let operation;
    switch (step.tool) {
      case 'createFolder': operation = tools.createFolder(step.args.path, options); break;
      case 'move': operation = tools.move(step.args.from, step.args.to, options); break;
      case 'delete': operation = tools.delete(step.args.path, options); break;
      default: throw new Error(`Unexpected smoke step: ${step.tool}`);
    }
    inverses.push(operation.inverse);
  }

  for (const date of dates) execute({ tool: 'createFolder', args: { path: path.join(desktop, date) } });
  for (let index = 1; index <= 12; index += 1) {
    const name = `Screenshot ${String(index).padStart(2, '0')}.png`;
    const date = dates[Math.floor((index - 1) / 4)];
    execute({ tool: 'move', args: { from: path.join(desktop, name), to: path.join(desktop, date, name) } });
  }
  execute({ tool: 'delete', args: { path: path.join(desktop, dates[0], 'Screenshot 01.png') } });
  execute({ tool: 'delete', args: { path: path.join(desktop, dates[2], 'Screenshot 12.png') } });

  for (const inverse of inverses.reverse()) runInverse(inverse, options);
  assert.equal(snapshotTree(sandbox), original, 'sandbox checksums/listing differ after undo');
  process.stdout.write('Smoke passed: original sandbox listing and checksums restored.\n');
} finally {
  fs.rmSync(sandbox, { recursive: true, force: true });
}
