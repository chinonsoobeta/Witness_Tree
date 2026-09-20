import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  EXPLORE_PER_CELL_LAYER,
  EXPLORE_PER_CELL_SPAN_LAYER,
  fourProvinceAnnualForYear,
  perCellSpanYears,
} from "../lib/explore/per-cell";

// The span archive holds every four-province patch in one layer tagged with the
// closing year of its interval. A span from A to B draws A < year <= B, so the
// span 2020 to 2022 draws the 2020-2021 and 2021-2022 patches and nothing else.

test("a span maps to the closing years it draws", () => {
  assert.deepEqual(perCellSpanYears(2020, 2022), { after: 2020, through: 2022 });
  assert.deepEqual(perCellSpanYears(1984, 2022), { after: 1984, through: 2022 });
  assert.deepEqual(perCellSpanYears(2021, 2022), { after: 2021, through: 2022 });
});

test("a span outside the archive or out of order draws nothing rather than part of it", () => {
  assert.equal(perCellSpanYears(1983, 1990), null);
  assert.equal(perCellSpanYears(2020, 2023), null);
  assert.equal(perCellSpanYears(2022, 2022), null);
  assert.equal(perCellSpanYears(2022, 2020), null);
  assert.equal(perCellSpanYears(2020.5, 2022), null);
});

test("the span record points at one layer carrying the year the map filters on", () => {
  assert.equal(EXPLORE_PER_CELL_SPAN_LAYER.sourceLayer, "spans");
  assert.equal(EXPLORE_PER_CELL_SPAN_LAYER.yearProperty, "year");
  assert.equal(EXPLORE_PER_CELL_SPAN_LAYER.firstYear, 1985);
  assert.equal(EXPLORE_PER_CELL_SPAN_LAYER.lastYear, 2022);
  assert.equal(EXPLORE_PER_CELL_SPAN_LAYER.countable, false);
  assert.equal(EXPLORE_PER_CELL_SPAN_LAYER.productionEligible, false);
  assert.ok(EXPLORE_PER_CELL_SPAN_LAYER.maxZoom >= 14);
  assert.match(EXPLORE_PER_CELL_SPAN_LAYER.url, /\/releases\/phase2-per-cell-span-archive-four-province-v1\/[0-9a-f]{64}\/spans\.pmtiles$/);
  assert.ok(EXPLORE_PER_CELL_SPAN_LAYER.url.includes(EXPLORE_PER_CELL_SPAN_LAYER.releaseId));
});

test("the emitter tags the year only when asked, so the annual archives keep their bytes", () => {
  const emitter = readFileSync(new URL("../scripts/emit-phase2-per-cell-geojson.mjs", import.meta.url), "utf8");
  assert.match(emitter, /WITNESS_TREE_PER_CELL_YEAR === "1"/);
  const builder = readFileSync(new URL("../scripts/build-phase2-per-cell-span-tiles.sh", import.meta.url), "utf8");
  assert.match(builder, /WITNESS_TREE_PER_CELL_YEAR=1/);
  assert.match(builder, /--layer=spans/);
  assert.match(builder, /--attribute-type=year:int/);
});

test("the four-province annual figures come from the clipped release and partition exactly", () => {
  assert.equal(EXPLORE_PER_CELL_LAYER.intervals.length, 38);
  for (let year = 1985; year <= 2022; year += 1) {
    const annual = fourProvinceAnnualForYear(year);
    assert.ok(annual, `no figures for ${year}`);
    assert.equal(annual.interval, `${year - 1}-${year}`);
    assert.equal(annual.harvestCells + annual.fireCells + annual.unattributedCells, annual.cellCount);
    assert.ok(annual.unattributedCells >= 0);
    assert.equal(annual.hectares, Math.round(annual.cellCount * 9) / 100);
  }
  assert.equal(fourProvinceAnnualForYear(1984), null);
  assert.equal(fourProvinceAnnualForYear(2023), null);
});
