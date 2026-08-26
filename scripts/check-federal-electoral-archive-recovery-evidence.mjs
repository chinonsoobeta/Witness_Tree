import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validate as validateProductionAdmission } from "./check-phase1-federal-electoral-production-admission.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const SHA256 = "4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93";
const PAYLOAD_KEY = "raw/elections-canada-federal-electoral-districts-45th-general-election-2025-shp/federal-electoral-districts-2025-shp/2026-08-14T17-42-35Z/4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93/payload/federalelectoraldistricts_2025_shp.zip";
const MANIFEST_KEY = PAYLOAD_KEY.replace(/\/payload\/[^/]+$/, "/manifest.json");
const RETENTION = { mode: "COMPLIANCE", until: "2033-08-12T00:00:00Z" };

export function validateFederalElectoralArchiveRecoveryEvidence(evidence = read("data/federal-electoral-archive-recovery-evidence.json"), source = read("data/elections-canada-fed-2025-source-ledger.json"), ledger = read("data/phase1-production-source-ledger.json")) {
  validateProductionAdmission(read("data/phase1-federal-electoral-production-admission.json"));
  assert.equal(evidence.schemaVersion, "witness-tree/federal-electoral-archive-recovery-evidence/1");
  assert.equal(evidence.status, "exact-version-recovery-verified-raw-only");
  assert.match(evidence.notice, /does not claim.*production eligibility/i);
  assert.deepEqual(evidence.storage, { bucket: "witness-tree-raw-archive-ca-central-1", region: "ca-central-1", countryCode: "CA" });
  assert.deepEqual(evidence.physicalArtifact.ledgerRows, ["fed-2023-ridings", "elections-canada-45th-files"]);
  assert.equal(evidence.physicalArtifact.payloadKey, PAYLOAD_KEY);
  assert.equal(evidence.physicalArtifact.manifestKey, MANIFEST_KEY);
  assert.match(evidence.physicalArtifact.deduplicationNotice, /one physical raw archive.*does not create a second object/i);
  assert.equal(source.source.id, evidence.physicalArtifact.sourceId);
  assert.equal(source.source.sha256, SHA256);
  assert.equal(source.source.http.contentLength, 10301648);
  assert.deepEqual(evidence.payload, {
    versionId: "GzBU7MRKmIE6hXbx3weS4eX.1rMUiYUK", byteLength: 10301648, sha256: SHA256,
    providerChecksum: { type: "FULL_OBJECT", algorithm: "CRC64NVME", value: "Tjb8SOmhdSU=" },
    exactVersionDownload: { byteLengthMatches: true, sha256Matches: true }, retention: RETENTION
  });
  assert.deepEqual(evidence.manifest, {
    versionId: "0Zon9n8dRbw.JmQ_E2pKhQe14J785duH", byteLength: 572,
    sha256: "84646377203dccaee1e770899d77b2261f77eb7367462c0bf6be90e0317c00ea",
    providerChecksum: { type: "FULL_OBJECT", algorithm: "CRC64NVME", value: "8bs7qwpfqPw=" },
    deterministicExpectedBytesMatch: true, retention: RETENTION
  });
  assert.deepEqual(evidence.operationBoundary, { operatorDiagnostic: "Current MFA TOTP (not stored): Stopped: An approved payload key already has a version; no replacement was attempted.", appendOnlyGuard: "refused-existing-payload-version-no-replacement-attempted", payloadMutationAttempted: false, manifestRetentionCorrectionApplied: true, exactVersionReadbackPerformed: true });
  assert.deepEqual(evidence.claims, { rawArchiveRefetch: true, payloadChecksumReadback: true, manifestChecksumReadback: true, immutableArchive: true, transformed: false, ingested: false, released: false, productionAdmission: false, productionEligible: false });
  for (const id of evidence.physicalArtifact.ledgerRows) {
    const row = ledger.entries.find((entry) => entry.id === id);
    assert.ok(row, `Missing canonical ledger row ${id}.`);
    assert.equal(row.evidenceState, "production-admitted");
    assert.ok(row.evidenceRefs.includes("data/federal-electoral-archive-recovery-evidence.json"));
    assert.ok(row.evidenceRefs.includes("data/phase1-federal-electoral-production-admission.json"));
    assert.equal(row.proof.checksum, true);
    assert.equal(row.proof.rawArchiveRefetch, true);
    assert.equal(row.proof.immutableArchive, true);
    assert.equal(row.proof.productionAdmission, true);
    assert.equal(row.productionEligible, true);
  }
  return evidence;
}

if (process.argv[1]?.endsWith("check-federal-electoral-archive-recovery-evidence.mjs")) {
  validateFederalElectoralArchiveRecoveryEvidence();
  console.log("Federal electoral exact-version archive recovery evidence passed: one immutable raw object supports two separately production-admitted ledger rows.");
}
