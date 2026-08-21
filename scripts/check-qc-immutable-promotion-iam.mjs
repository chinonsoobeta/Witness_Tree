import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
export const DESIRED = read("data/qc-immutable-promotion-iam-desired-state.json");
const PLAN = read("data/qc-immutable-promotion-preparation.json");
const ACCOUNT = "286853118812";
const BUCKET_ARN = "arn:aws:s3:::witness-tree-raw-archive-ca-central-1/";
const ROLE_ARN = `arn:aws:iam::${ACCOUNT}:role/WitnessTreeQcArchivePromotionUploader`;
const OPERATOR_ARN = `arn:aws:iam::${ACCOUNT}:user/WitnessTreeArchiveOperator`;
const array = (value) => Array.isArray(value) ? value : [value];
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};
export const canonicalPolicySha256 = (value) => {
  const document = typeof value === "string" ? JSON.parse(value) : value;
  return createHash("sha256").update(`${canonical(document)}\n`).digest("hex");
};

export function validateQcImmutablePromotionIam(desired = DESIRED, plan = PLAN) {
  assert.equal(desired.schemaVersion, "witness-tree/qc-immutable-promotion-iam-desired-state/1");
  assert.equal(desired.status, "applied-and-exactly-verified-storage-not-run");
  assert.equal(desired.account, ACCOUNT); assert.equal(desired.region, "ca-central-1");
  assert.equal(desired.roleName, plan.mfaGatedExecution.proposedRole);
  assert.equal(desired.operatorUser, "WitnessTreeArchiveOperator");
  assert.deepEqual(desired.trustPolicy, {Version:"2012-10-17",Statement:[{Effect:"Allow",Principal:{AWS:OPERATOR_ARN},Action:"sts:AssumeRole",Condition:{Bool:{"aws:MultiFactorAuthPresent":"true"}}}]});
  assert.deepEqual(desired.operatorPolicy, {Version:"2012-10-17",Statement:[{Effect:"Allow",Action:"sts:AssumeRole",Resource:ROLE_ARN}]});
  const allKeys = plan.artifacts.flatMap((artifact) => [artifact.payloadKey, artifact.manifestKey]).map((key) => `${BUCKET_ARN}${key}`);
  const payloadKeys = plan.artifacts.map((artifact) => `${BUCKET_ARN}${artifact.payloadKey}`);
  const bySid = Object.fromEntries(desired.rolePolicy.Statement.map((statement) => [statement.Sid, statement]));
  assert.deepEqual(bySid.ExactQcArchiveObjects, {Sid:"ExactQcArchiveObjects",Effect:"Allow",Action:["s3:PutObject","s3:GetObject"],Resource:allKeys});
  assert.deepEqual(bySid.ExactQcMultipartPayloads, {Sid:"ExactQcMultipartPayloads",Effect:"Allow",Action:["s3:AbortMultipartUpload","s3:ListMultipartUploadParts"],Resource:payloadKeys});
  assert.deepEqual(bySid.ExactQcVersionedReadbacks, {Sid:"ExactQcVersionedReadbacks",Effect:"Allow",Action:["s3:GetObjectVersion"],Resource:allKeys});
  assert.deepEqual(bySid.ExactQcPayloadRetention, {Sid:"ExactQcPayloadRetention",Effect:"Allow",Action:["s3:PutObjectRetention","s3:GetObjectRetention"],Resource:payloadKeys});
  assert.equal(desired.additionalApprovalRequired, null);
  assert.equal(desired.approvedActions.includes("s3:GetObjectVersion"), true);
  for (const statement of desired.rolePolicy.Statement) for (const action of array(statement.Action)) assert.equal(action.includes("*"), false);
  for (const statement of desired.rolePolicy.Statement) for (const resource of array(statement.Resource)) assert.equal(resource.includes("*"), false);
  for (const excluded of desired.excluded) for (const statement of desired.rolePolicy.Statement) assert.equal(array(statement.Action).includes(excluded), false);
  assert.deepEqual(desired.readOnlyValidation, {
    accessAnalyzer:{rolePolicyFindings:0,operatorPolicyFindings:0},
    operatorSimulation:{exactRole:"allowed",otherRole:"implicitDeny"},
    roleSimulation:{
      exactPayloadApprovedActions:"allowed",
      exactPayloadDeleteObject:"implicitDeny",
      exactPayloadIamGetRole:"implicitDeny",
      otherObjectPutAndReadback:"implicitDeny"
    },
    localArtifactPreflight:"passed-no-totp-no-aws"
  });
  assert.deepEqual(desired.appliedAttestation, {
    roleExists:true,dedicatedOperatorPolicyExists:true,dedicatedOperatorPolicyAttachedOnlyTo:"WitnessTreeArchiveOperator",
    roleInlinePolicies:["WitnessTreeQcArchiveExactObjects"],roleAttachedPolicies:[],
    trustPolicyCanonicalSha256:"d500f965cea406ab82e55f3985eee035ce07649977d474a399bd6b9fd42960da",
    rolePolicyCanonicalSha256:"a06181bb6034076dd0bb79731a1141e597293a7ad3e084cda5bd92995e7f7173",
    operatorPolicyCanonicalSha256:"81947e11bcf89ae0679afd220ff6ab78e5bf49ddb8245fba0cb0587001791375",
    operatorInlinePoliciesNormalizedEqualPrestate:true,operatorAttachedPoliciesNormalizedEqualPrestatePlusDedicatedPolicy:true,
    initialHarnessExit:{occurredAfterAuthorizedAttachment:true,cause:"raw-pretty-versus-compact-json-comparison",policyMismatch:false,normalizedReadbackPassed:true},
    containsPrivateIdentifiers:false
  });
  assert.equal(canonicalPolicySha256(desired.trustPolicy), desired.appliedAttestation.trustPolicyCanonicalSha256);
  assert.equal(canonicalPolicySha256(desired.rolePolicy), desired.appliedAttestation.rolePolicyCanonicalSha256);
  assert.equal(canonicalPolicySha256(desired.operatorPolicy), desired.appliedAttestation.operatorPolicyCanonicalSha256);
  assert.deepEqual(desired.liveAudit, {roleExists:true,dedicatedOperatorPolicyExists:true,iamMutationPerformed:true,s3MutationPerformed:false});
  assert.deepEqual(desired.claims, {iamReady:true,archiveComplete:false,productionAdmission:false,productionEligible:false});
  return { roleStatements: desired.rolePolicy.Statement.length, exactObjectKeys: allKeys.length, payloadKeys: payloadKeys.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  validateQcImmutablePromotionIam();
  console.log("Québec current/original IAM is applied and exactly verified; no storage operation or archive claim exists.");
}
