import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const APPROVAL_FLAGS = ["approve-identities", "approve-audit-logging", "approve-inventory", "approve-lifecycle", "approve-legal-hold-exercise", "approve-recovery-replication", "approve-usd-10-monthly-ceiling"];
const REGION = "ca-central-1";
const PRIMARY = "witness-tree-raw-archive-ca-central-1";
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const bucketArn = (bucket, suffix = "") => `arn:aws:s3:::${bucket}${suffix}`;
const json = (value) => JSON.stringify(value);

export function validateArchiveControlsExecution(plan) {
  assert.equal(plan?.schemaVersion, "witness-tree/phase1-archive-controls-execution/1");
  assert.equal(plan.state, "unapplied", "This committed plan must remain unapplied.");
  assert.equal(plan.region, REGION, "Archive controls are pinned to Canada (Central).");
  assert.equal(plan.resources?.primaryBucket, PRIMARY);
  assert.equal(plan.resources?.auditLogBucket, "witness-tree-archive-audit-logs-ca-central-1");
  assert.equal(plan.resources?.recoveryBucket, "witness-tree-raw-recovery-ca-central-1");
  assert.equal(plan.resources?.uploaderRole, "WitnessTreeArchiveUploader");
  assert.equal(plan.resources?.breakGlassRole, "WitnessTreeArchiveRetentionBreakGlass");
  assert.equal(plan.resources?.replicationRole, "WitnessTreeArchiveReplication");
  assert.equal(plan.resources?.trail, "witness-tree-archive-object-audit-ca-central-1");
  assert.equal(plan.resources?.inventory, "weekly-object-lock-inventory");
  assert.equal(plan.resources?.lifecycleRule, "abort-incomplete-multipart-after-7-days");
  assert.equal(plan.scope?.uploadPrefix, "raw/*");
  assert.equal(plan.scope?.legalHoldExercisePrefix, "raw/legal-hold-exercises/*");
  assert.equal(plan.scope?.inventoryPrefix, "inventory/");
  assert.equal(plan.scope?.lifecycleAbortIncompleteMultipartAfterDays, 7);
  assert.equal(plan.scope?.inventoryFrequency, "Weekly");
  assert.equal(plan.scope?.replication, "same-region-ca-central-1-new-objects-only");
  assert.equal(plan.costGuard?.currency, "USD");
  assert.equal(plan.costGuard?.monthlyCeiling, 10, "The committed package may not exceed US$10/month.");
  assert.deepEqual(plan.requiredApprovals, APPROVAL_FLAGS);
  assert.ok(Array.isArray(plan.rollbackLimits) && plan.rollbackLimits.length >= 5);
  assert.match(plan.notice, /must not be applied/i);
  return plan;
}

function input(value, field) { assert.ok(typeof value === "string" && value.trim(), `${field} is required.`); return value; }
function futureUtc(value) { return UTC.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value) > new Date(); }

export function validateExecutionOptions(plan, options) {
  validateArchiveControlsExecution(plan);
  if (!options.execute) return { mode: "dry-run" };
  for (const flag of APPROVAL_FLAGS) assert.equal(options[flag], true, `Execution requires --${flag}.`);
  assert.match(input(options.accountId, "--account-id"), /^\d{12}$/, "--account-id must be a 12-digit AWS account ID supplied at runtime.");
  const principal = input(options.ownerFederatedPrincipalArn, "--owner-federated-principal-arn");
  assert.match(principal, new RegExp(`^arn:aws:iam::${options.accountId}:role/`), "The owner federated principal must be an approved role in the supplied account.");
  assert.ok(futureUtc(options.exerciseRetentionUntil), "--exercise-retention-until must be a future UTC instant.");
  assert.match(input(options.exerciseKey, "--exercise-key"), /^raw\/legal-hold-exercises\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9-]+\/payload\.txt$/, "Exercise key must be a dedicated non-source legal-hold object.");
  input(options.exercisePayloadFile, "--exercise-payload-file");
  assert.equal(options.monthlyCeiling, 10, "Execution is limited to the approved US$10 monthly ceiling.");
  input(options.workDir, "--work-dir");
  return { mode: "execute" };
}

