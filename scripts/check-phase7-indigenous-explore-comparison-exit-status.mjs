import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const CRITERIA = new Map([
  ["reserve-and-treaty-layers-loaded", "Every reserve and treaty area in the four provinces has a page with the correct official name and diacritics, checked against the federal source"],
  ["right-of-reply-live", "Every reserve and treaty page carries a working right-of-reply route with a named recipient"],
  ["minimum-area-rule", "A reserve below the admitted area threshold shows the raw record and declines to publish a rate, proven by a fixture"],
  ["engagement-register-published", "A public register lists engagement contacts made and responses received while respecting confidentiality requests"],
  ["no-indigenous-ranking", "No ranked view accepts a reserve or treaty-area place type"],
  ["mistik-request-recorded", "The Mistik request, terms, honorarium, and outcome appear in the decision log and engagement register"],
  ["explore-modes-and-overlays", "Explore provides the four required modes and the watershed and riding overlays"],
  ["no-map-tabular-equivalence", "Explore map/list and chart/table presentations expose the same evidence-bearing records at the same route"],
  ["native-time-control", "Explore uses a native range input whose keyboard interaction advances the selected year"],
  ["boundary-editioning", "Comparison and place aggregates retain and display a boundary edition rather than silently applying a current boundary"],
  ["normalisation-forced", "The riding ranking has no absolute-hectares-only sort and orders by detected-change share of forested area"],
  ["comparison-row-context", "Every riding comparison row renders normalised and absolute values, forested-hectare denominator, coverage, and evidence"],
  ["insufficient-coverage-separated", "Insufficient-coverage ridings are separated from the ranked table rather than represented as zero"],
  ["comparison-share-image-context", "The deterministic comparison share image includes time range, boundary edition, data version, and denominator"],
  ["ranking-scope-enforced", "The ranked table type accepts federal and provincial ridings only"],
  ["neutral-comparison-headers", "Comparison headers reject accusatory or superlative ranking language"],
]);

function requiredText(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required.`);
}

async function verifyEvidence(evidence) {
  if (!Array.isArray(evidence) || evidence.length === 0) throw new Error("Every Phase 7 criterion requires checksum-bound evidence.");
  for (const item of evidence) {
    requiredText(item?.path, "Evidence path");
    if (!/^[a-f0-9]{64}$/.test(item?.sha256 ?? "")) throw new Error("Evidence SHA-256 is invalid.");
    const target = resolve(ROOT, item.path);
    if (relative(ROOT, target).startsWith("..")) throw new Error("Evidence must remain inside the repository.");
    const actual = createHash("sha256").update(await readFile(target)).digest("hex");
    if (actual !== item.sha256) throw new Error(`Evidence checksum does not match: ${item.path}.`);
  }
}

export async function validatePhase7IndigenousExploreComparisonExitStatus(record) {
  if (record?.schemaVersion !== "witness-tree/phase7-indigenous-explore-comparison-exit-status/1" || record.phase !== 7) throw new Error("Phase 7 status must be a Version 2.1 record.");
  if (!Array.isArray(record.exitCriteria) || record.exitCriteria.length !== CRITERIA.size) throw new Error("Phase 7 requires exactly the sixteen plan exit criteria.");
  const seen = new Set();
  let passed = 0;
  for (const criterion of record.exitCriteria) {
    if (!CRITERIA.has(criterion?.id) || seen.has(criterion.id) || criterion.title !== CRITERIA.get(criterion.id)) throw new Error("Phase 7 exit criteria must exactly match the plan.");
    if (criterion.status !== "pass" && criterion.status !== "fail") throw new Error("Each Phase 7 criterion must have an evidence-derived pass or fail status.");
    requiredText(criterion.reason, `${criterion.id} reason`);
    await verifyEvidence(criterion.evidence);
    seen.add(criterion.id);
    if (criterion.status === "pass") passed += 1;
  }
  const percentage = passed / CRITERIA.size * 100;
  if (record.completedCriteria !== passed || record.totalCriteria !== CRITERIA.size || record.percentage !== percentage) throw new Error("Phase 7 completion must equal the unweighted formal exit-criterion result.");
  if (record.localImplementationStatus !== (passed === CRITERIA.size ? "complete" : "incomplete")) throw new Error("Phase 7 local implementation status must be derived from its formal exit criteria.");
  if (record.phaseComplete !== false) throw new Error("Phase 7 cannot claim completion while official geography and reply-route gates remain open.");
  if (!Array.isArray(record.externalBlockers) || record.externalBlockers.length !== 2) throw new Error("Phase 7 must retain exactly two external blockers.");
  const ids = record.externalBlockers.map((item) => item?.id).sort().join(",");
  if (ids !== "official-indigenous-boundary-admission,owner-managed-right-of-reply-route") throw new Error("Phase 7 external blockers must remain precise.");
  for (const blocker of record.externalBlockers) {
    if (blocker.status !== "blocked") throw new Error("External blockers remain blocked without primary evidence.");
    requiredText(blocker.reason, `${blocker.id} reason`);
  }
  requiredText(record.nonProductionBoundary, "Non-production boundary");
  if (!/no official reserve or treaty geometry|no production Indigenous geography/i.test(record.nonProductionBoundary)) throw new Error("Phase 7 must preserve the no-production-Indigenous-geography boundary.");
  return record;
}

export async function checkPhase7IndigenousExploreComparisonExitStatus(file = new URL("../data/phase7-indigenous-explore-comparison-exit-status.json", import.meta.url)) {
  return validatePhase7IndigenousExploreComparisonExitStatus(JSON.parse(await readFile(file, "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const record = await checkPhase7IndigenousExploreComparisonExitStatus();
  console.log(`Phase 7 formal exit status: ${record.completedCriteria}/${record.totalCriteria} (${record.percentage}%); production Indigenous geography remains blocked.`);
}
