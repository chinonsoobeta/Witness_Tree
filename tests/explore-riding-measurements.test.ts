import assert from "node:assert/strict";
import test from "node:test";
import { boundaryReadout } from "../lib/explore/boundary-readout";
import {
  parseRidingMapMeasurements,
  ridingMeasurements,
} from "../lib/explore/riding-measurements";

const claims = { admitted: false, released: false, productionEligible: false, externalAction: false };
const counts = { CA: 343, BC: 93, AB: 87, ON: 124, QC: 127 } as const;

function fixture() {
  const measurements = Object.entries(counts).flatMap(([jurisdiction, count]) =>
    Array.from({ length: count }, (_, index) => ({
      overlay: jurisdiction === "CA" ? "federal-ridings" : "provincial-ridings",
      jurisdiction,
      boundaryId: String(index + 1),
      fromYear: 2021,
      toYear: 2022,
      knownForestedHectares: 10,
      knownObservedLossHectares: 1,
      lossHectares: index === 0 ? null : 1,
      observedLossPercent: index === 0 ? null : 10,
      unknownRequiredInputHectares: index === 0 ? 2 : 0,
      unmappedByProductExtentHectares: index === 0 ? 2 : 0,
      districtHectares: 12,
      coverageGrade: index === 0 ? "partial-with-unknown" : "complete",
      evidence: "satellite-observation",
      claims: { ...claims },
    })),
  );
  return {
    schemaVersion: "witness-tree/phase2-riding-map-measurements/1",
    status: "local-nonproduction-executed",
    claims: { ...claims },
    context: { interval: { fromYear: 2021, toYear: 2022 } },
    sources: Array.from({ length: 5 }, () => ({})),
    measurements,
  };
}

test("validates and adapts the exact five-jurisdiction riding map join", () => {
  const result = parseRidingMapMeasurements(fixture());
  assert.equal(result.length, 774);
  assert.equal(new Set(result.map((row) => `${row.overlay}|${row.jurisdiction}|${row.boundaryId}`)).size, 774);
  assert.equal(result.find((row) => row.boundaryId === "ON-1")?.observedLossHectares, null);
  assert.equal(result.find((row) => row.boundaryId === "ON-1")?.knownObservedSubtotalHectares, 1);
});

test("the checked-in map join exposes the measured coverage without invented totals", () => {
  const byCoverage = Object.groupBy(ridingMeasurements, (row) => row.coverage);
  assert.deepEqual({
    complete: byCoverage.complete?.length,
    partial: byCoverage["partial-with-unknown"]?.length,
    noneMapped: byCoverage["none-mapped"]?.length,
  }, { complete: 188, partial: 171, noneMapped: 415 });
  assert.equal(ridingMeasurements.filter((row) =>
    row.coverage !== "complete" &&
    (row.observedLossHectares !== null || row.observedLossPercent !== null),
  ).length, 0);
  assert.ok(ridingMeasurements.some((row) => row.boundaryId === "CA-10001"));
  assert.ok(ridingMeasurements.some((row) => row.boundaryId === "BC-258"));
  assert.equal(boundaryReadout({
    overlay: "federal-ridings",
    jurisdiction: "CA",
    boundaryId: "CA-10001",
    name: "Avalon",
  }, ridingMeasurements, "en", { fromYear: 2021, toYear: 2022 }).kind, "riding-measurement");
});

test("fails closed on promoted claims or incomplete totals", () => {
  const promoted = fixture();
  promoted.claims.admitted = true;
  assert.throws(() => parseRidingMapMeasurements(promoted), /invalid release envelope/);

  const fabricated = fixture();
  fabricated.measurements[0].lossHectares = 1;
  assert.throws(() => parseRidingMapMeasurements(fabricated), /inconsistent coverage semantics/);
});

test("a fully mapped riding that held no forest keeps a null share instead of failing closed", () => {
  // Thirty-four rows in the all-interval join are exactly this: urban British
  // Columbia seats, fully inside the mapped extent, with no forest to divide
  // by. Requiring a share here would blank the map the moment a reader moved
  // off 2021 to 2022, and reporting zero would claim a measurement nobody made.
  const source = fixture();
  const row = source.measurements[1] as Record<string, unknown>;
  row.knownForestedHectares = 0;
  row.knownObservedLossHectares = 0;
  row.lossHectares = 0;
  row.observedLossPercent = null;
  const parsed = parseRidingMapMeasurements(source);
  const adapted = parsed.find((entry) => entry.boundaryId === "CA-2");
  assert.equal(adapted?.coverage, "complete");
  assert.equal(adapted?.observedLossPercent, null);
  assert.equal(adapted?.observedLossHectares, 0);
});

test("a fully mapped riding with no forest may not report loss it could not have measured", () => {
  const source = fixture();
  const row = source.measurements[1] as Record<string, unknown>;
  row.knownForestedHectares = 0;
  row.lossHectares = 5;
  row.observedLossPercent = null;
  assert.throws(() => parseRidingMapMeasurements(source), /inconsistent coverage semantics/);
});
