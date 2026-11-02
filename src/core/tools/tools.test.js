import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { move } = require('./move.cjs');
const { rename } = require('./rename.cjs');
const { createFolder } = require('./createFolder.cjs');
const { writeFile } = require('./writeFile.cjs');
const { deletePath, restore } = require('./delete.cjs');
const { removeEmptyFolder } = require('./removeEmptyFolder.cjs');
const toolApi = require('./index.cjs');
const { getConfiguredPaths } = require('./pathGuard.cjs');

let sandbox;
let allowedRoot;
let outsideRoot;
let options;
let trashId;

beforeEach(() => {
  sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'igriss-file-tools-')));
  allowedRoot = path.join(sandbox, 'allowed');
  outsideRoot = path.join(sandbox, 'outside');
  trashId = 0;
  fs.mkdirSync(allowedRoot);
  fs.mkdirSync(outsideRoot);
  options = {
    homeDir: sandbox,
    allowedRoots: [allowedRoot],
    igrissHome: path.join(sandbox, '.igriss'),
    idFactory: () => `00000000-0000-4000-8000-${String(++trashId).padStart(12, '0')}`
  };
});

afterEach(() => {
  fs.rmSync(sandbox, { recursive: true, force: true });
});

describe('tool exports', () => {
  it('resolves default roots from the per-file HOME override', () => {
    const configured = getConfiguredPaths();
    expect(configured.allowedRoots).toEqual([
      path.join(os.homedir(), 'Desktop'),
      path.join(os.homedir(), 'Downloads'),
      path.join(os.homedir(), 'Documents')
    ]);
    expect(configured.igrissHome).toBe(path.join(os.homedir(), '.igriss'));
  });

  it('exposes the plan tools and internal restore and purge functions', () => {
    expect(typeof toolApi.move).toBe('function');
    expect(typeof toolApi.rename).toBe('function');
    expect(typeof toolApi.createFolder).toBe('function');
    expect(typeof toolApi.writeFile).toBe('function');
    expect(typeof toolApi.delete).toBe('function');
    expect(typeof toolApi.restore).toBe('function');
    expect(typeof toolApi.purge).toBe('function');
    expect(typeof toolApi.removeEmptyFolder).toBe('function');
    expect(typeof toolApi.renderStep).toBe('function');
  });
});

describe('move', () => {
  it('moves a file and returns an inverse move operation', () => {
    const from = path.join(allowedRoot, 'source.txt');
    const to = path.join(allowedRoot, 'destination.txt');
    fs.writeFileSync(from, 'hello');

    const operation = move(from, to, options);

    expect(operation.result).toEqual({ from, to });
    expect(operation.inverse).toEqual({ tool: 'move', args: { from: to, to: from } });
    expect(fs.readFileSync(to, 'utf8')).toBe('hello');
    move(operation.inverse.args.from, operation.inverse.args.to, options);
    expect(fs.readFileSync(from, 'utf8')).toBe('hello');
    expect(fs.existsSync(to)).toBe(false);
  });

  it('rejects paths outside allowed roots and traversal', () => {
    const source = path.join(allowedRoot, 'source.txt');
    fs.writeFileSync(source, 'safe');
    expect(() => move(source, path.join(outsideRoot, 'target.txt'), options)).toThrow(/outside the allowed roots/);
    expect(() => move(`${allowedRoot}/../outside/target.txt`, source, options)).toThrow(/traversal/);
    expect(() => move(path.join(allowedRoot, '*.txt'), source, options)).toThrow(/Glob patterns/);
    expect(() => move(allowedRoot, path.join(allowedRoot, 'moved-root'), options)).toThrow(/protected root/);
  });

  it('rejects a symlink that escapes an allowed root', () => {
    const escape = path.join(allowedRoot, 'escape');
    fs.symlinkSync(outsideRoot, escape, 'dir');
    expect(() => move(path.join(escape, 'file.txt'), path.join(allowedRoot, 'target.txt'), options))
      .toThrow(/resolves outside/);
  });

  it('returns canonical absolute paths when a safe in-root symlink is used', () => {
    const realDirectory = path.join(allowedRoot, 'real');
    const aliasDirectory = path.join(allowedRoot, 'alias');
    fs.mkdirSync(realDirectory);
    fs.symlinkSync(realDirectory, aliasDirectory, 'dir');
    const source = path.join(realDirectory, 'source.txt');
    const aliasSource = path.join(aliasDirectory, 'source.txt');
    const destination = path.join(realDirectory, 'destination.txt');
    fs.writeFileSync(source, 'canonical');

    const operation = move(aliasSource, destination, options);

    expect(operation.result.from).toBe(source);
    expect(operation.result.to).toBe(destination);
    expect(operation.inverse.args).toEqual({ from: destination, to: source });
  });

  it('refuses to overwrite an existing destination', () => {
    const source = path.join(allowedRoot, 'source.txt');
    const destination = path.join(allowedRoot, 'destination.txt');
    fs.writeFileSync(source, 'source');
    fs.writeFileSync(destination, 'destination');

    expect(() => move(source, destination, options)).toThrow(/already exists/);
    expect(fs.readFileSync(source, 'utf8')).toBe('source');
    expect(fs.readFileSync(destination, 'utf8')).toBe('destination');
  });
});

