import assert from "node:assert/strict";
import test from "node:test";
import { assertGridConformance, compareChangeBetweenYears, describeGridDeviation, CANONICAL_GRID }
// @ts-expect-error Node's TypeScript runner requires explicit local extensions.
from "../lib/grid/conformance.ts";
import { declareReprojectedToGrid, planRasterVectorIntersection }
// @ts-expect-error Node's TypeScript runner requires explicit local extensions.
from "../lib/grid/reprojection.ts";
import { classAreaFromVat, classListFromVat, formatClassArea, requireClassArea, requireClassList, VAT_DEFECTIVE_YEARS }
// @ts-expect-error Node's TypeScript runner requires explicit local extensions.
from "../lib/grid/class-area.ts";
import type {
  BoundaryCrsVectorLayer,
  ConformantRasterYear,
  GridAlignedVectorLayer,
  LandCoverClassValue,
  RasterYearHeader,
  VatSidecar,
} from "../lib/grid/types";
import {
  BOUNDARY_CRS_ID,
  BOUNDARY_CRS_PROJ4,
  RASTER_GRID_CRS_ID,
  RASTER_GRID_CRS_PROJ4,
} from "../lib/grid/types";

const header = (year: number, patch: Partial<RasterYearHeader> = {}): RasterYearHeader => ({
  year,
  crsId: RASTER_GRID_CRS_ID,
  crsProj4: RASTER_GRID_CRS_PROJ4,
  geotransform: [-2660910.524, 30.0, 0.0, 2998848.1105, 0.0, -30.0],
  width: 193936,
  height: 128340,
  bandCount: 1,
  dataType: "Byte",
  noDataValue: 255,
  resampled: false,
  ...patch,
});

const STATCAN_FED_2023: BoundaryCrsVectorLayer = {
  layerId: "FED_CA_2023_EN",
  featureCount: 343,
  crsId: BOUNDARY_CRS_ID,
  crsProj4: BOUNDARY_CRS_PROJ4,
  reprojectedFrom: null,
};

/** The 1990 sidecar, populated: 488 bytes, 13 records. Used as the control year. */
const VAT_1990: VatSidecar = {
  year: 1990,
  byteLength: 488,
  recordCount: 13,
  counts: {
    "0": 17219937123,
    "20": 1203631526,
    "31": 75619399,
    "32": 109517967,
    "33": 408331193,
    "40": 180517863,
    "50": 858594202,
    "80": 688444631,
    "81": 283637797,
    "100": 327566642,
    "210": 2736110295,
    "220": 338614581,
    "230": 459223021,
  },
};

/** The 1991 sidecar as published: header only, 98 bytes, zero records. */
const VAT_1991: VatSidecar = { year: 1991, byteLength: 98, recordCount: 0, counts: {} };
/** The 2005 sidecar as published: header only, 98 bytes, zero records. */
const VAT_2005: VatSidecar = { year: 2005, byteLength: 98, recordCount: 0, counts: {} };

// ---------------------------------------------------------------------------
// Hazard (a): reprojection
// ---------------------------------------------------------------------------

test("a vector layer that has not been reprojected onto the grid cannot be intersected", () => {
  const raster = assertGridConformance(header(2022));
  const notReprojected = STATCAN_FED_2023 as unknown as GridAlignedVectorLayer;
  assert.throws(
    () => planRasterVectorIntersection(raster, notReprojected),
    /has not been reprojected to the VLCE2 grid coordinate reference system/,
  );

  const aligned = declareReprojectedToGrid(STATCAN_FED_2023);
  const plan = planRasterVectorIntersection(raster, aligned);
  assert.equal(plan.crsId, RASTER_GRID_CRS_ID);
  assert.equal(plan.vectorReprojectedFrom, BOUNDARY_CRS_ID);
  assert.equal(plan.featureCount, 343);
  assert.equal(plan.rasterResampled, false);
  assert.equal(plan.intersectionComputed, false);
  assert.equal(plan.productionEligible, false);
  assert.match(plan.limitation.en, /Unknown/);
  assert.match(plan.limitation.fr, /inconnu/);
});

