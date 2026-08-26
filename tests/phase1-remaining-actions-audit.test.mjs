import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase1RemainingActionsAudit } from "../scripts/check-phase1-remaining-actions-audit.mjs";

const read = (file) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
const args = [
  read("data/phase1-remaining-actions-audit.json"),
  read("data/phase1-production-source-ledger.json"),
  read("data/phase1-current-state-completion-audit.json"),
  read("data/phase1-source-ledger-decision-readiness.json"),
  read("data/phase1-immutable-promotion-readiness.json"),
  read("data/current-wildfire-owner-admission.json"),
  read("data/phase1-outreach-reply-audit.json"),
  read("data/partial-ledger-owner-review-outreach-package.json"),
  read("data/phase1-access-blocker-resolution.json"),
  read("data/phase1-phase3-owner-approvals-2026-08-21.json")
];

test("historical remaining-action audit covers every snapshot row and preserves its pre-admission baseline", () => {
  const audit = validatePhase1RemainingActionsAudit(...args);
  assert.equal(audit.rowCoverage.length, 31);
  assert.equal(audit.scope.rowsWithoutImmutableRemoteProof, 15);
  assert.equal(audit.baseline.formalEvidenceTrackingPercentage, 40.9677419);
  assert.deepEqual(audit.nextFive, [
    "national-local-archive-preflight-and-owner-promotion",
    "quebec-current-original-transform-ingest-release",
    "quebec-fourth-archive-preflight-and-owner-approvals",
    "national-archived-owner-source-ledger-decisions",
    "plvi-transformation-ingestion-decisions"
  ]);
  assert.equal(audit.physicalArtifactGroups.find(({ id }) => id === "national-two-artifacts").physicalArtifactCount, 1);
  assert.equal(audit.physicalArtifactGroups.find(({ id }) => id === "quebec-fourth-inventory-56-sheet-product").physicalArtifactCount, 62);
});

test("score, production, and permission evidence remain fail-closed", () => {
  const score = structuredClone(args[0]);
  score.baseline.formalEvidenceTrackingPercentage = 40;
  assert.throws(() => validatePhase1RemainingActionsAudit(score, ...args.slice(1)));

  const credit = structuredClone(args[0]);
  credit.actions[0].scoreImpact.currentRawCreditDelta = 0.25;
  assert.throws(() => validatePhase1RemainingActionsAudit(credit, ...args.slice(1)));

  const permission = structuredClone(args[0]);
  permission.claims.permissionGranted = true;
  assert.throws(() => validatePhase1RemainingActionsAudit(permission, ...args.slice(1)));

  const eligibility = structuredClone(args[0]);
  eligibility.rowCoverage[0].productionEligible = true;
  assert.throws(() => validatePhase1RemainingActionsAudit(eligibility, ...args.slice(1)));
});

test("shared artifacts, action bindings, and owner boundaries reject divergence", () => {
  const duplicate = structuredClone(args[0]);
  duplicate.physicalArtifactGroups[1].rows.push("ntems-canopy-height");
  assert.throws(() => validatePhase1RemainingActionsAudit(duplicate, ...args.slice(1)));

  const staleAction = structuredClone(args[0]);
  staleAction.actions[0].scoreImpact.maximumFormalPercentagePointDelta = 1;
  assert.throws(() => validatePhase1RemainingActionsAudit(staleAction, ...args.slice(1)));

  const unauthorized = structuredClone(args[0]);
  unauthorized.actions.find(({ id }) => id === "production-admission-and-release-gate").ownerRunAuthorized = true;
  assert.throws(() => validatePhase1RemainingActionsAudit(unauthorized, ...args.slice(1)));

  const missingRow = structuredClone(args[0]);
  missingRow.rowCoverage.pop();
  assert.throws(() => validatePhase1RemainingActionsAudit(missingRow, ...args.slice(1)));
});

test("local implementation audit covers every action and stays fail-closed", () => {
  const audit = validatePhase1RemainingActionsAudit(...args);
  assert.equal(audit.localImplementationAudit.coverage.remainingActionCount, 13);
  assert.equal(audit.localImplementationAudit.coverage.ownerIndependentGapsRemaining, 0);
  assert.equal(audit.localImplementationAudit.coverage.scoreDelta.rawCreditDelta, 0);

  const omitted = structuredClone(args[0]);
  omitted.localImplementationAudit.requirementCategories[0].actionIds.pop();
  assert.throws(() => validatePhase1RemainingActionsAudit(omitted, ...args.slice(1)), /action coverage drifted|cover every remaining action/);

  const invented = structuredClone(args[0]);
  invented.localImplementationAudit.gaps[0].safeLocalImplementation = true;
  assert.throws(() => validatePhase1RemainingActionsAudit(invented, ...args.slice(1)), /safeLocalImplementation/);
});
