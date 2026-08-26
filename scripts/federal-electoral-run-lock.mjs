import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { closeSync, constants, fchmodSync, fstatSync, fsyncSync, ftruncateSync, lstatSync, openSync, readSync, writeSync } from "node:fs";
import { dirname, resolve } from "node:path";

const sameInode = (left, right) => left?.dev === right?.dev && left?.ino === right?.ino;

function requireNoFollow() {
  assert.equal(typeof constants.O_NOFOLLOW === "number" && constants.O_NOFOLLOW !== 0, true, "federal run locks require O_NOFOLLOW support");
  return constants.O_NOFOLLOW;
}

function syncDirectory(path) {
  const fd = openSync(path, constants.O_RDONLY | (constants.O_DIRECTORY ?? 0) | requireNoFollow());
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function safeLockFile(metadata) {
  return metadata.isFile() && metadata.nlink === 1 && metadata.uid === process.getuid() && (metadata.mode & 0o777) === 0o600;
}

function readMarker(fd) {
  const size = fstatSync(fd).size;
  assert.equal(Number.isSafeInteger(size) && size > 0 && size <= 4096, true, "federal lock marker size is invalid");
  const bytes = Buffer.alloc(size);
  assert.equal(readSync(fd, bytes, 0, size, 0), size, "federal lock marker read was incomplete");
  const value = JSON.parse(bytes);
  assert.equal(value !== null && typeof value === "object" && !Array.isArray(value), true, "federal lock marker is invalid");
  return value;
}

function writeMarker(fd, value) {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  ftruncateSync(fd, 0);
  assert.equal(writeSync(fd, bytes, 0, bytes.length, 0), bytes.length, "federal lock marker write was incomplete");
  fsyncSync(fd);
}

export function acquireFederalRunLock(path) {
  const noFollow = requireNoFollow();
  const lockPath = resolve(path);
  assert.equal(lockPath, path, "federal lock path must be absolute");
  const fd = openSync(lockPath, constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | noFollow, 0o600);
  try {
    fchmodSync(fd, 0o600);
    const opened = fstatSync(fd);
    assert.equal(safeLockFile(opened), true, "federal lock descriptor is unsafe");
    const generation = randomBytes(16).toString("hex");
    writeMarker(fd, { schemaVersion: 1, status: "active", generation, dev: opened.dev, ino: opened.ino });
    const named = lstatSync(lockPath);
    assert.equal(safeLockFile(named) && sameInode(named, opened), true, "federal lock path changed during acquisition");
    syncDirectory(dirname(lockPath));
    return { path: lockPath, dev: opened.dev, ino: opened.ino, generation };
  } finally { closeSync(fd); }
}

export function releaseFederalRunLock(lock, hooks = {}) {
  const noFollow = requireNoFollow();
  assert.equal(resolve(lock.path), lock.path, "federal lock path must be absolute");
  assert.match(lock.generation ?? "", /^[a-f0-9]{32}$/, "federal lock generation is invalid");
  let fd;
  try {
    fd = openSync(lock.path, constants.O_RDWR | noFollow);
    const opened = fstatSync(fd); const named = lstatSync(lock.path);
    if (!safeLockFile(opened) || !safeLockFile(named) || !sameInode(opened, named) || !sameInode(opened, lock)) return false;
    assert.deepEqual(readMarker(fd), { schemaVersion: 1, status: "active", generation: lock.generation, dev: lock.dev, ino: lock.ino }, "federal active lock marker drifted");
    hooks.beforeReleaseMarker?.(lock.path, lock);
    const rebound = lstatSync(lock.path);
    if (!safeLockFile(rebound) || !sameInode(rebound, lock)) return false;
    const released = { schemaVersion: 1, status: "released-owner-cleanup-required", generation: lock.generation, dev: lock.dev, ino: lock.ino };
    writeMarker(fd, released);
    const after = fstatSync(fd); const namedAfter = lstatSync(lock.path);
    if (!safeLockFile(after) || !safeLockFile(namedAfter) || !sameInode(after, namedAfter) || !sameInode(after, lock)) return false;
    assert.deepEqual(readMarker(fd), released, "federal released lock marker drifted");
    syncDirectory(dirname(lock.path));
    return true;
  } catch { return false; }
  finally { if (fd !== undefined) closeSync(fd); }
}

if (process.argv[1]?.endsWith("federal-electoral-run-lock.mjs")) {
  try {
    const [mode, path, dev, ino, generation] = process.argv.slice(2);
    if (mode === "acquire") console.log(JSON.stringify(acquireFederalRunLock(resolve(path))));
    else if (mode === "release") assert.equal(releaseFederalRunLock({ path: resolve(path), dev: Number(dev), ino: Number(ino), generation }), true);
    else throw new Error("unsupported lock mode");
  } catch {
    console.error("Federal owner-only run lock operation failed.");
    process.exit(1);
  }
}
