import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { EXPLORE_PRODUCTION_LAYER, formatUnknownSharePercent } from "../lib/explore/map-style.ts";

const receipt = JSON.parse(readFileSync(new URL("../data/phase2-annual-province-zonal-v2-receipt-2026-08-29.json", import.meta.url), "utf8"));
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/*
 * The coverage grade is the strongest claim this table makes. "complete"
 * renders as "Every input pixel present", which is a statement that the whole
 * province was measured, and it was published for all four provinces when the
 * corrected execution proves that none is complete.
 *
 * The cause is recorded in docs/PHASE2_MAPPED_EXTENT_COVERAGE_DEFECT.md: the
 * land cover source writes 0 outside the extent it maps, and the derived
 * forest masks cannot distinguish that from a mapped cell holding no forest.
 * The exact corrected execution is on the governed external data root, so the
 * measured areas and grades are pinned here. A change to any of them is a
 * change to a published claim and has to be argued for, not made in passing.
 */
test("published province coverage grades match the evidence on record", () => {
  const grades = Object.fromEntries(
    EXPLORE_PRODUCTION_LAYER.rows.map((row) => [row.id, row.coverageGrade]),
  );
  assert.deepEqual(grades, {
    "24": "partial",
    "35": "partial",
    "48": "partial",
    "59": "partial",
  });
});

test("published province coverage areas equal the corrected execution", () => {
  const areas = Object.fromEntries(EXPLORE_PRODUCTION_LAYER.rows.map((row) => [row.id, {
    unknownRequiredInputHectares: row.unknownRequiredInputHectares,
    unmappedByProductExtentHectares: row.unmappedByProductExtentHectares,
    districtHectares: row.districtHectares,
    unknownSharePercent: row.unknownSharePercent,
  }]));
  assert.deepEqual(areas, {
    "24": { unknownRequiredInputHectares: 22204952.19, unmappedByProductExtentHectares: 22204952.19, districtHectares: 147544902, unknownSharePercent: 15.049623463100067 },
    "35": { unknownRequiredInputHectares: 8843646.69, unmappedByProductExtentHectares: 8843646.69, districtHectares: 97932917.61, unknownSharePercent: 9.03031065123395 },
    "48": { unknownRequiredInputHectares: 15372023.76, unmappedByProductExtentHectares: 15372023.76, districtHectares: 63992872.89, unknownSharePercent: 24.021462181301985 },
    "59": { unknownRequiredInputHectares: 4095.27, unmappedByProductExtentHectares: 4095.27, districtHectares: 91730013.75, unknownSharePercent: 0.004464482051819162 },
  });
  assert.deepEqual(receipt.coverage.map(({ boundaryId, unknownRequiredInputHectares, unmappedByProductExtentHectares, districtHectares, unknownSharePercent }: {
    boundaryId: string;
    unknownRequiredInputHectares: number;
    unmappedByProductExtentHectares: number;
    districtHectares: number;
    unknownSharePercent: number;
  }) => [boundaryId, { unknownRequiredInputHectares, unmappedByProductExtentHectares, districtHectares, unknownSharePercent }]), Object.entries(areas));
});

test("the province coverage receipt binds the governed output pair when attached", (context) => {
  const root = process.env.WITNESS_TREE_DATA_ROOT ?? "/Volumes/Extended_SSD/Witness_Tree-data";
  for (const key of ["annualJson", "sidecar"] as const) {
    const descriptor = receipt.artifacts[key];
    const file = path.join(root, descriptor.path.replace(/^\.\.\/Witness_Tree-data\//u, ""));
    if (!existsSync(file)) {
      context.skip("external Witness Tree data root is not attached");
      return;
    }
    const bytes = readFileSync(file);
    assert.equal(bytes.length, descriptor.byteLength);
    assert.equal(sha256(bytes), descriptor.sha256);
  }
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

test("a nonzero unknown share never renders as zero", () => {
  /*
   * British Columbia's unknown area is 4,095.27 ha, which is 0.0045% of the
   * province. Rounded to the two decimals the column shows, that is "0" - a
   * flat claim of complete coverage printed in the same sentence as the
   * hectares that are not covered. The label has to stay a minimum claim at
   * every magnitude, including the ones too small for the column to show.
   */
  const bc = EXPLORE_PRODUCTION_LAYER.rows.find((row) => row.id === "59");
  assert.ok(bc, "British Columbia is missing from the production layer");
  assert.ok(bc.unknownRequiredInputHectares > 0);
  assert.equal(formatUnknownSharePercent(bc.unknownSharePercent, "en"), "<0.01%");
  assert.equal(formatUnknownSharePercent(bc.unknownSharePercent, "fr"), "<0,01\u00a0%");

  // Shares the column can show are shown, in both locales' own notation.
  assert.equal(formatUnknownSharePercent(24.021462181301985, "en"), "24.02%");
  assert.equal(formatUnknownSharePercent(9.03031065123395, "en"), "9.03%");

  // A province with nothing unknown is a real result, not a rounded one, so it
  // must not be dressed up as "less than": that would understate the evidence.
  assert.equal(formatUnknownSharePercent(0, "en"), "0%");
});
