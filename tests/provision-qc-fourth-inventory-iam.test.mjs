import assert from "node:assert/strict";
import test from "node:test";
import { ACCOUNT, MAX_SESSION_SECONDS, POLICY, POLICY_TWO, ROLE, ROLE_TWO, operatorPolicy, policies, provision, trustPolicy } from "../scripts/provision-qc-fourth-inventory-iam.mjs";
const absent = () => Object.assign(new Error("NoSuchEntity"), { code: "NoSuchEntity" });
function mock({ existing = false, legacyRoles = [] } = {}) { const calls = [], batches = new Map(policies().map((b) => { const state = { ...b, policy: structuredClone(b.policy), exists: existing, hasPolicy: existing }; if (legacyRoles.includes(b.role)) { state.policy.Statement[0].Sid = state.policy.Statement[0].Sid.replace("ExactPromotion", "ExactMfaGatedPromotion"); state.policy.Statement[0].Condition = { Bool: { "aws:MultiFactorAuthPresent": "true" }, NumericLessThan: { "aws:MultiFactorAuthAge": "43200" } }; } return [b.role, state]; })); let user = existing; const aws = async (a) => { calls.push(a); const [s, c] = a, role = a[a.indexOf("--role-name") + 1], b = batches.get(role); if (s === "sts") return { Account: ACCOUNT, Arn: `arn:aws:iam::${ACCOUNT}:root` }; if (s === "accessanalyzer") return { findings: [] }; if (s === "iam" && c === "simulate-custom-policy") return { EvaluationResults: Array(5).fill({ EvalDecision: "allowed" }) }; if (s === "iam" && c === "get-role") { if (!b.exists) throw absent(); return { Role: { MaxSessionDuration: MAX_SESSION_SECONDS, AssumeRolePolicyDocument: trustPolicy() } }; } if (s === "iam" && c === "get-role-policy") { if (!b.hasPolicy) throw absent(); return { PolicyDocument: b.policy }; } if (s === "iam" && c === "get-user-policy") { if (!user) throw absent(); return { PolicyDocument: operatorPolicy() }; } if (s === "iam" && c === "create-role") { b.exists = true; return {}; } if (s === "iam" && c === "put-role-policy") { b.policy = JSON.parse(a[a.indexOf("--policy-document") + 1]); b.hasPolicy = true; return {}; } if (s === "iam" && c === "put-user-policy") { user = true; return {}; } throw new Error(`unexpected ${s} ${c}`); }; return { aws, calls, batches }; }
test("dry run is fail-closed and reports two 31-object roles", async () => { const fake = mock(); const result = await provision({ aws: fake.aws }); assert.deepEqual(result.roles.map((r) => r.exactObjectCount), [31, 31]); assert.equal(result.outOfScopeDecision, "implicitDeny"); assert.equal(fake.calls.some((a) => ["create-role", "put-role-policy", "put-user-policy"].includes(a[1])), false); });
test("apply creates both fixed roles, policies, and the one operator policy", async () => { const fake = mock(); await provision({ aws: fake.aws, apply: true }); assert.deepEqual(fake.calls.filter((a) => ["create-role", "put-role-policy", "put-user-policy"].includes(a[1])).map((a) => a[1]), ["create-role", "put-role-policy", "create-role", "put-role-policy", "put-user-policy"]); });
test("names and batches remain fixed", () => { assert.equal(ROLE, "WitnessTreeQcFourthArchivePromotionUploader"); assert.equal(POLICY, "WitnessTreeQcFourthArchiveExactObjectsBatchOne"); assert.equal(ROLE_TWO, "WitnessTreeQcFourthArchivePromotionUploaderBatchTwo"); assert.equal(POLICY_TWO, "WitnessTreeQcFourthArchiveExactObjectsBatchTwo"); assert.deepEqual(policies().map((b) => b.resources.length), [31, 31]); });
test("direct AssumeRole needs MFA while role-session S3 permissions stay exact and unconditional", () => {
  assert.deepEqual(trustPolicy().Statement[0].Condition, { Bool: { "aws:MultiFactorAuthPresent": "true" } });
  assert.deepEqual(operatorPolicy().Statement[0].Condition, { Bool: { "aws:MultiFactorAuthPresent": "true" } });
  assert.ok(policies().every((policy) => !("Condition" in policy.policy.Statement[0])));
});
test("apply migrates only an otherwise exact legacy MFA-age policy", async () => {
  const fake = mock({ existing: true, legacyRoles: [ROLE] });
  const result = await provision({ aws: fake.aws, apply: true });
  assert.deepEqual(fake.calls.filter((call) => call[1] === "put-role-policy").map((call) => call[call.indexOf("--role-name") + 1]), [ROLE]);
  assert.deepEqual(result.roles.map((role) => role.changes.removeUnsupportedRolePolicyMfaCondition), [true, false]);
});
test("apply migrates the otherwise exact live legacy MFA-only role policy", async () => {
  const fake = mock({ existing: true, legacyRoles: [ROLE, ROLE_TWO] });
  for (const role of [ROLE, ROLE_TWO]) delete fake.batches.get(role).policy.Statement[0].Condition.NumericLessThan;
  const result = await provision({ aws: fake.aws, apply: true });
  assert.deepEqual(fake.calls.filter((call) => call[1] === "put-role-policy").map((call) => call[call.indexOf("--role-name") + 1]), [ROLE, ROLE_TWO]);
  assert.deepEqual(result.roles.map((role) => role.changes.removeUnsupportedRolePolicyMfaCondition), [true, true]);
});
test("apply rejects a legacy MFA-age policy that changes any exact resource", async () => {
  const fake = mock({ existing: true, legacyRoles: [ROLE] });
  fake.batches.get(ROLE).policy.Statement[0].Resource[0] = "arn:aws:s3:::witness-tree-raw-archive-ca-central-1/raw/outside";
  await assert.rejects(() => provision({ aws: fake.aws, apply: true }), /differs/);
  assert.equal(fake.calls.some((call) => ["create-role", "put-role-policy", "put-user-policy"].includes(call[1])), false);
});
