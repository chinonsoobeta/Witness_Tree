#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ACCOUNT = "286853118812";
const OPERATOR_USER = "WitnessTreeArchiveOperator";
const OPERATOR_ARN = `arn:aws:iam::${ACCOUNT}:user/${OPERATOR_USER}`;
const ROLE = "WitnessTreePublicDeliveryUploader";
const ROLE_POLICY = "WitnessTreePhase8BulkDownloadExactObjects";
const OPERATOR_POLICY = "WitnessTreeAssumePublicDeliveryUploader";
const BUCKET = "witness-tree-public-delivery-ca-central-1";
const RELEASE_ID = "316af633de6a259554a79f46653481b5876ebed3be749e78b700e4aeeea0ee1f";
const DATA_ROOT = process.env.WITNESS_TREE_DATA_ROOT ?? "/Volumes/Extended_SSD/Witness_Tree-data";
const MANIFEST_PATH = join(DATA_ROOT, "derived/phase8-bulk-download-v1", RELEASE_ID, "manifest.json");
const apply = process.argv.includes("--apply");
if (process.argv.some((value, index) => index > 1 && value !== "--apply")) throw new Error("Usage: provision-phase8-bulk-download-iam.mjs [--apply]");

const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const canonical = (value) => JSON.stringify(stable(value));
const sha256 = (value) => createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : canonical(value)).digest("hex");
const documentOf = (envelope) => {
  let value = envelope?.PolicyDocument ?? envelope;
  if (typeof value === "string") value = JSON.parse(decodeURIComponent(value));
  if (!value || value.Version !== "2012-10-17" || !Array.isArray(value.Statement)) throw new Error("IAM policy document is malformed");
  return value;
};
const invoke = (args, label, { allowAbsent = false } = {}) => {
  const result = spawnSync("aws", [...args, "--output", "json"], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) {
    if (allowAbsent && /NoSuchEntity|cannot be found/i.test(result.stderr)) return null;
    throw new Error(`${label} failed; no further IAM mutation was attempted`);
  }
  try { return result.stdout.trim() ? JSON.parse(result.stdout) : {}; } catch { throw new Error(`${label} returned malformed JSON; no further IAM mutation was attempted`); }
};

if (!existsSync(MANIFEST_PATH)) throw new Error("exact local bulk-download manifest is absent");
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
if (manifest.releaseId !== RELEASE_ID || manifest.status !== "verified-local-release-candidate" || manifest.outputs?.csv?.sha256 !== "a11fe16f3b6872b8928b13fc0eb62e19a7c8d1f6131f94eceffe76d89f23b1dd" || manifest.outputs?.geopackage?.sha256 !== "d5d8bb2b3eb92145277ffe5cf06387fd4d9705997c1b808c5975ec86e4db2b7a" || manifest.geometryTransform?.allOutputGeometriesValid !== true || !manifest.modificationNotice?.en || !manifest.modificationNotice?.fr) throw new Error("local release manifest binding drift");
const publicManifestPath = join(DATA_ROOT, "derived/phase8-bulk-download-v1", RELEASE_ID, "public-manifest.json");
if (!existsSync(publicManifestPath) || sha256(readFileSync(publicManifestPath)) !== "0d43fd90f3f8c522e2885922f838e56b6c28fe4e2d1f8f2ab72a15a0a209789d") throw new Error("public manifest binding drift");
const keys = [...[manifest.outputs.csv, manifest.outputs.geopackage].map(({ fileName }) => `releases/phase8-bulk-download-v1/${RELEASE_ID}/downloads/${fileName}`), `releases/phase8-bulk-download-v1/${RELEASE_ID}/manifest.json`];
const resources = keys.map((key) => `arn:aws:s3:::${BUCKET}/${key}`);
if (resources.length !== 3 || new Set(resources).size !== 3 || resources.some((resource) => resource.includes("*"))) throw new Error("bulk-download resource scope is not three exact objects");

