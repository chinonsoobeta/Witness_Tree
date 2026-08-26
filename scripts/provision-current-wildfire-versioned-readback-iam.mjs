#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";

const ACCOUNT = "286853118812";
const ROLE = "WitnessTreeCurrentWildfirePromotionUploader";
const POLICY = "WitnessTreeCurrentWildfireExactObjectAccess";
const OPERATOR = `arn:aws:iam::${ACCOUNT}:user/WitnessTreeArchiveOperator`;
const BUCKET = "witness-tree-raw-archive-ca-central-1";
const apply = process.argv.includes("--apply");
if (process.argv.some((value, index) => index > 1 && value !== "--apply")) throw new Error("Usage: provision-current-wildfire-versioned-readback-iam.mjs [--apply]");

const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const canonical = (value) => JSON.stringify(stable(value));
const hash = (value) => createHash("sha256").update(canonical(value)).digest("hex");
const aws = (args, label) => {
  const result = spawnSync("aws", [...args, "--output", "json"], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${label} failed; no further IAM mutation was attempted`);
  if (!result.stdout.trim()) return {};
  try { return JSON.parse(result.stdout); } catch { throw new Error(`${label} returned malformed JSON; no further IAM mutation was attempted`); }
};
const documentOf = (envelope) => {
  let value = envelope.PolicyDocument ?? envelope;
  if (typeof value === "string") value = JSON.parse(decodeURIComponent(value));
  if (!value || value.Version !== "2012-10-17" || !Array.isArray(value.Statement)) throw new Error("live policy is malformed; no IAM mutation was attempted");
  return value;
};

const preparation = JSON.parse(await readFile(new URL("../data/current-wildfire-immutable-promotion-preparation.json", import.meta.url), "utf8"));
const resources = preparation.proposedRoleScope.objectKeys.map((key) => `arn:aws:s3:::${BUCKET}/${key}`);
if (resources.length !== 8 || new Set(resources).size !== 8 || resources.some((value) => value.includes("*"))) throw new Error("approved current-wildfire resource set is not exact");
const identity = aws(["sts", "get-caller-identity"], "root identity read");
if (identity.Account !== ACCOUNT || identity.Arn !== `arn:aws:iam::${ACCOUNT}:root`) throw new Error("exact account root identity is required; no IAM mutation was attempted");
const role = aws(["iam", "get-role", "--role-name", ROLE], "role read").Role;
const trust = documentOf(role.AssumeRolePolicyDocument);
const trustStatement = trust.Statement.find(({ Effect, Action }) => Effect === "Allow" && Action === "sts:AssumeRole");
if (trustStatement?.Principal?.AWS !== OPERATOR || trustStatement?.Condition?.Bool?.["aws:MultiFactorAuthPresent"] !== "true") throw new Error("role trust is not exact MFA-gated operator trust; no IAM mutation was attempted");

const getPolicy = () => documentOf(aws(["iam", "get-role-policy", "--role-name", ROLE, "--policy-name", POLICY], "inline policy read"));
const current = getPolicy();
const transfer = current.Statement.find(({ Sid }) => Sid === "ExactCurrentWildfireObjectTransfer");
const retention = current.Statement.find(({ Sid }) => Sid === "ExactCurrentWildfirePayloadAndSidecarRetention");
if (current.Statement.length !== 2 || !transfer || !retention) throw new Error("live policy statement set is not the exact approved base; no IAM mutation was attempted");
if (canonical(transfer.Resource) !== canonical(resources) || canonical(retention.Resource) !== canonical(resources)) throw new Error("live policy resources differ from the eight approved objects; no IAM mutation was attempted");
const baseActions = ["s3:PutObject", "s3:GetObject", "s3:AbortMultipartUpload", "s3:ListMultipartUploadParts"];
const desiredActions = ["s3:PutObject", "s3:GetObject", "s3:GetObjectVersion", "s3:AbortMultipartUpload", "s3:ListMultipartUploadParts"];
const alreadyPresent = canonical(transfer.Action) === canonical(desiredActions);
if (!alreadyPresent && canonical(transfer.Action) !== canonical(baseActions)) throw new Error("live transfer actions are not the exact approved base; no IAM mutation was attempted");
if (canonical(retention.Action) !== canonical(["s3:PutObjectRetention", "s3:GetObjectRetention"])) throw new Error("live retention actions differ from the approved base; no IAM mutation was attempted");
const candidate = structuredClone(current);
candidate.Statement.find(({ Sid }) => Sid === transfer.Sid).Action = desiredActions;
for (const statement of candidate.Statement) {
  const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
  const statementResources = Array.isArray(statement.Resource) ? statement.Resource : [statement.Resource];
  if (actions.some((value) => value.includes("*")) || statementResources.some((value) => value.includes("*"))) throw new Error("candidate contains a wildcard; no IAM mutation was attempted");
}
const basePolicySha256 = hash(current);
const desiredPolicySha256 = hash(candidate);
const directory = mkdtempSync("/private/tmp/witness-tree-current-wildfire-versioned-readback.");
try {
  const policyPath = `${directory}/policy.json`;
  writeFileSync(policyPath, `${JSON.stringify(candidate, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  const findings = aws(["accessanalyzer", "validate-policy", "--policy-document", `file://${policyPath}`, "--policy-type", "IDENTITY_POLICY"], "Access Analyzer validation").findings;
  if (!Array.isArray(findings) || findings.some(({ findingType }) => findingType === "ERROR" || findingType === "SECURITY_WARNING")) throw new Error("Access Analyzer reported a blocking finding; no IAM mutation was attempted");
  const exact = aws(["iam", "simulate-custom-policy", "--policy-input-list", JSON.stringify(candidate), "--action-names", "s3:GetObjectVersion", "--resource-arns", resources[0]], "exact-resource simulation");
  if (exact.EvaluationResults?.[0]?.EvalDecision !== "allowed") throw new Error("exact version-read simulation was not allowed; no IAM mutation was attempted");
  const outside = aws(["iam", "simulate-custom-policy", "--policy-input-list", JSON.stringify(candidate), "--action-names", "s3:GetObjectVersion", "--resource-arns", `arn:aws:s3:::${BUCKET}/raw/not-approved/object`], "out-of-scope simulation");
  if (outside.EvaluationResults?.[0]?.EvalDecision !== "implicitDeny") throw new Error("out-of-scope version-read simulation was not denied; no IAM mutation was attempted");
  if (apply && !alreadyPresent) {
    if (hash(getPolicy()) !== basePolicySha256) throw new Error("live policy changed during preflight; no IAM mutation was attempted");
    aws(["iam", "put-role-policy", "--role-name", ROLE, "--policy-name", POLICY, "--policy-document", `file://${policyPath}`], "exact IAM policy update");
  }
  const readback = getPolicy();
  if (apply && hash(readback) !== desiredPolicySha256) throw new Error("post-apply policy readback differs from the exact candidate");
  console.log(JSON.stringify({ status: apply ? "applied-and-read-back" : "dry-run-passed", role: ROLE, policyName: POLICY, change: alreadyPresent ? "already-present" : "add-s3-GetObjectVersion-to-eight-exact-resources", basePolicySha256, desiredPolicySha256, readbackPolicySha256: hash(readback), accessAnalyzerBlockingFindings: 0, exactVersionRead: "allowed", outOfScopeVersionRead: "implicitDeny" }, null, 2));
} finally {
  rmSync(directory, { recursive: true, force: true });
}
