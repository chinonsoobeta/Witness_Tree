import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase1GeometryPolicies } from "../scripts/check-phase1-geometry-policies.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const records = () => ({
  ledger: read("../data/phase1-production-source-ledger.json"),
  bc: read("../data/bc-wildfire-geometry-policy-2026-08-14.json"),
  ontario: read("../data/ontario-in-year-fire-geometry-policy-2026-08-14.json"),
  admission: read("../data/current-wildfire-owner-admission.json")
});

test("combined geometry-policy gate rejects an implied archive, admission, or missing ledger reference", () => {
  assert.doesNotThrow(() => validatePhase1GeometryPolicies(records()));
  const archived = records(); archived.bc.immutablePromotionReady = true;
  assert.throws(() => validatePhase1GeometryPolicies(archived));
  const admitted = records(); admitted.ontario.ownerAdmission = true;
  assert.throws(() => validatePhase1GeometryPolicies(admitted));
  const premature = records(); premature.admission.pipeline.productionEligible = true;
  assert.throws(() => validatePhase1GeometryPolicies(premature));
  const unlinked = records();
  unlinked.ledger.entries.find((entry) => entry.id === "bc-wildfire").evidenceRefs = [];
  assert.throws(() => validatePhase1GeometryPolicies(unlinked));
});
