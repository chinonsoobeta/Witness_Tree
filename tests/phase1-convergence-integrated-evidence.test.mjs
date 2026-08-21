import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));

test("integrated Phase 1 evidence remains additive and fail-closed across convergence records", () => {
  const state = read("data/phase1-current-state-completion-audit.json");
  const ledger = read("data/phase1-production-source-ledger.json");
  const harvest = read("data/nrcan-harvest-remote-archive-evidence.json");
  const canopy = read("data/nrcan-canopy-height-remote-archive-evidence.json");
  const national = read("data/phase1-national-archive-finalization-audit.json");
  const alternatives = read("data/phase1-bec-public-alternative-exhaustion.json");
  const copyright = read("data/phase1-bc-copyright-permission-form-package.json");
  const replies = read("data/phase1-outreach-reply-audit.json");

  assert.deepEqual(state.ledger.evidenceStateCounts, {
    "remote-verified-archived-profiled": 11,
    "local-verified-profiled": 5,
    "partial-component": 2,
    "access-blocked": 13,
  });
  assert.equal(state.ledger.rawEvidenceNumerator, 15.25);
  assert.equal(state.ledger.formalEvidenceTrackingPercentage, 39.7580645);
  assert.equal(state.ledger.immutableArchiveCompleteRows, 11);
  assert.equal(state.ledger.productionAdmissionCompleteRows, 0);
  assert.equal(state.ledger.productionEligibleRows, 0);

  const harvestRow = ledger.entries.find(({ id }) => id === "ntems-forest-harvest");
  assert.equal(harvestRow.evidenceState, "remote-verified-archived-profiled");
  assert.equal(harvestRow.proof.immutableArchive, true);
  assert.equal(harvestRow.productionEligible, false);
  assert.equal(harvest.claims.ownerSourceLedgerDecision, false);
  assert.equal(harvest.claims.productionEligible, false);
  assert.equal(canopy.claims.immutableArchive, true);
  assert.equal(canopy.claims.ownerSourceAdmission, false);
  assert.equal(canopy.claims.productionEligible, false);

  assert.equal(national.liveReadOnly.multipart.canopy.partCount, 155);
  assert.equal(national.privateResumeState.matchingMode600RecordFoundInControlledRoots, true);
  assert.equal(national.privateResumeState.offlineValidationPassed, true);
  assert.equal(national.privateResumeState.recordContentsRetainedInRepository, false);
  assert.equal(national.privateResumeState.recordIdentifiersRecorded, false);
  assert.equal(national.ownerRun.safeCommandAvailable, false);
  assert.equal(national.ownerRun.command, null);
  assert.deepEqual(national.claims, {
    canopyMultipartFinalized: false,
    federalArtifactPromoted: false,
    harvestPromotionPerformed: false,
    remoteMutationPerformed: false,
    productionEligible: false,
  });

  assert.equal(alternatives.status, "no-complete-public-artifact");
  assert.equal(alternatives.exhaustion.rawEvidenceCreditImpact, 0);
  assert.equal(alternatives.exhaustion.productionEligibilityImpact, 0);
  assert.equal(alternatives.routes.every(({ completeArtifact }) => completeArtifact === false), true);

  assert.deepEqual(copyright.canonicalRowIds, ["bc-vri", "bc-forest-operations-map", "bc-old-growth-bec"]);
  assert.equal(copyright.impact.formsSubmitted, false);
  assert.equal(copyright.impact.permissionGranted, false);
  assert.equal(copyright.impact.rawEvidenceCreditImpact, 0);
  assert.equal(copyright.formFieldMap.find(({ field }) => field === "websiteSourceUrl").preparedValue, null);
  assert.equal(copyright.formFieldMap.find(({ field }) => field === "websiteNumberOfCopies").preparedValue, null);
  assert.equal(copyright.sourceEvidence.fee.amount, null);
  assert.equal(copyright.sourceEvidence.fee.paid, false);

  assert.equal(replies.counts.substantiveReplyRecords, 7);
  const affectedRows = new Set(replies.substantiveReplies.flatMap(({ canonicalRowIds }) => canonicalRowIds));
  assert.equal(affectedRows.size, 8);
  assert.equal(replies.counts.accessBlockedRowsWithSubstantiveReply, 8);
  assert.equal(replies.counts.partialRowsWithSubstantiveReply, 0);

  for (const file of [
    "data/phase1-archive-live-readback-2026-08-20.json",
    "data/phase1-archive-owner-command-reconciliation-2026-08-20.json",
    "data/current-wildfire-derived-live-recovery-guard-2026-08-20.json",
  ]) assert.equal(existsSync(new URL(`../${file}`, import.meta.url)), true, `${file} must remain integrated`);
});
