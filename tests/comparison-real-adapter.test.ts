import assert from "node:assert/strict";
import test from "node:test";
import { adaptFederalRidingComparison, MINIMUM_RANKED_FOREST_HECTARES }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../lib/comparison/real-adapter.ts";

type FixtureRow = Readonly<{
  boundaryId: string;
  boundaryName: Readonly<{ en: string; fr: string }>;
  fromYear: number;
  toYear: number;
  knownForestedHectares: number;
  lossHectares: number | null;
  observedLossPercent: number | null;
  coverageGrade: "complete" | "partial-with-unknown" | "none-mapped";
  rankable: boolean;
  unmatchedOfficialShare: null;
}>;

const row = (id: number): FixtureRow => ({
  boundaryId: String(id),
  boundaryName: { en: `District ${id}`, fr: `Circonscription ${id}` },
  fromYear: 2021,
  toYear: 2022,
  knownForestedHectares: MINIMUM_RANKED_FOREST_HECTARES,
  lossHectares: 2,
  observedLossPercent: 2,
  coverageGrade: "complete" as const,
  rankable: true,
  unmatchedOfficialShare: null,
});

const fixture = () => ({
  schemaVersion: "witness-tree/phase2-federal-riding-latest-comparison/1",
  status: "local-nonproduction-executed",
  claims: { admitted: false as const, released: false as const, productionEligible: false as const, externalAction: false as const },
  context: { interval: { fromYear: 2021, toYear: 2022 } },
  rows: Array.from({ length: 343 }, (_, index) => row(index + 1)),
});

test("the real adapter keeps the 2021 denominator and Unknown semantics", () => {
  const input = fixture();
  input.rows[0] = {
    ...input.rows[0],
    lossHectares: null,
    observedLossPercent: null,
    coverageGrade: "partial-with-unknown",
    rankable: false,
  };
  const adapted = adaptFederalRidingComparison(input);
  assert.equal(adapted.rows.length, 343);
  assert.equal(adapted.rows[0]?.detectedChangePercent, null);
  assert.equal(adapted.rows[0]?.detectedChangeHectares, null);
  assert.equal(adapted.rows[0]?.coverageGrade, "not-applicable");
  assert.equal(adapted.rows[0]?.sufficientCoverage, false);
  assert.match(adapted.context.denominatorDefinition.en, /2021 first-year forest mask/);
  assert.match(adapted.context.method.en, /at least 500 forested hectares/);
});

test("the real adapter rejects a partial row restated as zero", () => {
  const input = fixture();
  input.rows[0] = { ...input.rows[0], coverageGrade: "partial-with-unknown", rankable: false };
  assert.throws(() => adaptFederalRidingComparison(input), /fabricates a complete value/);
});

test("the real adapter enforces the 500-hectare ranking floor on both sides", () => {
  const input = fixture();
  input.rows[0] = {
    ...input.rows[0],
    knownForestedHectares: MINIMUM_RANKED_FOREST_HECTARES - 0.01,
    rankable: false,
  };
  assert.equal(adaptFederalRidingComparison(input).rows[0]?.sufficientCoverage, false);
  input.rows[0] = { ...input.rows[0], rankable: true };
  assert.throws(() => adaptFederalRidingComparison(input), /inconsistent rankability/);
});
