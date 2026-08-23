import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { closeSync, constants, fchmodSync, fstatSync, fsyncSync, lstatSync, openSync, readSync, unlinkSync, writeSync } from "node:fs";
import { dirname, resolve } from "node:path";

const SHA256 = /^[a-f0-9]{64}$/;
const sameIdentity = (left, right) => left.dev === right.dev && left.ino === right.ino && left.size === right.size && String(left.mtimeNs) === String(right.mtimeNs) && String(left.ctimeNs) === String(right.ctimeNs);
const sameInode = (left, right) => left.dev === right.dev && left.ino === right.ino;
const base64Sha = (hex) => Buffer.from(hex, "hex").toString("base64");

function regularOwnerFile(path, label) {
  const metadata = lstatSync(path);
  assert.equal(metadata.isSymbolicLink(), false, `${label} cannot be a symlink`);
  assert.equal(metadata.isFile(), true, `${label} must be a regular file`);
  assert.equal(metadata.nlink, 1, `${label} cannot have a hard-link alias`);
  assert.equal(metadata.uid, process.getuid(), `${label} must be owner-owned`);
  return metadata;
}

function syncDirectory(path) {
  const fd = openSync(path, constants.O_RDONLY);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function writeAll(fd, bytes) {
  let offset = 0;
  while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
}

export function copyStableDescriptor({ source, destination, expectedBytes, expectedSha256 }) {
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

  const sourceFd = openSync(sourcePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  let destinationFd;
  let destinationOpened;
  let completed = false;
  const hash = createHash("sha256");
  let bytesRead = 0;
  try {
    const openedSource = fstatSync(sourceFd);
    assert.equal(sameIdentity(openedSource, sourceBefore), true, "approved source changed before descriptor copy");
    destinationFd = openSync(destinationPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
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
    fchmodSync(destinationFd, 0o400);
    fsyncSync(destinationFd);
    completed = true;
    return { path: destinationPath, byteLength: bytesRead, sha256, checksumAlgorithm: "SHA256", checksumType: "FULL_OBJECT", checksumSha256: base64Sha(sha256), sourceDevice: sourceBefore.dev, sourceInode: sourceBefore.ino };
  } finally {
    try {
      try { if (destinationFd !== undefined) closeSync(destinationFd); } finally { closeSync(sourceFd); }
      if (completed) syncDirectory(dirname(destinationPath));
    } finally {
      if (!completed) {
        try {
          const current = lstatSync(destinationPath);
          if (current.isFile() && !current.isSymbolicLink() && current.nlink === 1 && current.uid === process.getuid()) unlinkSync(destinationPath);
        } catch { /* no owned output was proved, so leave uncertain state for inspection */ }
      }
    }
  }
}

export function writeStableManifest({ destination, value }) {
  assert.equal(value && typeof value === "object" && !Array.isArray(value), true, "manifest value must be an object");
  const destinationPath = resolve(destination);
  const parent = lstatSync(dirname(destinationPath));
  assert.equal(parent.isDirectory(), true, "manifest parent is not a directory");
  assert.equal(parent.isSymbolicLink(), false, "manifest parent cannot be a symlink");
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  let fd;
  let opened;
  let completed = false;
  try {
    fd = openSync(destinationPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    opened = fstatSync(fd);
    assert.equal(opened.isFile(), true); assert.equal(opened.nlink, 1); assert.equal(opened.uid, process.getuid());
    writeAll(fd, bytes); fsyncSync(fd); fchmodSync(fd, 0o400); fsyncSync(fd);
    const after = fstatSync(fd);
    assert.equal(after.size, bytes.length); assert.equal(sameInode(after, opened), true);
    completed = true;
    return { path: destinationPath, byteLength: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), checksumAlgorithm: "SHA256", checksumType: "FULL_OBJECT", checksumSha256: base64Sha(createHash("sha256").update(bytes).digest("hex")) };
  } finally {
    try {
      if (fd !== undefined) closeSync(fd);
      if (completed) syncDirectory(dirname(destinationPath));
    } finally {
      if (!completed) {
        try { const current = lstatSync(destinationPath); if (opened && current.isFile() && !current.isSymbolicLink() && current.nlink === 1 && sameInode(current, opened) && current.uid === process.getuid()) unlinkSync(destinationPath); } catch { /* preserve uncertain output */ }
      }
    }
  }
}

if (process.argv[1]?.endsWith("federal-electoral-stable-file.mjs")) {
  try {
    const args = process.argv.slice(2);
    const value = (name) => { const index = args.indexOf(name); return index === -1 ? undefined : args[index + 1]; };
    if (args.includes("--copy")) {
      const result = copyStableDescriptor({ source: value("--source"), destination: value("--destination"), expectedBytes: Number(value("--bytes")), expectedSha256: value("--sha256") });
      console.log(JSON.stringify(result));
    } else if (args.includes("--manifest")) {
      const result = writeStableManifest({ destination: value("--destination"), value: JSON.parse(value("--value")) });
      console.log(JSON.stringify(result));
    } else throw new Error("unsupported mode");
  } catch {
    console.error("Federal stable-file preparation failed without exposing local values.");
    process.exitCode = 1;
  }
}
