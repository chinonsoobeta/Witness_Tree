import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const CRITERIA = new Map([
  ["direct-database-tenant-isolation", "One account cannot read another account’s saved areas, proven by a test that attempts it directly against the database"],
  ["deletion-within-30-days", "Account deletion removes saved areas and personal data within 30 days, proven by a test"],
  ["kill-switch-under-five-minutes", "The kill switch stops all outbound alerts within 5 minutes"],
  ["evidence-carrying-alerts", "Every alert template carries its evidence class, data version, source agency and observation time"],
  ["correction-alerts-to-previous-recipients", "A correction to a published figure produces a correction alert to everyone previously notified"],
]);

function text(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required.`);
}

async function verifyEvidence(evidence) {
  if (!Array.isArray(evidence) || evidence.length === 0) throw new Error("Each Phase 6 criterion requires checksum-bound evidence.");
  for (const item of evidence) {
    text(item?.path, "Evidence path");
    if (!/^[a-f0-9]{64}$/.test(item?.sha256 ?? "")) throw new Error("Evidence SHA-256 is invalid.");
    const target = resolve(ROOT, item.path);
    if (relative(ROOT, target).startsWith("..")) throw new Error("Evidence must remain inside the repository.");
    const actual = createHash("sha256").update(await readFile(target)).digest("hex");
    if (actual !== item.sha256) throw new Error(`Evidence checksum does not match: ${item.path}.`);
  }
}

export async function validatePhase6AccountAlertExitStatus(record) {
  if (record?.schemaVersion !== "witness-tree/phase6-account-alert-exit-status/1" || record.phase !== 6) throw new Error("Phase 6 status must be a Version 2.1 record.");
  if (!Array.isArray(record.exitCriteria) || record.exitCriteria.length !== CRITERIA.size) throw new Error("Phase 6 requires exactly the five plan exit criteria.");
  const seen = new Set();
  let passed = 0;
  for (const criterion of record.exitCriteria) {
    if (!CRITERIA.has(criterion?.id) || seen.has(criterion.id) || criterion.title !== CRITERIA.get(criterion.id)) throw new Error("Phase 6 exit criteria must exactly match the plan.");
    if (criterion.status !== "pass" && criterion.status !== "fail") throw new Error("Each Phase 6 criterion must have an evidence-derived pass or fail status.");
    text(criterion.reason, `${criterion.id} reason`);
    await verifyEvidence(criterion.evidence);
    seen.add(criterion.id);
    if (criterion.status === "pass") passed += 1;
  }
  const percentage = passed / CRITERIA.size * 100;
  if (record.completedCriteria !== passed || record.totalCriteria !== CRITERIA.size || record.percentage !== percentage) throw new Error("Phase 6 completion must equal the unweighted formal exit-criterion result.");
  if (record.localImplementationStatus !== (passed === CRITERIA.size ? "complete" : "incomplete")) throw new Error("Phase 6 local implementation status must be derived from its formal exit criteria.");
  if (!Array.isArray(record.activationBlockers) || record.activationBlockers.length !== 3) throw new Error("Phase 6 must retain the three activation blockers.");
  const ids = record.activationBlockers.map((item) => item?.id).sort();
  if (ids.join(",") !== "canadian-managed-service-and-direct-rls,independent-live-rehearsal,privacy-security-legal-signoff") throw new Error("Phase 6 must retain exactly the Canadian-service, independent-rehearsal, and review blockers.");
  for (const blocker of record.activationBlockers) {
    if (blocker.status !== "blocked") throw new Error("Activation blockers must remain blocked without external evidence.");
    text(blocker.reason, `${blocker.id} reason`);
  }
  if (record.phaseComplete !== false) throw new Error("Local controls cannot claim Phase 6 complete while activation blockers remain.");
  text(record.localOnlyBoundary, "Local-only boundary");
  if (!/no real personal data|no outbound/i.test(record.localOnlyBoundary)) throw new Error("Phase 6 must preserve its no-real-personal-data and no-outbound boundary.");
  return record;
}

export async function checkPhase6AccountAlertExitStatus(file = new URL("../data/phase6-account-alert-exit-status.json", import.meta.url)) {
  return validatePhase6AccountAlertExitStatus(JSON.parse(await readFile(file, "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const record = await checkPhase6AccountAlertExitStatus();
  console.log(`Phase 6 formal exit status: ${record.completedCriteria}/${record.totalCriteria} (${record.percentage}%); service activation remains blocked.`);
}
