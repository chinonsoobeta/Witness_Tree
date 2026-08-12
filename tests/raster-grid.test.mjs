import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateRasterDefects, validateRasterGrid } from "../scripts/check-raster-grid.mjs";

const grid = JSON.parse(readFileSync(new URL("../data/raster-grid.json", import.meta.url), "utf8"));
const defects = JSON.parse(readFileSync(new URL("../data/raster-defects.json", import.meta.url), "utf8"));

const withGrid = (patch) => ({ ...grid, ...patch });
const withDefects = (patch) => ({ ...defects, ...patch });
const replaceDefect = (replacement) => defects.defects.map((defect) => (defect.year === replacement.year ? replacement : defect));

test("the raster grid record reproduces the verified GDAL evidence", () => {
  assert.equal(validateRasterGrid(grid), grid);
  assert.equal(validateRasterDefects(defects, grid), defects);
  assert.equal(grid.years.length, 39);
  assert.equal(grid.grid.width, 193936);
  assert.equal(grid.grid.height, 128340);
  assert.equal(grid.grid.width * grid.grid.height, grid.grid.cellCount);
  assert.deepEqual(grid.grid.geotransform, [-2660910.524, 30.0, 0.0, 2998848.1105, 0.0, -30.0]);
  assert.equal(grid.grid.noDataValue, 255);
  assert.equal(grid.classScheme.classes.length, 13);
  assert.equal(grid.productionEligible, false);
  assert.equal(grid.toolchain.gdal, "3.13.2");
  assert.equal(grid.toolchain.proj, "9.8.1");
  assert.equal(grid.toolchain.geos, "3.14.1");
});

test("the record covers 1984 to 2022 and never claims coverage to the present", () => {
  assert.equal(grid.temporalCoverage.firstYear, 1984);
  assert.equal(grid.temporalCoverage.lastYear, 2022);
  assert.equal(grid.temporalCoverage.yearCount, 39);
  const serialized = JSON.stringify(grid);
  assert.equal(/1984\s*[–—-]\s*present/i.test(serialized), false);
  assert.equal(/1984\s+to\s+present/i.test(serialized), false);
  assert.match(grid.temporalCoverage.note.en, /Unknown/);

  assert.throws(
    () => validateRasterGrid(withGrid({ temporalCoverage: { ...grid.temporalCoverage, lastYear: 2026 } })),
    /Last covered year is 2026/,
  );
  assert.throws(
    () => validateRasterGrid(withGrid({ temporalCoverage: { ...grid.temporalCoverage, label: { en: "1984–present", fr: "1984–présent" } } })),
    /claims coverage to the present/,
  );
  assert.throws(() => validateRasterGrid(withGrid({ years: grid.years.slice(0, 38) })), /exactly 39 years/);
  assert.throws(
    () => validateRasterGrid(withGrid({ years: [...grid.years.slice(0, 7), 1992, ...grid.years.slice(8)] })),
    /gap at index 7/,
  );
});

test("grid identity drift is rejected rather than warned about", () => {
  assert.throws(() => validateRasterGrid(withGrid({ grid: { ...grid.grid, width: 193937 } })), /Raster width is 193937/);
  assert.throws(() => validateRasterGrid(withGrid({ grid: { ...grid.grid, height: 128341 } })), /Raster height is 128341/);
  assert.throws(
    () => validateRasterGrid(withGrid({ grid: { ...grid.grid, geotransform: [-2660910.524, 30.0, 0.0, 2998848.11, 0.0, -30.0] } })),
    /Geotransform term 3/,
  );
  assert.throws(
    () => validateRasterGrid(withGrid({ grid: { ...grid.grid, crs: { ...grid.grid.crs, proj4: "+proj=lcc +lat_0=49" } } })),
    /raster grid proj4 string changed/,
  );
  assert.throws(
    () => validateRasterGrid(withGrid({ grid: { ...grid.grid, crs: { ...grid.grid.crs, authorityCode: 3978 } } })),
    /no authority code; none may be supplied/,
  );
  assert.throws(() => validateRasterGrid(withGrid({ grid: { ...grid.grid, noDataValue: 0 } })), /NoData value is 0/);
  assert.throws(() => validateRasterGrid(withGrid({ productionEligible: true })), /production eligibility/);
});

test("exactly two years are recorded as VAT-defective, with their observed sizes and controls", () => {
  assert.deepEqual(defects.defects.map((defect) => defect.year), [1991, 2005]);
  assert.equal(defects.defectiveYearCount, 2);
  assert.equal(defects.populatedYearCount, 37);
  for (const defect of defects.defects) {
    assert.equal(defect.observedByteLength, 98);
    assert.equal(defect.observedRecordCount, 0);
    assert.equal(defect.controlByteLength, 488);
    assert.equal(defect.controlRecordCount, 13);
    assert.equal(defect.pixelsVerifiedSound, true);
    assert.equal(defect.severity, "metadata-only");
    assert.match(defect.statement.en, /Unknown, never 0/);
    assert.match(defect.statement.fr, /jamais 0/);
    assert.equal(defect.controlYears.some((year) => [1991, 2005].includes(year)), false);
  }

  assert.throws(
    () => validateRasterDefects(withDefects({ defects: [defects.defects[0]] }), grid),
    /Exactly 2 years are recorded as VAT-defective/,
  );
  assert.throws(
    () => validateRasterDefects(withDefects({ defects: [...defects.defects, { ...defects.defects[0], year: 1992 }] }), grid),
    /Exactly 2 years are recorded as VAT-defective/,
  );
  assert.throws(
    () => validateRasterDefects(withDefects({ defects: replaceDefect({ ...defects.defects[0], observedRecordCount: 13 }) }), grid),
    /1991 observed record count is 13/,
  );
  assert.throws(
    () => validateRasterDefects(withDefects({ defects: replaceDefect({ ...defects.defects[0], controlYears: [2005] }) }), grid),
    /cannot use another defective year as a control/,
  );
  assert.throws(
    () => validateRasterDefects(withDefects({ defects: replaceDefect({ ...defects.defects[0], pixelsVerifiedSound: false }) }), grid),
    /pixels were verified sound/,
  );
  assert.throws(() => validateRasterDefects(withDefects({ defectiveYearCount: 1 }), grid), /Defective year count is 1/);
});

