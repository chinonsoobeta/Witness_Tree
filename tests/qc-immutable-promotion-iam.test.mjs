import assert from "node:assert/strict";
import test from "node:test";
import { canonicalPolicySha256, DESIRED, validateQcImmutablePromotionIam } from "../scripts/check-qc-immutable-promotion-iam.mjs";

test("Québec IAM applied state is exact, storage-pending, and non-admitting", () => {
  assert.deepEqual(validateQcImmutablePromotionIam(), { roleStatements: 4, exactObjectKeys: 4, payloadKeys: 2 });
});

test("Québec IAM desired state rejects wildcard, broader operator, or fabricated archive readiness", () => {
  const wildcard = structuredClone(DESIRED); wildcard.rolePolicy.Statement[0].Resource[0] += "*";
  assert.throws(() => validateQcImmutablePromotionIam(wildcard));
  const operator = structuredClone(DESIRED); operator.operatorPolicy.Statement[0].Resource = "*";
  assert.throws(() => validateQcImmutablePromotionIam(operator));
  const ready = structuredClone(DESIRED); ready.claims.archiveComplete = true;
  assert.throws(() => validateQcImmutablePromotionIam(ready));
});

test("version-specific runner readbacks are approved and live IAM does not fabricate storage evidence", () => {
  assert.equal(DESIRED.approvedActions.includes("s3:GetObjectVersion"), true);
  assert.equal(DESIRED.additionalApprovalRequired, null);
  assert.deepEqual(DESIRED.rolePolicy.Statement.find(({Sid}) => Sid === "ExactQcVersionedReadbacks").Action, ["s3:GetObjectVersion"]);
  assert.equal(DESIRED.liveAudit.iamMutationPerformed, true);
  assert.equal(DESIRED.liveAudit.s3MutationPerformed, false);
  assert.equal(DESIRED.claims.iamReady, true);
  assert.equal(DESIRED.claims.archiveComplete, false);
});

test("canonical policy hashes ignore pretty-versus-compact JSON formatting", () => {
  const pretty = JSON.stringify(DESIRED.rolePolicy, null, 2);
  const compact = JSON.stringify(DESIRED.rolePolicy);
  assert.equal(canonicalPolicySha256(pretty), canonicalPolicySha256(compact));
  assert.equal(canonicalPolicySha256(pretty), DESIRED.appliedAttestation.rolePolicyCanonicalSha256);
});
