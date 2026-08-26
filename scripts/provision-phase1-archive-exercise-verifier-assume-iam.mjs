#!/usr/bin/env node
import { spawnSync } from "node:child_process";

export const ACCOUNT = "286853118812";
export const USER = "WitnessTreeArchiveOperator";
export const POLICY = "WitnessTreeArchiveOperatorAssumeOnly";
export const ROLES = [
  "WitnessTreeArchiveUploader",
  "WitnessTreeArchiveRetentionBreakGlass",
  "WitnessTreeArchiveVerifier",
];

const arns = (roles) => roles.map((role) => `arn:aws:iam::${ACCOUNT}:role/${role}`);
const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;
const same = (left, right) => JSON.stringify(stable(left)) === JSON.stringify(stable(right));
const documentOf = (envelope) => {
  let value = envelope?.PolicyDocument ?? envelope;
  if (typeof value === "string") value = JSON.parse(decodeURIComponent(value));
  if (!value || value.Version !== "2012-10-17" || !Array.isArray(value.Statement)) throw new Error("operator policy is malformed");
  return value;
};

export function policyFor(roles) {
  return {
    Version: "2012-10-17",
    Statement: [
      { Sid: "MfaSessionOnly", Effect: "Allow", Action: "sts:GetSessionToken", Resource: "*" },
      { Sid: "AssumeExactArchiveRoles", Effect: "Allow", Action: "sts:AssumeRole", Resource: arns(roles) },
    ],
  };
}

export async function provision({ aws, apply = false }) {
  const identity = await aws(["sts", "get-caller-identity"]);
  if (identity.Account !== ACCOUNT || identity.Arn !== `arn:aws:iam::${ACCOUNT}:root`) throw new Error("exact account root identity is required; no IAM mutation was attempted");
  const current = documentOf(await aws(["iam", "get-user-policy", "--user-name", USER, "--policy-name", POLICY]));
  const base = policyFor(ROLES.slice(0, 2));
  const desired = policyFor(ROLES);
  const change = same(current, desired) ? "already-present" : same(current, base) ? "add-verifier-role-only" : null;
  if (!change) throw new Error("live operator policy is not the exact preserved two-role policy or exact desired three-role policy; no IAM mutation was attempted");

  const validation = await aws(["accessanalyzer", "validate-policy", "--policy-document", JSON.stringify(desired), "--policy-type", "IDENTITY_POLICY"]);
  if (!Array.isArray(validation.findings) || validation.findings.some((finding) => ["ERROR", "SECURITY_WARNING"].includes(finding.findingType))) throw new Error("Access Analyzer reported a blocking finding; no IAM mutation was attempted");
  for (const resource of arns(ROLES)) {
    const simulation = await aws(["iam", "simulate-custom-policy", "--policy-input-list", JSON.stringify(desired), "--action-names", "sts:AssumeRole", "--resource-arns", resource]);
    if (simulation.EvaluationResults?.[0]?.EvalDecision !== "allowed") throw new Error("an exact archive role simulation was not allowed; no IAM mutation was attempted");
  }
  const outside = await aws(["iam", "simulate-custom-policy", "--policy-input-list", JSON.stringify(desired), "--action-names", "sts:AssumeRole", "--resource-arns", `arn:aws:iam::${ACCOUNT}:role/NotApproved`]);
  if (outside.EvaluationResults?.[0]?.EvalDecision !== "implicitDeny") throw new Error("out-of-scope role simulation was not implicitly denied; no IAM mutation was attempted");

  if (apply && change === "add-verifier-role-only") {
    const latest = documentOf(await aws(["iam", "get-user-policy", "--user-name", USER, "--policy-name", POLICY]));
    if (!same(latest, current)) throw new Error("operator policy changed during preflight; no IAM mutation was attempted");
    await aws(["iam", "put-user-policy", "--user-name", USER, "--policy-name", POLICY, "--policy-document", JSON.stringify(desired)]);
    const readback = documentOf(await aws(["iam", "get-user-policy", "--user-name", USER, "--policy-name", POLICY]));
    if (!same(readback, desired)) throw new Error("operator policy readback differs from the exact desired policy");
  }
  return { status: apply ? "applied-and-read-back" : "dry-run-passed", change, user: USER, policyName: POLICY, exactRoles: ROLES, outsideDecision: "implicitDeny" };
}

async function main() {
  if (process.argv.slice(2).some((argument) => argument !== "--apply")) throw new Error("Usage: provision-phase1-archive-exercise-verifier-assume-iam.mjs [--apply]");
  const aws = async (args) => {
    const result = spawnSync("aws", [...args, "--output", "json"], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
    if (result.status !== 0) throw new Error(`${args.slice(0, 2).join(" ")} failed; no IAM mutation was attempted`);
    return result.stdout.trim() ? JSON.parse(result.stdout) : {};
  };
  console.log(JSON.stringify(await provision({ aws, apply: process.argv.includes("--apply") }), null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => { console.error(`Stopped: ${error.message}`); process.exitCode = 1; });
