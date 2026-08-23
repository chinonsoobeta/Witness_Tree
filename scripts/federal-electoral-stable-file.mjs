import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { closeSync, constants, fchmodSync, fstatSync, fsyncSync, lstatSync, openSync, readSync, writeSync } from "node:fs";
import { dirname, resolve } from "node:path";

const SHA256 = /^[a-f0-9]{64}$/;
const sameIdentity = (left, right) => left.dev === right.dev && left.ino === right.ino && left.size === right.size && String(left.mtimeNs) === String(right.mtimeNs) && String(left.ctimeNs) === String(right.ctimeNs);
const sameInode = (left, right) => left.dev === right.dev && left.ino === right.ino;
const base64Sha = (hex) => Buffer.from(hex, "hex").toString("base64");

function requireNoFollow() {
  assert.equal(typeof constants.O_NOFOLLOW === "number" && constants.O_NOFOLLOW !== 0, true, "federal stable-file operations require O_NOFOLLOW support");
  return constants.O_NOFOLLOW;
}

function regularOwnerFile(path, label) {
  const metadata = lstatSync(path);
  assert.equal(metadata.isSymbolicLink(), false, `${label} cannot be a symlink`);
  assert.equal(metadata.isFile(), true, `${label} must be a regular file`);
  assert.equal(metadata.nlink, 1, `${label} cannot have a hard-link alias`);
  assert.equal(metadata.uid, process.getuid(), `${label} must be owner-owned`);
  return metadata;
}

