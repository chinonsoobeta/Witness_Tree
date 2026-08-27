#!/usr/bin/env node
import crypto from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, isAbsolute, join } from "node:path";
import { tmpdir } from "node:os";
import {
  ACCOUNT,
  BUCKET_PREFIX,
  DESIRED,
  OPERATOR,
  OPERATOR_ARN,
  POLICY_NAME,
  ROLE,
  ROLE_ARN,
  validateDesiredState
} from "./check-wildfire-derived-readback-iam.mjs";

// /private/tmp is the owner's macOS device, where these runners actually execute
// and where the private workspace is intended. The fallback exists only so the
// tests can run where that path does not exist, such as a CI runner. It is
// chosen from the filesystem, never from an environment variable, so nothing an
// attacker sets can redirect a directory that briefly holds policy documents.
const privateTmp = (prefix) => mkdtempSync(existsSync("/private/tmp") ? `/private/tmp/${prefix}` : join(tmpdir(), prefix));

const PROFILE_DEFAULT = "default";
const OPERATOR_PROFILE = "WitnessTreeArchiveOperator";
const REGION = "ca-central-1";
const DEFAULT_ATTESTATION = "/private/tmp/witness-tree-wildfire-derived-readback-iam-attestation.json";
const OUT_OF_SCOPE_RESOURCE = `${BUCKET_PREFIX}derived/not-approved/payload.gpkg`;

class ProvisionError extends Error {
  constructor(message, exitCode = 65) {
    super(message);
    this.exitCode = exitCode;
  }
}

const fail = (message, exitCode = 65) => { throw new ProvisionError(message, exitCode); };
const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;
const equalJson = (left, right) => JSON.stringify(stable(left)) === JSON.stringify(stable(right));
const policyHash = (policy) => crypto.createHash("sha256").update(JSON.stringify(stable(policy))).digest("hex");
const actions = (statement) => Array.isArray(statement?.Action) ? statement.Action : [statement?.Action].filter(Boolean);
const resources = (statement) => Array.isArray(statement?.Resource) ? statement.Resource : [statement?.Resource].filter(Boolean);

function parseArgs(argv) {
  let profile = PROFILE_DEFAULT;
  let attestation = DEFAULT_ATTESTATION;
  let apply = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") apply = true;
    else if (argument === "--profile") {
      profile = argv[++index];
      if (!profile || /[\r\n\t ]/.test(profile)) fail("administrator profile is malformed");
    } else if (argument === "--attestation") {
      attestation = argv[++index];
      if (!attestation || !isAbsolute(attestation)) fail("attestation path must be absolute");
    } else if (argument === "--help") {
      console.log("Usage: node scripts/provision-wildfire-derived-readback-iam.mjs [--profile ADMIN_PROFILE] [--attestation /absolute/attestation.json] [--apply]");
      process.exit(0);
    } else fail(`unknown option ${argument}`);
  }
  if (profile === OPERATOR_PROFILE) fail("the promotion operator profile may not provision IAM");
  return { profile, attestation, apply };
}

