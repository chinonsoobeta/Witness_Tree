import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { archiveKeys, snapshotId, validatePromotionManifest } from "../lib/archive-staging/validate.ts";

const LEDGER = new URL("../data/elections-canada-fed-2025-source-ledger.json", import.meta.url);
const PROFILE = new URL("../data/elections-canada-fed-2025-profile.json", import.meta.url);
const READINESS = new URL("../data/archive-operations-readiness.json", import.meta.url);
const PREPARATION = new URL("../data/elections-canada-fed-2025-promotion-preparation.json", import.meta.url);

export function validateElectionsCanadaFed2025PromotionPreparation(plan, ledger, profile, readiness) {
  assert.equal(plan.schemaVersion, "witness-tree/elections-canada-fed-2025-promotion-preparation/1");
  assert.equal(plan.status, "blocked-preparation-only");
  assert.match(plan.notice, /does not upload, create a remote object, lock retention, transform, ingest, or release/i);
  assert.equal(plan.sourceLedger, "data/elections-canada-fed-2025-source-ledger.json");
  assert.equal(plan.profile, "data/elections-canada-fed-2025-profile.json");
  assert.equal(plan.archiveOperationsReadiness, "data/archive-operations-readiness.json");
  assert.equal(ledger.source.immutableObjectStorage, false);
  assert.equal(ledger.source.productionEligible, false);
  assert.equal(profile.productionEligible, false);
  assert.equal(readiness.status, "blocked");
  assert.equal(readiness.productionEligible, false);

  const staged = {
    storageState: "local-staging",
    immutableObjectStorage: false,
    production: false,
    sourceId: plan.snapshot.sourceId,
    sourceVersion: plan.snapshot.remoteKeyVersion,
    retrievedAt: plan.snapshot.retrievedAt,
    byteLength: plan.snapshot.byteLength,
    sha256: plan.snapshot.sha256,
    originalFilename: plan.snapshot.originalFilename,
    publisher: ledger.source.publisher,
    catalogueUrl: ledger.source.officialListingUrl,
    requestedUrl: ledger.source.sourceUrl,
    licenceId: ledger.source.licence.id,
    licenceUrl: ledger.source.licence.url,
    requiredAttribution: ledger.source.licence.requiredAttribution,
    changesNotice: plan.snapshot.changesNotice
  };
  assert.equal(plan.snapshot.sourceId, ledger.source.id);
  assert.equal(plan.snapshot.sourceVersion, ledger.source.sourceVersion);
  assert.equal(plan.snapshot.remoteKeyVersion, "federal-electoral-districts-2025-shp");
  assert.equal(plan.snapshot.retrievedAt, ledger.source.retrievedAt);
  assert.equal(plan.snapshot.originalFilename, "FederalElectoralDistricts_2025_SHP.zip");
  assert.equal(plan.snapshot.byteLength, ledger.source.http.contentLength);
  assert.equal(plan.snapshot.sha256, ledger.source.sha256);
  assert.match(plan.snapshot.changesNotice, /raw ZIP is unchanged/i);
  assert.match(plan.snapshot.changesNotice, /no extraction, transformation, repair, dissolve, ingestion, or promotion/i);
  const keys = archiveKeys(staged);
  assert.deepEqual(plan.deterministicRemoteNames, {
    ...keys,
    notice: "These are deterministic names only, derived locally by lib/archive-staging. They do not assert that a bucket, object, or version exists."
  });
  validatePromotionManifest({ status: "staging-promotion", snapshotId: snapshotId(staged), staged, ...keys, promotion: { state: "rejected" } });

  assert.equal(plan.workflowAudit.safeUploadPathAvailable, false);
  assert.match(plan.workflowAudit.existingExecutable, /combines sidecar upload with compliance-retention execution/i);
  assert.match(plan.workflowAudit.conclusion, /No existing generic reversible upload-and-sidecar workflow/i);
  assert.equal(plan.retentionDecision.state, "separate-owner-approval-recorded-execution-evidence-pending");
  assert.equal(plan.retentionDecision.requiredBeforeAnyRemoteAction.length, 3);
  assert.match(plan.retentionDecision.prohibitedInference, /not remote, immutable, or production evidence/i);
  assert.deepEqual(plan.claims, { remoteObjectExists: false, sidecarUploaded: false, retentionApplied: false, immutableObjectStorage: false, transformed: false, ingested: false, productionEligible: false });
  return plan;
}

if (process.argv[1]?.endsWith("check-elections-canada-fed-2025-promotion-preparation.mjs")) {
  const read = (file) => JSON.parse(readFileSync(file, "utf8"));
  validateElectionsCanadaFed2025PromotionPreparation(read(PREPARATION), read(LEDGER), read(PROFILE), read(READINESS));
  console.log("PASS Elections Canada 2025 promotion preparation: blocked, local-only, and no remote claims.");
}
