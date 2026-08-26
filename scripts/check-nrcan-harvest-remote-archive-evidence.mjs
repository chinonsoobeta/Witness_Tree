import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const CHECKSUM = { type: "FULL_OBJECT", algorithm: "CRC64NVME", providerValue: "redacted-present" };
const CLAIMS = {
  remoteObjectExists: true,
  sidecarUploaded: true,
  rawArchiveRefetch: true,
  payloadChecksumReadback: true,
  manifestChecksumReadback: true,
  recoveryPayloadReadback: true,
  recoveryManifestReadback: true,
  immutableArchive: true,
  ownerSourceLedgerDecision: false,
  transformed: false,
  ingested: false,
  released: false,
  productionAdmission: false,
  productionEligible: false
};

function assertRemoteObject(object, replication, retention) {
  assert.equal(object.versionPresent, true);
  assert.deepEqual(object.checksum, CHECKSUM);
  assert.equal(object.replication, replication);
  assert.deepEqual(object.retention, retention);
}

export function validateNrcanHarvestRemoteArchiveEvidence(evidence = read("data/nrcan-harvest-remote-archive-evidence.json"), profile = read("data/nrcan-harvest-profile.json"), staged = read("data/staged-acquisitions.json"), ledger = read("data/phase1-production-source-ledger.json")) {
  assert.equal(evidence.schemaVersion, "witness-tree/nrcan-harvest-remote-archive-evidence/1");
  assert.equal(evidence.status, "remote-verified-archived-raw-only");
  assert.match(evidence.notice, /Redacted.*version identifiers.*checksum values.*does not grant.*production eligibility/i);
  assert.equal(evidence.sourceId, "ntems-forest-harvest");
  assert.equal(evidence.profile, "data/nrcan-harvest-profile.json");
  assert.equal(evidence.stagedAcquisition, "data/staged-acquisitions.json");
  assert.deepEqual(evidence.storage, { primary: "witness-tree-raw-archive-ca-central-1", recovery: "witness-tree-raw-recovery-ca-central-1", region: "ca-central-1", countryCode: "CA" });
  assert.doesNotMatch(JSON.stringify(evidence), /uploadId|versionId|AccessKey|SecretAccess|SessionToken|TOTP/i);
  assert.equal(profile.sourceId, "nrcan-ca-forest-harvest-1985-2022");
  assert.equal(profile.stagedAcquisitionId, "nrcan-ca-forest-harvest-1985-2022-2026-08-14");
  assert.equal(profile.productionEligible, false);
  const source = staged.entries.find(({ id }) => id === profile.stagedAcquisitionId);
  assert.ok(source);
  assert.equal(source.sourceId, profile.sourceId);
  assert.equal(source.immutableObjectStorage, false);
  assert.equal(source.productionEligible, false);
  assert.equal(evidence.payload.key, "raw/nrcan-ca-forest-harvest-1985-2022/undeclared/2026-08-14T09-27-41Z/c6f41dff46d91812874672edb53233dac4126952132ad6d1131ad47b11ad7aad/payload/ca_forest_harvest_1985-2022.zip");
  assert.equal(evidence.manifest.key, evidence.payload.key.replace(/\/payload\/[^/]+$/, "/manifest.json"));
  assert.equal(evidence.payload.byteLength, source.byteLength);
  assert.equal(evidence.payload.sha256, source.sha256);
  assert.deepEqual(evidence.payload.localBinding, { path: source.localPath, byteLengthMatches: true, sha256Matches: true });
  assert.equal(profile.raw.byteLength, evidence.payload.byteLength);
  assert.equal(profile.raw.sha256, evidence.payload.sha256);
  assertRemoteObject(evidence.payload.primary, "COMPLETED", { mode: "COMPLIANCE", until: "2033-08-12T00:00:00Z" });
  assertRemoteObject(evidence.payload.recovery, "REPLICA", { mode: "COMPLIANCE", until: "2033-08-12T00:00:00Z" });
  assert.equal(evidence.manifest.byteLength, 467);
  assertRemoteObject(evidence.manifest.primary, "COMPLETED", null);
  assertRemoteObject(evidence.manifest.recovery, "REPLICA", null);
  assert.deepEqual(evidence.claims, CLAIMS);
  const row = ledger.entries.find(({ id }) => id === evidence.sourceId);
  assert.ok(row);
  assert.equal(row.evidenceState, "remote-verified-archived-profiled");
  assert.ok(row.evidenceRefs.includes("data/nrcan-harvest-remote-archive-evidence.json"));
  assert.equal(row.proof.immutableArchive, true);
  assert.equal(row.proof.rawArchiveRefetch, true);
  assert.equal(row.productionEligible, false);
  return evidence;
}

if (process.argv[1]?.endsWith("check-nrcan-harvest-remote-archive-evidence.mjs")) {
  validateNrcanHarvestRemoteArchiveEvidence();
  console.log("NRCan harvest remote archive evidence passed: exact primary/recovery payload and manifest readbacks are recorded redacted; owner admission remains false.");
}
