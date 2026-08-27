import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { validateArchiveExerciseReadback } from "./check-phase1-archive-exercise-readback.mjs";
import { validatePhase1OutreachReplyAudit } from "./check-phase1-outreach-reply-audit.mjs";

const read = (file) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
const HISTORICAL_ROW_IDS = [
  "ntems-annual-land-cover", "ntems-forest-harvest", "ntems-canopy-cover", "ntems-canopy-height",
  "cwfis-current", "cwfis-historical", "bc-wildfire", "ab-wildfire", "on-fire-disturbance", "sopfeu",
  "bc-fta-cutblocks", "bc-harvesting-authorities", "bc-vri", "bc-consolidated-cutblocks", "bc-old-growth-bec",
  "bc-forest-operations-map", "qc-current-ecoforest", "qc-original-current-inventory", "qc-fourth-inventory",
  "ab-avi-crown", "ab-avi-post-harvest", "ab-primary-land-vegetation", "on-fri", "on-fri-term-2",
  "fed-2023-ridings", "elections-canada-45th-files", "provincial-electoral-boundaries", "indian-reserves",
  "first-nation-reserves", "historic-treaties", "modern-treaties",
];
const HISTORICAL_PARTIAL_PLANS = new Map([
  ["cwfis-historical", "partial-historical"],
  ["provincial-electoral-boundaries", "partial-boundaries"],
]);
const HISTORICAL_ACCESS_ROWS = new Set([
  "sopfeu", "bc-fta-cutblocks", "bc-harvesting-authorities", "bc-vri", "bc-consolidated-cutblocks",
  "bc-old-growth-bec", "bc-forest-operations-map", "on-fri", "on-fri-term-2", "indian-reserves",
  "first-nation-reserves", "historic-treaties", "modern-treaties",
]);

