import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import methodParametersJson from "../data/phase2-method-parameters.json";
import {
  buildDetectedChangeSpine,
  runBaselineBatch,
  sha256,
  stableJson,
  validateDetectedChangeGeometry,
  type BaselineBatchManifest,
  type BoundaryCrosswalkInput,
  type LandCoverInput,
} from "../lib/pipeline/national-baseline-batch";
import type { MethodParameterManifest } from "../lib/pipeline/method-manifest";

const execute = promisify(execFile);
const methodParameters = methodParametersJson as MethodParameterManifest;
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
  methodVersion: methodParameters.methodVersion,
  methodParameterSha256: methodParameters.parameterSha256,
  forestDefinitionVersion: "nfi-v1-fixture-crosswalk",
  dataVersion: "fixture-v1",
  coverageGrade: "national-baseline",
  productionEligible: false,
  forestClassValues: [210, 220, 230],
  inputs: {
    landCover: { path: "land-cover.json", sha256: "a".repeat(64) },
    boundaryCrosswalk: { path: "boundary-crosswalk.json", sha256: "b".repeat(64) },
    methodParameters: { path: "method-parameters.json", sha256: "c".repeat(64) },
  },
};

test("builds deterministic forest masks and fractional boundary denominators", () => {
  const result = runBaselineBatch(manifest, methodParameters, landCover, crosswalk);
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
  assert.equal(result.detectedChange.length, 1);
});

test("vectorizes four-neighbour losses into stable normalized patches with exact cell lineage", () => {
  const masks = [
    { year: 1984, cells: [1, 1, 1, 255, 1, 1] as const },
    { year: 1985, cells: [0, 0, 1, 255, 1, 0] as const },
  ];
  const rectangularGrid = { ...grid, width: 3 } as const;
  const first = buildDetectedChangeSpine(manifest, methodParameters, rectangularGrid, masks);
  const second = buildDetectedChangeSpine(manifest, methodParameters, rectangularGrid, [...masks].reverse());
  assert.deepEqual(first, second);
  assert.deepEqual(first[0]!.events.map((event) => event.cellIndices), [[0, 1], [5]]);
  assert.deepEqual(first[0]!.events.map((event) => event.areaHectares), [0.18, 0.09]);
  assert.deepEqual(first[0]!.unresolvedNodataCellIndices, [3]);
  for (const event of first[0]!.events) {
    assert.match(event.eventId, new RegExp(`^detected-change-1985-[a-f0-9]{24}$`));
    assert.match(event.patchChecksumSha256, /^[a-f0-9]{64}$/);
    assert.equal(event.geometry.coordinates.length, event.cellIndices.length);
    assert.equal(event.status, "example");
    assert.equal(event.productionEligible, false);
    assert.equal(event.lineage.batchId, manifest.batchId);
    assert.equal(event.lineage.fromYear, 1984);
    assert.equal(event.lineage.toYear, 1985);
    assert.match(event.lineage.fromMaskSha256, /^[a-f0-9]{64}$/);
    assert.match(event.lineage.toMaskSha256, /^[a-f0-9]{64}$/);
    assert.equal(event.lineage.fromMaskValue, 1);
    assert.equal(event.lineage.toMaskValue, 0);
  }
});

test("change spine rejects corrupt values and year gaps while nodata never becomes loss", () => {
  assert.throws(() => buildDetectedChangeSpine(manifest, methodParameters, grid, [{ year: 1984, cells: [1, 1, 1, 1] }, { year: 1986, cells: [0, 0, 0, 0] }]), /continuous annual series/);
  assert.throws(() => buildDetectedChangeSpine(manifest, methodParameters, grid, [{ year: 1984, cells: [1, 2 as 0, 1, 1] }]), /valid value/);
  assert.throws(() => buildDetectedChangeSpine(manifest, methodParameters, grid, [{ year: 1984, cells: [1, 1, 1] }]), /one valid value per grid cell/);
  const result = buildDetectedChangeSpine(manifest, methodParameters, grid, [
    { year: 1984, cells: [1, 255, 1, 0] },
    { year: 1985, cells: [255, 0, 1, 1] },
  ]);
  assert.equal(result[0]!.events.length, 0);
  assert.deepEqual(result[0]!.unresolvedNodataCellIndices, [0, 1]);
  assert.throws(() => validateDetectedChangeGeometry({ type: "MultiPolygon", crsId: "fixture", coordinates: [[[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]]] }, 1), /grid rectangle/);
});

