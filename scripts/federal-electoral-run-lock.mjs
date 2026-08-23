import assert from "node:assert/strict";
import { chmodSync, closeSync, constants, fsyncSync, lstatSync, mkdirSync, openSync, renameSync } from "node:fs";
import { dirname, resolve } from "node:path";

const sameInode = (left, right) => left?.dev === right?.dev && left?.ino === right?.ino;

function syncDirectory(path) {
  const fd = openSync(path, constants.O_RDONLY);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

export function acquireFederalRunLock(path) {
  const lockPath = resolve(path);
  assert.equal(lockPath, path, "federal lock path must be absolute");
  mkdirSync(lockPath, { mode: 0o700 });
  chmodSync(lockPath, 0o700);
  const lock = lstatSync(lockPath);
  assert.equal(lock.isDirectory() && !lock.isSymbolicLink() && lock.uid === process.getuid() && (lock.mode & 0o777) === 0o700, true, "federal lock is unsafe");
  syncDirectory(dirname(lockPath));
  return { path: lockPath, dev: lock.dev, ino: lock.ino };
}

export function releaseFederalRunLock(lock, tombstonePath, hooks = {}) {
  assert.equal(resolve(lock.path), lock.path, "federal lock path must be absolute");
  assert.equal(resolve(tombstonePath), tombstonePath, "federal lock tombstone must be absolute");
  const current = lstatSync(lock.path);
  if (!current.isDirectory() || current.isSymbolicLink() || !sameInode(current, lock)) return false;
  hooks.beforeRename?.(lock.path, lock);
  renameSync(lock.path, tombstonePath);
  const moved = lstatSync(tombstonePath);
  if (!moved.isDirectory() || moved.isSymbolicLink() || !sameInode(moved, lock)) {
    // The atomically moved object was not ours. Restore the name if possible;
    // never remove it.
    try { renameSync(tombstonePath, lock.path); } catch { /* preserve both states */ }
    return false;
  }
  hooks.afterRename?.(tombstonePath, lock);
  const final = lstatSync(tombstonePath);
  if (!sameInode(final, lock)) return false;
  // Renaming releases the well-known lock name. Retain the empty inode-bound
  // tombstone: deleting by pathname would reintroduce a replacement race.
  syncDirectory(dirname(lock.path));
  return true;
}

if (process.argv[1]?.endsWith("federal-electoral-run-lock.mjs")) {
  try {
    const [mode, path, dev, ino, tombstone] = process.argv.slice(2);
    if (mode === "acquire") console.log(JSON.stringify(acquireFederalRunLock(resolve(path))));
    else if (mode === "release") {
      assert.equal(releaseFederalRunLock({ path: resolve(path), dev: Number(dev), ino: Number(ino) }, resolve(tombstone)), true);
    } else throw new Error("unsupported lock mode");
  } catch {
    console.error("Federal owner-only run lock operation failed.");
    process.exitCode = 1;
  }
}
