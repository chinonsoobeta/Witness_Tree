import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PLACE_TYPES } from "../places/types";
import { sha256, stableJson, type BaselineBatchResult, type ForestAggregate } from "./national-baseline-batch";
import { validateSyntheticIntegrationResult, type IntegratedAggregate, type IntegratedEvent, type SyntheticIntegrationResult } from "./synthetic-event-integration";

const SHA256 = /^[a-f0-9]{64}$/;
const OUTPUT_FILES = [
  "detected-change-events.json",
  "forest-aggregates.json",
  "forest-mask.json",
  "synthetic-integrated-aggregates.json",
  "synthetic-integrated-events.json",
  "synthetic-precedence.json",
] as const;

type OutputFile = (typeof OUTPUT_FILES)[number];
type OutputEnvelope<T> = Readonly<{ schemaVersion: 1; batchId: string; status: "example"; reviewStatus: "unapproved"; productionEligible: false } & T>;
type OutputLineage = Readonly<{
  schemaVersion: 1;
  batchId: string;
  status: "example";
  reviewStatus: "unapproved";
  productionEligible: false;
  manifestSha256: string;
  inputs: Readonly<Record<string, Readonly<{ path: string; sha256: string }>>>;
  syntheticIntegration: Readonly<{ overlayId: string; overlaySha256: string; fromYear: number; toYear: number; reviewStatus: "unapproved"; productionEligible: false }>;
  outputs: Readonly<Record<OutputFile, string>>;
}>;

export type SyntheticOutputReadback = Readonly<{
  directory: string;
  lineage: OutputLineage;
  baseline: BaselineBatchResult;
  integration: SyntheticIntegrationResult;
}>;

function parsed<T>(bytes: string, name: string): T {
  try {
    return JSON.parse(bytes) as T;
  } catch {
    throw new Error(`Persisted Phase 2 output ${name} is not valid JSON.`);
  }
}

function labels(value: { schemaVersion?: unknown; batchId?: unknown; status?: unknown; reviewStatus?: unknown; productionEligible?: unknown }, batchId: string, name: string): void {
  if (value.schemaVersion !== 1 || value.batchId !== batchId || value.status !== "example" || value.reviewStatus !== "unapproved" || value.productionEligible !== false) {
    throw new Error(`Persisted Phase 2 output ${name} requires exact batch identity and example, unapproved, non-production status.`);
  }
}

