import assert from "node:assert/strict";
import test from "node:test";

import methodParametersJson from "../data/phase2-method-parameters.json";
import { PLACE_TYPES } from "../lib/places/types";
import { runBaselineBatch, type BaselineBatchManifest, type BoundaryCrosswalkInput, type LandCoverInput } from "../lib/pipeline/national-baseline-batch";
import { integrateSyntheticEvents, officialOverlaySha256, type SyntheticOfficialOverlay, type SyntheticOfficialRecord } from "../lib/pipeline/synthetic-event-integration";
import type { MethodParameterManifest } from "../lib/pipeline/method-manifest";

const method = methodParametersJson as MethodParameterManifest;
const grid = { crsId: "fixture-lcc", linearUnit: "metre", geotransform: [0, 30, 0, 60, 0, -30], width: 2, height: 2, noDataValue: 255 } as const;
const boundaries = PLACE_TYPES.map((geographyType) => ({ boundaryId: `boundary-${geographyType}`, geographyType, province: "BC" }));
const crosswalk: BoundaryCrosswalkInput = {
  schemaVersion: 1,
  grid,
  boundaryEdition: "fixture-all-eight-2026",
  boundaries,
  intersections: boundaries.flatMap((boundary) => [0, 1, 2, 3].map((cellIndex) => ({ boundaryId: boundary.boundaryId, cellIndex, cellFraction: 1 }))),
};
const landCover: LandCoverInput = { schemaVersion: 1, grid, years: [{ year: 1984, cells: [210, 210, 210, 210] }, { year: 1985, cells: [20, 20, 210, 210] }] };
const manifest: BaselineBatchManifest = {
  schemaVersion: 1,
  batchId: "integration-fixture",
  methodVersion: method.methodVersion,
  methodParameterSha256: method.parameterSha256,
  forestDefinitionVersion: "nfi-fixture-v1",
  dataVersion: "fixture-v1",
  coverageGrade: "national-baseline",
  productionEligible: false,
  forestClassValues: [210, 220, 230],
  inputs: {
    landCover: { path: "land.json", sha256: "a".repeat(64) },
    boundaryCrosswalk: { path: "boundaries.json", sha256: "b".repeat(64) },
    methodParameters: { path: "method.json", sha256: "c".repeat(64) },
  },
};
const baseline = runBaselineBatch(manifest, method, landCover, crosswalk);

function overlay(records: readonly SyntheticOfficialRecord[]): SyntheticOfficialOverlay {
  return { schemaVersion: 1, overlayId: "synthetic-official-v1", overlaySha256: officialOverlaySha256(records), productionEligible: false, records };
}

const fire: SyntheticOfficialRecord = { id: "fire-1985", kind: "fire", year: 1985, cellIndices: [0], sourceVersion: "fire-fixture-v1" };
const harvest: SyntheticOfficialRecord = { id: "harvest-1985", kind: "recorded-harvest", year: 1985, cellIndices: [0, 1], qualifyingRecordedHarvest: true, sourceVersion: "harvest-fixture-v1" };

test("integrates matching, precedence, all eight boundaries, first-year denominators, and full lineage", () => {
  const result = integrateSyntheticEvents({ manifest, method, grid, baseline, crosswalk, overlay: overlay([fire, harvest]), fromYear: 1984, toYear: 1985 });
  assert.equal(result.reviewStatus, "unapproved");
  assert.equal(result.productionEligible, false);
  assert.equal(result.events.length, 3);
  assert.deepEqual(result.events.map((event) => event.kind).sort(), ["detected-change", "fire", "recorded-harvest"]);
  assert.ok(result.events.every((event) => event.status === "example" && event.reviewStatus === "unapproved" && event.productionEligible === false && event.lineage.methodParameterSha256 === method.parameterSha256));
  assert.ok(result.events.every((event) => new Set(event.boundaryIntersections.map((intersection) => intersection.geographyType)).size === 8));
  const detected = result.events.find((event) => event.kind === "detected-change")!;
  assert.equal(detected.matching?.selectedMatch?.candidate.id, "fire-1985");
  assert.ok(detected.matching?.rejectedCandidates.some((candidate) => candidate.candidate.id === "harvest-1985" && candidate.reason === "lower-overlap-than-selected"));

  assert.equal(result.precedence.length, 2);
  assert.equal(result.precedence.find((item) => item.hectareYearId === "1985:0")?.winner?.kind, "fire");
  assert.equal(result.precedence.find((item) => item.hectareYearId === "1985:1")?.winner?.kind, "recorded-harvest");
  assert.equal(result.precedence.find((item) => item.hectareYearId === "1985:0")?.retainedEvidence.length, 2);

  assert.equal(result.aggregates.length, 8);
  assert.deepEqual(new Set(result.aggregates.map((aggregate) => aggregate.geographyType)), new Set(PLACE_TYPES));
  for (const aggregate of result.aggregates) {
    assert.equal(aggregate.denominator.referenceYear, 1984);
    assert.equal(aggregate.denominator.hectares, 0.36);
    assert.equal(aggregate.eventHectares, 0.18);
    assert.deepEqual(aggregate.shareOfFirstYearForest, { kind: "figure", percent: 50 });
    assert.equal(aggregate.winningEventIds.length, 2);
    assert.equal(new Set(aggregate.winningEventIds).size, 2);
    assert.equal(aggregate.lineage.baselineBatchId, manifest.batchId);
    assert.equal(aggregate.lineage.landCoverSha256, manifest.inputs.landCover.sha256);
    assert.equal(aggregate.lineage.boundaryCrosswalkSha256, manifest.inputs.boundaryCrosswalk.sha256);
    assert.equal(aggregate.lineage.officialOverlaySha256, overlay([fire, harvest]).overlaySha256);
    assert.match(aggregate.lineageSha256, /^[a-f0-9]{64}$/);
    assert.equal(aggregate.reviewStatus, "unapproved");
    assert.equal(aggregate.productionEligible, false);
  }
});