function syncDirectory(path) {
  const fd = openSync(path, constants.O_RDONLY | requireNoFollow());
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function writeAll(fd, bytes) {
  let offset = 0;
  while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
}

function invokeHook(hooks, name, ...args) {
  const hook = hooks?.[name];
  if (hook === undefined) return;
  assert.equal(typeof hook, "function", `stable-file ${name} hook is invalid`);
  hook(...args);
}

function closeOwnedDescriptor(fd, hooks, label) {
  if (fd === undefined) return;
  closeSync(fd);
  invokeHook(hooks, "afterClose", label, fd);
}

export function verifyStableSourceDescriptor({ source, expectedBytes, expectedSha256, hooks = {} }) {
  const noFollow = requireNoFollow();
  assert.equal(resolve(source), source, "source must be an absolute path");
  assert.ok(Number.isSafeInteger(expectedBytes) && expectedBytes > 0, "expected byte length is invalid");
  assert.match(expectedSha256, SHA256, "expected SHA-256 is invalid");
  const sourceBefore = regularOwnerFile(source, "approved source");
  assert.equal(sourceBefore.size, expectedBytes, "approved source byte length drifted");
  const fd = openSync(source, constants.O_RDONLY | noFollow);
  const hash = createHash("sha256");
  let bytesRead = 0;
  try {
    const opened = fstatSync(fd);
    assert.equal(sameIdentity(opened, sourceBefore), true, "approved source changed before descriptor verification");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    for (;;) {
      const count = readSync(fd, buffer, 0, buffer.length, null);
      if (count === 0) break;
      hash.update(buffer.subarray(0, count));
      bytesRead += count;
      invokeHook(hooks, "afterRead", source, opened, bytesRead);
    }
    const after = fstatSync(fd);
    const named = regularOwnerFile(source, "approved source");
    assert.equal(sameIdentity(after, opened), true, "approved source changed during descriptor verification");
    assert.equal(sameIdentity(named, opened), true, "approved source pathname changed during descriptor verification");
    assert.equal(bytesRead, expectedBytes, "approved source byte length drifted");
    const sha256 = hash.digest("hex");
    assert.equal(sha256, expectedSha256, "approved source SHA-256 drifted");
    return { path: source, byteLength: bytesRead, sha256, sourceDevice: opened.dev, sourceInode: opened.ino, descriptorBound: true };
  } finally {
    closeOwnedDescriptor(fd, hooks, "verified-source");
  }
}

export function copyStableDescriptor({ source, destination, expectedBytes, expectedSha256, hooks = {} }) {
  const noFollow = requireNoFollow();
  assert.ok(resolve(source) === source || source.startsWith("/"), "source must be an absolute path");
  assert.ok(resolve(destination) === destination || destination.startsWith("/"), "destination must be an absolute path");
  assert.ok(Number.isSafeInteger(expectedBytes) && expectedBytes > 0, "expected byte length is invalid");
  assert.match(expectedSha256, SHA256, "expected SHA-256 is invalid");
  const sourcePath = resolve(source);
  const destinationPath = resolve(destination);
  const sourceBefore = regularOwnerFile(sourcePath, "approved source");
  assert.equal(sourceBefore.size, expectedBytes, "approved source byte length drifted");
  const parent = lstatSync(dirname(destinationPath));
  assert.equal(parent.isDirectory(), true, "stable-file parent is not a directory");
  assert.equal(parent.isSymbolicLink(), false, "stable-file parent cannot be a symlink");
  try { lstatSync(destinationPath); assert.fail("stable destination already exists"); } catch (error) { if (error?.code !== "ENOENT") throw error; }

  const sourceFd = openSync(sourcePath, constants.O_RDONLY | noFollow);
  let destinationFd;
  let destinationOpened;
  let result;
  let failure;
  const hash = createHash("sha256");
  let bytesRead = 0;
  try {
    const openedSource = fstatSync(sourceFd);
    assert.equal(sameIdentity(openedSource, sourceBefore), true, "approved source changed before descriptor copy");
    invokeHook(hooks, "beforeDestinationOpen", destinationPath);
    destinationFd = openSync(destinationPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow, 0o600);
    destinationOpened = fstatSync(destinationFd);
    assert.equal(destinationOpened.isFile(), true, "stable destination is not a regular file");
    assert.equal(destinationOpened.nlink, 1, "stable destination has a hard-link alias");
    assert.equal(destinationOpened.uid, process.getuid(), "stable destination is not owner-owned");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    for (;;) {
      const count = readSync(sourceFd, buffer, 0, buffer.length, null);
      if (count === 0) break;
      const chunk = buffer.subarray(0, count);
      hash.update(chunk);
      writeAll(destinationFd, chunk);
      bytesRead += count;
    }
    fsyncSync(destinationFd);
    const sourceAfter = fstatSync(sourceFd);
    const destinationAfter = fstatSync(destinationFd);
    const sha256 = hash.digest("hex");
    assert.equal(sameIdentity(sourceAfter, sourceBefore), true, "approved source changed during descriptor copy");
    assert.equal(bytesRead, expectedBytes, "stable descriptor copy byte length drifted");
    assert.equal(sha256, expectedSha256, "stable descriptor copy SHA-256 drifted");
    assert.equal(destinationAfter.size, expectedBytes, "stable destination byte length drifted");
    assert.equal(sameInode(destinationAfter, destinationOpened), true, "stable destination inode changed before close");
    invokeHook(hooks, "beforeFileFsync", destinationPath, destinationOpened);
    fchmodSync(destinationFd, 0o400);
    fsyncSync(destinationFd);
    invokeHook(hooks, "afterFileFsync", destinationPath, destinationOpened);
    result = { path: destinationPath, byteLength: bytesRead, sha256, checksumAlgorithm: "SHA256", checksumType: "FULL_OBJECT", checksumSha256: base64Sha(sha256), sourceDevice: sourceBefore.dev, sourceInode: sourceBefore.ino, stableDevice: destinationOpened.dev, stableInode: destinationOpened.ino };
  } catch (error) {
    failure = error;
  } finally {
    try { closeOwnedDescriptor(destinationFd, hooks, "destination"); } catch (error) { failure ??= error; }
    try { closeOwnedDescriptor(sourceFd, hooks, "source"); } catch (error) { failure ??= error; }
    if (!failure && result) {
      try { syncDirectory(dirname(destinationPath)); } catch (error) { failure = error; }
    }
    // POSIX has no atomic conditional unlink-by-inode. Retaining a failed
    // owner-only diagnostic is safer than risking deletion of a replacement.
    if (failure && destinationOpened) failure = new Error("stable descriptor copy failed; owner-only diagnostic output was retained", { cause: failure });
  }
  if (failure) throw failure;
  return result;
}

export function writeStableManifest({ destination, value, hooks = {} }) {
  const noFollow = requireNoFollow();
  assert.equal(value && typeof value === "object" && !Array.isArray(value), true, "manifest value must be an object");
  const destinationPath = resolve(destination);
  const parent = lstatSync(dirname(destinationPath));
  assert.equal(parent.isDirectory(), true, "manifest parent is not a directory");
  assert.equal(parent.isSymbolicLink(), false, "manifest parent cannot be a symlink");
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  let fd;
  let opened;
  let result;
  let failure;
  try {
    invokeHook(hooks, "beforeDestinationOpen", destinationPath);
    fd = openSync(destinationPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow, 0o600);
    opened = fstatSync(fd);
    assert.equal(opened.isFile(), true); assert.equal(opened.nlink, 1); assert.equal(opened.uid, process.getuid());
    writeAll(fd, bytes); invokeHook(hooks, "beforeFileFsync", destinationPath, opened); fsyncSync(fd); fchmodSync(fd, 0o400); fsyncSync(fd); invokeHook(hooks, "afterFileFsync", destinationPath, opened);
    const after = fstatSync(fd);
    assert.equal(after.size, bytes.length); assert.equal(sameInode(after, opened), true);
    result = { path: destinationPath, byteLength: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), checksumAlgorithm: "SHA256", checksumType: "FULL_OBJECT", checksumSha256: base64Sha(createHash("sha256").update(bytes).digest("hex")), stableDevice: opened.dev, stableInode: opened.ino };
  } catch (error) {
    failure = error;
  } finally {
    try { closeOwnedDescriptor(fd, hooks, "manifest"); } catch (error) { failure ??= error; }
    if (!failure && result) {
      try { syncDirectory(dirname(destinationPath)); } catch (error) { failure = error; }
    }
    if (failure && opened) failure = new Error("stable manifest failed; owner-only diagnostic output was retained", { cause: failure });
  }
  if (failure) throw failure;
  return result;
}