function sameValues(first: readonly string[], second: readonly string[]): boolean {
  return first.length === second.length && first.every((value, index) => value === second[index]);
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export async function readbackSyntheticBatchOutput(directoryArgument: string): Promise<SyntheticOutputReadback> {
  const directory = resolve(directoryArgument);
  const entries = await readdir(directory, { withFileTypes: true });
  const actualFiles = entries.map((entry) => entry.name).sort();
  const expectedFiles = [...OUTPUT_FILES, "lineage.json"].sort();
  if (entries.some((entry) => !entry.isFile()) || !sameValues(actualFiles, expectedFiles)) throw new Error("Persisted Phase 2 output requires its exact declared file set with no missing, extra, or non-file entries.");

  const lineageBytes = await readFile(resolve(directory, "lineage.json"), "utf8");
  const lineage = parsed<OutputLineage>(lineageBytes, "lineage.json");
  if (lineage.schemaVersion !== 1 || !lineage.batchId?.trim() || lineage.status !== "example" || lineage.reviewStatus !== "unapproved" || lineage.productionEligible !== false || !SHA256.test(lineage.manifestSha256) || lineage.syntheticIntegration?.reviewStatus !== "unapproved" || lineage.syntheticIntegration?.productionEligible !== false || !lineage.syntheticIntegration?.overlayId?.trim() || !SHA256.test(lineage.syntheticIntegration?.overlaySha256 ?? "")) {
    throw new Error("Persisted Phase 2 lineage requires exact example, unapproved, non-production identity and checksums.");
  }
  const inputNames = Object.keys(lineage.inputs ?? {}).sort();
  if (!sameValues(inputNames, ["boundaryCrosswalk", "landCover", "methodParameters"]) || inputNames.some((name) => !lineage.inputs[name]?.path?.trim() || !SHA256.test(lineage.inputs[name]?.sha256 ?? ""))) {
    throw new Error("Persisted Phase 2 lineage requires the exact three checksum-bound baseline inputs.");
  }
  const declaredFiles = Object.keys(lineage.outputs ?? {}).sort();
  if (!sameValues(declaredFiles, [...OUTPUT_FILES].sort()) || declaredFiles.some((name) => !SHA256.test(lineage.outputs[name as OutputFile] ?? ""))) {
    throw new Error("Persisted Phase 2 lineage must declare the exact output file set and SHA-256 values.");
  }

  const bytesByName = new Map<OutputFile, string>();
  for (const name of OUTPUT_FILES) {
    const bytes = await readFile(resolve(directory, name), "utf8");
    if (sha256(bytes) !== lineage.outputs[name]) throw new Error(`Persisted Phase 2 output checksum mismatch for ${name}.`);
    bytesByName.set(name, bytes);
  }

  const masks = parsed<OutputEnvelope<{ years: BaselineBatchResult["masks"] }>>(bytesByName.get("forest-mask.json")!, "forest-mask.json");
  const aggregates = parsed<OutputEnvelope<{ aggregates: BaselineBatchResult["aggregates"] }>>(bytesByName.get("forest-aggregates.json")!, "forest-aggregates.json");
  const detected = parsed<OutputEnvelope<{ years: BaselineBatchResult["detectedChange"] }>>(bytesByName.get("detected-change-events.json")!, "detected-change-events.json");
  const events = parsed<OutputEnvelope<{ events: SyntheticIntegrationResult["events"] }>>(bytesByName.get("synthetic-integrated-events.json")!, "synthetic-integrated-events.json");
  const integratedAggregates = parsed<OutputEnvelope<{ aggregates: SyntheticIntegrationResult["aggregates"] }>>(bytesByName.get("synthetic-integrated-aggregates.json")!, "synthetic-integrated-aggregates.json");
  const precedence = parsed<OutputEnvelope<Pick<SyntheticIntegrationResult, "precedence" | "precedenceEventMap">>>(bytesByName.get("synthetic-precedence.json")!, "synthetic-precedence.json");
  for (const [name, value] of [["forest-mask.json", masks], ["forest-aggregates.json", aggregates], ["detected-change-events.json", detected], ["synthetic-integrated-events.json", events], ["synthetic-integrated-aggregates.json", integratedAggregates], ["synthetic-precedence.json", precedence]] as const) labels(value, lineage.batchId, name);
  if (![masks.years, aggregates.aggregates, detected.years, events.events, integratedAggregates.aggregates, precedence.precedence, precedence.precedenceEventMap].every(Array.isArray)) throw new Error("Persisted Phase 2 output collections must be arrays.");

  const baseline = Object.freeze({ masks: masks.years, aggregates: aggregates.aggregates, detectedChange: detected.years });
  const integration = Object.freeze({ reviewStatus: "unapproved" as const, productionEligible: false as const, events: events.events, aggregates: integratedAggregates.aggregates, precedence: precedence.precedence, precedenceEventMap: precedence.precedenceEventMap });
  validateSyntheticIntegrationResult(integration);

  const maskYears = [...baseline.masks.map((mask) => mask.year)].sort((left, right) => left - right);
  if (maskYears.length === 0 || new Set(maskYears).size !== maskYears.length || maskYears.some((year, index) => !Number.isSafeInteger(year) || (index > 0 && year !== maskYears[index - 1]! + 1)) || lineage.syntheticIntegration.fromYear < maskYears[0]! || lineage.syntheticIntegration.toYear > maskYears.at(-1)! || lineage.syntheticIntegration.fromYear > lineage.syntheticIntegration.toYear) {
    throw new Error("Persisted Phase 2 masks require continuous annual coverage containing the exact declared range.");
  }
  const maskYearSet = new Set(maskYears);
  if (baseline.aggregates.some((aggregate) => !maskYearSet.has(aggregate.year)) || baseline.detectedChange.some((year) => year.toYear !== year.fromYear + 1 || !maskYearSet.has(year.fromYear) || !maskYearSet.has(year.toYear))) {
    throw new Error("Persisted baseline aggregates and detected-change years must resolve to the persisted masks.");
  }

  const baselineAggregateIds = new Set<string>();
  for (const aggregate of baseline.aggregates) {
    const identity = `${aggregate.boundaryId}\0${aggregate.year}`;
    if (baselineAggregateIds.has(identity)) throw new Error("Persisted baseline aggregates require unique boundary/year identity.");
    baselineAggregateIds.add(identity);
  }
  const aggregateIds = new Set<string>();
  const geographiesByRange = new Map<string, Set<string>>();
  for (const aggregate of integration.aggregates) {
    const range = `${aggregate.timeRange.fromYear}-${aggregate.timeRange.toYear}`;
    const identity = `${aggregate.boundaryId}\0${range}`;
    if (aggregateIds.has(identity)) throw new Error("Persisted synthetic aggregates require unique boundary/range identity.");
    aggregateIds.add(identity);
    const geographies = geographiesByRange.get(range) ?? new Set<string>();
    geographies.add(aggregate.geographyType);
    geographiesByRange.set(range, geographies);
    const denominator = baseline.aggregates.find((row) => row.boundaryId === aggregate.boundaryId && row.year === aggregate.timeRange.fromYear);
    if (!denominator || denominator.forestedHectares !== aggregate.denominator.hectares || denominator.forestDefinitionVersion !== aggregate.denominator.forestDefinitionVersion || denominator.boundaryEdition !== aggregate.boundaryEdition || aggregate.denominator.referenceYear !== aggregate.timeRange.fromYear) {
      throw new Error("Persisted synthetic aggregate denominator must match the exact first-year baseline boundary aggregate.");
    }
    if (aggregate.timeRange.fromYear !== lineage.syntheticIntegration.fromYear || aggregate.timeRange.toYear !== lineage.syntheticIntegration.toYear || aggregate.lineage.officialOverlayId !== lineage.syntheticIntegration.overlayId || aggregate.lineage.officialOverlaySha256 !== lineage.syntheticIntegration.overlaySha256) {
      throw new Error("Persisted synthetic aggregate range and overlay lineage must match the output lineage manifest.");
    }
    const expectedShare = aggregate.denominator.hectares === 0 ? "unknown" : "figure";
    if (aggregate.shareOfFirstYearForest.kind !== expectedShare || (aggregate.shareOfFirstYearForest.kind === "figure" && aggregate.shareOfFirstYearForest.percent !== round((aggregate.eventHectares / aggregate.denominator.hectares) * 100))) {
      throw new Error("Persisted synthetic aggregate rate must replay from event hectares and its first-year denominator.");
    }
  }
  for (const geographies of geographiesByRange.values()) {
    if (geographies.size !== PLACE_TYPES.length || PLACE_TYPES.some((type) => !geographies.has(type))) throw new Error("Persisted synthetic aggregates require complete all-eight geography coverage for every range.");
  }
  if (geographiesByRange.size !== 1) throw new Error("Persisted synthetic output must contain one complete declared aggregate range.");

  const baselineDetected = baseline.detectedChange.flatMap((year) => year.events);
  const integratedDetected = integration.events.filter((event) => event.kind === "detected-change");
  if (baselineDetected.length !== integratedDetected.length) throw new Error("Persisted detected-change events must have one emitted integrated event each.");
  for (const event of baselineDetected) {
    const integrated = integratedDetected.find((candidate) => candidate.eventId === event.eventId);
    if (!integrated || integrated.year !== event.observationYear || integrated.areaHectares !== event.areaHectares || integrated.lineage.sourcePatchChecksumSha256 !== event.patchChecksumSha256 || integrated.lineage.baselineBatchId !== lineage.batchId) {
      throw new Error("Persisted detected-change event lineage must replay across baseline and integrated outputs.");
    }
  }
  if (integration.events.some((event) => event.lineage.officialOverlayId !== lineage.syntheticIntegration.overlayId || event.lineage.officialOverlaySha256 !== lineage.syntheticIntegration.overlaySha256 || event.lineage.baselineBatchId !== lineage.batchId)) {
    throw new Error("Persisted event lineage must match the exact batch and overlay manifest identity.");
  }

  return Object.freeze({ directory, lineage, baseline, integration });
}

export function queryPersistedEventById(readback: SyntheticOutputReadback, eventId: string): IntegratedEvent | null {
  return readback.integration.events.find((event) => event.eventId === eventId) ?? null;
}

export function queryPersistedBoundaryYearLineage(readback: SyntheticOutputReadback, boundaryId: string, year: number): Readonly<{ baseline: ForestAggregate | null; aggregates: readonly IntegratedAggregate[] }> {
  const baseline = readback.baseline.aggregates.find((aggregate) => aggregate.boundaryId === boundaryId && aggregate.year === year) ?? null;
  const aggregates = Object.freeze(readback.integration.aggregates.filter((aggregate) => aggregate.boundaryId === boundaryId && year >= aggregate.timeRange.fromYear && year <= aggregate.timeRange.toYear).sort((left, right) => left.timeRange.fromYear - right.timeRange.fromYear || left.timeRange.toYear - right.timeRange.toYear));
  return Object.freeze({ baseline, aggregates });
}

export function replayPersistedAggregate(readback: SyntheticOutputReadback, boundaryId: string, fromYear: number, toYear: number): Readonly<{ aggregate: IntegratedAggregate; events: readonly IntegratedEvent[]; replaySha256: string }> {
  const aggregate = readback.integration.aggregates.find((candidate) => candidate.boundaryId === boundaryId && candidate.timeRange.fromYear === fromYear && candidate.timeRange.toYear === toYear);
  if (!aggregate) throw new Error(`No persisted aggregate exists for ${boundaryId} in ${fromYear}-${toYear}.`);
  const eventIds = [...new Set([...aggregate.winningEventIds, ...aggregate.retainedEvidenceIds])].sort();
  const events = Object.freeze(eventIds.map((eventId) => queryPersistedEventById(readback, eventId)!));
  if (events.some((event) => !event)) throw new Error("Persisted aggregate replay cannot resolve every contributing event.");
  return Object.freeze({ aggregate, events, replaySha256: sha256(stableJson({ aggregate, eventIds })) });
}