test("the verbatim never-substitute-zero rule cannot be reworded away", () => {
  assert.equal(
    defects.rule.en,
    "Render insufficient evidence as `Unknown` with an em dash and a reason. Do not substitute `0`, including in summaries, exports, tables, or tests.",
  );
  assert.match(defects.rule.fr, /Ne jamais substituer/);
  assert.throws(
    () => validateRasterDefects(withDefects({ rule: { en: "Prefer Unknown where possible.", fr: "Préférer Inconnu si possible." } }), grid),
    /quoted verbatim and must not be reworded/,
  );
  assert.throws(
    () => validateRasterDefects(withDefects({ defects: replaceDefect({ ...defects.defects[1], statement: { en: "2005 has no classes.", fr: "2005 n'a aucune classe." } }) }), grid),
    /Unknown, never 0/,
  );
});

test("the record keeps every stated limitation of the validation run", () => {
  const limitations = grid.limitations.join("\n");
  assert.match(limitations, /-stats was never run/);
  assert.match(limitations, /1 cell in 261,000/);
  assert.match(limitations, /ogrinfo -so reads headers only/);
  assert.match(limitations, /No reprojection and no raster-to-vector intersection has actually been executed/);

  assert.throws(
    () => validateRasterGrid(withGrid({ limitations: grid.limitations.filter((entry) => !/-stats was never run/.test(entry)) })),
    /-stats was never run/,
  );
  assert.throws(
    () => validateRasterGrid(withGrid({ limitations: grid.limitations.filter((entry) => !/ogrinfo -so/.test(entry)) })),
    /no geometry validity check/,
  );
  assert.throws(
    () => validateRasterGrid(withGrid({ limitations: grid.limitations.filter((entry) => !/No reprojection/.test(entry)) })),
    /no reprojection or intersection has been executed/,
  );
  assert.throws(() => validateRasterGrid(withGrid({ toolchain: { ...grid.toolchain, statsRun: true } })), /-stats was never run/);
  assert.throws(() => validateRasterGrid(withGrid({ status: "verified" })), /local-validation-record/);
  assert.throws(() => validateRasterGrid(withGrid({ notice: "Raster series validated." })), /not-ingested limitation/);
});

test("the boundary counts confirmed by real OGR reads are pinned", () => {
  const counts = Object.fromEntries(grid.boundaryFeatureCounts.layers.map((layer) => [layer.archive, layer.featureCount]));
  assert.equal(counts["FED_CA_2023_EN-SHP.zip"], 343);
  assert.equal(counts["lfed000b21a_e.zip"], 338);
  assert.equal(counts["lpr_000b21a_e.zip"], 13);
  assert.equal(counts["lcd_000b21a_e.zip"], 293);
  assert.equal(counts["lcsd000b21a_e.zip"], 5161);
  assert.equal(grid.boundaryCrsAgreement.statCanEqualsElectionsCanada, true);
  assert.equal(grid.reprojection.crsMatch, false);

  assert.throws(
    () => validateRasterGrid(withGrid({
      boundaryFeatureCounts: {
        ...grid.boundaryFeatureCounts,
        layers: grid.boundaryFeatureCounts.layers.map((layer) => layer.archive === "FED_CA_2023_EN-SHP.zip" ? { ...layer, featureCount: 338 } : layer),
      },
    })),
    /feature count is 338; the confirmed count is 343/,
  );
  assert.throws(
    () => validateRasterGrid(withGrid({ reprojection: { ...grid.reprojection, crsMatch: true } })),
    /must not claim they match/,
  );
  assert.throws(
    () => validateRasterGrid(withGrid({ resamplingPolicy: { ...grid.resamplingPolicy, policy: "nearest-neighbour" } })),
    /never-resample-the-raster/,
  );
});

test("every user-visible string in both records carries English and French", () => {
  const pairs = [];
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node.en === "string" || typeof node.fr === "string") pairs.push(node);
    Object.values(node).forEach(walk);
  };
  walk(grid);
  walk(defects);
  assert.ok(pairs.length >= 20);
  for (const pair of pairs) {
    assert.equal(typeof pair.en, "string", `English missing in ${JSON.stringify(pair)}`);
    assert.equal(typeof pair.fr, "string", `French missing in ${JSON.stringify(pair)}`);
    assert.notEqual(pair.en.trim(), "");
    assert.notEqual(pair.fr.trim(), "");
  }
});
