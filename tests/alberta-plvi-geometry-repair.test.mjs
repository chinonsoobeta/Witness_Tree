import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateAlbertaPlviGeometryRepair } from "../scripts/check-alberta-plvi-geometry-repair.mjs";

const run = JSON.parse(readFileSync(new URL("../data/transformation-runs/alberta-plvi-geometry-repair-v1-2026-08-14.json", import.meta.url), "utf8"));

test("PLVI repair patch is complete, valid, polygon-only, and remains non-production", () => {
  assert.equal(validateAlbertaPlviGeometryRepair(run), run);
  assert.equal(run.features.length, 12);
  assert.ok(run.patch.maxRelativeAreaDelta < run.rule.relativeAreaTolerance);
});

test("PLVI repair patch fails closed for loss, invalid output, excess area, or promoted claims", () => {
  assert.throws(() => validateAlbertaPlviGeometryRepair({...run, features: run.features.slice(1)}), /every invalid polygon/);
  assert.throws(() => validateAlbertaPlviGeometryRepair({...run, patch: {...run.patch, invalidGeometryCount: 1}}), /valid, polygon-only/);
  assert.throws(() => validateAlbertaPlviGeometryRepair({...run, patch: {...run.patch, maxRelativeAreaDelta: 1e-6}}), /within tolerance/);
  assert.throws(() => validateAlbertaPlviGeometryRepair({...run, ownerAdmissionReady: true}), /must not claim/);
});
