import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { closeSync, constants, fchmodSync, fstatSync, fsyncSync, ftruncateSync, lstatSync, mkdirSync, openSync, readSync, writeSync } from "node:fs";
import { dirname, resolve } from "node:path";

assert.equal(Number.isInteger(constants.O_NOFOLLOW), true, "O_NOFOLLOW is required for the wildfire run lock");
const same = (a, b) => a?.dev === b?.dev && a?.ino === b?.ino;
const sameStableFile = (a, b) => same(a, b) && a.size === b.size && a.uid === b.uid && a.nlink === b.nlink && (a.mode & 0o777) === (b.mode & 0o777) && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
const safeLock = (value) => value.isFile() && value.nlink === 1 && value.uid === process.getuid() && (value.mode & 0o777) === 0o600;

function syncDirectory(path) { const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW); try { fsyncSync(fd); } finally { closeSync(fd); } }
function readMarker(fd) { const size = fstatSync(fd).size; assert.ok(size > 0 && size <= 4096); const bytes = Buffer.alloc(size); assert.equal(readSync(fd, bytes, 0, size, 0), size); return JSON.parse(bytes); }
function writeMarker(fd, value) { const bytes = Buffer.from(`${JSON.stringify(value)}\n`); ftruncateSync(fd, 0); assert.equal(writeSync(fd, bytes, 0, bytes.length, 0), bytes.length); fsyncSync(fd); }

export function acquireCurrentWildfireRunLock(path) {
  const lockPath = resolve(path); assert.equal(lockPath, path); const parentPath = dirname(lockPath);
  try { mkdirSync(parentPath, { mode: 0o700 }); } catch (error) { if (error?.code !== "EEXIST") throw error; }
  const parentBefore = lstatSync(parentPath); assert.equal(parentBefore.isDirectory() && !parentBefore.isSymbolicLink() && parentBefore.uid === process.getuid() && (parentBefore.mode & 0o077) === 0, true);
  const parentFd = openSync(parentPath, constants.O_RDONLY | constants.O_NOFOLLOW); const openedParent = fstatSync(parentFd); assert.equal(same(parentBefore, openedParent), true);
  let fd;
  try {
    fd = openSync(lockPath, constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); fchmodSync(fd, 0o600); const opened = fstatSync(fd);
    assert.equal(safeLock(opened), true); const generation = randomBytes(16).toString("hex"); writeMarker(fd, { schemaVersion: 1, status: "active", generation, dev: opened.dev, ino: opened.ino });
    const written = fstatSync(fd); const named = lstatSync(lockPath); const parentAfter = lstatSync(parentPath); assert.equal(sameStableFile(named, written), true); assert.equal(same(parentAfter, openedParent), true); fsyncSync(parentFd);
    return { path: lockPath, dev: opened.dev, ino: opened.ino, generation, fd };
  } catch (error) { if (fd !== undefined) closeSync(fd); throw error; }
  finally { closeSync(parentFd); }
}

export function releaseCurrentWildfireRunLock(lock, hooks = {}) {
  let fd = lock.fd;
  try {
    if (fd === undefined) fd = openSync(lock.path, constants.O_RDWR | constants.O_NOFOLLOW);
    const opened = fstatSync(fd); const named = lstatSync(lock.path); if (!safeLock(opened) || !safeLock(named) || !sameStableFile(opened, named) || !same(opened, lock)) return false;
    assert.deepEqual(readMarker(fd), { schemaVersion: 1, status: "active", generation: lock.generation, dev: lock.dev, ino: lock.ino });
    hooks.beforeWrite?.(lock.path, lock);
    const rebound = lstatSync(lock.path); if (!sameStableFile(rebound, opened)) return false;
    const released = { schemaVersion: 1, status: "released-owner-cleanup-required", generation: lock.generation, dev: lock.dev, ino: lock.ino }; writeMarker(fd, released);
    hooks.afterWrite?.(lock.path, lock);
    const written = fstatSync(fd); const namedAfter = lstatSync(lock.path); if (!safeLock(written) || !safeLock(namedAfter) || !sameStableFile(written, namedAfter) || !same(written, lock)) return false;
    assert.deepEqual(readMarker(fd), released); syncDirectory(dirname(lock.path));
    const finalOpened = fstatSync(fd); const finalNamed = lstatSync(lock.path); return sameStableFile(finalOpened, written) && sameStableFile(finalNamed, written);
  } catch { return false; }
  finally { if (fd !== undefined) closeSync(fd); }
}

if (process.argv[1]?.endsWith("current-wildfire-run-lock.mjs")) {
  try {
    const [mode, path, serialized] = process.argv.slice(2);
    if (mode === "acquire") { const lock = acquireCurrentWildfireRunLock(resolve(path)); console.log(JSON.stringify({ path: lock.path, dev: lock.dev, ino: lock.ino, generation: lock.generation })); closeSync(lock.fd); }
    else if (mode === "release") { const lock = JSON.parse(serialized); assert.equal(releaseCurrentWildfireRunLock(lock), true); }
    else throw new Error("usage");
  } catch { console.error("Current-wildfire owner-only run lock failed; explicit owner cleanup is required."); process.exitCode = 1; }
}
