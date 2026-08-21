import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import methodParametersJson from "../data/phase2-method-parameters.json";
import { PLACE_TYPES } from "../lib/places/types";
import { boundaryCrosswalkSha256, sha256, stableJson, type BaselineBatchManifest, type BoundaryCrosswalkInput, type LandCoverInput } from "../lib/pipeline/national-baseline-batch";
import type { MethodParameterManifest } from "../lib/pipeline/method-manifest";
import { officialOverlaySha256, type SyntheticOfficialOverlay, type SyntheticOfficialRecord } from "../lib/pipeline/synthetic-event-integration";
import { queryPersistedBoundaryYearLineage, queryPersistedEventById, readbackSyntheticBatchOutput, replayPersistedAggregate } from "../lib/pipeline/synthetic-output-readback";

const execute = promisify(execFile);
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
const records: readonly SyntheticOfficialRecord[] = [
  { id: "fire-1985", kind: "fire", year: 1985, cellIndices: [0], sourceVersion: "fire-fixture-v1" },
  { id: "harvest-1985", kind: "recorded-harvest", year: 1985, cellIndices: [1], qualifyingRecordedHarvest: true, sourceVersion: "harvest-fixture-v1" },
];

type MutableAggregate = {
  winningEventIds: string[];
  contributions: Array<{ intersectedHectares: number }>;
  timeRange: { fromYear: number };
  lineage: {
    winningEventIds: string[];
    contributions: Array<{ intersectedHectares: number }>;
    fromYear: number;
  };
  lineageSha256: string;
};
type MutableOutputDocument = { productionEligible?: boolean; aggregates?: MutableAggregate[] };

async function createOutput(root: string): Promise<string> {
  const landCoverBytes = stableJson(landCover);
  const crosswalkBytes = stableJson(crosswalk);
  const methodBytes = stableJson(method);
  const manifest: BaselineBatchManifest = {
    schemaVersion: 1,
    batchId: "readback-fixture",
    methodVersion: method.methodVersion,
    methodParameterSha256: method.parameterSha256,
    forestDefinitionVersion: "nfi-fixture-v1",
    dataVersion: "fixture-v1",
    coverageGrade: "national-baseline",
    productionEligible: false,
    forestClassValues: [210, 220, 230],
    inputs: {
      landCover: { path: "land-cover.json", sha256: sha256(landCoverBytes) },
      boundaryCrosswalk: { path: "boundary-crosswalk.json", sha256: boundaryCrosswalkSha256(crosswalk) },
      methodParameters: { path: "method-parameters.json", sha256: sha256(methodBytes) },
    },
  };
  const overlayId = "readback-overlay-v1";
  const overlay: SyntheticOfficialOverlay = { schemaVersion: 1, overlayId, overlaySha256: officialOverlaySha256(overlayId, records), productionEligible: false, records };
  await Promise.all([
    writeFile(resolve(root, "land-cover.json"), landCoverBytes),
    writeFile(resolve(root, "boundary-crosswalk.json"), crosswalkBytes),
    writeFile(resolve(root, "method-parameters.json"), methodBytes),
    writeFile(resolve(root, "manifest.json"), stableJson(manifest)),
    writeFile(resolve(root, "overlay.json"), stableJson(overlay)),
  ]);
  const output = resolve(root, "output");
  await execute(resolve("node_modules/.bin/tsx"), [resolve("scripts/run-national-baseline-batch.mts"), resolve(root, "manifest.json"), output, resolve(root, "overlay.json"), "1984", "1985"]);
  return output;
}

async function rewriteJson(directory: string, name: string, mutate: (value: MutableOutputDocument) => void): Promise<void> {
  const path = resolve(directory, name);
  const value = JSON.parse(await readFile(path, "utf8"));
  mutate(value);
  const bytes = stableJson(value);
  await writeFile(path, bytes);
  const lineagePath = resolve(directory, "lineage.json");
  const lineage = JSON.parse(await readFile(lineagePath, "utf8"));
  lineage.outputs[name] = sha256(bytes);
  await writeFile(lineagePath, stableJson(lineage));
}