export const trustPolicy = () => ({ Version: "2012-10-17", Statement: [{ Sid: "AllowOnlyMfaGatedWitnessTreeOperator", Effect: "Allow", Principal: { AWS: OPERATOR_ARN }, Action: "sts:AssumeRole", Condition: { Bool: { "aws:MultiFactorAuthPresent": "true" } } }] });
export const rolePolicy = () => ({ Version: "2012-10-17", Statement: [
  { Sid: "AllowExactImmutableBulkDownloadWrites", Effect: "Allow", Action: "s3:PutObject", Resource: resources },
  { Sid: "AllowExactBulkDownloadReadback", Effect: "Allow", Action: "s3:GetObject", Resource: resources },
  { Sid: "DenyDestructiveOrPrivilegeChangingActions", Effect: "Deny", Action: ["s3:DeleteObject", "s3:DeleteObjectVersion", "s3:PutObjectAcl", "s3:PutBucket*", "s3:DeleteBucket*", "iam:*"], Resource: "*" },
] });
export const operatorPolicy = () => ({ Version: "2012-10-17", Statement: [{ Sid: "AssumeOnlyPublicDeliveryUploaderWithMfa", Effect: "Allow", Action: "sts:AssumeRole", Resource: `arn:aws:iam::${ACCOUNT}:role/${ROLE}`, Condition: { Bool: { "aws:MultiFactorAuthPresent": "true" } } }] });

