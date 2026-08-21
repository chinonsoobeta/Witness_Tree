import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import {
  runBaselineBatch,
  sha256,
  stableJson,
  validateBaselineManifest,
  type BaselineBatchManifest,
  type BoundaryCrosswalkInput,
  type LandCoverInput,
} from "../lib/pipeline/national-baseline-batch";

const [, , manifestArgument, outputArgument] = process.argv;
if (!manifestArgument || !outputArgument) throw new Error("Usage: run-national-baseline-batch <manifest.json> <output-directory>");

const manifestPath = resolve(manifestArgument);
const baseDirectory = dirname(manifestPath);
const outputDirectory = resolve(outputArgument);
const manifestBytes = await readFile(manifestPath);
const manifest = JSON.parse(manifestBytes.toString("utf8")) as BaselineBatchManifest;
validateBaselineManifest(manifest);

async function checkedInput<T>(input: Readonly<{ path: string; sha256: string }>): Promise<T> {
  const path = resolve(baseDirectory, input.path);
  if (path !== baseDirectory && !path.startsWith(`${baseDirectory}${sep}`)) throw new Error("Input path escapes the manifest directory.");
  const bytes = await readFile(path);
  const observed = sha256(bytes);
  if (observed !== input.sha256) throw new Error(`Input checksum mismatch for ${input.path}: expected ${input.sha256}, observed ${observed}.`);
  return JSON.parse(bytes.toString("utf8")) as T;
}

const landCover = await checkedInput<LandCoverInput>(manifest.inputs.landCover);
const crosswalk = await checkedInput<BoundaryCrosswalkInput>(manifest.inputs.boundaryCrosswalk);
const result = runBaselineBatch(manifest, landCover, crosswalk);
const maskBytes = stableJson({ schemaVersion: 1, batchId: manifest.batchId, years: result.masks });
const aggregateBytes = stableJson({ schemaVersion: 1, batchId: manifest.batchId, aggregates: result.aggregates });
const lineageBytes = stableJson({
  schemaVersion: 1,
  batchId: manifest.batchId,
  productionEligible: false,
  manifestSha256: sha256(manifestBytes),
  inputs: manifest.inputs,
  outputs: {
    "forest-mask.json": sha256(maskBytes),
    "forest-aggregates.json": sha256(aggregateBytes),
  },
});

await mkdir(outputDirectory);
await Promise.all([
  writeFile(resolve(outputDirectory, "forest-mask.json"), maskBytes, { flag: "wx" }),
  writeFile(resolve(outputDirectory, "forest-aggregates.json"), aggregateBytes, { flag: "wx" }),
  writeFile(resolve(outputDirectory, "lineage.json"), lineageBytes, { flag: "wx" }),
]);
