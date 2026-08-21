import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import {
  runBaselineBatch,
  sha256,
  stableJson,
  type BaselineBatchManifest,
  type BoundaryCrosswalkInput,
  type LandCoverInput,
} from "../lib/pipeline/national-baseline-batch";

const execute = promisify(execFile);
const grid = {
  crsId: "fixture-lcc",
  linearUnit: "metre",
  geotransform: [0, 30, 0, 60, 0, -30],
  width: 2,
  height: 2,
  noDataValue: 255,
} as const;
const landCover: LandCoverInput = {
  schemaVersion: 1,
  grid,
  years: [
    { year: 1985, cells: [210, 20, 220, 255] },
    { year: 1984, cells: [210, 210, 20, 255] },
  ],
};
const crosswalk: BoundaryCrosswalkInput = {
  schemaVersion: 1,
  grid,
  boundaryEdition: "fixture-boundaries-2026",
  boundaries: [
    { boundaryId: "b", geographyType: "province", province: "BC" },
    { boundaryId: "a", geographyType: "province", province: "AB" },
    { boundaryId: "r", geographyType: "federal-riding", province: "AB" },
  ],
  intersections: [
    { boundaryId: "a", cellIndex: 0, cellFraction: 1 },
    { boundaryId: "a", cellIndex: 1, cellFraction: 0.5 },
    { boundaryId: "b", cellIndex: 1, cellFraction: 0.5 },
    { boundaryId: "b", cellIndex: 2, cellFraction: 1 },
    { boundaryId: "r", cellIndex: 0, cellFraction: 1 },
  ],
};
const manifest: BaselineBatchManifest = {
  schemaVersion: 1,
  batchId: "fixture-1984-1985",
  methodVersion: "national-baseline-v1-fixture",
  forestDefinitionVersion: "nfi-v1-fixture-crosswalk",
  dataVersion: "fixture-v1",
  coverageGrade: "national-baseline",
  productionEligible: false,
  forestClassValues: [210, 220, 230],
  inputs: {
    landCover: { path: "land-cover.json", sha256: "a".repeat(64) },
    boundaryCrosswalk: { path: "boundary-crosswalk.json", sha256: "b".repeat(64) },
  },
};

test("builds deterministic forest masks and fractional boundary denominators", () => {
  const result = runBaselineBatch(manifest, landCover, crosswalk);
  assert.deepEqual(result.masks, [
    { year: 1984, cells: [1, 1, 0, 255] },
    { year: 1985, cells: [1, 0, 1, 255] },
  ]);
  assert.deepEqual(result.aggregates.map(({ boundaryId, year, forestedHectares }) => ({ boundaryId, year, forestedHectares })), [
    { boundaryId: "a", year: 1984, forestedHectares: 0.135 },
    { boundaryId: "b", year: 1984, forestedHectares: 0.045 },
    { boundaryId: "r", year: 1984, forestedHectares: 0.09 },
    { boundaryId: "a", year: 1985, forestedHectares: 0.09 },
    { boundaryId: "b", year: 1985, forestedHectares: 0.09 },
    { boundaryId: "r", year: 1985, forestedHectares: 0.09 },
  ]);
  assert.ok(result.aggregates.every((row) => row.denominator === "forested-hectares" && row.boundaryEdition === "fixture-boundaries-2026" && row.coverageGrade === "national-baseline"));
});

test("rejects grid drift, unsafe crosswalks, and production claims", () => {
  assert.throws(() => runBaselineBatch({ ...manifest, productionEligible: true as false }, landCover, crosswalk), /non-production/);
  assert.throws(() => runBaselineBatch(manifest, landCover, { ...crosswalk, grid: { ...grid, width: 3 } }), /exact land-cover grid/);
  assert.throws(() => runBaselineBatch(manifest, landCover, { ...crosswalk, intersections: [...crosswalk.intersections, crosswalk.intersections[0]!] }), /must be unique/);
  assert.throws(() => runBaselineBatch(manifest, { ...landCover, years: [landCover.years[0]!, { ...landCover.years[1]!, year: 1983 }] }, crosswalk), /continuous annual series/);
  assert.throws(() => runBaselineBatch({ ...manifest, forestClassValues: [255] }, landCover, crosswalk), /nodata value/);
  assert.throws(() => runBaselineBatch({ ...manifest, forestClassValues: [] }, landCover, crosswalk), /forest-class crosswalk/);
});

test("runner binds exact inputs, writes immutable deterministic outputs, and records lineage", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "witness-phase2-"));
  try {
    const landCoverBytes = stableJson(landCover);
    const crosswalkBytes = stableJson(crosswalk);
    const exactManifest: BaselineBatchManifest = {
      ...manifest,
      inputs: {
        landCover: { path: "land-cover.json", sha256: sha256(landCoverBytes) },
        boundaryCrosswalk: { path: "boundary-crosswalk.json", sha256: sha256(crosswalkBytes) },
      },
    };
    await Promise.all([
      writeFile(resolve(directory, "land-cover.json"), landCoverBytes),
      writeFile(resolve(directory, "boundary-crosswalk.json"), crosswalkBytes),
      writeFile(resolve(directory, "manifest.json"), stableJson(exactManifest)),
    ]);
    const output = resolve(directory, "output");
    await execute(resolve("node_modules/.bin/tsx"), [resolve("scripts/run-national-baseline-batch.mts"), resolve(directory, "manifest.json"), output]);
    const [maskBytes, aggregateBytes, lineageBytes] = await Promise.all([
      readFile(resolve(output, "forest-mask.json"), "utf8"),
      readFile(resolve(output, "forest-aggregates.json"), "utf8"),
      readFile(resolve(output, "lineage.json"), "utf8"),
    ]);
    const lineage = JSON.parse(lineageBytes) as { outputs: Record<string, string>; productionEligible: boolean };
    assert.equal(lineage.productionEligible, false);
    assert.equal(lineage.outputs["forest-mask.json"], sha256(maskBytes));
    assert.equal(lineage.outputs["forest-aggregates.json"], sha256(aggregateBytes));
    await assert.rejects(execute(resolve("node_modules/.bin/tsx"), [resolve("scripts/run-national-baseline-batch.mts"), resolve(directory, "manifest.json"), output]), /EEXIST/);

    await writeFile(resolve(directory, "land-cover.json"), `${landCoverBytes} `);
    await assert.rejects(execute(resolve("node_modules/.bin/tsx"), [resolve("scripts/run-national-baseline-batch.mts"), resolve(directory, "manifest.json"), resolve(directory, "other")]), /checksum mismatch/);
  } finally {
    await rm(directory, { recursive: true });
  }
});
