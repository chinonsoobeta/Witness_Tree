import assert from "node:assert/strict";
import { closeSync, constants, fstatSync, fsyncSync, lstatSync, openSync, writeSync } from "node:fs";
import { dirname, resolve } from "node:path";

const same = (a, b) => a?.dev === b?.dev && a?.ino === b?.ino;

export function acquireCurrentWildfireRunLock(path) {
  const lockPath = resolve(path); assert.equal(lockPath, path); const parentPath = dirname(lockPath);
  const parentBefore = lstatSync(parentPath); assert.equal(parentBefore.isDirectory() && !parentBefore.isSymbolicLink() && parentBefore.uid === process.getuid() && (parentBefore.mode & 0o077) === 0, true);
  const parentFd = openSync(parentPath, constants.O_RDONLY | constants.O_NOFOLLOW); const openedParent = fstatSync(parentFd); assert.equal(same(parentBefore, openedParent), true);
  let fd;
  try {
    fd = openSync(lockPath, constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); const opened = fstatSync(fd);
    assert.equal(opened.isFile() && opened.nlink === 1 && opened.uid === process.getuid() && (opened.mode & 0o777) === 0o600, true);
    writeSync(fd, `${JSON.stringify({ status: "active", pid: process.pid })}\n`); fsyncSync(fd);
    const named = lstatSync(lockPath); const parentAfter = lstatSync(parentPath); assert.equal(same(named, opened), true); assert.equal(same(parentAfter, openedParent), true); fsyncSync(parentFd);
    return { path: lockPath, dev: opened.dev, ino: opened.ino, fd };
  } catch (error) { if (fd !== undefined) closeSync(fd); throw error; }
  finally { closeSync(parentFd); }
}

export function releaseCurrentWildfireRunLock(lock) {
  try {
    const opened = fstatSync(lock.fd); const named = lstatSync(lock.path); if (!same(opened, lock) || !same(named, lock) || !opened.isFile() || opened.nlink !== 1) return false;
    writeSync(lock.fd, `${JSON.stringify({ status: "released-no-delete" })}\n`); fsyncSync(lock.fd); return true;
  } finally { closeSync(lock.fd); }
}

if (process.argv[1]?.endsWith("current-wildfire-run-lock.mjs")) {
  try { assert.equal(process.argv[2], "acquire"); const lock = acquireCurrentWildfireRunLock(resolve(process.argv[3])); console.log(JSON.stringify({ path: lock.path, dev: lock.dev, ino: lock.ino, status: "active-descriptor-held-until-process-exit" })); }
  catch { console.error("Current-wildfire owner-only run lock failed."); process.exitCode = 1; }
}
