import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SHA256 = /^[a-f\d]{64}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

function isUtc(value) {
  return typeof value === "string" && UTC.test(value) && new Date(value).toISOString() === value.replace("Z", ".000Z");
}

/** Checks the recorded restore result only. It intentionally has no AWS command or write path. */
export function validateImmutableRestoreDrill(drill, promotions, staging) {
  assert.equal(drill.schemaVersion, "witness-tree/immutable-restore-drill/1");
  assert.equal(drill.status, "passed");
  assert.equal(drill.operation, "read-only-version-pinned-restore");
  assert.match(drill.nonMutationStatement, /did not upload, delete, lock, or alter retention/i);
  assert.ok(isUtc(drill.startedAt));
  assert.ok(isUtc(drill.completedAt));
  assert.ok(new Date(drill.completedAt) >= new Date(drill.startedAt));
  assert.match(drill.tools.awsCli, /^aws-cli\//);
  assert.match(drill.tools.sha256, /shasum/);
  assert.match(drill.tools.zipIntegrity, /unzip/i);
  assert.equal(drill.entries.length, 3);

  const stagedById = new Map(staging.entries.map((entry) => [entry.id, entry]));
  const promotionBySource = new Map(promotions.entries.map((entry) => [entry.sourceId, entry]));
  const seen = new Set();
  for (const entry of drill.entries) {
    assert.ok(!seen.has(entry.sourceId), "Each immutable payload must be restored exactly once.");
    seen.add(entry.sourceId);
    const promotion = promotionBySource.get(entry.sourceId);
    assert.ok(promotion, `${entry.sourceId} is not an immutable promotion.`);
    const staged = stagedById.get(promotion.stagedEntryId);
    assert.ok(staged, `${entry.sourceId} lacks staged source evidence.`);
    assert.equal(entry.payloadKey, promotion.payloadKey, `${entry.sourceId} exact payload key mismatch.`);
    assert.equal(entry.versionId, promotion.payloadVersionId, `${entry.sourceId} exact payload VersionId mismatch.`);
    assert.equal(entry.remoteByteLength, promotion.remoteByteLength);
    assert.equal(entry.downloadedByteLength, staged.byteLength);
    assert.equal(entry.downloadedByteLength, entry.remoteByteLength);
    assert.match(entry.downloadedSha256, SHA256);
    assert.equal(entry.downloadedSha256, staged.sha256, `${entry.sourceId} downloadedSha256 mismatch.`);
    assert.equal(entry.zipIntegrity, "passed");
    assert.equal(entry.temporaryCopyRemoved, true, `${entry.sourceId} temporaryCopyRemoved must be true.`);
    assert.ok(isUtc(entry.downloadStartedAt));
    assert.ok(isUtc(entry.downloadCompletedAt));
    assert.ok(new Date(entry.downloadCompletedAt) >= new Date(entry.downloadStartedAt));
  }
  assert.deepEqual([...seen].sort(), [...promotionBySource.keys()].sort());
  return drill;
}

if (process.argv[1]?.endsWith("check-immutable-restore-drill.mjs")) {
  const drill = JSON.parse(readFileSync(new URL("../data/immutable-restore-drill.json", import.meta.url), "utf8"));
  const promotions = JSON.parse(readFileSync(new URL("../data/immutable-promotions.json", import.meta.url), "utf8"));
  const staging = JSON.parse(readFileSync(new URL("../data/staged-acquisitions.json", import.meta.url), "utf8"));
  validateImmutableRestoreDrill(drill, promotions, staging);
  console.log("PASS immutable restore drill: three exact version-pinned payloads restored, verified, and removed from temporary storage.");
}
