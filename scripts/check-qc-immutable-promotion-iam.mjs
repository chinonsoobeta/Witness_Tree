import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
export const DESIRED = read("data/qc-immutable-promotion-iam-desired-state.json");
const PLAN = read("data/qc-immutable-promotion-preparation.json");
const ACCOUNT = "286853118812";
const BUCKET_ARN = "arn:aws:s3:::witness-tree-raw-archive-ca-central-1/";
const ROLE_ARN = `arn:aws:iam::${ACCOUNT}:role/WitnessTreeQcArchivePromotionUploader`;
const OPERATOR_ARN = `arn:aws:iam::${ACCOUNT}:user/WitnessTreeArchiveOperator`;
const array = (value) => Array.isArray(value) ? value : [value];

export function validateQcImmutablePromotionIam(desired = DESIRED, plan = PLAN) {
  assert.equal(desired.schemaVersion, "witness-tree/qc-immutable-promotion-iam-desired-state/1");
  assert.equal(desired.status, "approved-pending-privileged-provisioning");
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
    }
  });
  assert.deepEqual(desired.liveAudit, {roleExists:false,dedicatedOperatorPolicyExists:false,iamMutationPerformed:false,s3MutationPerformed:false});
  assert.deepEqual(desired.claims, {iamReady:false,archiveComplete:false,productionAdmission:false,productionEligible:false});
  return { roleStatements: desired.rolePolicy.Statement.length, exactObjectKeys: allKeys.length, payloadKeys: payloadKeys.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  validateQcImmutablePromotionIam();
  console.log("Québec current/original IAM desired state passed; exact provisioning is approved but has not occurred.");
}
