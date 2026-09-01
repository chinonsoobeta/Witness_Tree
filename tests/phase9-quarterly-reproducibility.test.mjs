import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  drawQuarterlySample,
  runQuarterlyReproducibility,
  validateQuarterlyPopulationManifest,
  validateQuarterlyReproducibilityResult,
} from "../scripts/run-phase9-quarterly-reproducibility.mjs";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const FIXTURE_ROOT = fileURLToPath(new URL("./fixtures/phase9-quarterly-reproducibility/", import.meta.url));
const POPULATION_PATH = path.join(FIXTURE_ROOT, "population.json");
const DATA_ROOT = path.join(FIXTURE_ROOT, "data-root");
const SEED_ZERO = "0".repeat(64);
const SEED_ORDERED = "0123456789abcdef".repeat(4);
const populationBytes = await readFile(POPULATION_PATH);
const populationFixture = JSON.parse(populationBytes);

function clock() {
  const values = ["2026-08-31T12:00:00.000Z", "2026-08-31T12:00:01.000Z"];
  return () => values.shift();
}

test("a SHA-256 seed produces the same sample without replacement", () => {
  const population = validateQuarterlyPopulationManifest(populationFixture, { allowFixture: true });
  const first = drawQuarterlySample(population, SEED_ZERO, 2);
  const second = drawQuarterlySample(population, SEED_ZERO, 2);
  assert.deepEqual(second, first);
  assert.deepEqual(first, [
    {
      drawPosition: 1,
      id: "charlie-figure",
      populationIndex: 2,
      score: "1001af41f13c645262907286a6f3df6273563b97928bc26ebf4af17694bf3420",
    },
    {
      drawPosition: 2,
      id: "delta-figure",
      populationIndex: 3,
      score: "44b86a850acd9cbb0c3013e35de1fd72074f00f449212a247cd5dbe54fdf03a2",
    },
  ]);
  assert.notDeepEqual(drawQuarterlySample(population, SEED_ORDERED, 2).map(({ id }) => id), first.map(({ id }) => id));
});

