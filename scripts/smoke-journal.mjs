import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createJournal } = require('../src/core/journal/index.cjs');
const tools = require('../src/core/tools/index.cjs');
const originalHome = process.env.HOME;
const sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'igriss-journal-smoke-')));
process.env.HOME = sandbox;

function snapshotTree(root) {
  const records = [];
  function visit(folder, relative = '') {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(folder, entry.name);
      const name = path.join(relative, entry.name).split(path.sep).join('/');
      if (entry.isDirectory()) {
        records.push(`D ${name}`);
        visit(absolute, path.join(relative, entry.name));
      } else if (entry.isFile()) {
        const digest = crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
        records.push(`F ${name} ${digest}`);
      }
    }
  }
  visit(root);
  return records.join('\n');
}

const desktop = path.join(sandbox, 'Desktop');
const trashRoot = path.join(sandbox, '.igriss', 'temp');
fs.mkdirSync(desktop);
fs.mkdirSync(trashRoot, { recursive: true });
const toolOptions = {
  homeDir: sandbox,
  allowedRoots: [desktop],
  igrissHome: path.join(sandbox, '.igriss'),
  trashRoot
};

try {
  for (let index = 1; index <= 12; index += 1) {
    const name = `Screenshot ${String(index).padStart(2, '0')}.png`;
    fs.writeFileSync(path.join(desktop, name), Buffer.from(`fake screenshot ${index}\n`));
  }
  const originalDesktop = snapshotTree(desktop);
  const journal = createJournal({ toolOptions });
  const dates = ['2026-10-30', '2026-10-31', '2026-11-01'];
  const sortSteps = dates.map((date) => ({ tool: 'createFolder', args: { path: path.join(desktop, date) } }));
  for (let index = 1; index <= 12; index += 1) {
    const name = `Screenshot ${String(index).padStart(2, '0')}.png`;
    const date = dates[Math.floor((index - 1) / 4)];
    sortSteps.push({
      tool: 'move',
      args: { from: path.join(desktop, name), to: path.join(desktop, date, name) }
    });
  }
  for (const step of sortSteps) process.stdout.write(`${tools.renderStep(step, toolOptions)}\n`);
  const sorted = journal.executeAndRecord('Sort screenshots by date', sortSteps);
  assert.ok(sorted.entry, sorted.error?.message);

  const deletes = [
    path.join(desktop, dates[0], 'Screenshot 01.png'),
    path.join(desktop, dates[2], 'Screenshot 12.png')
  ].map((filePath) => ({ tool: 'delete', args: { path: filePath } }));
  for (const step of deletes) process.stdout.write(`${tools.renderStep(step, toolOptions)}\n`);
  const deleted = journal.executeAndRecord('Delete two selected screenshots', deletes);
  assert.ok(deleted.entry, deleted.error?.message);

  const undo = journal.undo(2);
  assert.deepEqual(undo.undone, [deleted.entry.id, sorted.entry.id]);
  assert.equal(snapshotTree(desktop), originalDesktop, 'Desktop checksum tree differs after undo(2)');
  assert.equal(journal.load().filter((entry) => entry.status === 'undone').length, 2);
  process.stdout.write('Smoke passed: undo(2) restored all 12 screenshots and their original checksums.\n');
} finally {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  fs.rmSync(sandbox, { recursive: true, force: true });
}
