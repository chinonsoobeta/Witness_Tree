#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { loadQcFourthInventoryPromotionPreparation, qcFourthInventoryIamBatches } from "./check-qc-fourth-inventory-immutable-promotion.mjs";

export const ACCOUNT = "286853118812";
export const ROLE = "WitnessTreeQcFourthArchivePromotionUploader";
export const POLICY = "WitnessTreeQcFourthArchiveExactObjectsBatchOne";
export const ROLE_TWO = "WitnessTreeQcFourthArchivePromotionUploaderBatchTwo";
export const POLICY_TWO = "WitnessTreeQcFourthArchiveExactObjectsBatchTwo";
export const OPERATOR = `arn:aws:iam::${ACCOUNT}:user/WitnessTreeArchiveOperator`;
export const OPERATOR_POLICY = "WitnessTreeQcFourthArchivePromotionAssumeRole";
export const MAX_SESSION_SECONDS = 43200;
const stable = (v) => Array.isArray(v) ? v.map(stable) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])])) : v;
const same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
const absent = (e) => e?.code === "NoSuchEntity" || /NoSuchEntity|not found/i.test(e?.message ?? "");
const arn = (role) => `arn:aws:iam::${ACCOUNT}:role/${role}`;
const documentOf = (e, label) => { let v = e?.PolicyDocument ?? e?.AssumeRolePolicyDocument ?? e; if (typeof v === "string") try { v = JSON.parse(decodeURIComponent(v)); } catch { throw new Error(`${label} is malformed`); } if (!v || v.Version !== "2012-10-17" || !Array.isArray(v.Statement)) throw new Error(`${label} is malformed`); return v; };
export function trustPolicy() { return { Version: "2012-10-17", Statement: [{ Sid: "AllowOnlyMfaGatedArchiveOperator", Effect: "Allow", Principal: { AWS: OPERATOR }, Action: "sts:AssumeRole", Condition: { Bool: { "aws:MultiFactorAuthPresent": "true" } } }] }; }
export function operatorPolicy() { return { Version: "2012-10-17", Statement: [{ Sid: "AssumeOnlyQcFourthArchivePromotionRolesWithMfa", Effect: "Allow", Action: "sts:AssumeRole", Resource: [arn(ROLE), arn(ROLE_TWO)], Condition: { Bool: { "aws:MultiFactorAuthPresent": "true" } } }] }; }
export function policies() {
  const plan = loadQcFourthInventoryPromotionPreparation(); const batches = qcFourthInventoryIamBatches(plan);
  return batches.map((b, i) => ({ ...b, role: b.roleName, policy: { Version: "2012-10-17", Statement: [{ Sid: `ExactPromotionObjectsBatch${i + 1}Only`, Effect: "Allow", Action: ["s3:PutObject", "s3:GetObjectVersion", "s3:GetObjectRetention", "s3:PutObjectRetention", "s3:ListMultipartUploadParts"], Resource: b.resources }] } }));
}
function legacyMfaPolicy(policy, includeAge = false) {
  const copy = structuredClone(policy);
  copy.Statement[0].Sid = copy.Statement[0].Sid.replace("ExactPromotion", "ExactMfaGatedPromotion");
  copy.Statement[0].Condition = { Bool: { "aws:MultiFactorAuthPresent": "true" } };
  if (includeAge) copy.Statement[0].Condition.NumericLessThan = { "aws:MultiFactorAuthAge": "43200" };
  return copy;
}
async function get(aws, b) { let role, roleAbsent = false, policy, policyAbsent = false; try { role = (await aws(["iam", "get-role", "--role-name", b.role])).Role; } catch (e) { if (absent(e)) roleAbsent = true; else throw e; } if (!roleAbsent) try { policy = documentOf(await aws(["iam", "get-role-policy", "--role-name", b.role, "--policy-name", b.policyName]), `${b.id} policy`); } catch (e) { if (absent(e)) policyAbsent = true; else throw e; } return { role, roleAbsent, policy, policyAbsent }; }
export async function provision({ aws, apply = false }) {
  const batches = policies(); const identity = await aws(["sts", "get-caller-identity"]); if (identity.Account !== ACCOUNT || identity.Arn !== `arn:aws:iam::${ACCOUNT}:root`) throw new Error("exact account root identity is required; no IAM mutation was attempted");
  const states = []; for (const b of batches) states.push(await get(aws, b));
  let user, userAbsent = false; try { user = documentOf(await aws(["iam", "get-user-policy", "--user-name", "WitnessTreeArchiveOperator", "--policy-name", OPERATOR_POLICY]), "operator policy"); } catch (e) { if (absent(e)) userAbsent = true; else throw e; }
  const removeUnsupportedMfa = batches.map((b, i) => !states[i].policyAbsent && (same(states[i].policy, legacyMfaPolicy(b.policy)) || same(states[i].policy, legacyMfaPolicy(b.policy, true))));
  for (let i = 0; i < batches.length; i += 1) { const s = states[i], b = batches[i]; if (!s.roleAbsent && (!same(documentOf(s.role.AssumeRolePolicyDocument, `${b.id} trust`), trustPolicy()) || s.role.MaxSessionDuration !== MAX_SESSION_SECONDS || (!s.policyAbsent && !same(s.policy, b.policy) && !removeUnsupportedMfa[i]))) throw new Error(`existing ${b.id} IAM state differs; no IAM mutation was attempted`); }
  if (!userAbsent && !same(user, operatorPolicy())) throw new Error("existing operator policy differs; no IAM mutation was attempted");
  for (const b of batches) { const check = await aws(["accessanalyzer", "validate-policy", "--policy-document", JSON.stringify(b.policy), "--policy-type", "IDENTITY_POLICY"]); if (!Array.isArray(check.findings) || check.findings.some((f) => ["ERROR", "SECURITY_WARNING"].includes(f.findingType))) throw new Error(`Access Analyzer blocked ${b.id}; no IAM mutation was attempted`); const good = await aws(["iam", "simulate-custom-policy", "--policy-input-list", JSON.stringify(b.policy), "--action-names", "s3:PutObject", "s3:GetObjectVersion", "s3:GetObjectRetention", "s3:PutObjectRetention", "s3:ListMultipartUploadParts", "--resource-arns", b.resources[0]]); if (!good.EvaluationResults?.every((r) => r.EvalDecision === "allowed")) throw new Error(`${b.id} exact simulations were not allowed; no IAM mutation was attempted`); }
  if (apply) {
    // Changes are intentionally ordered and independently read back. A failure can leave only earlier listed artifacts created.
    for (let i = 0; i < batches.length; i += 1) { const b = batches[i], before = states[i], now = await get(aws, b); if (now.roleAbsent !== before.roleAbsent || now.policyAbsent !== before.policyAbsent || (!now.roleAbsent && (!same(documentOf(now.role.AssumeRolePolicyDocument, "latest trust"), documentOf(before.role.AssumeRolePolicyDocument, "base trust")) || !same(now.policy, before.policy)))) throw new Error(`${b.id} changed during preflight; no IAM mutation was attempted`); if (now.roleAbsent) await aws(["iam", "create-role", "--role-name", b.role, "--assume-role-policy-document", JSON.stringify(trustPolicy()), "--max-session-duration", String(MAX_SESSION_SECONDS)]); if (now.roleAbsent || now.policyAbsent || removeUnsupportedMfa[i]) await aws(["iam", "put-role-policy", "--role-name", b.role, "--policy-name", b.policyName, "--policy-document", JSON.stringify(b.policy)]); }
    if (userAbsent) await aws(["iam", "put-user-policy", "--user-name", "WitnessTreeArchiveOperator", "--policy-name", OPERATOR_POLICY, "--policy-document", JSON.stringify(operatorPolicy())]);
    for (const b of batches) { const read = await get(aws, b); if (read.roleAbsent || read.policyAbsent || !same(read.policy, b.policy) || !same(documentOf(read.role.AssumeRolePolicyDocument, "readback trust"), trustPolicy())) throw new Error(`${b.id} IAM readback differs from desired state`); }
  }
  return { status: apply ? "applied-and-read-back" : "dry-run-passed", roles: batches.map((b, i) => ({ role: b.role, policyName: b.policyName, exactObjectCount: b.resources.length, changes: { createRole: states[i].roleAbsent, putRolePolicy: states[i].roleAbsent || states[i].policyAbsent || removeUnsupportedMfa[i], removeUnsupportedRolePolicyMfaCondition: removeUnsupportedMfa[i] } })), operatorPolicyName: OPERATOR_POLICY, changesMayBePartialIfApplyFails: apply, accessAnalyzerBlockingFindings: 0, mfaEnforcement: "assume-role trust and operator policy", outOfScopeDecision: "implicitDeny" };
}
async function main() { if (process.argv.slice(2).some((a) => a !== "--apply")) throw new Error("Usage: provision-qc-fourth-inventory-iam.mjs [--apply]"); const completedMutations = []; const aws = async (args) => { const r = spawnSync("aws", [...args, "--output", "json"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }); if (r.status !== 0) { const e = new Error(`${args.slice(0, 2).join(" ")} failed; completed IAM mutations before this failure: ${completedMutations.length ? completedMutations.join(", ") : "none"}`); e.code = /NoSuchEntity/.test(r.stderr ?? "") ? "NoSuchEntity" : undefined; throw e; } if (["create-role", "put-role-policy", "put-user-policy"].includes(args[1])) completedMutations.push(`${args[1]}:${args[args.indexOf("--role-name") + 1] ?? args[args.indexOf("--user-name") + 1]}`); return r.stdout.trim() ? JSON.parse(r.stdout) : {}; }; console.log(JSON.stringify(await provision({ aws, apply: process.argv.includes("--apply") }), null, 2)); }
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(`Stopped: ${e.message}`); process.exitCode = 1; });
