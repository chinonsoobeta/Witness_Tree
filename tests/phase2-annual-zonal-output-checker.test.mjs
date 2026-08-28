import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  CANONICAL_GRID,
  TARGETS,
  WORKER_PATH,
  sha256Bytes,
  validateAnnualZonalDocuments,
  verify,
} from "../scripts/check-phase2-annual-zonal-output.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const checker = path.join(root, "scripts", "check-phase2-annual-zonal-output.mjs");
const canonicalGridRecord = JSON.parse(readFileSync(path.join(root, "data", "raster-grid.json"), "utf8"));
const canonicalCrs = canonicalGridRecord.grid.crs.wkt;

function row(target, rowType, fromYear = null) {
  if (rowType === "baseline") {
    return {
      baselineYear: 1984,
      boundaryId: target.boundaryId,
      coverageGrade: "complete",
      fromYear: null,
      knownForestedHectares: 0.09,
      knownObservedLossHectares: null,
      lossHectares: null,
      observedLossOutsideFirstYearForestHectares: null,
      observedLossPercent: null,
      province: target.province,
      rowType: "baseline",
      temporalSemantics: "1984 forest-mask snapshot only; no annual loss period or loss value is assigned",
      toYear: null,
      unknownRequiredInputHectares: 0,
    };
  }
  const toYear = fromYear + 1;
  const isUnknown = target.province === "ON" && fromYear === 1984;
  return {
    baselineYear: null,
    boundaryId: target.boundaryId,
    coverageGrade: isUnknown ? "partial-with-unknown" : "complete",
    fromYear,
    knownForestedHectares: 0.09,
    knownObservedLossHectares: 0,
    lossHectares: isUnknown ? null : 0,
    observedLossOutsideFirstYearForestHectares: 0,
    observedLossPercent: isUnknown ? null : 0,
    province: target.province,
    rowType: "annual",
    temporalSemantics: `${fromYear}-${toYear} adjacent annual pair; denominator is the ${fromYear} first-year forest-mask snapshot`,
    toYear,
    unknownRequiredInputHectares: isUnknown ? 0.09 : 0,
  };
}

function rowsFixture() {
  return TARGETS.flatMap((target) => [
    row(target, "baseline"),
    ...Array.from({ length: 38 }, (_unused, index) => row(target, "annual", 1984 + index)),
  ]);
}

function descriptor(kind, index) {
  const year = 1984 + index;
  if (kind === "forest-mask") {
    return { byteLength: 100 + index, kind, path: `/fixture/forest-mask-${year}.tif`, sha256: `${String(index + 1).padStart(2, "0")}${"a".repeat(62)}`, year };
  }
  return { byteLength: 200 + index, fromYear: year, kind, path: `/fixture/annual-loss-${year}-${year + 1}.tif`, sha256: `${String(index + 1).padStart(2, "0")}${"b".repeat(62)}`, toYear: year + 1 };
}

