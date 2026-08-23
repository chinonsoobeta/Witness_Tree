import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { copyStableFile, crc64Nvme, crc64NvmeBase64, verifyStableFile } from "../scripts/current-wildfire-stable-file.mjs";

test("CRC64NVME matches the standard vector and stable copy binds SHA, length, checksum, device and inode", () => {
  assert.equal(crc64NvmeBase64(crc64Nvme(Buffer.from("123456789"))), "rosUhgp5mIg=");
  const dir = mkdtempSync(join(tmpdir(), "wildfire-stable-")); const source = join(dir, "source"); const stable = join(dir, "stable"); const bytes = Buffer.from("exact stable wildfire bytes"); const sha256 = createHash("sha256").update(bytes).digest("hex");
  try { writeFileSync(source, bytes); const result = copyStableFile({ source, destination: stable, expectedBytes: bytes.length, expectedSha256: sha256 }); assert.equal(verifyStableFile({ path: stable, expectedDevice: result.device, expectedInode: result.inode, expectedBytes: bytes.length, expectedSha256: sha256, expectedChecksum: result.checksumValue }), true); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});

test("stable verification rejects a path replacement without deleting it", () => {
  const dir = mkdtempSync(join(tmpdir(), "wildfire-stable-swap-")); const source = join(dir, "source"); const stable = join(dir, "stable"); const old = join(dir, "old"); const bytes = Buffer.from("approved bytes"); const sha256 = createHash("sha256").update(bytes).digest("hex");
  try { writeFileSync(source, bytes); const result = copyStableFile({ source, destination: stable, expectedBytes: bytes.length, expectedSha256: sha256 }); renameSync(stable, old); writeFileSync(stable, "replacement", { mode: 0o400 }); chmodSync(stable, 0o400); assert.throws(() => verifyStableFile({ path: stable, expectedDevice: result.device, expectedInode: result.inode, expectedBytes: bytes.length, expectedSha256: sha256, expectedChecksum: result.checksumValue })); assert.equal(readFileSync(stable, "utf8"), "replacement"); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});
