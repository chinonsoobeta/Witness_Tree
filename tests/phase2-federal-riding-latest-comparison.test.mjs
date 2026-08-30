import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const runner = path.join(root, "scripts/build-phase2-federal-riding-latest-comparison.mjs");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function nameFeatures(conflict = false) {
  const features = Array.from({ length: 343 }, (_, index) => {
    const id = index + 1;
    const en = id === 1 ? "Alpha" : id === 2 ? "Bravo" : `District ${id}`;
    const fr = id === 1 ? "Alpha français" : id === 2 ? "Bravo français" : `Circonscription ${id}`;
    return { type: "Feature", properties: { FED_NUM: id, ED_NAMEE: en, ED_NAMEF: fr }, geometry: { type: "Point", coordinates: [id / 100, id / 100] } };
  });
  for (let index = 0; index < 9; index += 1) {
    features.push({
      type: "Feature",
      properties: { FED_NUM: 1, ED_NAMEE: conflict && index === 0 ? "Different" : "Alpha", ED_NAMEF: "Alpha français" },
      geometry: { type: "Point", coordinates: [4 + index / 100, 4 + index / 100] },
    });
  }
  return features;
}

function fixture(dir) {
  const geojson = path.join(dir, "names.geojson");
  const gpkg = path.join(dir, "federal-2023.gpkg");
  writeFileSync(geojson, JSON.stringify({ type: "FeatureCollection", features: nameFeatures() }));
  execFileSync("ogr2ogr", ["-f", "GPKG", gpkg, geojson, "-nln", "federal_electoral_districts_2023"]);
  const rows = Array.from({ length: 343 }, (_, index) => index + 1).flatMap((boundaryId) => [
    { boundaryId: String(boundaryId), rowType: "annual", fromYear: 2020, toYear: 2021 },
    { boundaryId: String(boundaryId), rowType: "annual", fromYear: 2021, toYear: 2022, knownForestedHectares: boundaryId === 1 ? 100 : 0, knownObservedLossHectares: boundaryId === 1 ? 5 : 0, lossHectares: boundaryId === 1 ? 5 : 0, observedLossPercent: boundaryId === 1 ? 5 : null, unknownRequiredInputHectares: 0, unmappedByProductExtentHectares: 0, districtHectares: 110, coverageGrade: "complete" },
  ]);
  const annual = path.join(dir, "annual.json"); writeFileSync(annual, JSON.stringify(rows));
  const bytes = readFileSync(annual); const gpkgBytes = readFileSync(gpkg);
  const extent = path.join(dir, "mapped-extent.tif"); writeFileSync(extent, "fixture mapped extent bytes");
  const extentBytes = readFileSync(extent);
  const extentVerification = path.join(dir, "mapped-extent.verification.json");
  writeFileSync(extentVerification, JSON.stringify({ schemaVersion: "phase2-vlce2-mapped-extent-verification-v1", status: "local-nonproduction-executed", claims: { admitted: false, released: false, productionEligible: false, externalAction: false }, extentInvariance: { verified: true, invariantAcrossVerifiedYears: true, years: Array.from({ length: 39 }, (_, index) => ({ year: 1984 + index, differingCells: 0 })) }, verified: { path: extent, byteLength: extentBytes.length, sha256: sha256(extentBytes) }, admitted: false, released: false, productionEligible: false }));
  const sidecar = path.join(dir, "annual.provenance.json");
  writeFileSync(sidecar, JSON.stringify({ schemaVersion: "phase2-annual-province-zonal-aggregation-v2", status: "local-nonproduction-executed", claims: { admitted: false, released: false, productionEligible: false, externalAction: false }, input: { admissionStatus: "not-admitted", admissionRecord: null, boundaryIdField: "FED_NUM", boundaries: { path: gpkg, byteLength: gpkgBytes.length, sha256: sha256(gpkgBytes) }, mappedExtent: { path: extent, byteLength: extentBytes.length, sha256: sha256(extentBytes) } }, output: { path: annual, byteLength: bytes.length, sha256: sha256(bytes) }, execution: { annualPairCount: 38, featureCount: 343 }, rows, admitted: false, released: false, productionEligible: false }));
  return { annual, sidecar, extentVerification, gpkg, output: path.join(dir, "comparison.json"), rows };
}

