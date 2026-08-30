#!/usr/bin/env node

/*
 * Convert all five completed corrected V2 riding runs into the one latest
 * interval map join. This is deliberately a local, nonproduction conversion.
 * Supplying one run, a sidecar that does not bind it, or an incomplete runner
 * output set is an error rather than an invitation to make a partial map.
 */

import { createHash, randomBytes } from "node:crypto";
import { closeSync, constants, fchmodSync, fsyncSync, linkSync, lstatSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const NO_FOLLOW = constants.O_NOFOLLOW ?? 0;
const SHA256 = /^[a-f0-9]{64}$/;
const LATEST = Object.freeze({ fromYear: 2021, toYear: 2022 });
const CLAIMS = Object.freeze({ admitted: false, released: false, productionEligible: false, externalAction: false });
const RUNS = Object.freeze([
  { key: "federal", overlay: "federal-ridings", jurisdiction: "CA", idField: "FED_NUM", featureCount: 343, sourceFeatureCount: 352, annual: "federal-ridings-2023.json", sidecar: "federal-ridings-2023.provenance.json", marker: "federal-ridings-2023.complete.sha256" },
  { key: "bc", overlay: "provincial-ridings", jurisdiction: "BC", idField: "ELECTORAL_DISTRICT_ID", featureCount: 93, sourceFeatureCount: 93, annual: "bc-provincial-ridings-2023.json", sidecar: "bc-provincial-ridings-2023.provenance.json", marker: "bc-provincial-ridings-2023.complete.sha256" },
  { key: "ab", overlay: "provincial-ridings", jurisdiction: "AB", idField: "EDNumber20", featureCount: 87, sourceFeatureCount: 87, annual: "ab-provincial-ridings-2019.json", sidecar: "ab-provincial-ridings-2019.provenance.json", marker: "ab-provincial-ridings-2019.complete.sha256" },
  { key: "on", overlay: "provincial-ridings", jurisdiction: "ON", idField: "ED_ID", featureCount: 124, sourceFeatureCount: 124, annual: "on-provincial-ridings-2022.json", sidecar: "on-provincial-ridings-2022.provenance.json", marker: "on-provincial-ridings-2022.complete.sha256" },
  { key: "qc", overlay: "provincial-ridings", jurisdiction: "QC", idField: "CO_CEP", featureCount: 127, sourceFeatureCount: 127, annual: "qc-provincial-ridings-2026.json", sidecar: "qc-provincial-ridings-2026.provenance.json", marker: "qc-provincial-ridings-2026.complete.sha256" },
]);

const fail = (message) => { throw new Error(message); };
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : isObject(value) ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
const sameJson = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));