describe('rename', () => {
  it('renames a file and returns an inverse rename operation', () => {
    const from = path.join(allowedRoot, 'before.txt');
    const to = path.join(allowedRoot, 'after.txt');
    fs.writeFileSync(from, 'hello');

    const operation = rename(from, to, options);

    expect(operation.result).toEqual({ from, to });
    expect(operation.inverse).toEqual({ tool: 'rename', args: { from: to, to: from } });
    rename(operation.inverse.args.from, operation.inverse.args.to, options);
    expect(fs.readFileSync(from, 'utf8')).toBe('hello');
    expect(fs.existsSync(to)).toBe(false);
  });

  it('refuses an existing destination and moving across directories', () => {
    const from = path.join(allowedRoot, 'before.txt');
    const to = path.join(allowedRoot, 'after.txt');
    const otherDirectory = path.join(allowedRoot, 'nested');
    fs.mkdirSync(otherDirectory);
    fs.writeFileSync(from, 'source');
    fs.writeFileSync(to, 'destination');

    expect(() => rename(from, to, options)).toThrow(/already exists/);
    expect(() => rename(from, path.join(otherDirectory, 'moved.txt'), options)).toThrow(/same directory/);
    expect(fs.readFileSync(from, 'utf8')).toBe('source');
    expect(fs.readFileSync(to, 'utf8')).toBe('destination');
  });
});

describe('createFolder', () => {
  it('creates a folder and returns a removeEmptyFolder inverse', () => {
    const folderPath = path.join(allowedRoot, 'new-folder');
    const operation = createFolder(folderPath, options);

    expect(operation).toEqual({
      result: { path: folderPath },
      inverse: { tool: 'removeEmptyFolder', args: { path: folderPath } }
    });
    expect(fs.statSync(folderPath).isDirectory()).toBe(true);
    const removed = removeEmptyFolder(operation.inverse.args.path, options);
    expect(fs.existsSync(folderPath)).toBe(false);
    expect(removed.inverse).toEqual({ tool: 'createFolder', args: { path: folderPath } });
    const recreated = createFolder(removed.inverse.args.path, options);
    expect(fs.statSync(recreated.result.path).isDirectory()).toBe(true);
    removeEmptyFolder(recreated.inverse.args.path, options);
  });

  it('refuses to replace an existing file or folder', () => {
    const existingFile = path.join(allowedRoot, 'existing.txt');
    const existingFolder = path.join(allowedRoot, 'existing-folder');
    fs.writeFileSync(existingFile, 'keep');
    fs.mkdirSync(existingFolder);

    expect(() => createFolder(existingFile, options)).toThrow(/already exists/);
    expect(() => createFolder(existingFolder, options)).toThrow(/already exists/);
    expect(fs.readFileSync(existingFile, 'utf8')).toBe('keep');
  });
});

describe('removeEmptyFolder', () => {
  it('removes an empty folder with rmdir and returns a createFolder inverse', () => {
    const folderPath = path.join(allowedRoot, 'empty');
    fs.mkdirSync(folderPath);

    const operation = removeEmptyFolder(folderPath, options);

    expect(operation.result.path).toBe(folderPath);
    expect(operation.inverse).toEqual({ tool: 'createFolder', args: { path: folderPath } });
    expect(fs.existsSync(folderPath)).toBe(false);
    createFolder(operation.inverse.args.path, options);
    expect(fs.statSync(folderPath).isDirectory()).toBe(true);
  });

  it('refuses a non-empty folder without changing its files', () => {
    const folderPath = path.join(allowedRoot, 'not-empty');
    fs.mkdirSync(folderPath);
    fs.writeFileSync(path.join(folderPath, 'keep.txt'), 'keep');

    expect(() => removeEmptyFolder(folderPath, options)).toThrow(/not empty/);
    expect(fs.readFileSync(path.join(folderPath, 'keep.txt'), 'utf8')).toBe('keep');
  });
});