export function policies(plan, options) {
  const r = plan.resources;
  const primary = bucketArn(r.primaryBucket);
  const logs = bucketArn(r.auditLogBucket);
  const recovery = bucketArn(r.recoveryBucket);
  const trust = (principal, mfa = false) => ({ Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { AWS: principal }, Action: "sts:AssumeRole", ...(mfa ? { Condition: { Bool: { "aws:MultiFactorAuthPresent": "true" } } } : {}) }] });
  return {
    uploaderTrust: trust(options.ownerFederatedPrincipalArn),
    uploader: { Version: "2012-10-17", Statement: [
      { Sid: "ListRawPrefix", Effect: "Allow", Action: ["s3:ListBucket", "s3:ListBucketMultipartUploads"], Resource: primary, Condition: { StringLike: { "s3:prefix": ["raw/*"] } } },
      { Sid: "WriteAndVerifyRawOnly", Effect: "Allow", Action: ["s3:PutObject", "s3:AbortMultipartUpload", "s3:ListMultipartUploadParts", "s3:GetObject", "s3:GetObjectAttributes", "s3:GetObjectRetention", "s3:GetObjectLegalHold"], Resource: `${primary}/raw/*` },
      { Sid: "DenyDeletionAndLockWeakening", Effect: "Deny", Action: ["s3:DeleteObject", "s3:DeleteObjectVersion", "s3:PutObjectRetention", "s3:PutObjectLegalHold", "s3:BypassGovernanceRetention"], Resource: `${primary}/raw/*` }
    ] },
    breakGlassTrust: trust(options.ownerFederatedPrincipalArn, true),
    breakGlass: { Version: "2012-10-17", Statement: [
      { Sid: "ExerciseHoldAndRetentionOnly", Effect: "Allow", Action: ["s3:GetObjectRetention", "s3:GetObjectLegalHold", "s3:PutObjectLegalHold", "s3:PutObjectRetention"], Resource: `${primary}/raw/legal-hold-exercises/*` },
      { Sid: "DenyDestructiveAndBucketAdministration", Effect: "Deny", Action: ["s3:DeleteObject", "s3:DeleteObjectVersion", "s3:BypassGovernanceRetention", "s3:PutBucketPolicy", "s3:DeleteBucketPolicy", "s3:PutBucketLifecycleConfiguration", "s3:PutBucketReplication"], Resource: [primary, `${primary}/*`] }
    ] },
    replicationTrust: { Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { Service: "s3.amazonaws.com" }, Action: "sts:AssumeRole" }] },
    replication: { Version: "2012-10-17", Statement: [
      { Effect: "Allow", Action: ["s3:GetReplicationConfiguration", "s3:ListBucket"], Resource: primary },
      { Effect: "Allow", Action: ["s3:GetObjectVersionForReplication", "s3:GetObjectVersionAcl", "s3:GetObjectVersionTagging", "s3:GetObjectRetention", "s3:GetObjectLegalHold"], Resource: `${primary}/raw/*` },
      { Effect: "Allow", Action: ["s3:ReplicateObject", "s3:ReplicateDelete", "s3:ReplicateTags", "s3:ObjectOwnerOverrideToBucketOwner"], Resource: `${recovery}/raw/*` }
    ] },
    logBucket: { Version: "2012-10-17", Statement: [
      { Sid: "CloudTrailAclCheck", Effect: "Allow", Principal: { Service: "cloudtrail.amazonaws.com" }, Action: "s3:GetBucketAcl", Resource: logs, Condition: { StringEquals: { "aws:SourceArn": `arn:aws:cloudtrail:${REGION}:${options.accountId}:trail/${r.trail}` } } },
      { Sid: "CloudTrailWrite", Effect: "Allow", Principal: { Service: "cloudtrail.amazonaws.com" }, Action: "s3:PutObject", Resource: `${logs}/AWSLogs/${options.accountId}/*`, Condition: { StringEquals: { "s3:x-amz-acl": "bucket-owner-full-control", "aws:SourceArn": `arn:aws:cloudtrail:${REGION}:${options.accountId}:trail/${r.trail}` } } },
      { Sid: "InventoryWrite", Effect: "Allow", Principal: { AWS: `arn:aws:iam::${options.accountId}:root` }, Action: "s3:PutObject", Resource: `${logs}/inventory/*`, Condition: { StringEquals: { "s3:x-amz-acl": "bucket-owner-full-control" } } }
    ] }
  };
}

