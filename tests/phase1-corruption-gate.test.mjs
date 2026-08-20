import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { runPhase1CorruptionGate } from "../scripts/check-phase1-corruption-gate.mjs";

const read = (file) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));

const inputs = {
  acquisitionReadiness: read("data/acquisition-readiness.json"),
  stagedAcquisitions: read("data/staged-acquisitions.json"),
  geospatialProfile: read("data/staged-geospatial-profile.json"),
};

test("Phase 1 corruption probes reject altered acquisition, staging, and geometry evidence", () => {
  const result = runPhase1CorruptionGate(inputs);
  assert.equal(result.status, "passed");
  assert.deepEqual(result.probes.map(({ id, rejected }) => [id, rejected]), [
    ["audited-head-length", true],
    ["staged-archive-integrity", true],
    ["staged-production-claim", true],
    ["profiled-geometry-count", true],
  ]);
});

test("corruption gate fails closed when a clean input is already invalid", () => {
  assert.throws(() => runPhase1CorruptionGate({
    ...inputs,
    stagedAcquisitions: { ...inputs.stagedAcquisitions, entries: [{ ...inputs.stagedAcquisitions.entries[0], zipIntegrity: "failed" }, ...inputs.stagedAcquisitions.entries.slice(1)] },
  }), /integrity/i);
});
