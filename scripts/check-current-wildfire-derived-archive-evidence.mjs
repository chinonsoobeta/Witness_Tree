import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { manifestKey, sidecarFor, validate as validatePlan } from "./prepare-wildfire-derived-immutable-promotion.mjs";

const read = () => JSON.parse(readFileSync(new URL("../data/current-wildfire-derived-archive-evidence.json", import.meta.url), "utf8"));
const PLAN = validatePlan();
const RETAIN_UNTIL = PLAN.mfaGatedExecution.recommendedRetainUntil;
const SHA = /^[a-f0-9]{64}$/;
const CRC = { type: "FULL_OBJECT", algorithm: "CRC64NVME", providerValue: "redacted-present" };
const CLAIMS = {
  derivedObjectsVerified: false,
  primaryObjectsVerified: false,
  payloadRetentionVerified: false,
  machineVerifiableImmutableProof: false,
  recoveryObjectsVerified: false,
  recoveryReplicaVerified: false,
  mutationProvenance: false,
  ownerAdmission: false,
  transformed: false,
  ingested: false,
  released: false,
  productionAdmission: false,
  productionEligible: false,
  phase2: false
};
const OBJECT_FIELDS = ["id", "sourceId", "kind", "key", "bytes", "sha256", "featureCount", "versionPresent", "fullObjectChecksumVerified", "exactVersionReadback", "checksum", "retentionRequired", "retention"];

function expectedObjects() {
  return PLAN.artifacts.flatMap((artifact) => {
    const manifest = sidecarFor(artifact);
    const common = { sourceId: artifact.sourceId };
    return [
      { ...common, id: `${artifact.sourceId}-derived-payload`, kind: "payload", key: artifact.payloadKey, bytes: artifact.byteLength, sha256: artifact.sha256, featureCount: artifact.featureCount, retentionRequired: true },
      { ...common, id: `${artifact.sourceId}-derived-manifest`, kind: "manifest", key: manifestKey(artifact), bytes: Buffer.byteLength(manifest), sha256: createHash("sha256").update(manifest).digest("hex"), featureCount: null, retentionRequired: false }
    ];
  });
}

function assertNoProviderIdentifiers(record) {
  const serialized = JSON.stringify(record);
  // Prose may explain that identifiers were redacted, but serialized
  // provider fields must never be present in the canonical artifact.
  for (const forbidden of ["versionId", "uploadId", "ETag", "AccessKeyId", "SecretAccessKey", "SessionToken"]) {
    const field = new RegExp(`"${forbidden}"\\s*:`);
    assert.equal(field.test(serialized), false, `redacted evidence contains ${forbidden}`);
  }
}

export function validateCurrentWildfireDerivedArchiveEvidence(record = read()) {
  assert.deepEqual(Object.keys(record).sort(), ["attestedAt", "auditOperationsPerformed", "claims", "notice", "objects", "ownerEvidenceCheckerPassed", "sourceOfTruth", "status", "storage", "schemaVersion"].sort());
  assert.equal(record.schemaVersion, "witness-tree/current-wildfire-derived-archive-evidence/1");
  assert.equal(record.status, "attestation-only-not-machine-verifiable");
  assert.match(record.attestedAt, /^2026-08-21$/);
  assert.deepEqual(record.storage, { bucket: "witness-tree-raw-archive-ca-central-1", region: "ca-central-1", countryCode: "CA" });
  assert.deepEqual(record.auditOperationsPerformed, []);
  assert.equal(record.ownerEvidenceCheckerPassed, false);
  assert.ok(/cannot machine-verifiably prove exact-version readback or immutable archive/i.test(record.notice));
  assert.deepEqual(record.claims, CLAIMS);
  assert.equal(Array.isArray(record.objects), true);
  const expected = expectedObjects();
  assert.equal(record.objects.length, expected.length);
  const seen = new Set();
  for (const object of record.objects) {
    assert.deepEqual(Object.keys(object).sort(), [...OBJECT_FIELDS].sort(), `${object.id ?? "object"} fields drifted`);
    assert.equal(seen.has(object.id), false, "derived evidence repeats an object");
    seen.add(object.id);
    const wanted = expected.find(({ id }) => id === object.id);
    assert.ok(wanted, "derived evidence contains an unexpected object");
    for (const field of ["sourceId", "kind", "key", "bytes", "sha256", "featureCount", "retentionRequired"]) assert.deepEqual(object[field], wanted[field], `${object.id} ${field} drifted`);
    assert.equal(SHA.test(object.sha256), true);
    assert.equal(object.versionPresent, false);
    assert.equal(object.fullObjectChecksumVerified, false);
    assert.equal(object.exactVersionReadback, false);
    assert.deepEqual(object.checksum, CRC);
    if (object.retentionRequired) assert.deepEqual(object.retention, { mode: "COMPLIANCE", retainUntil: RETAIN_UNTIL, readbackVerified: false });
    else assert.equal(object.retention, null);
  }
  assert.deepEqual([...seen].sort(), expected.map(({ id }) => id).sort());
  assertNoProviderIdentifiers(record);
  return record;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  validateCurrentWildfireDerivedArchiveEvidence();
  console.log("Current-wildfire derived archive attestation passed schema checks but is not machine-verifiable immutable proof.");
}