function run(paths) { return execFileSync(process.execPath, [runner, "--annual", paths.annual, "--annual-sidecar", paths.sidecar, "--mapped-extent-verification", paths.extentVerification, "--federal-gpkg", paths.gpkg, "--output", paths.output], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }

test("creates deterministic bilingual 2021-2022 rows with only valid ranking", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "federal-latest-comparison-"));
  try {
    const paths = fixture(dir); const summary = JSON.parse(run(paths)); const result = JSON.parse(readFileSync(paths.output));
    assert.equal(summary.rowCount, 343); assert.equal(result.context.interval.fromYear, 2021); assert.equal(result.context.officialComparison.unmatchedOfficialShare, null);
    assert.deepEqual(result.rows.slice(0, 2).map(({ boundaryId, boundaryName, rankable, rank, observedLossPercent, unmatchedOfficialShare }) => ({ boundaryId, boundaryName, rankable, rank, observedLossPercent, unmatchedOfficialShare })), [
      { boundaryId: "1", boundaryName: { en: "Alpha", fr: "Alpha français" }, rankable: true, rank: 1, observedLossPercent: 5, unmatchedOfficialShare: null },
      { boundaryId: "2", boundaryName: { en: "Bravo", fr: "Bravo français" }, rankable: false, rank: null, observedLossPercent: null, unmatchedOfficialShare: null },
    ]);
    assert.equal(result.sources.annualJson.sha256, sha256(readFileSync(paths.annual)));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("fails closed for an incomplete row with a fabricated percentage", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "federal-latest-comparison-invalid-"));
  try {
    const paths = fixture(dir); paths.rows[3] = { ...paths.rows[3], coverageGrade: "partial-with-unknown", unknownRequiredInputHectares: 1, lossHectares: null, observedLossPercent: 0 };
    writeFileSync(paths.annual, JSON.stringify(paths.rows)); const bytes = readFileSync(paths.annual); const sidecar = JSON.parse(readFileSync(paths.sidecar)); sidecar.output.byteLength = bytes.length; sidecar.output.sha256 = sha256(bytes); sidecar.rows = paths.rows; writeFileSync(paths.sidecar, JSON.stringify(sidecar));
    assert.throws(() => run(paths), /incomplete coverage must retain null total loss and percent/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("fails closed when annual federal IDs do not exactly match the admitted GPKG", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "federal-latest-comparison-id-set-"));
  try {
    const paths = fixture(dir);
    paths.rows = paths.rows.filter((row) => row.boundaryId !== "2");
    writeFileSync(paths.annual, JSON.stringify(paths.rows));
    const bytes = readFileSync(paths.annual); const sidecar = JSON.parse(readFileSync(paths.sidecar));
    sidecar.output.byteLength = bytes.length; sidecar.output.sha256 = sha256(bytes);
    sidecar.rows = paths.rows;
    writeFileSync(paths.sidecar, JSON.stringify(sidecar));
    assert.throws(() => run(paths), /ID set does not exactly match/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("fails closed when multipart features disagree on a district name", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "federal-latest-comparison-name-conflict-"));
  try {
    const paths = fixture(dir);
    const conflictGeojson = path.join(dir, "conflict.geojson");
    writeFileSync(conflictGeojson, JSON.stringify({ type: "FeatureCollection", features: nameFeatures(true) }));
    const conflictingGpkg = path.join(dir, "conflicting-federal-2023.gpkg");
    execFileSync("ogr2ogr", ["-f", "GPKG", conflictingGpkg, conflictGeojson, "-nln", "federal_electoral_districts_2023"]);
    const gpkgBytes = readFileSync(conflictingGpkg);
    const sidecar = JSON.parse(readFileSync(paths.sidecar));
    sidecar.input.boundaries = { path: conflictingGpkg, byteLength: gpkgBytes.length, sha256: sha256(gpkgBytes) };
    writeFileSync(paths.sidecar, JSON.stringify(sidecar));
    assert.throws(() => run({ ...paths, gpkg: conflictingGpkg }), /conflicting bilingual names/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("fails closed when 343 districts are not represented by the admitted 352 features", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "federal-latest-comparison-cardinality-"));
  try {
    const paths = fixture(dir);
    const singlePartGeojson = path.join(dir, "single-part.geojson");
    writeFileSync(singlePartGeojson, JSON.stringify({ type: "FeatureCollection", features: nameFeatures().slice(0, 343) }));
    const singlePartGpkg = path.join(dir, "single-part-federal-2023.gpkg");
    execFileSync("ogr2ogr", ["-f", "GPKG", singlePartGpkg, singlePartGeojson, "-nln", "federal_electoral_districts_2023"]);
    const gpkgBytes = readFileSync(singlePartGpkg);
    const sidecar = JSON.parse(readFileSync(paths.sidecar));
    sidecar.input.boundaries = { path: singlePartGpkg, byteLength: gpkgBytes.length, sha256: sha256(gpkgBytes) };
    writeFileSync(paths.sidecar, JSON.stringify(sidecar));
    assert.throws(() => run({ ...paths, gpkg: singlePartGpkg }), /exactly 352 features and 343 district IDs/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("fails closed when the sidecar rows differ from the bound annual JSON", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "federal-latest-comparison-sidecar-rows-"));
  try {
    const paths = fixture(dir);
    const sidecar = JSON.parse(readFileSync(paths.sidecar));
    sidecar.rows[1].knownObservedLossHectares = 999;
    writeFileSync(paths.sidecar, JSON.stringify(sidecar));
    assert.throws(() => run(paths), /sidecar rows must exactly equal/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