function regular(path, label) {
  let stat;
  try { stat = lstatSync(path); } catch (error) { if (error?.code === "ENOENT") fail(`${label} does not exist: ${path}`); throw error; }
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} must be a regular, non-symlink file: ${path}`);
}

function json(path, label) {
  const resolved = resolve(path); regular(resolved, label);
  const bytes = readFileSync(resolved);
  try { return { path: resolved, bytes, value: JSON.parse(bytes.toString("utf8")) }; } catch (error) { fail(`${label} is not valid JSON: ${error.message}`); }
}

const descriptor = (source) => ({ path: source.path, byteLength: source.bytes.length, sha256: hash(source.bytes) });
const number = (value, label, nullable = false) => {
  if (nullable && value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) fail(`${label} must be a finite non-negative number${nullable ? " or null" : ""}`);
  return value;
};

function sourceDescriptor(value, label) {
  if (!isObject(value) || typeof value.path !== "string" || !value.path || !Number.isSafeInteger(value.byteLength) || value.byteLength < 0 || !SHA256.test(value.sha256 ?? "")) fail(`${label} must be an exact path, byte length, and SHA-256 descriptor`);
  return { ...value };
}

function assertCompletion(marker, annual, sidecar) {
  // The runner hashes the two shasum lines, not the input paths. Recreate its
  // exact byte stream with the conventional two-space separator and paths.
  const digestLines = [annual, sidecar].map((source) => `${hash(source.bytes)}  ${source.path}\n`).join("");
  const actual = hash(Buffer.from(digestLines, "utf8"));
  const recorded = readFileSync(marker, "utf8").trim();
  if (!SHA256.test(recorded) || recorded !== actual) fail(`completion marker does not bind annual JSON and sidecar: ${marker}`);
}

function assertSidecar(spec, annual, sidecar) {
  const value = sidecar.value;
  if (!isObject(value) || value.schemaVersion !== "phase2-annual-province-zonal-aggregation-v2") fail(`${spec.key} sidecar must be a corrected V2 annual zonal sidecar`);
  if (value.status !== "local-nonproduction-executed" || !sameJson(value.claims, CLAIMS) || value.admitted !== false || value.released !== false || value.productionEligible !== false || value.productionClaim !== false) fail(`${spec.key} sidecar must remain explicitly local and nonproduction`);
  if (value.input?.admissionStatus !== "not-admitted" || value.input?.admissionRecord !== null || value.input?.boundaryIdField !== spec.idField) fail(`${spec.key} sidecar has a different admission state or boundary identifier`);
  const boundary = sourceDescriptor(value.input?.boundaries, `${spec.key} boundary input`);
  sourceDescriptor(value.input?.mappedExtent, `${spec.key} mapped-extent input`);
  if (value.execution?.annualPairCount !== 38 || value.execution?.featureCount !== spec.featureCount) fail(`${spec.key} sidecar must record 38 annual pairs and exactly ${spec.featureCount} target features`);
  if (boundary.sourceFeatureCount !== spec.sourceFeatureCount || boundary.targetFeatureCount !== spec.featureCount) fail(`${spec.key} boundary descriptor has an unexpected source or target feature count`);
  if (!sameJson(value.rows, annual.value)) fail(`${spec.key} sidecar rows must exactly equal its annual JSON`);
  if (!isObject(value.output) || resolve(value.output.path ?? "") !== annual.path || value.output.byteLength !== annual.bytes.length || value.output.sha256 !== hash(annual.bytes)) fail(`${spec.key} sidecar output descriptor does not bind its annual JSON`);
}

function rowsFor(spec, annual, featureCount) {
  if (!Array.isArray(annual.value)) fail(`${spec.key} annual JSON must be an array`);
  const byId = new Map();
  for (const source of annual.value) {
    if (!isObject(source) || typeof source.boundaryId !== "string" || !source.boundaryId.trim() || source.province !== spec.jurisdiction) fail(`${spec.key} annual row has an invalid identity`);
    const list = byId.get(source.boundaryId) ?? []; list.push(source); byId.set(source.boundaryId, list);
  }
  if (byId.size !== featureCount) fail(`${spec.key} annual JSON does not contain exactly one row set per sidecar feature`);
  const measurements = [];
  for (const [boundaryId, set] of byId) {
    if (set.length !== 39) fail(`${spec.key}/${boundaryId} must contain one baseline and 38 annual rows`);
    const expectedPeriods = new Set(["baseline:1984", ...Array.from({ length: 38 }, (_, index) => `annual:${1984 + index}:${1985 + index}`)]);
    const actualPeriods = new Set(set.map((row) => row.rowType === "baseline" ? `baseline:${row.baselineYear}` : `annual:${row.fromYear}:${row.toYear}`));
    if (actualPeriods.size !== expectedPeriods.size || [...actualPeriods].some((period) => !expectedPeriods.has(period))) fail(`${spec.key}/${boundaryId} has a missing, duplicate, or invalid annual period`);
    const latest = set.filter((row) => row.rowType === "annual" && row.fromYear === LATEST.fromYear && row.toYear === LATEST.toYear);
    if (latest.length !== 1) fail(`${spec.key}/${boundaryId} must contain exactly one ${LATEST.fromYear}-${LATEST.toYear} row`);
    const row = latest[0];
    const knownForestedHectares = number(row.knownForestedHectares, `${spec.key}/${boundaryId} knownForestedHectares`);
    const knownObservedLossHectares = number(row.knownObservedLossHectares, `${spec.key}/${boundaryId} knownObservedLossHectares`);
    const unknownRequiredInputHectares = number(row.unknownRequiredInputHectares, `${spec.key}/${boundaryId} unknownRequiredInputHectares`);
    const unmappedByProductExtentHectares = number(row.unmappedByProductExtentHectares, `${spec.key}/${boundaryId} unmappedByProductExtentHectares`);
    const districtHectares = number(row.districtHectares, `${spec.key}/${boundaryId} districtHectares`);
    const lossHectares = number(row.lossHectares, `${spec.key}/${boundaryId} lossHectares`, true);
    const observedLossPercent = number(row.observedLossPercent, `${spec.key}/${boundaryId} observedLossPercent`, true);
    if (!["complete", "partial-with-unknown", "none-mapped"].includes(row.coverageGrade)) fail(`${spec.key}/${boundaryId} has an unsupported coverage grade`);
    const complete = row.coverageGrade === "complete";
    if (complete !== (unknownRequiredInputHectares === 0)) fail(`${spec.key}/${boundaryId} coverage grade conflicts with unknown area`);
    if (complete !== (lossHectares !== null)) fail(`${spec.key}/${boundaryId} complete loss must be present only for complete coverage`);
    if (!complete && observedLossPercent !== null) fail(`${spec.key}/${boundaryId} incomplete coverage must retain a null share`);
    if (complete && knownForestedHectares > 0 && observedLossPercent === null) fail(`${spec.key}/${boundaryId} complete forested coverage must have a share`);
    measurements.push({ overlay: spec.overlay, jurisdiction: spec.jurisdiction, boundaryId, fromYear: LATEST.fromYear, toYear: LATEST.toYear, knownForestedHectares, knownObservedLossHectares, lossHectares, observedLossPercent, unknownRequiredInputHectares, unmappedByProductExtentHectares, districtHectares, coverageGrade: row.coverageGrade, evidence: "satellite-observation", claims: CLAIMS });
  }
  return measurements;
}

function atomicCreate(path, bytes) {
  if (!lstatSync(dirname(path)).isDirectory()) fail(`output parent is not a directory: ${dirname(path)}`);
  try { lstatSync(path); fail(`refusing to overwrite existing output: ${path}`); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`);
  let fd;
  try { fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NO_FOLLOW, 0o600); fchmodSync(fd, 0o644); writeSync(fd, bytes); fsyncSync(fd); closeSync(fd); fd = undefined; linkSync(temporary, path); unlinkSync(temporary); } catch (error) { if (fd !== undefined) closeSync(fd); try { unlinkSync(temporary); } catch { /* No temporary was created. */ } if (error?.code === "EEXIST") fail(`refusing to overwrite existing output: ${path}`); throw error; }
}

