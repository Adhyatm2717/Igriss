import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createJournal } = require('./index.cjs');
const tools = require('../tools/index.cjs');

let sandbox;
let desktop;
let trashRoot;
let options;
let nextId;

beforeEach(() => {
  sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'igriss-journal-')));
  desktop = path.join(sandbox, 'Desktop');
  trashRoot = path.join(sandbox, '.igriss', 'temp');
  fs.mkdirSync(desktop);
  fs.mkdirSync(trashRoot, { recursive: true });
  nextId = 0;
  options = {
    journalPath: path.join(sandbox, '.igriss', 'journal.json'),
    now: () => new Date('2026-11-02T10:00:00.000Z'),
    idFactory: () => `30000000-0000-4000-8000-${String(++nextId).padStart(12, '0')}`,
    toolOptions: {
      homeDir: sandbox,
      allowedRoots: [desktop],
      igrissHome: path.join(sandbox, '.igriss'),
      trashRoot,
      idFactory: () => `40000000-0000-4000-8000-${String(++nextId).padStart(12, '0')}`
    }
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(sandbox, { recursive: true, force: true });
});

function snapshotTree(root = sandbox) {
  const rows = [];
  function visit(folder, relative = '') {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(folder, entry.name);
      const name = path.join(relative, entry.name).split(path.sep).join('/');
      if (entry.isDirectory()) {
        rows.push(`D ${name}`);
        visit(absolute, path.join(relative, entry.name));
      } else if (entry.isFile()) {
        const digest = crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
        rows.push(`F ${name} ${digest}`);
      } else if (entry.isSymbolicLink()) {
        rows.push(`L ${name} ${fs.readlinkSync(absolute)}`);
      }
    }
  }
  visit(root);
  return rows.join('\n');
}

function journal(extra = {}) {
  return createJournal({ ...options, ...extra });
}

function createFolderStep(name) {
  return { tool: 'createFolder', args: { path: path.join(desktop, name) } };
}

