import { createRequire } from 'node:module';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
const require = createRequire(import.meta.url);
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseBashSubset, planTask } = require('./index.cjs');
const { createFolder } = require('../tools/createFolder.cjs');
const { move } = require('../tools/move.cjs');
const { delete: deletePath, restore } = require('../tools/delete.cjs');
const { removeEmptyFolder } = require('../tools/removeEmptyFolder.cjs');
const { rename } = require('../tools/rename.cjs');

let home;
let desktop;
const context = () => ({ homeDir: fs.realpathSync(home), allowedRoots: [fs.realpathSync(desktop)], igrissHome: path.join(fs.realpathSync(home), '.igriss'), idFactory: () => '12345678-1234-4234-8234-123456789abc' });
const put = (name, data = 'sample') => fs.writeFileSync(path.join(desktop, name), data);
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'igriss-bash-')); desktop = path.join(home, 'Desktop'); fs.mkdirSync(desktop); });
afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

describe('parseBashSubset', () => {
  it('parses commands, summary, and maps same-folder moves to rename', () => {
    put('a file.txt');
    const result = parseBashSubset("# summary: organize files\nmv ~/Desktop/'a file.txt' ~/Desktop/'b file.txt'\nmkdir ~/Desktop/New", context());
    expect(result).toEqual({ summary: 'organize files', steps: [
      { tool: 'rename', args: { from: path.join(fs.realpathSync(desktop), 'a file.txt'), to: path.join(fs.realpathSync(desktop), 'b file.txt') } },
      { tool: 'createFolder', args: { path: path.join(fs.realpathSync(desktop), 'New') } }
    ] });
  });
  it('returns a question without a plan and ignores other comments', () => {
    expect(parseBashSubset('# ignored\n# question: Which folder?', context())).toEqual({ question: 'Which folder?' });
  });
  it('rejects every forbidden character, quote type, command, flags, chaining, and escapes', () => {
    for (const char of ['\\', '"', '|', ';', '&', '>', '<', '$', '`', '(', ')', '{', '}', '!']) {
      expect(parseBashSubset(`mkdir ~/Desktop/'a${char}b'`, context()).error, char).toMatch(/Line 1/);
    }
    for (const command of ['touch', 'cat', 'echo', 'sudo', 'bash', 'sh', 'cp', 'find', 'pwd', '']) {
      if (command) expect(parseBashSubset(`${command} /tmp/x`, context()).error).toMatch(/Line 1/);
    }
    expect(parseBashSubset('rm -rf ~/Desktop/x', context()).error).toMatch(/flags/i);
    expect(parseBashSubset('rm ~/Desktop/x; mkdir ~/Desktop/y', context()).error).toMatch(/Line 1/);
    expect(parseBashSubset("mkdir ~/Desktop/'a;b'", context()).error).toMatch(/Line 1/);
    expect(parseBashSubset('mkdir "two words"', context()).error).toMatch(/Line 1/);
    expect(parseBashSubset('mv ~/Desktop/a ~/Desktop/b', context()).error).toMatch(/Line 1/);
  });
  it('rejects path escapes, env paths, tilde users, missing and ambiguous sources', () => {
    expect(parseBashSubset('mkdir ~/Desktop/../outside', context()).error).toMatch(/traversal/);
    expect(parseBashSubset('mkdir ~someone/Desktop/x', context()).error).toMatch(/~/);
    expect(parseBashSubset('mkdir /tmp/outside', context()).error).toMatch(/allowed roots/);
    expect(parseBashSubset('mkdir $HOME/Desktop/x', context()).error).toMatch(/Line 1/);
    expect(parseBashSubset('rm ~/Desktop/missing', context()).error).toMatch(/exist/);
    put('to-delete');
    expect(parseBashSubset('rm ~/Desktop/to-delete', context()).steps[0].tool).toBe('delete');
    fs.writeFileSync(path.join(desktop, 'x\u00a0y'), 'a');
    fs.writeFileSync(path.join(desktop, 'x y'), 'b');
    expect(parseBashSubset("rm ~/Desktop/'x y'", context()).error).toMatch(/ambiguous/);
  });
  it('normalizes narrow no-break spaces and repeated spaces against existing names', () => {
    put('June\u202fReport.txt');
    const result = parseBashSubset("rm ~/Desktop/'June Report.txt'", context());
    expect(result.steps[0].args.path).toBe(path.join(fs.realpathSync(desktop), 'June\u202fReport.txt'));
  });
  it('expands bounded globs and rejects non-final, zero, and over-limit matches', () => {
    put('a.txt'); put('b.txt'); fs.mkdirSync(path.join(desktop, 'sub'));
    expect(parseBashSubset('rm ~/Desktop/*.txt', context()).steps).toHaveLength(2);
    expect(parseBashSubset('rm ~/Desktop/sub*/a', context()).error).toMatch(/glob/i);
    expect(parseBashSubset('rm ~/Desktop/*/*.txt', context()).error).toMatch(/glob/i);
    expect(parseBashSubset('rm ~/Desktop/**.txt', context()).error).toMatch(/one \* or \?/i);
    expect(parseBashSubset('rm ~/Desktop/nope*', context()).error).toMatch(/no files/);
    for (let i = 0; i < 501; i += 1) put(`f${i}.log`);
    expect(parseBashSubset('rm ~/Desktop/*.log', context()).error).toMatch(/500/);
  });
  it('rejects overlong responses and hostile listed names remain unaddressable', () => {
    expect(parseBashSubset(Array(1000).fill('# comment').concat('mkdir ~/Desktop/ok').join('\n'), context()).steps).toHaveLength(1);
    expect(parseBashSubset(Array(1000).fill('mkdir ~/Desktop/x').join('\n'), context()).error).toMatch(/200/);
    put('semi;colon'); put('$(touch owned)'); fs.writeFileSync(path.join(desktop, 'line\nbreak'), 'x');
    for (const name of ['semi;colon', '$(touch owned)', 'line\nbreak']) expect(parseBashSubset(`rm ~/Desktop/'${name}'`, context()).error).toBeTruthy();
  });
  it('planTask retries once with the parse error and then returns a plan or fallback', async () => {
    const calls = [];
    const provider = { async generate(request) { calls.push(request); return calls.length === 1 ? 'rm -rf ~/Desktop/x' : 'mkdir ~/Desktop/New'; } };
    expect(await planTask('make folder', { ...context(), provider })).toEqual({ steps: [{ tool: 'createFolder', args: { path: path.join(fs.realpathSync(desktop), 'New') } }] });
    expect(calls).toHaveLength(2);
    expect(calls[1].retryError).toMatch(/flags/i);
    expect(await planTask('task', { provider: { generate: async () => 'nonsense' } })).toBe("I couldn't understand that");
  });
  it('round trips parse, validation, execution, undo, and checksums in the sandbox', () => {
    put('original.txt', 'stable bytes');
    const originalHash = hash(path.join(desktop, 'original.txt'));
    const plan = parseBashSubset("mkdir ~/Desktop/Folder\nmv ~/Desktop/original.txt ~/Desktop/Folder/moved.txt", context());
    expect(plan.error).toBeUndefined();
    const inverses = [];
    for (const step of plan.steps) {
      const args = { ...step.args, ...context() };
      const operation = step.tool === 'createFolder' ? createFolder(args.path, args)
        : step.tool === 'move' ? move(args.from, args.to, args)
          : step.tool === 'rename' ? rename(args.from, args.to, args)
            : deletePath(args.path, args);
      inverses.unshift(operation.inverse);
    }
    expect(hash(path.join(desktop, 'Folder', 'moved.txt'))).toBe(originalHash);
    for (const inverse of inverses) {
      if (inverse.tool === 'move') move(inverse.args.from, inverse.args.to, context());
      else if (inverse.tool === 'rename') rename(inverse.args.from, inverse.args.to, context());
      else if (inverse.tool === 'removeEmptyFolder') removeEmptyFolder(inverse.args.path, context());
      else if (inverse.tool === 'restore') restore(inverse.args.from, inverse.args.to, context());
    }
    expect(hash(path.join(desktop, 'original.txt'))).toBe(originalHash);
    expect(fs.readdirSync(desktop)).toEqual(['original.txt']);
  });
});
