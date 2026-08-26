import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { validateArchiveExerciseReadback } from "./check-phase1-archive-exercise-readback.mjs";
import { validatePhase1OutreachReplyAudit } from "./check-phase1-outreach-reply-audit.mjs";
import { validate as validateFederalAdmission } from "./check-phase1-federal-electoral-production-admission.mjs";

const read = (file) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));

export function validatePhase1CurrentStateCompletionAudit(audit, ledger, readiness, immutable, wildfire, outreach, partialOutreach, access, replyAudit, routeAudit) {
  assert.equal(audit.schemaVersion, 1);
  assert.equal(audit.status, "blocked-zero-of-31-production-complete");
  assert.equal(audit.asOf, "2026-08-25");
  assert.match(audit.notice, /nine named source\/scope decisions.*two national source-ledger-only decisions.*two Quebec source-ledger-only decisions.*PLVI raw\/derived scope decision.*no transformation admission.*production eligibility/i);
  assert.equal(ledger.entries.length, 31);
  assert.equal(audit.rows.length, 31);
  assert.deepEqual(audit.rows.map(({ id }) => id), ledger.entries.map(({ id }) => id));
  validateFederalAdmission(read("data/phase1-federal-electoral-production-admission.json"));
  const snapshotLedger = structuredClone(ledger);
  for (const id of ["fed-2023-ridings", "elections-canada-45th-files"]) {
    const current = ledger.entries.find((entry) => entry.id === id);
    assert.equal(current?.evidenceState, "production-admitted");
    assert.equal(current?.proof?.productionAdmission, true);
    assert.equal(current?.productionEligible, true);
    const snapshot = snapshotLedger.entries.find((entry) => entry.id === id);
    snapshot.evidenceState = "remote-verified-archived-profiled";
    snapshot.proof.productionAdmission = false;
    snapshot.productionEligible = false;
  }
  const stateCounts = Object.fromEntries(Object.entries(Object.groupBy(snapshotLedger.entries, ({ evidenceState }) => evidenceState)).map(([state, rows]) => [state, rows.length]));
  assert.deepEqual(audit.ledger.evidenceStateCounts, stateCounts);
  assert.equal(audit.ledger.rawEvidenceNumerator, ledger.rawEvidenceNumerator);
  assert.equal(audit.ledger.rawEvidenceDenominator, ledger.entries.length);
  assert.equal(audit.ledger.formalEvidenceTrackingPercentage, ledger.formalProgress.percentage);
  assert.equal(audit.ledger.immutableArchiveCompleteRows, ledger.entries.filter(({ proof }) => proof.immutableArchive).length);
  assert.equal(audit.ledger.productionAdmissionCompleteRows, snapshotLedger.entries.filter(({ proof }) => proof.productionAdmission).length);
  assert.equal(audit.ledger.productionEligibleRows, snapshotLedger.entries.filter(({ productionEligible }) => productionEligible).length);
  assert.equal(audit.ledger.ownerSourceDecisionRecordedRows, readiness.counts["owner-decision-recorded"]);
  assert.equal(audit.ledger.ownerDownstreamScopeRecordedAwaitingArchiveRows, readiness.counts["owner-scope-decision-recorded-awaiting-archive"]);
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
  const readinessById = new Map(readiness.entries.map((entry) => [entry.id, entry]));
  const accessById = new Map(access.rankedRows.map((entry) => [entry.id, entry]));
  const outreachById = new Map(outreach.messages.map((message) => [message.id, message]));
  const partialById = new Map(partialOutreach.requests.map((request) => [request.id, request]));
  for (const row of audit.rows) {
    const source = snapshotLedger.entries.find(({ id }) => id === row.id);
    assert.ok(audit.actionPlans[row.actionPlan]?.length >= 4, `${row.id} must have a complete ordered action plan`);
    assert.equal(source.productionEligible, false);
    const decision = readinessById.get(row.id);
    if (source.evidenceState === "access-blocked") {
      assert.equal(row.actionPlan, "access-blocked"); assert.ok(covered.has(row.id)); assert.equal(accessById.get(row.id).lawfulAcquisitionNow, false);
      assert.ok(row.outreachMessageIds.length >= 1);
      for (const id of row.outreachMessageIds) assert.ok(outreachById.get(id).canonicalRowIds.includes(row.id));
    } else if (source.evidenceState === "partial-component") {
      assert.equal(decision.readiness, "external-evidence-blocked"); assert.ok(row.outreachRequestIds.length >= 1);
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
