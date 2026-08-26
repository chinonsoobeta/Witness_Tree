import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const CHECKSUM = { type: "FULL_OBJECT", algorithm: "CRC64NVME", providerValue: "redacted-present" };
const MANIFEST_BYTES = { "cwfis-current": 1488, "bc-wildfire": 1502, "ab-wildfire": 1335, "on-fire-disturbance": 1369 };

export function validate(e = read("data/current-wildfire-raw-archive-evidence.json"), p = read("data/current-wildfire-immutable-promotion-preparation.json")) {
  assert.equal(e.status, "attestation-only-not-machine-verifiable");
  assert.equal(e.entries.length, 4);
  assert.equal(e.observedAt, "2026-08-14");
  assert.equal(e.recoveryObservedAt, "2026-08-20");
  assert.deepEqual(e.storage, { bucket: "witness-tree-raw-archive-ca-central-1", recoveryBucket: "witness-tree-raw-recovery-ca-central-1", region: "ca-central-1", countryCode: "CA" });
  assert.deepEqual(e.claims, { derivedObjectsVerified: false, recoveryObjectsVerified: false, machineVerifiableImmutableProof: false, ownerAdmission: false, transformed: false, ingested: false, productionEligible: false });
  assert.match(e.notice, /historical placeholder.*by itself cannot prove exact-version immutable archive/i);
  assert.equal(e.exactRawCaptureRef, "data/current-wildfire-exact-raw-archive-capture-2026-08-25.json");
  for (const x of e.entries) {
    const key = p.proposedRoleScope.objectKeys.find((candidate) => candidate.startsWith(`raw/${x.sourceId}/`) && candidate.includes("/payload/"));
    assert.equal(x.payloadKey, key);
    assert.equal(x.manifestKey, key.replace(/\/payload\/[^/]+$/, "/manifest.json"));
    assert.equal(x.payloadVersionPresent, false);
    assert.equal(x.manifestVersionPresent, false);
    for (const checksum of [x.payloadChecksum, x.manifestChecksum, x.recoveryPayload.checksum, x.recoveryManifest.checksum]) assert.deepEqual(checksum, CHECKSUM);
    assert.deepEqual(x.payloadRetention, { mode: "COMPLIANCE", until: "2033-08-12T00:00:00Z" });
    assert.deepEqual(x.recoveryPayload.retention, { mode: "COMPLIANCE", until: "2033-08-12T00:00:00Z" });
    assert.equal(x.recoveryPayload.versionPresent, false);
    assert.equal(x.recoveryManifest.versionPresent, false);
    assert.equal(x.recoveryPayload.byteLength, x.bytes);
    assert.equal(x.recoveryManifest.byteLength, MANIFEST_BYTES[x.sourceId]);
    assert.equal(x.recoveryPayload.matchesPrimary, false);
    assert.equal(x.recoveryManifest.matchesPrimary, false);
    assert.equal(x.recoveryPayload.replication, "REPLICA");
    assert.equal(x.recoveryManifest.replication, "REPLICA");
  }
  return e;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  validate();
  console.log("Current wildfire raw archive attestation passed schema checks but is not machine-verifiable immutable proof.");
}
