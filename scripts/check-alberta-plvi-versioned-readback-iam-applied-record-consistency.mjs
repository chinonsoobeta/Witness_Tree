import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
export const verifies = "Checks the committed Alberta PLVI IAM application record and preparation record for internally consistent policy-only claims; it does not query AWS.";
export function validateAlbertaPlviVersionedReadbackIamApplied(evidence = read("data/alberta-plvi-versioned-readback-iam-applied-2026-08-25.json"), plan = read("data/alberta-plvi-immutable-promotion-preparation.json")) {
  assert.equal(evidence.schemaVersion, "witness-tree/alberta-plvi-versioned-readback-iam-applied/1");
  assert.equal(evidence.status, "applied-readback-attested");
  assert.equal(evidence.roleName, "WitnessTreePlviArchivePromotionUploader");
  assert.equal(evidence.inlinePolicyName, "WitnessTreePlviArchivePromotionExactKeys");
  assert.deepEqual(evidence.change, { addedAction: "s3:GetObjectVersion", retentionResourcesBefore: 2, retentionResourcesAfter: 4, exactObjectResourceCount: 4, wildcardsAdded: false });
  assert.equal(plan.proposedRoleScope.objectKeys.length, 4);
  assert.equal(new Set(plan.proposedRoleScope.objectKeys).size, 4);
  assert.ok(plan.proposedRoleScope.objectKeys.every((key) => !key.includes("*")));
  assert.ok(plan.proposedRoleScope.allow.includes("s3:GetObjectVersion"));
  assert.equal(evidence.checksums.basePolicySha256, "04d317fdd64d91388c1392911c107afc62b8ae1e63346906927374312f4edb3b");
  assert.equal(evidence.checksums.desiredPolicySha256, "979aca1a1699561a2c67e04841a15ea94ab817d8b771275a2e14360ac262096c");
  assert.equal(evidence.checksums.readbackPolicySha256, evidence.checksums.desiredPolicySha256);
  assert.deepEqual(evidence.validation, { accessAnalyzerBlockingFindings: 0, exactObjectChecksAllowed: 12, outOfScopeChecksImplicitDenied: 3 });
  assert.match(evidence.operatorDiagnostic, /403 Forbidden.*correctly refused.*no replacement write/i);
  assert.match(evidence.redaction, /No credentials.*MFA values.*object version IDs/i);
  return evidence;
}
if (import.meta.url === `file://${process.argv[1]}`) { validateAlbertaPlviVersionedReadbackIamApplied(); console.log(verifies); }
