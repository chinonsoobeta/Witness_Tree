#!/usr/bin/env node

/*
 * Create the application data set for the latest completed federal-riding
 * interval from a corrected V2 annual zonal output. This is intentionally a
 * local conversion only: it neither claims admission nor changes any source.
 */

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { closeSync, constants, fchmodSync, fsyncSync, linkSync, lstatSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import { basename, dirname, resolve, join } from "node:path";

const NO_FOLLOW = constants.O_NOFOLLOW ?? 0;
const LATEST_FROM_YEAR = 2021;
const LATEST_TO_YEAR = 2022;
const FEDERAL_SOURCE_FEATURES = 352;
const FEDERAL_DISTRICTS = 343;
const MINIMUM_RANKED_FOREST_HECTARES = 500;
const SHA256 = /^[a-f0-9]{64}$/;

const fail = (message) => { throw new Error(message); };
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function regular(path, label) {
  let stat;
  try { stat = lstatSync(path); } catch (error) {
    if (error?.code === "ENOENT") fail(`${label} does not exist: ${path}`);
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} must be a regular, non-symlink file: ${path}`);
}

function input(path, label) {
  const resolved = resolve(path);
  regular(resolved, label);
  const bytes = readFileSync(resolved);
  return { path: resolved, bytes, value: (() => {
    try { return JSON.parse(bytes.toString("utf8")); } catch (error) { fail(`${label} is not valid JSON: ${error.message}`); }
  })() };
}

function descriptor(source) {
  return { path: source.path, byteLength: source.bytes.length, sha256: hash(source.bytes) };
}

function canonicalId(value, label) {
  if ((typeof value !== "string" && typeof value !== "number") || String(value).trim() === "") fail(`${label} must be a non-empty federal district identifier`);
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) fail(`${label} must be an integer federal district identifier`);
  return String(Number(text));
}

function number(value, label, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) fail(`${label} must be a finite non-negative number${nullable ? " or null" : ""}`);
  return value;
}

const NONPRODUCTION_CLAIMS = { admitted: false, released: false, productionEligible: false, externalAction: false };

const canonical = (value) => Array.isArray(value)
  ? value.map(canonical)
  : isObject(value)
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    : value;
const sameJson = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));

function assertAnnualSidecar(sidecar, annual, gpkg, extentVerification) {
  if (!isObject(sidecar.value) || sidecar.value.schemaVersion !== "phase2-annual-province-zonal-aggregation-v2") fail("annual sidecar must be a corrected V2 annual zonal sidecar");
  if (sidecar.value.status !== "local-nonproduction-executed" || !sameJson(sidecar.value.claims, NONPRODUCTION_CLAIMS) || sidecar.value.admitted !== false || sidecar.value.released !== false || sidecar.value.productionEligible !== false) fail("annual sidecar must remain explicitly local, non-admitted, non-released, and nonproduction");
  if (sidecar.value.input?.admissionStatus !== "not-admitted" || sidecar.value.input?.admissionRecord !== null) fail("annual sidecar input must remain non-admitted");
  if (sidecar.value.execution?.annualPairCount !== 38 || sidecar.value.execution?.featureCount !== FEDERAL_DISTRICTS) fail("annual sidecar must record 38 pairs and 343 federal districts");
  if (!sameJson(sidecar.value.rows, annual.value)) fail("annual sidecar rows must exactly equal the supplied annual JSON");
  const output = sidecar.value.output;
  if (!isObject(output) || output.path !== annual.path || output.byteLength !== annual.bytes.length || output.sha256 !== hash(annual.bytes)) {
    fail("annual sidecar output descriptor does not bind the supplied annual JSON");
  }
  const boundary = sidecar.value.input?.boundaries;
  if (!isObject(boundary) || sidecar.value.input?.boundaryIdField !== "FED_NUM") fail("annual sidecar must identify federal boundaries by FED_NUM");
  const gpkgBytes = readFileSync(gpkg);
  if (resolve(boundary.path) !== gpkg || boundary.byteLength !== gpkgBytes.length || boundary.sha256 !== hash(gpkgBytes)) {
    fail("annual sidecar boundary descriptor does not bind the supplied admitted federal 2023 GPKG");
  }
  const mappedExtent = sidecar.value.input?.mappedExtent;
  if (!isObject(mappedExtent) || typeof mappedExtent.path !== "string" || !SHA256.test(mappedExtent.sha256 ?? "")) fail("annual sidecar must bind the mapped-extent raster");
  const extentPath = resolve(mappedExtent.path);
  regular(extentPath, "mapped-extent raster");
  const extentBytes = readFileSync(extentPath);
  if (mappedExtent.byteLength !== extentBytes.length || mappedExtent.sha256 !== hash(extentBytes)) fail("annual sidecar mapped-extent descriptor does not match its bytes");
  const verification = extentVerification.value;
  if (!isObject(verification) || verification.schemaVersion !== "phase2-vlce2-mapped-extent-verification-v1" || verification.status !== "local-nonproduction-executed" || !sameJson(verification.claims, NONPRODUCTION_CLAIMS) || verification.admitted !== false || verification.released !== false || verification.productionEligible !== false) fail("mapped-extent verification must remain explicitly local and nonproduction");
  if (verification.extentInvariance?.verified !== true || verification.extentInvariance?.invariantAcrossVerifiedYears !== true || !Array.isArray(verification.extentInvariance?.years) || verification.extentInvariance.years.length !== 39 || verification.extentInvariance.years.some((entry, index) => entry?.year !== 1984 + index || entry?.differingCells !== 0)) fail("mapped-extent verification must prove all 39 years with zero differing cells");
  if (resolve(verification.verified?.path ?? "") !== extentPath || verification.verified?.byteLength !== extentBytes.length || verification.verified?.sha256 !== hash(extentBytes)) fail("mapped-extent verification does not bind the annual sidecar extent");
}

function federalNames(gpkg) {
  regular(gpkg, "federal 2023 GPKG");
  let geojson;
  try {
    geojson = JSON.parse(execFileSync("ogr2ogr", ["-f", "GeoJSON", "/vsistdout/", gpkg, "-select", "FED_NUM,ED_NAMEE,ED_NAMEF"], { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 }));
  } catch (error) {
    fail(`could not read FED_NUM, ED_NAMEE, and ED_NAMEF from federal 2023 GPKG: ${error.stderr || error.message}`);
  }
  if (!Array.isArray(geojson.features) || geojson.features.length === 0) fail("federal 2023 GPKG has no readable features");
  const names = new Map();
  let featureCount = 0;
  for (const feature of geojson.features) {
    featureCount += 1;
    const properties = feature?.properties;
    if (!isObject(properties) || Object.keys(properties).sort().join(",") !== "ED_NAMEE,ED_NAMEF,FED_NUM") fail("federal 2023 GPKG must expose exactly FED_NUM, ED_NAMEE, and ED_NAMEF for the name join");
    const id = canonicalId(properties.FED_NUM, "GPKG FED_NUM");
    if (typeof properties.ED_NAMEE !== "string" || !properties.ED_NAMEE.trim() || typeof properties.ED_NAMEF !== "string" || !properties.ED_NAMEF.trim()) fail(`GPKG ${id} must have non-empty ED_NAMEE and ED_NAMEF`);
    const name = { en: properties.ED_NAMEE, fr: properties.ED_NAMEF };
    const existing = names.get(id);
    if (existing && (existing.en !== name.en || existing.fr !== name.fr)) {
      fail(`multipart GPKG FED_NUM ${id} has conflicting bilingual names`);
    }
    names.set(id, name);
  }
  if (featureCount !== FEDERAL_SOURCE_FEATURES || names.size !== FEDERAL_DISTRICTS) {
    fail(`federal 2023 GPKG must contain exactly ${FEDERAL_SOURCE_FEATURES} features and ${FEDERAL_DISTRICTS} district IDs`);
  }
  return names;
}

function assertExactSet(actual, expected, label) {
  if (actual.size !== expected.size || [...actual].some((id) => !expected.has(id))) fail(`${label} federal district ID set does not exactly match the admitted GPKG`);
}

function buildRows(annualRows, names) {
  if (!Array.isArray(annualRows)) fail("annual JSON must be an array of V2 rows");
  const annualIds = new Set();
  const latest = new Map();
  for (const row of annualRows) {
    if (!isObject(row) || row.rowType !== "annual") continue;
    const id = canonicalId(row.boundaryId, "annual boundaryId");
    annualIds.add(id);
    if (row.fromYear !== LATEST_FROM_YEAR || row.toYear !== LATEST_TO_YEAR) continue;
    if (latest.has(id)) fail(`duplicate ${LATEST_FROM_YEAR}-${LATEST_TO_YEAR} annual row for federal district ${id}`);
    latest.set(id, row);
  }
  assertExactSet(annualIds, new Set(names.keys()), "annual JSON");
  assertExactSet(new Set(latest.keys()), new Set(names.keys()), `${LATEST_FROM_YEAR}-${LATEST_TO_YEAR} rows`);
  const rows = [];
  for (const [boundaryId, source] of latest) {
    const knownForestedHectares = number(source.knownForestedHectares, `${boundaryId} knownForestedHectares`);
    const knownObservedLossHectares = number(source.knownObservedLossHectares, `${boundaryId} knownObservedLossHectares`);
    const lossHectares = number(source.lossHectares, `${boundaryId} lossHectares`, true);
    const observedLossPercent = number(source.observedLossPercent, `${boundaryId} observedLossPercent`, true);
    const unknownRequiredInputHectares = number(source.unknownRequiredInputHectares, `${boundaryId} unknownRequiredInputHectares`);
    const unmappedByProductExtentHectares = number(source.unmappedByProductExtentHectares, `${boundaryId} unmappedByProductExtentHectares`);
    const districtHectares = number(source.districtHectares, `${boundaryId} districtHectares`);
    if (!["complete", "partial-with-unknown", "none-mapped"].includes(source.coverageGrade)) fail(`${boundaryId} has an unsupported coverage grade`);
    const complete = source.coverageGrade === "complete";
    if (complete !== (unknownRequiredInputHectares === 0)) fail(`${boundaryId} coverage grade conflicts with unknown required input`);
    if (!complete && (lossHectares !== null || observedLossPercent !== null)) fail(`${boundaryId} incomplete coverage must retain null total loss and percent`);
    if (complete && lossHectares === null) fail(`${boundaryId} complete coverage must have total loss`);
    const rankable = complete && observedLossPercent !== null && knownForestedHectares >= MINIMUM_RANKED_FOREST_HECTARES;
    rows.push({ boundaryId, boundaryName: names.get(boundaryId), fromYear: LATEST_FROM_YEAR, toYear: LATEST_TO_YEAR, knownForestedHectares, knownObservedLossHectares, lossHectares, observedLossPercent, unknownRequiredInputHectares, unmappedByProductExtentHectares, districtHectares, coverageGrade: source.coverageGrade, rankable, rank: null, unmatchedOfficialShare: null });
  }
  rows.sort((a, b) => a.boundaryId.localeCompare(b.boundaryId, "en", { numeric: true }));
  const ranked = rows.filter((row) => row.rankable).sort((a, b) => b.observedLossPercent - a.observedLossPercent || a.boundaryId.localeCompare(b.boundaryId, "en", { numeric: true }));
  ranked.forEach((row, index) => { row.rank = index + 1; });
  return rows;
}

function atomicCreate(path, bytes) {
  if (lstatSync(dirname(path)).isDirectory() !== true) fail(`output parent is not a directory: ${dirname(path)}`);
  try { lstatSync(path); fail(`refusing to overwrite existing output: ${path}`); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`);
  let fd;
  try {
    fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NO_FOLLOW, 0o600);
    fchmodSync(fd, 0o644); writeSync(fd, bytes); fsyncSync(fd); closeSync(fd); fd = undefined;
    linkSync(temporary, path); unlinkSync(temporary);
  } catch (error) { if (fd !== undefined) closeSync(fd); try { unlinkSync(temporary); } catch { /* The temporary may not have been created. */ } if (error?.code === "EEXIST") fail(`refusing to overwrite existing output: ${path}`); throw error; }
}

