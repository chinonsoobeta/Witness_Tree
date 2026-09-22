import assert from "node:assert/strict";
import test from "node:test";

import releaseRecord from "../data/phase3-province-span-release.json";
import { EXPLORE_PRODUCTION_LAYER } from "../lib/explore/map-style";
import {
  fourProvinceSpanMeasurement,
  parseProvinceSpanRelease,
  provinceSpanMeasurements,
  spanShareClass,
} from "../lib/explore/province-spans";

test("the 2020-2022 span is the admitted province aggregate, to the hundredth of a hectare", () => {
  const rows = provinceSpanMeasurements({ fromYear: 2020, toYear: 2022 });
  assert.equal(rows.length, 4);
  for (const published of EXPLORE_PRODUCTION_LAYER.rows) {
    const row = rows.find((candidate) => candidate.id === published.id);
    assert.ok(row, published.id);
    assert.equal(Math.round((row.unionLossHectares ?? Number.NaN) * 100), Math.round(published.observedLossHectares * 100), published.id);
  }
});

test("the four-province figure is the exact sum of the provinces and never a summed share", () => {
  for (const span of [{ fromYear: 1984, toYear: 2022 }, { fromYear: 2021, toYear: 2022 }, { fromYear: 1990, toYear: 1998 }]) {
    const rows = provinceSpanMeasurements(span);
    const four = fourProvinceSpanMeasurement(span);
    assert.ok(four);
    const union = rows.reduce((sum, row) => sum + (row.unionLossHectares ?? 0), 0);
    const known = rows.reduce((sum, row) => sum + (row.knownForestedHectares ?? 0), 0);
    assert.equal(four.unionLossHectares, union);
    assert.equal(four.knownForestedHectares, known);
    assert.equal(four.unionLossPercent, (union / known) * 100);
    for (const row of rows) assert.ok((row.unionLossHectares ?? 0) <= (row.summedLossHectares ?? 0));
  }
});

test("unknown land stays out of the loss share and is reported beside it", () => {
  const rows = provinceSpanMeasurements({ fromYear: 1984, toYear: 2022 });
  const share = Object.fromEntries(rows.map((row) => [row.code, row.unknownSharePercent]));
  assert.ok(share.BC < 0.01);
  assert.ok(share.AB > 20 && share.QC > 10 && share.ON > 5);
  assert.ok(rows.find((row) => row.code === "BC")?.unmappedCharacter);
  assert.equal(rows.length, 4);
  assert.ok(rows.every((row) => row.unionLossHectares !== null && row.unionLossPercent !== null && row.unknownHectares !== null));
});

test("the whole-span unknown areas equal the admitted coverage-gap receipt", async () => {
  const receipt = (await import("../data/coverage-gap-investigation-2026-09-08.json")).default;
  const expected = receipt.findings.gap.provinceHectares;
  const rows = provinceSpanMeasurements({ fromYear: 1984, toYear: 2022 });
  for (const row of rows) assert.equal(Math.round((row.unknownHectares ?? Number.NaN) * 100), Math.round(expected[row.code] * 100), row.code);
});

test("span share classes use fixed breaks, and a missing share has no class", () => {
  assert.deepEqual([0, 0.99, 1, 4.99, 5, 10, 19.99, 20, 90].map(spanShareClass), [0, 0, 1, 1, 2, 3, 3, 4, 4]);
  assert.equal(spanShareClass(null), null);
  assert.equal(spanShareClass(Number.NaN), null);
});

type Mutable = {
  claims: { expertReviewed: boolean };
  summedPercentAllowed: boolean;
  spanCount: number;
  provinces: { intervalKnownCells: number[] }[];
};

test("a release the page cannot read correctly is refused", () => {
  const good = JSON.parse(JSON.stringify(releaseRecord));
  assert.equal(parseProvinceSpanRelease(good).length, 4);
  for (const mutate of [
    (value: Mutable) => { value.claims.expertReviewed = true; },
    (value: Mutable) => { value.summedPercentAllowed = true; },
    (value: Mutable) => { value.spanCount = 740; },
    (value: Mutable) => { value.provinces[0].intervalKnownCells.pop(); },
    (value: Mutable) => { value.provinces.pop(); },
  ]) {
    const copy = JSON.parse(JSON.stringify(releaseRecord));
    mutate(copy);
    assert.throws(() => parseProvinceSpanRelease(copy));
  }
});
