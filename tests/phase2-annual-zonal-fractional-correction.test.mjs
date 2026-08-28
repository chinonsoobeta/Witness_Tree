import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { verify } from "../scripts/check-phase2-annual-zonal-fractional-correction.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const fixture = path.join(root, "tests", "fixtures", "phase2-annual-zonal-fractional-correction-fixture.py");
const historicalWorker = path.join(root, "scripts", "phase2_annual_zonal_aggregate.py");
const correctionWorker = path.join(root, "scripts", "phase2_annual_zonal_fractional_correction.py");

function createFixture() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "witness-tree-annual-fractional-correction-"));
  execFileSync("python3", [fixture, directory], { encoding: "utf8" });
  const binaryOutput = path.join(directory, "binary.json");
  const binarySidecar = path.join(directory, "binary.sidecar.json");
  execFileSync("python3", [historicalWorker,
    "--manifest", path.join(directory, "manifest.json"),
    "--boundaries", path.join(directory, "boundaries.geojson"),
    "--output", binaryOutput,
    "--sidecar", binarySidecar,
    "--boundary-edition", "fixture-boundary-v1",
    "--forest-mask-version", "fixture-forest-v1",
    "--change-raster-version", "fixture-loss-v1",
    "--time-version", "1984-2022",
    "--source-version", "fixture-source-v1",
    "--code-version", "fixture-code-v1",
    "--boundary-classification", "authoritative-boundary",
    "--admission-status", "not-admitted",
  ], { encoding: "utf8" });
  const output = path.join(directory, "corrected.json");
  const sidecar = path.join(directory, "corrected.sidecar.json");
  const runCorrection = () => execFileSync("python3", [correctionWorker,
    "--binary-output", binaryOutput,
    "--binary-sidecar", binarySidecar,
    "--manifest", path.join(directory, "manifest.json"),
    "--boundaries", path.join(directory, "boundaries.geojson"),
    "--output", output,
    "--sidecar", sidecar,
  ], { encoding: "utf8" });
  return { directory, binaryOutput, binarySidecar, output, sidecar, runCorrection };
}

function row(rows, province, rowType, fromYear = null) {
  return rows.find((candidate) => candidate.province === province && candidate.rowType === rowType && (rowType === "baseline" || candidate.fromYear === fromYear));
}

test("exact correction proves zero, fractional, full, and hole cells while weighting Unknown", () => {
  const run = createFixture();
  try {
    run.runCorrection();
    const binaryRows = JSON.parse(readFileSync(run.binaryOutput, "utf8"));
    const correctedRows = JSON.parse(readFileSync(run.output, "utf8"));
    const provenance = JSON.parse(readFileSync(run.sidecar, "utf8"));

    // The historical centre mask misses the right-hand fractional BC/QC
    // cells, and both AB shell cells because their centres lie in the hole.
    assert.equal(row(binaryRows, "BC", "baseline").knownForestedHectares, 0.01);
    assert.equal(row(binaryRows, "BC", "baseline").unknownRequiredInputHectares, 0);
    assert.equal(row(binaryRows, "AB", "baseline").knownForestedHectares, 0);
    assert.equal(row(binaryRows, "QC", "annual", 1984).knownObservedLossHectares, 0);

    // 10 m x 10 m cells are 0.01 ha. BC's full cell plus 0.4 Unknown cell;
    // AB's two 0.64 shell cells (the hole removes 0.36 from each); QC's full
    // cell plus 0.4 loss cell; ON is exactly cell aligned.
    assert.deepEqual(row(correctedRows, "BC", "baseline"), {
      ...row(correctedRows, "BC", "baseline"),
      knownForestedHectares: 0.01,
      unknownRequiredInputHectares: 0.004,
      coverageGrade: "partial-with-unknown",
    });
    assert.equal(row(correctedRows, "BC", "annual", 1984).knownObservedLossHectares, 0.01);
    assert.equal(row(correctedRows, "BC", "annual", 1984).unknownRequiredInputHectares, 0.004);
    assert.equal(row(correctedRows, "BC", "annual", 1984).lossHectares, null);
    assert.equal(row(correctedRows, "AB", "baseline").knownForestedHectares, 0.0128);
    assert.equal(row(correctedRows, "AB", "annual", 1984).knownObservedLossHectares, 0.0064);
    assert.equal(row(correctedRows, "ON", "baseline").knownForestedHectares, 0.02);
    assert.equal(row(correctedRows, "QC", "annual", 1984).knownObservedLossHectares, 0.004);
    assert.equal(row(correctedRows, "QC", "annual", 1984).observedLossPercent, 28.571429);

    assert.equal(provenance.status, "local-nonproduction-fractional-correction");
    assert.equal(provenance.claims.admitted, false);
    assert.equal(provenance.claims.released, false);
    assert.equal(provenance.claims.productionEligible, false);
    assert.equal(provenance.correction.candidateCellCount, 10);
    assert.equal(provenance.correction.fractionalCellCount, 4);
    assert.equal(provenance.correction.zeroIntersectionCellCount, 2);
    assert.equal(provenance.correction.fullIntersectionCellCount, 4);
    assert.equal(provenance.correction.changedCellCount, 4);
    assert.equal(provenance.correction.perTarget.find((target) => target.province === "AB").zeroIntersectionCellCount, 1);
    assert.equal(provenance.correction.perTarget.find((target) => target.province === "ON").fullIntersectionCellCount, 2);
    const checked = verify({ outputPath: run.output, sidecarPath: run.sidecar });
    assert.equal(checked.rows.total, 156);
    assert.equal(checked.correction.fractionalCellCount, 4);
  } finally {
    rmSync(run.directory, { recursive: true, force: true });
  }
});

test("correction fails closed when exact boundary binding changes and never overwrites", () => {
  const run = createFixture();
  try {
    run.runCorrection();
    assert.throws(() => run.runCorrection(), /refusing to overwrite an existing corrected output/);

    const changedBoundary = path.join(run.directory, "changed-boundaries.geojson");
    writeFileSync(changedBoundary, `${readFileSync(path.join(run.directory, "boundaries.geojson"), "utf8")}\n`);
    const changedOutput = path.join(run.directory, "changed.json");
    const changedSidecar = path.join(run.directory, "changed.sidecar.json");
    assert.throws(() => execFileSync("python3", [correctionWorker,
      "--binary-output", run.binaryOutput,
      "--binary-sidecar", run.binarySidecar,
      "--manifest", path.join(run.directory, "manifest.json"),
      "--boundaries", changedBoundary,
      "--output", changedOutput,
      "--sidecar", changedSidecar,
    ], { encoding: "utf8", stdio: "pipe" }), /boundary path does not match/);
  } finally {
    rmSync(run.directory, { recursive: true, force: true });
  }
});

test("checker rejects a production claim on the corrected provenance", () => {
  const run = createFixture();
  try {
    run.runCorrection();
    const sidecar = JSON.parse(readFileSync(run.sidecar, "utf8"));
    sidecar.admitted = true;
    writeFileSync(run.sidecar, `${JSON.stringify(sidecar, null, 2)}\n`);
    assert.throws(() => verify({ outputPath: run.output, sidecarPath: run.sidecar }), /sidecar admitted must be false/);
  } finally {
    rmSync(run.directory, { recursive: true, force: true });
  }
});