export function validatePhase1CurrentStateCompletionAudit(audit, _currentLedger, readiness, immutable, wildfire, outreach, partialOutreach, access, replyAudit, routeAudit) {
  assert.equal(audit.schemaVersion, 1);
  assert.equal(audit.status, "blocked-zero-of-31-production-complete");
  assert.equal(audit.asOf, "2026-08-25");
  assert.match(audit.notice, /nine named source\/scope decisions.*two national source-ledger-only decisions.*two Quebec source-ledger-only decisions.*PLVI raw\/derived scope decision.*no transformation admission.*production eligibility/i);
  // This audit is a dated snapshot. Validate the values recorded in it rather
  // than replaying the current ledger, which is allowed to advance later.
  assert.equal(audit.rows.length, HISTORICAL_ROW_IDS.length);
  assert.deepEqual(audit.rows.map(({ id }) => id), HISTORICAL_ROW_IDS);
  assert.deepEqual(audit.ledger.evidenceStateCounts, { "remote-verified-archived-profiled": 16, "partial-component": 2, "access-blocked": 13 });
  assert.equal(audit.ledger.totalRows, HISTORICAL_ROW_IDS.length);
  assert.equal(audit.ledger.rawEvidenceNumerator, 16.5);
  assert.equal(audit.ledger.rawEvidenceDenominator, HISTORICAL_ROW_IDS.length);
  assert.equal(audit.ledger.formalEvidenceTrackingPercentage, 40.9677419);
  assert.equal(audit.ledger.immutableArchiveCompleteRows, 16);
  assert.equal(audit.ledger.ownerSourceDecisionRecordedRows, 9);
  assert.equal(audit.ledger.ownerDownstreamScopeRecordedAwaitingArchiveRows, 4);
  assert.equal(audit.ledger.productionAdmissionCompleteRows, 0);
  assert.equal(audit.ledger.productionEligibleRows, 0);
  assert.deepEqual(audit.globalGates.immutableArchives, {status:"blocked", completeRows:16, localRowsAwaitingArchive:0, sourceEvidenceBlockedRows:15, currentWildfireRequiredObjects:6, currentWildfireVerifiedObjects:6, currentWildfireAttestedObjects:0});
  assert.equal(wildfire.archiveGate.requiredObjectCount, 6);
  assert.equal(wildfire.archiveGate.verifiedObjectCount, 6);
  assert.equal(wildfire.archiveGate.attestedObjectCount, 0);
  assert.equal(immutable.physicalArtifactGroups.find(({ id }) => id === "current-wildfire-six-release-inputs").physicalArtifactCount, 6);
  const exercise = audit.globalGates.normalArchiveExercise;
  assert.equal(exercise.status, "completed-operational-control-not-source-admission"); assert.equal(exercise.evidenceRef, "data/phase1-archive-exercise-readback-2026-08-25.json"); assert.equal(exercise.complete, true);
  assert.equal(exercise.requiredEvidence.length, 4);
  assert.ok(existsSync(new URL(`../${exercise.runner}`, import.meta.url))); assert.ok(existsSync(new URL(`../${exercise.checker}`, import.meta.url)));
  assert.deepEqual(validateArchiveExerciseReadback(read(exercise.evidenceRef)), { kind: "normal", completed: true });
  validatePhase1OutreachReplyAudit(replyAudit, access, outreach, routeAudit);
  const sent = outreach.messages.filter(({ verifiedSentAt }) => typeof verifiedSentAt === "string");
  const existing = outreach.messages.filter(({ verifiedSentAt }) => typeof verifiedSentAt !== "string");
  const covered = new Set(outreach.messages.flatMap(({ canonicalRowIds }) => canonicalRowIds));
  assert.deepEqual(audit.globalGates.outreach, {accessBlockedRows:13, accessRowsCoveredBySentOutreach:13, verifiedNewSends:sent.length, preExistingRequests:existing.length, repliesRecorded:replyAudit.counts.substantiveReplyRecords, accessBlockedRowsWithSubstantiveReply:replyAudit.counts.accessBlockedRowsWithSubstantiveReply, partialComponentDrafts:partialOutreach.requests.length, partialComponentDraftsSent:0});
  assert.equal(partialOutreach.status, "owner-review-only-not-sent");
  assert.equal(access.status, "all-13-access-blocked-no-lawful-acquisition");
  const accessById = new Map(access.rankedRows.map((entry) => [entry.id, entry]));
  const outreachById = new Map(outreach.messages.map((message) => [message.id, message]));
  const partialById = new Map(partialOutreach.requests.map((request) => [request.id, request]));
  for (const row of audit.rows) {
    assert.ok(audit.actionPlans[row.actionPlan]?.length >= 4, `${row.id} must have a complete ordered action plan`);
    if (HISTORICAL_ACCESS_ROWS.has(row.id)) {
      assert.equal(row.actionPlan, "access-blocked"); assert.ok(covered.has(row.id)); assert.equal(accessById.get(row.id).lawfulAcquisitionNow, false);
      assert.ok(row.outreachMessageIds.length >= 1);
      for (const id of row.outreachMessageIds) assert.ok(outreachById.get(id).canonicalRowIds.includes(row.id));
    } else if (HISTORICAL_PARTIAL_PLANS.has(row.id)) {
      assert.equal(row.actionPlan, HISTORICAL_PARTIAL_PLANS.get(row.id)); assert.ok(row.outreachRequestIds.length >= 1);
      for (const id of row.outreachRequestIds) { const request = partialById.get(id); assert.equal(request.canonicalRowId, row.id); assert.equal(request.status, "owner-review-only-not-sent"); }
    }
  }
  return audit;
}

export function checkPhase1CurrentStateCompletionAudit() {
  return validatePhase1CurrentStateCompletionAudit(read("data/phase1-current-state-completion-audit.json"), read("data/phase1-production-source-ledger.json"), read("data/phase1-source-ledger-decision-readiness.json"), read("data/phase1-immutable-promotion-readiness.json"), read("data/current-wildfire-owner-admission.json"), read("data/phase1-permission-outreach-package.json"), read("data/partial-ledger-owner-review-outreach-package.json"), read("data/phase1-access-blocker-resolution.json"), read("data/phase1-outreach-reply-audit.json"), read("data/phase1-bec-custom-download-route-audit.json"));
}

if (process.argv[1]?.endsWith("check-phase1-current-state-completion-audit.mjs")) {
  const audit = checkPhase1CurrentStateCompletionAudit();
  console.log(`Phase 1 2026-08-25 historical current-state audit passed: ${audit.ledger.rawEvidenceNumerator}/${audit.ledger.rawEvidenceDenominator} raw credits; ${audit.ledger.immutableArchiveCompleteRows}/31 immutable, 0/31 production admitted at that snapshot; the later two-row federal admission is validated separately.`);
}
