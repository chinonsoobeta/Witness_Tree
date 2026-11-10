import assert from "node:assert/strict";
import test from "node:test";
import { adaptFederalRidingComparison, MINIMUM_RANKED_FOREST_HECTARES }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../lib/comparison/real-adapter.ts";

type FixtureRow = Readonly<{
  boundaryId: string;
  name: Readonly<{ en: string; fr: string }>;
  knownForestedHectares: number;
  observedLossHectares: number | null;
  observedLossPercent: number | null;
  coverage: "complete" | "partial-with-unknown" | "none-mapped";
  admittedUnknownPercent?: number;
}>;

// 280 four-province federal ridings with figures (BC's 59 prefix), and 63 elsewhere, named only.
const row = (id: number): FixtureRow => ({
  boundaryId: `CA-59${String(id).padStart(3, "0")}`,
  name: { en: `District ${id}`, fr: `Circonscription ${id}` },
  knownForestedHectares: MINIMUM_RANKED_FOREST_HECTARES,
  observedLossHectares: 2,
  observedLossPercent: 2,
  coverage: "complete" as const,
});

const fixture = () => ({
  interval: { fromYear: 1984, toYear: 2022 },
  dataVersion: "phase3-interval-release-test",
  rows: Array.from({ length: 280 }, (_, index) => row(index + 1)),
  outside: Array.from({ length: 63 }, (_, index) => ({ boundaryId: `CA-10${String(index + 1).padStart(3, "0")}`, name: { en: `Away ${index}`, fr: `Ailleurs ${index}` } })),
});

test("the real adapter keeps the span's denominator and Unknown semantics", () => {
  const input = fixture();
  input.rows[0] = {
    ...input.rows[0]!,
    observedLossHectares: null,
    observedLossPercent: null,
    coverage: "partial-with-unknown",
  };
  input.rows[1] = { ...input.rows[1]!, admittedUnknownPercent: 0.4 };
  const adapted = adaptFederalRidingComparison(input);
  assert.equal(adapted.rows.length, 280);
  assert.equal(adapted.outside.length, 63);
  assert.equal(adapted.nationalTotal, 343);
  assert.equal(adapted.rows[0]?.id, "federal-59001");
  assert.equal(adapted.rows[0]?.detectedChangePercent, null);
  assert.equal(adapted.rows[0]?.detectedChangeHectares, null);
  assert.equal(adapted.rows[0]?.coverageGrade, "not-applicable");
  assert.equal(adapted.rows[0]?.sufficientCoverage, false);
  assert.equal(adapted.rows[1]?.admittedUnknownPercent, 0.4, "an admitted unmapped share travels with the figure");
  assert.equal(adapted.outside[0]?.id, "federal-10001");
  assert.equal(adapted.context.timeRange, "1984–2022");
  assert.equal(adapted.context.dataVersion, "phase3-interval-release-test");
  assert.match(adapted.context.denominatorDefinition.en, /mapped forest as it stood in 1984/);
  assert.match(adapted.context.method.en, /at least 500 hectares of forest, mapped in full or with less than 1% unmapped/);
});

test("the real adapter rejects a partial row restated as zero, and a full row without a figure", () => {
  const input = fixture();
  input.rows[0] = { ...input.rows[0]!, coverage: "partial-with-unknown" };
  assert.throws(() => adaptFederalRidingComparison(input), /fabricates a complete value/);
  const missing = fixture();
  missing.rows[0] = { ...missing.rows[0]!, observedLossPercent: null };
  assert.throws(() => adaptFederalRidingComparison(missing), /fully mapped but has no figure/);
});

test("the real adapter enforces the 500-hectare ranking floor", () => {
  const input = fixture();
  input.rows[0] = { ...input.rows[0]!, knownForestedHectares: MINIMUM_RANKED_FOREST_HECTARES - 0.01 };
  assert.equal(adaptFederalRidingComparison(input).rows[0]?.sufficientCoverage, false);
  assert.equal(adaptFederalRidingComparison(fixture()).rows[0]?.sufficientCoverage, true, "exactly 500 hectares is ranked");
});

test("the real adapter accounts for all 343 federal ridings and keeps the four provinces apart from the rest", () => {
  const short = fixture();
  short.outside.pop();
  assert.throws(() => adaptFederalRidingComparison(short), /exactly 343 districts/);
  const away = fixture();
  away.rows[0] = { ...away.rows[0]!, boundaryId: "CA-10999" };
  away.outside.pop();
  away.outside.push({ boundaryId: "CA-59999", name: { en: "X", fr: "X" } });
  assert.throws(() => adaptFederalRidingComparison(away), /outside the four provinces/);
  const twice = fixture();
  twice.outside[0] = { boundaryId: "CA-59001", name: { en: "X", fr: "X" } };
  assert.throws(() => adaptFederalRidingComparison(twice), /Duplicate federal district CA-59001/);
});
