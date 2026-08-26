import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase2V21RasterReadbackEvidence } from "../scripts/check-phase2-v21-raster-readback-evidence.mjs";

const evidence = JSON.parse(readFileSync(new URL("../data/phase2-v21-raster-readback-evidence.json", import.meta.url), "utf8"));

test("V2.1 readback binds exactly 11 snapshots and 10 complete whole intervals", () => {
  assert.equal(validatePhase2V21RasterReadbackEvidence(evidence), evidence);
  assert.equal(evidence.outputs.length, 21);
  assert.equal(evidence.outputs.every(({ raster, sidecar }) => /^[a-f0-9]{64}$/.test(raster.sha256) && /^[a-f0-9]{64}$/.test(sidecar.sha256)), true);
  assert.equal(evidence.claims.productionEligible, false);
});

test("V2.1 evidence rejects omissions, interval drift, duplicates, code drift, and promoted claims", () => {
  for (const mutate of [
    (candidate) => { candidate.outputs.pop(); },
    (candidate) => { candidate.outputs.at(-1).fromYear = 2019; },
    (candidate) => { candidate.outputs[1].raster.path = candidate.outputs[0].raster.path; },
    (candidate) => { candidate.codeProvenance.runnerSha256 = "0".repeat(64); },
    (candidate) => { candidate.claims.admitted = true; }
  ]) {
    const changed = structuredClone(evidence); mutate(changed);
    assert.throws(() => validatePhase2V21RasterReadbackEvidence(changed));
  }
});
