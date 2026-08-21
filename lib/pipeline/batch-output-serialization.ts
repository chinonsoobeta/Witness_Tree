import { sha256, stableJson, type BaselineBatchManifest, type BaselineBatchResult } from "./national-baseline-batch";
import type { SyntheticIntegrationResult, SyntheticOfficialOverlay } from "./synthetic-event-integration";

export const OUTPUT_LABELS = Object.freeze({ status: "example" as const, reviewStatus: "unapproved" as const, productionEligible: false as const });

export function serializeBaselineOutputs(manifest: BaselineBatchManifest, result: BaselineBatchResult): Readonly<Record<string, string>> {
  return Object.freeze({
    "forest-mask.json": stableJson({ schemaVersion: 1, batchId: manifest.batchId, ...OUTPUT_LABELS, years: result.masks }),
    "forest-aggregates.json": stableJson({ schemaVersion: 1, batchId: manifest.batchId, ...OUTPUT_LABELS, aggregates: result.aggregates }),
    "detected-change-events.json": stableJson({ schemaVersion: 1, batchId: manifest.batchId, ...OUTPUT_LABELS, years: result.detectedChange }),
  });
}

export function serializeSyntheticOutputs(manifest: BaselineBatchManifest, result: SyntheticIntegrationResult): Readonly<Record<string, string>> {
  return Object.freeze({
    "synthetic-integrated-events.json": stableJson({ schemaVersion: 1, batchId: manifest.batchId, ...OUTPUT_LABELS, events: result.events }),
    "synthetic-integrated-aggregates.json": stableJson({ schemaVersion: 1, batchId: manifest.batchId, ...OUTPUT_LABELS, aggregates: result.aggregates }),
    "synthetic-precedence.json": stableJson({ schemaVersion: 1, batchId: manifest.batchId, ...OUTPUT_LABELS, precedence: result.precedence, precedenceEventMap: result.precedenceEventMap }),
  });
}

export function serializeOutputLineage(args: Readonly<{
  manifestBytes: string | Uint8Array;
  manifest: BaselineBatchManifest;
  outputs: Readonly<Record<string, string>>;
  overlay?: SyntheticOfficialOverlay;
  fromYear?: number;
  toYear?: number;
}>): string {
  const { manifestBytes, manifest, outputs, overlay, fromYear, toYear } = args;
  const hasSynthetic = overlay !== undefined || fromYear !== undefined || toYear !== undefined;
  if (hasSynthetic && (!overlay || !Number.isSafeInteger(fromYear) || !Number.isSafeInteger(toYear))) throw new Error("Synthetic output lineage requires an overlay and exact integer range.");
  return stableJson({
    schemaVersion: 1,
    batchId: manifest.batchId,
    ...OUTPUT_LABELS,
    manifestSha256: sha256(manifestBytes),
    inputs: manifest.inputs,
    ...(overlay ? { syntheticIntegration: { overlayId: overlay.overlayId, overlaySha256: overlay.overlaySha256, fromYear, toYear, reviewStatus: "unapproved", productionEligible: false } } : {}),
    outputs: Object.fromEntries(Object.entries(outputs).map(([name, bytes]) => [name, sha256(bytes)])),
  });
}
