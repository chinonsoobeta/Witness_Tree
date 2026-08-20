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
  read("data/phase1-access-blocker-resolution.json")
];

test("remaining-action audit covers every non-admitted row and preserves the baseline", () => {
  const audit = validatePhase1RemainingActionsAudit(...args);
  assert.equal(audit.rowCoverage.length, 31);
  assert.equal(audit.scope.rowsWithoutImmutableRemoteProof, 21);
  assert.equal(audit.baseline.formalEvidenceTrackingPercentage, 39.516129);
  assert.deepEqual(audit.nextFive, [
    "national-local-archive-preflight-and-owner-promotion",
    "quebec-current-original-archive-preflight-and-owner-promotion",
    "quebec-fourth-archive-preflight-and-owner-approvals",
    "harvest-owner-source-ledger-decision",
    "plvi-owner-scope-decision"
  ]);
  assert.equal(audit.physicalArtifactGroups.find(({ id }) => id === "national-two-artifacts").physicalArtifactCount, 2);
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
  unauthorized.actions[0].ownerRunAuthorized = true;
  assert.throws(() => validatePhase1RemainingActionsAudit(unauthorized, ...args.slice(1)));

  const missingRow = structuredClone(args[0]);
  missingRow.rowCoverage.pop();
  assert.throws(() => validatePhase1RemainingActionsAudit(missingRow, ...args.slice(1)));
});
