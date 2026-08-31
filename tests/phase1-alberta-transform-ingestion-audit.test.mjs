import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase1AlbertaTransformIngestionAudit } from "../scripts/check-phase1-alberta-transform-ingestion-audit.mjs";

const read = (file) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
const context = {
  ledger: read("data/phase1-production-source-ledger.json"),
  decisions: read("data/phase1-remote-source-admission-decisions.json"),
  aviRun: read("data/transformation-runs/alberta-avi-geometry-repair-v1-2026-08-12.json"),
  aviQuarantine: read("data/alberta-avi-crown-quarantine-decision.json"),
  decisionReadiness: read("data/phase1-source-ledger-decision-readiness.json"),
  plviRepair: read("data/transformation-runs/alberta-plvi-geometry-repair-v1-2026-08-14.json"),
  plviFullRelease: read("data/alberta-plvi-full-release-readiness.json"),
  plviImmutableEvidence: read("data/alberta-plvi-immutable-promotion-evidence.json"),
  plviPreparation: read("data/alberta-plvi-immutable-promotion-preparation.json"),
};

test("reconciles the three Alberta local transform/preflight records without downstream admission", () => {
  const audit = read("data/phase1-alberta-transform-ingestion-audit.json");
  assert.equal(validatePhase1AlbertaTransformIngestionAudit(audit, context), audit);
  assert.deepEqual(audit.rows.map((row) => row.id), ["ab-avi-crown", "ab-avi-post-harvest", "ab-primary-land-vegetation"]);
  assert.equal(audit.rows[2].ingestionPreflight.status, "scope-bound-ingestion-preflight-blocked-schema-drift-not-ingested");
  assert.equal(audit.baseline.auditedAt, "2026-08-21T15:40:24Z");
});

test("rejects an AVI derived-payload claim or a PLVI owner-admission claim", () => {
  const audit = read("data/phase1-alberta-transform-ingestion-audit.json");
  const aviClaim = structuredClone(audit);
  aviClaim.rows[0].transformationValidation.derivedDatasetWritten = true;
  assert.throws(() => validatePhase1AlbertaTransformIngestionAudit(aviClaim, context), /downstream|derived|false/i);

  const plviAdmission = structuredClone(audit);
  plviAdmission.rows[2].ownerScope.downstreamAuthorized = true;
  assert.throws(() => validatePhase1AlbertaTransformIngestionAudit(plviAdmission, context), /false/i);
});

test("rejects PLVI output drift, lost duplicate identity, or a nonzero progress delta", () => {
  const audit = read("data/phase1-alberta-transform-ingestion-audit.json");
  const outputDrift = structuredClone(audit);
  outputDrift.rows[2].ingestionPreflight.checks.featureCountPreserved = false;
  assert.throws(() => validatePhase1AlbertaTransformIngestionAudit(outputDrift, context), /featureCountPreserved|deep-equal|equal/i);

  const duplicateLoss = structuredClone(audit);
  duplicateLoss.rows[2].ingestionPreflight.checks.duplicatePolygonId41405Preserved = false;
  assert.throws(() => validatePhase1AlbertaTransformIngestionAudit(duplicateLoss, context), /duplicatePolygonId41405Preserved|deep-equal|equal/i);

  const fabricatedSchemaParity = structuredClone(audit);
  fabricatedSchemaParity.rows[2].ingestionPreflight.checks.exactSchemaNameTypeParity = true;
  assert.throws(() => validatePhase1AlbertaTransformIngestionAudit(fabricatedSchemaParity, context), /exactSchemaNameTypeParity|deep-equal|equal/i);

  const scoreDrift = structuredClone(audit);
  scoreDrift.delta.rawEvidenceNumerator = 1;
  assert.throws(() => validatePhase1AlbertaTransformIngestionAudit(scoreDrift, context), /deep-equal|equal/i);

  const baselineDateDrift = structuredClone(audit);
  baselineDateDrift.baseline.auditedAt = "2026-08-21T15:40:25Z";
  assert.throws(() => validatePhase1AlbertaTransformIngestionAudit(baselineDateDrift, context), /deep-equal|equal/i);
});
