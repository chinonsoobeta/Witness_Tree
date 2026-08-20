import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const CHECKSUM = { type: "FULL_OBJECT", algorithm: "CRC64NVME", providerValue: "redacted-present" };
const MANIFEST_BYTES = { "cwfis-current": 1488, "bc-wildfire": 1502, "ab-wildfire": 1335, "on-fire-disturbance": 1369 };

export function validate(e = read("data/current-wildfire-raw-archive-evidence.json"), p = read("data/current-wildfire-immutable-promotion-preparation.json")) {
  assert.equal(e.status, "remote-verified-raw-only");
  assert.equal(e.entries.length, 4);
  assert.equal(e.recoveryVerifiedAt, "2026-08-20");
  assert.deepEqual(e.storage, { bucket: "witness-tree-raw-archive-ca-central-1", recoveryBucket: "witness-tree-raw-recovery-ca-central-1", region: "ca-central-1", countryCode: "CA" });
  assert.deepEqual(e.claims, { derivedObjectsVerified: false, recoveryObjectsVerified: true, ownerAdmission: false, transformed: false, ingested: false, productionEligible: false });
  for (const x of e.entries) {
    const key = p.proposedRoleScope.objectKeys.find((candidate) => candidate.startsWith(`raw/${x.sourceId}/`) && candidate.includes("/payload/"));
    assert.equal(x.payloadKey, key);
    assert.equal(x.manifestKey, key.replace(/\/payload\/[^/]+$/, "/manifest.json"));
    assert.ok(x.payloadVersionPresent && x.manifestVersionPresent);
    for (const checksum of [x.payloadChecksum, x.manifestChecksum, x.recoveryPayload.checksum, x.recoveryManifest.checksum]) assert.deepEqual(checksum, CHECKSUM);
    assert.deepEqual(x.payloadRetention, { mode: "COMPLIANCE", until: "2033-08-12T00:00:00Z" });
    assert.deepEqual(x.recoveryPayload.retention, { mode: "COMPLIANCE", until: "2033-08-12T00:00:00Z" });
    assert.equal(x.recoveryPayload.versionPresent, true);
    assert.equal(x.recoveryManifest.versionPresent, true);
    assert.equal(x.recoveryPayload.byteLength, x.bytes);
    assert.equal(x.recoveryManifest.byteLength, MANIFEST_BYTES[x.sourceId]);
    assert.equal(x.recoveryPayload.matchesPrimary, true);
    assert.equal(x.recoveryManifest.matchesPrimary, true);
    assert.equal(x.recoveryPayload.replication, "REPLICA");
    assert.equal(x.recoveryManifest.replication, "REPLICA");
  }
  return e;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  validate();
  console.log("Current wildfire raw archive evidence passed: four primary/recovery payloads and sidecars are remotely verified; derived objects remain unverified.");
}
