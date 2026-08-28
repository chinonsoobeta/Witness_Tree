#!/usr/bin/env node

/*
 * Read-only checker for the JSON output and sidecar emitted by
 * phase2_annual_zonal_aggregate.py.
 *
 * This checker does not open any raster or boundary input. It only reads the
 * two paths supplied by the caller and the worker source used for the hash
 * binding. Passing this check is structural verification of a local,
 * nonproduction artifact. It is not an admission, release, or area-method
 * compliance decision.
 */

import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const WORKER_PATH = path.join(REPO_ROOT, "scripts", "phase2_annual_zonal_aggregate.py");

export const TARGETS = Object.freeze([
  Object.freeze({ province: "BC", boundaryId: "59" }),
  Object.freeze({ province: "AB", boundaryId: "48" }),
  Object.freeze({ province: "ON", boundaryId: "35" }),
  Object.freeze({ province: "QC", boundaryId: "24" }),
]);

export const FIRST_YEAR = 1984;
export const LAST_YEAR = 2022;
export const PAIR_COUNT = LAST_YEAR - FIRST_YEAR;
export const ROW_COUNT = TARGETS.length * (PAIR_COUNT + 1);

export const CANONICAL_GRID = Object.freeze({
  width: 193936,
  height: 128340,
  geotransform: Object.freeze([-2660910.524, 30, 0, 2998848.1105, 0, -30]),
  dataType: "Byte",
  nodata: 255,
  cellHectares: 0.09,
  // SHA-256 of the exact canonical VLCE2 CRS WKT recorded in data/raster-grid.json.
  crsSha256: "551d75abf82e92e1e1ce144f31f5934ad0bc2b8a2fa279316ac72a812e03656f",
});

// GDAL exposes the same CRS from the source GeoTIFFs as legacy WKT1. Keep
// this exact, audited serialization as an allowed alias; do not accept an
// arbitrary WKT merely because selected parameter strings happen to match.
export const GDAL_WKT1_CRS_SHA256 = "b3aa946d6e8a9a93d8787595250d041ae984a4fc1e3c63402c932ee08e93462d";

export const SIDEcar_SCHEMA = "phase2-annual-province-zonal-aggregation-v1";
export const SIDEcar_STATUS = "local-nonproduction-executed";
export const SIDEcar_ALGORITHM = "windowed-bounded-batch-feature-mask-rasterization";

const SHA256 = /^[a-f0-9]{64}$/;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const ROW_KEYS = [
  "baselineYear",
  "boundaryId",
  "coverageGrade",
  "fromYear",
  "knownForestedHectares",
  "knownObservedLossHectares",
  "lossHectares",
  "observedLossOutsideFirstYearForestHectares",
  "observedLossPercent",
  "province",
  "rowType",
  "temporalSemantics",
  "toYear",
  "unknownRequiredInputHectares",
];

const fail = (message) => {
  throw new Error(message);
};

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function requireObject(value, label) {
  if (!isObject(value)) fail(`${label} must be an object`);
  return value;
}

function requireArray(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  return value;
}

function requireText(value, label) {
  if (typeof value !== "string" || value.trim() === "") fail(`${label} must be a non-empty string`);
  return value;
}

function requireBoolean(value, label, expected = false) {
  if (value !== expected) fail(`${label} must be ${String(expected)}`);
}

function requireInteger(value, label, { minimum = Number.MIN_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < minimum) fail(`${label} must be a safe integer >= ${minimum}`);
  return value;
}

function requireFiniteNumber(value, label, { minimum = 0, nullable = false } = {}) {
  if (nullable && value === null) return value;
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    fail(`${label} must be a finite number >= ${minimum}${nullable ? " or null" : ""}`);
  }
  // The worker rounds reported areas and percentages to six decimal places.
  if (Math.round(value * 1_000_000) / 1_000_000 !== value) fail(`${label} must have at most six decimal places`);
  return value;
}

function requireHash(value, label) {
  if (typeof value !== "string" || !SHA256.test(value)) fail(`${label} must be a lowercase SHA-256 digest`);
  return value;
}

