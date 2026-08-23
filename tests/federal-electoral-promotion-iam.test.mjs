import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canonicalPolicySha256, validateFederalElectoralPromotionIam, validateFederalElectoralLiveIamAttestation } from "../scripts/check-federal-electoral-promotion-iam.mjs";

const read = (name) => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), "utf8"));
const desired = read("data/federal-electoral-promotion-iam-desired-state.json");
const plan = read("data/elections-canada-fed-2025-promotion-preparation.json");
const live = {
  schemaVersion: "witness-tree/federal-electoral-promotion-iam-live-attestation/1", status: "live-readback-passed", capturedAt: "2026-08-23T12:00:00.000Z", account: desired.account, region: desired.region, bucket: desired.bucket,
  operatorArn: "arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator", roleArn: "arn:aws:iam::286853118812:role/WitnessTreeArchivePromotionUploader", roleIdentityArn: "arn:aws:sts::286853118812:assumed-role/WitnessTreeArchivePromotionUploader/witness-tree-federal-electoral-promotion",
  trustPolicy: desired.trustPolicy, operatorPolicy: desired.operatorPolicy, rolePolicy: desired.rolePolicy,
  policyDigests: { trustPolicySha256: canonicalPolicySha256(desired.trustPolicy), operatorPolicySha256: canonicalPolicySha256(desired.operatorPolicy), rolePolicySha256: canonicalPolicySha256(desired.rolePolicy) },
  accessAnalyzer: { rolePolicyFindings: 0, operatorPolicyFindings: 0 }, simulations: { exactRoleAssume: "allowed", otherRoleAssume: "implicitDeny", exactObjectApprovedActions: "allowed", exactObjectDeleteObject: "implicitDeny", exactObjectIamGetRole: "implicitDeny", otherObjectPutAndReadback: "implicitDeny" }, mutation: { iamMutationPerformed: false, s3MutationPerformed: false }, recoveryBoundary: { replicaCreated: false, replicaAuthorized: false, recoveryCreditEligible: false }
};

test("federal IAM desired state is exact, narrow, and storage-pending", () => {
  validateFederalElectoralPromotionIam(desired, plan);
  assert.equal(desired.rolePolicy.Statement.length, 3);
  assert.equal(desired.claims.sourceLedgerCreditChanged, false);
  assert.equal(desired.recoveryBoundary.recoveryCreditEligible, false);
});

test("federal live IAM attestation proves exact policies and negative simulations", () => {
  validateFederalElectoralLiveIamAttestation(live, desired, plan);
  const altered = structuredClone(live); altered.rolePolicy.Statement[0].Resource[0] += "/broader"; assert.throws(() => validateFederalElectoralLiveIamAttestation(altered, desired, plan));
  const wildcard = structuredClone(desired); wildcard.rolePolicy.Statement[0].Resource[0] += "*"; assert.throws(() => validateFederalElectoralPromotionIam(wildcard, plan));
});