function sidecarFixture(outputPath, rows) {
  const workerSha256 = createHash("sha256").update(readFileSync(WORKER_PATH)).digest("hex");
  return {
    admitted: false,
    algorithm: "windowed-bounded-batch-feature-mask-rasterization",
    claims: { admitted: false, externalAction: false, productionEligible: false, released: false },
    execution: {
      annualPairCount: 38,
      codeVersion: "fixture-code-v1",
      completedAt: "2026-08-27T00:00:01Z",
      elapsedSeconds: 1,
      environment: { gdalVersion: "GDAL fixture", numpyVersion: "2.0.0", pythonVersion: "3.14.0" },
      featureCount: 4,
      maskRasterizationCount: 4,
      maximumScratchAllocatedBytes: 0,
      parameters: { cellHectares: 0.09, columnWindow: 32768, gdalCacheBytes: 268435456, nodata: 255, rowWindow: 2048 },
      peakRssBytes: 1,
      processedWindowCount: 4,
      startedAt: "2026-08-27T00:00:00Z",
      workerSha256,
    },
    input: {
      admissionRecord: null,
      admissionStatus: "not-admitted",
      annualLossRasters: Array.from({ length: 38 }, (_unused, index) => descriptor("annual-loss", index)),
      boundaries: { byteLength: 4096, path: "/fixture/boundaries.geojson", sha256: "c".repeat(64), sourceFeatureCount: 4, targetFeatureCount: 4 },
      boundaryClassification: "authoritative-boundary",
      boundaryEdition: "fixture-boundary-2021",
      boundaryGeometryReadPolicy: "driver-default",
      boundaryIdField: "PRUID",
      boundarySourceCrs: canonicalCrs,
      boundaryWorkingCrs: canonicalCrs,
      changeRasterVersion: "fixture-loss-v1",
      forestMaskVersion: "fixture-forest-v1",
      forestMasks: Array.from({ length: 38 }, (_unused, index) => descriptor("forest-mask", index)),
      grid: { ...CANONICAL_GRID, geotransform: [...CANONICAL_GRID.geotransform], crs: canonicalCrs },
      manifestPath: "/fixture/manifest.json",
      manifestSha256: "d".repeat(64),
      reprojection: "identical-crs",
      reprojectionEvidence: null,
      sourceVersion: "fixture-source-v1",
      targetProvinces: TARGETS.map((target) => ({ ...target })),
      timeVersion: "1984-2022",
    },
    nationalPerCellGeometryMaterialized: false,
    output: { byteLength: 0, path: outputPath, sha256: "0".repeat(64) },
    productionClaim: false,
    productionEligible: false,
    released: false,
    rows,
    schemaVersion: "phase2-annual-province-zonal-aggregation-v1",
    status: "local-nonproduction-executed",
    temporalSemantics: {
      annualPairCount: 38,
      annualRows: "Each loss row is one adjacent pair from Y to Y+1; denominator is the Y forest mask.",
      baselineComputed: true,
      baselineContractBasis: "phase2-method-parameters aggregation.denominatorReference=first-year-of-range",
      baselineRow: "The 1984 row is a forest-mask snapshot denominator only. It has no loss period, loss numerator, outside-denominator loss, or rate.",
      baselineUncomputedReason: null,
      firstYear: 1984,
      lastYear: 2022,
    },
  };
}

function writeFixture(directory, mutate = () => {}) {
  const outputPath = path.join(directory, "annual-output.json");
  const sidecarPath = path.join(directory, "annual-output.sidecar.json");
  const outputRows = rowsFixture();
  const sidecar = sidecarFixture(outputPath, structuredClone(outputRows));
  mutate({ outputRows, sidecar, outputPath, sidecarPath });
  const outputBytes = Buffer.from(JSON.stringify(outputRows), "utf8");
  sidecar.output.byteLength = outputBytes.length;
  sidecar.output.sha256 = sha256Bytes(outputBytes);
  writeFileSync(outputPath, outputBytes, { flag: "wx" });
  writeFileSync(sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`, { flag: "wx" });
  return { outputPath, sidecarPath };
}

function rewriteFixture(outputPath, sidecarPath, outputRows, sidecar) {
  const outputBytes = Buffer.from(JSON.stringify(outputRows), "utf8");
  sidecar.rows = structuredClone(outputRows);
  sidecar.output.byteLength = outputBytes.length;
  sidecar.output.sha256 = sha256Bytes(outputBytes);
  writeFileSync(outputPath, outputBytes);
  writeFileSync(sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`);
}

function temporaryFixture(mutate) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "witness-tree-annual-output-checker-"));
  const files = writeFixture(directory, mutate);
  return { directory, ...files };
}

