import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const evidencePath = path.join(ROOT, "data/phase1-manifest-retention-iam-applied-2026-08-25.json");
export const evidenceSha256 = "66cbf83b2bd87a1ef0b2ba213944e0dbe694e6429d875ed67938ce387f2768f5";

const expected = [
  ["federal-general-promotion", "WitnessTreeArchivePromotionUploader", "ExactApprovedPromotionOnly", "c945a08c64aa0c55ae5bda1c9da30b70b0ce36a32241e08f2bdd15978b6a10e9", "bd7ac28a69383e8633d632e4d34659d24f33c073bf6ccc7d5e4fb3567895bb74", { primary: 6, recovery: 2 }],
  ["current-wildfire", "WitnessTreeCurrentWildfirePromotionUploader", "WitnessTreeCurrentWildfireExactObjectAccess", "07cc81211ba9705773da5c91aeb5a31fa2f9178cc7a25a74a78f8e5bfb300417", "dd9e6519218141459dbddbb0e7a0a6cab2f2a7ea1ea2fa084297fbd36b1e74cd", { primary: 8, recovery: 0 }],
  ["wildfire-derived", "WitnessTreeWildfireDerivedPromotionUploader", "WitnessTreeWildfireDerivedExactObjects", "6ffd66edeef7fe6d5a4fff81e2b2f684b80850f2c31cde3a9a0b8fd1186218fd", "a99c124331e1cb0d31d201354c016ffe617ef577d8a12d147a4276d1ec290976", { primary: 4, recovery: 0 }]
];
const retentionActions = ["s3:PutObjectRetention", "s3:GetObjectRetention"];

export function validateAppliedManifestRetentionIam(raw = readFileSync(evidencePath, "utf8")) {
  assert.equal(createHash("sha256").update(raw).digest("hex"), evidenceSha256, "applied IAM evidence checksum changed");
  const value = JSON.parse(raw);
  assert.deepEqual(Object.keys(value).sort(), ["changes", "claims", "notice", "observedAt", "schemaVersion", "scopeAssertions", "status"]);
  assert.equal(value.schemaVersion, "witness-tree/phase1-manifest-retention-iam-applied/1");
  assert.equal(value.status, "applied-and-readback-verified-policy-only");
  assert.equal(value.observedAt, "2026-08-25");
  assert.match(value.notice, /policy-change evidence only/i);
  assert.deepEqual(value.changes.map((change) => [change.id, change.roleName, change.policyName, change.canonicalPolicySha256.before, change.canonicalPolicySha256.after, change.retentionResourceCounts]), expected);
  for (const change of value.changes) {
    assert.match(change.canonicalPolicySha256.before, /^[a-f0-9]{64}$/);
    assert.match(change.canonicalPolicySha256.after, /^[a-f0-9]{64}$/);
    assert.notEqual(change.canonicalPolicySha256.before, change.canonicalPolicySha256.after, "policy delta must have changed the canonical policy");
    assert.equal(change.exactDesiredPolicyReadback, true);
    assert.deepEqual(change.allowedRetentionActions, retentionActions);
    assert.deepEqual(change.accessAnalyzer, { errorFindings: 0, securityWarningFindings: 0 });
  }
  assert.deepEqual(value.scopeAssertions, { noWildcardResource: true, noDeleteAction: true, noBypassGovernanceRetention: true, noBucketAdministration: true, noIamPermission: true });
  assert.deepEqual(value.claims, { objectUploaded: false, objectRetentionVerified: false, archiveComplete: false, sourceLedgerCreditChanged: false, productionAdmission: false, phase1Complete: false });
  return true;
}

if (process.argv[1]?.endsWith("check-phase1-manifest-retention-iam-applied.mjs")) {
  validateAppliedManifestRetentionIam();
  console.log("Applied manifest-retention IAM evidence checksum and exact policy-only boundaries passed.");
}
