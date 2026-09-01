import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { relative, resolve } from "node:path";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const RUN_HISTORY_PATH = new URL("../data/wildfire-refresh-run-history-2026-08-31.json", import.meta.url);
const RUN_HISTORY_EVIDENCE_PATH = "data/wildfire-refresh-run-history-2026-08-31.json";
const CRITERIA = new Map([
  ["pacific-dst-schedule", "The scheduled job runs exactly four times daily in both halves of the year, verified across a daylight saving transition"],
  ["five-required-display-fields", "Both public routes retain the five required safety display fields and block deployment if one is absent"],
  ["stale-25-hour-safe-state", "At 25 hours without a successful refresh, the static route shows unavailable guidance and an agency link"],
  ["simulated-season-history", "A full simulated season of immutable snapshots is retained and queryable by bounded time range"],
]);

function text(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required.`);
}

async function verifyEvidence(evidence) {
  if (!Array.isArray(evidence) || evidence.length === 0) throw new Error("Each Phase 5 criterion requires checksum-bound local evidence.");
  for (const item of evidence) {
    text(item?.path, "Evidence path");
    if (!/^[a-f0-9]{64}$/.test(item?.sha256 ?? "")) throw new Error("Evidence SHA-256 is invalid.");
    const target = resolve(ROOT, item.path);
    if (relative(ROOT, target).startsWith("..")) throw new Error("Evidence must remain inside the repository.");
    const actual = createHash("sha256").update(await readFile(target)).digest("hex");
    if (actual !== item.sha256) throw new Error(`Evidence checksum does not match: ${item.path}.`);
  }
}

export async function validatePhase5LiveWildfireExitStatus(record) {
  if (record?.schemaVersion !== "witness-tree/phase5-live-wildfire-exit-status/1" || record.phase !== 5) throw new Error("Phase 5 status must be a Version 2.1 record.");
  if (!Array.isArray(record.exitCriteria) || record.exitCriteria.length !== CRITERIA.size) throw new Error("Phase 5 requires exactly the four local exit criteria.");
  const seen = new Set();
  let passed = 0;
  for (const criterion of record.exitCriteria) {
    if (!CRITERIA.has(criterion?.id) || seen.has(criterion.id) || criterion.title !== CRITERIA.get(criterion.id)) throw new Error("Phase 5 exit criteria must exactly match the local implementation contract.");
    if (criterion.status !== "pass" && criterion.status !== "fail") throw new Error("Each Phase 5 criterion must have an evidence-derived pass or fail status.");
    text(criterion.reason, `${criterion.id} reason`);
    await verifyEvidence(criterion.evidence);
    seen.add(criterion.id);
    if (criterion.status === "pass") passed += 1;
  }
  const scheduledJob = record.exitCriteria.find(({ id }) => id === "pacific-dst-schedule");
  if (!scheduledJob.evidence.some(({ path }) => path === RUN_HISTORY_EVIDENCE_PATH)) throw new Error("The scheduled-job criterion must cite the dated workflow run history.");
  const runHistory = JSON.parse(await readFile(RUN_HISTORY_PATH, "utf8"));
  const realRefreshSuccesses = runHistory?.classifications?.realRefreshSuccesses?.count;
  if (!Number.isInteger(realRefreshSuccesses) || realRefreshSuccesses < 0) throw new Error("The workflow run history must report a non-negative real-refresh success count.");
  if (realRefreshSuccesses === 0 && scheduledJob.status !== "fail") throw new Error("The scheduled-job criterion cannot pass with zero observed real refresh successes.");
  const percentage = passed / CRITERIA.size * 100;
  if (record.completedCriteria !== passed || record.totalCriteria !== CRITERIA.size || record.percentage !== percentage) throw new Error("Phase 5 percentage must equal the unweighted formal exit-criterion result.");
  if (record.localImplementationStatus !== (passed === CRITERIA.size ? "complete" : "incomplete")) throw new Error("Local implementation status must be derived from the four criteria.");
  if (!Array.isArray(record.productionBlockers) || record.productionBlockers.length !== 2) throw new Error("Phase 5 must retain cleared-feed and operations-rehearsal blockers separately.");
  const ids = record.productionBlockers.map((item) => item?.id).sort();
  if (ids.join(",") !== "cleared-feeds,operations-rehearsal") throw new Error("Phase 5 must retain exactly the cleared-feed and operations-rehearsal blockers.");
  for (const blocker of record.productionBlockers) {
    if (blocker.status !== "blocked") throw new Error("Production blockers must remain blocked until external evidence exists.");
    text(blocker.reason, `${blocker.id} reason`);
  }
  if (record.phaseComplete !== false) throw new Error("Local controls cannot claim Phase 5 complete while production blockers remain.");
  text(record.safetyBoundary, "Safety boundary");
  if (!/not emergency direction|not.*spread prediction|not.*damage map/i.test(record.safetyBoundary)) throw new Error("Safety boundary must preserve the non-emergency, non-prediction, non-damage rule.");
  return record;
}

export async function checkPhase5LiveWildfireExitStatus(file = new URL("../data/phase5-live-wildfire-exit-status.json", import.meta.url)) {
  return validatePhase5LiveWildfireExitStatus(JSON.parse(await readFile(file, "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const record = await checkPhase5LiveWildfireExitStatus();
  console.log(`Phase 5 local implementation status: ${record.completedCriteria}/${record.totalCriteria} (${record.percentage}%); production remains blocked.`);
}
