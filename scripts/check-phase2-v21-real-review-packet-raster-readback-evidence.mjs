import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveRecordedDataPath } from "./data-root.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const bytes = (path) => readFileSync(resolveRecordedDataPath(path) ?? `${root}/${path}`);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const evidence = JSON.parse(bytes("data/phase2-v21-real-review-packet-raster-readback-evidence.json"));
const packetEvidence = JSON.parse(bytes("data/phase2-v21-real-review-packet-evidence.json"));
const packetBytes = bytes(packetEvidence.packet.path);

export function validateReviewPacketRasterReadback(candidate, sourcePacketEvidence, sourcePacketBytes, runnerSha256) {
  const sourcePacket = JSON.parse(sourcePacketBytes);
  assert.equal(candidate.schemaVersion, "witness-tree/phase2-v21-real-review-packet-raster-readback-evidence/1");
  assert.equal(candidate.status, "local-native-pixel-readback-passed-nonproduction");
  assert.deepEqual(candidate.packet, sourcePacketEvidence.packet);
  assert.equal(digest(sourcePacketBytes), sourcePacketEvidence.packet.sha256,
    "packet content must remain checksum-bound to its evidence");
  assert.deepEqual(candidate.runner, { path: "scripts/readback-phase2-v21-real-review-packet.mjs", sha256: runnerSha256 });

  const expectedRasters = new Map();
  for (const sample of sourcePacket.samples) {
    const current = expectedRasters.get(sample.raster.path);
    const next = { path: sample.raster.path, byteLength: sample.raster.byteLength, sha256: sample.raster.sha256, samples: (current?.samples ?? 0) + 1 };
    if (current) {
      assert.equal(next.byteLength, current.byteLength, `${next.path} byte length drifts inside the packet`);
      assert.equal(next.sha256, current.sha256, `${next.path} checksum drifts inside the packet`);
    }
    expectedRasters.set(next.path, next);
  }
  assert.deepEqual(candidate.rasters, [...expectedRasters.values()].sort((a, b) => a.path.localeCompare(b.path)));
  assert.equal(candidate.rasters.reduce((total, raster) => total + raster.samples, 0), sourcePacket.samples.length);
  for (const raster of candidate.rasters) {
    assert.match(raster.sha256, /^[a-f0-9]{64}$/);
    assert.equal(raster.byteLength > 0, true);
  }
  assert.deepEqual(candidate.result, { samples: 400, observedLoss: 200, knownNoLoss: 200, allNativePixelsMatchPacketClass: true });
  assert.deepEqual(candidate.claims, { candidatePacketNativeReadbackCompleted: true, expertReviewCompleted: false, validationResultsExist: false, admittedInputs: false, productionEligible: false, released: false });
  return candidate;
}

validateReviewPacketRasterReadback(
  evidence,
  packetEvidence,
  packetBytes,
  digest(bytes("scripts/readback-phase2-v21-real-review-packet.mjs")),
);
console.log("Phase 2 review-packet native readback evidence passes; it grants no review, admission, or release credit.");