test("the raster is never the side that gets reprojected or resampled", () => {
  const resampled = { ...header(2022), resampled: true } as unknown as RasterYearHeader;
  assert.throws(() => assertGridConformance(resampled), /categorical class codes; resampling them fabricates classes/);

  const raster = { ...assertGridConformance(header(2022)), resampled: true } as unknown as ConformantRasterYear;
  const aligned = declareReprojectedToGrid(STATCAN_FED_2023);
  assert.throws(() => planRasterVectorIntersection(raster, aligned), /resampling them fabricates classes|never resampled/);

  const reversed = { ...aligned, reprojection: { from: RASTER_GRID_CRS_ID, to: BOUNDARY_CRS_ID } } as unknown as GridAlignedVectorLayer;
  assert.throws(
    () => planRasterVectorIntersection(assertGridConformance(header(2022)), reversed),
    /only admitted reprojection is boundary vectors onto the VLCE2 grid/,
  );
});

test("a layer already in the grid CRS is not laundered through the reprojection declaration", () => {
  const alreadyAligned = { ...STATCAN_FED_2023, crsId: RASTER_GRID_CRS_ID, crsProj4: RASTER_GRID_CRS_PROJ4 } as unknown as BoundaryCrsVectorLayer;
  assert.throws(() => declareReprojectedToGrid(alreadyAligned), /not in the recorded boundary coordinate reference system/);
  assert.throws(
    () => declareReprojectedToGrid({ ...STATCAN_FED_2023, reprojectedFrom: BOUNDARY_CRS_ID } as unknown as BoundaryCrsVectorLayer),
    /cannot be reprojected twice/,
  );
  assert.throws(() => declareReprojectedToGrid({ ...STATCAN_FED_2023, featureCount: 0 }), /known positive feature count/);
});

// ---------------------------------------------------------------------------
// Hazard (b): the empty 1991 and 2005 raster attribute tables
// ---------------------------------------------------------------------------

test("the 1991 class area is Unknown with a reason and is never 0", () => {
  const area = classAreaFromVat(VAT_1991, 210);
  assert.equal(area.kind, "unknown");
  assert.notEqual(area, 0);
  assert.equal("hectares" in area, false);
  assert.equal("pixelCount" in area, false);
  assert.match(area.reason.en, /published empty/);
  assert.match(area.reason.en, /98 bytes/);
  assert.match(area.reason.fr, /publiée vide/);

  const rendered = formatClassArea(area);
  assert.match(rendered.en, /^Unknown – /);
  assert.match(rendered.fr, /^Inconnu – /);
  assert.equal(/\b0\b/.test(rendered.en.split("–")[0]), false);
  assert.equal(rendered.en.includes("0 ha"), false);
  assert.equal(rendered.fr.includes("0 ha"), false);

  assert.throws(() => requireClassArea(area), /Unknown and must not be treated as zero/);
});

test("the 2005 class area behaves identically, and a control year still reports a real number", () => {
  const area2005 = classAreaFromVat(VAT_2005, 230);
  assert.equal(area2005.kind, "unknown");
  assert.throws(() => requireClassArea(area2005), /must not be treated as zero/);
  assert.deepEqual([...VAT_DEFECTIVE_YEARS], [1991, 2005]);

  const control = classAreaFromVat(VAT_1990, 210);
  assert.equal(control.kind, "known");
  assert.equal(control.kind === "known" && control.pixelCount, 2736110295);
  assert.equal(control.kind === "known" && control.hectares, 2736110295 * 0.09);
  assert.equal(requireClassArea(control) > 0, true);
  assert.match(formatClassArea(control).en, /ha$/);
});

