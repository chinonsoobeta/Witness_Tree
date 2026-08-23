import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const ACCOUNT = "286853118812";
const REGION = "ca-central-1";
const BUCKET = "witness-tree-raw-archive-ca-central-1";
const OPERATOR_ARN = `arn:aws:iam::${ACCOUNT}:user/WitnessTreeArchiveOperator`;
const ROLE_ARN = `arn:aws:iam::${ACCOUNT}:role/WitnessTreeArchivePromotionUploader`;
const ROLE_SESSION_ARN = `arn:aws:sts::${ACCOUNT}:assumed-role/WitnessTreeArchivePromotionUploader/witness-tree-federal-electoral-promotion`;
const SHA256 = /^[a-f0-9]{64}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.000)?Z$/;
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const array = (value) => Array.isArray(value) ? value : [value];
const exactKeys = (value, expected, label) => assert.deepEqual(Object.keys(value ?? {}).sort(), [...expected].sort(), `${label} fields drifted`);
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};
export const canonicalPolicySha256 = (value) => createHash("sha256").update(`${canonical(typeof value === "string" ? JSON.parse(value) : value)}\n`).digest("hex");

function exactUtc(value, label) {
  assert.equal(typeof value, "string", `${label} is not a string`);
  assert.match(value, UTC, `${label} is not a strong UTC timestamp`);
  assert.equal(Number.isFinite(Date.parse(value)), true, `${label} is not a valid UTC timestamp`);
  return value;
}

function exactPolicyResource(desired) {
  const objectResources = desired.rolePolicy.Statement.find(({ Sid }) => Sid === "FederalExactObjectWritesAndReads")?.Resource;
  const payloadResource = desired.rolePolicy.Statement.find(({ Sid }) => Sid === "FederalExactPayloadRetention")?.Resource;
  return { objectResources: array(objectResources), payloadResource: array(payloadResource) };
}

export function validateFederalElectoralPromotionIam(desired, plan) {
  assert.equal(desired.schemaVersion, "witness-tree/federal-electoral-promotion-iam-desired-state/1");
  assert.equal(desired.status, "owner-live-readback-required-storage-not-run");
  assert.equal(desired.account, ACCOUNT);
  assert.equal(desired.region, REGION);
  assert.equal(desired.bucket, BUCKET);
  assert.equal(desired.roleName, "WitnessTreeArchivePromotionUploader");
  assert.equal(desired.operatorUser, "WitnessTreeArchiveOperator");
  assert.equal(desired.liveAttestationRequired, true);
  assert.deepEqual(desired.trustPolicy, {
    Version: "2012-10-17",
    Statement: [{ Effect: "Allow", Principal: { AWS: OPERATOR_ARN }, Action: "sts:AssumeRole", Condition: { Bool: { "aws:MultiFactorAuthPresent": "true" }, NumericLessThan: { "aws:MultiFactorAuthAge": "3600" } } }]
  });
  assert.deepEqual(desired.operatorPolicy, { Version: "2012-10-17", Statement: [{ Effect: "Allow", Action: "sts:AssumeRole", Resource: ROLE_ARN }] });
  const expectedObjects = [
    `arn:aws:s3:::${BUCKET}/${plan.deterministicRemoteNames.payloadKey}`,
    `arn:aws:s3:::${BUCKET}/${plan.deterministicRemoteNames.manifestKey}`
  ];
  const expectedPayload = [expectedObjects[0]];
  const bySid = Object.fromEntries(desired.rolePolicy.Statement.map((statement) => [statement.Sid, statement]));
  assert.deepEqual(bySid.FederalExactObjectWritesAndReads, { Sid: "FederalExactObjectWritesAndReads", Effect: "Allow", Action: ["s3:PutObject", "s3:GetObject", "s3:GetObjectVersion"], Resource: expectedObjects });
  assert.deepEqual(bySid.FederalExactPayloadRetention, { Sid: "FederalExactPayloadRetention", Effect: "Allow", Action: ["s3:PutObjectRetention", "s3:GetObjectRetention"], Resource: expectedPayload });
  assert.deepEqual(bySid.FederalExactVersionListing, { Sid: "FederalExactVersionListing", Effect: "Allow", Action: "s3:ListBucketVersions", Resource: `arn:aws:s3:::${BUCKET}`, Condition: { StringLike: { "s3:prefix": [plan.deterministicRemoteNames.payloadKey, plan.deterministicRemoteNames.manifestKey] } } });
  assert.deepEqual(desired.approvedActions, ["s3:PutObject", "s3:GetObject", "s3:GetObjectVersion", "s3:PutObjectRetention", "s3:GetObjectRetention", "s3:ListBucketVersions"]);
  for (const statement of desired.rolePolicy.Statement) {
    for (const action of array(statement.Action)) assert.equal(action.includes("*"), false, "wildcard IAM action is forbidden");
    for (const resource of array(statement.Resource)) assert.equal(resource.includes("*"), false, "wildcard IAM resource is forbidden");
  }
  assert.deepEqual(bySid.FederalExactVersionListing.Condition, { StringLike: { "s3:prefix": [plan.deterministicRemoteNames.payloadKey, plan.deterministicRemoteNames.manifestKey] } });
  for (const excluded of desired.excluded) for (const statement of desired.rolePolicy.Statement) assert.equal(array(statement.Action).includes(excluded), false, `excluded IAM action ${excluded} is present`);
  assert.deepEqual(desired.readOnlyValidation, {
    accessAnalyzer: { rolePolicyFindings: 0, operatorPolicyFindings: 0 },
    operatorSimulation: { exactRole: "allowed", otherRole: "implicitDeny" },
    roleSimulation: { exactObjectApprovedActions: "allowed", exactObjectDeleteObject: "implicitDeny", exactObjectIamGetRole: "implicitDeny", otherObjectPutAndReadback: "implicitDeny" },
    localArtifactPreflight: "passed-no-totp-no-aws"
  });
  assert.deepEqual(desired.liveAudit, { roleExists: false, policyExactlyVerified: false, iamMutationPerformed: false, s3MutationPerformed: false });
  assert.deepEqual(desired.recoveryBoundary, { replicaCreated: false, replicaAuthorized: false, recoveryCreditEligible: false });
  assert.deepEqual(desired.claims, { iamReady: false, archiveComplete: false, sourceLedgerCreditChanged: false, productionAdmission: false, productionEligible: false });
  return desired;
}

