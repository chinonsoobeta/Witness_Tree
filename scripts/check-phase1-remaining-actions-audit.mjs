import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { validate as validateFederalAdmission } from "./check-phase1-federal-electoral-production-admission.mjs";

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

const LOCAL_AUDIT_HEAD = "9bf5baa2ecc51ce4c039531e798bfb6418e3baaf";
const LOCAL_AUDIT_CATEGORIES = new Map([
  ["archive-preflight-and-readback", ["national-local-archive-preflight-and-owner-promotion", "quebec-fourth-archive-preflight-and-owner-approvals", "current-wildfire-derived-archive-preflight-and-owner-promotion", "normal-archive-control-exercise"]],
  ["profiles-and-validators", ["national-archived-owner-source-ledger-decisions", "plvi-transformation-ingestion-decisions", "archived-remote-transform-ingest-release", "quebec-current-original-transform-ingest-release", "wildfire-transform-ingest-release", "partial-historical-owner-review-and-external-evidence", "partial-boundaries-owner-review-and-external-evidence", "access-blocked-owner-and-external-resolution", "production-admission-and-release-gate"]],
  ["local-transformations-and-derived-outputs", ["plvi-transformation-ingestion-decisions", "archived-remote-transform-ingest-release", "wildfire-transform-ingest-release", "partial-historical-owner-review-and-external-evidence"]],
  ["owner-and-external-boundaries", ["national-archived-owner-source-ledger-decisions", "plvi-transformation-ingestion-decisions", "partial-historical-owner-review-and-external-evidence", "partial-boundaries-owner-review-and-external-evidence", "access-blocked-owner-and-external-resolution"]],
  ["production-admission-boundary", ["archived-remote-transform-ingest-release", "wildfire-transform-ingest-release", "production-admission-and-release-gate"]]
]);
const LOCAL_AUDIT_GAPS = new Set([
  "ntems-target-transformation-and-ingestion",
  "avi-downstream-scope",
  "quebec-current-original-downstream-scope",
  "plvi-scope-and-ingestion",
  "wildfire-derived-live-readbacks",
  "local-archive-groups-live-evidence",
  "partial-and-access-artifact-resolution"
]);
const OWNER_RUN_APPROVALS = new Map([
  ["national-local-archive-preflight-and-owner-promotion", "federal-electoral-archive"],
  ["quebec-fourth-archive-preflight-and-owner-approvals", "quebec-fourth-inventory-archive"],
  ["current-wildfire-derived-archive-preflight-and-owner-promotion", "current-wildfire-exact-archive-proof"],
  ["normal-archive-control-exercise", "archive-control"]
]);
const RETAIN_UNTIL = "2033-08-12T00:00:00Z";
const EXACT_APPROVALS = {
  "federal-electoral-archive": { rows: ["fed-2023-ridings", "elections-canada-45th-files"], preflight: "zsh scripts/run-phase1-approved-promotion.sh --preflight", commandKey: "ownerCommand", command: "zsh scripts/run-phase1-approved-promotion.sh --run-federal", payloadsOnly: false },
  "quebec-current-original-archive": { rows: ["qc-current-ecoforest", "qc-original-current-inventory"], preflight: "zsh scripts/run-qc-approved-multipart-promotion.sh --preflight", commandKey: "ownerCommand", command: "zsh scripts/run-qc-approved-multipart-promotion.sh --run", payloadsOnly: false },
  "quebec-fourth-inventory-archive": { rows: ["qc-fourth-inventory"], preflight: "node scripts/qc-fourth-inventory-immutable-promotion.mjs --preflight --data-root /Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree-data", commandKey: "ownerCommandTemplate", command: "node scripts/qc-fourth-inventory-immutable-promotion.mjs --execute --approve-exact-artifact-set --approve-iam-policy --approve-compliance-retention --approve-mfa-session --retention-until 2033-08-12T00:00:00Z --session-ready --data-root <controlled-absolute-path> --state-dir <controlled-absolute-path> --sidecar-dir <controlled-absolute-path>", payloadsOnly: false },
  "current-wildfire-exact-archive-proof": { rows: ["cwfis-current", "bc-wildfire", "ab-wildfire", "on-fire-disturbance"], preflight: "zsh scripts/run-wildfire-derived-readback.sh --preflight <owner-owned-mode-600-copy-of-readback-approval>", commandKey: null, command: null, payloadsAndManifests: true },
};

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
  assert.match(wildfire.currentStatus, /six of six.*machine-verifiably.*recovery replica.*separate/i);
  validateLocalPreflight(wildfire, { sourceFiles: 4, sourceBytes: 24783566 });
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

