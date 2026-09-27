import assert from "node:assert/strict";
import test from "node:test";
import release from "../data/phase3-economic-region-interval-measurements.json";
import { parseRegionIntervalRelease, regionIntervalMeasurements } from "../lib/explore/region-intervals";
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

test("a partly unmapped region keeps its subtotal and withholds its share", () => {
  const regions = regionIntervalMeasurements(SPANS[0]);
  const partial = regions.filter((region) => region.coverage === "partial-with-unknown");
  assert.ok(partial.length > 0);
  for (const region of partial) {
    assert.equal(region.observedLossPercent, null);
    assert.equal(region.observedLossHectares, null);
    assert.ok(region.knownObservedSubtotalHectares! >= 0);
  }
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
