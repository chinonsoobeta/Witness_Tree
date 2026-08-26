import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validate as validateAlbertaAviQuarantine } from "./check-alberta-avi-crown-quarantine-decision.mjs";
import { validateAlbertaPlviFullReleaseReadiness } from "./check-alberta-plvi-full-release-readiness.mjs";
import { validateAlbertaPlviGeometryRepair } from "./check-alberta-plvi-geometry-repair.mjs";
import { validateAlbertaPlviImmutablePromotionEvidence } from "./check-alberta-plvi-immutable-promotion-evidence.mjs";

const AUDIT_SCHEMA = "witness-tree/phase1-alberta-transform-ingestion-audit/1";
const HEAD = "71925af03fc08b052d12077de2ba4acb9239006b";
const AVI_RAW_SHA256 = "e93572129f25c83911b73eadfacff12624ff6b08f2db4b311c1662196b665093";
const PLVI_RAW_SHA256 = "017a0a835c680ca1b6c1eb790322a28e1b4c0c64e36924da46d8bb99cb1571d3";
const PLVI_DERIVED_SHA256 = "5633e7d49982ee1232b415f362654744c1f1dab11d7c3c7ef8a7928dac20825b";
const ROW_IDS = ["ab-avi-crown", "ab-avi-post-harvest", "ab-primary-land-vegetation"];

function expectFailClosed(row) {
  assert.equal(row.rawCreditDelta, 0);
  assert.equal(row.ownerScope.downstreamAuthorized, false);
  assert.equal(row.transformationValidation.transformedClaim, false);
  assert.equal(row.ingestionPreflight.authorized, false);
  assert.equal(row.ingestionPreflight.ingested, false);
  assert.equal(row.downstream.releaseApproval, false);
  assert.equal(row.downstream.productionAdmission, false);
  assert.equal(row.downstream.productionEligible, false);
}

function validateAviRow(row, ledgerRow, decisions, run, quarantine) {
  assert.equal(row.evidenceState, "remote-verified-archived-profiled");
  assert.equal(ledgerRow.evidenceState, row.evidenceState);
  assert.equal(ledgerRow.rawCredit, 1);
  assert.equal(ledgerRow.productionEligible, false);
  assert.equal(row.ownerScope.status, "approved-source-ledger-only");
  const decision = decisions.decisions.find((candidate) => candidate.id === row.id);
  assert.ok(decision, `Missing owner source-ledger decision for ${row.id}.`);
  assert.equal(decision.ownerAdmission, "approved-source-ledger-only");
  assert.equal(row.ownerScope.downstreamAuthorized, false);
  assert.equal(row.localArtifacts.raw.sha256, AVI_RAW_SHA256);
  assert.equal(row.localArtifacts.raw.byteLength, 557041258);
  assert.equal(row.localArtifacts.workingDatasetSha256, run.workingDatasetSha256);
  assert.equal(row.localArtifacts.quarantine.sha256, run.output.sha256);
  assert.equal(row.localArtifacts.quarantine.byteLength, run.output.byteLength);
  assert.equal(row.transformationValidation.specification, "alberta-avi-geometry-repair-v1");
  assert.equal(row.transformationValidation.runRecord, "data/transformation-runs/alberta-avi-geometry-repair-v1-2026-08-12.json");
  assert.equal(run.sourceId, "alberta-avi-crown");
  assert.equal(run.rawArchiveSha256, AVI_RAW_SHA256);
  assert.equal(run.totals.featureCount, 792443);
  assert.equal(run.totals.invalidGeometryCount, 608);
  assert.equal(run.totals.repairedCount, 607);
  assert.equal(run.totals.quarantinedCount, 1);
  assert.equal(run.totals.unchangedCount + run.totals.repairedCount + run.totals.quarantinedCount, run.totals.featureCount);
  assert.equal(row.transformationValidation.derivedDatasetWritten, false);
  expectFailClosed(row);

  if (row.id === "ab-avi-crown") {
    validateAlbertaAviQuarantine(quarantine, run);
    assert.equal(row.ownerScope.scopeRef, "data/alberta-avi-crown-quarantine-decision.json");
    assert.equal(row.transformationValidation.decision, "data/alberta-avi-crown-quarantine-decision.json");
    assert.equal(row.transformationValidation.quarantinedFeature.layer, "AVI_PostInventoryHarvestIndex");
    assert.equal(row.transformationValidation.quarantinedFeature.fid, 1);
    assert.equal(row.transformationValidation.quarantinedFeature.relativeAreaChange, 0.028800363153499882);
    assert.equal(row.transformationValidation.acceptedInMemoryRepairCount, 607);
    assert.equal(row.transformationValidation.quarantinedCount, 1);
  } else {
    assert.equal(row.transformationValidation.postInventoryHarvestFeatureCount, 3631);
    assert.equal(row.transformationValidation.postInventoryHarvestInvalidGeometryCount, 19);
    assert.equal(row.transformationValidation.postInventoryHarvestAcceptedInMemoryRepairCount, 19);
    assert.equal(row.transformationValidation.postInventoryHarvestQuarantinedCount, 0);
  }
  assert.equal(row.ingestionPreflight.status, "blocked-before-ingestion");
}

