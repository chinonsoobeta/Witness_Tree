import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { exactObjectDescriptorDigest, } from "./capture-qc-fourth-inventory-exact-archive-readback.mjs";
import { exactPromotionObjects, loadQcFourthInventoryPromotionPreparation } from "./check-qc-fourth-inventory-immutable-promotion.mjs";

const read = (file) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const REDACTED = /(?:\barn:aws:|VersionId|AccessKey|SecretAccess|SessionToken|AKIA)/i;

/** Offline validation for redacted evidence produced by the read-only capture. */
export function validateQcFourthInventoryExactArchiveReadback(evidence = read("data/qc-fourth-inventory-exact-archive-readback-2026-08-25.json"), plan = loadQcFourthInventoryPromotionPreparation()) {
  const objects = exactPromotionObjects(plan);
  const text = JSON.stringify(evidence);
  assert.equal(evidence.schemaVersion, "witness-tree/qc-fourth-inventory-exact-archive-readback/1");
  assert.equal(evidence.status, "independent-read-only-exact-version-compliance-readback");
  assert.equal(new Date(evidence.capturedAt).toISOString(), evidence.capturedAt);
  assert.deepEqual(evidence.storage, { region: "ca-central-1", countryCode: "CA" });
  assert.equal(evidence.planBinding.objectCount, 62);
  assert.equal(evidence.planBinding.payloadCount, 56);
  assert.equal(evidence.planBinding.evidenceAndManifestCount, 6);
  assert.equal(evidence.planBinding.byteLength, objects.reduce((total, object) => total + object.byteLength, 0));
  assert.equal(evidence.planBinding.objectDescriptorSha256, exactObjectDescriptorDigest(plan));
  assert.equal(evidence.planBinding.preparationSha256, sha256(readFileSync(new URL("../data/qc-fourth-inventory-immutable-promotion-preparation.json", import.meta.url))));
  assert.deepEqual(evidence.verification, {
    exactPrivateVersionsMatched: 62,
    byteLengthsMatchedPlan: 62,
    checksumsMatchedPrivateState: 62,
    checksumTypes: { COMPOSITE: 6, FULL_OBJECT: 56 },
    remoteChecksumSetSha256: evidence.verification.remoteChecksumSetSha256,
    privateVersionSetSha256: evidence.verification.privateVersionSetSha256,
    complianceRetentionMatched: 62,
    retainUntil: "2033-08-12T00:00:00Z"
  });
  for (const digest of [evidence.verification.remoteChecksumSetSha256, evidence.verification.privateVersionSetSha256]) assert.match(digest, /^[a-f0-9]{64}$/);
  assert.match(evidence.notice, /read-only.*62 archived objects.*not owner admission.*production eligibility/i);
  assert.deepEqual(evidence.claims, { ownerAdmission: false, transformed: false, ingested: false, released: false, productionEligible: false });
  assert.equal(REDACTED.test(text), false, "Repository evidence must not disclose ARNs, version IDs, or credentials.");
  return evidence;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const evidence = validateQcFourthInventoryExactArchiveReadback();
  console.log(`Québec fourth-inventory exact archive readback passed: ${evidence.planBinding.objectCount} objects, ${evidence.verification.complianceRetentionMatched} COMPLIANCE retentions; no admission claimed.`);
}