export function verifyStableUploadDescriptor({ fd, path, expectedDevice, expectedInode, expectedBytes }) {
  requireNoFollow();
  assert.equal(Number.isSafeInteger(fd) && fd >= 0, true, "stable upload descriptor is invalid");
  assert.equal(resolve(path), path, "stable upload path must be absolute");
  const opened = fstatSync(fd);
  assert.equal(opened.isFile(), true, "stable upload descriptor is not a regular file");
  assert.equal(opened.uid, process.getuid(), "stable upload descriptor is not owner-owned");
  assert.equal(opened.dev, expectedDevice, "stable upload descriptor device drifted");
  assert.equal(opened.ino, expectedInode, "stable upload descriptor inode drifted");
  assert.equal(opened.size, expectedBytes, "stable upload descriptor byte length drifted");
  const named = lstatSync(path);
  assert.equal(named.isFile() && !named.isSymbolicLink(), true, "stable upload path is not a regular file");
  assert.equal(sameInode(named, opened), true, "stable upload path no longer names the open descriptor");
  return { fdPath: `/dev/fd/${fd}`, stableDevice: opened.dev, stableInode: opened.ino, byteLength: opened.size };
}

if (process.argv[1]?.endsWith("federal-electoral-stable-file.mjs")) {
  try {
    const args = process.argv.slice(2);
    const value = (name) => { const index = args.indexOf(name); return index === -1 ? undefined : args[index + 1]; };
    if (args.includes("--copy")) {
      const result = copyStableDescriptor({ source: value("--source"), destination: value("--destination"), expectedBytes: Number(value("--bytes")), expectedSha256: value("--sha256") });
      console.log(JSON.stringify(result));
    } else if (args.includes("--verify-source")) {
      const result = verifyStableSourceDescriptor({ source: resolve(value("--source")), expectedBytes: Number(value("--bytes")), expectedSha256: value("--sha256") });
      console.log(JSON.stringify(result));
    } else if (args.includes("--manifest")) {
      const result = writeStableManifest({ destination: value("--destination"), value: JSON.parse(value("--value")) });
      console.log(JSON.stringify(result));
    } else if (args.includes("--verify-fd")) {
      const result = verifyStableUploadDescriptor({ fd: Number(value("--fd")), path: resolve(value("--path")), expectedDevice: Number(value("--device")), expectedInode: Number(value("--inode")), expectedBytes: Number(value("--bytes")) });
      console.log(JSON.stringify(result));
    } else throw new Error("unsupported mode");
  } catch {
    console.error("Federal stable-file preparation failed without exposing local values.");
    process.exitCode = 1;
  }
}
