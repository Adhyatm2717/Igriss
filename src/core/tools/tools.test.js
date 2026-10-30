import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { move } = require('./move.cjs');

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
