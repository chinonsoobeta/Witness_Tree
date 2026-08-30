import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const runner = path.join(root, "scripts/build-phase2-riding-map-measurements.mjs");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const specs = [
  ["federal-ridings-2023", "CA", "FED_NUM", 343, 352], ["bc-provincial-ridings-2023", "BC", "ELECTORAL_DISTRICT_ID", 93, 93],
  ["ab-provincial-ridings-2019", "AB", "EDNumber20", 87, 87], ["on-provincial-ridings-2022", "ON", "ED_ID", 124, 124],
  ["qc-provincial-ridings-2026", "QC", "CO_CEP", 127, 127],
];

function annualRows(province, count) {
  return Array.from({ length: count }, (_, featureIndex) => {
    const id = `${province}-${featureIndex + 1}`;
    return [{ boundaryId: id, province, rowType: "baseline", baselineYear: 1984, fromYear: null, toYear: null }, ...Array.from({ length: 38 }, (_, index) => {
    const fromYear = 1984 + index; const complete = province !== "ON";
    return { boundaryId: id, province, rowType: "annual", baselineYear: null, fromYear, toYear: fromYear + 1, knownForestedHectares: 10, knownObservedLossHectares: 1, lossHectares: complete ? 1 : null, observedLossPercent: complete ? 10 : null, unknownRequiredInputHectares: complete ? 0 : 2, unmappedByProductExtentHectares: complete ? 0 : 2, districtHectares: 12, coverageGrade: complete ? "complete" : "partial-with-unknown" };
    })];
  }).flat();
}

function completion(annual, sidecar) {
  return sha256(Buffer.from(`${sha256(readFileSync(annual))}  ${annual}\n${sha256(readFileSync(sidecar))}  ${sidecar}\n`, "utf8"));
}

function fixture() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "riding-map-measurements-"));
  for (const [slug, province, idField, featureCount, sourceFeatureCount] of specs) {
    const annual = path.join(dir, `${slug}.json`); const sidecar = path.join(dir, `${slug}.provenance.json`); const marker = path.join(dir, `${slug}.complete.sha256`);
    const rows = annualRows(province, featureCount); writeFileSync(annual, JSON.stringify(rows)); const bytes = readFileSync(annual);
    writeFileSync(sidecar, JSON.stringify({ schemaVersion: "phase2-annual-province-zonal-aggregation-v2", status: "local-nonproduction-executed", claims: { admitted: false, released: false, productionEligible: false, externalAction: false }, input: { admissionStatus: "not-admitted", admissionRecord: null, boundaryIdField: idField, boundaries: { path: `/fixture/${slug}.boundary`, byteLength: 1, sha256: "a".repeat(64), sourceFeatureCount, targetFeatureCount: featureCount }, mappedExtent: { path: "/fixture/mapped-extent.tif", byteLength: 1, sha256: "b".repeat(64) } }, output: { path: annual, byteLength: bytes.length, sha256: sha256(bytes) }, execution: { annualPairCount: 38, featureCount }, rows, productionClaim: false, admitted: false, released: false, productionEligible: false }));
    writeFileSync(marker, `${completion(annual, sidecar)}\n`);
  }
  return { dir, output: path.join(dir, "map-measurements.json") };
}

function run(paths) { return execFileSync(process.execPath, [runner, "--input-directory", paths.dir, "--output", paths.output], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }

test("combines exactly the five completed V2 runs and keeps incomplete shares null", () => {
  const paths = fixture();
  try {
    const summary = JSON.parse(run(paths)); const result = JSON.parse(readFileSync(paths.output));
    assert.equal(summary.measurementCount, 774); assert.equal(result.sources.length, 5);
    assert.deepEqual(result.claims, { admitted: false, released: false, productionEligible: false, externalAction: false });
    const ontario = result.measurements.find((row) => row.jurisdiction === "ON");
    assert.deepEqual({ overlay: ontario.overlay, lossHectares: ontario.lossHectares, observedLossPercent: ontario.observedLossPercent, knownObservedLossHectares: ontario.knownObservedLossHectares, evidence: ontario.evidence }, { overlay: "provincial-ridings", lossHectares: null, observedLossPercent: null, knownObservedLossHectares: 1, evidence: "satellite-observation" });
    assert.equal(result.context.mapJoin, "overlay, jurisdiction, boundaryId");
  } finally { rmSync(paths.dir, { recursive: true, force: true }); }
});

test("fails closed when any of the five runner completion markers is absent", () => {
  const paths = fixture();
  try {
    unlinkSync(path.join(paths.dir, "qc-provincial-ridings-2026.complete.sha256"));
    assert.throws(() => run(paths), /completion marker does not exist/);
  } finally { rmSync(paths.dir, { recursive: true, force: true }); }
});

test("fails closed when a sidecar output descriptor no longer binds its annual bytes", () => {
  const paths = fixture();
  try {
    const sidecar = path.join(paths.dir, "bc-provincial-ridings-2023.provenance.json"); const value = JSON.parse(readFileSync(sidecar)); value.output.sha256 = "c".repeat(64); writeFileSync(sidecar, JSON.stringify(value));
    writeFileSync(path.join(paths.dir, "bc-provincial-ridings-2023.complete.sha256"), `${completion(path.join(paths.dir, "bc-provincial-ridings-2023.json"), sidecar)}\n`);
    assert.throws(() => run(paths), /output descriptor does not bind/);
  } finally { rmSync(paths.dir, { recursive: true, force: true }); }
});
