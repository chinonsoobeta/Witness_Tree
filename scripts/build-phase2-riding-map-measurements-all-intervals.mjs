#!/usr/bin/env node

/*
 * The same five corrected V2 riding runs, converted to every annual interval
 * rather than only the latest one.
 *
 * This is a sibling of build-phase2-riding-map-measurements.mjs rather than an
 * option added to it, because that script's output digest is bound into
 * docs/PHASE2_MAPPED_EXTENT_COVERAGE_DEFECT.md; changing it would move a
 * checksum whose stated reason has not changed. The two read the same inputs,
 * apply the same validation, and must agree exactly on the 2021-2022 interval.
 *
 * The rows are columnar: one identity record per boundary carrying parallel
 * arrays indexed by interval. A row-per-interval shape would repeat every
 * boundary's identity thirty-eight times and roughly quadruple what a reader
 * has to download to move one year slider.
 *
 * Coverage grade travels as one character per interval, c for complete, p for
 * partial-with-unknown, n for none-mapped. Loss hectares and the share stay
 * null wherever coverage is not complete, so a gap never renders as a zero.
 */

import { createHash, randomBytes } from "node:crypto";
import { closeSync, constants, fchmodSync, fsyncSync, linkSync, lstatSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const NO_FOLLOW = constants.O_NOFOLLOW ?? 0;
const SHA256 = /^[a-f0-9]{64}$/;
const FIRST_YEAR = 1984;
const LAST_YEAR = 2022;
const PAIR_COUNT = LAST_YEAR - FIRST_YEAR;
const GRADE_CODE = Object.freeze({ complete: "c", "partial-with-unknown": "p", "none-mapped": "n" });
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
  if (value.execution?.annualPairCount !== PAIR_COUNT || value.execution?.featureCount !== spec.featureCount) fail(`${spec.key} sidecar must record ${PAIR_COUNT} annual pairs and exactly ${spec.featureCount} target features`);
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
    if (set.length !== PAIR_COUNT + 1) fail(`${spec.key}/${boundaryId} must contain one baseline and ${PAIR_COUNT} annual rows`);
    const baselines = set.filter((row) => row.rowType === "baseline");
    if (baselines.length !== 1 || baselines[0].baselineYear !== FIRST_YEAR) fail(`${spec.key}/${boundaryId} must contain exactly one ${FIRST_YEAR} baseline row`);
    const byInterval = new Map();
    for (const row of set) {
      if (row.rowType === "baseline") continue;
      const key = `${row.fromYear}:${row.toYear}`;
      if (byInterval.has(key)) fail(`${spec.key}/${boundaryId} has a duplicate ${key} interval`);
      byInterval.set(key, row);
    }
    const districts = new Set();
    const knownForestedHectares = [];
    const knownObservedLossHectares = [];
    const lossHectares = [];
    const observedLossPercent = [];
    const unknownRequiredInputHectares = [];
    const unmappedByProductExtentHectares = [];
    let coverageGrades = "";
    for (let index = 0; index < PAIR_COUNT; index += 1) {
      const fromYear = FIRST_YEAR + index;
      const row = byInterval.get(`${fromYear}:${fromYear + 1}`);
      if (!row) fail(`${spec.key}/${boundaryId} is missing the ${fromYear}-${fromYear + 1} interval`);
      const label = `${spec.key}/${boundaryId}/${fromYear}`;
      const known = number(row.knownForestedHectares, `${label} knownForestedHectares`);
      const observed = number(row.knownObservedLossHectares, `${label} knownObservedLossHectares`);
      const unknown = number(row.unknownRequiredInputHectares, `${label} unknownRequiredInputHectares`);
      const unmapped = number(row.unmappedByProductExtentHectares, `${label} unmappedByProductExtentHectares`);
      const loss = number(row.lossHectares, `${label} lossHectares`, true);
      const share = number(row.observedLossPercent, `${label} observedLossPercent`, true);
      districts.add(number(row.districtHectares, `${label} districtHectares`));
      const code = GRADE_CODE[row.coverageGrade];
      if (!code) fail(`${label} has an unsupported coverage grade`);
      const complete = row.coverageGrade === "complete";
      if (complete !== (unknown === 0)) fail(`${label} coverage grade conflicts with unknown area`);
      if (complete !== (loss !== null)) fail(`${label} complete loss must be present only for complete coverage`);
      if (!complete && share !== null) fail(`${label} incomplete coverage must retain a null share`);
      if (complete && known > 0 && share === null) fail(`${label} complete forested coverage must have a share`);
      knownForestedHectares.push(known);
      knownObservedLossHectares.push(observed);
      lossHectares.push(loss);
      observedLossPercent.push(share);
      unknownRequiredInputHectares.push(unknown);
      unmappedByProductExtentHectares.push(unmapped);
      coverageGrades += code;
    }
    // The boundary polygon does not change between intervals, so a district
    // area that moves between them means the runs were not joined on one
    // geometry and the series is not comparable across years.
    if (districts.size !== 1) fail(`${spec.key}/${boundaryId} reports more than one district area across its intervals`);
    measurements.push({ overlay: spec.overlay, jurisdiction: spec.jurisdiction, boundaryId, districtHectares: [...districts][0], baselineForestedHectares: number(baselines[0].knownForestedHectares, `${spec.key}/${boundaryId} baseline knownForestedHectares`), coverageGrades, knownForestedHectares, knownObservedLossHectares, lossHectares, observedLossPercent, unknownRequiredInputHectares, unmappedByProductExtentHectares, evidence: "satellite-observation", claims: CLAIMS });
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

export function buildAllIntervalRidingMapMeasurements({ inputDirectory, output }) {
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
  const intervals = Array.from({ length: PAIR_COUNT }, (_, index) => [FIRST_YEAR + index, FIRST_YEAR + index + 1]);
  const result = {
    schemaVersion: "witness-tree/phase2-riding-map-measurements-all-intervals/1",
    status: "local-nonproduction-executed",
    claims: CLAIMS,
    context: {
      intervals,
      arrayOrder: "every per-interval array is indexed by the intervals array, oldest first",
      coverageGradeCodes: { c: "complete", p: "partial-with-unknown", n: "none-mapped" },
      annualTemporalSemantics: "adjacent annual pairs; each denominator is that interval's first-year forest-mask snapshot",
      nullPolicy: "loss hectares and the share are null wherever coverage is not complete, so an unmapped area never reads as zero",
      netChangeIncluded: false,
      mapJoin: "overlay, jurisdiction, boundaryId",
    },
    sources: inputs,
    measurements,
  };
  const bytes = Buffer.from(`${JSON.stringify(result)}\n`, "utf8"); atomicCreate(outputPath, bytes);
  return { output: { path: outputPath, byteLength: bytes.length, sha256: hash(bytes) }, measurementCount: measurements.length, intervalCount: PAIR_COUNT };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { console.log(JSON.stringify(buildAllIntervalRidingMapMeasurements(parse(process.argv.slice(2))))); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
