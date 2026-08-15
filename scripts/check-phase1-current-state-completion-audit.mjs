import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (file) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));

export function validatePhase1CurrentStateCompletionAudit(audit, ledger, readiness, immutable, wildfire, outreach, partialOutreach, access) {
  assert.equal(audit.schemaVersion, 1);
  assert.equal(audit.status, "blocked-zero-of-31-production-complete");
  assert.match(audit.notice, /records no new archive.*production eligibility/i);
  assert.equal(ledger.entries.length, 31);
  assert.equal(audit.rows.length, 31);
  assert.deepEqual(audit.rows.map(({ id }) => id), ledger.entries.map(({ id }) => id));
  const stateCounts = Object.fromEntries(Object.entries(Object.groupBy(ledger.entries, ({ evidenceState }) => evidenceState)).map(([state, rows]) => [state, rows.length]));
  assert.deepEqual(audit.ledger.evidenceStateCounts, stateCounts);
  assert.equal(audit.ledger.rawEvidenceNumerator, ledger.rawEvidenceNumerator);
  assert.equal(audit.ledger.rawEvidenceDenominator, ledger.entries.length);
  assert.equal(audit.ledger.formalEvidenceTrackingPercentage, ledger.formalProgress.percentage);
  assert.equal(audit.ledger.immutableArchiveCompleteRows, ledger.entries.filter(({ proof }) => proof.immutableArchive).length);
  assert.equal(audit.ledger.productionAdmissionCompleteRows, ledger.entries.filter(({ proof }) => proof.productionAdmission).length);
  assert.equal(audit.ledger.productionEligibleRows, ledger.entries.filter(({ productionEligible }) => productionEligible).length);
  assert.equal(audit.ledger.ownerSourceDecisionRecordedRows, readiness.counts["owner-decision-recorded"]);
  assert.equal(audit.ledger.ownerDownstreamScopeRecordedAwaitingArchiveRows, readiness.counts["owner-scope-decision-recorded-awaiting-archive"]);
  assert.deepEqual(audit.globalGates.immutableArchives, {status:"blocked", completeRows:9, localRowsAwaitingArchive:7, sourceEvidenceBlockedRows:15, currentWildfireRequiredObjects:6, currentWildfireVerifiedObjects:4});
  assert.equal(wildfire.archiveGate.requiredObjectCount, 6);
  assert.equal(wildfire.archiveGate.verifiedObjectCount, 4);
  assert.equal(immutable.physicalArtifactGroups.find(({ id }) => id === "current-wildfire-six-release-inputs").physicalArtifactCount, 6);
  const exercise = audit.globalGates.normalArchiveExercise;
  assert.equal(exercise.status, "not-integrated"); assert.equal(exercise.evidenceRef, null); assert.equal(exercise.complete, false);
  assert.equal(exercise.requiredEvidence.length, 4);
  assert.ok(existsSync(new URL(`../${exercise.runner}`, import.meta.url))); assert.ok(existsSync(new URL(`../${exercise.checker}`, import.meta.url)));
  const sent = outreach.messages.filter(({ status }) => status === "sent-awaiting-response");
  const existing = outreach.messages.filter(({ status }) => status === "already-sent-awaiting-response-no-new-message");
  const covered = new Set(outreach.messages.flatMap(({ canonicalRowIds }) => canonicalRowIds));
  assert.deepEqual(audit.globalGates.outreach, {accessBlockedRows:13, accessRowsCoveredBySentOutreach:13, verifiedNewSends:sent.length, preExistingRequests:existing.length, repliesRecorded:0, partialComponentDrafts:partialOutreach.requests.length, partialComponentDraftsSent:0});
  assert.equal(partialOutreach.status, "owner-review-only-not-sent");
  assert.equal(access.status, "all-13-access-blocked-no-lawful-acquisition");
  const readinessById = new Map(readiness.entries.map((entry) => [entry.id, entry]));
  const accessById = new Map(access.rankedRows.map((entry) => [entry.id, entry]));
  const outreachById = new Map(outreach.messages.map((message) => [message.id, message]));
  const partialById = new Map(partialOutreach.requests.map((request) => [request.id, request]));
  for (const row of audit.rows) {
    const source = ledger.entries.find(({ id }) => id === row.id);
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
  return validatePhase1CurrentStateCompletionAudit(read("data/phase1-current-state-completion-audit.json"), read("data/phase1-production-source-ledger.json"), read("data/phase1-source-ledger-decision-readiness.json"), read("data/phase1-immutable-promotion-readiness.json"), read("data/current-wildfire-owner-admission.json"), read("data/phase1-permission-outreach-package.json"), read("data/partial-ledger-owner-review-outreach-package.json"), read("data/phase1-access-blocker-resolution.json"));
}

if (process.argv[1]?.endsWith("check-phase1-current-state-completion-audit.mjs")) {
  const audit = checkPhase1CurrentStateCompletionAudit();
  console.log(`Phase 1 current-state audit passed: ${audit.ledger.rawEvidenceNumerator}/${audit.ledger.rawEvidenceDenominator} raw credits; ${audit.ledger.immutableArchiveCompleteRows}/31 immutable, 0/31 production admitted, 0/31 eligible.`);
}
