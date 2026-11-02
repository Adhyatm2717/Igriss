import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { renderStep } = require('./renderStep.cjs');

let sandbox;
let allowedRoot;
let options;

beforeEach(() => {
  sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'igriss-render-step-')));
  allowedRoot = path.join(sandbox, 'Desktop');
  fs.mkdirSync(allowedRoot);
  options = { homeDir: sandbox, allowedRoots: [allowedRoot] };
});

afterEach(() => {
  fs.rmSync(sandbox, { recursive: true, force: true });
});

describe('renderStep', () => {
  it('renders a move as a display-only shell-style line with home shorthand', () => {
    const from = path.join(allowedRoot, 'a.png');
    const to = path.join(allowedRoot, 'Hi', '28', 'a.png');
    const line = renderStep({ tool: 'move', args: { from, to } }, options);

    expect(line).toBe('$ mv ~/Desktop/a.png ~/Desktop/Hi/28/a.png');
  });

  it('renders delete as a move into the protected trash area without executing it', () => {
    const filePath = path.join(allowedRoot, 'a.png');
    const line = renderStep({ tool: 'delete', args: { path: filePath } }, options);

    expect(line).toBe("$ mv ~/Desktop/a.png ~/.igriss/temp/'<uuid>'/a.png");
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it.each([
    [{ tool: 'rename', args: { from: '/tmp/unused', to: '/tmp/other' } }, '$ mv'],
    [{ tool: 'createFolder', args: { path: '/tmp/unused' } }, '$ mkdir'],
    [{ tool: 'removeEmptyFolder', args: { path: '/tmp/unused' } }, '$ rmdir'],
    [{ tool: 'writeFile', args: { path: '/tmp/unused' } }, '$ writeFile']
  ])('renders %s as a display string', (step, prefix) => {
    const fileOrFolder = step.tool === 'rename'
      ? { ...step, args: { from: path.join(allowedRoot, 'a'), to: path.join(allowedRoot, 'b') } }
      : { ...step, args: { path: path.join(allowedRoot, 'a') } };
    expect(renderStep(fileOrFolder, options).startsWith(`${prefix} `)).toBe(true);
  });

  it('quotes paths containing spaces and rejects patterns and unknown tools', () => {
    const from = path.join(allowedRoot, 'a file.txt');
    const to = path.join(allowedRoot, 'other file.txt');
    expect(renderStep({ tool: 'move', args: { from, to } }, options))
      .toBe("$ mv ~/Desktop/'a file.txt' ~/Desktop/'other file.txt'");
    expect(() => renderStep({ tool: 'delete', args: { path: path.join(allowedRoot, '*.txt') } }, options))
      .toThrow(/Glob patterns/);
    expect(() => renderStep({ tool: 'unknown', args: {} }, options)).toThrow(/Unknown tool/);
  });
});
