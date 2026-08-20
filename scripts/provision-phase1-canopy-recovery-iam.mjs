#!/usr/bin/env node
import crypto from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, isAbsolute } from "node:path";
import {
  desiredIamDelta,
  desiredRecoveryRetentionDelta,
  validateCanopyRecoveryRetentionProvisioningPolicy
} from "./check-phase1-canopy-completion-recovery.mjs";

const ACCOUNT = desiredRecoveryRetentionDelta.account;
const ROLE = desiredRecoveryRetentionDelta.role;
const OPERATOR_PROFILE = desiredRecoveryRetentionDelta.profile;
const POLICY_NAME = desiredRecoveryRetentionDelta.policyName;
const ROLE_ARN = `arn:aws:iam::${ACCOUNT}:role/${ROLE}`;
const DEFAULT_ATTESTATION = "/private/tmp/witness-tree-canopy-recovery-iam-attestation.json";
const OUT_OF_SCOPE_RESOURCE = "arn:aws:s3:::witness-tree-raw-recovery-ca-central-1/raw/not-approved/payload.zip";

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
const policyHash = (policy) => crypto.createHash("sha256").update(JSON.stringify(stable(policy))).digest("hex");
const equalJson = (left, right) => JSON.stringify(stable(left)) === JSON.stringify(stable(right));
const actions = (statement) => Array.isArray(statement?.Action) ? statement.Action : [statement?.Action].filter(Boolean);
const resources = (statement) => Array.isArray(statement?.Resource) ? statement.Resource : [statement?.Resource].filter(Boolean);

