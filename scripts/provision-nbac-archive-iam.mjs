import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DELTA = JSON.parse(readFileSync(new URL("../data/nbac-archive-iam-delta.json", import.meta.url), "utf8"));
const BASELINE = JSON.parse(readFileSync(new URL("../tests/fixtures/nbac-archive-iam-baseline.json", import.meta.url), "utf8"));
const APPLIED_SHA256 = "154b9d3f3b68b6721d41a3778a9c7e3f6ada504c99d71a8b197d9e7765bf2c7b";
const PAYLOAD_ARN = "arn:aws:s3:::witness-tree-raw-archive-ca-central-1/raw/nrcan-nbac-1972-2025/20260513/2026-08-27T18-17-41Z/c42740eb9d2fe3991a27344d0c33927705ec3e78c277efc5311b502439cb2165/payload/nbac_1972to2025_20260513_shp.zip";
const MANIFEST_ARN = "arn:aws:s3:::witness-tree-raw-archive-ca-central-1/raw/nrcan-nbac-1972-2025/20260513/2026-08-27T18-17-41Z/c42740eb9d2fe3991a27344d0c33927705ec3e78c277efc5311b502439cb2165/manifest.json";
const EXACT_STATEMENTS = [
  { Sid: "NbacExactApprovedObjectWrites", Effect: "Allow", Action: ["s3:PutObject", "s3:GetObject", "s3:GetObjectVersion", "s3:AbortMultipartUpload", "s3:ListMultipartUploadParts"], Resource: [PAYLOAD_ARN, MANIFEST_ARN] },
  { Sid: "NbacPayloadAndManifestComplianceRetention", Effect: "Allow", Action: ["s3:PutObjectRetention", "s3:GetObjectRetention"], Resource: [PAYLOAD_ARN, MANIFEST_ARN] },
];
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value && typeof value === "object" ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}` : JSON.stringify(value);
const digest = (value) => createHash("sha256").update(canonical(value)).digest("hex");

export function validateNbacArchiveIamDelta(delta) {
  assert.equal(delta.schemaVersion, "witness-tree/nbac-archive-iam-delta/1");
  assert.equal(delta.status, "approved-exact-delta-source");
  assert.equal(delta.accountId, "286853118812");
  assert.equal(delta.roleName, "WitnessTreeArchivePromotionUploader");
  assert.equal(delta.policyName, "ExactApprovedPromotionOnly");
  assert.equal(delta.expectedCurrentPolicyCanonicalSha256, digest(BASELINE));
  assert.deepEqual(delta.statements, EXACT_STATEMENTS);
  assert.deepEqual(delta.prohibitedActions, ["s3:DeleteObject", "s3:DeleteObjectVersion", "s3:BypassGovernanceRetention", "iam:*", "s3:PutBucket*", "s3:DeleteBucket*"]);
  assert.deepEqual(delta.claims, { applied: false, archiveObjectWritten: false, productionAdmission: false });
  return delta;
}

function aws(args) {
  const result = spawnSync("aws", [...args, "--output", "json"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`AWS ${args.slice(0, 2).join(" ")} failed: ${(result.stderr ?? "").trim()}`);
  return result.stdout.trim() ? JSON.parse(result.stdout) : {};
}

export function desiredPolicy(current, delta = DELTA) {
  validateNbacArchiveIamDelta(delta);
  assert.equal(digest(current), delta.expectedCurrentPolicyCanonicalSha256, "Current role policy differs from the approved baseline; no mutation allowed.");
  const existing = new Set(current.Statement.map(({ Sid }) => Sid));
  for (const statement of delta.statements) assert.equal(existing.has(statement.Sid), false, `${statement.Sid} already exists; use a version-specific audit.`);
  return { ...current, Statement: [...current.Statement, ...delta.statements] };
}

export function expectedAppliedPolicy(delta = DELTA) {
  validateNbacArchiveIamDelta(delta);
  const desired = desiredPolicy(BASELINE, delta);
  assert.equal(digest(desired), APPLIED_SHA256);
  return desired;
}

export { APPLIED_SHA256, digest };

export function provision({ apply = false, invoke = aws } = {}) {
  validateNbacArchiveIamDelta(DELTA);
  const identity = invoke(["sts", "get-caller-identity"]);
  assert.equal(identity.Account, DELTA.accountId, "AWS account differs; no mutation allowed.");
  if (apply) assert.equal(identity.Arn, `arn:aws:iam::${DELTA.accountId}:root`, "IAM application requires the exact account administrator identity.");
  const before = invoke(["iam", "get-role-policy", "--role-name", DELTA.roleName, "--policy-name", DELTA.policyName]).PolicyDocument;
  if (digest(before) === APPLIED_SHA256) return { status: "already-applied-exact-readback", appliedPolicyCanonicalSha256: APPLIED_SHA256, applied: true };
  const desired = desiredPolicy(before);
  if (!apply) return { status: "preflight-passed", currentPolicyCanonicalSha256: digest(before), desiredPolicyCanonicalSha256: digest(desired), applied: false };
  invoke(["iam", "put-role-policy", "--role-name", DELTA.roleName, "--policy-name", DELTA.policyName, "--policy-document", JSON.stringify(desired)]);
  const after = invoke(["iam", "get-role-policy", "--role-name", DELTA.roleName, "--policy-name", DELTA.policyName]).PolicyDocument;
  assert.equal(digest(after), digest(desired), "Applied NBAC role policy differs from the exact desired policy.");
  return { status: "applied-and-read-back", currentPolicyCanonicalSha256: digest(before), desiredPolicyCanonicalSha256: digest(desired), appliedPolicyCanonicalSha256: digest(after), applied: true };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--apply")) throw new Error("Usage: node scripts/provision-nbac-archive-iam.mjs [--apply]");
  console.log(JSON.stringify(provision({ apply: args.includes("--apply") }), null, 2));
}
