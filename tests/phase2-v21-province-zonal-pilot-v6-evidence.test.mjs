import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase2V21ProvinceZonalPilotV6Evidence } from "../scripts/check-phase2-v21-province-zonal-pilot-v6-evidence.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const evidence = () => read("data/phase2-v21-province-zonal-pilot-v6-evidence.json");
const raster = () => read("data/phase2-v21-raster-readback-evidence.json");
const admitted = () => read("data/phase2-v21-province-zonal-pilot-evidence.json");

test("v6 evidence records the portable worker reproducing the admitted output", () => {
  const record = evidence();
  assert.equal(validatePhase2V21ProvinceZonalPilotV6Evidence(record, raster(), admitted()), record);
  assert.equal(record.run.batchId, "phase2-v21-zonal-province-2021-cbf-v6");
  assert.notEqual(record.run.workerSha256, admitted().run.workerSha256);
  assert.equal(record.artifacts.output.sha256, admitted().artifacts.output.sha256);
  assert.equal(record.claims.admitted, false);
});

test("v6 evidence rejects claim, worker, batch, binding and schema tampering", () => {
  for (const mutate of [
    (copy) => { copy.claims.admitted = true; },
    (copy) => { copy.claims.released = true; },
    (copy) => { copy.status = "admitted"; },
    (copy) => { copy.run.batchId = "phase2-v21-zonal-province-2021-cbf-v5"; },
    (copy) => { copy.run.workerSha256 = "ba331f904d73c6f0ecf77a87029154b00d539a366c06c2e69863f531d32b1a41"; },
    (copy) => { copy.run.workerSha256 = "a".repeat(64); },
    (copy) => { copy.inputBindings.boundary.sha256 = "b".repeat(64); },
    (copy) => { copy.result.featureCount = 12; },
    (copy) => { copy.reproduction.reproducedOutputSha256 = "c".repeat(64); },
    (copy) => { copy.reproduction.reproducesBatchId = "phase2-v21-zonal-province-2021-cbf-v6"; },
    (copy) => { copy.unexpected = true; },
  ]) {
    const copy = structuredClone(evidence()); mutate(copy);
    assert.throws(() => validatePhase2V21ProvinceZonalPilotV6Evidence(copy, raster(), admitted()));
  }
});

// The reproduction claim is the only reason this record exists, so it must fail rather than quietly become
// false when the run it claims to reproduce moves underneath it.
test("v6 evidence rejects an identity claim the admitted record no longer supports", () => {
  const drifted = admitted();
  drifted.artifacts.output.sha256 = "d".repeat(64);
  assert.throws(() => validatePhase2V21ProvinceZonalPilotV6Evidence(evidence(), raster(), drifted));
});

test("v6 evidence rejects drift in its source raster readback", () => {
  const source = raster();
  source.outputs.find((row) => row.kind === "forest-mask-snapshot" && row.year === 2020).raster.sha256 = "e".repeat(64);
  assert.throws(() => validatePhase2V21ProvinceZonalPilotV6Evidence(evidence(), source, admitted()));
});

// The frozen worker record is named for the digest it must hash to, so a swapped record breaks equality.
test("v6 evidence binds a frozen worker record that is not the admitted one", () => {
  const record = evidence();
  assert.match(record.run.workerSha256, /^e01a1168/);
  assert.equal(readFileSync(new URL("../data/provenance/phase2_zonal_aggregate.candidate-e01a1168.py", import.meta.url)).length > 0, true);
});
