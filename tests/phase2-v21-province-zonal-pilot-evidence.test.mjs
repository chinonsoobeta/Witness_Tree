import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase2V21ProvinceZonalPilotEvidence } from "../scripts/check-phase2-v21-province-zonal-pilot-evidence.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const evidence = () => read("data/phase2-v21-province-zonal-pilot-evidence.json");
const raster = () => read("data/phase2-v21-raster-readback-evidence.json");

test("province/territory pilot evidence is exact and non-admitted", () => {
  const record = evidence();
  assert.equal(validatePhase2V21ProvinceZonalPilotEvidence(record, raster()), record);
  assert.equal(record.result.featureCount, 13);
});

test("pilot evidence rejects claim, worker, raster, boundary, output, and schema tampering", () => {
  for (const mutate of [
    (copy) => { copy.claims.productionEligible = true; },
    (copy) => { copy.claims.admittedNationalBoundaryAggregatesExist = true; },
    (copy) => { copy.run.workerSha256 = "a".repeat(64); },
    (copy) => { copy.inputBindings.forestMask.sha256 = "b".repeat(64); },
    (copy) => { copy.inputBindings.boundary.idField = "name"; },
    (copy) => { copy.result.boundaryIds.reverse(); },
    (copy) => { copy.result.featureCount = 12; },
    (copy) => { copy.result.outputMatchesSidecarRows = false; },
    (copy) => { copy.artifacts.output.path = "../outside.json"; },
    (copy) => { copy.artifacts.output.byteLength = Number.MAX_SAFE_INTEGER + 1; },
    (copy) => { copy.unexpected = true; },
  ]) {
    const copy = structuredClone(evidence()); mutate(copy);
    assert.throws(() => validatePhase2V21ProvinceZonalPilotEvidence(copy, raster()));
  }
});

test("pilot evidence rejects drift in its source raster readback", () => {
  const source = raster();
  source.outputs.find((row) => row.kind === "whole-interval-loss" && row.fromYear === 2020 && row.toYear === 2022).raster.sha256 = "c".repeat(64);
  assert.throws(() => validatePhase2V21ProvinceZonalPilotEvidence(evidence(), source));
});