function validatePlviRow(row, ledgerRow, decisionReadiness, repair, fullRelease, immutableEvidence, preparation, decisions) {
  assert.equal(row.evidenceState, "remote-verified-archived-profiled");
  assert.equal(ledgerRow.evidenceState, row.evidenceState);
  assert.equal(ledgerRow.rawCredit, 1);
  assert.equal(ledgerRow.productionEligible, false);
  assert.equal(row.ownerScope.status, "approved-raw-and-derived-scope-only");
  assert.equal(row.ownerScope.decisionRef, "data/phase1-remote-source-admission-decisions.json");
  assert.equal(row.ownerScope.decisionId, "ab-primary-land-vegetation");
  const readinessEntry = decisionReadiness.entries.find((entry) => entry.id === "ab-primary-land-vegetation");
  assert.ok(readinessEntry, "Missing PLVI decision-readiness entry.");
  assert.equal(readinessEntry.readiness, "owner-decision-recorded");
  assert.equal(row.ownerScope.readiness, readinessEntry.readiness);
  assert.equal(row.ownerScope.scopeDecision, "approved-raw-and-derived-scope-only");
  assert.equal(row.ownerScope.scopeBoundPreparation, "data/phase1-scope-bound-validation-preparation.json");
  assert.equal(row.ownerScope.downstreamAuthorized, false);
  const decision = decisions.decisions.find((candidate) => candidate.id === "ab-primary-land-vegetation");
  assert.ok(decision);
  assert.equal(decision.ownerAdmission, "approved-source-ledger-only");
  assert.equal(decision.scopeDecision, "approved-raw-and-derived-scope-only");
  assert.match(decision.scope, /scope-bound validation and ingestion preparation only/i);
  assert.equal(fullRelease.ownerScope.status, "approved-source-ledger-and-exact-raw-derived-scope-only");
  assert.equal(fullRelease.ownerScope.transformationAdmission, false);
  assert.equal(fullRelease.ownerScope.ingestionAuthorized, false);
  assert.equal(row.localArtifacts.raw.sha256, PLVI_RAW_SHA256);
  assert.equal(row.localArtifacts.derivedOutput.sha256, PLVI_DERIVED_SHA256);
  validateAlbertaPlviGeometryRepair(repair);
  validateAlbertaPlviFullReleaseReadiness(fullRelease);
  validateAlbertaPlviImmutablePromotionEvidence(immutableEvidence, preparation);
  assert.equal(row.transformationValidation.specification, "alberta-plvi-geometry-repair-v1");
  assert.equal(row.transformationValidation.rawFeatureCount, fullRelease.rawInput.featureCount);
  assert.equal(row.transformationValidation.repairCount, fullRelease.closedJoin.repairedReplacementCount);
  assert.equal(row.transformationValidation.outputFeatureCount, fullRelease.derivedOutput.featureCount);
  assert.equal(row.transformationValidation.validGeometryCount, fullRelease.derivedOutput.featureCount);
  assert.equal(row.transformationValidation.invalidGeometryCount, 0);
  assert.equal(row.transformationValidation.nonPolygonalGeometryCount, 0);
  assert.equal(row.transformationValidation.closedJoinLossOrDuplication, false);
  assert.equal(row.transformationValidation.derivedDatasetWrittenByThisAudit, false);
  assert.equal(row.transformationValidation.transformedClaim, false);
  expectFailClosed(row);
  assert.equal(row.ingestionPreflight.status, "scope-bound-ingestion-preflight-blocked-schema-drift-not-ingested");
  assert.equal(row.ingestionPreflight.preflightRef, "data/phase1-immutable-downstream-preflight.json");
  assert.equal(row.ingestionPreflight.scopeBound, true);
  assert.deepEqual(row.ingestionPreflight.checks, {
    rawChecksumBound: true,
    derivedChecksumBound: true,
    featureCountPreserved: true,
    validNonEmptyGeometry: true,
    declaredCrs: "EPSG:3400",
    declaredAttributeFieldCount: 60,
    exactSchemaNameParity: false,
    exactSchemaNameTypeParity: false,
    duplicatePolygonId41405Preserved: true,
    silentLossOrDeduplication: false,
  });
}