function parse(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i += 1) { const key = argv[i]; if (!key.startsWith("--") || values[key]) fail(`unknown or repeated argument ${key}`); if (!argv[i + 1] || argv[i + 1].startsWith("--")) fail(`${key} requires a path`); values[key] = argv[++i]; }
  const required = ["--input-directory", "--output"];
  for (const key of required) if (!values[key]) fail(`${key} is required`);
  if (Object.keys(values).some((key) => !required.includes(key))) fail("only --input-directory and --output are supported");
  return { inputDirectory: resolve(values["--input-directory"]), output: resolve(values["--output"]) };
}

export function buildLatestRidingMapMeasurements({ inputDirectory, output }) {
  const root = resolve(inputDirectory);
  let stat; try { stat = lstatSync(root); } catch (error) { if (error?.code === "ENOENT") fail(`input directory does not exist: ${root}`); throw error; }
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail(`input directory must be a non-symlink directory: ${root}`);
  const outputPath = resolve(output); const inputs = []; const measurements = [];
  for (const spec of RUNS) {
    const annual = json(join(root, spec.annual), `${spec.key} annual JSON`);
    const sidecar = json(join(root, spec.sidecar), `${spec.key} sidecar`);
    const markerPath = join(root, spec.marker); regular(markerPath, `${spec.key} completion marker`);
    if (outputPath === annual.path || outputPath === sidecar.path || outputPath === markerPath) fail("output must not replace an input");
    assertCompletion(markerPath, annual, sidecar); assertSidecar(spec, annual, sidecar);
    measurements.push(...rowsFor(spec, annual, sidecar.value.execution.featureCount));
    const markerBytes = readFileSync(markerPath); inputs.push({ key: spec.key, overlay: spec.overlay, jurisdiction: spec.jurisdiction, annualJson: descriptor(annual), annualSidecar: descriptor(sidecar), completionMarker: { path: markerPath, byteLength: markerBytes.length, sha256: hash(markerBytes) }, boundary: sourceDescriptor(sidecar.value.input.boundaries, `${spec.key} boundary input`), mappedExtent: sourceDescriptor(sidecar.value.input.mappedExtent, `${spec.key} mapped-extent input`) });
  }
  const identities = new Set();
  for (const row of measurements) { const identity = `${row.overlay}|${row.jurisdiction}|${row.boundaryId}`; if (identities.has(identity)) fail(`duplicate overlay/jurisdiction/boundary identity ${identity}`); identities.add(identity); }
  measurements.sort((a, b) => a.overlay.localeCompare(b.overlay) || a.jurisdiction.localeCompare(b.jurisdiction) || a.boundaryId.localeCompare(b.boundaryId, "en", { numeric: true }));
  const result = { schemaVersion: "witness-tree/phase2-riding-map-measurements/1", status: "local-nonproduction-executed", claims: CLAIMS, context: { interval: LATEST, annualTemporalSemantics: "2021-2022 adjacent annual pair; denominator is the 2021 first-year forest-mask snapshot", mapJoin: "overlay, jurisdiction, boundaryId" }, sources: inputs, measurements };
  const bytes = Buffer.from(`${JSON.stringify(result, null, 2)}\n`, "utf8"); atomicCreate(outputPath, bytes);
  return { output: { path: outputPath, byteLength: bytes.length, sha256: hash(bytes) }, measurementCount: measurements.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { console.log(JSON.stringify(buildLatestRidingMapMeasurements(parse(process.argv.slice(2))))); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
