import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const worker = path.join(root, "scripts/phase2_annual_zonal_aggregate_v2.py");
const fixture = path.join(root, "tests/fixtures/phase2-annual-zonal-v2-fixture.py");

const AREA_KEYS = [
  "boundaryId", "knownForestedHectares", "lossHectares", "knownObservedLossHectares",
  "unknownRequiredInputHectares", "unmappedByProductExtentHectares", "districtHectares",
  "observedLossOutsideFirstYearForestHectares", "coverageGrade", "observedLossPercent",
];

const pick = (row) => Object.fromEntries(AREA_KEYS.map((key) => [key, row[key]]));

function run(dir, output, sidecar, extra = []) {
  return execFileSync("python3", [worker,
    "--manifest", path.join(dir, "manifest.json"),
    "--boundaries", path.join(dir, "boundaries.geojson"),
    "--mapped-extent", path.join(dir, "mapped-extent.tif"),
    "--output", output, "--sidecar", sidecar,
    "--boundary-edition", "fixture-authoritative-2021",
    "--forest-mask-version", "annual-forest-fixture-v1",
    "--change-raster-version", "annual-loss-fixture-v1",
    "--time-version", "1984-2022",
    "--source-version", "fixture-v1",
    "--code-version", "fixture-code-v1",
    "--boundary-classification", "authoritative-boundary",
    "--admission-status", "not-admitted",
    ...extra], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

const allFeatures = ["--all-features", "--jurisdiction", "CA", "--boundary-name-field", "ED_NAME"];

test("v2 counts area the product never mapped as Unknown rather than as no forest", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "witness-tree-annual-zonal-v2-"));
  try {
    execFileSync("python3", [fixture, dir], { encoding: "utf8" });
    const output = path.join(dir, "annual.json");
    const sidecar = path.join(dir, "annual.sidecar.json");
    run(dir, output, sidecar, allFeatures);
    const rows = JSON.parse(readFileSync(output, "utf8"));
    assert.equal(rows.length, 5 * 39);

    // --all-features orders districts by boundary id, so the fixture provinces
    // come back 24, 35, 47, 48, 59 rather than in the order they were written.
    const baselines = rows.filter((row) => row.rowType === "baseline");
    assert.deepEqual(baselines.map((row) => row.boundaryId), ["24", "35", "47", "48", "59"]);
    assert.deepEqual(baselines.find((row) => row.boundaryId === "59"), {
      boundaryId: "59", boundaryName: "BC fixture district", province: "CA", rowType: "baseline",
      baselineYear: 1984, fromYear: null, toYear: null,
      temporalSemantics: "1984 forest-mask snapshot only; no annual loss period or loss value is assigned",
      knownForestedHectares: 1, lossHectares: null, knownObservedLossHectares: null,
      unknownRequiredInputHectares: 0, unmappedByProductExtentHectares: 0, districtHectares: 1,
      observedLossOutsideFirstYearForestHectares: null, coverageGrade: "complete", observedLossPercent: null,
    });

    /*
     * The unmapped district is the whole point. Its forest and loss rasters are
     * 0 in every year, which is indistinguishable from a mapped district that
     * holds no forest, so a summary that ignores the extent reports it as a
     * complete measurement of zero. Here it has to come back Unknown.
     */
    const unmappedBaseline = baselines.find((row) => row.boundaryId === "47");
    assert.equal(unmappedBaseline.coverageGrade, "none-mapped");
    assert.equal(unmappedBaseline.knownForestedHectares, 0);
    assert.equal(unmappedBaseline.unknownRequiredInputHectares, 1);
    assert.equal(unmappedBaseline.unmappedByProductExtentHectares, 1);
    assert.equal(unmappedBaseline.districtHectares, 1);

    const first = rows.filter((row) => row.rowType === "annual" && row.fromYear === 1984);
    assert.deepEqual(first.map(pick), [
      { boundaryId: "24", knownForestedHectares: 0, lossHectares: 0, knownObservedLossHectares: 0, unknownRequiredInputHectares: 0, unmappedByProductExtentHectares: 0, districtHectares: 1, observedLossOutsideFirstYearForestHectares: 1, coverageGrade: "complete", observedLossPercent: null },
      { boundaryId: "35", knownForestedHectares: 0, lossHectares: null, knownObservedLossHectares: 0, unknownRequiredInputHectares: 1, unmappedByProductExtentHectares: 0, districtHectares: 1, observedLossOutsideFirstYearForestHectares: 0, coverageGrade: "partial-with-unknown", observedLossPercent: null },
      { boundaryId: "47", knownForestedHectares: 0, lossHectares: null, knownObservedLossHectares: 0, unknownRequiredInputHectares: 1, unmappedByProductExtentHectares: 1, districtHectares: 1, observedLossOutsideFirstYearForestHectares: 0, coverageGrade: "none-mapped", observedLossPercent: null },
      { boundaryId: "48", knownForestedHectares: 1, lossHectares: 1, knownObservedLossHectares: 1, unknownRequiredInputHectares: 0, unmappedByProductExtentHectares: 0, districtHectares: 1, observedLossOutsideFirstYearForestHectares: 0, coverageGrade: "complete", observedLossPercent: 100 },
      { boundaryId: "59", knownForestedHectares: 1, lossHectares: 1, knownObservedLossHectares: 1, unknownRequiredInputHectares: 0, unmappedByProductExtentHectares: 0, districtHectares: 1, observedLossOutsideFirstYearForestHectares: 0, coverageGrade: "complete", observedLossPercent: 100 },
    ]);

    // Every interval, not just the first: an unmapped district is never
    // measured, so no year may quietly grade it complete.
    const unmapped = rows.filter((row) => row.boundaryId === "47");
    assert.equal(unmapped.length, 39);
    assert.ok(unmapped.every((row) => row.coverageGrade === "none-mapped"));
    assert.ok(unmapped.every((row) => row.lossHectares === null && row.observedLossPercent === null));
    assert.ok(unmapped.every((row) => row.unknownRequiredInputHectares === 1));

    const evidence = JSON.parse(readFileSync(sidecar, "utf8"));
    assert.equal(evidence.schemaVersion, "phase2-annual-province-zonal-aggregation-v2");
    assert.equal(evidence.execution.featureCount, 5);
    assert.equal(evidence.execution.annualPairCount, 38);
    assert.equal(evidence.execution.maskRasterizationCount, 5);
    assert.equal(evidence.execution.parameters.nodata, 255);
    assert.equal(evidence.nationalPerCellGeometryMaterialized, false);
    assert.deepEqual(evidence.claims, { admitted: false, released: false, productionEligible: false, externalAction: false });
    assert.equal(evidence.rows.length, 195);
    assert.equal(evidence.input.forestMasks.length, 38);
    assert.equal(evidence.input.annualLossRasters.length, 38);
    assert.equal(evidence.input.mappedExtent.kind, "mapped-extent");
    assert.match(evidence.input.mappedExtent.meaning, /Unknown rather than zero/);
    assert.equal(evidence.output.sha256, createHash("sha256").update(readFileSync(output)).digest("hex"));
    assert.equal(evidence.output.byteLength, readFileSync(output).byteLength);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("v2 still summarizes the four province targets when no jurisdiction is given", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "witness-tree-annual-zonal-v2-targets-"));
  try {
    execFileSync("python3", [fixture, dir], { encoding: "utf8" });
    const output = path.join(dir, "provinces.json");
    run(dir, output, path.join(dir, "provinces.sidecar.json"));
    const rows = JSON.parse(readFileSync(output, "utf8"));
    assert.equal(rows.length, 4 * 39);
    assert.deepEqual(rows.filter((row) => row.rowType === "baseline").map((row) => [row.province, row.boundaryId]),
      [["BC", "59"], ["AB", "48"], ["ON", "35"], ["QC", "24"]]);
    assert.ok(rows.every((row) => row.unmappedByProductExtentHectares === 0));
    assert.ok(rows.every((row) => row.districtHectares === 1));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("v2 refuses to run without a mapped extent, and refuses an extent that is not two-state", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "witness-tree-annual-zonal-v2-extent-"));
  try {
    execFileSync("python3", [fixture, dir], { encoding: "utf8" });
    // Without the extent there is no way to tell "no forest" from "not looked
    // at", so the run has to stop rather than fall back to the v1 behaviour.
    assert.throws(() => execFileSync("python3", [worker,
      "--manifest", path.join(dir, "manifest.json"),
      "--boundaries", path.join(dir, "boundaries.geojson"),
      "--output", path.join(dir, "no-extent.json"), "--sidecar", path.join(dir, "no-extent.sidecar.json"),
      "--boundary-edition", "fixture-authoritative-2021",
      "--forest-mask-version", "annual-forest-fixture-v1",
      "--change-raster-version", "annual-loss-fixture-v1",
      "--time-version", "1984-2022", "--source-version", "fixture-v1",
      "--code-version", "fixture-code-v1", "--boundary-classification", "authoritative-boundary",
      "--admission-status", "not-admitted",
    ], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }), /--mapped-extent/);

    // A 0 in the extent would be a third state, and nothing downstream knows
    // how to read it. Note that 0 is exactly what the land-cover source writes.
    const bad = path.join(dir, "bad-extent.tif");
    execFileSync("python3", ["-c", [
      "from osgeo import gdal, osr; import numpy as np, sys",
      "d=gdal.GetDriverByName('GTiff').Create(sys.argv[1], 5, 1, 1, gdal.GDT_Byte); s=osr.SpatialReference(); s.ImportFromEPSG(3857); d.SetProjection(s.ExportToWkt()); d.SetGeoTransform([0,100,0,100,0,-100]); b=d.GetRasterBand(1); b.SetNoDataValue(255); b.WriteArray(np.array([[1,1,1,0,255]], dtype=np.uint8)); d.FlushCache()",
    ].join("\n"), bad], { encoding: "utf8" });
    assert.throws(() => run(dir, path.join(dir, "bad-extent.json"), path.join(dir, "bad-extent.sidecar.json"),
      [...allFeatures, "--mapped-extent", bad]), /exactly 1 or 255/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("v2 fails closed on an extent raster that is not on the reference grid", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "witness-tree-annual-zonal-v2-grid-"));
  try {
    execFileSync("python3", [fixture, dir], { encoding: "utf8" });
    const bad = path.join(dir, "bad-grid.tif");
    execFileSync("python3", ["-c", [
      "from osgeo import gdal, osr; import numpy as np, sys",
      "d=gdal.GetDriverByName('GTiff').Create(sys.argv[1], 6, 1, 1, gdal.GDT_Byte); s=osr.SpatialReference(); s.ImportFromEPSG(3857); d.SetProjection(s.ExportToWkt()); d.SetGeoTransform([0,100,0,100,0,-100]); b=d.GetRasterBand(1); b.SetNoDataValue(255); b.WriteArray(np.array([[1,1,1,1,255,255]], dtype=np.uint8)); d.FlushCache()",
    ].join("\n"), bad], { encoding: "utf8" });
    assert.throws(() => run(dir, path.join(dir, "bad-grid.json"), path.join(dir, "bad-grid.sidecar.json"),
      [...allFeatures, "--mapped-extent", bad]), /exact reference grid/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/*
 * The defect this schema exists to remove, executed rather than described.
 *
 * Both workers get the same rasters: forest 0 and loss 0 in every year, which
 * is what the land-cover product writes outside the extent it maps. v1 has no
 * way to tell that apart from a district it measured and found no forest in,
 * so it answers with a complete measurement of zero. v2 reads the extent and
 * answers Unknown. Pinning v1's answer here is safe because v1 is frozen: its
 * sha256 is bound into the comparison receipt for the admitted province
 * aggregate, so it cannot change without that binding being reopened.
 */
test("v1 reports a complete zero where nobody looked, and v2 reports Unknown", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "witness-tree-annual-zonal-unmapped-"));
  const frozenWorker = path.join(root, "scripts/phase2_annual_zonal_aggregate.py");
  const unmappedFixture = path.join(root, "tests/fixtures/phase2-annual-zonal-unmapped-district-fixture.py");
  const shared = [
    "--boundary-edition", "fixture-authoritative-2021",
    "--forest-mask-version", "annual-forest-fixture-v1",
    "--change-raster-version", "annual-loss-fixture-v1",
    "--time-version", "1984-2022", "--source-version", "fixture-v1",
    "--code-version", "fixture-code-v1", "--boundary-classification", "authoritative-boundary",
    "--admission-status", "not-admitted",
  ];
  try {
    execFileSync("python3", [unmappedFixture, dir], { encoding: "utf8" });
    const common = [
      "--manifest", path.join(dir, "manifest.json"),
      "--boundaries", path.join(dir, "boundaries.geojson"),
    ];
    const readRow = (file) => {
      const rows = JSON.parse(readFileSync(file, "utf8"));
      return rows.find((row) => row.boundaryId === "59" && row.rowType === "annual" && row.fromYear === 1984);
    };

    execFileSync("python3", [frozenWorker, ...common,
      "--output", path.join(dir, "v1.json"), "--sidecar", path.join(dir, "v1.sidecar.json"), ...shared],
      { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const old = readRow(path.join(dir, "v1.json"));
    assert.deepEqual(pick(old), {
      boundaryId: "59", knownForestedHectares: 0, lossHectares: 0, knownObservedLossHectares: 0,
      unknownRequiredInputHectares: 0, unmappedByProductExtentHectares: undefined, districtHectares: undefined,
      observedLossOutsideFirstYearForestHectares: 0, coverageGrade: "complete", observedLossPercent: null,
    });

    execFileSync("python3", [worker, ...common, "--mapped-extent", path.join(dir, "mapped-extent.tif"),
      "--output", path.join(dir, "v2.json"), "--sidecar", path.join(dir, "v2.sidecar.json"), ...shared],
      { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const fixed = readRow(path.join(dir, "v2.json"));
    assert.deepEqual(pick(fixed), {
      boundaryId: "59", knownForestedHectares: 0, lossHectares: null, knownObservedLossHectares: 0,
      unknownRequiredInputHectares: 1, unmappedByProductExtentHectares: 1, districtHectares: 1,
      observedLossOutsideFirstYearForestHectares: 0, coverageGrade: "none-mapped", observedLossPercent: null,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/*
 * The other half of the defect, and the half that decides how the province
 * aggregate has to be described.
 *
 * Where a district is only partly outside the mapped extent, the known
 * subtotals are read from the mapped part alone, so the extent changes nothing
 * about them: both workers report the same forest and the same observed loss.
 * What the extent changes is the claim. v1 calls the subtotal a complete
 * measurement of the whole district and derives a rate from it; v2 says the
 * district was measured in part and withholds both the complete total and the
 * rate. Numbers unchanged, claim corrected.
 */
test("a partly mapped district keeps its known subtotals and loses its completeness claim", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "witness-tree-annual-zonal-partly-"));
  const frozenWorker = path.join(root, "scripts/phase2_annual_zonal_aggregate.py");
  const partlyFixture = path.join(root, "tests/fixtures/phase2-annual-zonal-partly-mapped-fixture.py");
  const shared = [
    "--boundary-edition", "fixture-authoritative-2021",
    "--forest-mask-version", "annual-forest-fixture-v1",
    "--change-raster-version", "annual-loss-fixture-v1",
    "--time-version", "1984-2022", "--source-version", "fixture-v1",
    "--code-version", "fixture-code-v1", "--boundary-classification", "authoritative-boundary",
    "--admission-status", "not-admitted",
  ];
  try {
    execFileSync("python3", [partlyFixture, dir], { encoding: "utf8" });
    const common = ["--manifest", path.join(dir, "manifest.json"), "--boundaries", path.join(dir, "boundaries.geojson")];
    const readRow = (file) => JSON.parse(readFileSync(file, "utf8"))
      .find((row) => row.boundaryId === "59" && row.rowType === "annual" && row.fromYear === 1984);

    execFileSync("python3", [frozenWorker, ...common,
      "--output", path.join(dir, "v1.json"), "--sidecar", path.join(dir, "v1.sidecar.json"), ...shared],
      { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    execFileSync("python3", [worker, ...common, "--mapped-extent", path.join(dir, "mapped-extent.tif"),
      "--output", path.join(dir, "v2.json"), "--sidecar", path.join(dir, "v2.sidecar.json"), ...shared],
      { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const old = readRow(path.join(dir, "v1.json"));
    const fixed = readRow(path.join(dir, "v2.json"));

    // The measurements themselves are untouched by the correction.
    assert.equal(fixed.knownForestedHectares, old.knownForestedHectares);
    assert.equal(fixed.knownObservedLossHectares, old.knownObservedLossHectares);
    assert.equal(fixed.observedLossOutsideFirstYearForestHectares, old.observedLossOutsideFirstYearForestHectares);
    assert.equal(old.knownForestedHectares, 1);
    assert.equal(old.knownObservedLossHectares, 1);

    // The claim about them is not.
    assert.deepEqual(
      { grade: old.coverageGrade, total: old.lossHectares, rate: old.observedLossPercent, unknown: old.unknownRequiredInputHectares },
      { grade: "complete", total: 1, rate: 100, unknown: 0 },
    );
    assert.deepEqual(
      { grade: fixed.coverageGrade, total: fixed.lossHectares, rate: fixed.observedLossPercent, unknown: fixed.unknownRequiredInputHectares },
      { grade: "partial-with-unknown", total: null, rate: null, unknown: 1 },
    );
    assert.equal(fixed.unmappedByProductExtentHectares, 1);
    assert.equal(fixed.districtHectares, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
