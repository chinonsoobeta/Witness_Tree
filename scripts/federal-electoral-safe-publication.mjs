import assert from "node:assert/strict";
import { closeSync, constants, fstatSync, fsyncSync, lstatSync, openSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const sameInode = (left, right) => left?.dev === right?.dev && left?.ino === right?.ino;

function syncDirectory(path) {
  const fd = openSync(path, constants.O_RDONLY);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function hook(hooks, name, ...args) {
  if (hooks?.[name] === undefined) return;
  assert.equal(typeof hooks[name], "function", `${name} hook is invalid`);
  hooks[name](...args);
}

export function publishFederalMode600(path, value, hooks = {}) {
  const outputPath = resolve(path);
  assert.equal(outputPath, path, "federal publication path must be absolute");
  const parent = lstatSync(dirname(outputPath));
  assert.equal(parent.isDirectory() && !parent.isSymbolicLink(), true, "federal publication parent is unsafe");
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  let fd;
  let opened;
  try {
    fd = openSync(outputPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    opened = fstatSync(fd);
    assert.equal(opened.isFile() && opened.nlink === 1 && opened.uid === process.getuid() && (opened.mode & 0o777) === 0o600, true, "federal publication descriptor is unsafe");
    writeFileSync(fd, bytes);
    fsyncSync(fd);
    hook(hooks, "afterFileFsync", outputPath, opened);
    const written = fstatSync(fd);
    assert.equal(sameInode(written, opened) && written.size === bytes.length && written.nlink === 1, true, "federal publication descriptor changed");
    const named = lstatSync(outputPath);
    assert.equal(named.isFile() && !named.isSymbolicLink() && named.nlink === 1 && sameInode(named, opened), true, "federal publication pathname changed");
    syncDirectory(dirname(outputPath));
    const durable = lstatSync(outputPath);
    assert.equal(sameInode(durable, opened) && durable.size === bytes.length && durable.nlink === 1, true, "federal publication changed before commit");
    closeSync(fd);
    fd = undefined;
    return { path: outputPath, dev: opened.dev, ino: opened.ino, size: bytes.length };
  } catch (error) {
    if (fd !== undefined) try { closeSync(fd); } catch { /* retain diagnostic */ }
    // Never unlink during failure handling. This makes replacement deletion
    // impossible even if a same-owner rename races the publication checks.
    throw new Error(opened ? "federal publication failed; owner-only diagnostic was retained" : "federal publication could not be created exclusively", { cause: error });
  }
}
