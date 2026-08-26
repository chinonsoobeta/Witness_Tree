import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const CRITERIA = new Map([
  ["professional-bilingual-review", "Professional bilingual review is complete"],
  ["external-accessibility-audit", "An external accessibility audit is complete"],
  ["security-review", "A security review is complete"],
  ["load-testing", "Load testing is complete"],
  ["raw-archive-reproducibility", "Reproducibility from the raw archive is demonstrated"],
  ["legal-licence-attribution-review", "Legal, licence, and attribution review is complete"],
  ["governance-and-corrections-procedures", "Governance and corrections procedures are implemented"],
  ["operations-handbook", "An operations handbook is complete"],
  ["on-call-rota", "An on-call rota is complete"],
  ["bulk-downloads", "Bulk downloads are complete"],
  ["citation-format", "A citation format is implemented"],
  ["release-notes", "Release notes are implemented"],
  ["observability", "Observability is complete"],
  ["backups", "Backups are complete"],
  ["restore-tests", "Restore tests are complete"],
  ["cdn-tile-validation", "CDN and tile validation are complete"],
]);
const BLOCKERS = ["admitted-production-data-and-delivery", "independent-accessibility-audit", "legal-licence-attribution-sign-off", "production-operations", "professional-bilingual-review", "security-and-load-review"];

function requiredText(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required.`);
}

async function verifyEvidence(evidence) {
  if (!Array.isArray(evidence) || evidence.length === 0) throw new Error("Every Phase 8 criterion requires checksum-bound evidence.");
  for (const item of evidence) {
    requiredText(item?.path, "Evidence path");
    if (!/^[a-f0-9]{64}$/.test(item?.sha256 ?? "")) throw new Error("Evidence SHA-256 is invalid.");
    const target = resolve(ROOT, item.path);
    if (relative(ROOT, target).startsWith("..")) throw new Error("Evidence must remain inside the repository.");
    const actual = createHash("sha256").update(await readFile(target)).digest("hex");
    if (actual !== item.sha256) throw new Error(`Evidence checksum does not match: ${item.path}.`);
  }
}

export async function validatePhase8LaunchReadinessExitStatus(record) {
  if (record?.schemaVersion !== "witness-tree/phase8-launch-readiness-exit-status/1" || record.phase !== 8) throw new Error("Phase 8 status must be a Version 2.1 record.");
  if (!Array.isArray(record.exitCriteria) || record.exitCriteria.length !== CRITERIA.size) throw new Error("Phase 8 requires exactly the sixteen literal launch-readiness gates.");
  const seen = new Set();
  let passed = 0;
  for (const criterion of record.exitCriteria) {
    if (!CRITERIA.has(criterion?.id) || seen.has(criterion.id) || criterion.title !== CRITERIA.get(criterion.id)) throw new Error("Phase 8 exit criteria must exactly match the launch-readiness gates.");
    if (criterion.status !== "pass" && criterion.status !== "fail") throw new Error("Each Phase 8 criterion must have an evidence-derived pass or fail status.");
    requiredText(criterion.reason, `${criterion.id} reason`);
    await verifyEvidence(criterion.evidence);
    seen.add(criterion.id);
    if (criterion.status === "pass") passed += 1;
  }
  const percentage = passed / CRITERIA.size * 100;
  if (record.completedCriteria !== passed || record.totalCriteria !== CRITERIA.size || record.percentage !== percentage) throw new Error("Phase 8 completion must equal the unweighted formal exit-criterion result.");
  if (record.localImplementationStatus !== (passed === CRITERIA.size ? "complete" : "incomplete") || record.phaseComplete !== (passed === CRITERIA.size)) throw new Error("Phase 8 completion flags must be derived from its formal exit criteria.");
  if (!Array.isArray(record.externalBlockers) || record.externalBlockers.length !== BLOCKERS.length) throw new Error("Phase 8 must retain exactly six external blockers.");
  if (record.externalBlockers.map((item) => item?.id).sort().join(",") !== BLOCKERS.join(",")) throw new Error("Phase 8 external blockers must remain precise.");
  for (const blocker of record.externalBlockers) {
    if (blocker.status !== "blocked") throw new Error("External blockers remain blocked without primary evidence.");
    requiredText(blocker.reason, `${blocker.id} reason`);
  }
  requiredText(record.nonProductionBoundary, "Non-production boundary");
  if (!/technical preview|illustrative data/i.test(record.nonProductionBoundary)) throw new Error("Phase 8 must preserve the technical-preview boundary.");
  return record;
}

export async function checkPhase8LaunchReadinessExitStatus(file = new URL("../data/phase8-launch-readiness-exit-status.json", import.meta.url)) {
  return validatePhase8LaunchReadinessExitStatus(JSON.parse(await readFile(file, "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const record = await checkPhase8LaunchReadinessExitStatus();
  console.log(`Phase 8 formal exit status: ${record.completedCriteria}/${record.totalCriteria} (${record.percentage}%); public production launch remains closed.`);
}
