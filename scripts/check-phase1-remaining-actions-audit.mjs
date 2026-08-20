import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (file) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
const fileExists = (file) => existsSync(new URL(`../${file}`, import.meta.url));
const formalDelta = (rawCreditDelta) => Number((30 * rawCreditDelta / 31).toFixed(7));

const CLAIMS = {
  remoteMutationPerformed: false,
  ownerDecisionCreated: false,
  externalReplyReceived: false,
  permissionGranted: false,
  transformed: false,
  ingested: false,
  released: false,
  productionAdmission: false,
  productionEligible: false
};

const EXPECTED_GROUPS = new Map([
  ["national-two-artifacts", { rows: ["ntems-canopy-height", "fed-2023-ridings", "elections-canada-45th-files"], physicalArtifactCount: 2 }],
  ["current-wildfire-six-release-inputs", { rows: ["cwfis-current", "bc-wildfire", "ab-wildfire", "on-fire-disturbance"], physicalArtifactCount: 6 }],
  ["quebec-provincial-current-and-original", { rows: ["qc-current-ecoforest", "qc-original-current-inventory"], physicalArtifactCount: 2 }],
  ["quebec-fourth-inventory-56-sheet-product", { rows: ["qc-fourth-inventory"], physicalArtifactCount: 62 }]
]);

function assertExistingReferences(audit) {
  for (const action of audit.actions) {
    for (const reference of action.evidenceRefs) assert.ok(fileExists(reference), `${action.id} references missing ${reference}`);
    const commandText = JSON.stringify(action.runnerOrPreflight);
    for (const match of commandText.matchAll(/(?:scripts|data)\/[A-Za-z0-9_./-]+\.(?:mjs|sh|json)/g)) {
      assert.ok(fileExists(match[0]), `${action.id} references missing runner/evidence ${match[0]}`);
    }
  }
}

function validatePhysicalArtifactGroups(audit, immutable) {
  assert.deepEqual(audit.physicalArtifactGroups.map(({ id }) => id), [...EXPECTED_GROUPS.keys()]);
  const seenRows = new Set();
  for (const [id, expected] of EXPECTED_GROUPS) {
    const group = audit.physicalArtifactGroups.find((candidate) => candidate.id === id);
    assert.deepEqual(group.rows, expected.rows, `${id} row mapping drifted`);
    assert.equal(group.physicalArtifactCount, expected.physicalArtifactCount, `${id} physical count drifted`);
    for (const row of group.rows) assert.equal(seenRows.has(row), false, `${row} is duplicated across physical groups`);
    group.rows.forEach((row) => seenRows.add(row));
    const canonical = immutable.physicalArtifactGroups.find((candidate) => candidate.id === id);
    assert.ok(canonical, `canonical physical group ${id} is missing`);
    assert.equal(canonical.physicalArtifactCount, group.physicalArtifactCount);
    assert.deepEqual([...canonical.productionRowIds], group.rows);
  }
  assert.equal(seenRows.size, 10);
  const national = audit.physicalArtifactGroups.find(({ id }) => id === "national-two-artifacts");
  assert.equal(national.runner, "scripts/run-phase1-approved-promotion.sh");
  const wildfire = audit.physicalArtifactGroups.find(({ id }) => id === "current-wildfire-six-release-inputs");
  assert.equal(wildfire.runner, "scripts/run-current-wildfire-approved-promotion.sh");
  assert.equal(wildfire.currentStatus.includes("four-of-six"), true);
  const qc = audit.physicalArtifactGroups.find(({ id }) => id === "quebec-provincial-current-and-original");
  assert.equal(qc.runner, "scripts/run-qc-approved-multipart-promotion.sh");
  const fourth = audit.physicalArtifactGroups.find(({ id }) => id === "quebec-fourth-inventory-56-sheet-product");
  assert.equal(fourth.runner, "scripts/qc-fourth-inventory-immutable-promotion.mjs");
}