test("the fixture population recomputes every sampled unit and writes a private result", async (t) => {
  const temporary = await mkdtemp(path.join(tmpdir(), "phase9-quarterly-pass-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const outputPath = path.join(temporary, "result.json");
  const { population, record } = await runQuarterlyReproducibility({
    populationPath: POPULATION_PATH,
    dataRoot: DATA_ROOT,
    seed: SEED_ZERO,
    sampleSize: 2,
    outputPath,
    repoRoot: REPO_ROOT,
    allowFixture: true,
    now: clock(),
  });
  assert.equal(record.status, "passed");
  assert.deepEqual(record.units.map(({ id, status }) => ({ id, status })), [
    { id: "charlie-figure", status: "pass" },
    { id: "delta-figure", status: "pass" },
  ]);
  assert.equal(record.temporaryOutputsRemoved, true);
  assert.equal(validateQuarterlyReproducibilityResult(record, population, populationBytes), record);
  assert.deepEqual(JSON.parse(await readFile(outputPath, "utf8")), record);
  assert.equal((await stat(outputPath)).mode & 0o777, 0o600);
});

test("an output mismatch is recorded per unit while the remaining sample still runs", async (t) => {
  const temporary = await mkdtemp(path.join(tmpdir(), "phase9-quarterly-output-fail-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const changed = structuredClone(populationFixture);
  changed.units.find(({ id }) => id === "charlie-figure").publishedFigure.sha256 = "f".repeat(64);
  const changedBytes = Buffer.from(`${JSON.stringify(changed, null, 2)}\n`);
  const changedPath = path.join(temporary, "population.json");
  const outputPath = path.join(temporary, "result.json");
  await writeFile(changedPath, changedBytes);
  const { population, record } = await runQuarterlyReproducibility({ populationPath: changedPath, dataRoot: DATA_ROOT, seed: SEED_ZERO, sampleSize: 2, outputPath, repoRoot: REPO_ROOT, allowFixture: true, now: clock() });
  assert.equal(record.status, "failed");
  assert.deepEqual(record.units.map(({ id, status }) => ({ id, status })), [
    { id: "charlie-figure", status: "fail" },
    { id: "delta-figure", status: "pass" },
  ]);
  assert.equal(record.units[0].output.observed.sha256, "badcb20715ffcc34c992c06d25c58de2520c0b06f1e25e8a976e56e95e66c097");
  assert.equal(validateQuarterlyReproducibilityResult(record, population, changedBytes), record);
});

test("a raw input mismatch fails closed before its recomputation runner starts", async (t) => {
  const temporary = await mkdtemp(path.join(tmpdir(), "phase9-quarterly-input-fail-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const copiedDataRoot = path.join(temporary, "data-root");
  await cp(DATA_ROOT, copiedDataRoot, { recursive: true });
  await writeFile(path.join(copiedDataRoot, "raw/alpha.json"), "{\"value\":12}\n");
  const { record } = await runQuarterlyReproducibility({ populationPath: POPULATION_PATH, dataRoot: copiedDataRoot, seed: SEED_ORDERED, sampleSize: 1, repoRoot: REPO_ROOT, allowFixture: true, now: clock() });
  assert.equal(record.status, "failed");
  assert.equal(record.units[0].id, "alpha-figure");
  assert.equal(record.units[0].rawArchiveInputs[0].status, "fail");
  assert.equal(record.units[0].rawArchiveInputs[0].observed, null);
  assert.equal(record.units[0].runner.exitCode, null);
  assert.equal(record.units[0].output.observed, null);
});

test("fixture use, unsafe paths, invalid seeds, oversized draws, and result tampering are rejected", async () => {
  assert.throws(() => validateQuarterlyPopulationManifest(populationFixture), /allowFixture/);
  const unsafe = structuredClone(populationFixture);
  unsafe.units[0].rawArchiveInputs[0].relativePath = "../outside";
  assert.throws(() => validateQuarterlyPopulationManifest(unsafe, { allowFixture: true }), /parent traversal/);
  const unversioned = structuredClone(populationFixture);
  delete unversioned.units[0].rawArchiveInputs[0].versionId;
  assert.throws(() => validateQuarterlyPopulationManifest(unversioned, { allowFixture: true }), /version id/);
  const population = validateQuarterlyPopulationManifest(populationFixture, { allowFixture: true });
  assert.throws(() => drawQuarterlySample(population, "short", 1), /Seed/);
  assert.throws(() => drawQuarterlySample(population, SEED_ZERO, 5), /Sample size/);

  const { record } = await runQuarterlyReproducibility({ populationPath: POPULATION_PATH, dataRoot: DATA_ROOT, seed: SEED_ZERO, sampleSize: 1, repoRoot: REPO_ROOT, allowFixture: true, now: clock() });
  assert.throws(() => validateQuarterlyReproducibilityResult({ ...record, status: "failed" }, population, populationBytes), /Top-level/);
  const changedInput = structuredClone(record);
  changedInput.units[0].rawArchiveInputs[0].versionId = "different-version";
  changedInput.units[0].rawArchiveInputs[0].expected.sha256 = "f".repeat(64);
  changedInput.units[0].rawArchiveInputs[0].observed.sha256 = "f".repeat(64);
  assert.throws(() => validateQuarterlyReproducibilityResult(changedInput, population, populationBytes), /outcome status/);
  const changedDraw = record.draw.map((entry, index) => index === 0 ? { ...entry, score: "f".repeat(64) } : entry);
  assert.throws(() => validateQuarterlyReproducibilityResult({ ...record, draw: changedDraw }, population, populationBytes), /draw/);
  assert.throws(() => validateQuarterlyReproducibilityResult(record, population, Buffer.from("different manifest")), /manifest SHA-256/);
});
