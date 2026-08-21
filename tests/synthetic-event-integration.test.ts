import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import methodParametersJson from "../data/phase2-method-parameters.json";
import { PLACE_TYPES } from "../lib/places/types";
import { boundaryCrosswalkSha256, runBaselineBatch, sha256, stableJson, type BaselineBatchManifest, type BoundaryCrosswalkInput, type LandCoverInput } from "../lib/pipeline/national-baseline-batch";
import { integrateSyntheticEvents, officialOverlaySha256, validateSyntheticIntegrationResult, type SyntheticOfficialOverlay, type SyntheticOfficialRecord } from "../lib/pipeline/synthetic-event-integration";
import type { MethodParameterManifest } from "../lib/pipeline/method-manifest";

const method = methodParametersJson as MethodParameterManifest;
const execute = promisify(execFile);
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
    boundaryCrosswalk: { path: "boundaries.json", sha256: boundaryCrosswalkSha256(crosswalk) },
    methodParameters: { path: "method.json", sha256: "c".repeat(64) },
  },
};
const baseline = runBaselineBatch(manifest, method, landCover, crosswalk);

function overlay(records: readonly SyntheticOfficialRecord[]): SyntheticOfficialOverlay {
  const overlayId = "synthetic-official-v1";
  return { schemaVersion: 1, overlayId, overlaySha256: officialOverlaySha256(overlayId, records), productionEligible: false, records };
}

const fire: SyntheticOfficialRecord = { id: "fire-1985", kind: "fire", year: 1985, cellIndices: [0], sourceVersion: "fire-fixture-v1" };
const harvest: SyntheticOfficialRecord = { id: "harvest-1985", kind: "recorded-harvest", year: 1985, cellIndices: [0, 1], qualifyingRecordedHarvest: true, sourceVersion: "harvest-fixture-v1" };

test("integrates matching, precedence, all eight boundaries, first-year denominators, and full lineage", () => {
  const reorderedCrosswalk = { intersections: crosswalk.intersections, boundaries: crosswalk.boundaries, boundaryEdition: crosswalk.boundaryEdition, grid: crosswalk.grid, schemaVersion: crosswalk.schemaVersion } as const;
  assert.equal(boundaryCrosswalkSha256(reorderedCrosswalk), boundaryCrosswalkSha256(crosswalk));
  assert.equal(officialOverlaySha256("synthetic-official-v1", [{ sourceVersion: fire.sourceVersion, cellIndices: fire.cellIndices, year: fire.year, kind: fire.kind, id: fire.id }]), officialOverlaySha256("synthetic-official-v1", [fire]));
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
    assert.ok(aggregate.winningEventIds.every((id) => result.events.some((event) => event.eventId === id)));
    assert.ok(aggregate.retainedEvidenceIds.every((id) => result.events.some((event) => event.eventId === id)));
    assert.equal(aggregate.contributions.reduce((sum, contribution) => sum + contribution.intersectedHectares, 0), aggregate.eventHectares);
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
  assert.throws(() => integrateSyntheticEvents({ manifest, method, grid, baseline, crosswalk, overlay: { ...validOverlay, overlayId: "changed-overlay-id" }, fromYear: 1984, toYear: 1985 }), /checksum/);
  assert.throws(() => integrateSyntheticEvents({ manifest: { ...manifest, inputs: { ...manifest.inputs, boundaryCrosswalk: { ...manifest.inputs.boundaryCrosswalk, sha256: "b".repeat(64) } } }, method, grid, baseline, crosswalk, overlay: validOverlay, fromYear: 1984, toYear: 1985 }), /crosswalk checksum mismatch/);
  const changedCrosswalk = { ...crosswalk, intersections: crosswalk.intersections.map((row, index) => index === 0 ? { ...row, cellFraction: 0.5 } : row) };
  assert.throws(() => integrateSyntheticEvents({ manifest, method, grid, baseline, crosswalk: changedCrosswalk, overlay: validOverlay, fromYear: 1984, toYear: 1985 }), /crosswalk checksum mismatch/);
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
  assert.throws(() => integrateSyntheticEvents({ manifest, method, grid, baseline, crosswalk, overlay: validOverlay, fromYear: 1983, toYear: 1985 }), /within mask coverage/);
  assert.throws(() => integrateSyntheticEvents({ manifest, method, grid, baseline, crosswalk, overlay: validOverlay, fromYear: 1984, toYear: 1986 }), /within mask coverage/);
  const valid = integrateSyntheticEvents({ manifest, method, grid, baseline, crosswalk, overlay: validOverlay, fromYear: 1984, toYear: 1985 });
  const corruptedAggregate = { ...valid.aggregates[0]!, winningEventIds: ["missing-event"] };
  assert.throws(() => validateSyntheticIntegrationResult({ ...valid, aggregates: [corruptedAggregate, ...valid.aggregates.slice(1)] }), /resolve to emitted/);
  const corruptedContribution = { ...valid.aggregates[0]!.contributions[0]!, intersectedHectares: 99 };
  const corruptedContributions = [{ ...valid.aggregates[0]!, contributions: [corruptedContribution, ...valid.aggregates[0]!.contributions.slice(1)] }, ...valid.aggregates.slice(1)];
  assert.throws(() => validateSyntheticIntegrationResult({ ...valid, aggregates: corruptedContributions }), /contributions|reconstruct exactly|lineage/);
  assert.throws(() => validateSyntheticIntegrationResult({ ...valid, precedenceEventMap: valid.precedenceEventMap.slice(1) }), /complete deterministic mapping/);
  assert.throws(() => integrateSyntheticEvents({ manifest, method, grid, baseline: { ...baseline, masks: [{ ...baseline.masks[0]!, year: 1983 }, baseline.masks[1]!] }, crosswalk, overlay: validOverlay, fromYear: 1983, toYear: 1985 }), /continuous unique annual mask coverage/);
});

