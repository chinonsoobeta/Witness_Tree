import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateCurrentWildfireExactRawArchiveCapture } from "../scripts/check-current-wildfire-exact-raw-archive-capture.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const capture = read("../data/current-wildfire-exact-raw-archive-capture-2026-08-25.json");

test("the exact capture binds all four raw snapshots and deterministic sidecars without admission", () => {
  assert.equal(validateCurrentWildfireExactRawArchiveCapture(capture), capture);
  assert.equal(capture.entries.length, 4);
  assert.equal(new Set(capture.entries.flatMap((entry) => [entry.payload.key, entry.manifest.key])).size, 8);
  assert.equal(new Set(capture.entries.flatMap((entry) => [entry.payload.versionId, entry.manifest.versionId])).size, 8);
  assert.equal(capture.entries.every((entry) => [entry.payload, entry.manifest].every((object) => object.checksum.type === "FULL_OBJECT" && object.checksum.algorithm === "CRC64NVME" && object.retention.mode === "COMPLIANCE")), true);
  assert.equal(capture.claims.productionEligible, false);
});

test("the exact capture fails closed on input, manifest, checksum, version, retention, storage, or claim drift", () => {
  for (const mutate of [
    (candidate) => { candidate.entries[0].payload.key = "raw/other/payload.bin"; },
    (candidate) => { candidate.entries[1].manifest.sha256 = "0".repeat(64); },
    (candidate) => { candidate.entries[2].payload.checksum.providerValue = "redacted-present"; },
    (candidate) => { candidate.entries[3].manifest.versionId = candidate.entries[0].payload.versionId; },
    (candidate) => { candidate.entries[0].payload.retention.until = "2033-08-11T00:00:00Z"; },
    (candidate) => { candidate.storage.region = "us-east-1"; },
    (candidate) => { candidate.claims.productionEligible = true; }
  ]) {
    const changed = structuredClone(capture); mutate(changed);
    assert.throws(() => validateCurrentWildfireExactRawArchiveCapture(changed));
  }
});