function rawAws(args) {
  const result = spawnSync("aws", args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  return { ok: !result.error && result.status === 0, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function awsJson(args, label) {
  const result = rawAws(args);
  if (!result.ok) fail(`${label} failed; no IAM mutation was attempted`, 77);
  try { return JSON.parse(result.stdout); }
  catch { fail(`${label} returned malformed JSON; no IAM mutation was attempted`, 77); }
}

function documentOf(envelope) {
  let document = envelope?.PolicyDocument ?? envelope;
  if (typeof document === "string") {
    try { document = JSON.parse(decodeURIComponent(document)); }
    catch { fail("live IAM policy document is malformed; no IAM mutation was attempted", 77); }
  }
  if (!document || typeof document !== "object" || !Array.isArray(document.Statement)) fail("live IAM policy document is malformed; no IAM mutation was attempted", 77);
  return document;
}

function verifyRootCaller(profile) {
  const identity = awsJson(["sts", "get-caller-identity", "--profile", profile, "--output", "json"], "administrator caller identity read");
  if (identity.Account !== ACCOUNT || identity.Arn !== `arn:aws:iam::${ACCOUNT}:root`) fail("provisioning requires the exact approved account root identity; no IAM mutation was attempted", 77);
}

function readRole(profile) {
  const envelope = awsJson(["iam", "get-role", "--profile", profile, "--role-name", ROLE, "--output", "json"], "live role read");
  if (envelope.Role?.RoleName !== ROLE) fail("live role identity is not exact; no IAM mutation was attempted", 77);
  const trust = documentOf(envelope.Role.AssumeRolePolicyDocument);
  if (!equalJson(trust, DESIRED.trustPolicy)) fail("live role trust is not the exact MFA-gated operator trust; no IAM mutation was attempted", 77);
  return envelope.Role;
}

function getLivePolicy(profile) {
  const envelope = awsJson([
    "iam", "get-role-policy", "--profile", profile, "--role-name", ROLE,
    "--policy-name", POLICY_NAME, "--output", "json"
  ], "live inline policy read");
  if (envelope.RoleName !== ROLE || envelope.PolicyName !== POLICY_NAME) fail("live inline policy identity is not exact; no IAM mutation was attempted", 77);
  return documentOf(envelope.PolicyDocument);
}

function versionedReadbackStatement() {
  return structuredClone(DESIRED.requiredDelta);
}

function validateCandidate(candidate) {
  if (!equalJson(candidate, DESIRED.rolePolicy)) fail("live policy is not the exact preserved promotion policy plus versioned readback; no IAM mutation was attempted");
  for (const statement of candidate.Statement) {
    for (const resource of resources(statement)) if (resource.includes("*")) fail("candidate policy contains a wildcard resource; no IAM mutation was attempted");
    for (const action of actions(statement)) if (action.includes("*")) fail("candidate policy contains a wildcard action; no IAM mutation was attempted");
  }
  return candidate;
}

function buildCandidate(current) {
  const matches = current.Statement.filter((statement) => statement.Sid === DESIRED.requiredDelta.Sid);
  if (matches.length > 1) fail("live policy has duplicate versioned-readback statements; no IAM mutation was attempted");
  const candidate = structuredClone(current);
  let change = "already-present";
  if (matches.length === 1) {
    if (!equalJson(matches[0], versionedReadbackStatement())) fail("live versioned-readback statement is not exact; no IAM mutation was attempted");
  } else {
    const retentionIndex = current.Statement.findIndex(({ Sid }) => Sid === "ExactDerivedPayloadAndSidecarComplianceRetention");
    if (retentionIndex < 0) fail("live policy is missing the exact preserved payload-and-sidecar retention statement; no IAM mutation was attempted");
    candidate.Statement.splice(retentionIndex, 0, versionedReadbackStatement());
    change = "append-versioned-readback";
  }
  if (candidate.Statement.length !== current.Statement.length + (change === "already-present" ? 0 : 1)) fail("candidate policy is not one additive statement; no IAM mutation was attempted");
  const preserved = candidate.Statement.filter(({ Sid }) => Sid !== DESIRED.requiredDelta.Sid);
  const previouslyPresent = current.Statement.filter(({ Sid }) => Sid !== DESIRED.requiredDelta.Sid);
  if (!equalJson(preserved, previouslyPresent)) fail("candidate policy does not preserve existing statement order and content; no IAM mutation was attempted");
  validateCandidate(candidate);
  return { candidate, change };
}

function accessAnalyzer(profile, policyPath, applying) {
  const result = rawAws([
    "accessanalyzer", "validate-policy", "--profile", profile, "--policy-document", `file://${policyPath}`,
    "--policy-type", "IDENTITY_POLICY", "--output", "json"
  ]);
  if (!result.ok) {
    if (applying) fail("Access Analyzer was unavailable; --apply was refused and no IAM mutation was attempted", 77);
    return { status: "unavailable", findings: 0 };
  }
  let response;
  try { response = JSON.parse(result.stdout); }
  catch { fail("Access Analyzer returned malformed JSON; no IAM mutation was attempted", 77); }
  if (!Array.isArray(response.findings)) fail("Access Analyzer findings were malformed; no IAM mutation was attempted", 77);
  if (response.findings.length !== 0) fail(`Access Analyzer found ${response.findings.length} policy finding(s); no IAM mutation was attempted`);
  return { status: "passed", findings: 0 };
}

function simulationResource(name) {
  if (name === "exact-bc-versioned-read") return DESIRED.requiredDelta.Resource[0];
  if (name === "exact-bc-manifest-versioned-read") return DESIRED.requiredDelta.Resource[1];
  if (name === "exact-on-versioned-read") return DESIRED.requiredDelta.Resource[2];
  if (name === "exact-on-manifest-versioned-read") return DESIRED.requiredDelta.Resource[3];
  const retention = DESIRED.rolePolicy.Statement.find(({ Sid }) => Sid === "ExactDerivedPayloadAndSidecarComplianceRetention");
  if (!retention) fail("exact retention statement is absent; no IAM mutation was attempted");
  if (name === "exact-bc-retention-read") return retention.Resource[0];
  if (name === "exact-on-retention-read") return retention.Resource[2];
  if (name === "out-of-scope-versioned-read" || name === "delete-exact-bc") return name === "out-of-scope-versioned-read" ? OUT_OF_SCOPE_RESOURCE : DESIRED.requiredDelta.Resource[0];
  fail("unknown simulation case; no IAM mutation was attempted");
}

const SIMULATIONS = Object.freeze([
  { case: "exact-bc-versioned-read", action: "s3:GetObjectVersion", decision: "allowed" },
  { case: "exact-bc-manifest-versioned-read", action: "s3:GetObjectVersion", decision: "allowed" },
  { case: "exact-on-versioned-read", action: "s3:GetObjectVersion", decision: "allowed" },
  { case: "exact-on-manifest-versioned-read", action: "s3:GetObjectVersion", decision: "allowed" },
  { case: "exact-bc-retention-read", action: "s3:GetObjectRetention", decision: "allowed" },
  { case: "exact-on-retention-read", action: "s3:GetObjectRetention", decision: "allowed" },
  { case: "out-of-scope-versioned-read", action: "s3:GetObjectVersion", decision: "implicitDeny" },
  { case: "delete-exact-bc", action: "s3:DeleteObject", decision: "implicitDeny" }
]);

function runSimulations(profile, candidate) {
  return SIMULATIONS.map((expected) => {
    const result = rawAws([
      "iam", "simulate-principal-policy", "--profile", profile, "--policy-source-arn", ROLE_ARN,
      "--policy-input-list", JSON.stringify(candidate), "--action-names", expected.action,
      "--resource-arns", simulationResource(expected.case), "--output", "json"
    ]);
    if (!result.ok) return { ...expected, decision: "unavailable" };
    let response;
    try { response = JSON.parse(result.stdout); }
    catch { fail(`simulation ${expected.case} returned malformed JSON; no IAM mutation was attempted`, 77); }
    const decision = response.EvaluationResults?.[0]?.EvalDecision;
    if (decision !== expected.decision) fail(`simulation ${expected.case} returned ${decision ?? "no decision"}; no IAM mutation was attempted`);
    return { ...expected, decision };
  });
}

function putPolicy(profile, policyPath) {
  const result = rawAws([
    "iam", "put-role-policy", "--profile", profile, "--role-name", ROLE,
    "--policy-name", POLICY_NAME, "--policy-document", `file://${policyPath}`
  ]);
  if (!result.ok) fail("IAM policy update failed; no further IAM mutation was attempted", 77);
}

function writeOwnerAttestation(path, attestation) {
  if (!isAbsolute(path)) fail("attestation path must be absolute; no IAM mutation was attempted");
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  try {
    const existing = lstatSync(path);
    if (!existing.isFile() || existing.isSymbolicLink() || existing.uid !== process.getuid() || (existing.mode & 0o777) !== 0o600) fail("existing attestation must be a regular owner-owned mode-600 file; no IAM mutation was attempted");
  } catch (error) {
    if (error instanceof ProvisionError) throw error;
    if (error.code !== "ENOENT") fail("attestation path could not be inspected; no IAM mutation was attempted", 69);
  }
  const temporary = `${path}.tmp-${process.pid}`;
  try {
    writeFileSync(temporary, `${JSON.stringify(attestation, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    chmodSync(temporary, 0o600);
    const created = statSync(temporary);
    if (created.uid !== process.getuid() || (created.mode & 0o777) !== 0o600) fail("temporary attestation is not owner-owned mode 600", 69);
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function main() {
  validateDesiredState();
  const options = parseArgs(process.argv.slice(2));
  verifyRootCaller(options.profile);
  readRole(options.profile);
  const current = getLivePolicy(options.profile);
  const basePolicySha256 = policyHash(current);
  const { candidate, change } = buildCandidate(current);
  const desiredPolicySha256 = policyHash(candidate);
  const tempDir = privateTmp("witness-tree-derived-iam-provisioning.");
  let analyzer;
  let simulations;
  let readbackPolicySha256 = null;
  try {
    const policyPath = `${tempDir}/desired-policy.json`;
    writeFileSync(policyPath, `${JSON.stringify(candidate, null, 2)}\n`, { mode: 0o600 });
    analyzer = accessAnalyzer(options.profile, policyPath, options.apply);
    simulations = runSimulations(options.profile, candidate);
    if (options.apply && simulations.some(({ decision }) => decision === "unavailable")) fail("a required simulation was unavailable; --apply was refused and no IAM mutation was attempted", 77);
    if (options.apply) {
      readRole(options.profile);
      const latest = getLivePolicy(options.profile);
      if (policyHash(latest) !== basePolicySha256) fail("live policy changed during preflight; no IAM mutation was attempted", 77);
      if (change === "append-versioned-readback") putPolicy(options.profile, policyPath);
      const readback = getLivePolicy(options.profile);
      readbackPolicySha256 = policyHash(readback);
      if (readbackPolicySha256 !== desiredPolicySha256) fail("post-apply policy SHA does not match the exact desired SHA; no further IAM mutation was attempted", 77);
      validateCandidate(readback);
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
  const attestation = {
    schemaVersion: "witness-tree/wildfire-derived-readback-iam-attestation/1",
    status: options.apply ? "applied" : "planned",
    applied: options.apply,
    account: ACCOUNT,
    role: ROLE,
    policyName: POLICY_NAME,
    profile: options.profile,
    region: REGION,
    basePolicySha256,
    desiredPolicySha256,
    readbackPolicySha256,
    change,
    preservation: "passed",
    noCredentials: true,
    noObjectVersionIds: true,
    noUploadIds: true,
    operatorUser: OPERATOR,
    operatorArn: OPERATOR_ARN,
    delta: structuredClone(DESIRED.requiredDelta),
    accessAnalyzer: analyzer,
    simulations
  };
  writeOwnerAttestation(options.attestation, attestation);
  console.log(`${options.apply ? "Applied" : "Dry-run"} exact derived versioned-readback IAM delta (${change}); owner-only attestation written.`);
}

try { main(); }
catch (error) {
  console.error(`Stopped: ${error instanceof ProvisionError ? error.message : "unexpected provisioning failure; no IAM mutation was attempted"}`);
  process.exitCode = error instanceof ProvisionError ? error.exitCode : 70;
}