export function executionFiles(plan, options) {
  const r = plan.resources;
  const p = policies(plan, options);
  return {
    "uploader-trust.json": p.uploaderTrust, "uploader-policy.json": p.uploader,
    "break-glass-trust.json": p.breakGlassTrust, "break-glass-policy.json": p.breakGlass,
    "replication-trust.json": p.replicationTrust, "replication-policy.json": p.replication, "log-bucket-policy.json": p.logBucket,
    "lifecycle.json": { Rules: [{ ID: r.lifecycleRule, Status: "Enabled", Filter: { Prefix: "raw/" }, AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 } }] },
    "inventory.json": { Id: r.inventory, IsEnabled: true, IncludedObjectVersions: "All", Schedule: { Frequency: "Weekly" }, Filter: { Prefix: "raw/" }, Destination: { S3BucketDestination: { AccountId: options.accountId, Bucket: bucketArn(r.auditLogBucket), Format: "CSV", Prefix: "inventory/" } }, OptionalFields: ["Size", "LastModifiedDate", "VersionId", "IsLatest", "ObjectLockRetainUntilDate", "ObjectLockMode", "ObjectLockLegalHoldStatus"] },
    "replication.json": { Role: `arn:aws:iam::${options.accountId}:role/${r.replicationRole}`, Rules: [{ ID: "replicate-new-raw-objects-to-canadian-recovery", Status: "Enabled", Priority: 1, Filter: { Prefix: "raw/" }, DeleteMarkerReplication: { Status: "Disabled" }, ExistingObjectReplication: { Status: "Disabled" }, Destination: { Bucket: bucketArn(r.recoveryBucket), Account: options.accountId, AccessControlTranslation: { Owner: "Destination" } } }] },
    "event-selectors.json": [{ ReadWriteType: "All", IncludeManagementEvents: true, DataResources: [{ Type: "AWS::S3::Object", Values: [`${bucketArn(r.primaryBucket)}/`] }] }],
    "retention.json": { Retention: { Mode: "COMPLIANCE", RetainUntilDate: options.exerciseRetentionUntil } },
    "legal-hold-on.json": { LegalHold: { Status: "ON" } }, "legal-hold-off.json": { LegalHold: { Status: "OFF" } }
  };
}

