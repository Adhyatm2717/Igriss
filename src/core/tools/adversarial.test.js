import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const tools = require('./index.cjs');

let sandbox;
let desktop;
let outside;
let igrissHome;
let options;
let nextId;

beforeEach(() => {
  sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'igriss-adversarial-')));
  desktop = path.join(sandbox, 'Desktop');
  outside = path.join(sandbox, 'outside');
  igrissHome = path.join(sandbox, '.igriss');
  fs.mkdirSync(desktop);
  fs.mkdirSync(outside);
  fs.mkdirSync(path.join(igrissHome, 'temp'), { recursive: true });
  nextId = 0;
  options = {
    homeDir: sandbox,
    allowedRoots: [desktop],
    igrissHome,
    trashRoot: path.join(igrissHome, 'temp'),
    idFactory: () => `10000000-0000-4000-8000-${String(++nextId).padStart(12, '0')}`
  };
});

afterEach(() => {
  fs.rmSync(sandbox, { recursive: true, force: true });
});

function snapshotTree(root = sandbox) {
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

function runInverse(inverse) {
  const args = inverse.args;
  switch (inverse.tool) {
    case 'move': return tools.move(args.from, args.to, options);
    case 'rename': return tools.rename(args.from, args.to, options);
    case 'createFolder': return tools.createFolder(args.path, options);
    case 'removeEmptyFolder': return tools.removeEmptyFolder(args.path, options);
    case 'writeFile': return tools.writeFile(args.path, args.content, options);
    case 'delete': return tools.delete(args.path, { ...options, expectedSha256: args.expectedSha256 });
    case 'restore': return tools.restore(args.from, args.to, options);
    default: throw new Error(`Unexpected inverse tool: ${inverse.tool}`);
  }
}

describe('adversarial path guard', () => {
  it('rejects traversal, encoded traversal, outside, relative, tilde, empty, and null-byte paths', () => {
    const source = path.join(desktop, 'source.txt');
    fs.writeFileSync(source, 'safe');
    const before = snapshotTree();
    const rejectedPaths = [
      `${desktop}/../outside/file.txt`,
      path.join(outside, 'file.txt'),
      'relative/file.txt',
      '~/Desktop/file.txt',
      '',
      `${desktop}/bad\0name.txt`
    ];

    for (const target of rejectedPaths) {
      expect(() => tools.move(source, target, options), `target=${JSON.stringify(target)}`).toThrow();
      expect(fs.readFileSync(source, 'utf8')).toBe('safe');
    }
    expect(() => tools.move(source, null, options)).toThrow();
    expect(snapshotTree()).toBe(before);
  });

  it('rejects explicit dot-dot even when normalization lands inside the allowed root', () => {
    const source = path.join(desktop, 'source.txt');
    fs.mkdirSync(path.join(desktop, 'nested'));
    fs.writeFileSync(source, 'safe');
    const before = snapshotTree();

    expect(() => tools.move(source, `${desktop}/nested/../inside.txt`, options)).toThrow(/traversal/);
    expect(snapshotTree()).toBe(before);
  });

  it('rejects percent-encoded dot-dot even when it names an existing literal folder', () => {
    const source = path.join(desktop, 'source.txt');
    fs.mkdirSync(path.join(desktop, '%2e%2e', 'encoded'), { recursive: true });
    fs.writeFileSync(source, 'safe');
    const before = snapshotTree();

    expect(() => tools.move(source, `${desktop}/%2e%2e/encoded/inside.txt`, options)).toThrow(/traversal/);
    expect(snapshotTree()).toBe(before);
  });

  it('normalizes trailing and repeated slashes without escaping the allowed root', () => {
    const source = path.join(desktop, 'source.txt');
    const target = `${desktop}//nested///target.txt/`;
    fs.writeFileSync(source, 'safe');
    fs.mkdirSync(path.join(desktop, 'nested'));

    const operation = tools.move(source, target, options);

    expect(operation.result.to).toBe(path.join(desktop, 'nested', 'target.txt'));
    expect(fs.readFileSync(operation.result.to, 'utf8')).toBe('safe');
  });

  it('rejects Desktop itself as move, rename, or delete target', () => {
    const child = path.join(desktop, 'child.txt');
    fs.writeFileSync(child, 'safe');

    expect(() => tools.move(desktop, path.join(desktop, 'moved'), options)).toThrow(/protected root/);
    expect(() => tools.rename(desktop, path.join(desktop, 'renamed'), options)).toThrow(/protected root/);
    expect(() => tools.delete(desktop, options)).toThrow(/protected root/);
    expect(fs.readFileSync(child, 'utf8')).toBe('safe');
  });

  it('rejects source and destination symlink escapes, symlinked parents, and loops', () => {
    const source = path.join(desktop, 'source.txt');
    const outsideFile = path.join(outside, 'outside.txt');
    const sourceLink = path.join(desktop, 'source-link');
    const destinationLink = path.join(desktop, 'destination-link');
    const parentLink = path.join(desktop, 'parent-link');
    fs.writeFileSync(source, 'source');
    fs.writeFileSync(outsideFile, 'outside');
    fs.symlinkSync(outsideFile, sourceLink);
    fs.symlinkSync(outsideFile, destinationLink);
    fs.symlinkSync(outside, parentLink, 'dir');

    expect(() => tools.move(sourceLink, path.join(desktop, 'from-link'), options)).toThrow(/outside/);
    expect(() => tools.move(source, destinationLink, options)).toThrow(/outside/);
    expect(() => tools.move(path.join(parentLink, 'outside.txt'), path.join(desktop, 'from-parent'), options))
      .toThrow(/outside/);
    expect(() => tools.move(source, path.join(parentLink, 'new.txt'), options)).toThrow(/outside/);

    const loopA = path.join(desktop, 'loop-a');
    const loopB = path.join(desktop, 'loop-b');
    fs.symlinkSync(loopB, loopA);
    fs.symlinkSync(loopA, loopB);
    expect(() => tools.move(path.join(loopA, 'file.txt'), path.join(desktop, 'loop-target'), options)).toThrow();
    expect(fs.readFileSync(source, 'utf8')).toBe('source');
    expect(fs.readFileSync(outsideFile, 'utf8')).toBe('outside');
  });
});

describe('adversarial no-overwrite and folder behavior', () => {
  it('rejects move and rename onto files, folders, and the same path', () => {
    const sourceFile = path.join(desktop, 'source.txt');
    const destinationFile = path.join(desktop, 'destination.txt');
    const sourceFolder = path.join(desktop, 'source-folder');
    const destinationFolder = path.join(desktop, 'destination-folder');
    fs.writeFileSync(sourceFile, 'source');
    fs.writeFileSync(destinationFile, 'destination');
    fs.mkdirSync(sourceFolder);
    fs.mkdirSync(destinationFolder);

    expect(() => tools.move(sourceFile, destinationFile, options)).toThrow(/already exists/);
    expect(() => tools.move(sourceFolder, destinationFolder, options)).toThrow(/already exists/);
    expect(() => tools.move(sourceFile, sourceFile, options)).toThrow();
    expect(() => tools.rename(sourceFile, destinationFile, options)).toThrow(/already exists/);
    expect(() => tools.rename(sourceFolder, destinationFolder, options)).toThrow(/already exists/);
    expect(() => tools.rename(sourceFile, sourceFile, options)).toThrow();
    expect(fs.readFileSync(sourceFile, 'utf8')).toBe('source');
    expect(fs.readFileSync(destinationFile, 'utf8')).toBe('destination');
  });

  it('rejects moving a folder into itself or a child, and onto a file', () => {
    const folder = path.join(desktop, 'folder');
    const child = path.join(folder, 'child');
    const file = path.join(desktop, 'target-file');
    fs.mkdirSync(folder);
    fs.writeFileSync(file, 'keep');
    const before = snapshotTree();

    expect(() => tools.move(folder, folder, options)).toThrow();
    expect(() => tools.move(folder, child, options)).toThrow();
    expect(() => tools.move(folder, file, options)).toThrow(/already exists/);
    expect(snapshotTree()).toBe(before);
  });

  it('refuses existing folders and missing parents in createFolder', () => {
    const existing = path.join(desktop, 'existing');
    fs.mkdirSync(existing);
    const before = snapshotTree();

    expect(() => tools.createFolder(existing, options)).toThrow(/already exists/);
    expect(() => tools.createFolder(path.join(desktop, 'missing', 'child'), options)).toThrow();
    expect(snapshotTree()).toBe(before);
  });

  it('does not overwrite a file in writeFile', () => {
    const file = path.join(desktop, 'existing.txt');
    fs.writeFileSync(file, 'keep');
    const before = snapshotTree();

    expect(() => tools.writeFile(file, 'replace', options)).toThrow(/already exists/);
    expect(snapshotTree()).toBe(before);
  });

  it('uses exclusive creation if a destination appears after the preflight check', () => {
    const file = path.join(desktop, 'raced.txt');
    const originalWriteFileSync = fs.writeFileSync.bind(fs);
    vi.spyOn(fs, 'writeFileSync').mockImplementation((target, content, writeOptions) => {
      originalWriteFileSync(target, 'created concurrently', { flag: 'wx' });
      return originalWriteFileSync(target, content, writeOptions);
    });

    try {
      expect(() => tools.writeFile(file, 'must not replace', options)).toThrow();
      expect(fs.readFileSync(file, 'utf8')).toBe('created concurrently');
    } finally {
      vi.restoreAllMocks();
    }
  });
});

describe('adversarial removeEmptyFolder', () => {
  it.each([
    ['ordinary file', (folder) => fs.writeFileSync(path.join(folder, 'file.txt'), 'keep')],
    ['hidden .DS_Store file', (folder) => fs.writeFileSync(path.join(folder, '.DS_Store'), 'keep')],
    ['empty subfolder', (folder) => fs.mkdirSync(path.join(folder, 'child'))]
  ])('refuses a folder containing a %s', (_label, addEntry) => {
    const folder = path.join(desktop, 'folder');
    fs.mkdirSync(folder);
    addEntry(folder);
    const before = snapshotTree();

    expect(() => tools.removeEmptyFolder(folder, options)).toThrow('Folder is not empty');
    expect(snapshotTree()).toBe(before);
  });

  it('fails clearly for a non-existent folder', () => {
    expect(() => tools.removeEmptyFolder(path.join(desktop, 'missing'), options)).toThrow(/ENOENT|no such/i);
  });
});

describe('adversarial delete and purge', () => {
  it('separates deleted items with identical basenames and records both original paths', () => {
    const firstFolder = path.join(desktop, 'first');
    const secondFolder = path.join(desktop, 'second');
    fs.mkdirSync(firstFolder);
    fs.mkdirSync(secondFolder);
    const first = path.join(firstFolder, 'same.png');
    const second = path.join(secondFolder, 'same.png');
    fs.writeFileSync(first, 'one');
    fs.writeFileSync(second, 'two');

    const firstDeleted = tools.delete(first, options);
    const secondDeleted = tools.delete(second, options);

    expect(firstDeleted.result.originalPath).toBe(first);
    expect(secondDeleted.result.originalPath).toBe(second);
    expect(firstDeleted.result.trashPath).not.toBe(secondDeleted.result.trashPath);
    tools.restore(firstDeleted.inverse.args.from, firstDeleted.inverse.args.to, options);
    tools.restore(secondDeleted.inverse.args.from, secondDeleted.inverse.args.to, options);
    expect(fs.readFileSync(first, 'utf8')).toBe('one');
    expect(fs.readFileSync(second, 'utf8')).toBe('two');
  });

  it('restores a folder with exact file checksums and refuses missing trash copies', () => {
    const folder = path.join(desktop, 'screenshots');
    fs.mkdirSync(path.join(folder, '2026'), { recursive: true });
    fs.writeFileSync(path.join(folder, 'a.png'), Buffer.from([0, 1, 2, 255]));
    fs.writeFileSync(path.join(folder, '2026', 'b.png'), Buffer.from([12, 34, 56, 78]));
    const before = snapshotTree();
    const deletedFolder = tools.delete(folder, options);
    tools.restore(deletedFolder.inverse.args.from, deletedFolder.inverse.args.to, options);
    expect(snapshotTree()).toBe(before);

    const file = path.join(desktop, 'missing-trash.txt');
    fs.writeFileSync(file, 'content');
    const deletedFile = tools.delete(file, options);
    tools.purge(deletedFile.result.trashPath, options);
    expect(() => tools.restore(deletedFile.inverse.args.from, deletedFile.inverse.args.to, options)).toThrow(/ENOENT|no such/i);
    expect(fs.existsSync(file)).toBe(false);
  });

  it('refuses purge of the temp parent and symlinks inside temp that escape it', () => {
    const temp = path.join(igrissHome, 'temp');
    expect(() => tools.purge(igrissHome, options)).toThrow('Path is outside ~/.igriss/temp');

    const outsideFile = path.join(outside, 'keep.txt');
    fs.writeFileSync(outsideFile, 'keep');
    const link = path.join(temp, 'outside-link');
    fs.symlinkSync(outsideFile, link);
    expect(() => tools.purge(link, options)).toThrow(/resolves outside/);
    expect(fs.readFileSync(outsideFile, 'utf8')).toBe('keep');
  });
});

describe('inverse identity', () => {
  it.each([
    ['move', () => {
      const from = path.join(desktop, 'before.txt');
      fs.writeFileSync(from, 'move');
      const before = snapshotTree();
      return { before, operation: tools.move(from, path.join(desktop, 'after.txt'), options) };
    }],
    ['rename', () => {
      const from = path.join(desktop, 'before.txt');
      fs.writeFileSync(from, 'rename');
      const before = snapshotTree();
      return { before, operation: tools.rename(from, path.join(desktop, 'after.txt'), options) };
    }],
    ['createFolder', () => {
      const before = snapshotTree();
      return { before, operation: tools.createFolder(path.join(desktop, 'created'), options) };
    }],
    ['removeEmptyFolder', () => {
      const folder = path.join(desktop, 'empty');
      fs.mkdirSync(folder);
      const before = snapshotTree();
      return { before, operation: tools.removeEmptyFolder(folder, options) };
    }],
    ['delete', () => {
      const file = path.join(desktop, 'deleted.txt');
      fs.writeFileSync(file, 'deleted');
      const before = snapshotTree();
      return { before, operation: tools.delete(file, options) };
    }]
  ])('%s followed by its computed inverse restores the full sandbox snapshot', (_name, setupAndRun) => {
    const { before, operation } = setupAndRun();

    const undone = runInverse(operation.inverse);
    if (operation.inverse.tool === 'delete' && undone?.inverse?.tool === 'restore') {
      runInverse(undone.inverse);
    }

    expect(snapshotTree()).toBe(before);
  });

  it('undoes 20 mixed operations in reverse order and keeps created files recoverable in temp', () => {
    const inverses = [];
    const folders = [];
    const looseFiles = [];

    for (let index = 0; index < 5; index += 1) {
      const folder = path.join(desktop, `day-${index}`);
      folders.push(folder);
      inverses.push(tools.createFolder(folder, options).inverse);
    }
    for (let index = 0; index < 5; index += 1) {
      const file = path.join(desktop, `shot-${index}.png`);
      looseFiles.push(file);
      inverses.push(tools.writeFile(file, `shot-${index}`, options).inverse);
    }
    for (let index = 0; index < 5; index += 1) {
      inverses.push(tools.move(looseFiles[index], path.join(folders[index], `shot-${index}.png`), options).inverse);
    }
    for (let index = 0; index < 5; index += 1) {
      const source = path.join(folders[index], `shot-${index}.png`);
      inverses.push(tools.rename(source, path.join(folders[index], `renamed-${index}.png`), options).inverse);
    }

    for (const inverse of inverses.reverse()) runInverse(inverse);
    expect(fs.readdirSync(desktop)).toEqual([]);
    expect(fs.readdirSync(path.join(igrissHome, 'temp'))).toHaveLength(5);
    for (let index = 0; index < 5; index += 1) {
      const transaction = path.join(igrissHome, 'temp', `10000000-0000-4000-8000-${String(5 - index).padStart(12, '0')}`);
      expect(fs.readFileSync(path.join(transaction, `shot-${index}.png`), 'utf8')).toBe(`shot-${index}`);
    }
  });
});

describe('special filenames and failures', () => {
  it('supports spaces, unicode, emoji, and macOS narrow no-break space names', () => {
    const names = [
      'name with spaces.png',
      'café-東京.png',
      'screenshot-📷.png',
      'Screenshot 2026-11-01 at 9.10.32\u202fPM.png'
    ];

    for (const name of names) {
      const file = path.join(desktop, name);
      const created = tools.writeFile(file, name, options);
      expect(fs.readFileSync(file, 'utf8')).toBe(name);
      const deleted = tools.delete(file, options);
      tools.restore(deleted.inverse.args.from, deleted.inverse.args.to, options);
      expect(fs.readFileSync(file, 'utf8')).toBe(name);
      expect(created.inverse.tool).toBe('delete');
    }
  });

  it('handles case-only renames on case-insensitive filesystems', () => {
    const lower = path.join(desktop, 'a.png');
    const upper = path.join(desktop, 'A.png');
    fs.writeFileSync(lower, 'case');

    const operation = tools.rename(lower, upper, options);

    expect(fs.readFileSync(upper, 'utf8')).toBe('case');
    tools.rename(operation.inverse.args.from, operation.inverse.args.to, options);
    expect(fs.readFileSync(lower, 'utf8')).toBe('case');
  });

  it('fails clearly for missing sources without changing the sandbox', () => {
    const before = snapshotTree();

    expect(() => tools.move(path.join(desktop, 'missing.txt'), path.join(desktop, 'target.txt'), options))
      .toThrow(/ENOENT|no such file/i);
    expect(snapshotTree()).toBe(before);
  });
});
