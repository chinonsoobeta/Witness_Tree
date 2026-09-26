import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkPhase2FormalExitStatus, validatePhase2FormalExitStatus } from "../scripts/check-phase2-formal-exit-status.mjs";
import { readScopeDecision } from "../scripts/phase-scope-decision.mjs";

const readStatus = () => JSON.parse(readFileSync(new URL("../data/phase2-formal-exit-status.json", import.meta.url), "utf8"));
const decision = () => JSON.parse(JSON.stringify(readScopeDecision()));
const withoutPhase2Removals = () => {
  const d = decision();
  d.removedCriteria = d.removedCriteria.filter((item) => item.phase !== 2);
  return d;
};

// The record as it stood before the 2026-09-26 scope decision, with the
// retired expert review still counted. It is what a decision that removes
// nothing from Phase 2 must still accept and still judge.
const fourCriteria = () => {
  const current = readStatus();
  return {
    schemaVersion: current.schemaVersion,
    status: "two-of-four-formal-exit-criteria",
    formalExit: { completed: 2, total: 4, percentage: 50 },
    criteria: [
      current.criteria[0],
      { id: "expert-review-100-per-province", complete: false, retired: true, evidence: "data/phase2-expert-review-retirement-2026-08-30.json", reason: "Retired on 2026-08-30; withdrawn, not met." },
      { id: "published-independent-comparisons", complete: false, evidence: "data/phase2-real-comparison-availability.json", reason: "Every required comparison value is published null." },
      current.criteria[1],
    ],
    claims: { productionEligible: false, released: false, formalPhaseComplete: false, expertReviewed: false, independentlyCompared: false },
  };
};

test("Phase 2 is 2/2 after the owner removed expert review and independent comparison", () => {
  assert.deepEqual(checkPhase2FormalExitStatus(), { status: "two-of-two-formal-exit-criteria", completed: 2, total: 2, percentage: 100 });
  assert.match(execFileSync("node", ["scripts/check-phase2-formal-exit-status.mjs"], { encoding: "utf8" }), /is 2\/2/);
});

test("removal never claims the removed work was done", () => {
  const status = readStatus();
  assert.equal(status.claims.expertReviewed, false);
  assert.equal(status.claims.independentlyCompared, false);
  const claimed = readStatus();
  claimed.claims.expertReviewed = true;
  assert.throws(() => validatePhase2FormalExitStatus(claimed), /Phase 2 claims drifted/);
});

test("a criterion leaves the count only by the recorded scope decision", () => {
  // Without the decision, the removed criteria must be back in the list.
  assert.throws(() => validatePhase2FormalExitStatus(readStatus(), withoutPhase2Removals()), /denominator|criterion ids/);
  // With it, the old four-criterion record no longer fits.
  assert.throws(() => validatePhase2FormalExitStatus(fourCriteria()), /denominator|criterion ids/);
  // The status file cannot drop a criterion the decision does not remove.
  const dropped = readStatus();
  dropped.criteria.splice(1, 1);
  dropped.formalExit = { completed: 1, total: 1, percentage: 100 };
  dropped.status = "one-of-one-formal-exit-criteria";
  assert.throws(() => validatePhase2FormalExitStatus(dropped), /denominator|criterion ids/);
  // And the decision cannot remove a criterion Phase 2 does not allow removed.
  const overreach = decision();
  overreach.removedCriteria.push({ phase: 2, criterion: "admitted-boundary-aggregates", reason: "An attempt to remove an admitted criterion from the count." });
  assert.throws(() => validatePhase2FormalExitStatus(readStatus(), overreach), /does not allow admitted-boundary-aggregates to be removed/);
});

test("without a removal, a retired criterion is withdrawn, not met, and cannot be recorded complete", () => {
  assert.deepEqual(validatePhase2FormalExitStatus(fourCriteria(), withoutPhase2Removals()), { status: "two-of-four-formal-exit-criteria", completed: 2, total: 4, percentage: 50 });
  const claimed = fourCriteria();
  claimed.criteria[1].complete = true;
  claimed.formalExit = { completed: 3, total: 4, percentage: 75 };
  claimed.status = "three-of-four-formal-exit-criteria";
  assert.throws(() => validatePhase2FormalExitStatus(claimed, withoutPhase2Removals()), /retired and can never be recorded complete/);
  const swapped = fourCriteria();
  swapped.criteria[1].evidence = "data/phase2-v21-real-review-packet-evidence.json";
  assert.throws(() => validatePhase2FormalExitStatus(swapped, withoutPhase2Removals()), /retirement evidence path drifted/);
});

test("Phase 2 formal exit rejects tampered admission flags and evidence paths", () => {
  const admissionTamper = readStatus();
  admissionTamper.criteria[0].complete = false;
  admissionTamper.formalExit = { completed: 1, total: 2, percentage: 50 };
  admissionTamper.status = "one-of-two-formal-exit-criteria";
  assert.throws(() => validatePhase2FormalExitStatus(admissionTamper), /Phase 2 criterion completion drifted/);

  const traversal = readStatus();
  traversal.criteria[0].evidence = "data/../package.json";
  traversal.criteria[1].evidence = "data/../package.json";
  assert.throws(() => validatePhase2FormalExitStatus(traversal), /must not traverse directories/i);
});
