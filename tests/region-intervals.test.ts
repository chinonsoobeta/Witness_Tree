import assert from "node:assert/strict";
import test from "node:test";
import release from "../data/phase3-economic-region-interval-measurements.json";
import { parseRegionIntervalRelease, REGION_UNKNOWN_TOLERANCE_PERCENT, regionIntervalMeasurements } from "../lib/explore/region-intervals";
import { intervalSpanFigures } from "../lib/explore/interval-spans";
import { intervalWindowIndex } from "../lib/explore/interval";
import { provinceSpanMeasurements } from "../lib/explore/province-spans";

const clone = () => JSON.parse(JSON.stringify(release));
const SPANS = [
  { fromYear: 1984, toYear: 2022 },
  { fromYear: 2000, toYear: 2010 },
  { fromYear: 2021, toYear: 2022 },
];

test("the 44 economic regions add up to their provinces in every span checked", () => {
  // The regions are built from census subdivisions and the provinces from a
  // separate zonal run over the province boundaries. Both tile the same land,
  // so any gap or overlap between the two builds shows up here.
  for (const span of SPANS) {
    const regions = regionIntervalMeasurements(span);
    assert.equal(regions.length, 44);
    for (const province of provinceSpanMeasurements(span)) {
      const inside = regions.filter((region) => region.boundaryId.slice(12, 14) === province.id);
      assert.ok(inside.length > 0, province.id);
      const union = inside.reduce((total, region) => total + region.knownObservedSubtotalHectares!, 0);
      const summed = inside.reduce((total, region) => total + region.summedLossHectares, 0);
      // Each region is rounded to the hundredth of a hectare on its own.
      assert.ok(Math.abs(union - province.unionLossHectares!) < 0.01 * inside.length, `${province.id} ${span.fromYear}`);
      assert.ok(Math.abs(summed - province.summedLossHectares!) < 0.01 * inside.length, `${province.id} ${span.fromYear}`);
    }
  }
});

test("regions are keyed as the overlay tiles key them", () => {
  for (const region of regionIntervalMeasurements(SPANS[0])) {
    assert.equal(region.overlay, "economic-regions");
    assert.equal(region.jurisdiction, "CA");
    assert.match(region.boundaryId, /^CA-2021S0500(24|35|48|59)\d{2}$/);
  }
});

test("a region more than 1% unmapped keeps its subtotal and withholds its share", () => {
  const regions = regionIntervalMeasurements(SPANS[0]);
  const partial = regions.filter((region) => region.coverage === "partial-with-unknown");
  assert.ok(partial.length > 0);
  for (const region of partial) {
    assert.equal(region.observedLossPercent, null);
    assert.equal(region.observedLossHectares, null);
    assert.equal(region.admittedUnknownPercent, undefined);
    assert.ok(region.knownObservedSubtotalHectares! >= 0);
  }
});

test("a region under 1% unmapped is admitted and names its unmapped share", () => {
  // The owner's 2026-09-27 decision. Eight regions fall under the line at the
  // 1984 start; their share is taken over the mapped forest alone.
  const admitted = regionIntervalMeasurements(SPANS[0]).filter((region) => region.admittedUnknownPercent !== undefined);
  assert.deepEqual(admitted.map((region) => region.boundaryId).sort(), [
    "CA-2021S05002410", "CA-2021S05002460", "CA-2021S05003595", "CA-2021S05004870",
    "CA-2021S05004880", "CA-2021S05005910", "CA-2021S05005960", "CA-2021S05005970",
  ]);
  const byId = new Map(parseRegionIntervalRelease(release).map((region) => [region.boundaryId, region]));
  for (const region of admitted) {
    assert.equal(region.coverage, "complete");
    assert.ok(region.admittedUnknownPercent! > 0 && region.admittedUnknownPercent! < REGION_UNKNOWN_TOLERANCE_PERCENT);
    const source = byId.get(region.boundaryId)!;
    const known = source.knownForestCellsByStartYear[0];
    assert.ok(Math.abs(region.observedLossPercent! - (source.unionLossCells[intervalWindowIndex(SPANS[0])] / known) * 100) < 1e-9);
    assert.equal(region.observedLossHectares, region.knownObservedSubtotalHectares);
  }
});

test("the tolerance is the regions' alone", () => {
  const edge = { unmappedCells: 5, annualLossPrefix: [0, 1], knownForestCellsByStartYear: [995], unknownCellsByStartYear: [5], unionLossCells: [1] };
  const span = { fromYear: 1984, toYear: 1985 };
  const strict = intervalSpanFigures(edge as never, span);
  assert.equal(strict.coverage, "partial-with-unknown");
  assert.equal(strict.admittedUnknownPercent, undefined);
  const tolerant = intervalSpanFigures(edge as never, span, 1);
  assert.equal(tolerant.coverage, "complete");
  assert.equal(tolerant.admittedUnknownPercent, 0.5);
  // Exactly at the line is not under it.
  const onLine = { ...edge, knownForestCellsByStartYear: [990], unknownCellsByStartYear: [10], unmappedCells: 10 };
  assert.equal(intervalSpanFigures(onLine as never, span, 1).coverage, "partial-with-unknown");
});

test("the loader fails closed on a short or impossible region", () => {
  const short = clone();
  short.regions[0].annualLossCells.pop();
  assert.throws(() => parseRegionIntervalRelease(short), /invalid contract/);
  const impossible = clone();
  impossible.regions[0].unionLossCellDeltas[0] = impossible.regions[0].knownForestCellsByStartYear[0] + 1;
  assert.throws(() => parseRegionIntervalRelease(impossible), /breaks a span invariant/);
  const missing = clone();
  missing.regions.pop();
  assert.throws(() => parseRegionIntervalRelease(missing), /envelope/);
  const claimed = clone();
  claimed.claims.released = true;
  assert.throws(() => parseRegionIntervalRelease(claimed), /envelope/);
});
