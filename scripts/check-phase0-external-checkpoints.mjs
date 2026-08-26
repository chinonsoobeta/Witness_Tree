import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const REQUIRED = ["id", "status", "evidenceAvailable", "purpose", "exactAction", "target", "expectedEffect", "costOrIrreversibility", "rollback", "evidenceChecked", "approvalLanguage", "productionDataAdmission"];
const STATUSES = new Set(["pending", "blocked", "complete"]);
const SENSITIVE = /\b(?:credential|password|secret|access[ _-]?key|mfa|totp|bearer)\b/i;

function requireText(value, field, id) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${id}: ${field} is required.`);
  if (SENSITIVE.test(value)) throw new Error(`${id}: ${field} must not contain credentials or MFA material.`);
}

function validateCheckpoint(checkpoint) {
  for (const field of REQUIRED) if (!(field in checkpoint)) throw new Error(`${checkpoint.id ?? "checkpoint"}: ${field} is required.`);
  requireText(checkpoint.id, "id", checkpoint.id);
  if (!STATUSES.has(checkpoint.status)) throw new Error(`${checkpoint.id}: status must be pending, blocked, or complete.`);
  if (typeof checkpoint.evidenceAvailable !== "boolean") throw new Error(`${checkpoint.id}: evidenceAvailable must be boolean.`);
  if (typeof checkpoint.productionDataAdmission !== "boolean" || checkpoint.productionDataAdmission) throw new Error(`${checkpoint.id}: external Phase 0 checkpoints cannot admit production data.`);
  for (const locale of ["en", "fr"]) requireText(checkpoint.purpose?.[locale], `purpose.${locale}`, checkpoint.id);
  for (const field of ["exactAction", "target", "expectedEffect", "costOrIrreversibility", "rollback", "evidenceChecked", "approvalLanguage"]) requireText(checkpoint[field], field, checkpoint.id);

  if (checkpoint.status === "complete") {
    if (!checkpoint.evidenceAvailable) throw new Error(`${checkpoint.id}: complete checkpoints require evidenceAvailable true.`);
    const artifact = checkpoint.primaryArtifact;
    if (!artifact || typeof artifact !== "object") throw new Error(`${checkpoint.id}: complete checkpoints require a primary artifact.`);
    for (const field of ["path", "sha256", "date", "approver"]) requireText(artifact[field], `primaryArtifact.${field}`, checkpoint.id);
    if (!/^[a-f0-9]{64}$/i.test(artifact.sha256)) throw new Error(`${checkpoint.id}: primary artifact requires a SHA-256.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(artifact.date)) throw new Error(`${checkpoint.id}: primary artifact requires an ISO date.`);
  } else if (checkpoint.evidenceAvailable || checkpoint.primaryArtifact) {
    throw new Error(`${checkpoint.id}: pending or blocked checkpoints must not claim completed evidence.`);
  }
}

export function validatePhase0ExternalCheckpoints(record) {
  if (record?.schemaVersion !== "phase0-external-checkpoints-v1") throw new Error("Unsupported Phase 0 external-checkpoint schema.");
  requireText(record.notice, "notice", "record");
  if (!Array.isArray(record.checkpoints) || record.checkpoints.length !== 10) throw new Error("The ten required Phase 0 external checkpoints are required.");
  const ids = new Set();
  for (const checkpoint of record.checkpoints) {
    validateCheckpoint(checkpoint);
    if (ids.has(checkpoint.id)) throw new Error(`Duplicate checkpoint: ${checkpoint.id}`);
    ids.add(checkpoint.id);
  }
  return Object.freeze(record);
}

export async function checkPhase0ExternalCheckpoints(root = process.cwd()) {
  const record = JSON.parse(await readFile(path.join(root, "data/phase0-external-checkpoints.json"), "utf8"));
  validatePhase0ExternalCheckpoints(record);
  const resolvedRoot = path.resolve(root);
  for (const checkpoint of record.checkpoints.filter((item) => item.status === "complete")) {
    const artifactPath = path.resolve(resolvedRoot, checkpoint.primaryArtifact.path);
    if (!artifactPath.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error(`${checkpoint.id}: primary artifact must remain inside the repository.`);
    const digest = createHash("sha256").update(await readFile(artifactPath)).digest("hex");
    if (digest !== checkpoint.primaryArtifact.sha256) throw new Error(`${checkpoint.id}: primary artifact checksum does not match.`);
  }
  return Object.freeze({ checkpoints: record.checkpoints.length });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await checkPhase0ExternalCheckpoints();
  console.log(`Phase 0 external-checkpoint gate passed for ${result.checkpoints} checkpoints.`);
}