function parseArgs(argv) {
  let profile = "default";
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
      console.log("Usage: node scripts/provision-phase1-canopy-recovery-iam.mjs [--profile ADMIN_PROFILE] [--attestation /absolute/attestation.json] [--apply]");
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

function policyFromEnvelope(envelope) {
  let policy = envelope?.PolicyDocument ?? envelope;
  if (typeof policy === "string") {
    try { policy = JSON.parse(decodeURIComponent(policy)); }
    catch { fail("live inline policy document is malformed; no IAM mutation was attempted", 77); }
  }
  if (!policy || typeof policy !== "object" || !Array.isArray(policy.Statement)) fail("live inline policy is malformed; no IAM mutation was attempted", 77);
  return policy;
}

function exactAllow(policy, action, resource) {
  return policy.Statement.some((statement) => statement.Effect === "Allow" && actions(statement).includes(action) && resources(statement).includes(resource));
}

function recoveryRetentionStatement() {
  return {
    Sid: desiredRecoveryRetentionDelta.delta.sid,
    Effect: desiredRecoveryRetentionDelta.delta.effect,
    Action: [...desiredRecoveryRetentionDelta.delta.actions],
    Resource: [desiredRecoveryRetentionDelta.delta.resource]
  };
}

function buildCandidate(current) {
  const existing = current.Statement.filter((statement) => statement.Sid === desiredRecoveryRetentionDelta.delta.sid);
  if (existing.length > 1) fail("live policy has duplicate recovery-retention statements; no IAM mutation was attempted");
  const candidate = structuredClone(current);
  let change = "already-present";
  if (existing.length === 1) {
    if (!equalJson(existing[0], recoveryRetentionStatement())) fail("live recovery-retention statement is not exact; no IAM mutation was attempted");
  } else {
    if (desiredRecoveryRetentionDelta.delta.actions.every((action) => exactAllow(current, action, desiredRecoveryRetentionDelta.delta.resource))) {
      fail("live policy already grants recovery retention under another statement; no IAM mutation was attempted");
    }
    candidate.Statement.push(recoveryRetentionStatement());
    change = "append-recovery-retention-statement";
  }
  try { validateCanopyRecoveryRetentionProvisioningPolicy(candidate); }
  catch (error) { fail(`live policy is not the validated canopy base plus the exact retention delta (${error.message}); no IAM mutation was attempted`); }
  if (change === "append-recovery-retention-statement") {
    if (candidate.Statement.length !== current.Statement.length + 1) fail("proposed IAM change is not one additive statement; no IAM mutation was attempted");
    current.Statement.forEach((statement, index) => {
      if (!equalJson(statement, candidate.Statement[index])) fail("proposed IAM change does not preserve statement order and content; no IAM mutation was attempted");
    });
  } else if (!equalJson(current, candidate)) fail("an idempotent run would rewrite the live policy; no IAM mutation was attempted");
  return { candidate, change };
}

function getLivePolicy(profile) {
  const envelope = awsJson([
    "iam", "get-role-policy", "--profile", profile, "--role-name", ROLE,
    "--policy-name", POLICY_NAME, "--output", "json"
  ], "live inline policy read");
  if (envelope.RoleName !== ROLE || envelope.PolicyName !== POLICY_NAME) fail("live inline policy identity is not exact; no IAM mutation was attempted", 77);
  return policyFromEnvelope(envelope);
}

function verifyRootCaller(profile) {
  const identity = awsJson(["sts", "get-caller-identity", "--profile", profile, "--output", "json"], "administrator caller identity read");
  if (identity.Account !== ACCOUNT || identity.Arn !== `arn:aws:iam::${ACCOUNT}:root`) fail("provisioning requires the exact approved account root identity; no IAM mutation was attempted", 77);
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
  if (name.startsWith("exact-primary-retention")) return desiredIamDelta.requiredExistingRetention.resources[0];
  if (name === "exact-primary-versioned-read") return desiredIamDelta.delta.resources[0];
  if (name === "exact-recovery-versioned-read" || name.startsWith("exact-recovery-retention") || name === "delete-exact-recovery-payload") return desiredRecoveryRetentionDelta.delta.resource;
  if (name === "out-of-scope-retention-read") return OUT_OF_SCOPE_RESOURCE;
  fail("unknown simulation case; no IAM mutation was attempted");
}

function runSimulations(profile, candidate) {
  return desiredRecoveryRetentionDelta.simulations.map((expected) => {
    const result = rawAws([
      "iam", "simulate-principal-policy", "--profile", profile, "--policy-source-arn", ROLE_ARN,
      "--policy-input-list", JSON.stringify(candidate), "--action-names", expected.action,
      "--resource-arns", simulationResource(expected.case), "--context-entries",
      "ContextKeyName=aws:MultiFactorAuthPresent,ContextKeyValues=true,ContextKeyType=boolean",
      "ContextKeyName=aws:MultiFactorAuthAge,ContextKeyValues=100,ContextKeyType=numeric",
      "--output", "json"
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

function writeOwnerAttestation(path, attestation) {
  if (!isAbsolute(path)) fail("attestation path must be absolute; no IAM mutation was attempted");
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  try {
    const existing = lstatSync(path);
    if (!existing.isFile() || existing.isSymbolicLink() || existing.uid !== process.getuid() || (existing.mode & 0o777) !== 0o600) {
      fail("existing attestation must be a regular owner-owned mode-600 file; no IAM mutation was attempted");
    }
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
  const options = parseArgs(process.argv.slice(2));
  verifyRootCaller(options.profile);
  const live = getLivePolicy(options.profile);
  const basePolicySha256 = policyHash(live);
  const { candidate, change } = buildCandidate(live);
  const desiredPolicySha256 = policyHash(candidate);
  const tempDir = mkdtempSync("/private/tmp/witness-tree-canopy-iam-provisioning.");
  let analyzer;
  let simulations;
  try {
    const desiredPolicyPath = `${tempDir}/desired-policy.json`;
    writeFileSync(desiredPolicyPath, `${JSON.stringify(candidate, null, 2)}\n`, { mode: 0o600 });
    analyzer = accessAnalyzer(options.profile, desiredPolicyPath, options.apply);
    simulations = runSimulations(options.profile, candidate);
    if (options.apply && simulations.some(({ decision }) => decision === "unavailable")) fail("a required simulation was unavailable; --apply was refused and no IAM mutation was attempted", 77);
    if (options.apply) {
      const latest = getLivePolicy(options.profile);
      if (policyHash(latest) !== basePolicySha256) fail("live policy changed during preflight; no IAM mutation was attempted", 77);
      if (change === "append-recovery-retention-statement") {
        const put = rawAws([
          "iam", "put-role-policy", "--profile", options.profile, "--role-name", ROLE,
          "--policy-name", POLICY_NAME, "--policy-document", `file://${desiredPolicyPath}`
        ]);
        if (!put.ok) fail("IAM policy update failed; recovery remains blocked", 77);
      }
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
  let readbackPolicySha256 = null;
  if (options.apply) {
    readbackPolicySha256 = policyHash(getLivePolicy(options.profile));
    if (readbackPolicySha256 !== desiredPolicySha256) fail("IAM policy readback SHA does not match the exact desired SHA; recovery remains blocked", 77);
  }
  const attestation = {
    schemaVersion: "witness-tree/phase1-canopy-recovery-iam-attestation/1",
    status: options.apply ? "applied" : "planned",
    applied: options.apply,
    account: ACCOUNT,
    role: ROLE,
    profile: OPERATOR_PROFILE,
    region: desiredRecoveryRetentionDelta.region,
    policyName: POLICY_NAME,
    basePolicySha256,
    desiredPolicySha256,
    readbackPolicySha256,
    preservation: "passed",
    noCredentials: true,
    noObjectVersionIds: true,
    noUploadIds: true,
    delta: {
      sid: desiredRecoveryRetentionDelta.delta.sid,
      effect: desiredRecoveryRetentionDelta.delta.effect,
      actions: [...desiredRecoveryRetentionDelta.delta.actions],
      resource: desiredRecoveryRetentionDelta.delta.resource
    },
    accessAnalyzer: analyzer,
    simulations
  };
  writeOwnerAttestation(options.attestation, attestation);
  console.log(`${options.apply ? "Applied" : "Dry-run"} exact recovery-retention IAM provisioning (${change}); owner-only attestation written.`);
  console.log(`policy-sha256=${options.apply ? readbackPolicySha256 : desiredPolicySha256}`);
}

try { main(); }
catch (error) {
  console.error(`Stopped: ${error instanceof ProvisionError ? error.message : "unexpected provisioning failure; no IAM mutation was attempted"}`);
  process.exitCode = error instanceof ProvisionError ? error.exitCode : 70;
}
