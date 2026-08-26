import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { manifestKey, validate as validatePlan } from "./prepare-wildfire-derived-immutable-promotion.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const PLAN = validatePlan();
export const DESIRED = read("data/wildfire-derived-readback-iam-desired-state.json");
export const ACCOUNT = "286853118812";
export const ROLE = "WitnessTreeWildfireDerivedPromotionUploader";
export const POLICY_NAME = "WitnessTreeWildfireDerivedExactObjects";
export const OPERATOR = "WitnessTreeArchiveOperator";
export const OPERATOR_POLICY = "WitnessTreeWildfireDerivedPromotionAssumeOnly";
export const BUCKET = "witness-tree-raw-archive-ca-central-1";
export const ROLE_ARN = `arn:aws:iam::${ACCOUNT}:role/${ROLE}`;
export const OPERATOR_ARN = `arn:aws:iam::${ACCOUNT}:user/${OPERATOR}`;
export const BUCKET_PREFIX = `arn:aws:s3:::${BUCKET}/`;

const EXCLUDED = Object.freeze([
  "s3:DeleteObject",
  "s3:DeleteObjectVersion",
  "s3:BypassGovernanceRetention",
  "s3:PutObjectLegalHold",
  "s3:AbortMultipartUpload",
  "s3:ListBucket*",
  "s3:PutBucket*",
  "s3:DeleteBucket*",
  "s3:Replicate*",
  "iam:*"
]);

const array = (value) => value === undefined ? [] : Array.isArray(value) ? value : [value];
const sorted = (values) => [...values].sort();
const sortedStatements = (statements) => [...statements].sort((a, b) => String(a.Sid ?? "").localeCompare(String(b.Sid ?? "")));
const decode = (value) => typeof value === "string" ? JSON.parse(decodeURIComponent(value)) : value;
const documentOf = (value) => decode(value?.PolicyDocument ?? value);

function expectedKeys(plan = PLAN) {
  return plan.artifacts.flatMap((artifact) => [
    `${BUCKET_PREFIX}${artifact.payloadKey}`,
    `${BUCKET_PREFIX}${manifestKey(artifact)}`
  ]);
}

function canonicalStatement(statement) {
  const result = {};
  for (const key of ["Sid", "Effect", "Principal", "Action", "Resource", "Condition"]) {
    if (statement[key] !== undefined) result[key] = ["Action", "Resource"].includes(key) ? sorted(array(statement[key])) : statement[key];
  }
  return result;
}

function canonicalPolicy(policy) {
  assert.ok(policy && typeof policy === "object" && Array.isArray(policy.Statement), "IAM policy document is malformed");
  return {
    Version: policy.Version,
    Statement: sortedStatements(policy.Statement).map(canonicalStatement)
  };
}

function assertNoWildcardScope(policy) {
  for (const statement of policy.Statement) {
    for (const resource of array(statement.Resource)) assert.equal(resource.includes("*"), false, "readback IAM resource scope may not contain a wildcard");
    for (const action of array(statement.Action)) assert.equal(action.includes("*"), false, "readback IAM action scope may not contain a wildcard");
  }
}

