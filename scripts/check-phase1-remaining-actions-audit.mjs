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
  ["national-two-artifacts", { rows: ["fed-2023-ridings", "elections-canada-45th-files"], physicalArtifactCount: 1 }],
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

function validateLocalPreflight(group, expected) {
  const receipt = group.localPreflight;
  assert.ok(receipt, `${group.id} is missing its local preflight receipt.`);
  assert.equal(receipt.status, "passed-no-write");
  assert.match(receipt.command, /--preflight/);
  assert.doesNotMatch(receipt.command, /--run|--execute/);
  assert.equal(receipt.dataRoot, "/Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree-data");
  assert.equal(receipt.sourceFiles, expected.sourceFiles);
  assert.equal(receipt.sourceBytes, expected.sourceBytes);
  assert.equal(receipt.remoteCalls, 0);
  assert.equal(receipt.totpPrompted, false);
  assert.equal(receipt.writePerformed, false);
  for (const reference of expected.references || []) assert.ok(fileExists(reference), `${group.id} references missing ${reference}`);
  if (expected.artifacts) assert.deepEqual(receipt.verifiedArtifacts, expected.artifacts);
  if (expected.manifest) assert.deepEqual(receipt.deterministicManifest, expected.manifest);
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
  assert.equal(seenRows.size, 9);
  const national = audit.physicalArtifactGroups.find(({ id }) => id === "national-two-artifacts");
  assert.equal(national.runner, "scripts/run-phase1-approved-promotion.sh");
  validateLocalPreflight(national, {
    sourceFiles: 1,
    sourceBytes: 10301648,
    artifacts: [
      { id: "elections-canada-federal-electoral-districts-45th-general-election-2025-shp", relativePath: "raw/elections-canada-federal-electoral-districts/2026-08-14/FederalElectoralDistricts_2025_SHP.zip", byteLength: 10301648, sha256: "4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93", remoteCreditAlreadyPresent: false }
    ]
  });
  assert.equal(national.localPreflight.plannedSidecarKeys.length, 1);
  assert.ok(national.localPreflight.plannedSidecarKeys.every((key) => key.endsWith("/manifest.json")));
  const wildfire = audit.physicalArtifactGroups.find(({ id }) => id === "current-wildfire-six-release-inputs");
  assert.equal(wildfire.runner, "scripts/run-current-wildfire-approved-promotion.sh");
  assert.equal(wildfire.currentStatus.includes("four-of-six"), true);
  const qc = audit.physicalArtifactGroups.find(({ id }) => id === "quebec-provincial-current-and-original");
  assert.equal(qc.runner, "scripts/run-qc-approved-multipart-promotion.sh");
  validateLocalPreflight(qc, {
    sourceFiles: 2,
    sourceBytes: 23644142702,
    artifacts: [
      { id: "qc-ecoforest-map-2026-08-14", relativePath: "raw/qc-current-ecoforest/2026-08-14/CARTE_ECO_MAJ_PROV_GPKG.zip", byteLength: 12399475076, sha256: "c67c56b0c101e95bef4fbca53a06e2f1578fe38293961017f70d815209740cf1", payloadKey: "raw/qc-ecoforest-map/undeclared/2026-08-14T09-00-15Z/c67c56b0c101e95bef4fbca53a06e2f1578fe38293961017f70d815209740cf1/payload/carte_eco_maj_prov_gpkg.zip", manifestKey: "raw/qc-ecoforest-map/undeclared/2026-08-14T09-00-15Z/c67c56b0c101e95bef4fbca53a06e2f1578fe38293961017f70d815209740cf1/manifest.json" },
      { id: "qc-original-current-inventory-2026-08-14", relativePath: "raw/qc-original-current-inventory/2026-08-14/CARTE_ECO_ORI_PROV_GPKG.zip", byteLength: 11244667626, sha256: "c10d691516569de76642dc1fc64e662f2569b5b58ab5d945b58b8b7834ba9c61", payloadKey: "raw/qc-original-inventory/undeclared/2026-08-14T15-15-58Z/c10d691516569de76642dc1fc64e662f2569b5b58ab5d945b58b8b7834ba9c61/payload/carte_eco_ori_prov_gpkg.zip", manifestKey: "raw/qc-original-inventory/undeclared/2026-08-14T15-15-58Z/c10d691516569de76642dc1fc64e662f2569b5b58ab5d945b58b8b7834ba9c61/manifest.json" }
    ]
  });
  const fourth = audit.physicalArtifactGroups.find(({ id }) => id === "quebec-fourth-inventory-56-sheet-product");
  assert.equal(fourth.runner, "scripts/qc-fourth-inventory-immutable-promotion.mjs");
  validateLocalPreflight(fourth, {
    sourceFiles: 61,
    sourceBytes: 16179014954,
    references: ["data/qc-fourth-inventory-immutable-promotion-preparation.json", "data/qc-fourth-inventory-immutable-promotion-iam-policy.json"],
    manifest: { byteLength: 76127, sha256: "b3d85d1da40d68d79742c77ec418713f2ef968f74845c43e011df274d559616c", generatedInMemory: true }
  });
  assert.equal(fourth.localPreflight.exactObjectKeys, 62);
  assert.equal(fourth.localPreflight.multipartPayloads, 6);
}