export function validateFederalElectoralLiveIamAttestation(attestation, desired, plan) {
  exactKeys(attestation, ["schemaVersion", "status", "capturedAt", "account", "region", "bucket", "operatorArn", "roleArn", "roleIdentityArn", "trustPolicy", "operatorPolicy", "rolePolicy", "policyDigests", "accessAnalyzer", "simulations", "mutation", "recoveryBoundary"], "live IAM attestation");
  assert.equal(attestation.schemaVersion, "witness-tree/federal-electoral-promotion-iam-live-attestation/1");
  assert.equal(attestation.status, "live-readback-passed");
  exactUtc(attestation.capturedAt, "capturedAt");
  assert.equal(attestation.account, ACCOUNT); assert.equal(attestation.region, REGION); assert.equal(attestation.bucket, BUCKET);
  assert.equal(attestation.operatorArn, OPERATOR_ARN); assert.equal(attestation.roleArn, ROLE_ARN); assert.equal(attestation.roleIdentityArn, ROLE_SESSION_ARN);
  assert.deepEqual(attestation.trustPolicy, desired.trustPolicy);
  assert.deepEqual(attestation.operatorPolicy, desired.operatorPolicy);
  assert.deepEqual(attestation.rolePolicy, desired.rolePolicy);
  exactKeys(attestation.policyDigests, ["trustPolicySha256", "operatorPolicySha256", "rolePolicySha256"], "IAM policy digests");
  assert.equal(attestation.policyDigests.trustPolicySha256, canonicalPolicySha256(desired.trustPolicy));
  assert.equal(attestation.policyDigests.operatorPolicySha256, canonicalPolicySha256(desired.operatorPolicy));
  assert.equal(attestation.policyDigests.rolePolicySha256, canonicalPolicySha256(desired.rolePolicy));
  for (const value of Object.values(attestation.policyDigests)) assert.match(value, SHA256);
  assert.deepEqual(attestation.accessAnalyzer, { rolePolicyFindings: 0, operatorPolicyFindings: 0 });
  assert.deepEqual(attestation.simulations, { exactRoleAssume: "allowed", otherRoleAssume: "implicitDeny", exactObjectApprovedActions: "allowed", exactObjectDeleteObject: "implicitDeny", exactObjectIamGetRole: "implicitDeny", otherObjectPutAndReadback: "implicitDeny" });
  assert.deepEqual(attestation.mutation, { iamMutationPerformed: false, s3MutationPerformed: false });
  assert.deepEqual(attestation.recoveryBoundary, { replicaCreated: false, replicaAuthorized: false, recoveryCreditEligible: false });
  const { objectResources, payloadResource } = exactPolicyResource(desired);
  assert.deepEqual(objectResources, [`arn:aws:s3:::${BUCKET}/${plan.deterministicRemoteNames.payloadKey}`, `arn:aws:s3:::${BUCKET}/${plan.deterministicRemoteNames.manifestKey}`]);
  assert.deepEqual(payloadResource, [objectResources[0]]);
  return attestation;
}

export function loadFederalIamDesiredState(path = new URL("../data/federal-electoral-promotion-iam-desired-state.json", import.meta.url)) {
  return readJson(path);
}

if (process.argv[1]?.endsWith("check-federal-electoral-promotion-iam.mjs")) {
  try {
    const desired = loadFederalIamDesiredState();
    const plan = readJson(new URL("../data/elections-canada-fed-2025-promotion-preparation.json", import.meta.url));
    validateFederalElectoralPromotionIam(desired, plan);
    if (process.argv[2]) validateFederalElectoralLiveIamAttestation(readJson(process.argv[2]), desired, plan);
    console.log(process.argv[2] ? "Federal IAM desired state and live attestation passed." : "Federal IAM desired state passed; live owner IAM attestation remains required before mutation.");
  } catch {
    console.error("Federal IAM validation failed without exposing provider values.");
    process.exitCode = 1;
  }
}