test("the 1991 class list is Unknown rather than an empty list", () => {
  const list = classListFromVat(VAT_1991);
  assert.equal(list.kind, "unknown");
  assert.equal("classValues" in list, false);
  assert.match(list.reason.en, /no class statistic can be read from this sidecar/);
  assert.throws(() => requireClassList(list), /Unknown and must not be treated as empty/);

  const control = classListFromVat(VAT_1990);
  assert.equal(control.kind, "known");
  assert.equal(requireClassList(control).length, 13);
});

test("a sidecar that is short, over-full, or missing a row is Unknown, never zero", () => {
  const short: VatSidecar = { ...VAT_1990, year: 1992, recordCount: 12 };
  assert.equal(classAreaFromVat(short, 210).kind, "unknown");
  assert.equal(classListFromVat(short).kind, "unknown");

  const missingRow: VatSidecar = { ...VAT_1990, counts: { ...VAT_1990.counts, "210": undefined as unknown as number } };
  const area = classAreaFromVat(missingRow, 210);
  assert.equal(area.kind, "unknown");
  assert.match(area.kind === "unknown" ? area.reason.en : "", /An absent row is not evidence of an absent class/);

  const outOfScheme: VatSidecar = { ...VAT_1990, counts: { ...VAT_1990.counts, "255": 1 } };
  assert.equal(classListFromVat(outOfScheme).kind, "unknown");

  assert.throws(
    () => formatClassArea({ kind: "unknown", classValue: 210, reason: { en: "  ", fr: "  " } }),
    /requires a reason/,
  );
});

test("no Unknown reason ever shows a reader the words undefined, null, or NaN, in either language", () => {
  const broken = (patch: Partial<Record<keyof VatSidecar, unknown>>): VatSidecar =>
    ({ ...VAT_1990, ...patch }) as unknown as VatSidecar;

  const malformed: VatSidecar[] = [
    broken({ year: undefined, recordCount: 0 }),
    broken({ year: null, recordCount: 0 }),
    broken({ year: Number.NaN, recordCount: 0 }),
    broken({ year: undefined, recordCount: undefined }),
    broken({ year: Number.NaN, recordCount: Number.NaN }),
    broken({ year: null, recordCount: null }),
    broken({ year: undefined, recordCount: 12 }),
    broken({ year: 1990.5, recordCount: undefined }),
    broken({ year: undefined, counts: {} }),
    broken({ year: null, counts: { ...VAT_1990.counts, "210": undefined } }),
    broken({ year: undefined, counts: { ...VAT_1990.counts, undefined: 1 } }),
    broken({ year: Number.NaN, counts: { ...VAT_1990.counts, null: 1 } }),
    broken({ year: null, counts: { ...VAT_1990.counts, NaN: 1 } }),
    broken({ year: undefined, counts: { ...VAT_1990.counts, "255": 1 } }),
  ];
  const classValues: LandCoverClassValue[] = [
    210,
    undefined as unknown as LandCoverClassValue,
    Number.NaN as unknown as LandCoverClassValue,
  ];

  const forbidden = /undefined|null|NaN/i;
  let unknownCount = 0;

  const inspect = (reason: { en: string; fr: string }) => {
    unknownCount += 1;
    for (const text of [reason.en, reason.fr]) {
      assert.equal(text.trim().length > 0, true);
      assert.equal(forbidden.test(text), false, `Unknown reason leaked a placeholder: ${text}`);
    }
  };

  for (const sidecar of malformed) {
    const before = unknownCount;

    const list = classListFromVat(sidecar);
    if (list.kind === "unknown") inspect(list.reason);

    for (const classValue of classValues) {
      const area = classAreaFromVat(sidecar, classValue);
      if (area.kind === "unknown") {
        inspect(area.reason);
        const rendered = formatClassArea(area);
        // The Unknown marker is U+2013, matching the marker asserted at line 140 and the Phase 3
        // criterion named for an en dash. U+2014 is banned repository-wide.
        assert.match(rendered.en, /^Unknown – /);
        assert.match(rendered.fr, /^Inconnu – /);
        assert.equal(forbidden.test(rendered.en), false, rendered.en);
        assert.equal(forbidden.test(rendered.fr), false, rendered.fr);
      }
    }

    assert.equal(unknownCount > before, true, `A malformed sidecar produced no Unknown at all: ${JSON.stringify(sidecar)}`);
  }

  // Every malformed sidecar is exercised against the class list and three class values.
  assert.equal(unknownCount >= malformed.length, true);
});

