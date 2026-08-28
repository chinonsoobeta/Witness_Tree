#!/usr/bin/env node

/*
 * Structural checker for the isolated annual fractional-area correction.
 *
 * The checker verifies the new output/provenance envelope and hashes.  It
 * does not open the external rasters or boundary vector, and therefore cannot
 * independently reproduce polygon/cell intersections.  The Python worker is
 * responsible for that input readback and fails closed before writing output.
 * Passing this check is still local, nonproduction evidence only.
 */

import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson, validateRows } from "./check-phase2-annual-zonal-output.mjs";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const WORKER_PATH = path.join(REPO_ROOT, "scripts", "phase2_annual_zonal_fractional_correction.py");
export const TARGETS = Object.freeze([
  Object.freeze({ province: "BC", boundaryId: "59" }),
  Object.freeze({ province: "AB", boundaryId: "48" }),
  Object.freeze({ province: "ON", boundaryId: "35" }),
  Object.freeze({ province: "QC", boundaryId: "24" }),
]);
export const FIRST_YEAR = 1984;
export const LAST_YEAR = 2022;
export const PAIR_COUNT = LAST_YEAR - FIRST_YEAR;
export const CORRECTION_SCHEMA = "phase2-annual-province-zonal-fractional-correction-v1";
export const CORRECTION_STATUS = "local-nonproduction-fractional-correction";
export const CORRECTION_ALGORITHM = "center-membership-subtraction-exact-polygon-cell-intersection-addition";
export const CHECKPOINT_SCHEMA = "phase2-annual-zonal-fractional-tile-checkpoint-v1";

const SHA256 = /^[a-f0-9]{64}$/;
const fail = (message) => { throw new Error(message); };
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

function requireHash(value, label) {
  if (typeof value !== "string" || !SHA256.test(value)) fail(`${label} must be a lowercase SHA-256 digest`);
  return value;
}

function requireBoolean(value, label) {
  if (value !== false) fail(`${label} must be false`);
}

function requireInteger(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) fail(`${label} must be a safe integer >= ${minimum}`);
  return value;
}

function requireFinite(value, label, minimum = 0) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) fail(`${label} must be a finite number >= ${minimum}`);
  if (Math.round(value * 1_000_000) / 1_000_000 !== value) fail(`${label} must have at most six decimal places`);
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

