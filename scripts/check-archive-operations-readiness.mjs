import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CONTROL_IDS = new Set(["dedicated-identity", "access-logging", "lifecycle", "legal-hold", "recovery-and-replication"]);
const DECISION_STATES = {
  recoveryCopy: new Set(["unapproved", "approved"]),
  replication: new Set(["not-configured", "approved-canadian"]),
};

function requiredString(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
}

function assertEvidence(evidence, field) {
  if (!Array.isArray(evidence)) throw new Error(`${field} must be an array.`);
  for (const item of evidence) {
    if (!item || typeof item !== "object") throw new Error(`${field} must contain evidence objects.`);
    for (const key of ["kind", "capturedAt", "reference", "reviewerRole"]) requiredString(item[key], `${field}.${key}`);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(item.capturedAt) || Number.isNaN(Date.parse(item.capturedAt))) throw new Error(`${field}.capturedAt must be a UTC instant.`);
  }
}

function assertDecision(decision, name) {
  if (!decision || typeof decision !== "object" || !DECISION_STATES[name].has(decision.state)) throw new Error(`${name} decision state is invalid.`);
  requiredString(decision.ownerRole, `${name} owner role`);
  requiredString(decision.reason, `${name} reason`);
}

export function validateArchiveOperationsReadiness(record) {
  if (!record || typeof record !== "object") throw new Error("Archive operations record is required.");
  if (record.schemaVersion !== 1) throw new Error("Archive operations schemaVersion must be 1.");
  if (!["blocked", "ready"].includes(record.status)) throw new Error("Archive operations status must be blocked or ready.");
  if (record.productionEligible !== false) throw new Error("This control record must remain production ineligible.");
  requiredString(record.notice, "Notice");
  if (!record.archive || !["empty-non-production", "configured-no-objects"].includes(record.archive.resourceState)) throw new Error("Archive resource state must be explicit and non-production.");
  requiredString(record.archive.provider, "Archive provider");
  requiredString(record.archive.region, "Archive region");
  if (!record.decisions || typeof record.decisions !== "object") throw new Error("Archive decisions are required.");
  assertDecision(record.decisions.recoveryCopy, "recoveryCopy");
  assertDecision(record.decisions.replication, "replication");
  if (!Array.isArray(record.controls) || record.controls.length !== CONTROL_IDS.size) throw new Error("Every archive operations control is required.");

  const ids = new Set();
  let allEvidenced = true;
  for (const control of record.controls) {
    if (!control || typeof control !== "object" || !CONTROL_IDS.has(control.id) || ids.has(control.id)) throw new Error("Archive control ids must be unique and recognized.");
    ids.add(control.id);
    if (!["missing", "evidenced"].includes(control.state)) throw new Error(`${control.id} control state is invalid.`);
    requiredString(control.ownerRole, `${control.id} owner role`);
    if (!Array.isArray(control.requiredEvidence) || control.requiredEvidence.length === 0) throw new Error(`${control.id} required evidence is required.`);
    for (const requirement of control.requiredEvidence) requiredString(requirement, `${control.id} required evidence`);
    assertEvidence(control.evidence, `${control.id} evidence`);
    if (control.state === "missing" && control.evidence.length !== 0) throw new Error(`${control.id} cannot carry evidence while marked missing.`);
    if (control.state === "evidenced" && control.evidence.length < control.requiredEvidence.length) throw new Error(`${control.id} needs evidence for every required control.`);
    allEvidenced &&= control.state === "evidenced";
  }

  const ready = allEvidenced && record.decisions.recoveryCopy.state === "approved" && record.decisions.replication.state === "approved-canadian";
  if (record.status === "ready") {
    if (!ready || record.archive.resourceState !== "configured-no-objects") throw new Error("Archive operations may claim readiness only after every decision and control has independent evidence.");
  } else if (ready) {
    throw new Error("Fully evidenced archive operations must explicitly choose ready status; no implicit readiness.");
  }
  return record;
}

export async function checkArchiveOperationsReadiness(file = new URL("../data/archive-operations-readiness.json", import.meta.url)) {
  return validateArchiveOperationsReadiness(JSON.parse(await readFile(file, "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2] ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/archive-operations-readiness.json");
  const record = await checkArchiveOperationsReadiness(file);
  console.log(`Archive operations readiness record is ${record.status}; production eligibility is ${record.productionEligible}.`);
}