test("accepts a canonical-grid fixture and reports typed nonproduction row counts", () => {
  const fixture = temporaryFixture();
  try {
    const result = verify(fixture);
    assert.deepEqual(result.rows, { total: 156, baselineSnapshots: 4, adjacentAnnualPairs: 152 });
    assert.deepEqual(result.claims, { admitted: false, released: false, productionEligible: false });
    assert.match(result.notice, /nonproduction/i);
    const cli = execFileSync("node", [checker, "--output", fixture.outputPath, "--sidecar", fixture.sidecarPath], { encoding: "utf8" });
    assert.match(cli, /156 structural rows/);
    assert.match(cli, /4 baseline snapshots/);
    assert.doesNotMatch(cli, /fractional-area|156 annual loss observations/i);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("rejects output byte or sidecar hash drift", () => {
  const fixture = temporaryFixture();
  try {
    writeFileSync(fixture.outputPath, `${readFileSync(fixture.outputPath, "utf8")}\n`);
    assert.throws(() => verify(fixture), /SHA-256|byte length/i);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test("rejects a missing adjacent interval and a non-null Unknown total", () => {
  const fixture = temporaryFixture(({ outputRows }) => {
    outputRows.splice(1, 1);
  });
  try {
    assert.throws(() => verify(fixture), /156 structural rows/);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }

  const unknownFixture = temporaryFixture();
  try {
    const outputRows = JSON.parse(readFileSync(unknownFixture.outputPath, "utf8"));
    const sidecar = JSON.parse(readFileSync(unknownFixture.sidecarPath, "utf8"));
    const unknown = outputRows.find((candidate) => candidate.province === "ON" && candidate.rowType === "annual" && candidate.fromYear === 1984);
    unknown.lossHectares = 0;
    rewriteFixture(unknownFixture.outputPath, unknownFixture.sidecarPath, outputRows, sidecar);
    assert.throws(() => verify(unknownFixture), /null totals and rate|sidecar rows/i);
  } finally {
    rmSync(unknownFixture.directory, { recursive: true, force: true });
  }
});

test("rejects grid, worker, claims, and input-descriptor drift", () => {
  const cases = [
    {
      name: "dimensions",
      mutate: ({ sidecar }) => { sidecar.input.grid.width = 193935; },
      error: /canonical VLCE2 grid/,
    },
    {
      name: "geotransform",
      mutate: ({ sidecar }) => { sidecar.input.grid.geotransform[1] = 29.999; },
      error: /canonical 30 m transform/,
    },
    {
      name: "CRS",
      mutate: ({ sidecar }) => { sidecar.input.grid.crs = "PROJCRS[\"foreign\"]"; },
      error: /canonical VLCE2 CRS/,
    },
    {
      name: "worker hash",
      mutate: ({ sidecar }) => { sidecar.execution.workerSha256 = "0".repeat(64); },
      error: /worker hash/,
    },
    {
      name: "duplicate input path",
      mutate: ({ sidecar }) => { sidecar.input.annualLossRasters[1].path = sidecar.input.annualLossRasters[0].path; },
      error: /paths must be unique/,
    },
    {
      name: "production claim",
      mutate: ({ sidecar }) => { sidecar.productionEligible = true; },
      error: /productionEligible must be false/,
    },
  ];
  for (const candidate of cases) {
    const fixture = temporaryFixture(candidate.mutate);
    try {
      assert.throws(() => verify(fixture), candidate.error, candidate.name);
    } finally {
      rmSync(fixture.directory, { recursive: true, force: true });
    }
  }
});

test("document validator binds sidecar rows to output rows before returning", () => {
  const rows = rowsFixture();
  const sidecar = sidecarFixture("/fixture/output.json", structuredClone(rows));
  const bytes = Buffer.from(JSON.stringify(rows), "utf8");
  sidecar.output.byteLength = bytes.length;
  sidecar.output.sha256 = sha256Bytes(bytes);
  assert.doesNotThrow(() => validateAnnualZonalDocuments(rows, sidecar, {
    outputByteLength: bytes.length,
    outputPath: "/fixture/output.json",
    outputSha256: sidecar.output.sha256,
  }));
  sidecar.rows[0].knownForestedHectares = 0;
  assert.throws(() => validateAnnualZonalDocuments(rows, sidecar, {
    outputByteLength: bytes.length,
    outputPath: "/fixture/output.json",
    outputSha256: sidecar.output.sha256,
  }), /sidecar rows|knownForested/);
});

test("rejects complete-row arithmetic drift", () => {
  const lossFixture = temporaryFixture();
  try {
    const outputRows = JSON.parse(readFileSync(lossFixture.outputPath, "utf8"));
    const sidecar = JSON.parse(readFileSync(lossFixture.sidecarPath, "utf8"));
    const complete = outputRows.find((row) => row.province === "BC" && row.rowType === "annual");
    complete.lossHectares = 0.01;
    rewriteFixture(lossFixture.outputPath, lossFixture.sidecarPath, outputRows, sidecar);
    assert.throws(() => verify(lossFixture), /complete loss must equal known observed loss/);
  } finally {
    rmSync(lossFixture.directory, { recursive: true, force: true });
  }

  const rateFixture = temporaryFixture();
  try {
    const outputRows = JSON.parse(readFileSync(rateFixture.outputPath, "utf8"));
    const sidecar = JSON.parse(readFileSync(rateFixture.sidecarPath, "utf8"));
    const complete = outputRows.find((row) => row.province === "BC" && row.rowType === "annual");
    complete.knownObservedLossHectares = 0.01;
    complete.lossHectares = 0.01;
    complete.observedLossPercent = 0;
    rewriteFixture(rateFixture.outputPath, rateFixture.sidecarPath, outputRows, sidecar);
    assert.throws(() => verify(rateFixture), /rate is not derived/);
  } finally {
    rmSync(rateFixture.directory, { recursive: true, force: true });
  }
});
