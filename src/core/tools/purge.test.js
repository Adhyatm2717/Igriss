import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { purge } = require('./purge.cjs');

let sandbox;
let options;

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'igriss-purge-test-'));
  const igrissHome = path.join(sandbox, '.igriss');
  options = {
    igrissHome,
    trashRoot: path.join(igrissHome, 'temp')
  };
  fs.mkdirSync(options.trashRoot, { recursive: true });
});

afterEach(() => {
  fs.rmSync(sandbox, { recursive: true, force: true });
});

describe('purge', () => {
  it('permanently removes only a path inside the injected temp directory', () => {
    const trashedFolder = path.join(options.trashRoot, 'purge-test');
    fs.mkdirSync(trashedFolder);
    const trashedFile = path.join(trashedFolder, 'old.txt');
    fs.writeFileSync(trashedFile, 'old');

    expect(purge(trashedFolder, options)).toEqual({
      result: { purgedPath: trashedFolder },
      inverse: null
    });
    expect(fs.existsSync(trashedFolder)).toBe(false);
  });

  it('refuses to purge a path outside ~/.igriss/temp', () => {
    const outsideFile = path.join(sandbox, 'keep.txt');
    fs.writeFileSync(outsideFile, 'keep');

    expect(() => purge(outsideFile, options)).toThrow('Path is outside ~/.igriss/temp');
    expect(fs.readFileSync(outsideFile, 'utf8')).toBe('keep');
  });
});