function validateLocalImplementationAudit(local, actions, ledger) {
  assert.equal(local.status, "local-gates-complete-owner-or-external-blockers-remain");
  assert.equal(local.derivedFromHead, LOCAL_AUDIT_HEAD);
  assert.match(local.notice, /without granting.*production admission.*Phase 2/i);
  const actionById = new Map(actions.map((action) => [action.id, action]));
  assert.equal(local.requirementCategories.length, LOCAL_AUDIT_CATEGORIES.size);
  const coveredActions = new Set();
  for (const category of local.requirementCategories) {
    const expected = LOCAL_AUDIT_CATEGORIES.get(category.id);
    assert.ok(expected, `Unknown local implementation category ${category.id}.`);
    assert.deepEqual(category.actionIds, expected, `${category.id} action coverage drifted.`);
    assert.equal(category.ownerIndependent, category.id !== "owner-and-external-boundaries");
    assert.equal(category.scoreImpact.rawCreditDelta, 0);
    assert.equal(category.scoreImpact.formalPercentagePointDelta, 0);
    for (const actionId of category.actionIds) {
      assert.ok(actionById.has(actionId), `${category.id} references an unknown action ${actionId}.`);
      coveredActions.add(actionId);
    }
    for (const path of category.paths) assert.ok(fileExists(path), `${category.id} references missing local path ${path}.`);
  }
  assert.deepEqual([...coveredActions].sort(), actions.map(({ id }) => id).sort(), "Local implementation categories must cover every remaining action.");
  assert.deepEqual(new Set(local.gaps.map(({ id }) => id)), LOCAL_AUDIT_GAPS);
  for (const gap of local.gaps) {
    assert.ok(gap.rows.length > 0, `${gap.id} must identify affected rows.`);
    assert.ok(gap.actionIds.length > 0, `${gap.id} must identify remaining actions.`);
    for (const actionId of gap.actionIds) {
      const action = actionById.get(actionId);
      assert.ok(action, `${gap.id} references an unknown action ${actionId}.`);
    }
    for (const row of gap.rows) assert.equal(gap.actionIds.some((actionId) => actionById.get(actionId).rows.includes(row)), true, `${gap.id} maps ${row} outside its remaining actions.`);
    assert.equal(gap.scoreImpact.rawCreditDelta, 0, `${gap.id} must claim no immediate credit.`);
    assert.equal(gap.safeLocalImplementation, gap.id === "local-archive-groups-live-evidence", `${gap.id} safeLocalImplementation drifted.`);
    assert.equal(gap.ownerOrExternalPrerequisite, true);
  }
  const gapRows = [...new Set(local.gaps.flatMap(({ rows }) => rows))].sort();
  const ledgerRows = ledger.entries.map(({ id }) => id).sort();
  assert.deepEqual(gapRows, ledgerRows, "Local implementation gap rows must cover the exact 31-row production ledger.");
  assert.equal(local.coverage.remainingActionCount, actions.length);
  assert.equal(local.coverage.ownerIndependentGapsRemaining, 0);
  assert.equal(local.coverage.localGatesIncomplete, 0);
  assert.equal(local.coverage.deferredOwnerOrExternalGaps, local.gaps.length);
  assert.deepEqual(local.coverage.scoreDelta, { rawCreditDelta: 0, formalPercentagePointDelta: 0 });
  assert.equal(local.coverage.allProductionAdmissionFalse, true);
  assert.equal(local.coverage.allProductionEligibleFalse, true);
  assert.equal(ledger.entries.every((entry) => entry.proof.productionAdmission === false && entry.productionEligible === false), true);
}

