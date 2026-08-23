import assert from "node:assert/strict";
import { closeSync, constants, fstatSync, fsyncSync, lstatSync, openSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const same = (a, b) => a?.dev === b?.dev && a?.ino === b?.ino;
const sameStableFile = (a, b) => same(a, b) && a.size === b.size && a.uid === b.uid && a.nlink === b.nlink && (a.mode & 0o777) === (b.mode & 0o777) && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
assert.equal(Number.isInteger(constants.O_NOFOLLOW), true, "O_NOFOLLOW is required for wildfire publication");

export function publishCurrentWildfireMode600(path, value, hooks = {}) {
  const output = resolve(path); assert.equal(output, path); const parentPath = dirname(output); const parent = lstatSync(parentPath); assert.equal(parent.isDirectory() && !parent.isSymbolicLink() && parent.uid === process.getuid(), true);
  const parentFd = openSync(parentPath, constants.O_RDONLY | constants.O_NOFOLLOW); const openedParent = fstatSync(parentFd); assert.equal(same(parent, openedParent), true);
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`); let fd; let opened;
  try {
    hooks.beforeOpen?.(output); fd = openSync(output, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); opened = fstatSync(fd);
    assert.equal(opened.isFile() && opened.nlink === 1 && opened.uid === process.getuid(), true); writeFileSync(fd, bytes); fsyncSync(fd); hooks.afterFsync?.(output, opened);
    const currentParent = lstatSync(parentPath); assert.equal(same(currentParent, openedParent), true, "publication parent changed");
    const written = fstatSync(fd); assert.equal(same(written, opened) && written.size === bytes.length && written.nlink === 1, true); const named = lstatSync(output); assert.equal(sameStableFile(named, written), true); fsyncSync(parentFd); closeSync(fd); fd = undefined; const namedAfterClose = lstatSync(output); assert.equal(sameStableFile(namedAfterClose, written), true, "publication pathname changed after close");
    return { path: output, dev: opened.dev, ino: opened.ino, size: bytes.length };
  } catch (error) { if (fd !== undefined) try { closeSync(fd); } catch { /* retain */ } throw new Error(opened ? "publication failed; owner-only diagnostic retained" : "publication could not be created exclusively", { cause: error }); }
  finally { closeSync(parentFd); }
}
