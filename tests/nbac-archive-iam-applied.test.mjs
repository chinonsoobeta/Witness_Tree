import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateNbacArchiveIamApplied, verifyLiveNbacArchiveIam } from "../scripts/check-nbac-archive-iam-applied.mjs";
import { expectedAppliedPolicy } from "../scripts/provision-nbac-archive-iam.mjs";

const record = JSON.parse(readFileSync(new URL("../data/nbac-archive-iam-applied-2026-08-27.json", import.meta.url), "utf8"));

test("NBAC IAM applied evidence binds exact readback without claiming storage", () => {
  assert.equal(validateNbacArchiveIamApplied(record), record);
});

test("NBAC IAM evidence rejects widened scope or fabricated archive state", () => {
  for (const mutate of [
    (value) => { value.scope.otherObjectAllowed = true; },
    (value) => { value.claims.archiveObjectWritten = true; },
    (value) => { value.appliedPolicyCanonicalSha256 = "0".repeat(64); },
    (value) => { value.beforePolicyCanonicalSha256 = "0".repeat(64); },
    (value) => { value.sourceDeltaSha256 = "0".repeat(64); },
    (value) => { value.liveReadbackSha256 = "0".repeat(64); },
  ]) {
    const candidate = structuredClone(record);
    mutate(candidate);
    assert.throws(() => validateNbacArchiveIamApplied(candidate));
  }
});

test("NBAC IAM live gate binds exact policy, operator trust, MFA and Object Lock", () => {
  const responses = {
    "iam get-role-policy": { PolicyDocument: expectedAppliedPolicy() },
    "iam get-role": { Role: { AssumeRolePolicyDocument: { Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { AWS: "arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator" }, Action: "sts:AssumeRole", Condition: { Bool: { "aws:MultiFactorAuthPresent": "true" } } }] } } },
    "s3api get-object-lock-configuration": { ObjectLockConfiguration: { ObjectLockEnabled: "Enabled" } },
  };
  const invoke = (args) => structuredClone(responses[args.slice(0, 2).join(" ")]);
  assert.equal(verifyLiveNbacArchiveIam(invoke).trustVerified, true);
  for (const mutate of [
    (copy) => { copy["iam get-role-policy"].PolicyDocument.Statement.at(-1).Action.push("s3:DeleteObject"); },
    (copy) => { delete copy["iam get-role"].Role.AssumeRolePolicyDocument.Statement[0].Condition; },
    (copy) => { copy["s3api get-object-lock-configuration"].ObjectLockConfiguration.ObjectLockEnabled = "Disabled"; },
  ]) {
    const copy = structuredClone(responses);
    mutate(copy);
    assert.throws(() => verifyLiveNbacArchiveIam((args) => copy[args.slice(0, 2).join(" ")]));
  }
});
