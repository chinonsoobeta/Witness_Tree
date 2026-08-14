import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const VERSION = /^[A-Za-z\d._-]{32}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const RETAIN_UNTIL = "2033-08-12T00:00:00+00:00";

export function validateVlce2RemotePromotionEvidence(record, plan) {
  assert.equal(record.schemaVersion, "witness-tree/vlce2-remote-promotion-evidence/1");
  assert.equal(record.status, "remote-verified");
  assert.match(record.observedAt, UTC);
  assert.equal(record.historicalPreparation?.path, "data/vlce2-promotion-preparation.json");
  assert.equal(record.historicalPreparation?.commit, "c5c23bb");
  assert.equal(record.historicalPreparation?.status, "preparation-only");
  assert.equal(record.historicalPreparation?.supersededByThisRecord, true);
  for (const language of ["en", "fr"]) assert.ok(typeof record.historicalPreparation?.[language] === "string" && record.historicalPreparation[language].trim(), `historical chronology needs ${language}`);
  assert.equal(record.source?.id, plan.source.id);
  assert.equal(record.source?.licence?.id, "ogl-canada");
  assert.match(record.source?.licence?.url ?? "", /^https:\/\//);
  for (const language of ["en", "fr"]) assert.ok(typeof record.source?.licence?.attribution?.[language] === "string" && record.source.licence.attribution[language].trim(), `licence attribution needs ${language}`);
  assert.equal(record.storage?.bucket, "witness-tree-raw-archive-ca-central-1");
  assert.equal(record.storage?.region, "ca-central-1");
  assert.equal(record.storage?.retentionMode, "COMPLIANCE");
  assert.equal(record.storage?.retainUntilDate, RETAIN_UNTIL);
  assert.match(record.tools?.awsCli ?? "", /^aws-cli\//);
  assert.match(record.tools?.node ?? "", /^v\d+\./);
  assert.equal(record.entries?.length, 39);
  assert.deepEqual(record.counts, { payloads: 39, sidecars: 39, retainedPayloadVersions: 39 });
  record.entries.forEach((entry, index) => {
    const planned = plan.entries[index];
    assert.equal(entry.year, planned.year);
    assert.deepEqual(entry.payload, { key: planned.remote.payloadKey, versionId: planned.remote.versionId, byteLength: planned.byteLength, checksumType: "FULL_OBJECT", checksumCrc64nvmeBase64: planned.remote.checksumCrc64nvmeBase64 });
    assert.equal(entry.sidecar.key, planned.remote.manifestKey);
    assert.match(entry.sidecar.versionId, VERSION);
    assert.ok(Number.isSafeInteger(entry.sidecar.byteLength) && entry.sidecar.byteLength > 0);
    assert.equal(entry.sidecar.checksumType, "FULL_OBJECT");
    assert.match(entry.sidecar.checksumCrc64nvmeBase64, BASE64);
    assert.equal(entry.retention.mode, "COMPLIANCE");
    assert.equal(entry.retention.retainUntilDate, RETAIN_UNTIL);
  });
  return record;
}

if (process.argv[1]?.endsWith("check-vlce2-remote-promotion-evidence.mjs")) {
  const record = JSON.parse(readFileSync(new URL("../data/vlce2-remote-promotion-evidence.json", import.meta.url), "utf8"));
  const plan = JSON.parse(readFileSync(new URL("../data/vlce2-promotion-preparation.json", import.meta.url), "utf8"));
  validateVlce2RemotePromotionEvidence(record, plan);
  console.log("PASS VLCE2 remote promotion evidence: 39 payloads, sidecars, and compliance-retention read-backs.");
}
