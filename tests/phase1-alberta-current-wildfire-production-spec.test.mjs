import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkPhase1AlbertaCurrentWildfireProductionSpec, validatePhase1AlbertaCurrentWildfireProductionSpec } from "../scripts/check-phase1-alberta-current-wildfire-production-spec.mjs";

const read = () => JSON.parse(readFileSync(new URL("../data/transformation-specs/phase1-alberta-current-wildfire-production-v1.json", import.meta.url), "utf8"));

test("keeps every Alberta and current-wildfire production specification checksum-bound and fail-closed", () => {
  const spec = read();
  assert.equal(validatePhase1AlbertaCurrentWildfireProductionSpec(spec), spec);
  assert.equal(spec.rows.length, 7);
});

test("cross-checks each stated checksum, count, version, and geometry output against its named evidence", async () => {
  const spec = await checkPhase1AlbertaCurrentWildfireProductionSpec();
  assert.equal(spec.rows.length, 7);
});

test("rejects a fabricated production claim or an unsafe BC quarantine change", () => {
  const spec = read();
  const fabricated = structuredClone(spec);
  fabricated.claims.productionEligible = true;
  assert.throws(() => validatePhase1AlbertaCurrentWildfireProductionSpec(fabricated));
  const unsafe = structuredClone(spec);
  unsafe.rows.find((row) => row.sourceId === "bc-wildfire").operation.output.expectedQuarantineIds = [];
  assert.throws(() => validatePhase1AlbertaCurrentWildfireProductionSpec(unsafe));
  for (const claim of ["transformed", "ingested", "released", "productionAdmission", "phase2"]) {
    const changed = structuredClone(spec);
    changed.claims[claim] = true;
    assert.throws(() => validatePhase1AlbertaCurrentWildfireProductionSpec(changed));
  }
  const wrongChecksum = structuredClone(spec);
  wrongChecksum.rows.find((row) => row.sourceId === "ab-wildfire").input.rawSha256 = "0".repeat(64);
  assert.throws(() => validatePhase1AlbertaCurrentWildfireProductionSpec(wrongChecksum));
  const wrongVersion = structuredClone(spec);
  wrongVersion.rows.find((row) => row.sourceId === "cwfis-current").input.archiveVersionId = "fabricated";
  assert.throws(() => validatePhase1AlbertaCurrentWildfireProductionSpec(wrongVersion));
});
