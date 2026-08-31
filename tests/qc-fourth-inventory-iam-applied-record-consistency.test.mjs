import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { verifies, validateQcFourthInventoryIamAppliedReadback } from "../scripts/check-qc-fourth-inventory-iam-applied-record-consistency.mjs";

const evidence = JSON.parse(readFileSync(new URL("../data/qc-fourth-inventory-iam-applied-readback-2026-08-25.json", import.meta.url), "utf8"));
const checkerSource = readFileSync(new URL("../scripts/check-qc-fourth-inventory-iam-applied-record-consistency.mjs", import.meta.url), "utf8");

test("IAM readback evidence keeps MFA at role assumption and S3 permissions unconditional", () => {
  assert.equal(validateQcFourthInventoryIamAppliedReadback(evidence), evidence);
  assert.match(verifies, /does not query AWS/);
  assert.doesNotMatch(checkerSource, /node:child_process|@aws-sdk|from ["']aws-sdk|\bspawn(?:Sync)?\s*\(|\bexec(?:File|Sync)?\s*\(|\bfetch\s*\(/);
  assert.deepEqual(evidence.roles.map((role) => role.exactObjectCount), [31, 31]);
  assert.equal(evidence.mfaEnforcement.roleObjectPoliciesConditional, false);
  assert.doesNotMatch(JSON.stringify(evidence), /AccessKeyId|SecretAccessKey|SessionToken|RoleId|VersionId/i);
});

test("IAM readback evidence rejects widened scope, non-MFA trust, or a false policy hash", () => {
  const widened = structuredClone(evidence); widened.authorizationBoundary.wildcardObjectResources = true;
  assert.throws(() => validateQcFourthInventoryIamAppliedReadback(widened));
  const noMfa = structuredClone(evidence); noMfa.trust.mfaRequired = false;
  assert.throws(() => validateQcFourthInventoryIamAppliedReadback(noMfa));
  const conditionalS3 = structuredClone(evidence); conditionalS3.mfaEnforcement.roleObjectPoliciesConditional = true;
  assert.throws(() => validateQcFourthInventoryIamAppliedReadback(conditionalS3));
  const drift = structuredClone(evidence); drift.roles[1].inlinePolicySha256 = "0".repeat(64);
  assert.throws(() => validateQcFourthInventoryIamAppliedReadback(drift));
});