export function validatePhase1RemainingActionsAudit(audit, ledger, currentState, readiness, immutable, wildfire, replyAudit, partialOutreach, accessBlocker) {
  assert.equal(audit.schemaVersion, "witness-tree/phase1-remaining-actions-audit/1");
  assert.equal(audit.status, "blocked-read-only");
  assert.match(audit.notice, /no AWS call.*email.*form submission.*production-eligibility change/i);
  assert.match(audit.selectionRule, /immutable remote proof is absent OR production admission is absent/i);
  assert.match(audit.scoreFormula, /30 \* raw-credit delta \/ 31/);
  assert.equal(audit.derivedFromHead, "ffe949e9a426b3276339cb3fb4e975455f0d2f13");
  assert.deepEqual(audit.claims, CLAIMS);

  const entries = ledger.entries;
  const ids = entries.map(({ id }) => id);
  const stateCounts = Object.fromEntries(Object.entries(Object.groupBy(entries, ({ evidenceState }) => evidenceState)).map(([state, rows]) => [state, rows.length]));
  assert.equal(entries.length, 31);
  assert.deepEqual(audit.baseline.evidenceStateCounts, stateCounts);
  assert.deepEqual(audit.baseline.evidenceStateCounts, { "remote-verified-archived-profiled": 11, "local-verified-profiled": 5, "partial-component": 2, "access-blocked": 13 });
  assert.equal(audit.baseline.rawEvidenceNumerator, ledger.rawEvidenceNumerator);
  assert.equal(audit.baseline.rawEvidenceDenominator, entries.length);
  assert.equal(audit.baseline.formalEvidenceTrackingPercentage, ledger.formalProgress.percentage);
  assert.equal(audit.baseline.formalEvidenceTrackingPercentage, 39.7580645);
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
  assert.deepEqual(currentState.globalGates.immutableArchives, { status: "blocked", completeRows: 11, localRowsAwaitingArchive: 5, sourceEvidenceBlockedRows: 15, currentWildfireRequiredObjects: 6, currentWildfireVerifiedObjects: 4 });
  assert.equal(currentState.globalGates.outreach.repliesRecorded, replyAudit.counts.substantiveReplyRecords);
  assert.equal(currentState.globalGates.outreach.accessBlockedRowsWithSubstantiveReply, replyAudit.counts.accessBlockedRowsWithSubstantiveReply);
  assert.equal(partialOutreach.status, "owner-review-only-not-sent");
  assert.equal(accessBlocker.status, "all-13-access-blocked-no-lawful-acquisition");
  assert.equal(readiness.entries.length, entries.length);

  assert.deepEqual(audit.scope, { auditedRowCount: 31, rowsWithoutImmutableRemoteProof: 20, rowsWithoutProductionAdmission: 31, rowsSelectedByRule: 31, allProductionRowsRemainNonAdmitted: true, allProductionRowsRemainIneligible: true });
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