export function validatePhase1AlbertaTransformIngestionAudit(audit, context) {
  assert.equal(audit.schemaVersion, AUDIT_SCHEMA);
  assert.equal(audit.status, "local-evidence-reconciled-downstream-blocked");
  assert.equal(audit.derivedFromHead, HEAD);
  assert.match(audit.notice, /read-only audit.*does not run AWS.*ingest data.*Phase 2/i);
  assert.deepEqual(audit.scope, ROW_IDS);
  assert.deepEqual(audit.rows.map(({ id }) => id), ROW_IDS);
  assert.deepEqual(audit.baseline, {
    productionRows: 31,
    rawEvidenceNumerator: 14.25,
    rawEvidenceDenominator: 31,
    formalEvidenceTrackingPercentage: 38.7903226,
    immutableArchiveCompleteRows: 7,
    productionAdmissionCompleteRows: 0,
    productionEligibleRows: 0,
  });
  assert.deepEqual(audit.delta, {
    rawEvidenceNumerator: 0,
    formalEvidenceTrackingPercentagePoints: 0,
    immutableArchiveCompleteRows: 0,
    productionAdmissionCompleteRows: 0,
    productionEligibleRows: 0,
    ownerDecisionsCreated: 0,
    remoteMutationPerformed: false,
    externalMutationPerformed: false,
    phase2Started: false,
  });

  const ledgerRows = new Map(context.ledger.entries.map((entry) => [entry.id, entry]));
  const auditRefs = new Set(ROW_IDS.map((id) => context.ledger.entries.find((entry) => entry.id === id)?.evidenceRefs ?? []).flat());
  for (const id of ROW_IDS) {
    const row = ledgerRows.get(id);
    assert.ok(row, `Missing ledger row ${id}.`);
    assert.ok(row.evidenceRefs.includes("data/phase1-alberta-transform-ingestion-audit.json"), `${id} must reference the Alberta reconciliation record.`);
    assert.equal(row.proof.productionAdmission, false);
    assert.equal(row.productionEligible, false);
  }

  validateAviRow(audit.rows[0], ledgerRows.get("ab-avi-crown"), context.decisions, context.aviRun, context.aviQuarantine);
  validateAviRow(audit.rows[1], ledgerRows.get("ab-avi-post-harvest"), context.decisions, context.aviRun, context.aviQuarantine);
  validatePlviRow(audit.rows[2], ledgerRows.get("ab-primary-land-vegetation"), context.decisionReadiness, context.plviRepair, context.plviFullRelease, context.plviImmutableEvidence, context.plviPreparation, context.decisions);
  assert.equal(auditRefs.has("data/phase1-alberta-transform-ingestion-audit.json"), true, "The canonical ledger must reference this reconciliation record for every audited row.");
  return audit;
}

export async function checkPhase1AlbertaTransformIngestionAudit(root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")) {
  const read = async (file) => JSON.parse(await readFile(path.join(root, file), "utf8"));
  const [audit, ledger, decisions, aviRun, aviQuarantine, decisionReadiness, plviRepair, plviFullRelease, plviImmutableEvidence, plviPreparation] = await Promise.all([
    read("data/phase1-alberta-transform-ingestion-audit.json"),
    read("data/phase1-production-source-ledger.json"),
    read("data/phase1-remote-source-admission-decisions.json"),
    read("data/transformation-runs/alberta-avi-geometry-repair-v1-2026-08-12.json"),
    read("data/alberta-avi-crown-quarantine-decision.json"),
    read("data/phase1-source-ledger-decision-readiness.json"),
    read("data/transformation-runs/alberta-plvi-geometry-repair-v1-2026-08-14.json"),
    read("data/alberta-plvi-full-release-readiness.json"),
    read("data/alberta-plvi-immutable-promotion-evidence.json"),
    read("data/alberta-plvi-immutable-promotion-preparation.json"),
  ]);
  return validatePhase1AlbertaTransformIngestionAudit(audit, { ledger, decisions, aviRun, aviQuarantine, decisionReadiness, plviRepair, plviFullRelease, plviImmutableEvidence, plviPreparation });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const audit = await checkPhase1AlbertaTransformIngestionAudit();
  console.log(`Alberta transform/ingestion audit passed for ${audit.rows.length} rows; local evidence reconciled and all downstream gates remain blocked.`);
}
