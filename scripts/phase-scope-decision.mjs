// The owner's phase scope decision of 2026-09-26, read by every phase checker
// it touches. A checker may only drop a criterion that is named here and that
// the checker itself lists as removable, so a criterion cannot fall out of a
// count by editing one status file, and this record cannot remove a criterion a
// checker does not expect.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SCOPE_DECISION_PATH = "data/phase-scope-decision-2026-09-26.json";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function validateScopeDecision(decision) {
  assert.equal(decision?.schemaVersion, "witness-tree/phase-scope-decision/1", "Scope decision schema drifted.");
  assert.equal(decision.status, "owner-scope-decision", "Scope decision must be an owner decision.");
  assert.match(decision.decidedAt, /^\d{4}-\d{2}-\d{2}$/, "Scope decision needs a date.");
  assert.equal(decision.decidedBy, "owner", "Scope decision must be the owner's.");
  assert.ok(Array.isArray(decision.removedCriteria) && Array.isArray(decision.retiredRequirements) && Array.isArray(decision.withdrawnLedgerRows), "Scope decision lists are required.");
  for (const item of [...decision.removedCriteria, ...decision.retiredRequirements]) {
    assert.ok(Number.isInteger(item.phase), "Every removal names its phase.");
    assert.ok(typeof item.reason === "string" && item.reason.trim().length >= 32, "Every removal states its reason.");
  }
  // Removing a requirement proves nothing it required.
  for (const [claim, value] of Object.entries(decision.claims ?? {})) assert.equal(value, false, `The scope decision asserts ${claim}; a removal proves nothing.`);
  assert.ok(Object.keys(decision.claims ?? {}).length >= 5, "The scope decision must state what it does not claim.");
  return decision;
}

export function readScopeDecision(root = ROOT) {
  return validateScopeDecision(JSON.parse(readFileSync(path.join(root, SCOPE_DECISION_PATH), "utf8")));
}

/** The criteria the decision removes from one phase, checked against the ones that phase allows to be removed. */
export function removedCriteria(decision, phase, removable) {
  const removed = decision.removedCriteria.filter((item) => item.phase === phase).map((item) => item.criterion);
  for (const id of removed) assert.ok(removable.includes(id), `Phase ${phase} does not allow ${id} to be removed.`);
  return removed;
}
