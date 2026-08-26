import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const ACCOUNT = "286853118812";
const REGION = "ca-central-1";
const BUCKET = "witness-tree-raw-archive-ca-central-1";
const OPERATOR_ARN = `arn:aws:iam::${ACCOUNT}:user/WitnessTreeArchiveOperator`;
const ROLE_ARN = `arn:aws:iam::${ACCOUNT}:role/WitnessTreeArchivePromotionUploader`;
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const array = (value) => Array.isArray(value) ? value : [value];
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};
export const canonicalPolicySha256 = (value) => createHash("sha256").update(`${canonical(typeof value === "string" ? JSON.parse(value) : value)}\n`).digest("hex");

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
    Statement: [{ Effect: "Allow", Principal: { AWS: OPERATOR_ARN }, Action: "sts:AssumeRole", Condition: { Bool: { "aws:MultiFactorAuthPresent": "true" }, NumericLessThan: { "aws:MultiFactorAuthAge": "43200" } } }]
  });
  assert.deepEqual(desired.operatorPolicy, { Version: "2012-10-17", Statement: [{ Effect: "Allow", Action: "sts:AssumeRole", Resource: ROLE_ARN }] });
  const expectedObjects = [
    `arn:aws:s3:::${BUCKET}/${plan.deterministicRemoteNames.payloadKey}`,
    `arn:aws:s3:::${BUCKET}/${plan.deterministicRemoteNames.manifestKey}`
  ];
  const bySid = Object.fromEntries(desired.rolePolicy.Statement.map((statement) => [statement.Sid, statement]));
  assert.deepEqual(bySid.FederalExactObjectWritesAndReads, { Sid: "FederalExactObjectWritesAndReads", Effect: "Allow", Action: ["s3:PutObject", "s3:GetObject", "s3:GetObjectVersion"], Resource: expectedObjects });
  assert.deepEqual(bySid.FederalExactPayloadAndSidecarRetention, { Sid: "FederalExactPayloadAndSidecarRetention", Effect: "Allow", Action: ["s3:PutObjectRetention", "s3:GetObjectRetention"], Resource: expectedObjects });
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
    roleSimulation: { exactObjectApprovedActions: "allowed", allClaimedExcludedActions: "implicitDeny", otherObjectPutGetAndVersionReadback: "implicitDeny" },
    localArtifactPreflight: "passed-no-totp-no-aws"
  });
  assert.deepEqual(desired.liveAudit, { roleExists: false, policyExactlyVerified: false, iamMutationPerformed: false, s3MutationPerformed: false });
  assert.deepEqual(desired.recoveryBoundary, { replicaCreated: false, replicaAuthorized: false, recoveryCreditEligible: false });
  assert.deepEqual(desired.claims, { iamReady: false, archiveComplete: false, sourceLedgerCreditChanged: false, productionAdmission: false, productionEligible: false });
  return desired;
}

export function loadFederalIamDesiredState(path = new URL("../data/federal-electoral-promotion-iam-desired-state.json", import.meta.url)) {
  return readJson(path);
}

if (process.argv[1]?.endsWith("check-federal-electoral-promotion-iam.mjs")) {
  try {
    const desired = loadFederalIamDesiredState();
    const plan = readJson(new URL("../data/elections-canada-fed-2025-promotion-preparation.json", import.meta.url));
    validateFederalElectoralPromotionIam(desired, plan);
    assert.equal(process.argv[2], undefined, "self-asserted live IAM summaries are not accepted; use the file-evidence checker");
    console.log("Federal IAM desired state passed; exact raw file-backed live IAM evidence remains required.");
  } catch {
    console.error("Federal IAM validation failed without exposing provider values.");
    process.exitCode = 1;
  }
}