test("readback verifies persisted outputs and deterministic event, boundary/year, and aggregate replay", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "witness-phase2-readback-"));
  try {
    const output = await createOutput(root);
    const first = await readbackSyntheticBatchOutput(output);
    const second = await readbackSyntheticBatchOutput(output);
    assert.deepEqual(first, second);
    assert.equal(first.integration.aggregates.length, 8);
    assert.deepEqual(new Set(first.integration.aggregates.map((aggregate) => aggregate.geographyType)), new Set(PLACE_TYPES));
    const eventId = first.integration.events[0]!.eventId;
    assert.deepEqual(queryPersistedEventById(first, eventId), queryPersistedEventById(second, eventId));
    assert.equal(queryPersistedEventById(first, "missing"), null);
    const boundaryId = first.integration.aggregates[0]!.boundaryId;
    const query = queryPersistedBoundaryYearLineage(first, boundaryId, 1984);
    assert.equal(query.baseline?.year, 1984);
    assert.equal(query.aggregates.length, 1);
    const replay = replayPersistedAggregate(first, boundaryId, 1984, 1985);
    assert.match(replay.replaySha256, /^[a-f0-9]{64}$/);
    assert.ok(replay.events.every((event) => replay.aggregate.winningEventIds.includes(event.eventId) || replay.aggregate.retainedEvidenceIds.includes(event.eventId)));
  } finally {
    await rm(root, { recursive: true });
  }
});

test("readback fails closed on inventory, checksum, referential, reconstruction, range, and status corruption", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "witness-phase2-readback-negative-"));
  try {
    const output = await createOutput(root);
    const scenario = async (name: string): Promise<string> => {
      const directory = resolve(root, name);
      await cp(output, directory, { recursive: true });
      return directory;
    };

    const byteDrift = await scenario("byte-drift");
    await writeFile(resolve(byteDrift, "synthetic-integrated-events.json"), `${await readFile(resolve(byteDrift, "synthetic-integrated-events.json"), "utf8")} `);
    await assert.rejects(readbackSyntheticBatchOutput(byteDrift), /checksum mismatch/);

    const omitted = await scenario("omitted");
    await rm(resolve(omitted, "synthetic-precedence.json"));
    await assert.rejects(readbackSyntheticBatchOutput(omitted), /exact declared file set/);

    const extra = await scenario("extra");
    await writeFile(resolve(extra, "extra.json"), "{}\n");
    await assert.rejects(readbackSyntheticBatchOutput(extra), /exact declared file set/);

    const missingAggregate = await scenario("missing-aggregate");
    await rewriteJson(missingAggregate, "synthetic-integrated-aggregates.json", (value) => value.aggregates!.pop());
    await assert.rejects(readbackSyntheticBatchOutput(missingAggregate), /all-eight geography coverage/);

    const duplicateAggregate = await scenario("duplicate-aggregate");
    await rewriteJson(duplicateAggregate, "synthetic-integrated-aggregates.json", (value) => value.aggregates!.push(value.aggregates![0]!));
    await assert.rejects(readbackSyntheticBatchOutput(duplicateAggregate), /unique boundary\/range identity/);

    const brokenEvent = await scenario("broken-event");
    await rewriteJson(brokenEvent, "synthetic-integrated-aggregates.json", (value) => {
      const aggregate = value.aggregates![0]!;
      aggregate.winningEventIds = ["missing-event"];
      aggregate.lineage.winningEventIds = ["missing-event"];
      aggregate.lineageSha256 = sha256(stableJson(aggregate.lineage));
    });
    await assert.rejects(readbackSyntheticBatchOutput(brokenEvent), /resolve to emitted/);

    const contribution = await scenario("contribution");
    await rewriteJson(contribution, "synthetic-integrated-aggregates.json", (value) => {
      const aggregate = value.aggregates![0]!;
      aggregate.contributions[0].intersectedHectares = 99;
      aggregate.lineage.contributions[0].intersectedHectares = 99;
      aggregate.lineageSha256 = sha256(stableJson(aggregate.lineage));
    });
    await assert.rejects(readbackSyntheticBatchOutput(contribution), /contributions|reconstruct/);

    const range = await scenario("range");
    await rewriteJson(range, "synthetic-integrated-aggregates.json", (value) => {
      const aggregate = value.aggregates![0]!;
      aggregate.timeRange.fromYear = 1985;
      aggregate.lineage.fromYear = 1985;
      aggregate.lineageSha256 = sha256(stableJson(aggregate.lineage));
    });
    await assert.rejects(readbackSyntheticBatchOutput(range), /denominator|range/);

    const falseProduction = await scenario("false-production");
    await rewriteJson(falseProduction, "synthetic-integrated-events.json", (value) => { value.productionEligible = true; });
    await assert.rejects(readbackSyntheticBatchOutput(falseProduction), /non-production status/);
  } finally {
    await rm(root, { recursive: true });
  }
});
