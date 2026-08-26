import assert from "node:assert/strict";
import test from "node:test";
import { applyIndigenousMinimumAreaRule } from "../lib/indigenous/minimum-area";
import type { Reported } from "../lib/domain";

const rawRecord: Reported = {
  kind: "figure", value: 2, unit: "ha", evidence: "satellite-observation",
  confidence: { level: "limited", ruleId: "CONF-LIMITED-001", reason: { en: "Illustrative record.", fr: "Registre illustratif." } },
  provenance: { dataset: "Illustrative dataset", version: "example-1", retrievedDate: "2026-08-25", licence: "ogl-canada-2.0" },
};
const reason = { en: "Area is below the admitted resolution threshold; the raw record is shown without a rate.", fr: "La superficie est sous le seuil de résolution admis; le registre brut est affiché sans taux." };

test("a reserve below the configured minimum preserves its raw record and declines a rate", () => {
  const result = applyIndigenousMinimumAreaRule(9.99, 10, rawRecord, reason);
  assert.equal(result.belowMinimumArea, true);
  assert.equal(result.rawRecord, rawRecord);
  assert.deepEqual(result.rate, { kind: "unknown", evidence: "unknown", reason, coverageGrade: "not-applicable" });
});

test("a geography at the minimum remains eligible and invalid area inputs fail closed", () => {
  assert.equal(applyIndigenousMinimumAreaRule(10, 10, rawRecord, reason).rate, rawRecord);
  assert.throws(() => applyIndigenousMinimumAreaRule(-1, 10, rawRecord, reason), /Area/);
  assert.throws(() => applyIndigenousMinimumAreaRule(1, 0, rawRecord, reason), /greater than zero/);
});