export function validatePhase1RemainingActionsAudit(audit, ledger, currentState, readiness, immutable, wildfire, replyAudit, partialOutreach, accessBlocker, approvals) {
  assert.equal(audit.schemaVersion, "witness-tree/phase1-remaining-actions-audit/1");
  assert.equal(audit.status, "blocked-read-only");
  assert.match(audit.notice, /no AWS call.*email.*form submission.*production-eligibility change/i);
  assert.match(audit.selectionRule, /immutable remote proof is absent OR production admission is absent/i);
  assert.match(audit.scoreFormula, /30 \* raw-credit delta \/ 31/);
  assert.equal(audit.derivedFromHead, "9bf5baa2ecc51ce4c039531e798bfb6418e3baaf");
  assert.deepEqual(audit.claims, CLAIMS);

  validateFederalAdmission(read("data/phase1-federal-electoral-production-admission.json"));
  const historicalLedger = structuredClone(ledger);
  for (const id of ["fed-2023-ridings", "elections-canada-45th-files"]) {
    const current = ledger.entries.find((entry) => entry.id === id);
    assert.equal(current?.evidenceState, "production-admitted");
    assert.equal(current?.proof?.productionAdmission, true);
    assert.equal(current?.productionEligible, true);
    const historical = historicalLedger.entries.find((entry) => entry.id === id);
    historical.evidenceState = "remote-verified-archived-profiled";
    historical.proof.productionAdmission = false;
    historical.productionEligible = false;
  }
  const entries = historicalLedger.entries;
  const ids = entries.map(({ id }) => id);
  const stateCounts = Object.fromEntries(Object.entries(Object.groupBy(entries, ({ evidenceState }) => evidenceState)).map(([state, rows]) => [state, rows.length]));
  assert.equal(entries.length, 31);
  const historicalFederalRecovery = false;
  assert.deepEqual(audit.baseline.evidenceStateCounts, stateCounts, "The historical baseline must match the ledger with only the later two-row federal admission rolled back.");
  assert.deepEqual(audit.baseline.evidenceStateCounts, { "remote-verified-archived-profiled": 16, "partial-component": 2, "access-blocked": 13 });
  assert.ok(historicalFederalRecovery || audit.baseline.rawEvidenceNumerator === ledger.rawEvidenceNumerator);
  assert.equal(audit.baseline.rawEvidenceDenominator, entries.length);
  assert.ok(historicalFederalRecovery || audit.baseline.formalEvidenceTrackingPercentage === ledger.formalProgress.percentage);
  assert.equal(audit.baseline.formalEvidenceTrackingPercentage, 40.9677419);
  assert.ok(historicalFederalRecovery || audit.baseline.immutableArchiveCompleteRows === entries.filter(({ proof }) => proof.immutableArchive).length);
  assert.equal(audit.baseline.productionAdmissionCompleteRows, entries.filter(({ proof }) => proof.productionAdmission).length);
  assert.equal(audit.baseline.productionEligibleRows, entries.filter(({ productionEligible }) => productionEligible).length);
  assert.equal(audit.baseline.substantiveReplyRecords, replyAudit.counts.substantiveReplyRecords);
  assert.equal(audit.baseline.accessBlockedRowsWithSubstantiveReply, replyAudit.counts.accessBlockedRowsWithSubstantiveReply);
  assert.equal(audit.baseline.currentWildfireArchiveGate.requiredObjects, wildfire.archiveGate.requiredObjectCount);
  assert.equal(audit.baseline.currentWildfireArchiveGate.verifiedObjects, wildfire.archiveGate.verifiedObjectCount);
  assert.equal(audit.baseline.currentWildfireArchiveGate.attestedObjects, wildfire.archiveGate.attestedObjectCount);
  assert.equal(audit.baseline.currentWildfireArchiveGate.productionEligible, wildfire.archiveGate.productionEligible);

  assert.equal(currentState.ledger.totalRows, entries.length);
  assert.ok(historicalFederalRecovery || (() => { try { assert.deepEqual(currentState.ledger.evidenceStateCounts, audit.baseline.evidenceStateCounts); return true; } catch { return false; } })());
  assert.ok(historicalFederalRecovery || currentState.ledger.rawEvidenceNumerator === audit.baseline.rawEvidenceNumerator);
  assert.ok(historicalFederalRecovery || currentState.ledger.formalEvidenceTrackingPercentage === audit.baseline.formalEvidenceTrackingPercentage);
  assert.ok(historicalFederalRecovery || currentState.ledger.immutableArchiveCompleteRows === audit.baseline.immutableArchiveCompleteRows);
  assert.equal(currentState.ledger.productionAdmissionCompleteRows, 0);
  assert.equal(currentState.ledger.productionEligibleRows, 0);
  assert.deepEqual(currentState.globalGates.immutableArchives, { status: "blocked", completeRows: 16, localRowsAwaitingArchive: 0, sourceEvidenceBlockedRows: 15, currentWildfireRequiredObjects: 6, currentWildfireVerifiedObjects: 6, currentWildfireAttestedObjects: 0 });
  assert.equal(currentState.globalGates.outreach.repliesRecorded, replyAudit.counts.substantiveReplyRecords);
  assert.equal(currentState.globalGates.outreach.accessBlockedRowsWithSubstantiveReply, replyAudit.counts.accessBlockedRowsWithSubstantiveReply);
  assert.equal(partialOutreach.status, "owner-review-only-not-sent");
  assert.equal(accessBlocker.status, "all-13-access-blocked-no-lawful-acquisition");
  assert.equal(readiness.entries.length, entries.length);

  assert.deepEqual(audit.scope, { auditedRowCount: 31, rowsWithoutImmutableRemoteProof: 15, rowsWithoutProductionAdmission: 31, rowsSelectedByRule: 31, allProductionRowsRemainNonAdmitted: true, allProductionRowsRemainIneligible: true });
  assert.equal(entries.filter(({ proof }) => !proof.immutableArchive).length, audit.scope.rowsWithoutImmutableRemoteProof);
  assert.equal(entries.filter(({ proof }) => !proof.productionAdmission).length, audit.scope.rowsWithoutProductionAdmission);
  validatePhysicalArtifactGroups(audit, immutable);

  const actionsById = new Map(audit.actions.map((action) => [action.id, action]));
  assert.equal(actionsById.size, audit.actions.length);
  assert.deepEqual(audit.actions.map(({ rank }) => rank), Array.from({ length: audit.actions.length }, (_, index) => index + 1));
  assert.equal(audit.actions.length, 13);
  assertExistingReferences(audit);
  assert.deepEqual(approvals.phase1.archiveApprovals.map(({ id }) => id), Object.keys(EXACT_APPROVALS));
  for (const approval of approvals.phase1.archiveApprovals) {
    const expected = EXACT_APPROVALS[approval.id];
    assert.deepEqual(approval.rows, expected.rows); assert.equal(approval.preflight, expected.preflight);
    assert.deepEqual(approval.retention, { mode: "COMPLIANCE", retainUntil: RETAIN_UNTIL, ...(expected.payloadsAndManifests ? { payloadsAndManifests: true } : {}) });
    if (expected.commandKey) assert.equal(approval[expected.commandKey], expected.command);
  }
  assert.equal(approvals.phase1.archiveControlExercise.preflight, "scripts/run-phase1-archive-owner-exercise.sh --preflight");
  assert.equal(approvals.phase1.archiveControlExercise.ownerCommand, "scripts/run-phase1-archive-owner-exercise.sh --run");
  for (const action of audit.actions) {
    assert.ok(action.id);
    const approvalId = OWNER_RUN_APPROVALS.get(action.id);
    assert.equal(action.ownerRunAuthorized, Boolean(approvalId), `${action.id} owner-run authorization drifted`);
    if (approvalId === "archive-control") assert.match(approvals.phase1.archiveControlExercise.status, /^approved-owner-local-execution/);
    else if (approvalId) assert.match(approvals.phase1.archiveApprovals.find(({ id }) => id === approvalId)?.status ?? "", /^approved-owner-local-execution/);
    assert.equal(action.scoreImpact.currentRawCreditDelta, 0, `${action.id} must not claim immediate credit`);
    assert.equal(action.scoreImpact.maximumFormalPercentagePointDelta, formalDelta(action.scoreImpact.maximumRawCreditDelta), `${action.id} formal delta is not formula-bound`);
    assert.ok(action.scoreImpact.maximumRawCreditDelta >= 0);
    assert.ok(action.scoreImpact.productionAdmissionDelta >= 0);
    for (const row of action.rows) assert.ok(ids.includes(row), `${action.id} references unknown row ${row}`);
    assert.equal(new Set(action.rows).size, action.rows.length, `${action.id} duplicates a row`);
    if (action.executableNow) {
      assert.equal(action.requiresOwnerInput, true);
      assert.equal(typeof action.runnerOrPreflight.safeNow, "string");
      assert.match(action.executionBoundary, action.ownerRunAuthorized ? /owner-local|MFA-gated/i : /preflight|dry-run|no-write/i);
    }
  }

  validateLocalImplementationAudit(audit.localImplementationAudit, audit.actions, historicalLedger);

  const wildfireReadbackAction = actionsById.get("current-wildfire-derived-archive-preflight-and-owner-promotion");
  assert.equal(wildfireReadbackAction.runnerOrPreflight.derivedReadbackChecker, "scripts/check-current-wildfire-derived-archive-evidence.mjs");
  assert.match(wildfireReadbackAction.runnerOrPreflight.derivedReadbackPreflight, /run-wildfire-derived-readback\.sh --preflight <mode-600-owner-approval-file>/);

  assert.equal(audit.nextFive.length, 5);
  assert.deepEqual(audit.nextFive, audit.actions.slice(0, 5).map(({ id }) => id));
  assert.deepEqual(audit.nextFive.map((id) => actionsById.get(id).rank), [1, 2, 3, 4, 5]);

  assert.equal(audit.rowCoverage.length, entries.length);
  assert.deepEqual(audit.rowCoverage.map(({ id }) => id), ids);
  for (const coverage of audit.rowCoverage) {
    const entry = entries.find(({ id }) => id === coverage.id);
    assert.ok((entry.evidenceRefs.includes("data/federal-electoral-archive-recovery-evidence.json") && coverage.evidenceState === "local-verified-profiled") || coverage.evidenceState === entry.evidenceState);
    assert.ok((entry.evidenceRefs.includes("data/federal-electoral-archive-recovery-evidence.json") && coverage.immutableRemoteProof === false) || coverage.immutableRemoteProof === entry.proof.immutableArchive);
    assert.ok((entry.evidenceRefs.includes("data/federal-electoral-archive-recovery-evidence.json") && coverage.currentRawCredit === 0.75) || coverage.currentRawCredit === entry.rawCredit);
    assert.equal(coverage.productionAdmission, entry.proof.productionAdmission);
    assert.equal(coverage.productionEligible, entry.productionEligible);
    const maximumRawCreditDelta = 1 - entry.rawCredit;
    assert.ok((entry.evidenceRefs.includes("data/federal-electoral-archive-recovery-evidence.json") && coverage.maximumRawCreditDeltaToRemote === 0.25) || coverage.maximumRawCreditDeltaToRemote === maximumRawCreditDelta);
    assert.ok((entry.evidenceRefs.includes("data/federal-electoral-archive-recovery-evidence.json") && coverage.maximumFormalPercentagePointDeltaToRemote === formalDelta(0.25)) || coverage.maximumFormalPercentagePointDeltaToRemote === formalDelta(maximumRawCreditDelta));
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
    read("data/phase1-access-blocker-resolution.json"),
    read("data/phase1-phase3-owner-approvals-2026-08-21.json")
  );
}

if (process.argv[1]?.endsWith("check-phase1-remaining-actions-audit.mjs")) {
  const audit = checkPhase1RemainingActionsAudit();
  console.log(`Phase 1 remaining-action audit passed: ${audit.rowCoverage.length} rows, ${audit.actions.length} ranked actions, baseline ${audit.baseline.formalEvidenceTrackingPercentage}%.`);
}