function exactKeys(value, expected, label) {
  requireObject(value, label);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(`${label} keys drifted: expected ${wanted.join(", ")}; got ${actual.join(", ")}`);
  }
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (isObject(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(stable(value));
}

export function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function sha256Text(value) {
  return sha256Bytes(Buffer.from(value, "utf8"));
}

export function sha256File(filePath) {
  return sha256Bytes(readFileSync(filePath));
}

function assertRegular(filePath, label) {
  if (!existsSync(filePath)) fail(`missing ${label}: ${filePath}`);
  const stat = lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} must be a regular non-symlink file: ${filePath}`);
}

function expectedAnnualSemantics(fromYear, toYear) {
  return `${fromYear}-${toYear} adjacent annual pair; denominator is the ${fromYear} first-year forest-mask snapshot`;
}

function validateAreaField(row, key, { nullable = false } = {}) {
  return requireFiniteNumber(row[key], `row ${row.boundaryId} ${row.rowType} ${key}`, { nullable });
}

function validateOneRow(row, target, seen) {
  requireObject(row, "output row");
  exactKeys(row, ROW_KEYS, `row ${target.boundaryId}`);
  if (row.boundaryId !== target.boundaryId || row.province !== target.province) {
    fail(`row boundary identity drifted for ${target.province}/${target.boundaryId}`);
  }

  validateAreaField(row, "knownForestedHectares");
  validateAreaField(row, "unknownRequiredInputHectares");

  if (row.rowType === "baseline") {
    if (row.baselineYear !== FIRST_YEAR || row.fromYear !== null || row.toYear !== null) {
      fail(`baseline row ${target.boundaryId} must be the 1984 snapshot with no interval years`);
    }
    if (row.temporalSemantics !== "1984 forest-mask snapshot only; no annual loss period or loss value is assigned") {
      fail(`baseline row ${target.boundaryId} has invalid temporal semantics`);
    }
    if (row.lossHectares !== null || row.knownObservedLossHectares !== null ||
        row.observedLossOutsideFirstYearForestHectares !== null || row.observedLossPercent !== null) {
      fail(`baseline row ${target.boundaryId} must retain null loss and rate fields`);
    }
    if (row.coverageGrade !== (row.unknownRequiredInputHectares === 0 ? "complete" : "partial-with-unknown")) {
      fail(`baseline row ${target.boundaryId} coverage grade does not preserve Unknown semantics`);
    }
    const key = `${target.boundaryId}|baseline`;
    if (seen.has(key)) fail(`duplicate baseline row for ${target.boundaryId}`);
    seen.add(key);
    return;
  }

  if (row.rowType !== "annual") fail(`row ${target.boundaryId} has unsupported rowType ${String(row.rowType)}`);
  if (row.baselineYear !== null || !Number.isInteger(row.fromYear) || !Number.isInteger(row.toYear) ||
      row.toYear !== row.fromYear + 1 || row.fromYear < FIRST_YEAR || row.toYear > LAST_YEAR) {
    fail(`annual row ${target.boundaryId} has a non-adjacent interval`);
  }
  if (row.temporalSemantics !== expectedAnnualSemantics(row.fromYear, row.toYear)) {
    fail(`annual row ${target.boundaryId} ${row.fromYear}-${row.toYear} has invalid temporal semantics`);
  }
  validateAreaField(row, "knownObservedLossHectares");
  validateAreaField(row, "observedLossOutsideFirstYearForestHectares");
  if (row.knownObservedLossHectares > row.knownForestedHectares) {
    fail(`annual row ${target.boundaryId} observed loss exceeds its known forest denominator`);
  }
  if (row.unknownRequiredInputHectares > 0) {
    if (row.coverageGrade !== "partial-with-unknown" || row.lossHectares !== null || row.observedLossPercent !== null) {
      fail(`annual row ${target.boundaryId} must retain null totals and rate when required input is Unknown`);
    }
  } else {
    if (row.coverageGrade !== "complete" || row.lossHectares === null || row.observedLossPercent === undefined) {
      fail(`annual row ${target.boundaryId} must be complete when no required input is Unknown`);
    }
    validateAreaField(row, "lossHectares");
    if (row.lossHectares !== row.knownObservedLossHectares) {
      fail(`annual row ${target.boundaryId} complete loss must equal known observed loss`);
    }
    if (row.knownForestedHectares === 0) {
      if (row.observedLossPercent !== null) fail(`annual row ${target.boundaryId} with zero denominator must have a null rate`);
    } else {
      validateAreaField(row, "observedLossPercent");
      if (row.observedLossPercent > 100) fail(`annual row ${target.boundaryId} rate cannot exceed 100 percent`);
      const expectedPercent = Math.round((row.lossHectares / row.knownForestedHectares * 100) * 1_000_000) / 1_000_000;
      if (row.observedLossPercent !== expectedPercent) fail(`annual row ${target.boundaryId} rate is not derived from loss and denominator`);
    }
  }
  const key = `${target.boundaryId}|annual|${row.fromYear}|${row.toYear}`;
  if (seen.has(key)) fail(`duplicate annual row for ${target.boundaryId} ${row.fromYear}-${row.toYear}`);
  seen.add(key);
}

export function validateRows(rows, label = "output") {
  requireArray(rows, label);
  if (rows.length !== ROW_COUNT) fail(`${label} must contain exactly ${ROW_COUNT} structural rows`);
  const seen = new Set();
  for (const target of TARGETS) {
    const targetRows = rows.filter((row) => isObject(row) && row.boundaryId === target.boundaryId);
    if (targetRows.length !== PAIR_COUNT + 1) fail(`${label} must contain 39 rows for ${target.province}/${target.boundaryId}`);
    for (const row of targetRows) validateOneRow(row, target, seen);
  }
  const expected = new Set();
  for (const target of TARGETS) {
    expected.add(`${target.boundaryId}|baseline`);
    for (let fromYear = FIRST_YEAR; fromYear < LAST_YEAR; fromYear += 1) {
      expected.add(`${target.boundaryId}|annual|${fromYear}|${fromYear + 1}`);
    }
  }
  if (seen.size !== expected.size || [...expected].some((key) => !seen.has(key))) {
    fail(`${label} does not contain exactly four 1984 snapshots and all 38 adjacent annual pairs per target`);
  }
  return { total: rows.length, baselineSnapshots: TARGETS.length, adjacentAnnualPairs: TARGETS.length * PAIR_COUNT };
}

function validateInputDescriptor(descriptor, label, expectedKind, expectedYears) {
  requireObject(descriptor, label);
  const expectedKeys = expectedKind === "forest-mask"
    ? ["byteLength", "kind", "path", "sha256", "year"]
    : ["byteLength", "fromYear", "kind", "path", "sha256", "toYear"];
  exactKeys(descriptor, expectedKeys, label);
  if (descriptor.kind !== expectedKind) fail(`${label} kind drifted`);
  requireText(descriptor.path, `${label} path`);
  requireInteger(descriptor.byteLength, `${label} byteLength`, { minimum: 1 });
  requireHash(descriptor.sha256, `${label} sha256`);
  if (expectedKind === "forest-mask") {
    if (descriptor.year !== expectedYears) fail(`${label} year drifted`);
  } else if (descriptor.fromYear !== expectedYears || descriptor.toYear !== expectedYears + 1) {
    fail(`${label} adjacent years drifted`);
  }
}

function validateInput(sidecar) {
  const input = requireObject(sidecar.input, "sidecar input");
  const required = [
    "admissionRecord", "admissionStatus", "annualLossRasters", "boundaries", "boundaryClassification",
    "boundaryEdition", "boundaryGeometryReadPolicy", "boundaryIdField", "boundarySourceCrs",
    "boundaryWorkingCrs", "changeRasterVersion", "forestMaskVersion", "forestMasks", "grid",
    "reprojection", "reprojectionEvidence", "sourceVersion", "targetProvinces", "timeVersion",
  ];
  const optionalManifest = ["manifestPath", "manifestSha256"];
  const actualKeys = Object.keys(input);
  for (const key of required) if (!actualKeys.includes(key)) fail(`sidecar input is missing ${key}`);
  for (const key of actualKeys) if (!required.includes(key) && !optionalManifest.includes(key)) fail(`sidecar input has unsupported field ${key}`);
  if (actualKeys.includes("manifestPath") !== actualKeys.includes("manifestSha256")) fail("manifest binding must include path and SHA-256 together");
  if (actualKeys.includes("manifestPath")) {
    requireText(input.manifestPath, "manifest path");
    requireHash(input.manifestSha256, "manifest sha256");
  }
  if (input.admissionStatus !== "not-admitted" || input.admissionRecord !== null) fail("annual output input admission must remain not-admitted with no record");
  if (!["authoritative-boundary", "illustrative"].includes(input.boundaryClassification)) fail("boundary classification is unsupported");
  for (const [value, label] of [[input.boundaryEdition, "boundary edition"], [input.boundaryIdField, "boundary ID field"],
    [input.boundarySourceCrs, "boundary source CRS"], [input.changeRasterVersion, "change-raster version"],
    [input.forestMaskVersion, "forest-mask version"], [input.sourceVersion, "source version"], [input.timeVersion, "time version"]]) {
    requireText(value, label);
  }
  if (!["driver-default", "shapefile-ring-orientation-only-ccw"].includes(input.boundaryGeometryReadPolicy)) {
    fail("boundary geometry read policy is unsupported");
  }
  if (!["identical-crs", "reprojected"].includes(input.reprojection)) fail("reprojection mode is unsupported");
  if (input.reprojection === "identical-crs" && input.reprojectionEvidence !== null) fail("identical-CRS input must have null reprojection evidence");
  if (input.reprojection === "reprojected") requireText(input.reprojectionEvidence, "reprojection evidence");

  const targets = requireArray(input.targetProvinces, "target provinces");
  if (canonicalJson(targets) !== canonicalJson(TARGETS)) fail("target province bindings drifted");

  const boundaries = requireObject(input.boundaries, "boundary descriptor");
  exactKeys(boundaries, ["byteLength", "path", "sha256", "sourceFeatureCount", "targetFeatureCount"], "boundary descriptor");
  requireText(boundaries.path, "boundary descriptor path");
  requireInteger(boundaries.byteLength, "boundary descriptor byteLength", { minimum: 1 });
  requireHash(boundaries.sha256, "boundary descriptor sha256");
  requireInteger(boundaries.sourceFeatureCount, "boundary source feature count", { minimum: TARGETS.length });
  if (boundaries.targetFeatureCount !== TARGETS.length) fail("boundary target feature count must be four");

  const forestMasks = requireArray(input.forestMasks, "forest-mask descriptors");
  const annualLossRasters = requireArray(input.annualLossRasters, "annual-loss descriptors");
  if (forestMasks.length !== PAIR_COUNT) fail("sidecar must describe exactly 38 forest masks");
  if (annualLossRasters.length !== PAIR_COUNT) fail("sidecar must describe exactly 38 annual loss rasters");
  const paths = new Set();
  for (let index = 0; index < PAIR_COUNT; index += 1) {
    const year = FIRST_YEAR + index;
    validateInputDescriptor(forestMasks[index], `forest-mask descriptor ${year}`, "forest-mask", year);
    validateInputDescriptor(annualLossRasters[index], `annual-loss descriptor ${year}-${year + 1}`, "annual-loss", year);
    for (const descriptor of [forestMasks[index], annualLossRasters[index]]) {
      if (paths.has(descriptor.path)) fail(`input descriptor paths must be unique: ${descriptor.path}`);
      paths.add(descriptor.path);
    }
  }

  const grid = requireObject(input.grid, "grid descriptor");
  exactKeys(grid, ["cellHectares", "crs", "crsSha256", "dataType", "geotransform", "height", "nodata", "width"], "grid descriptor");
  if (grid.width !== CANONICAL_GRID.width || grid.height !== CANONICAL_GRID.height) fail("grid dimensions are not the exact canonical VLCE2 grid");
  if (canonicalJson(grid.geotransform) !== canonicalJson(CANONICAL_GRID.geotransform)) fail("grid geotransform is not the exact canonical 30 m transform");
  if (grid.dataType !== CANONICAL_GRID.dataType || grid.nodata !== CANONICAL_GRID.nodata) fail("grid must be a Byte raster with nodata exactly 255");
  if (grid.cellHectares !== CANONICAL_GRID.cellHectares) fail("grid cell area must be the 30 m cell area");
  requireText(grid.crs, "grid CRS");
  requireHash(grid.crsSha256, "grid CRS sha256");
  const allowedCrsHashes = new Set([CANONICAL_GRID.crsSha256, GDAL_WKT1_CRS_SHA256]);
  if (!allowedCrsHashes.has(grid.crsSha256) || sha256Text(grid.crs) !== grid.crsSha256) {
    fail("grid CRS is not the expected canonical VLCE2 CRS identity");
  }
  if (input.boundaryWorkingCrs !== grid.crs) fail("boundary working CRS is not exactly the canonical grid CRS");

  return { input, descriptorPaths: paths };
}

function validateExecution(sidecar, workerPath) {
  const execution = requireObject(sidecar.execution, "execution");
  const required = [
    "annualPairCount", "codeVersion", "completedAt", "elapsedSeconds", "environment", "featureCount",
    "maskRasterizationCount", "maximumScratchAllocatedBytes", "parameters", "peakRssBytes", "processedWindowCount",
    "startedAt", "workerSha256",
  ];
  exactKeys(execution, required, "execution");
  if (execution.annualPairCount !== PAIR_COUNT || execution.featureCount !== TARGETS.length || execution.maskRasterizationCount !== TARGETS.length) {
    fail("execution feature or annual-pair counts drifted");
  }
  requireText(execution.codeVersion, "execution code version");
  requireHash(execution.workerSha256, "execution worker sha256");
  if (execution.workerSha256 !== sha256File(workerPath)) fail("sidecar worker hash does not match phase2 annual worker bytes");
  if (!UTC_TIMESTAMP.test(execution.startedAt) || !UTC_TIMESTAMP.test(execution.completedAt)) fail("execution timestamps must be UTC");
  if (Date.parse(execution.completedAt) < Date.parse(execution.startedAt)) fail("execution cannot complete before it starts");
  if (typeof execution.elapsedSeconds !== "number" || !Number.isFinite(execution.elapsedSeconds) || execution.elapsedSeconds <= 0) fail("execution elapsedSeconds must be finite and positive");
  for (const [value, label, minimum] of [[execution.peakRssBytes, "execution peak RSS", 1], [execution.maximumScratchAllocatedBytes, "execution scratch bytes", 0], [execution.processedWindowCount, "execution processed windows", 1]]) {
    requireInteger(value, label, { minimum });
  }
  const parameters = requireObject(execution.parameters, "execution parameters");
  exactKeys(parameters, ["cellHectares", "columnWindow", "gdalCacheBytes", "nodata", "rowWindow"], "execution parameters");
  if (parameters.rowWindow !== 2048 || parameters.columnWindow !== 32768 || parameters.gdalCacheBytes !== 256 * 1024 * 1024 ||
      parameters.nodata !== CANONICAL_GRID.nodata || parameters.cellHectares !== CANONICAL_GRID.cellHectares) {
    fail("execution window or nodata parameters drifted");
  }
  const environment = requireObject(execution.environment, "execution environment");
  exactKeys(environment, ["gdalVersion", "numpyVersion", "pythonVersion"], "execution environment");
  for (const [value, label] of [[environment.gdalVersion, "GDAL version"], [environment.numpyVersion, "NumPy version"], [environment.pythonVersion, "Python version"]]) requireText(value, label);
}

function validateTemporalSemantics(sidecar) {
  const temporal = requireObject(sidecar.temporalSemantics, "temporal semantics");
  exactKeys(temporal, ["annualPairCount", "annualRows", "baselineComputed", "baselineContractBasis", "baselineRow", "baselineUncomputedReason", "firstYear", "lastYear"], "temporal semantics");
  const expected = {
    annualPairCount: PAIR_COUNT,
    firstYear: FIRST_YEAR,
    lastYear: LAST_YEAR,
    annualRows: "Each loss row is one adjacent pair from Y to Y+1; denominator is the Y forest mask.",
    baselineRow: "The 1984 row is a forest-mask snapshot denominator only. It has no loss period, loss numerator, outside-denominator loss, or rate.",
    baselineContractBasis: "phase2-method-parameters aggregation.denominatorReference=first-year-of-range",
    baselineComputed: true,
    baselineUncomputedReason: null,
  };
  if (canonicalJson(temporal) !== canonicalJson(expected)) fail("temporal semantics drifted from the typed snapshot and adjacent-pair contract");
}

export function validateAnnualZonalDocuments(outputRows, sidecar, {
  outputSha256,
  outputByteLength,
  outputPath,
  workerPath = WORKER_PATH,
} = {}) {
  requireObject(sidecar, "sidecar");
  exactKeys(sidecar, [
    "admitted", "algorithm", "claims", "execution", "input", "nationalPerCellGeometryMaterialized", "output",
    "productionClaim", "productionEligible", "released", "rows", "schemaVersion", "status", "temporalSemantics",
  ], "sidecar");
  if (sidecar.schemaVersion !== SIDEcar_SCHEMA || sidecar.status !== SIDEcar_STATUS || sidecar.algorithm !== SIDEcar_ALGORITHM) fail("sidecar schema, status, or algorithm drifted");
  requireBoolean(sidecar.nationalPerCellGeometryMaterialized, "sidecar nationalPerCellGeometryMaterialized");
  requireBoolean(sidecar.productionClaim, "sidecar productionClaim");
  requireBoolean(sidecar.admitted, "sidecar admitted");
  requireBoolean(sidecar.released, "sidecar released");
  requireBoolean(sidecar.productionEligible, "sidecar productionEligible");
  const claims = requireObject(sidecar.claims, "sidecar claims");
  exactKeys(claims, ["admitted", "externalAction", "productionEligible", "released"], "sidecar claims");
  for (const key of Object.keys(claims)) requireBoolean(claims[key], `sidecar claims.${key}`);

  const rows = validateRows(outputRows, "output");
  const sidecarRows = validateRows(sidecar.rows, "sidecar rows");
  if (canonicalJson(outputRows) !== canonicalJson(sidecar.rows)) fail("sidecar rows do not exactly match output rows");
  validateInput(sidecar);
  validateTemporalSemantics(sidecar);
  validateExecution(sidecar, workerPath);

  const output = requireObject(sidecar.output, "sidecar output");
  exactKeys(output, ["byteLength", "path", "sha256"], "sidecar output");
  requireText(output.path, "sidecar output path");
  requireInteger(output.byteLength, "sidecar output byteLength", { minimum: 1 });
  requireHash(output.sha256, "sidecar output sha256");
  if (outputSha256 !== undefined && output.sha256 !== outputSha256) fail("sidecar output SHA-256 does not match output bytes");
  if (outputByteLength !== undefined && output.byteLength !== outputByteLength) fail("sidecar output byte length does not match output bytes");
  if (outputPath !== undefined) {
    const expected = path.resolve(outputPath);
    const recorded = path.resolve(output.path);
    if (recorded !== expected && output.path !== outputPath) fail("sidecar output path does not bind the explicit output path");
  }

  // These names would turn structural evidence into a claim that this output
  // has an area method or an annual observation count. Reject them if a future
  // producer adds them instead of silently accepting a broader claim surface.
  const serialized = JSON.stringify(sidecar);
  if (/fractionalAreaCompliant|fractionalAreaCompliance|annualObservationCount/.test(serialized)) {
    fail("sidecar contains an unsupported area-method or annual-observation claim");
  }
  return {
    rows,
    sidecarRows,
    output: {
      path: output.path,
      sha256: outputSha256 ?? output.sha256,
      byteLength: outputByteLength ?? output.byteLength,
    },
    claims: { admitted: false, released: false, productionEligible: false },
    notice: "Structural read-only verification only. Snapshot and adjacent-pair semantics remain nonproduction; no area-method compliance, admission, release, or production eligibility is asserted.",
  };
}

export function verify({ outputPath, sidecarPath, workerPath = WORKER_PATH } = {}) {
  requireText(outputPath, "--output");
  requireText(sidecarPath, "--sidecar");
  const resolvedOutput = path.resolve(outputPath);
  const resolvedSidecar = path.resolve(sidecarPath);
  assertRegular(resolvedOutput, "output");
  assertRegular(resolvedSidecar, "sidecar");
  assertRegular(workerPath, "worker");
  const outputBytes = readFileSync(resolvedOutput);
  let outputRows;
  try {
    outputRows = JSON.parse(outputBytes.toString("utf8"));
  } catch (error) {
    fail(`output is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  let sidecar;
  try {
    sidecar = JSON.parse(readFileSync(resolvedSidecar, "utf8"));
  } catch (error) {
    fail(`sidecar is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const outputSha256 = sha256Bytes(outputBytes);
  const result = validateAnnualZonalDocuments(outputRows, sidecar, {
    outputSha256,
    outputByteLength: outputBytes.length,
    outputPath: resolvedOutput,
    workerPath,
  });
  return { ...result, output: { ...result.output, path: resolvedOutput }, sidecarPath: resolvedSidecar };
}

export const verifyAnnualZonalOutput = verify;

function parseArgs(argv) {
  let outputPath;
  let sidecarPath;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output") outputPath = argv[++index];
    else if (argument === "--sidecar") sidecarPath = argv[++index];
    else if (argument === "--help" || argument === "-h") return { help: true };
    else fail(`unknown argument: ${argument}`);
  }
  requireText(outputPath, "--output");
  requireText(sidecarPath, "--sidecar");
  return { outputPath, sidecarPath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log("Usage: node scripts/check-phase2-annual-zonal-output.mjs --output PATH --sidecar PATH");
    } else {
      const result = verify(args);
      console.log(`Annual zonal output check passed: ${result.rows.total} structural rows (${result.rows.baselineSnapshots} baseline snapshots and ${result.rows.adjacentAnnualPairs} adjacent annual-pair rows); nonproduction only.`);
    }
  } catch (error) {
    console.error(`Stopped: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
