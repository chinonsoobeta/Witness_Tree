import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import {
  runBaselineBatch,
  boundaryCrosswalkSha256,
  sha256,
  stableJson,
  validateBaselineManifest,
  type BaselineBatchManifest,
  type BoundaryCrosswalkInput,
  type LandCoverInput,
} from "../lib/pipeline/national-baseline-batch";
import type { MethodParameterManifest } from "../lib/pipeline/method-manifest";
import { integrateSyntheticEvents, type SyntheticOfficialOverlay } from "../lib/pipeline/synthetic-event-integration";

const [, , manifestArgument, outputArgument, overlayArgument, fromYearArgument, toYearArgument] = process.argv;
if (!manifestArgument || !outputArgument || ([overlayArgument, fromYearArgument, toYearArgument].some(Boolean) && ![overlayArgument, fromYearArgument, toYearArgument].every(Boolean))) {
  throw new Error("Usage: run-national-baseline-batch <manifest.json> <output-directory> [synthetic-overlay.json from-year to-year]");
}

const manifestPath = resolve(manifestArgument);
const baseDirectory = dirname(manifestPath);
const outputDirectory = resolve(outputArgument);
const manifestBytes = await readFile(manifestPath);
const manifest = JSON.parse(manifestBytes.toString("utf8")) as BaselineBatchManifest;
validateBaselineManifest(manifest);

async function checkedInput<T>(input: Readonly<{ path: string; sha256: string }>, canonicalSha256?: (value: T) => string): Promise<T> {
  const path = resolve(baseDirectory, input.path);
  if (path !== baseDirectory && !path.startsWith(`${baseDirectory}${sep}`)) throw new Error("Input path escapes the manifest directory.");
  const bytes = await readFile(path);
  const parsed = JSON.parse(bytes.toString("utf8")) as T;
  const observed = canonicalSha256 ? canonicalSha256(parsed) : sha256(bytes);
  if (observed !== input.sha256) throw new Error(`Input checksum mismatch for ${input.path}: expected ${input.sha256}, observed ${observed}.`);
  return parsed;
}

const landCover = await checkedInput<LandCoverInput>(manifest.inputs.landCover);
const crosswalk = await checkedInput<BoundaryCrosswalkInput>(manifest.inputs.boundaryCrosswalk, boundaryCrosswalkSha256);
const methodParameters = await checkedInput<MethodParameterManifest>(manifest.inputs.methodParameters);
const result = runBaselineBatch(manifest, methodParameters, landCover, crosswalk);
const maskBytes = stableJson({ schemaVersion: 1, batchId: manifest.batchId, years: result.masks });
const aggregateBytes = stableJson({ schemaVersion: 1, batchId: manifest.batchId, aggregates: result.aggregates });
const detectedChangeBytes = stableJson({ schemaVersion: 1, batchId: manifest.batchId, years: result.detectedChange });
const outputs: Record<string, string> = {
  "forest-mask.json": maskBytes,
  "forest-aggregates.json": aggregateBytes,
  "detected-change-events.json": detectedChangeBytes,
};
let syntheticLineage: Readonly<Record<string, unknown>> | undefined;
if (overlayArgument && fromYearArgument && toYearArgument) {
  const overlayPath = resolve(overlayArgument);
  if (overlayPath !== baseDirectory && !overlayPath.startsWith(`${baseDirectory}${sep}`)) throw new Error("Synthetic overlay path escapes the manifest directory.");
  const overlay = JSON.parse((await readFile(overlayPath)).toString("utf8")) as SyntheticOfficialOverlay;
  const fromYear = Number(fromYearArgument);
  const toYear = Number(toYearArgument);
  const integrated = integrateSyntheticEvents({ manifest, method: methodParameters, grid: landCover.grid, baseline: result, crosswalk, overlay, fromYear, toYear });
  outputs["synthetic-integrated-events.json"] = stableJson({ schemaVersion: 1, batchId: manifest.batchId, reviewStatus: "unapproved", productionEligible: false, events: integrated.events });
  outputs["synthetic-integrated-aggregates.json"] = stableJson({ schemaVersion: 1, batchId: manifest.batchId, reviewStatus: "unapproved", productionEligible: false, aggregates: integrated.aggregates });
  outputs["synthetic-precedence.json"] = stableJson({ schemaVersion: 1, batchId: manifest.batchId, reviewStatus: "unapproved", productionEligible: false, precedence: integrated.precedence, precedenceEventMap: integrated.precedenceEventMap });
  syntheticLineage = Object.freeze({ overlayId: overlay.overlayId, overlaySha256: overlay.overlaySha256, fromYear, toYear, reviewStatus: "unapproved", productionEligible: false });
}
const lineageBytes = stableJson({
  schemaVersion: 1,
  batchId: manifest.batchId,
  status: "example",
  reviewStatus: "unapproved",
  productionEligible: false,
  manifestSha256: sha256(manifestBytes),
  inputs: manifest.inputs,
  ...(syntheticLineage ? { syntheticIntegration: syntheticLineage } : {}),
  outputs: Object.fromEntries(Object.entries(outputs).map(([name, bytes]) => [name, sha256(bytes)])),
});

await mkdir(outputDirectory);
await Promise.all([
  ...Object.entries(outputs).map(([name, bytes]) => writeFile(resolve(outputDirectory, name), bytes, { flag: "wx" })),
  writeFile(resolve(outputDirectory, "lineage.json"), lineageBytes, { flag: "wx" }),
]);