export function validateDesiredState(desired = DESIRED, plan = PLAN) {
  assert.deepEqual(sorted(Object.keys(desired)), sorted([
    "account", "bucket", "claims", "excluded", "notice", "operatorAssumeRolePolicy", "operatorPolicyName", "policyName",
    "operatorUser", "preservedExisting", "region", "requiredDelta", "roleName", "rolePolicy", "schemaVersion", "status", "trustPolicy"
  ]), "desired IAM state contains an unexpected field");
  assert.equal(desired.schemaVersion, "witness-tree/wildfire-derived-readback-iam-desired-state/1", "desired IAM schema is not recognized");
  assert.equal(desired.status, "proposed-not-applied", "desired IAM state may not claim it is live");
  assert.equal(desired.account, ACCOUNT, "desired IAM account is outside the approved account");
  assert.equal(desired.region, "ca-central-1", "desired IAM region is not exact");
  assert.equal(desired.bucket, BUCKET, "desired IAM bucket is not exact");
  assert.equal(desired.roleName, ROLE, "desired IAM role is not exact");
  assert.equal(desired.policyName, POLICY_NAME, "desired IAM policy is not exact");
  assert.equal(desired.operatorUser, OPERATOR, "desired IAM operator is not exact");
  assert.equal(desired.operatorPolicyName, OPERATOR_POLICY, "desired IAM operator policy is not exact");
  assert.deepEqual(desired.excluded, EXCLUDED, "desired IAM exclusions are incomplete or changed");
  assert.deepEqual(desired.claims, {
    iamApplied: false,
    remoteObjectExists: false,
    versionedReadbackAuthorized: false,
    retentionReadbackAuthorized: false,
    ownerAdmission: false,
    productionEligible: false
  }, "desired IAM state contains a live or production claim");
  assert.deepEqual(desired.preservedExisting.statementSids, ["ExactDerivedPayloadAndSidecarReadbacks"], "existing promotion statements are not explicitly preserved");

  const expectedTrust = {
    Version: "2012-10-17",
    Statement: [{
      Effect: "Allow",
      Principal: { AWS: OPERATOR_ARN },
      Action: "sts:AssumeRole",
      Condition: { Bool: { "aws:MultiFactorAuthPresent": "true" } }
    }]
  };
  assert.deepEqual(desired.trustPolicy, expectedTrust, "trust policy is not exact MFA-gated operator trust");
  const expectedOperator = {
    Version: "2012-10-17",
    Statement: [{ Effect: "Allow", Action: "sts:AssumeRole", Resource: ROLE_ARN }]
  };
  assert.deepEqual(canonicalPolicy(desired.operatorAssumeRolePolicy), canonicalPolicy(expectedOperator), "operator AssumeRole path is not exact");

  const keys = expectedKeys(plan);
  const expectedRole = {
    Version: "2012-10-17",
    Statement: [
      { Sid: "ExactDerivedPayloadAndSidecarReadbacks", Effect: "Allow", Action: ["s3:PutObject", "s3:GetObject"], Resource: keys },
      { Sid: "ExactDerivedVersionedReadbacks", Effect: "Allow", Action: ["s3:GetObjectVersion"], Resource: keys },
      { Sid: "ExactDerivedPayloadAndSidecarComplianceRetention", Effect: "Allow", Action: ["s3:PutObjectRetention", "s3:GetObjectRetention"], Resource: keys }
    ]
  };
  assert.deepEqual(canonicalPolicy(desired.rolePolicy), canonicalPolicy(expectedRole), "role policy is not exact readback scope plus preserved promotion scope");
  assertNoWildcardScope(desired.rolePolicy);
  assert.deepEqual(desired.requiredDelta, {
    Sid: "ExactDerivedVersionedReadbacks",
    Effect: "Allow",
    Action: ["s3:GetObjectVersion"],
    Resource: keys
  }, "required IAM delta is not exact four-key versioned readback");
  for (const forbidden of EXCLUDED) {
    for (const statement of desired.rolePolicy.Statement) assert.equal(array(statement.Action).includes(forbidden), false, `forbidden action ${forbidden} is present`);
  }
  return true;
}

export function validateLiveState(live, desired = DESIRED, plan = PLAN) {
  validateDesiredState(desired, plan);
  assert.ok(live && typeof live === "object" && !Array.isArray(live), "live IAM preflight snapshot is malformed");
  assert.equal(live.account, ACCOUNT, "live IAM snapshot account is outside the approved account");
  assert.equal(live.roleName, ROLE, "live IAM snapshot role is not exact");
  assert.equal(live.policyName, POLICY_NAME, "live IAM snapshot policy is not exact");
  assert.equal(live.operatorPolicyName, OPERATOR_POLICY, "live IAM snapshot operator policy is not exact");
  assert.deepEqual(live.trustPolicy, desired.trustPolicy, "live trust policy is not exact MFA-gated operator trust");
  assert.deepEqual(canonicalPolicy(documentOf(live.operatorAssumeRolePolicy)), canonicalPolicy(desired.operatorAssumeRolePolicy), "live operator AssumeRole path is not exact");
  const liveRolePolicy = documentOf(live.rolePolicy);
  assertNoWildcardScope(liveRolePolicy);
  assert.deepEqual(canonicalPolicy(liveRolePolicy), canonicalPolicy(desired.rolePolicy), "live role policy is missing the exact versioned readback delta or has broader scope");
  return true;
}

if (process.argv[1]?.endsWith("check-wildfire-derived-readback-iam.mjs")) {
  try {
    const mode = process.argv[2];
    validateDesiredState();
    if (mode === "--live") {
      validateLiveState(JSON.parse(readFileSync(process.argv[3], "utf8")));
      console.log("Derived wildfire readback IAM desired state and redacted live preflight passed.");
    } else if (mode === undefined) {
      console.log("Derived wildfire readback IAM desired-state preflight passed; live IAM is not claimed.");
    } else {
      throw new Error("usage");
    }
  } catch {
    console.error("Derived wildfire readback IAM preflight failed closed; no IAM or S3 mutation was authorized.");
    process.exitCode = 65;
  }
}
