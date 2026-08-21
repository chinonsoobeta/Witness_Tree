import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateNrcanHarvestProfile } from "./check-nrcan-harvest-profile.mjs";
import { validateNrcanHarvestRemoteArchiveEvidence } from "./check-nrcan-harvest-remote-archive-evidence.mjs";
import { validateNrcanCanopyHeightProfile } from "./check-nrcan-canopy-height-profile.mjs";
import { validateNrcanCanopyHeightRemoteArchiveEvidence } from "./check-nrcan-canopy-height-remote-archive-evidence.mjs";
import { validateAlbertaPlviGeometryRepair } from "./check-alberta-plvi-geometry-repair.mjs";
import { validateAlbertaPlviFullReleaseReadiness } from "./check-alberta-plvi-full-release-readiness.mjs";
import { validateAlbertaPlviImmutablePromotionEvidence } from "./check-alberta-plvi-immutable-promotion-evidence.mjs";
import { validateAlbertaPlviImmutablePromotionPreparation } from "./prepare-alberta-plvi-immutable-promotion.mjs";

const SCHEMA = "witness-tree/phase1-scope-bound-validation-preparation/1";
const ROW_IDS = ["ntems-forest-harvest", "ntems-canopy-height", "ab-primary-land-vegetation"];
const HEAD = "71e557a63e812d980b4cbf840bc8f04cd4419131";

function assertFalseClaims(row) {
  assert.equal(row.transformation.admitted, false);
  assert.equal(row.transformation.transformed, false);
  assert.equal(row.ingestionPreparation.authorized, false);
  assert.equal(row.ingestionPreparation.ingested, false);
  assert.equal(row.releaseApproval, false);
  assert.equal(row.productionAdmission, false);
  assert.equal(row.productionEligible, false);
}

