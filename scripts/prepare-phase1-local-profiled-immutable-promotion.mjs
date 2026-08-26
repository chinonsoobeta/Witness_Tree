import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { archiveKeys, safeSegment, snapshotId, validatePromotionManifest } from "../lib/archive-staging/validate.ts";

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));

const FEDERAL_ROWS = new Set(["fed-2023-ridings", "elections-canada-45th-files"]);

function remainsHistoricalPreparationSource(row) {
  if (["local-verified-profiled", "remote-verified-archived-profiled"].includes(row?.evidenceState)) return true;
  return FEDERAL_ROWS.has(row?.id)
    && row.evidenceState === "production-admitted"
    && row.productionEligible === true
    && row.proof?.productionAdmission === true
    && row.evidenceRefs?.includes("data/federal-electoral-archive-recovery-evidence.json")
    && row.evidenceRefs?.includes("data/phase1-federal-electoral-output-verification-evidence.json")
    && row.evidenceRefs?.includes("data/phase1-federal-electoral-production-admission.json");
}

export function validateLocalProfiledPromotionPreparation(plan, staged, ledger) {
  assert.equal(plan.schemaVersion, 1);
  assert.equal(plan.status, "blocked-preparation-only");
  assert.match(plan.notice, /does not call AWS, upload.*sidecar.*Object Lock retention.*ingest.*release/i);
  assert.match(plan.requiredApproval, /exact artifacts.*exact Canadian bucket and region.*COMPLIANCE retain-until instant/i);
  assert.deepEqual(plan.claims, { remoteObjectExists: false, sidecarUploaded: false, retentionApplied: false, immutableObjectStorage: false, transformed: false, ingested: false, productionEligible: false });
  assert.ok(Array.isArray(plan.plannedProductionRowIds) && plan.plannedProductionRowIds.length > 0);
  const expectedRows = [...plan.plannedProductionRowIds].sort();
  assert.equal(new Set(expectedRows).size, expectedRows.length, "Prepared production rows must be unique.");
  for (const id of expectedRows) {
    const row = ledger.entries.find((entry) => entry.id === id);
    assert.ok(remainsHistoricalPreparationSource(row), "Every prepared row must remain a verified profile or have its exact approved archive recovery and later federal admission evidence.");
  }
  const seenRows = new Set(); const seenAcquisitions = new Set();
  for (const artifact of plan.artifacts) {
    assert.ok(Array.isArray(artifact.productionRowIds) && artifact.productionRowIds.length > 0);
    assert.ok(safeSegment(artifact.archiveKeyVersion));
    assert.equal(artifact.predecessorPayloadKey, null);
    assert.ok(!seenAcquisitions.has(artifact.stagedAcquisitionId), "A physical artifact may only be prepared once."); seenAcquisitions.add(artifact.stagedAcquisitionId);
    for (const id of artifact.productionRowIds) { assert.ok(expectedRows.includes(id)); assert.ok(!seenRows.has(id)); seenRows.add(id); }
    const source = staged.entries.find((entry) => entry.id === artifact.stagedAcquisitionId);
    assert.ok(source, "Preparation must bind an exact staged acquisition.");
    assert.equal(artifact.localPath, source.localPath);
    assert.equal(artifact.byteLength, source.byteLength);
    assert.equal(artifact.sha256, source.sha256);
    assert.equal(artifact.sourceVersion, source.sourceVersion);
    assert.equal(source.immutableObjectStorage, false); assert.equal(source.productionEligible, false);
    const profile = read(artifact.profile);
    assert.equal(profile.sourceId, source.sourceId); assert.equal(profile.productionEligible, false);
    const contractStaging = { storageState: "local-staging", immutableObjectStorage: false, production: false, sourceId: source.sourceId, sourceVersion: artifact.archiveKeyVersion, retrievedAt: source.retrievedAt, byteLength: source.byteLength, sha256: source.sha256, originalFilename: source.originalFilename, publisher: source.publisher, catalogueUrl: source.catalogueUrl, requestedUrl: source.sourceUrl, licenceId: source.licenceId, licenceUrl: source.licenceUrl, requiredAttribution: source.attribution, changesNotice: "Raw artifact unchanged; preparation only, with no upload, retention, transformation, ingestion, or release." };
    const keys = archiveKeys(contractStaging);
    validatePromotionManifest({ status: "staging-promotion", snapshotId: snapshotId(contractStaging), staged: contractStaging, ...keys, promotion: { state: "rejected" } });
  }
  assert.deepEqual([...seenRows].sort(), expectedRows);
  return plan;
}

if (process.argv[1]?.endsWith("prepare-phase1-local-profiled-immutable-promotion.mjs")) {
  const plan = read("data/phase1-local-profiled-promotion-preparation.json");
  const staged = read("data/staged-acquisitions.json");
  const ledger = read("data/phase1-production-source-ledger.json");
  validateLocalProfiledPromotionPreparation(plan, staged, ledger);
  console.log(`Dry-run only: ${plan.artifacts.length} physical artifacts bind ${plan.artifacts.reduce((n, item) => n + item.productionRowIds.length, 0)} local-profiled production rows; no AWS action was attempted.`);
}
