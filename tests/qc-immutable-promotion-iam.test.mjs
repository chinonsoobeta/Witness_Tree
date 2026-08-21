import assert from "node:assert/strict";
import test from "node:test";
import { DESIRED, validateQcImmutablePromotionIam } from "../scripts/check-qc-immutable-promotion-iam.mjs";

test("Québec IAM desired state is exact, blocked, and non-admitting", () => {
  assert.deepEqual(validateQcImmutablePromotionIam(), { roleStatements: 4, exactObjectKeys: 4, payloadKeys: 2 });
});

test("Québec IAM desired state rejects wildcard, broader operator, or fabricated readiness", () => {
  const wildcard = structuredClone(DESIRED); wildcard.rolePolicy.Statement[0].Resource[0] += "*";
  assert.throws(() => validateQcImmutablePromotionIam(wildcard));
  const operator = structuredClone(DESIRED); operator.operatorPolicy.Statement[0].Resource = "*";
  assert.throws(() => validateQcImmutablePromotionIam(operator));
  const ready = structuredClone(DESIRED); ready.claims.iamReady = true;
  assert.throws(() => validateQcImmutablePromotionIam(ready));
});

test("version-specific runner readbacks are explicitly approved without fabricating live readiness", () => {
  assert.equal(DESIRED.approvedActions.includes("s3:GetObjectVersion"), true);
  assert.equal(DESIRED.additionalApprovalRequired, null);
  assert.deepEqual(DESIRED.rolePolicy.Statement.find(({Sid}) => Sid === "ExactQcVersionedReadbacks").Action, ["s3:GetObjectVersion"]);
  assert.equal(DESIRED.liveAudit.iamMutationPerformed, false);
  assert.equal(DESIRED.claims.iamReady, false);
});