test("a zero first-year forest denominator produces an explicit unknown rate", () => {
  const noForest: LandCoverInput = { ...landCover, years: [{ year: 1984, cells: [20, 20, 20, 20] }, { year: 1985, cells: [20, 20, 20, 20] }] };
  const noForestBaseline = runBaselineBatch(manifest, method, noForest, crosswalk);
  const result = integrateSyntheticEvents({ manifest, method, grid, baseline: noForestBaseline, crosswalk, overlay: overlay([]), fromYear: 1984, toYear: 1985 });
  assert.ok(result.aggregates.every((aggregate) => aggregate.denominator.hectares === 0 && aggregate.eventHectares === 0 && aggregate.shareOfFirstYearForest.kind === "unknown"));
});

test("multi-year fractional aggregates reconstruct all five registered precedence kinds", () => {
  const wideGrid = { ...grid, geotransform: [0, 30, 0, 30, 0, -30] as const, width: 5, height: 1 };
  const wideBoundaries = PLACE_TYPES.map((geographyType) => ({ boundaryId: `wide-${geographyType}`, geographyType, province: "BC" }));
  const wideCrosswalk: BoundaryCrosswalkInput = {
    schemaVersion: 1,
    grid: wideGrid,
    boundaryEdition: "fixture-fractional-all-eight-2026",
    boundaries: wideBoundaries,
    intersections: wideBoundaries.flatMap((boundary, boundaryIndex) => Array.from({ length: 5 }, (_, cellIndex) => ({ boundaryId: boundary.boundaryId, cellIndex, cellFraction: ((cellIndex + boundaryIndex) % 4 + 1) / 4 }))),
  };
  const wideManifest: BaselineBatchManifest = {
    ...manifest,
    batchId: "integration-multi-year-fixture",
    inputs: { ...manifest.inputs, boundaryCrosswalk: { ...manifest.inputs.boundaryCrosswalk, sha256: boundaryCrosswalkSha256(wideCrosswalk) } },
  };
  const wideLandCover: LandCoverInput = {
    schemaVersion: 1,
    grid: wideGrid,
    years: [
      { year: 1984, cells: [210, 210, 210, 210, 210] },
      { year: 1985, cells: [20, 20, 20, 210, 210] },
      { year: 1986, cells: [20, 20, 20, 20, 20] },
    ],
  };
  const wideBaseline = runBaselineBatch(wideManifest, method, wideLandCover, wideCrosswalk);
  const records: SyntheticOfficialRecord[] = [
    { id: "fire-wide", kind: "fire", year: 1985, cellIndices: [0], sourceVersion: "fire-fixture-v1" },
    { id: "harvest-wide", kind: "recorded-harvest", year: 1985, cellIndices: [1], qualifyingRecordedHarvest: true, sourceVersion: "harvest-fixture-v1" },
    { id: "insect-wide", kind: "insect-disease", year: 1985, cellIndices: [2], sourceVersion: "insect-fixture-v1" },
    { id: "intervention-wide", kind: "other-intervention", year: 1986, cellIndices: [3], sourceVersion: "intervention-fixture-v1" },
  ];
  const result = integrateSyntheticEvents({ manifest: wideManifest, method, grid: wideGrid, baseline: wideBaseline, crosswalk: wideCrosswalk, overlay: overlay(records), fromYear: 1984, toYear: 1986 });
  assert.deepEqual(new Set(result.precedence.map((resolution) => resolution.winner?.kind)), new Set(["fire", "recorded-harvest", "insect-disease", "other-intervention", "unmatched-detected-change"]));
  for (const aggregate of result.aggregates) {
    const expected = Number((wideCrosswalk.intersections.filter((row) => row.boundaryId === aggregate.boundaryId).reduce((sum, row) => sum + row.cellFraction * 0.09, 0)).toFixed(6));
    assert.equal(aggregate.eventHectares, expected);
    assert.equal(aggregate.denominator.hectares, expected);
    assert.equal(aggregate.contributions.length, 5);
    assert.equal(Number(aggregate.contributions.reduce((sum, contribution) => sum + contribution.intersectedHectares, 0).toFixed(6)), expected);
    assert.ok(aggregate.winningEventIds.every((id) => result.events.some((event) => event.eventId === id)));
  }
});