describe('action journal', () => {
  it('undoes one command and marks its entry undone', () => {
    const log = journal();
    const result = log.executeAndRecord('Make a folder', [createFolderStep('one')]);
    expect(result.entry.status).toBe('done');
    expect(fs.existsSync(path.join(desktop, 'one'))).toBe(true);

    expect(log.undo(1)).toEqual({ undone: [result.entry.id] });
    expect(fs.existsSync(path.join(desktop, 'one'))).toBe(false);
    expect(log.load()[0].status).toBe('undone');
  });

  it('undoes the latest three commands in reverse command order', () => {
    const log = journal();
    const ids = ['one', 'two', 'three'].map((name) =>
      log.executeAndRecord(`Create ${name}`, [createFolderStep(name)]).entry.id);

    expect(log.undo(3)).toEqual({ undone: ids.slice().reverse() });
    for (const name of ['one', 'two', 'three']) expect(fs.existsSync(path.join(desktop, name))).toBe(false);
    expect(log.load().map((entry) => entry.status)).toEqual(['undone', 'undone', 'undone']);
  });

  it('records and reverses a 20-step command as one entry', () => {
    const log = journal();
    const steps = Array.from({ length: 20 }, (_, index) => createFolderStep(`folder-${index}`));
    const recorded = log.executeAndRecord('Create twenty folders', steps);
    expect(log.load()).toHaveLength(1);
    expect(recorded.entry.steps).toHaveLength(20);
    expect(log.undo(1).undone).toEqual([recorded.entry.id]);
    expect(fs.readdirSync(desktop)).toEqual([]);
  });

  it('undoes after loading the journal from disk in a fresh instance', () => {
    const original = journal();
    const recorded = original.executeAndRecord('Create after restart', [createFolderStep('restart')]);
    const reloaded = journal();

    expect(reloaded.load()[0].id).toBe(recorded.entry.id);
    expect(reloaded.undo(1).undone).toEqual([recorded.entry.id]);
    expect(fs.existsSync(path.join(desktop, 'restart'))).toBe(false);
  });

  it('stops on a changed file, marks the command partial, and records the failing step', () => {
    const log = journal();
    const folder = path.join(desktop, 'partial');
    const file = path.join(folder, 'created.txt');
    const recorded = log.executeAndRecord('Create and move file', [
      createFolderStep('partial'),
      { tool: 'writeFile', args: { path: file, content: 'original' } },
      { tool: 'move', args: { from: file, to: path.join(folder, 'moved.txt') } }
    ]);
    fs.writeFileSync(path.join(folder, 'moved.txt'), 'externally edited');

    const result = log.undo(1);
    expect(result.error.message).toMatch(/checksum changed/);
    expect(log.load()[0]).toMatchObject({
      status: 'partially_undone',
      undoFailure: { stepIndex: 1, reason: expect.stringMatching(/checksum changed/) }
    });
    expect(fs.readFileSync(file, 'utf8')).toBe('externally edited');
    expect(fs.existsSync(path.join(folder, 'moved.txt'))).toBe(false);
    expect(recorded.entry.status).toBe('done');
  });

  it('writeFile inverse refuses modified content without moving it', () => {
    const log = journal();
    const file = path.join(desktop, 'modified.txt');
    const recorded = log.executeAndRecord('Write a file', [{ tool: 'writeFile', args: { path: file, content: 'original' } }]);
    fs.writeFileSync(file, 'modified');

    const result = log.undo(1);
    expect(result.error.message).toMatch(/checksum changed/);
    expect(fs.readFileSync(file, 'utf8')).toBe('modified');
    expect(log.load()[0].status).toBe('partially_undone');
    expect(recorded.entry.steps[0].result.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('recovers a corrupt journal by renaming it and starting empty', () => {
    fs.writeFileSync(options.journalPath, '{ this is not json');
    const log = journal();

    expect(() => log.load()).not.toThrow();
    expect(log.load()).toEqual([]);
    expect(fs.existsSync(options.journalPath)).toBe(false);
    expect(fs.readdirSync(path.dirname(options.journalPath)).some((name) => /^journal\.corrupt\..+\.json$/.test(name))).toBe(true);
  });

  it('enforces the seven-command undo limit', () => {
    const log = journal();
    for (let index = 0; index < 8; index += 1) log.executeAndRecord(`Create ${index}`, [createFolderStep(`folder-${index}`)]);

    expect(log.undo(8).error.message).toMatch(/0 to 7/);
    expect(fs.readdirSync(desktop)).toHaveLength(8);
    expect(log.undo(7).undone).toHaveLength(7);
    expect(fs.existsSync(path.join(desktop, 'folder-0'))).toBe(true);
  });

  it('rolls back earlier steps and records nothing when a later step fails', () => {
    const log = journal();
    const result = log.executeAndRecord('Create then fail', [
      createFolderStep('temporary'),
      { tool: 'move', args: { from: path.join(desktop, 'missing.txt'), to: path.join(desktop, 'target.txt') } }
    ]);

    expect(result.error.message).toMatch(/ENOENT|no such file/i);
    expect(fs.existsSync(path.join(desktop, 'temporary'))).toBe(false);
    expect(log.load()).toEqual([]);
  });

  it('rejects relative and glob paths before executing or recording', () => {
    const log = journal();
    for (const candidate of ['relative.txt', path.join(desktop, '*.txt'), '~/Desktop/file.txt']) {
      const result = log.executeAndRecord('Invalid path', [{
        tool: 'writeFile', args: { path: candidate, content: 'not written' }
      }]);
      expect(result.error).toBeInstanceOf(Error);
    }
    expect(log.load()).toEqual([]);
    expect(fs.readdirSync(desktop)).toEqual([]);
  });

  it('never undoes an entry twice', () => {
    const log = journal();
    const recorded = log.executeAndRecord('One command', [createFolderStep('once')]);
    expect(log.undo(1).undone).toEqual([recorded.entry.id]);
    expect(log.undo(1)).toEqual({ undone: [] });
    expect(log.load()[0].status).toBe('undone');
  });

  it('stops and marks partial when a restore destination is occupied', () => {
    const log = journal();
    const file = path.join(desktop, 'occupied.txt');
    fs.writeFileSync(file, 'original');
    const deleted = log.executeAndRecord('Delete file', [{ tool: 'delete', args: { path: file } }]);
    fs.writeFileSync(file, 'new occupant');

    const result = log.undo(1);
    expect(result.error.message).toMatch(/destination is occupied/);
    expect(log.load()[0]).toMatchObject({
      status: 'partially_undone',
      undoFailure: { stepIndex: 0 }
    });
    expect(fs.readFileSync(file, 'utf8')).toBe('new occupant');
    expect(fs.readFileSync(deleted.entry.steps[0].result.trashPath, 'utf8')).toBe('original');
  });

  it('keeps earlier entries when appending more commands', () => {
    const log = journal();
    const first = log.executeAndRecord('First', [createFolderStep('first')]).entry;
    const second = log.executeAndRecord('Second', [createFolderStep('second')]).entry;

    expect(journal().load().map((entry) => entry.id)).toEqual([first.id, second.id]);
  });
});

describe('journal JSON append validation', () => {
  it.each(['relative.txt', '~/Desktop/file.txt', '/tmp/folder/*.png'])('rejects non-concrete path %s', (invalidPath) => {
    const log = journal();
    const entry = {
      id: 'append-test', timestamp: new Date().toISOString(), request: 'invalid', status: 'done',
      steps: [{ tool: 'move', args: { from: invalidPath, to: path.join(desktop, 'to.txt') }, inverse: null }]
    };
    expect(() => log.append(entry)).toThrow(/path|glob/i);
    expect(log.load()).toEqual([]);
  });
});