test("all fire/harvest cell combinations count each changed hectare-year exactly once", () => {
  const cells = (bits: number) => [0, 1, 2, 3].filter((cell) => ((bits >> cell) & 1) === 1);
  const allLossLandCover: LandCoverInput = { ...landCover, years: [{ year: 1984, cells: [210, 210, 210, 210] }, { year: 1985, cells: [20, 20, 20, 20] }] };
  const allLossBaseline = runBaselineBatch(manifest, method, allLossLandCover, crosswalk);
  for (let fireBits = 0; fireBits < 16; fireBits += 1) {
    for (let harvestBits = 0; harvestBits < 16; harvestBits += 1) {
      const records: SyntheticOfficialRecord[] = [];
      if (fireBits) records.push({ ...fire, cellIndices: cells(fireBits) });
      if (harvestBits) records.push({ ...harvest, cellIndices: cells(harvestBits) });
      const result = integrateSyntheticEvents({ manifest, method, grid, baseline: allLossBaseline, crosswalk, overlay: overlay(records), fromYear: 1984, toYear: 1985 });
      assert.equal(result.precedence.length, 4);
      assert.equal(new Set(result.precedence.map((item) => item.hectareYearId)).size, 4);
      assert.equal(result.aggregates[0]!.eventHectares, 0.36);
      for (const resolution of result.precedence) {
        const cell = Number(resolution.hectareYearId.split(":").at(-1));
        const expected = fireBits & (1 << cell) ? "fire" : harvestBits & (1 << cell) ? "recorded-harvest" : "unmatched-detected-change";
        assert.equal(resolution.winner?.kind, expected);
      }
    }
  }
});

test("fails closed on missing geography, corrupt overlay, unqualified harvest, missing denominator, and invalid range", () => {
  const validOverlay = overlay([fire, harvest]);
  assert.throws(() => integrateSyntheticEvents({ manifest, method, grid, baseline, crosswalk: { ...crosswalk, boundaries: crosswalk.boundaries.slice(1) }, overlay: validOverlay, fromYear: 1984, toYear: 1985 }), /all eight geography types/);
  assert.throws(() => integrateSyntheticEvents({ manifest, method, grid, baseline, crosswalk, overlay: { ...validOverlay, overlaySha256: "0".repeat(64) }, fromYear: 1984, toYear: 1985 }), /checksum/);
  const unqualified = [{ ...harvest, qualifyingRecordedHarvest: false }];
  assert.throws(() => integrateSyntheticEvents({ manifest, method, grid, baseline, crosswalk, overlay: overlay(unqualified), fromYear: 1984, toYear: 1985 }), /explicitly qualified/);
  assert.throws(() => integrateSyntheticEvents({ manifest, method, grid, baseline: { ...baseline, aggregates: baseline.aggregates.filter((row) => row.boundaryId !== boundaries[0]!.boundaryId) }, crosswalk, overlay: validOverlay, fromYear: 1984, toYear: 1985 }), /first-year forest denominator/);
  assert.throws(() => integrateSyntheticEvents({ manifest, method, grid, baseline, crosswalk, overlay: validOverlay, fromYear: 1985, toYear: 1984 }), /valid inclusive year range/);
  assert.throws(() => integrateSyntheticEvents({ manifest, method, grid: { ...grid, width: 3 }, baseline, crosswalk, overlay: validOverlay, fromYear: 1984, toYear: 1985 }), /exact baseline grid/);
  assert.throws(() => integrateSyntheticEvents({ manifest, method, grid, baseline: { ...baseline, aggregates: baseline.aggregates.map((row, index) => index === 0 ? { ...row, dataVersion: "drift" } : row) }, crosswalk, overlay: validOverlay, fromYear: 1984, toYear: 1985 }), /aggregate lineage/);
  const duplicateCells = [{ ...fire, cellIndices: [0, 0] }];
  assert.throws(() => integrateSyntheticEvents({ manifest, method, grid, baseline, crosswalk, overlay: overlay(duplicateCells), fromYear: 1984, toYear: 1985 }), /unique in-grid cells/);
  const impossibleYear = [{ ...fire, year: 1983 }];
  assert.throws(() => integrateSyntheticEvents({ manifest, method, grid, baseline, crosswalk, overlay: overlay(impossibleYear), fromYear: 1984, toYear: 1985 }), /valid year/);
  const driftedMethod = { ...method, parameters: { ...method.parameters, aggregation: { ...method.parameters.aggregation, decimalPlaces: 5 } } };
  assert.throws(() => integrateSyntheticEvents({ manifest, method: driftedMethod, grid, baseline, crosswalk, overlay: validOverlay, fromYear: 1984, toYear: 1985 }), /parameter SHA-256/);
});

test("a zero first-year forest denominator produces an explicit unknown rate", () => {
  const noForest: LandCoverInput = { ...landCover, years: [{ year: 1984, cells: [20, 20, 20, 20] }, { year: 1985, cells: [20, 20, 20, 20] }] };
  const noForestBaseline = runBaselineBatch(manifest, method, noForest, crosswalk);
  const result = integrateSyntheticEvents({ manifest, method, grid, baseline: noForestBaseline, crosswalk, overlay: overlay([]), fromYear: 1984, toYear: 1985 });
  assert.ok(result.aggregates.every((aggregate) => aggregate.denominator.hectares === 0 && aggregate.eventHectares === 0 && aggregate.shareOfFirstYearForest.kind === "unknown"));
});