export function commandPlan(plan, options) {
  validateExecutionOptions(plan, options);
  const r = plan.resources, dir = options.workDir ?? "<approved-work-dir>", file = (name) => `file://${join(dir, name)}`;
  const base = ["--region", REGION, "--output", "json"];
  return [
    ["iam", "create-role", "--role-name", r.uploaderRole, "--assume-role-policy-document", file("uploader-trust.json")],
    ["iam", "put-role-policy", "--role-name", r.uploaderRole, "--policy-name", "WitnessTreeArchiveUploaderLeastPrivilege", "--policy-document", file("uploader-policy.json")],
    ["iam", "create-role", "--role-name", r.breakGlassRole, "--assume-role-policy-document", file("break-glass-trust.json")],
    ["iam", "put-role-policy", "--role-name", r.breakGlassRole, "--policy-name", "WitnessTreeArchiveRetentionBreakGlassExerciseOnly", "--policy-document", file("break-glass-policy.json")],
    ["s3api", "create-bucket", "--bucket", r.auditLogBucket, "--create-bucket-configuration", `LocationConstraint=${REGION}`, ...base],
    ["s3api", "create-bucket", "--bucket", r.recoveryBucket, "--object-lock-enabled-for-bucket", "--create-bucket-configuration", `LocationConstraint=${REGION}`, ...base],
    ["s3api", "put-public-access-block", "--bucket", r.auditLogBucket, "--public-access-block-configuration", json({ BlockPublicAcls: true, IgnorePublicAcls: true, BlockPublicPolicy: true, RestrictPublicBuckets: true }), ...base],
    ["s3api", "put-public-access-block", "--bucket", r.recoveryBucket, "--public-access-block-configuration", json({ BlockPublicAcls: true, IgnorePublicAcls: true, BlockPublicPolicy: true, RestrictPublicBuckets: true }), ...base],
    ["s3api", "put-bucket-ownership-controls", "--bucket", r.auditLogBucket, "--ownership-controls", json({ Rules: [{ ObjectOwnership: "BucketOwnerEnforced" }] }), ...base],
    ["s3api", "put-bucket-ownership-controls", "--bucket", r.recoveryBucket, "--ownership-controls", json({ Rules: [{ ObjectOwnership: "BucketOwnerEnforced" }] }), ...base],
    ["s3api", "put-bucket-versioning", "--bucket", r.recoveryBucket, "--versioning-configuration", "Status=Enabled", ...base],
    ["s3api", "put-bucket-encryption", "--bucket", r.auditLogBucket, "--server-side-encryption-configuration", json({ Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } }] }), ...base],
    ["s3api", "put-bucket-encryption", "--bucket", r.recoveryBucket, "--server-side-encryption-configuration", json({ Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } }] }), ...base],
    ["s3api", "put-bucket-policy", "--bucket", r.auditLogBucket, "--policy", file("log-bucket-policy.json"), ...base],
    ["cloudtrail", "create-trail", "--name", r.trail, "--s3-bucket-name", r.auditLogBucket, "--is-multi-region-trail", "false", "--include-global-service-events", "false", ...base],
    ["cloudtrail", "put-event-selectors", "--trail-name", r.trail, "--event-selectors", file("event-selectors.json"), ...base],
    ["cloudtrail", "start-logging", "--name", r.trail, ...base],
    ["s3api", "put-bucket-inventory-configuration", "--bucket", r.primaryBucket, "--id", r.inventory, "--inventory-configuration", file("inventory.json"), ...base],
    ["s3api", "put-bucket-lifecycle-configuration", "--bucket", r.primaryBucket, "--lifecycle-configuration", file("lifecycle.json"), ...base],
    ["iam", "create-role", "--role-name", r.replicationRole, "--assume-role-policy-document", file("replication-trust.json")],
    ["iam", "put-role-policy", "--role-name", r.replicationRole, "--policy-name", "WitnessTreeArchiveSameRegionReplication", "--policy-document", file("replication-policy.json")],
    ["s3api", "put-bucket-replication", "--bucket", r.primaryBucket, "--replication-configuration", file("replication.json"), ...base],
    ["s3api", "put-object", "--bucket", r.primaryBucket, "--key", options.exerciseKey ?? "<approved-exercise-key>", "--body", options.exercisePayloadFile ?? "<approved-tiny-payload-file>", "--checksum-algorithm", "SHA256", ...base],
    ["s3api", "put-object-retention", "--bucket", r.primaryBucket, "--key", options.exerciseKey ?? "<approved-exercise-key>", "--retention", file("retention.json"), ...base],
    ["s3api", "put-object-legal-hold", "--bucket", r.primaryBucket, "--key", options.exerciseKey ?? "<approved-exercise-key>", "--legal-hold", file("legal-hold-on.json"), ...base],
    ["s3api", "get-object-retention", "--bucket", r.primaryBucket, "--key", options.exerciseKey ?? "<approved-exercise-key>", ...base],
    ["s3api", "get-object-legal-hold", "--bucket", r.primaryBucket, "--key", options.exerciseKey ?? "<approved-exercise-key>", ...base],
    ["s3api", "put-object-legal-hold", "--bucket", r.primaryBucket, "--key", options.exerciseKey ?? "<approved-exercise-key>", "--legal-hold", file("legal-hold-off.json"), ...base],
    ["s3api", "get-object-retention", "--bucket", r.primaryBucket, "--key", options.exerciseKey ?? "<approved-exercise-key>", ...base]
  ];
}

export function executeArchiveControls(plan, options, invoke = (args) => execFileSync("aws", args, { encoding: "utf8" })) {
  validateExecutionOptions(plan, options);
  mkdirSync(options.workDir, { recursive: true });
  for (const [name, contents] of Object.entries(executionFiles(plan, options))) writeFileSync(join(options.workDir, name), `${JSON.stringify(contents, null, 2)}\n`, { flag: "wx" });
  const commands = commandPlan(plan, options);
  for (const command of commands) invoke(command);
  return commands;
}

function option(name) { const i = process.argv.indexOf(name); return i === -1 ? undefined : process.argv[i + 1]; }
function flag(name) { return process.argv.includes(`--${name}`); }
if (process.argv[1]?.endsWith("phase1-archive-controls-execution.mjs")) {
  const plan = JSON.parse(readFileSync(new URL("../data/phase1-archive-controls-execution.json", import.meta.url), "utf8"));
  const options = { execute: flag("execute"), accountId: option("--account-id"), ownerFederatedPrincipalArn: option("--owner-federated-principal-arn"), exerciseRetentionUntil: option("--exercise-retention-until"), exerciseKey: option("--exercise-key"), exercisePayloadFile: option("--exercise-payload-file"), monthlyCeiling: Number(option("--monthly-ceiling")), workDir: option("--work-dir"), ...Object.fromEntries(APPROVAL_FLAGS.map((name) => [name, flag(name)])) };
  const commands = options.execute ? executeArchiveControls(plan, options) : commandPlan(plan, options);
  console.log(JSON.stringify({ mode: options.execute ? "execute" : "dry-run", applied: false, commands: commands.map((args) => ["aws", ...args].join(" ")) }, null, 2));
}
