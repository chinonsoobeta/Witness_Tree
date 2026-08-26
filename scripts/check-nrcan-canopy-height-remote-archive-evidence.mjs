import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const checksum = { type: "FULL_OBJECT", algorithm: "CRC64NVME", providerValue: "redacted-present" };

export function validateNrcanCanopyHeightRemoteArchiveEvidence(e = read("data/nrcan-canopy-height-remote-archive-evidence.json"), profile = read("data/nrcan-canopy-height-profile.json")) {
  assert.equal(e.schemaVersion, "witness-tree/nrcan-canopy-height-remote-archive-evidence/1");
  assert.equal(e.status, "remote-verified-raw-only");
  assert.deepEqual(e.storage, { bucket: "witness-tree-raw-archive-ca-central-1", recoveryBucket: "witness-tree-raw-recovery-ca-central-1", region: "ca-central-1", countryCode: "CA" });
  assert.doesNotMatch(JSON.stringify(e), /versionId|uploadId|AccessKey|SecretAccess|SessionToken/i);
  const x = e.entry;
  assert.equal(x.sourceId, "ntems-canopy-height");
  assert.equal(x.bytes, profile.raw.byteLength);
  assert.equal(x.sha256, profile.raw.sha256);
  assert.equal(x.manifestBytes, 459);
  assert.match(x.payloadKey, new RegExp(`${profile.raw.sha256}/payload/ca_canopy_height_2022\\.zip$`));
  assert.equal(x.manifestKey, x.payloadKey.replace(/\/payload\/[^/]+$/, "/manifest.json"));
  assert.equal(x.primary.payloadVersionPresent && x.primary.manifestVersionPresent, true);
  assert.equal(x.recovery.payloadVersionPresent && x.recovery.manifestVersionPresent, true);
  for (const value of [x.primary.payloadChecksum, x.primary.manifestChecksum, x.recovery.payloadChecksum, x.recovery.manifestChecksum]) assert.deepEqual(value, checksum);
  assert.equal(x.recovery.payloadBytes, x.bytes);
  assert.equal(x.recovery.manifestBytes, x.manifestBytes);
  assert.equal(x.recovery.payloadMatchesPrimary, true);
  assert.equal(x.recovery.manifestMatchesPrimary, true);
  assert.deepEqual(x.primary.payloadRetention, { mode: "COMPLIANCE", until: "2033-08-12T00:00:00Z" });
  assert.deepEqual(x.recovery.payloadRetention, x.primary.payloadRetention);
  assert.deepEqual(e.claims, { immutableArchive: true, ownerSourceAdmission: false, transformed: false, ingested: false, released: false, productionAdmission: false, productionEligible: false, phase2: false });
  return e;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  validateNrcanCanopyHeightRemoteArchiveEvidence();
  console.log("NRCan canopy-height remote archive evidence passed: exact primary/recovery raw versions and payload retention are verified; admission and production remain false.");
}
