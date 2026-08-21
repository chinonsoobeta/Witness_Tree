import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import {
  runBaselineBatch,
  boundaryCrosswalkSha256,
  sha256,
  validateBaselineManifest,
  type BaselineBatchManifest,
  type BoundaryCrosswalkInput,
  type LandCoverInput,
} from "../lib/pipeline/national-baseline-batch";
import type { MethodParameterManifest } from "../lib/pipeline/method-manifest";
import { integrateSyntheticEvents, type SyntheticOfficialOverlay } from "../lib/pipeline/synthetic-event-integration";
import { serializeBaselineOutputs, serializeOutputLineage, serializeSyntheticOutputs } from "../lib/pipeline/batch-output-serialization";

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
const outputs: Record<string, string> = { ...serializeBaselineOutputs(manifest, result) };
let overlay: SyntheticOfficialOverlay | undefined;
let fromYear: number | undefined;
let toYear: number | undefined;
if (overlayArgument && fromYearArgument && toYearArgument) {
  const overlayPath = resolve(overlayArgument);
  if (overlayPath !== baseDirectory && !overlayPath.startsWith(`${baseDirectory}${sep}`)) throw new Error("Synthetic overlay path escapes the manifest directory.");
  overlay = JSON.parse((await readFile(overlayPath)).toString("utf8")) as SyntheticOfficialOverlay;
  fromYear = Number(fromYearArgument);
  toYear = Number(toYearArgument);
  const integrated = integrateSyntheticEvents({ manifest, method: methodParameters, grid: landCover.grid, baseline: result, crosswalk, overlay, fromYear, toYear });
  Object.assign(outputs, serializeSyntheticOutputs(manifest, integrated));
}
const lineageBytes = serializeOutputLineage({ manifestBytes, manifest, outputs, overlay, fromYear, toYear });

await mkdir(outputDirectory);
await Promise.all([
  ...Object.entries(outputs).map(([name, bytes]) => writeFile(resolve(outputDirectory, name), bytes, { flag: "wx" })),
  writeFile(resolve(outputDirectory, "lineage.json"), lineageBytes, { flag: "wx" }),
]);
