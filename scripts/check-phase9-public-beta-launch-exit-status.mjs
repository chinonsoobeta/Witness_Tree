import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const CRITERIA = new Map([
  ["median-correction-resolution-within-service-levels", "Median correction resolution time is inside the section 14.3 service levels"],
  ["no-unresolved-critical-correction-at-launch", "No unresolved critical correction at launch"],
  ["source-agency-data-review-confirmed", "At least one source agency has reviewed its own data as presented and confirmed it"],
  ["quarterly-reproducibility-test-passes", "The quarterly reproducibility test passes"],
]);
const BLOCKERS = ["all-applicable-prior-release-gates", "operated-real-beta-and-correction-evidence", "owner-moment-of-action-authorization", "source-agency-confirmation"];

function requiredText(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required.`);
}

async function verifyEvidence(evidence) {
  if (!Array.isArray(evidence) || evidence.length === 0) throw new Error("Every Phase 9 criterion requires checksum-bound evidence.");
  for (const item of evidence) {
    requiredText(item?.path, "Evidence path");
    if (!/^[a-f0-9]{64}$/.test(item?.sha256 ?? "")) throw new Error("Evidence SHA-256 is invalid.");
    const target = resolve(ROOT, item.path);
    if (relative(ROOT, target).startsWith("..")) throw new Error("Evidence must remain inside the repository.");
    const actual = createHash("sha256").update(await readFile(target)).digest("hex");
    if (actual !== item.sha256) throw new Error(`Evidence checksum does not match: ${item.path}.`);
  }
}

export async function validatePhase9PublicBetaLaunchExitStatus(record) {
  if (record?.schemaVersion !== "witness-tree/phase9-public-beta-launch-exit-status/1" || record.phase !== 9) throw new Error("Phase 9 status must be a Version 2.1 record.");
  if (!Array.isArray(record.exitCriteria) || record.exitCriteria.length !== CRITERIA.size) throw new Error("Phase 9 requires exactly the four literal public-beta-and-launch gates.");
  const seen = new Set();
  let passed = 0;
  for (const criterion of record.exitCriteria) {
    if (!CRITERIA.has(criterion?.id) || seen.has(criterion.id) || criterion.title !== CRITERIA.get(criterion.id)) throw new Error("Phase 9 exit criteria must exactly match the public-beta-and-launch gates.");
    if (criterion.status !== "pass" && criterion.status !== "fail") throw new Error("Each Phase 9 criterion must have an evidence-derived pass or fail status.");
    requiredText(criterion.reason, `${criterion.id} reason`);
    await verifyEvidence(criterion.evidence);
    seen.add(criterion.id);
    if (criterion.status === "pass") passed += 1;
  }
  const percentage = passed / CRITERIA.size * 100;
  if (record.completedCriteria !== passed || record.totalCriteria !== CRITERIA.size || record.percentage !== percentage) throw new Error("Phase 9 completion must equal the unweighted formal exit-criterion result.");
  if (record.localImplementationStatus !== (passed === CRITERIA.size ? "complete" : "incomplete") || record.phaseComplete !== (passed === CRITERIA.size)) throw new Error("Phase 9 completion flags must be derived from its formal exit criteria.");
  if (!Array.isArray(record.externalBlockers) || record.externalBlockers.length !== BLOCKERS.length) throw new Error("Phase 9 must retain exactly four external blockers.");
  if (record.externalBlockers.map((item) => item?.id).sort().join(",") !== BLOCKERS.join(",")) throw new Error("Phase 9 external blockers must remain precise.");
  for (const blocker of record.externalBlockers) {
    if (blocker.status !== "blocked") throw new Error("Phase 9 blockers remain blocked without primary evidence.");
    requiredText(blocker.reason, `${blocker.id} reason`);
  }
  requiredText(record.nonProductionBoundary, "Non-production boundary");
  if (!/technical preview|illustrative data/i.test(record.nonProductionBoundary)) throw new Error("Phase 9 must preserve the technical-preview boundary.");
  return record;
}

export async function checkPhase9PublicBetaLaunchExitStatus(file = new URL("../data/phase9-public-beta-launch-exit-status.json", import.meta.url)) {
  return validatePhase9PublicBetaLaunchExitStatus(JSON.parse(await readFile(file, "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const record = await checkPhase9PublicBetaLaunchExitStatus();
  console.log(`Phase 9 formal exit status: ${record.completedCriteria}/${record.totalCriteria} (${record.percentage}%); public beta and launch remain closed.`);
}