function validateCommon(record, ledger, decisions) {
  assert.equal(record.schemaVersion, SCHEMA);
  assert.equal(record.status, "scope-decisions-reconciled-preparation-only");
  assert.equal(record.derivedFromHead, HEAD);
  assert.match(record.notice, /local validation and ingestion-preparation boundaries.*no AWS call.*transformation admission.*production-eligibility change/i);
  assert.deepEqual(record.baseline, {
    productionRows: 31,
    rawEvidenceNumerator: 14.25,
    rawEvidenceDenominator: 31,
    formalEvidenceTrackingPercentage: 38.7903226,
    immutableArchiveCompleteRows: 7,
    productionAdmissionCompleteRows: 0,
    productionEligibleRows: 0,
  });
  assert.deepEqual(record.rows.map(({ id }) => id), ROW_IDS);
  assert.equal(record.decisionRef, "data/phase1-remote-source-admission-decisions.json");
  assert.deepEqual(record.claims, {
    sourceLedgerScopeDecisionsRecorded: true,
    rawEvidenceDelta: 0,
    formalEvidenceTrackingPercentagePointDelta: 0,
    remoteMutationPerformed: false,
    externalMutationPerformed: false,
    transformationAdmission: false,
    transformed: false,
    ingestionAdmission: false,
    ingested: false,
    releaseApproval: false,
    productionAdmission: false,
    productionEligible: false,
    phase2Started: false,
  });
  const ledgerById = new Map(ledger.entries.map((entry) => [entry.id, entry]));
  for (const row of record.rows) {
    const ledgerRow = ledgerById.get(row.id);
    assert.ok(ledgerRow, `Missing ledger row ${row.id}.`);
    assert.equal(ledgerRow.evidenceState, "remote-verified-archived-profiled");
    assert.equal(ledgerRow.rawCredit, 1);
    assert.equal(ledgerRow.proof.productionAdmission, false);
    assert.equal(ledgerRow.productionEligible, false);
    const decision = decisions.decisions.find(({ id }) => id === row.id);
    assert.ok(decision, `Missing supplied decision for ${row.id}.`);
    assert.equal(decision.scopeDecision, row.scopeDecision);
    for (const reference of row.validation.evidenceRefs) assert.ok(existsSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", reference)), `${row.id} references missing ${reference}`);
    assertFalseClaims(row);
  }
}

function validateHarvest(row, context) {
  assert.equal(row.scopeDecision, "accepted-named-source-ledger-only");
  assert.equal(row.validation.status, "passed-existing-evidence");
  validateNrcanHarvestProfile(context.harvestProfile);
  validateNrcanHarvestRemoteArchiveEvidence(context.harvestEvidence, context.harvestProfile, context.staged, context.ledger);
  assert.deepEqual(row.validation.facts, {
    sourceId: context.harvestProfile.sourceId,
    byteLength: context.harvestProfile.raw.byteLength,
    sha256: context.harvestProfile.raw.sha256,
    primaryRecoveryReadbacks: true,
    retentionMode: "COMPLIANCE",
    retentionUntil: "2033-08-12T00:00:00Z",
  });
  assert.equal(row.transformation.status, "not-authorized-no-named-target-specification");
  assert.equal(row.transformation.namedSpecification, null);
  assert.equal(row.ingestionPreparation.status, "blocked-before-ingestion");
  assert.match(row.ingestionPreparation.reason, /no separately named target transformation or ingestion decision/i);
}

function validateCanopyHeight(row, context) {
  assert.equal(row.scopeDecision, "accepted-named-source-ledger-only");
  assert.equal(row.validation.status, "passed-existing-evidence");
  validateNrcanCanopyHeightProfile(context.canopyHeightProfile);
  validateNrcanCanopyHeightRemoteArchiveEvidence(context.canopyHeightEvidence, context.canopyHeightProfile);
  assert.deepEqual(row.validation.facts, {
    sourceId: context.canopyHeightProfile.sourceId,
    byteLength: context.canopyHeightProfile.raw.byteLength,
    sha256: context.canopyHeightProfile.raw.sha256,
    primaryRecoveryReadbacks: true,
    retentionMode: "COMPLIANCE",
    retentionUntil: "2033-08-12T00:00:00Z",
  });
  assert.equal(row.transformation.status, "not-authorized-no-named-target-specification");
  assert.equal(row.transformation.namedSpecification, null);
  assert.equal(row.ingestionPreparation.status, "blocked-before-ingestion");
  assert.match(row.ingestionPreparation.reason, /no separately named target transformation or ingestion decision/i);
}

function validatePlvi(row, context) {
  assert.equal(row.scopeDecision, "approved-raw-and-derived-scope-only");
  assert.equal(row.validation.status, "passed-under-approved-scope");
  validateAlbertaPlviGeometryRepair(context.plviRepair);
  validateAlbertaPlviFullReleaseReadiness(context.plviReadiness);
  validateAlbertaPlviImmutablePromotionPreparation(context.plviPreparation);
  validateAlbertaPlviImmutablePromotionEvidence(context.plviEvidence, context.plviPreparation);
  assert.deepEqual(row.validation.facts, {
    rawSha256: context.plviReadiness.rawInput.sha256,
    derivedSha256: context.plviReadiness.derivedOutput.sha256,
    featureCount: context.plviReadiness.closedJoin.outputFeatureCount,
    repairCount: context.plviReadiness.closedJoin.repairedReplacementCount,
    validGeometryCount: context.plviReadiness.derivedOutput.featureCount,
    declaredCrs: context.plviReadiness.derivedOutput.crs,
    duplicatePolygonId41405Multiplicity: context.plviReadiness.closedJoin.sourceDuplicateIdentifier.multiplicity,
    silentLossOrDeduplication: context.plviReadiness.closedJoin.silentLossOrDuplication,
  });
  assert.equal(row.transformation.status, "scope-bound-policy-validated-not-admitted");
  assert.equal(row.transformation.namedSpecification, "alberta-plvi-geometry-repair-v1");
  assert.equal(row.ingestionPreparation.status, "scope-bound-preflight-blocked-schema-drift-not-ingested");
  assert.equal(row.ingestionPreparation.preflightRef, "data/phase1-immutable-downstream-preflight.json");
  assert.deepEqual(row.ingestionPreparation.checks, {
    rawChecksumBound: true,
    derivedChecksumBound: true,
    featureCountPreserved: true,
    validNonEmptyGeometry: true,
    exactSchemaNameParity: false,
    exactSchemaNameTypeParity: false,
    duplicatePolygonId41405Preserved: true,
    silentLossOrDeduplication: false,
  });
  assert.match(row.ingestionPreparation.reason, /SUBMISSION_ID became SUBMISSION.*Shape_Length became Shape_Leng.*23 Integer fields widened.*separate transformation admission and ingestion decisions/i);
}

export function validatePhase1ScopeBoundValidationPreparation(record, context) {
  validateCommon(record, context.ledger, context.decisions);
  validateHarvest(record.rows[0], context);
  validateCanopyHeight(record.rows[1], context);
  validatePlvi(record.rows[2], context);
  return record;
}

export function checkPhase1ScopeBoundValidationPreparation(root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")) {
  const fromRoot = (file) => JSON.parse(readFileSync(path.join(root, file), "utf8"));
  return validatePhase1ScopeBoundValidationPreparation(fromRoot("data/phase1-scope-bound-validation-preparation.json"), {
    ledger: fromRoot("data/phase1-production-source-ledger.json"),
    decisions: fromRoot("data/phase1-remote-source-admission-decisions.json"),
    harvestProfile: fromRoot("data/nrcan-harvest-profile.json"),
    harvestEvidence: fromRoot("data/nrcan-harvest-remote-archive-evidence.json"),
    staged: fromRoot("data/staged-acquisitions.json"),
    canopyHeightProfile: fromRoot("data/nrcan-canopy-height-profile.json"),
    canopyHeightEvidence: fromRoot("data/nrcan-canopy-height-remote-archive-evidence.json"),
    plviRepair: fromRoot("data/transformation-runs/alberta-plvi-geometry-repair-v1-2026-08-14.json"),
    plviReadiness: fromRoot("data/alberta-plvi-full-release-readiness.json"),
    plviPreparation: fromRoot("data/alberta-plvi-immutable-promotion-preparation.json"),
    plviEvidence: fromRoot("data/alberta-plvi-immutable-promotion-evidence.json"),
  });
}

if (process.argv[1]?.endsWith("check-phase1-scope-bound-validation-preparation.mjs")) {
  const record = checkPhase1ScopeBoundValidationPreparation();
  console.log(`Phase 1 scope-bound validation preparation passed for ${record.rows.length} rows; all downstream claims remain false.`);
}