// ---------------------------------------------------------------------------
// Hazard (c): grid conformance
// ---------------------------------------------------------------------------

test("a year off the canonical grid cannot enter a change comparison", () => {
  const conformant2022 = assertGridConformance(header(2022));
  const conformant1984 = assertGridConformance(header(1984));
  const comparison = compareChangeBetweenYears(conformant1984, conformant2022);
  assert.equal(comparison.fromYear, 1984);
  assert.equal(comparison.toYear, 2022);
  assert.equal(comparison.width, CANONICAL_GRID.width);
  assert.equal(comparison.pixelsCompared, false);
  assert.equal(comparison.productionEligible, false);

  const wrongSize = header(2021, { width: 193935 });
  assert.throws(() => assertGridConformance(wrongSize), /Different extents cannot be compared cell by cell/);
  assert.throws(
    () => compareChangeBetweenYears(conformant1984, { ...wrongSize, conformsToCanonicalGrid: true } as ConformantRasterYear),
    /Different extents cannot be compared cell by cell/,
  );

  const wrongGeotransform = header(2021, { geotransform: [-2660910.524, 30.0, 0.0, 2998848.11, 0.0, -30.0] });
  assert.throws(() => assertGridConformance(wrongGeotransform), /do not land on the same ground positions/);
  assert.throws(
    () => compareChangeBetweenYears({ ...wrongGeotransform, conformsToCanonicalGrid: true } as ConformantRasterYear, conformant2022),
    /do not land on the same ground positions/,
  );

  const wrongCrs = header(2021, { crsProj4: "+proj=lcc +lat_0=63.390675 +lon_0=-91.8666666666667 +x_0=6200000 +y_0=3000000 +datum=NAD83 +units=m +no_defs" });
  assert.throws(() => assertGridConformance(wrongCrs), /not pixel aligned and cannot be compared/);
  assert.throws(
    () => compareChangeBetweenYears(conformant1984, { ...wrongCrs, conformsToCanonicalGrid: true } as ConformantRasterYear),
    /not pixel aligned and cannot be compared/,
  );
});

test("conformance deviations are reported bilingually and are never soft failures", () => {
  const deviation = describeGridDeviation(header(2021, { noDataValue: 0 }));
  assert.notEqual(deviation, null);
  assert.equal(deviation!.field, "nodata");
  assert.equal(deviation!.expected, "255");
  assert.equal(deviation!.observed, "0");
  assert.match(deviation!.message.en, /silently reclassify cells/);
  assert.match(deviation!.message.fr, /reclasserait des cellules/);
  assert.equal(describeGridDeviation(header(2000)), null);

  assert.throws(() => assertGridConformance(header(2023)), /outside the staged VLCE2 coverage of 1984–2022/);
  assert.throws(() => assertGridConformance(header(1983)), /outside the staged VLCE2 coverage of 1984–2022/);
  assert.throws(
    () => compareChangeBetweenYears(assertGridConformance(header(1990)), assertGridConformance(header(1990))),
    /needs two different years/,
  );
  assert.throws(
    () => compareChangeBetweenYears(header(1990) as ConformantRasterYear, assertGridConformance(header(2000))),
    /has not been checked against the canonical VLCE2 grid/,
  );
});

test("the defective-VAT years remain usable for grid comparison; only their sidecar statistics are blocked", () => {
  const y1991 = assertGridConformance(header(1991));
  const y2005 = assertGridConformance(header(2005));
  assert.equal(compareChangeBetweenYears(y1991, y2005).pixelsCompared, false);
  assert.equal(classAreaFromVat(VAT_1991, 210).kind, "unknown");
});