describe('writeFile', () => {
  it('writes a file with a checksum and returns a reversible delete inverse', () => {
    const filePath = path.join(allowedRoot, 'created.txt');
    const operation = writeFile(filePath, 'hello', options);

    expect(operation).toEqual({
      result: { path: filePath, bytesWritten: 5, sha256: expect.any(String) },
      inverse: { tool: 'delete', args: { path: filePath, expectedSha256: operation.result.sha256 } }
    });
    expect(fs.readFileSync(filePath, 'utf8')).toBe('hello');
    const undone = toolApi.delete(operation.inverse.args.path, {
      ...options,
      expectedSha256: operation.inverse.args.expectedSha256
    });
    expect(fs.existsSync(filePath)).toBe(false);
    expect(fs.readFileSync(undone.result.trashPath, 'utf8')).toBe('hello');
    restore(undone.inverse.args.from, undone.inverse.args.to, options);
    expect(fs.readFileSync(filePath, 'utf8')).toBe('hello');
  });

  it('refuses the inverse if the file changed after writing', () => {
    const filePath = path.join(allowedRoot, 'created.txt');
    const operation = writeFile(filePath, 'hello', options);
    fs.writeFileSync(filePath, 'edited');
    const before = fs.readFileSync(filePath);

    expect(() => toolApi.delete(filePath, {
      ...options,
      expectedSha256: operation.result.sha256
    })).toThrow(/checksum changed/);
    expect(fs.readFileSync(filePath)).toEqual(before);
  });

  it('refuses the inverse if the file is missing', () => {
    const filePath = path.join(allowedRoot, 'created.txt');
    const operation = writeFile(filePath, 'hello', options);
    fs.unlinkSync(filePath);

    expect(() => toolApi.delete(filePath, {
      ...options,
      expectedSha256: operation.result.sha256
    })).toThrow(/missing/);
    expect(fs.existsSync(path.join(options.igrissHome, 'temp'))).toBe(false);
  });

  it('refuses to replace existing files and folders', () => {
    const existingFile = path.join(allowedRoot, 'existing.txt');
    const existingFolder = path.join(allowedRoot, 'existing-folder');
    fs.writeFileSync(existingFile, 'keep');
    fs.mkdirSync(existingFolder);

    expect(() => writeFile(existingFile, 'replace', options)).toThrow(/already exists/);
    expect(() => writeFile(existingFolder, 'replace', options)).toThrow(/already exists/);
    expect(fs.readFileSync(existingFile, 'utf8')).toBe('keep');
  });
});

describe('delete and restore', () => {
  it('moves a file into a unique trash folder and restores it with its original path', () => {
    const filePath = path.join(allowedRoot, 'remove-me.txt');
    fs.writeFileSync(filePath, 'keep me');

    const operation = deletePath(filePath, options);

    expect(operation.result).toEqual({
      path: filePath,
      originalPath: filePath,
      trashPath: path.join(options.igrissHome, 'temp', '00000000-0000-4000-8000-000000000001', 'remove-me.txt')
    });
    expect(fs.existsSync(filePath)).toBe(false);
    expect(fs.readFileSync(operation.result.trashPath, 'utf8')).toBe('keep me');
    expect(operation.inverse).toEqual({
      tool: 'restore',
      args: { from: operation.result.trashPath, to: filePath }
    });

    restore(operation.inverse.args.from, operation.inverse.args.to, options);
    expect(fs.readFileSync(filePath, 'utf8')).toBe('keep me');
  });

  it('trashes and restores a folder with its contents intact', () => {
    const folderPath = path.join(allowedRoot, 'folder-to-delete');
    fs.mkdirSync(folderPath);
    fs.writeFileSync(path.join(folderPath, 'inside.txt'), 'inside');

    const operation = deletePath(folderPath, options);
    expect(fs.existsSync(folderPath)).toBe(false);
    expect(fs.readFileSync(path.join(operation.result.trashPath, 'inside.txt'), 'utf8')).toBe('inside');

    restore(operation.inverse.args.from, operation.inverse.args.to, options);
    expect(fs.readFileSync(path.join(folderPath, 'inside.txt'), 'utf8')).toBe('inside');
  });

  it('fails to restore if the original path has become occupied', () => {
    const filePath = path.join(allowedRoot, 'occupied.txt');
    fs.writeFileSync(filePath, 'original');
    const operation = deletePath(filePath, options);
    fs.writeFileSync(filePath, 'new file');

    expect(() => restore(operation.result.trashPath, filePath, options)).toThrow(/already exists/);
    expect(fs.readFileSync(filePath, 'utf8')).toBe('new file');
    expect(fs.readFileSync(operation.result.trashPath, 'utf8')).toBe('original');
  });

  it('rejects deleting outside the allowed roots and paths inside ~/.igriss', () => {
    const outsideFile = path.join(outsideRoot, 'outside.txt');
    fs.writeFileSync(outsideFile, 'safe');
    expect(() => deletePath(outsideFile, options)).toThrow(/outside the allowed roots/);

    fs.mkdirSync(options.igrissHome);
    const igrissOptions = { ...options, allowedRoots: [options.igrissHome] };
    expect(() => deletePath(path.join(options.igrissHome, 'private.txt'), igrissOptions)).toThrow(/inside ~\/\.igriss/);
  });
});
