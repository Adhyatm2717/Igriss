import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';

// Capture the real home before redirecting HOME for this test file.
const realHome = os.homedir();
const protectedIgrissPath = path.join(realHome, '.igriss');
const realIgrissBefore = snapshotPath(protectedIgrissPath);
const originalHome = process.env.HOME;
const testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'igriss-vitest-home-'));
process.env.HOME = testHome;

function snapshotPath(target) {
  try {
    const info = fs.lstatSync(target);
    if (info.isSymbolicLink()) return `L ${fs.readlinkSync(target)}`;
    const metadata = `${info.mode}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
    if (info.isDirectory()) {
      const children = fs.readdirSync(target).sort()
        .map((name) => `${name}\n${snapshotPath(path.join(target, name))}`);
      return `D ${metadata}\n${children.join('\n')}`;
    }
    if (info.isFile()) {
      const hash = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
      return `F ${metadata}:${hash}`;
    }
    return `O ${metadata}`;
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
    throw error;
  }
}

afterAll(() => {
  const realIgrissAfter = snapshotPath(protectedIgrissPath);
  fs.rmdirSync(testHome);
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  if (realIgrissAfter !== realIgrissBefore) {
    throw new Error(`Tests created or modified the real ${protectedIgrissPath}`);
  }
});