const identity = invoke(["sts", "get-caller-identity"], "root identity read");
if (identity.Account !== ACCOUNT || identity.Arn !== `arn:aws:iam::${ACCOUNT}:root`) throw new Error("exact account root identity is required; no IAM mutation was attempted");
const bucketPolicyEnvelope = invoke(["s3api", "get-bucket-policy", "--bucket", BUCKET], "delivery bucket policy read");
const bucketPolicy = JSON.parse(bucketPolicyEnvelope.Policy);
const conditionalCreate = bucketPolicy.Statement?.find(({ Sid }) => Sid === "DenyUnconditionalReleaseWrites");
const releaseDelete = bucketPolicy.Statement?.find(({ Sid }) => Sid === "DenyReleaseDeletion");
if (conditionalCreate?.Effect !== "Deny" || conditionalCreate.Action !== "s3:PutObject" || !String(conditionalCreate.Resource).endsWith("/releases/*") || conditionalCreate.Condition?.Null?.["s3:if-none-match"] !== "true" || conditionalCreate.Condition?.Bool?.["s3:ObjectCreationOperation"] !== "true") throw new Error("delivery bucket does not enforce conditional create-only release writes; no IAM mutation was attempted");
if (releaseDelete?.Effect !== "Deny" || !Array.isArray(releaseDelete.Action) || !releaseDelete.Action.includes("s3:DeleteObject") || !releaseDelete.Action.includes("s3:DeleteObjectVersion") || !String(releaseDelete.Resource).endsWith("/releases/*")) throw new Error("delivery bucket does not deny release deletion; no IAM mutation was attempted");
const desiredTrust = trustPolicy();
const desiredRole = rolePolicy();
const desiredOperator = operatorPolicy();
const temp = mkdtempSync(join(tmpdir(), "witness-tree-phase8-bulk-iam-"));
try {
  for (const [name, policy] of [["role", desiredRole], ["operator", desiredOperator]]) {
    const path = join(temp, `${name}.json`);
    writeFileSync(path, `${JSON.stringify(policy, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    const findings = invoke(["accessanalyzer", "validate-policy", "--policy-document", `file://${path}`, "--policy-type", "IDENTITY_POLICY"], `${name} policy validation`).findings;
    if (!Array.isArray(findings) || findings.some(({ findingType }) => findingType === "ERROR" || findingType === "SECURITY_WARNING")) throw new Error(`${name} policy has blocking Access Analyzer findings; no IAM mutation was attempted`);
  }
  for (const resource of resources) {
    const allowed = invoke(["iam", "simulate-custom-policy", "--policy-input-list", JSON.stringify(desiredRole), "--action-names", "s3:PutObject", "s3:GetObject", "--resource-arns", resource], "exact-resource simulation");
    if (!allowed.EvaluationResults?.every(({ EvalDecision }) => EvalDecision === "allowed")) throw new Error("exact-resource policy simulation was not allowed; no IAM mutation was attempted");
  }
  const outside = invoke(["iam", "simulate-custom-policy", "--policy-input-list", JSON.stringify(desiredRole), "--action-names", "s3:PutObject", "s3:GetObject", "--resource-arns", `arn:aws:s3:::${BUCKET}/releases/not-approved/object`], "out-of-scope simulation");
  if (!outside.EvaluationResults?.every(({ EvalDecision }) => EvalDecision === "implicitDeny")) throw new Error("out-of-scope policy simulation was not denied; no IAM mutation was attempted");

  const currentRole = invoke(["iam", "get-role", "--role-name", ROLE], "role read", { allowAbsent: true });
  const currentRolePolicy = invoke(["iam", "get-role-policy", "--role-name", ROLE, "--policy-name", ROLE_POLICY], "role policy read", { allowAbsent: true });
  const currentOperatorPolicy = invoke(["iam", "get-user-policy", "--user-name", OPERATOR_USER, "--policy-name", OPERATOR_POLICY], "operator policy read", { allowAbsent: true });
  if (currentRole && canonical(documentOf(currentRole.Role.AssumeRolePolicyDocument)) !== canonical(desiredTrust)) throw new Error("existing role trust differs from the exact MFA-gated trust; no IAM mutation was attempted");
  if (apply) {
    const trustPath = join(temp, "trust.json");
    const rolePath = join(temp, "role.json");
    const operatorPath = join(temp, "operator.json");
    writeFileSync(trustPath, `${JSON.stringify(desiredTrust, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    if (!currentRole) invoke(["iam", "create-role", "--role-name", ROLE, "--assume-role-policy-document", `file://${trustPath}`, "--max-session-duration", "43200"], "role creation");
    if (!currentRolePolicy || canonical(documentOf(currentRolePolicy)) !== canonical(desiredRole)) invoke(["iam", "put-role-policy", "--role-name", ROLE, "--policy-name", ROLE_POLICY, "--policy-document", `file://${rolePath}`], "role policy apply");
    if (!currentOperatorPolicy || canonical(documentOf(currentOperatorPolicy)) !== canonical(desiredOperator)) invoke(["iam", "put-user-policy", "--user-name", OPERATOR_USER, "--policy-name", OPERATOR_POLICY, "--policy-document", `file://${operatorPath}`], "operator policy apply");
  }
  const readbackRole = invoke(["iam", "get-role", "--role-name", ROLE], "role readback", { allowAbsent: !apply });
  const readbackRolePolicy = invoke(["iam", "get-role-policy", "--role-name", ROLE, "--policy-name", ROLE_POLICY], "role policy readback", { allowAbsent: !apply });
  const readbackOperatorPolicy = invoke(["iam", "get-user-policy", "--user-name", OPERATOR_USER, "--policy-name", OPERATOR_POLICY], "operator policy readback", { allowAbsent: !apply });
  if (apply && (canonical(documentOf(readbackRole.Role.AssumeRolePolicyDocument)) !== canonical(desiredTrust) || canonical(documentOf(readbackRolePolicy)) !== canonical(desiredRole) || canonical(documentOf(readbackOperatorPolicy)) !== canonical(desiredOperator))) throw new Error("post-apply IAM readback differs from the exact desired state");
  console.log(JSON.stringify({ status: apply ? "applied-and-read-back" : "dry-run-passed", role: ROLE, rolePolicy: ROLE_POLICY, operatorPolicy: OPERATOR_POLICY, exactKeys: keys, accessAnalyzerBlockingFindings: 0, exactAllowChecks: 6, outOfScopeImplicitDenyChecks: 2, bucketPolicyControls: { conditionalCreateOnlyReleaseWrites: true, releaseDeleteDenied: true }, desired: { trustSha256: sha256(desiredTrust), rolePolicySha256: sha256(desiredRole), operatorPolicySha256: sha256(desiredOperator) }, changes: { createRole: !currentRole, putRolePolicy: !currentRolePolicy || canonical(documentOf(currentRolePolicy)) !== canonical(desiredRole), putOperatorPolicy: !currentOperatorPolicy || canonical(documentOf(currentOperatorPolicy)) !== canonical(desiredOperator) } }, null, 2));
} finally {
  rmSync(temp, { recursive: true, force: true });
}