test("all 2x2 mask pairs assign every valid loss cell to exactly one patch", () => {
  const values = (bits: number) => Array.from({ length: 4 }, (_, index) => ((bits >> index) & 1) as 0 | 1);
  for (let fromBits = 0; fromBits < 16; fromBits += 1) {
    for (let toBits = 0; toBits < 16; toBits += 1) {
      const from = values(fromBits);
      const to = values(toBits);
      const result = buildDetectedChangeSpine(manifest, methodParameters, grid, [{ year: 1984, cells: from }, { year: 1985, cells: to }]);
      const observed = result[0]!.events.flatMap((event) => event.cellIndices).sort((a, b) => a - b);
      const expected = from.flatMap((value, index) => value === 1 && to[index] === 0 ? [index] : []);
      assert.deepEqual(observed, expected);
      assert.equal(new Set(observed).size, observed.length);
      assert.equal(result[0]!.events.reduce((sum, event) => sum + event.areaHectares, 0), expected.length * 0.09);
    }
  }
});

test("rejects grid drift, unsafe crosswalks, and production claims", () => {
  assert.throws(() => runBaselineBatch({ ...manifest, productionEligible: true as false }, methodParameters, landCover, crosswalk), /non-production/);
  assert.throws(() => runBaselineBatch(manifest, methodParameters, landCover, { ...crosswalk, grid: { ...grid, width: 3 } }), /exact land-cover grid/);
  assert.throws(() => runBaselineBatch(manifest, methodParameters, landCover, { ...crosswalk, intersections: [...crosswalk.intersections, crosswalk.intersections[0]!] }), /must be unique/);
  assert.throws(() => runBaselineBatch(manifest, methodParameters, { ...landCover, years: [landCover.years[0]!, { ...landCover.years[1]!, year: 1983 }] }, crosswalk), /continuous annual series/);
  assert.throws(() => runBaselineBatch({ ...manifest, forestClassValues: [255] }, methodParameters, landCover, crosswalk), /crosswalk/);
  assert.throws(() => runBaselineBatch({ ...manifest, forestClassValues: [] }, methodParameters, landCover, crosswalk), /forest-class crosswalk/);
  assert.throws(() => runBaselineBatch({ ...manifest, methodParameterSha256: "0".repeat(64) }, methodParameters, landCover, crosswalk), /exact validated method/);
});

test("runner binds exact inputs, writes immutable deterministic outputs, and records lineage", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "witness-phase2-"));
  try {
    const landCoverBytes = stableJson(landCover);
    const crosswalkBytes = stableJson(crosswalk);
    const methodBytes = stableJson(methodParameters);
    const exactManifest: BaselineBatchManifest = {
      ...manifest,
      inputs: {
        landCover: { path: "land-cover.json", sha256: sha256(landCoverBytes) },
        boundaryCrosswalk: { path: "boundary-crosswalk.json", sha256: sha256(crosswalkBytes) },
        methodParameters: { path: "method-parameters.json", sha256: sha256(methodBytes) },
      },
    };
    await Promise.all([
      writeFile(resolve(directory, "land-cover.json"), landCoverBytes),
      writeFile(resolve(directory, "boundary-crosswalk.json"), crosswalkBytes),
      writeFile(resolve(directory, "method-parameters.json"), methodBytes),
      writeFile(resolve(directory, "manifest.json"), stableJson(exactManifest)),
    ]);
    const output = resolve(directory, "output");
    await execute(resolve("node_modules/.bin/tsx"), [resolve("scripts/run-national-baseline-batch.mts"), resolve(directory, "manifest.json"), output]);
    const [maskBytes, aggregateBytes, detectedChangeBytes, lineageBytes] = await Promise.all([
      readFile(resolve(output, "forest-mask.json"), "utf8"),
      readFile(resolve(output, "forest-aggregates.json"), "utf8"),
      readFile(resolve(output, "detected-change-events.json"), "utf8"),
      readFile(resolve(output, "lineage.json"), "utf8"),
    ]);
    const lineage = JSON.parse(lineageBytes) as { outputs: Record<string, string>; productionEligible: boolean };
    assert.equal(lineage.productionEligible, false);
    assert.equal(lineage.outputs["forest-mask.json"], sha256(maskBytes));
    assert.equal(lineage.outputs["forest-aggregates.json"], sha256(aggregateBytes));
    assert.equal(lineage.outputs["detected-change-events.json"], sha256(detectedChangeBytes));
    await assert.rejects(execute(resolve("node_modules/.bin/tsx"), [resolve("scripts/run-national-baseline-batch.mts"), resolve(directory, "manifest.json"), output]), /EEXIST/);

    await writeFile(resolve(directory, "land-cover.json"), `${landCoverBytes} `);
    await assert.rejects(execute(resolve("node_modules/.bin/tsx"), [resolve("scripts/run-national-baseline-batch.mts"), resolve(directory, "manifest.json"), resolve(directory, "other")]), /checksum mismatch/);
  } finally {
    await rm(directory, { recursive: true });
  }
});