function assertRegular(filePath, label) {
  if (!existsSync(filePath)) fail(`missing ${label}: ${filePath}`);
  const stat = lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} must be a regular non-symlink file: ${filePath}`);
}

export function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function sha256File(filePath) {
  return sha256Bytes(readFileSync(filePath));
}

function bindingPath(value) {
  requireText(value, "bound path");
  const resolved = path.resolve(value);
  return existsSync(resolved) ? realpathSync(resolved) : resolved;
}

function validateFileDescriptor(value, label, expectedKind, expectedYears) {
  exactKeys(value, expectedKind === "forest-mask"
    ? ["byteLength", "kind", "path", "sha256", "year"]
    : ["byteLength", "fromYear", "kind", "path", "sha256", "toYear"], label);
  if (value.kind !== expectedKind) fail(`${label} kind drifted`);
  requireText(value.path, `${label} path`);
  requireInteger(value.byteLength, `${label} byteLength`, 1);
  requireHash(value.sha256, `${label} sha256`);
  if (expectedKind === "forest-mask" && value.year !== expectedYears) fail(`${label} year drifted`);
  if (expectedKind === "annual-loss" && (value.fromYear !== expectedYears || value.toYear !== expectedYears + 1)) fail(`${label} adjacent years drifted`);
}

function validateInput(input) {
  requireObject(input, "exact input bindings");
  const required = [
    "admissionRecord", "admissionStatus", "annualLossRasters", "boundaries", "boundaryClassification",
    "boundaryEdition", "boundaryGeometryReadPolicy", "boundaryIdField", "boundarySourceCrs",
    "boundaryWorkingCrs", "changeRasterVersion", "forestMaskVersion", "forestMasks", "grid",
    "reprojection", "reprojectionEvidence", "sourceVersion", "targetProvinces", "timeVersion",
  ];
  const optional = ["manifestPath", "manifestSha256"];
  for (const key of required) if (!Object.hasOwn(input, key)) fail(`exact input bindings missing ${key}`);
  for (const key of Object.keys(input)) if (!required.includes(key) && !optional.includes(key)) fail(`exact input bindings contain unsupported ${key}`);
  if (Object.hasOwn(input, "manifestPath") !== Object.hasOwn(input, "manifestSha256")) fail("manifest binding must include path and SHA-256 together");
  if (Object.hasOwn(input, "manifestPath")) {
    requireText(input.manifestPath, "manifest path");
    requireHash(input.manifestSha256, "manifest SHA-256");
  }
  if (input.admissionStatus !== "not-admitted" || input.admissionRecord !== null) fail("exact inputs must remain not-admitted with no record");
  for (const [value, label] of [[input.boundaryClassification, "boundary classification"], [input.boundaryEdition, "boundary edition"], [input.boundaryIdField, "boundary ID field"], [input.boundarySourceCrs, "boundary source CRS"], [input.boundaryWorkingCrs, "boundary working CRS"], [input.changeRasterVersion, "change-raster version"], [input.forestMaskVersion, "forest-mask version"], [input.sourceVersion, "source version"], [input.timeVersion, "time version"]]) requireText(value, label);
  if (!Array.isArray(input.targetProvinces) || canonicalJson(input.targetProvinces) !== canonicalJson(TARGETS)) fail("target province bindings drifted");
  const boundaries = requireObject(input.boundaries, "boundary descriptor");
  exactKeys(boundaries, ["byteLength", "path", "sha256", "sourceFeatureCount", "targetFeatureCount"], "boundary descriptor");
  requireText(boundaries.path, "boundary path");
  requireInteger(boundaries.byteLength, "boundary byteLength", 1);
  requireHash(boundaries.sha256, "boundary SHA-256");
  requireInteger(boundaries.sourceFeatureCount, "boundary source feature count", TARGETS.length);
  if (boundaries.targetFeatureCount !== TARGETS.length) fail("boundary target feature count must be four");
  const forestMasks = requireArray(input.forestMasks, "forest-mask descriptors");
  const losses = requireArray(input.annualLossRasters, "annual-loss descriptors");
  if (forestMasks.length !== PAIR_COUNT || losses.length !== PAIR_COUNT) fail("exact inputs must bind all 38 forest masks and annual-loss rasters");
  const paths = new Set();
  for (let index = 0; index < PAIR_COUNT; index += 1) {
    const year = FIRST_YEAR + index;
    validateFileDescriptor(forestMasks[index], `forest-mask descriptor ${year}`, "forest-mask", year);
    validateFileDescriptor(losses[index], `annual-loss descriptor ${year}-${year + 1}`, "annual-loss", year);
    for (const descriptor of [forestMasks[index], losses[index]]) {
      const bound = bindingPath(descriptor.path);
      if (paths.has(bound)) fail(`input descriptor paths must be unique: ${descriptor.path}`);
      paths.add(bound);
    }
  }
  const grid = requireObject(input.grid, "grid descriptor");
  exactKeys(grid, ["cellHectares", "crs", "crsSha256", "dataType", "geotransform", "height", "nodata", "width"], "grid descriptor");
  requireInteger(grid.width, "grid width", 1);
  requireInteger(grid.height, "grid height", 1);
  requireText(grid.crs, "grid CRS");
  requireHash(grid.crsSha256, "grid CRS SHA-256");
  if (sha256Bytes(Buffer.from(grid.crs, "utf8")) !== grid.crsSha256) fail("grid CRS hash does not bind grid CRS text");
  if (!Array.isArray(grid.geotransform) || grid.geotransform.length !== 6 || grid.geotransform.some((value) => typeof value !== "number" || !Number.isFinite(value))) fail("grid geotransform is invalid");
  if (grid.dataType !== "Byte" || grid.nodata !== 255) fail("grid must be a Byte raster with nodata 255");
  requireFinite(grid.cellHectares, "grid cellHectares");
  if (input.boundaryWorkingCrs !== grid.crs) fail("boundary working CRS is not exactly the grid CRS");
}

function validateBindingDescriptor(value, label) {
  exactKeys(value, ["byteLength", "path", "sha256"], label);
  requireText(value.path, `${label} path`);
  requireInteger(value.byteLength, `${label} byteLength`, 1);
  requireHash(value.sha256, `${label} SHA-256`);
}

function validateBinaryBaseline(value) {
  exactKeys(value, ["algorithm", "membership", "output", "schemaVersion", "sidecar", "worker"], "binaryBaseline");
  if (value.schemaVersion !== "phase2-annual-province-zonal-aggregation-v1") fail("binary baseline schema drifted");
  if (value.algorithm !== "windowed-bounded-batch-feature-mask-rasterization") fail("binary baseline algorithm drifted");
  if (value.membership !== "historical GDAL rasterized polygon center membership") fail("binary baseline membership description drifted");
  validateBindingDescriptor(value.output, "binary baseline output");
  validateBindingDescriptor(value.sidecar, "binary baseline sidecar");
  const worker = requireObject(value.worker, "binary baseline worker");
  exactKeys(worker, ["path", "sha256"], "binary baseline worker");
  requireText(worker.path, "binary baseline worker path");
  requireHash(worker.sha256, "binary baseline worker SHA-256");
}

function validateGeometryBindings(value) {
  exactKeys(value, ["sourceFeatureCount", "targetFeatureCount", "targets"], "geometryBindings");
  requireInteger(value.sourceFeatureCount, "geometry source feature count", TARGETS.length);
  if (value.targetFeatureCount !== TARGETS.length) fail("geometry target feature count must be four");
  const targets = requireArray(value.targets, "geometry target bindings");
  if (targets.length !== TARGETS.length) fail("geometry target bindings must contain four targets");
  targets.forEach((target, index) => {
    exactKeys(target, ["boundaryId", "candidateCellCount", "changedCellCount", "fractionalCellCount", "fullIntersectionCellCount", "province", "sourceWkbSha256", "workingWkbSha256", "zeroIntersectionCellCount"], `geometry target ${index}`);
    if (target.province !== TARGETS[index].province || target.boundaryId !== TARGETS[index].boundaryId) fail("geometry target order or identity drifted");
    for (const key of ["candidateCellCount", "changedCellCount", "fractionalCellCount", "fullIntersectionCellCount", "zeroIntersectionCellCount"]) requireInteger(target[key], `geometry target ${target.boundaryId} ${key}`);
    if (target.changedCellCount > target.candidateCellCount || target.fractionalCellCount + target.fullIntersectionCellCount + target.zeroIntersectionCellCount !== target.candidateCellCount) fail(`geometry target ${target.boundaryId} candidate counts do not reconcile`);
    requireHash(target.sourceWkbSha256, `geometry target ${target.boundaryId} source WKB SHA-256`);
    requireHash(target.workingWkbSha256, `geometry target ${target.boundaryId} working WKB SHA-256`);
  });
}

function validateCorrection(value, geometryBindings) {
  exactKeys(value, ["addition", "algorithm", "candidateCellCount", "candidateSelection", "changedCellCount", "fractionEpsilon", "fractionalCellCount", "fullIntersectionCellCount", "perTarget", "subtraction", "zeroIntersectionCellCount"], "correction");
  if (value.algorithm !== CORRECTION_ALGORITHM) fail("correction algorithm drifted");
  if (value.subtraction !== "binary-mask center membership contribution for each candidate cell" || value.addition !== "exact OGR polygon-cell intersection fraction for that same candidate cell") fail("correction subtraction/addition description drifted");
  if (value.candidateSelection !== "ALL_TOUCHED rasterization of each target geometry boundary; interior cells are not intersected") fail("correction candidate selection drifted");
  if (value.fractionEpsilon !== 1e-9) fail("correction fraction epsilon drifted");
  for (const key of ["candidateCellCount", "fractionalCellCount", "fullIntersectionCellCount", "zeroIntersectionCellCount", "changedCellCount"]) requireInteger(value[key], `correction ${key}`);
  if (value.fractionalCellCount + value.fullIntersectionCellCount + value.zeroIntersectionCellCount !== value.candidateCellCount) fail("correction candidate counts do not reconcile");
  if (value.changedCellCount > value.candidateCellCount) fail("correction changed cell count exceeds candidate count");
  if (canonicalJson(value.perTarget) !== canonicalJson(geometryBindings.targets)) fail("correction per-target counts do not bind geometry target bindings");
}

function validateCheckpoint(value) {
  exactKeys(value, ["directory", "resumedWindowCount", "runBindingSha256", "schemaVersion", "targets"], "execution checkpoint");
  if (value.schemaVersion !== CHECKPOINT_SCHEMA) fail("execution checkpoint schema drifted");
  requireText(value.directory, "execution checkpoint directory");
  requireHash(value.runBindingSha256, "execution checkpoint run binding SHA-256");
  requireInteger(value.resumedWindowCount, "execution checkpoint resumed window count");
  const targets = requireArray(value.targets, "execution checkpoint targets");
  if (targets.length !== TARGETS.length) fail("execution checkpoint must bind four target files");
  targets.forEach((target, index) => {
    exactKeys(target, ["boundaryId", "byteLength", "candidateWindowCount", "path", "province", "sha256"], `execution checkpoint target ${index}`);
    if (target.province !== TARGETS[index].province || target.boundaryId !== TARGETS[index].boundaryId) fail("execution checkpoint target order or identity drifted");
    requireText(target.path, `execution checkpoint target ${target.boundaryId} path`);
    requireInteger(target.byteLength, `execution checkpoint target ${target.boundaryId} byte length`, 1);
    requireInteger(target.candidateWindowCount, `execution checkpoint target ${target.boundaryId} candidate window count`);
    requireHash(target.sha256, `execution checkpoint target ${target.boundaryId} SHA-256`);
    if (path.dirname(bindingPath(target.path)) !== bindingPath(value.directory)) fail(`execution checkpoint target ${target.boundaryId} is outside the bound directory`);
  });
  return targets;
}

function validateExecution(value) {
  exactKeys(value, ["candidateCellCount", "checkpoint", "codeVersion", "completedAt", "elapsedSeconds", "environment", "featureCount", "maximumScratchAllocatedBytes", "parameters", "peakRssBytes", "processedWindowCount", "startedAt", "workerSha256"], "execution");
  requireText(value.codeVersion, "execution code version");
  requireHash(value.workerSha256, "execution worker SHA-256");
  for (const key of ["candidateCellCount", "featureCount", "maximumScratchAllocatedBytes", "peakRssBytes", "processedWindowCount"]) requireInteger(value[key], `execution ${key}`);
  if (value.featureCount !== TARGETS.length || value.candidateCellCount < 0) fail("execution counts drifted");
  if (typeof value.elapsedSeconds !== "number" || !Number.isFinite(value.elapsedSeconds) || value.elapsedSeconds <= 0) fail("execution elapsedSeconds must be positive");
  validateCheckpoint(value.checkpoint);
  const parameters = requireObject(value.parameters, "execution parameters");
  exactKeys(parameters, ["cellHectares", "checkpointInterval", "columnWindow", "fractionEpsilon", "gdalCacheBytes", "nodata", "reductionOrder", "rowWindow", "tileSize", "workerGdalCacheBytes", "workers"], "execution parameters");
  if (!Number.isSafeInteger(parameters.tileSize) || parameters.tileSize < 1024 || parameters.tileSize > 2048) fail("execution tile size must be between 1024 and 2048 cells");
  if (parameters.rowWindow !== parameters.tileSize || parameters.columnWindow !== parameters.tileSize) fail("execution windows must be square and equal the tile size");
  requireInteger(parameters.workers, "execution workers", 1);
  requireInteger(parameters.checkpointInterval, "execution checkpoint interval", 1);
  if (parameters.gdalCacheBytes !== 256 * 1024 * 1024 || parameters.workerGdalCacheBytes !== 64 * 1024 * 1024 || parameters.nodata !== 255 || parameters.fractionEpsilon !== 1e-9) fail("execution parameters drifted");
  if (parameters.reductionOrder !== "target-order-then-global-row-column-with-math-fsum") fail("execution reduction order drifted");
  requireFinite(parameters.cellHectares, "execution cellHectares");
  const environment = requireObject(value.environment, "execution environment");
  exactKeys(environment, ["gdalVersion", "numpyVersion", "pythonVersion"], "execution environment");
  for (const key of Object.keys(environment)) requireText(environment[key], `execution ${key}`);
  const utc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
  if (!utc.test(value.startedAt) || !utc.test(value.completedAt) || Date.parse(value.completedAt) < Date.parse(value.startedAt)) fail("execution timestamps must be UTC and ordered");
}

export function validateFractionalCorrectionDocuments(outputRows, sidecar, { outputSha256, outputByteLength, outputPath } = {}) {
  requireObject(sidecar, "fractional correction sidecar");
  exactKeys(sidecar, ["admitted", "algorithm", "binaryBaseline", "claims", "correction", "execution", "geometryBindings", "input", "limitations", "nationalPerCellGeometryMaterialized", "output", "productionClaim", "productionEligible", "released", "rows", "schemaVersion", "status"], "fractional correction sidecar");
  if (sidecar.schemaVersion !== CORRECTION_SCHEMA || sidecar.status !== CORRECTION_STATUS || sidecar.algorithm !== CORRECTION_ALGORITHM) fail("fractional correction schema, status, or algorithm drifted");
  for (const key of ["admitted", "released", "productionEligible", "productionClaim", "nationalPerCellGeometryMaterialized"]) requireBoolean(sidecar[key], `sidecar ${key}`);
  const claims = requireObject(sidecar.claims, "sidecar claims");
  exactKeys(claims, ["admitted", "externalAction", "productionEligible", "released"], "sidecar claims");
  for (const key of Object.keys(claims)) requireBoolean(claims[key], `sidecar claims.${key}`);
  const rows = validateRows(outputRows, "fractional correction output");
  const sidecarRows = validateRows(sidecar.rows, "fractional correction sidecar rows");
  if (canonicalJson(outputRows) !== canonicalJson(sidecar.rows)) fail("fractional correction sidecar rows do not match output rows");
  validateBinaryBaseline(sidecar.binaryBaseline);
  validateInput(sidecar.input);
  validateGeometryBindings(sidecar.geometryBindings);
  validateCorrection(sidecar.correction, sidecar.geometryBindings);
  validateExecution(sidecar.execution);
  const limitations = requireArray(sidecar.limitations, "limitations");
  if (limitations.length < 4 || limitations.some((value) => typeof value !== "string" || value.trim() === "")) fail("fractional correction limitations are incomplete");
  if (!limitations.some((value) => /nonproduction/i.test(value)) || !limitations.some((value) => /interior cells/i.test(value))) fail("limitations must disclose nonproduction and interior-cell bounds");
  const output = requireObject(sidecar.output, "sidecar output");
  exactKeys(output, ["byteLength", "path", "sha256"], "sidecar output");
  requireText(output.path, "sidecar output path");
  requireInteger(output.byteLength, "sidecar output byteLength", 1);
  requireHash(output.sha256, "sidecar output SHA-256");
  if (outputSha256 !== undefined && output.sha256 !== outputSha256) fail("sidecar output SHA-256 does not match output bytes");
  if (outputByteLength !== undefined && output.byteLength !== outputByteLength) fail("sidecar output byte length does not match output bytes");
  if (outputPath !== undefined && bindingPath(output.path) !== bindingPath(outputPath)) fail("sidecar output path does not bind explicit output path");
  if (sidecar.execution.candidateCellCount !== sidecar.correction.candidateCellCount) fail("execution candidate count does not bind correction count");
  return { rows, sidecarRows, correction: sidecar.correction, output: { path: output.path, sha256: outputSha256 ?? output.sha256, byteLength: outputByteLength ?? output.byteLength }, claims: { admitted: false, released: false, productionEligible: false }, notice: "Structural verification only. Exact fractional correction remains local, nonproduction, nonadmitted, and unreleased." };
}

export function verify({ outputPath, sidecarPath, workerPath = WORKER_PATH } = {}) {
  if (typeof outputPath !== "string" || outputPath.trim() === "") fail("--output is required");
  if (typeof sidecarPath !== "string" || sidecarPath.trim() === "") fail("--sidecar is required");
  const resolvedOutput = path.resolve(outputPath);
  const resolvedSidecar = path.resolve(sidecarPath);
  assertRegular(resolvedOutput, "output");
  assertRegular(resolvedSidecar, "sidecar");
  assertRegular(workerPath, "fractional correction worker");
  const outputBytes = readFileSync(resolvedOutput);
  let outputRows;
  let sidecar;
  try { outputRows = JSON.parse(outputBytes.toString("utf8")); } catch (error) { fail(`output is not valid JSON: ${error instanceof Error ? error.message : String(error)}`); }
  try { sidecar = JSON.parse(readFileSync(resolvedSidecar, "utf8")); } catch (error) { fail(`sidecar is not valid JSON: ${error instanceof Error ? error.message : String(error)}`); }
  const result = validateFractionalCorrectionDocuments(outputRows, sidecar, { outputSha256: sha256Bytes(outputBytes), outputByteLength: outputBytes.length, outputPath: resolvedOutput, workerPath });
  if (sidecar.execution.workerSha256 !== sha256File(workerPath)) fail("fractional correction sidecar worker hash does not match worker bytes");
  for (const target of sidecar.execution.checkpoint.targets) {
    const checkpointPath = path.resolve(target.path);
    assertRegular(checkpointPath, `checkpoint target ${target.boundaryId}`);
    const checkpointBytes = readFileSync(checkpointPath);
    if (checkpointBytes.length !== target.byteLength || sha256Bytes(checkpointBytes) !== target.sha256) fail(`checkpoint target ${target.boundaryId} bytes do not match the sidecar binding`);
  }
  return { ...result, output: { ...result.output, path: resolvedOutput }, sidecarPath: resolvedSidecar };
}

export const verifyFractionalCorrection = verify;

function parseArgs(argv) {
  let outputPath;
  let sidecarPath;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--output") outputPath = argv[++index];
    else if (argv[index] === "--sidecar") sidecarPath = argv[++index];
    else if (argv[index] === "--help" || argv[index] === "-h") return { help: true };
    else fail(`unknown argument: ${argv[index]}`);
  }
  if (typeof outputPath !== "string" || typeof sidecarPath !== "string") fail("--output and --sidecar are required");
  return { outputPath, sidecarPath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) console.log("Usage: node scripts/check-phase2-annual-zonal-fractional-correction.mjs --output PATH --sidecar PATH");
    else {
      const result = verify(args);
      console.log(`Fractional correction check passed: ${result.rows.total} rows; ${result.correction.fractionalCellCount} fractional candidates; local nonproduction only.`);
    }
  } catch (error) {
    console.error(`Stopped: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
