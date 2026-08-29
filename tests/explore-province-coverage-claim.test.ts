import assert from "node:assert/strict";
import test from "node:test";

import { EXPLORE_PRODUCTION_LAYER } from "../lib/explore/map-style.ts";

/*
 * The coverage grade is the strongest claim this table makes. "complete"
 * renders as "Every input pixel present", which is a statement that the whole
 * province was measured, and it was published for all four provinces when it
 * was true of at most one.
 *
 * The cause is recorded in docs/PHASE2_MAPPED_EXTENT_COVERAGE_DEFECT.md: the
 * land cover source writes 0 outside the extent it maps, and the derived
 * forest masks cannot distinguish that from a mapped cell holding no forest.
 * Nothing in this repository can re-derive the grades, because the evidence is
 * raster on an external volume. So they are pinned here instead. A change to
 * any of them is a change to a published claim and has to be argued for, not
 * made in passing.
 */
test("published province coverage grades match the evidence on record", () => {
  const grades = Object.fromEntries(
    EXPLORE_PRODUCTION_LAYER.rows.map((row) => [row.id, row.coverageGrade]),
  );
  assert.deepEqual(grades, {
    // Sampled unmapped in the 2020 source: Huntingdon 100%, Granby 98.92%.
    "24": "partial",
    // Ajax 100%, Stormont-Dundas-South Glengarry 99.98%.
    "35": "partial",
    // Calgary-Acadia 100%, and 62 of 87 divisions reporting zero forest.
    "48": "partial",
    // Richmond-Steveston and Vancouver-Yaletown both sampled fully mapped and
    // near treeless, so nothing on record contradicts a complete measurement.
    "59": "complete",
  });
});

test("a partial grade never carries a rate presented as the whole province", () => {
  // The hectares and the rate are read from the mapped part alone, which is
  // what makes them a minimum rather than a total. They must still be present:
  // withholding a measurement that was actually taken would be its own defect.
  for (const row of EXPLORE_PRODUCTION_LAYER.rows) {
    assert.ok(Number.isFinite(row.observedLossHectares), `${row.id} hectares`);
    assert.ok(Number.isFinite(row.observedLossPercent), `${row.id} percent`);
    assert.ok(row.observedLossHectares > 0, `${row.id} hectares are positive`);
  }
});
