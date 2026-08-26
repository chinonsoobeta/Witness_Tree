import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { DESIRED, validateDesiredState, validateLiveState } from "../scripts/check-wildfire-derived-readback-iam.mjs";

const checkerPath = new URL("../scripts/check-wildfire-derived-readback-iam.mjs", import.meta.url).pathname;

function liveFromDesired() {
  const live = structuredClone(DESIRED);
  live.rolePolicy.Statement = live.rolePolicy.Statement.filter(({ Sid }) => Sid !== "ExactDerivedVersionedReadbacks");
  return {
    account: live.account,
    roleName: live.roleName,
    policyName: live.policyName,
    operatorPolicyName: live.operatorPolicyName,
    trustPolicy: live.trustPolicy,
    operatorAssumeRolePolicy: live.operatorAssumeRolePolicy,
    rolePolicy: live.rolePolicy
  };
}

test("desired readback IAM state is exact and non-admitting", () => {
  assert.equal(validateDesiredState(), true);
  const versioned = DESIRED.rolePolicy.Statement.find(({ Sid }) => Sid === "ExactDerivedVersionedReadbacks");
  assert.deepEqual(versioned.Action, ["s3:GetObjectVersion"]);
  assert.equal(versioned.Resource.length, 4);
  const retention = DESIRED.rolePolicy.Statement.find(({ Sid }) => Sid === "ExactDerivedPayloadAndSidecarComplianceRetention");
  assert.deepEqual(retention.Action, ["s3:PutObjectRetention", "s3:GetObjectRetention"]);
  assert.equal(retention.Resource.length, 4);
  assert.equal(DESIRED.claims.productionEligible, false);
});

test("live preflight rejects a missing versioned-readback statement", () => {
  assert.throws(() => validateLiveState(liveFromDesired()), /missing the exact versioned readback delta or has broader scope/);
});

test("live preflight accepts the exact desired trust, operator path and role policy", () => {
  const live = liveFromDesired();
  live.rolePolicy = structuredClone(DESIRED.rolePolicy);
  assert.equal(validateLiveState(live), true);
});

test("live preflight rejects any extra action, resource, or wrong operator path", () => {
  const extraAction = liveFromDesired();
  extraAction.rolePolicy.Statement.push({ Sid: "ExactDerivedVersionedReadbacks", Effect: "Allow", Action: ["s3:GetObjectVersion", "s3:ListBucket"], Resource: DESIRED.requiredDelta.Resource });
  assert.throws(() => validateLiveState(extraAction), /missing the exact versioned readback delta or has broader scope/);

  const wrongOperator = liveFromDesired();
  wrongOperator.operatorAssumeRolePolicy.Statement[0].Resource = "arn:aws:iam::286853118812:role/OtherRole";
  assert.throws(() => validateLiveState(wrongOperator), /operator AssumeRole path is not exact/);
});

test("offline CLI preflight makes no AWS call and claims no live IAM state", () => {
  const run = spawnSync(process.execPath, [checkerPath], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /desired-state preflight passed/);
  assert.match(run.stdout, /live IAM is not claimed/);
  assert.doesNotMatch(run.stdout + run.stderr, /aws iam|s3api|286853118812:role/);
});
