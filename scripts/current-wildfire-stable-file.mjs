import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { closeSync, constants, fchmodSync, fstatSync, fsyncSync, lstatSync, openSync, readSync, writeSync } from "node:fs";
import { dirname, resolve } from "node:path";

const SHA256 = /^[a-f0-9]{64}$/;
const CRC64_POLY = 0x9a6c9329ac4bc9b5n;
const MASK = 0xffffffffffffffffn;
const table = Array.from({ length: 256 }, (_, index) => {
  let value = BigInt(index);
  for (let bit = 0; bit < 8; bit++) value = (value & 1n) ? ((value >> 1n) ^ CRC64_POLY) : (value >> 1n);
  return value;
});

export function crc64Nvme(bytes, initial = MASK) {
  let crc = initial;
  for (const byte of bytes) crc = table[Number((crc ^ BigInt(byte)) & 0xffn)] ^ (crc >> 8n);
  return crc;
}

export function crc64NvmeBase64(crc) {
  const output = Buffer.alloc(8); output.writeBigUInt64BE((crc ^ MASK) & MASK); return output.toString("base64");
}

function sameInode(a, b) { return a.dev === b.dev && a.ino === b.ino; }
function syncParent(path) { const fd = openSync(dirname(path), constants.O_RDONLY); try { fsyncSync(fd); } finally { closeSync(fd); } }
function ownerRegular(path, mode) {
  const value = lstatSync(path); assert.ok(value.isFile() && !value.isSymbolicLink()); assert.equal(value.uid, process.getuid()); assert.equal(value.nlink, 1); if (mode !== undefined) assert.equal(value.mode & 0o777, mode); return value;
}
function writeAll(fd, bytes) { let offset = 0; while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset); }

export function copyStableFile({ source, destination, expectedBytes, expectedSha256 }) {
  assert.equal(resolve(source), source); assert.equal(resolve(destination), destination); assert.ok(Number.isSafeInteger(expectedBytes) && expectedBytes > 0); assert.match(expectedSha256, SHA256);
  const before = ownerRegular(source); assert.equal(before.size, expectedBytes);
  const parent = lstatSync(dirname(destination)); assert.ok(parent.isDirectory() && !parent.isSymbolicLink()); assert.equal(parent.uid, process.getuid()); assert.equal(parent.mode & 0o077, 0);
  const sourceFd = openSync(source, constants.O_RDONLY | constants.O_NOFOLLOW); let outputFd; let opened; let failure; let result;
  try {
    const sourceOpen = fstatSync(sourceFd); assert.ok(sameInode(before, sourceOpen));
    outputFd = openSync(destination, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); opened = fstatSync(outputFd);
    const sha = createHash("sha256"); let crc = MASK; let length = 0; const buffer = Buffer.allocUnsafe(1024 * 1024);
    for (;;) { const count = readSync(sourceFd, buffer, 0, buffer.length, null); if (!count) break; const chunk = buffer.subarray(0, count); sha.update(chunk); crc = crc64Nvme(chunk, crc); writeAll(outputFd, chunk); length += count; }
    fchmodSync(outputFd, 0o400); fsyncSync(outputFd);
    const sourceAfter = fstatSync(sourceFd); const outputAfter = fstatSync(outputFd); const sha256 = sha.digest("hex");
    assert.ok(sameInode(sourceOpen, sourceAfter)); assert.equal(sourceAfter.size, before.size); assert.equal(length, expectedBytes); assert.equal(sha256, expectedSha256); assert.ok(sameInode(opened, outputAfter)); assert.equal(outputAfter.size, expectedBytes);
    result = { path: destination, device: outputAfter.dev, inode: outputAfter.ino, byteLength: length, sha256, checksumAlgorithm: "CRC64NVME", checksumType: "FULL_OBJECT", checksumValue: crc64NvmeBase64(crc) };
  } catch (error) { failure = error; }
  finally { try { if (outputFd !== undefined) closeSync(outputFd); } catch (error) { failure ??= error; } try { closeSync(sourceFd); } catch (error) { failure ??= error; } if (!failure) { try { syncParent(destination); const current = ownerRegular(destination, 0o400); assert.ok(sameInode(current, opened)); } catch (error) { failure = error; } } if (failure && opened) failure = new Error("stable-copy failed; the unique diagnostic is retained and no path was deleted", { cause: failure }); }
  if (failure) throw failure; return result;
}

export function verifyStableFile({ path, expectedDevice, expectedInode, expectedBytes, expectedSha256, expectedChecksum }) {
  const before = ownerRegular(path, 0o400); assert.equal(before.dev, expectedDevice); assert.equal(before.ino, expectedInode); assert.equal(before.size, expectedBytes);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW); try { const opened = fstatSync(fd); assert.ok(sameInode(before, opened)); const sha = createHash("sha256"); let crc = MASK; let length = 0; const buffer = Buffer.allocUnsafe(1024 * 1024); for (;;) { const count = readSync(fd, buffer, 0, buffer.length, null); if (!count) break; const chunk = buffer.subarray(0, count); sha.update(chunk); crc = crc64Nvme(chunk, crc); length += count; } const after = fstatSync(fd); assert.ok(sameInode(opened, after)); assert.equal(length, expectedBytes); assert.equal(sha.digest("hex"), expectedSha256); assert.equal(crc64NvmeBase64(crc), expectedChecksum); return true; } finally { closeSync(fd); }
}

if (process.argv[1]?.endsWith("current-wildfire-stable-file.mjs")) {
  const args = process.argv.slice(2); const value = (name) => args[args.indexOf(name) + 1];
  if (args[0] === "--verify") console.log(JSON.stringify(verifyStableFile({ path: resolve(value("--source")), expectedDevice: Number(value("--device")), expectedInode: Number(value("--inode")), expectedBytes: Number(value("--bytes")), expectedSha256: value("--sha256"), expectedChecksum: value("--checksum") })));
  else console.log(JSON.stringify(copyStableFile({ source: resolve(value("--source")), destination: resolve(value("--destination")), expectedBytes: Number(value("--bytes")), expectedSha256: value("--sha256") })));
}
