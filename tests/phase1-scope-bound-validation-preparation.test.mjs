import assert from "node:assert/strict";
import test from "node:test";
import { checkPhase1ScopeBoundValidationPreparation, validatePhase1ScopeBoundValidationPreparation } from "../scripts/check-phase1-scope-bound-validation-preparation.mjs";

const read = (file) => import(file, { with: { type: "json" } }).then(({ default: value }) => value);

test("scope-bound preparation validates supplied national and PLVI decisions without downstream admission", () => {
  const record = checkPhase1ScopeBoundValidationPreparation();
  assert.equal(record.rows.length, 3);
  assert.deepEqual(record.rows.map(({ id }) => id), ["ntems-forest-harvest", "ntems-canopy-height", "ab-primary-land-vegetation"]);
  assert.equal(record.rows[0].ingestionPreparation.ingested, false);
  assert.equal(record.rows[1].ingestionPreparation.ingested, false);
  assert.equal(record.rows[2].ingestionPreparation.ingested, false);
  assert.equal(record.claims.rawEvidenceDelta, 0);
  assert.equal(record.claims.formalEvidenceTrackingPercentagePointDelta, 0);
});

test("scope-bound preparation rejects invented transformation or ingestion", async () => {
  const record = checkPhase1ScopeBoundValidationPreparation();
  const context = {
    ledger: await read("../data/phase1-production-source-ledger.json"),
    decisions: await read("../data/phase1-remote-source-admission-decisions.json"),
    harvestProfile: await read("../data/nrcan-harvest-profile.json"),
    harvestEvidence: await read("../data/nrcan-harvest-remote-archive-evidence.json"),
    staged: await read("../data/staged-acquisitions.json"),
    canopyHeightProfile: await read("../data/nrcan-canopy-height-profile.json"),
    canopyHeightEvidence: await read("../data/nrcan-canopy-height-remote-archive-evidence.json"),
    plviRepair: await read("../data/transformation-runs/alberta-plvi-geometry-repair-v1-2026-08-14.json"),
    plviReadiness: await read("../data/alberta-plvi-full-release-readiness.json"),
    plviPreparation: await read("../data/alberta-plvi-immutable-promotion-preparation.json"),
    plviEvidence: await read("../data/alberta-plvi-immutable-promotion-evidence.json"),
  };
  const transformed = structuredClone(record);
  transformed.rows[2].transformation.admitted = true;
  assert.throws(() => validatePhase1ScopeBoundValidationPreparation(transformed, context));
  const ingested = structuredClone(record);
  ingested.rows[0].ingestionPreparation.ingested = true;
  assert.throws(() => validatePhase1ScopeBoundValidationPreparation(ingested, context));
});
