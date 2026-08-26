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
async function verifyEvidence(evidence, id) {
  if (!Array.isArray(evidence) || evidence.length === 0) throw new Error(`${id} passes, so it requires checksum-bound local evidence.`);
  for (const item of evidence) {
    text(item?.path, `${id} evidence path`);
    if (!SHA.test(item?.sha256 ?? "")) throw new Error(`${id} evidence SHA-256 is invalid.`);
    const target = resolve(ROOT, item.path);
    if (relative(ROOT, target).startsWith("..")) throw new Error(`${id} evidence must remain inside the repository.`);
    const actual = createHash("sha256").update(await readFile(target)).digest("hex");
    if (actual !== item.sha256) throw new Error(`${id} evidence checksum does not match: ${item.path}.`);
  }
}

export async function validateExitStatus(record, { schemaVersion, phase, criteria }) {
  if (record?.schemaVersion !== schemaVersion || record.phase !== phase) throw new Error(`Phase ${phase} status must be a Version 2.1 record.`);
  if (!Array.isArray(record.exitCriteria) || record.exitCriteria.length !== criteria.size) throw new Error(`Phase ${phase} requires exactly the ${criteria.size} published exit criteria.`);

  const seen = new Set();
  let passed = 0;
  for (const criterion of record.exitCriteria) {
    if (!criteria.has(criterion?.id) || seen.has(criterion.id) || criterion.title !== criteria.get(criterion.id)) {
      throw new Error(`Phase ${phase} exit criteria must exactly match the published plan wording.`);
    }
    if (criterion.status !== "pass" && criterion.status !== "fail") throw new Error(`${criterion.id} must have an evidence-derived pass or fail status.`);
    text(criterion.reason, `${criterion.id} reason`);
    if (criterion.status === "pass") {
      await verifyEvidence(criterion.evidence, criterion.id);
      passed += 1;
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
  if (record.phaseComplete !== (passed === criteria.size)) throw new Error(`Phase ${phase} completion must be derived from the criteria, never asserted.`);

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
