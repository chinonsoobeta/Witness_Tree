import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validate } from "../scripts/check-phase1-federal-electoral-production-admission.mjs";

const record = JSON.parse(readFileSync(new URL("../data/phase1-federal-electoral-production-admission.json", import.meta.url), "utf8"));
const clone = () => structuredClone(record);

test("federal production admission is exact and output-bound", () => {
  assert.doesNotThrow(() => validate(clone()));
});

test("federal production admission rejects output, rights, decision, and limitation drift", () => {
  for (const mutate of [
    (value) => { value.sharedArtifact.sha256 = "0".repeat(64); },
    (value) => { value.requiredAttribution = ""; },
    (value) => { value.decisions.productionAdmission = false; },
    (value) => { value.limits = []; },
    (value) => { value.ledgerFields.bulkRedistributionAllowed = false; },
  ]) {
    const value = clone(); mutate(value);
    assert.throws(() => validate(value));
  }
});
