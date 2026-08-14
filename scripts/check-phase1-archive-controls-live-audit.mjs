import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const IDS = new Set(["dedicated-identity", "access-logging", "lifecycle", "legal-hold", "recovery-and-replication"]);

export function validatePhase1ArchiveControlsLiveAudit(record) {
  if (!record || record.schemaVersion !== 1 || record.status !== "blocked" || record.productionEligible !== false) throw new Error("Live archive audit must remain schema-versioned, blocked, and non-production.");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(record.capturedAt) || !record.scope || !record.identity) throw new Error("Live audit requires capture time, scope, and redacted identity.");
  if (JSON.stringify(record).match(/\b\d{12}\b/)) throw new Error("Live audit must not store an AWS account identifier.");
  for (const key of ["bucketPolicy", "serverAccessLogging", "cloudTrailTrails", "cloudTrailEventDataStores", "awsConfigRecorder", "lifecycle", "replication", "inventory", "iamUsers", "dedicatedUploaderOrBreakGlassRole", "customerManagedPolicies", "legalHoldSample"]) if (record.observed?.[key] !== "absent" && record.observed?.[key] !== "not-configured") throw new Error(`Observed absence must remain explicit for ${key}.`);
  if (!Array.isArray(record.remediation) || record.remediation.length !== IDS.size || new Set(record.remediation.map((item) => item.id)).size !== IDS.size) throw new Error("Every approval-gated remediation control is required.");
  for (const item of record.remediation) if (!IDS.has(item.id) || item.approvalRequired !== true || typeof item.change !== "string" || !item.change.trim()) throw new Error("Remediation must be explicit and require approval.");
  return record;
}

export async function checkPhase1ArchiveControlsLiveAudit(file = new URL("../data/phase1-archive-controls-live-audit.json", import.meta.url)) { return validatePhase1ArchiveControlsLiveAudit(JSON.parse(await readFile(file, "utf8"))); }

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2] ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/phase1-archive-controls-live-audit.json");
  checkPhase1ArchiveControlsLiveAudit(file).then(() => console.log("Phase 1 live archive-control audit is blocked and every remediation requires approval."));
}