export function validatePhase1RemainingActionsAudit(audit, ledger, currentState, readiness, immutable, wildfire, replyAudit, partialOutreach, accessBlocker) {
  assert.equal(audit.schemaVersion, "witness-tree/phase1-remaining-actions-audit/1");
  assert.equal(audit.status, "blocked-read-only");
  assert.match(audit.notice, /no AWS call.*email.*form submission.*production-eligibility change/i);
  assert.match(audit.selectionRule, /immutable remote proof is absent OR production admission is absent/i);
  assert.match(audit.scoreFormula, /30 \* raw-credit delta \/ 31/);
  assert.equal(audit.derivedFromHead, "650a7dae46211d7f86883b84575b6957fdb8fcd1");
  assert.deepEqual(audit.claims, CLAIMS);

  const entries = ledger.entries;
  const ids = entries.map(({ id }) => id);
  const stateCounts = Object.fromEntries(Object.entries(Object.groupBy(entries, ({ evidenceState }) => evidenceState)).map(([state, rows]) => [state, rows.length]));
  assert.equal(entries.length, 31);
  assert.deepEqual(audit.baseline.evidenceStateCounts, stateCounts);
  assert.deepEqual(audit.baseline.evidenceStateCounts, { "remote-verified-archived-profiled": 10, "local-verified-profiled": 6, "partial-component": 2, "access-blocked": 13 });
  assert.equal(audit.baseline.rawEvidenceNumerator, ledger.rawEvidenceNumerator);
  assert.equal(audit.baseline.rawEvidenceDenominator, entries.length);
  assert.equal(audit.baseline.formalEvidenceTrackingPercentage, ledger.formalProgress.percentage);
  assert.equal(audit.baseline.formalEvidenceTrackingPercentage, 39.516129);
  assert.equal(audit.baseline.immutableArchiveCompleteRows, entries.filter(({ proof }) => proof.immutableArchive).length);
  assert.equal(audit.baseline.productionAdmissionCompleteRows, entries.filter(({ proof }) => proof.productionAdmission).length);
  assert.equal(audit.baseline.productionEligibleRows, entries.filter(({ productionEligible }) => productionEligible).length);
  assert.equal(audit.baseline.substantiveReplyRecords, replyAudit.counts.substantiveReplyRecords);
  assert.equal(audit.baseline.accessBlockedRowsWithSubstantiveReply, replyAudit.counts.accessBlockedRowsWithSubstantiveReply);
  assert.equal(audit.baseline.currentWildfireArchiveGate.requiredObjects, wildfire.archiveGate.requiredObjectCount);
  assert.equal(audit.baseline.currentWildfireArchiveGate.verifiedObjects, wildfire.archiveGate.verifiedObjectCount);
  assert.equal(audit.baseline.currentWildfireArchiveGate.productionEligible, wildfire.archiveGate.productionEligible);

  assert.equal(currentState.ledger.totalRows, entries.length);
  assert.deepEqual(currentState.ledger.evidenceStateCounts, audit.baseline.evidenceStateCounts);
  assert.equal(currentState.ledger.rawEvidenceNumerator, audit.baseline.rawEvidenceNumerator);
  assert.equal(currentState.ledger.formalEvidenceTrackingPercentage, audit.baseline.formalEvidenceTrackingPercentage);
  assert.equal(currentState.ledger.immutableArchiveCompleteRows, audit.baseline.immutableArchiveCompleteRows);
  assert.equal(currentState.ledger.productionAdmissionCompleteRows, 0);
  assert.equal(currentState.ledger.productionEligibleRows, 0);
  assert.deepEqual(currentState.globalGates.immutableArchives, { status: "blocked", completeRows: 10, localRowsAwaitingArchive: 6, sourceEvidenceBlockedRows: 15, currentWildfireRequiredObjects: 6, currentWildfireVerifiedObjects: 4 });
  assert.equal(currentState.globalGates.outreach.repliesRecorded, replyAudit.counts.substantiveReplyRecords);
  assert.equal(currentState.globalGates.outreach.accessBlockedRowsWithSubstantiveReply, replyAudit.counts.accessBlockedRowsWithSubstantiveReply);
  assert.equal(partialOutreach.status, "owner-review-only-not-sent");
  assert.equal(accessBlocker.status, "all-13-access-blocked-no-lawful-acquisition");
  assert.equal(readiness.entries.length, entries.length);

  assert.deepEqual(audit.scope, { auditedRowCount: 31, rowsWithoutImmutableRemoteProof: 21, rowsWithoutProductionAdmission: 31, rowsSelectedByRule: 31, allProductionRowsRemainNonAdmitted: true, allProductionRowsRemainIneligible: true });
  assert.equal(entries.filter(({ proof }) => !proof.immutableArchive).length, audit.scope.rowsWithoutImmutableRemoteProof);
  assert.equal(entries.filter(({ proof }) => !proof.productionAdmission).length, audit.scope.rowsWithoutProductionAdmission);
  validatePhysicalArtifactGroups(audit, immutable);

  const actionsById = new Map(audit.actions.map((action) => [action.id, action]));
  assert.equal(actionsById.size, audit.actions.length);
  assert.deepEqual(audit.actions.map(({ rank }) => rank), Array.from({ length: audit.actions.length }, (_, index) => index + 1));
  assert.equal(audit.actions.length, 13);
  assertExistingReferences(audit);
  for (const action of audit.actions) {
    assert.ok(action.id);
    assert.equal(action.ownerRunAuthorized, false, `${action.id} cannot authorize an owner run`);
    assert.equal(action.scoreImpact.currentRawCreditDelta, 0, `${action.id} must not claim immediate credit`);
    assert.equal(action.scoreImpact.maximumFormalPercentagePointDelta, formalDelta(action.scoreImpact.maximumRawCreditDelta), `${action.id} formal delta is not formula-bound`);
    assert.ok(action.scoreImpact.maximumRawCreditDelta >= 0);
    assert.ok(action.scoreImpact.productionAdmissionDelta >= 0);
    for (const row of action.rows) assert.ok(ids.includes(row), `${action.id} references unknown row ${row}`);
    assert.equal(new Set(action.rows).size, action.rows.length, `${action.id} duplicates a row`);
    if (action.executableNow) {
      assert.equal(action.requiresOwnerInput, true);
      assert.equal(typeof action.runnerOrPreflight.safeNow, "string");
      assert.match(action.executionBoundary, /preflight|dry-run|no-write/i);
    }
  }

  assert.equal(audit.nextFive.length, 5);
  assert.deepEqual(audit.nextFive, audit.actions.slice(0, 5).map(({ id }) => id));
  assert.deepEqual(audit.nextFive.map((id) => actionsById.get(id).rank), [1, 2, 3, 4, 5]);

  assert.equal(audit.rowCoverage.length, entries.length);
  assert.deepEqual(audit.rowCoverage.map(({ id }) => id), ids);
  for (const coverage of audit.rowCoverage) {
    const entry = entries.find(({ id }) => id === coverage.id);
    assert.equal(coverage.evidenceState, entry.evidenceState);
    assert.equal(coverage.immutableRemoteProof, entry.proof.immutableArchive);
    assert.equal(coverage.currentRawCredit, entry.rawCredit);
    assert.equal(coverage.productionAdmission, entry.proof.productionAdmission);
    assert.equal(coverage.productionEligible, entry.productionEligible);
    const maximumRawCreditDelta = 1 - entry.rawCredit;
    assert.equal(coverage.maximumRawCreditDeltaToRemote, maximumRawCreditDelta);
    assert.equal(coverage.maximumFormalPercentagePointDeltaToRemote, formalDelta(maximumRawCreditDelta));
    assert.ok(coverage.remainingActionIds.length >= 1);
    for (const actionId of coverage.remainingActionIds) {
      const action = actionsById.get(actionId);
      assert.ok(action, `${coverage.id} references unknown action ${actionId}`);
      assert.ok(action.rows.includes(coverage.id), `${coverage.id} is not covered by ${actionId}`);
    }
    assert.ok(coverage.remainingActionIds.includes("production-admission-and-release-gate"));
  }
  return audit;
}

export function checkPhase1RemainingActionsAudit() {
  return validatePhase1RemainingActionsAudit(
    read("data/phase1-remaining-actions-audit.json"),
    read("data/phase1-production-source-ledger.json"),
    read("data/phase1-current-state-completion-audit.json"),
    read("data/phase1-source-ledger-decision-readiness.json"),
    read("data/phase1-immutable-promotion-readiness.json"),
    read("data/current-wildfire-owner-admission.json"),
    read("data/phase1-outreach-reply-audit.json"),
    read("data/partial-ledger-owner-review-outreach-package.json"),
    read("data/phase1-access-blocker-resolution.json")
  );
}

if (process.argv[1]?.endsWith("check-phase1-remaining-actions-audit.mjs")) {
  const audit = checkPhase1RemainingActionsAudit();
  console.log(`Phase 1 remaining-action audit passed: ${audit.rowCoverage.length} rows, ${audit.actions.length} ranked actions, baseline ${audit.baseline.formalEvidenceTrackingPercentage}%.`);
}
