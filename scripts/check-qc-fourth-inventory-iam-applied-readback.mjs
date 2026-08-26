#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { ACCOUNT, MAX_SESSION_SECONDS, OPERATOR, OPERATOR_POLICY, operatorPolicy, policies, trustPolicy } from "./provision-qc-fourth-inventory-iam.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const sha = (value) => createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
const rawSha = (value) => createHash("sha256").update(value).digest("hex");
const SHA = /^[a-f0-9]{64}$/;

export function validateQcFourthInventoryIamAppliedReadback(evidence = read("data/qc-fourth-inventory-iam-applied-readback-2026-08-25.json"), preparation = read("data/qc-fourth-inventory-immutable-promotion-preparation.json")) {
  const expected = policies();
  assert.equal(evidence.schemaVersion, "witness-tree/qc-fourth-inventory-iam-applied-readback/1");
  assert.equal(evidence.status, "applied-and-read-back");
  assert.match(evidence.observedAt, /^2026-08-25T\d{2}:\d{2}:\d{2}Z$/);
  assert.equal(evidence.accountId, ACCOUNT);
  assert.equal(evidence.region, preparation.region);
  assert.equal(evidence.bucket, preparation.bucket);
  assert.equal(evidence.preparationSha256, rawSha(readFileSync(new URL("data/qc-fourth-inventory-immutable-promotion-preparation.json", root), "utf8")));
  assert.equal(evidence.roles.length, 2);
  assert.deepEqual(evidence.roles.map(({ roleName, inlinePolicyName, exactObjectCount }) => ({ roleName, inlinePolicyName, exactObjectCount })), expected.map(({ role, policyName, resources }) => ({ roleName: role, inlinePolicyName: policyName, exactObjectCount: resources.length })));
  for (const [index, role] of evidence.roles.entries()) {
    assert.equal(role.objectResourcesSha256, sha(expected[index].resources));
    assert.equal(role.inlinePolicySha256, sha(expected[index].policy));
    assert.equal(expected[index].resources.length, 31);
    assert.ok(expected[index].resources.every((resource) => !resource.includes("*")));
    assert.equal("Condition" in expected[index].policy.Statement[0], false);
  }
  assert.deepEqual(evidence.trust, { principalArn: OPERATOR, mfaRequired: true, maxSessionSeconds: MAX_SESSION_SECONDS, policySha256: sha(trustPolicy()) });
  assert.deepEqual(evidence.operatorPolicy, { userName: "WitnessTreeArchiveOperator", inlinePolicyName: OPERATOR_POLICY, mfaRequired: true, policySha256: sha(operatorPolicy()) });
  assert.deepEqual(evidence.mfaEnforcement, { trustPolicyBool: { "aws:MultiFactorAuthPresent": "true" }, operatorAssumeRoleBool: { "aws:MultiFactorAuthPresent": "true" }, roleObjectPoliciesConditional: false, reason: "MFA is enforced when the operator assumes each role. The exact S3 role policies are unconditional because that MFA context is not propagated to S3 authorization for role credentials." });
  assert.deepEqual(trustPolicy().Statement[0].Condition, { Bool: evidence.mfaEnforcement.trustPolicyBool });
  assert.deepEqual(operatorPolicy().Statement[0].Condition, { Bool: evidence.mfaEnforcement.operatorAssumeRoleBool });
  assert.deepEqual(evidence.authorizationBoundary, { outOfScopeDecision: "implicitDeny", wildcardObjectResources: false });
  assert.ok([evidence.preparationSha256, ...evidence.roles.flatMap((role) => [role.objectResourcesSha256, role.inlinePolicySha256]), evidence.trust.policySha256, evidence.operatorPolicy.policySha256].every((value) => SHA.test(value)));
  assert.match(evidence.scope, /not upload.*retention.*object readback.*source admission.*transformation.*ingestion.*release.*production/i);
  assert.match(evidence.redaction, /No credentials.*session material.*MFA values.*object version IDs.*object bodies/i);
  return evidence;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  validateQcFourthInventoryIamAppliedReadback();
  console.log("Québec fourth-inventory IAM applied readback evidence is internally consistent.");
}
