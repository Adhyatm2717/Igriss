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

let sandbox;
let allowedRoot;
let outsideRoot;
let options;

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'igriss-file-tools-'));
  allowedRoot = path.join(sandbox, 'allowed');
  outsideRoot = path.join(sandbox, 'outside');
  fs.mkdirSync(allowedRoot);
  fs.mkdirSync(outsideRoot);
  options = {
    allowedRoots: [allowedRoot],
    igrissHome: path.join(sandbox, '.igriss'),
    idFactory: () => 'test-uuid'
  };
});

afterEach(() => {
  fs.rmSync(sandbox, { recursive: true, force: true });
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
  });

  it('rejects a symlink that escapes an allowed root', () => {
    const escape = path.join(allowedRoot, 'escape');
    fs.symlinkSync(outsideRoot, escape, 'dir');
    expect(() => move(path.join(escape, 'file.txt'), path.join(allowedRoot, 'target.txt'), options))
      .toThrow(/resolves outside/);
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
  it('creates a folder and returns a delete inverse', () => {
    const folderPath = path.join(allowedRoot, 'new-folder');
    const operation = createFolder(folderPath, options);

    expect(operation).toEqual({
      result: { path: folderPath },
      inverse: { tool: 'delete', args: { path: folderPath } }
    });
    expect(fs.statSync(folderPath).isDirectory()).toBe(true);
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

describe('writeFile', () => {
  it('writes a file and returns a delete inverse', () => {
    const filePath = path.join(allowedRoot, 'created.txt');
    const operation = writeFile(filePath, 'hello', options);

    expect(operation).toEqual({
      result: { path: filePath, bytesWritten: 5 },
      inverse: { tool: 'delete', args: { path: filePath } }
    });
    expect(fs.readFileSync(filePath, 'utf8')).toBe('hello');
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