function parse(argv) {
  const names = { "--annual": "annual", "--annual-sidecar": "annualSidecar", "--mapped-extent-verification": "mappedExtentVerification", "--federal-gpkg": "federalGpkg", "--output": "output" };
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) { const key = names[argv[i]]; if (!key) fail(`unknown argument ${argv[i]}`); if (parsed[key]) fail(`${argv[i]} was supplied more than once`); if (!argv[i + 1] || argv[i + 1].startsWith("--")) fail(`${argv[i]} requires a path`); parsed[key] = argv[++i]; }
  for (const [flag, key] of Object.entries(names)) if (!parsed[key]) fail(`${flag} is required`);
  return parsed;
}

export function buildLatestFederalRidingComparison({ annual, annualSidecar, mappedExtentVerification, federalGpkg, output }) {
  const annualInput = input(annual, "annual JSON");
  const sidecarInput = input(annualSidecar, "annual sidecar");
  const extentVerificationInput = input(mappedExtentVerification, "mapped-extent verification");
  const gpkg = resolve(federalGpkg); regular(gpkg, "federal 2023 GPKG");
  const outputPath = resolve(output);
  if ([annualInput.path, sidecarInput.path, extentVerificationInput.path, gpkg].includes(outputPath)) fail("output must not replace an input");
  assertAnnualSidecar(sidecarInput, annualInput, gpkg, extentVerificationInput);
  const rows = buildRows(annualInput.value, federalNames(gpkg));
  const gpkgBytes = readFileSync(gpkg);
  const result = { schemaVersion: "witness-tree/phase2-federal-riding-latest-comparison/1", status: "local-nonproduction-executed", claims: NONPRODUCTION_CLAIMS, context: { interval: { fromYear: LATEST_FROM_YEAR, toYear: LATEST_TO_YEAR }, en: "Detected forest loss from 2021 to 2022", fr: "Perte forestière détectée de 2021 à 2022", annualTemporalSemantics: "2021-2022 adjacent annual pair; denominator is the 2021 first-year forest-mask snapshot", officialComparison: { unmatchedOfficialShare: null, status: { en: "Unknown", fr: "Inconnu" } } }, sources: { annualJson: descriptor(annualInput), annualSidecar: descriptor(sidecarInput), mappedExtentVerification: descriptor(extentVerificationInput), federal2023Gpkg: { path: gpkg, byteLength: gpkgBytes.length, sha256: hash(gpkgBytes), fields: ["FED_NUM", "ED_NAMEE", "ED_NAMEF"] } }, rows };
  const bytes = Buffer.from(`${JSON.stringify(result, null, 2)}\n`, "utf8");
  atomicCreate(outputPath, bytes);
  return { output: { path: outputPath, byteLength: bytes.length, sha256: hash(bytes) }, rowCount: rows.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { console.log(JSON.stringify(buildLatestFederalRidingComparison(parse(process.argv.slice(2))))) } catch (error) { console.error(error.message); process.exitCode = 1; }
}