test("runner persists deterministic checksum-bound synthetic outputs once with lineage", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "witness-phase2-integration-"));
  try {
    const landCoverBytes = stableJson(landCover);
    const crosswalkBytes = stableJson(crosswalk);
    const methodBytes = stableJson(method);
    const exactManifest: BaselineBatchManifest = {
      ...manifest,
      inputs: {
        landCover: { path: "land-cover.json", sha256: sha256(landCoverBytes) },
        boundaryCrosswalk: { path: "boundary-crosswalk.json", sha256: boundaryCrosswalkSha256(crosswalk) },
        methodParameters: { path: "method-parameters.json", sha256: sha256(methodBytes) },
      },
    };
    const exactOverlay = overlay([fire, harvest]);
    await Promise.all([
      writeFile(resolve(directory, "land-cover.json"), landCoverBytes),
      writeFile(resolve(directory, "boundary-crosswalk.json"), crosswalkBytes),
      writeFile(resolve(directory, "method-parameters.json"), methodBytes),
      writeFile(resolve(directory, "manifest.json"), stableJson(exactManifest)),
      writeFile(resolve(directory, "overlay.json"), stableJson(exactOverlay)),
    ]);
    const runner = resolve("scripts/run-national-baseline-batch.mts");
    const firstOutput = resolve(directory, "first-output");
    const secondOutput = resolve(directory, "second-output");
    const argumentsFor = (output: string) => [runner, resolve(directory, "manifest.json"), output, resolve(directory, "overlay.json"), "1984", "1985"];
    await execute(resolve("node_modules/.bin/tsx"), argumentsFor(firstOutput));
    await execute(resolve("node_modules/.bin/tsx"), argumentsFor(secondOutput));
    const names = ["synthetic-integrated-events.json", "synthetic-integrated-aggregates.json", "synthetic-precedence.json", "lineage.json"];
    const firstBytes = await Promise.all(names.map((name) => readFile(resolve(firstOutput, name), "utf8")));
    const secondBytes = await Promise.all(names.map((name) => readFile(resolve(secondOutput, name), "utf8")));
    assert.deepEqual(firstBytes, secondBytes);
    const lineage = JSON.parse(firstBytes.at(-1)!) as { reviewStatus: string; productionEligible: boolean; syntheticIntegration: { overlayId: string; overlaySha256: string }; outputs: Record<string, string> };
    assert.equal(lineage.reviewStatus, "unapproved");
    assert.equal(lineage.productionEligible, false);
    assert.equal(lineage.syntheticIntegration.overlayId, exactOverlay.overlayId);
    assert.equal(lineage.syntheticIntegration.overlaySha256, exactOverlay.overlaySha256);
    names.slice(0, -1).forEach((name, index) => assert.equal(lineage.outputs[name], sha256(firstBytes[index]!)));
    await assert.rejects(execute(resolve("node_modules/.bin/tsx"), argumentsFor(firstOutput)), /EEXIST/);
  } finally {
    await rm(directory, { recursive: true });
  }
});
