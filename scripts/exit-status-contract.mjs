import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SHA = /^[a-f0-9]{64}$/;

function text(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required.`);
}

// A passing criterion must be backed by checksum-bound files inside the repository. A failing one
// cannot be: absence has nothing to hash. Failures instead name who the work is blocked on, so an
// unmet criterion is recorded as unmet rather than quietly dropped or turned into a pass.
async function verifyEvidence(evidence, id, outcome = "passes") {
  if (!Array.isArray(evidence) || evidence.length === 0) throw new Error(`${id} ${outcome}, so it requires checksum-bound local evidence.`);
  for (const item of evidence) {
    text(item?.path, `${id} evidence path`);
    if (!SHA.test(item?.sha256 ?? "")) throw new Error(`${id} evidence SHA-256 is invalid.`);
    const target = resolve(ROOT, item.path);
    if (relative(ROOT, target).startsWith("..")) throw new Error(`${id} evidence must remain inside the repository.`);
    const actual = createHash("sha256").update(await readFile(target)).digest("hex");
    if (actual !== item.sha256) throw new Error(`${id} evidence checksum does not match: ${item.path}.`);
  }
}

export async function validateExitStatus(record, { schemaVersion, phase, criteria, ownerExcludableCriteria = new Set(), ownerExclusionEvidence = new Map() }) {
  if (record?.schemaVersion !== schemaVersion || record.phase !== phase) throw new Error(`Phase ${phase} status must be a Version 2.1 record.`);
  if (!Array.isArray(record.exitCriteria) || record.exitCriteria.length !== criteria.size) throw new Error(`Phase ${phase} requires exactly the ${criteria.size} published exit criteria.`);

  const seen = new Set();
  let passed = 0;
  let excluded = 0;
  for (const criterion of record.exitCriteria) {
    if (!criteria.has(criterion?.id) || seen.has(criterion.id) || criterion.title !== criteria.get(criterion.id)) {
      throw new Error(`Phase ${phase} exit criteria must exactly match the published plan wording.`);
    }
    if (criterion.status !== "pass" && criterion.status !== "fail" && criterion.status !== "excluded") throw new Error(`${criterion.id} must have an evidence-derived pass, fail, or owner-approved exclusion status.`);
    text(criterion.reason, `${criterion.id} reason`);
    if (criterion.status === "pass") {
      await verifyEvidence(criterion.evidence, criterion.id);
      passed += 1;
    } else if (criterion.status === "excluded") {
      if (!ownerExcludableCriteria.has(criterion.id)) throw new Error(`${criterion.id} is not an owner-excludable criterion for Phase ${phase}.`);
      if (criterion.ownerApprovedExclusion !== true) throw new Error(`${criterion.id} is excluded, so it must carry an explicit owner-approved exclusion.`);
      if (criterion.testPerformed !== false) throw new Error(`${criterion.id} is excluded, so it must state that its test was not performed.`);
      if (criterion.blockedBy !== undefined) throw new Error(`${criterion.id} is excluded, so it must not be listed as blocked.`);
      text(criterion.exclusionScope, `${criterion.id} exclusion scope`);
      await verifyEvidence(criterion.evidence, criterion.id, "is excluded");
      const canonicalEvidencePath = ownerExclusionEvidence.get(criterion.id);
      if (!canonicalEvidencePath || criterion.evidence?.length !== 1 || criterion.evidence[0]?.path !== canonicalEvidencePath) {
        throw new Error(`${criterion.id} must bind the canonical owner-decision evidence record.`);
      }
      excluded += 1;
    } else {
      if (criterion.blockedBy !== "owner" && criterion.blockedBy !== "engineering") throw new Error(`${criterion.id} fails, so it must name whether it is blocked on the owner or on engineering.`);
      if (criterion.evidence !== undefined) throw new Error(`${criterion.id} fails, so it must not carry evidence of completion.`);
    }
    seen.add(criterion.id);
  }

  const percentage = passed / criteria.size * 100;
  if (record.completedCriteria !== passed || record.totalCriteria !== criteria.size || record.percentage !== percentage) {
    throw new Error(`Phase ${phase} percentage must equal the unweighted formal exit-criterion result.`);
  }
  if (excluded > 0 && (record.excludedCriteria !== excluded || record.acceptedCriteria !== passed + excluded)) {
    throw new Error(`Phase ${phase} must report its passed and owner-excluded criteria separately.`);
  }
  if (excluded === 0 && (record.excludedCriteria !== undefined || record.acceptedCriteria !== undefined)) {
    throw new Error(`Phase ${phase} must not report owner exclusions when none exist.`);
  }
  if (record.phaseComplete !== (passed + excluded === criteria.size)) throw new Error(`Phase ${phase} completion must be derived from passed or explicitly owner-excluded criteria, never asserted.`);

  // The count is an unweighted tally of the literal published exit criteria. Version 2.1 forbids converting a
  // phase into an invented cumulative maturity score, and Phase 3 in particular is recorded by evidence rather
  // than by such a score. Every record must therefore say in its own words what its number is not.
  text(record.countingBoundary, `Phase ${phase} counting boundary`);
  if (!/not a cumulative|never a cumulative/i.test(record.countingBoundary)) {
    throw new Error(`Phase ${phase} must state that its count is not a cumulative maturity percentage.`);
  }

  const failed = record.exitCriteria.filter((item) => item.status === "fail").map((item) => item.id).sort();
  const blockers = (record.ownerBlockers ?? []).map((item) => item?.id).sort();
  if (blockers.join(",") !== failed.join(",")) throw new Error(`Phase ${phase} must list exactly its unmet criteria as blockers.`);
  for (const blocker of record.ownerBlockers ?? []) text(blocker.reason, `${blocker.id} blocker reason`);

  return record;
}
