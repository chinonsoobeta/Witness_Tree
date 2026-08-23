import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateFederalElectoralPromotionIam } from "../scripts/check-federal-electoral-promotion-iam.mjs";

const read = (name) => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), "utf8"));
const desired = read("data/federal-electoral-promotion-iam-desired-state.json");
const plan = read("data/elections-canada-fed-2025-promotion-preparation.json");
test("federal IAM desired state is exact, narrow, and storage-pending", () => {
  validateFederalElectoralPromotionIam(desired, plan);
  assert.equal(desired.rolePolicy.Statement.length, 3);
  assert.equal(desired.claims.sourceLedgerCreditChanged, false);
  assert.equal(desired.recoveryBoundary.recoveryCreditEligible, false);
});

test("federal IAM desired state rejects widened resources", () => {
  const wildcard = structuredClone(desired); wildcard.rolePolicy.Statement[0].Resource[0] += "*"; assert.throws(() => validateFederalElectoralPromotionIam(wildcard, plan));
});
