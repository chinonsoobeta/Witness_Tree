import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  validateIntervalMethodChange,
  type IntervalMethodChangeRecord,
  type IntervalReleaseEnvelope,
} from "../lib/pipeline/interval-method-change";
import type { MethodParameterManifest } from "../lib/pipeline/method-manifest";

const root = new URL("../", import.meta.url);
const resolve = (path: string) => fileURLToPath(new URL(path, root));
const read = (path: string) => readFileSync(resolve(path), "utf8");
const json = <T,>(path: string) => JSON.parse(read(path)) as T;
const digestOf = (path: string) => createHash("sha256").update(readFileSync(resolve(path))).digest("hex");

const record = json<IntervalMethodChangeRecord>("data/phase3-interval-method-change.json");
const previous = json<MethodParameterManifest>(record.manifests.previous.path);
const next = json<MethodParameterManifest>(record.manifests.next.path);
const release = json<IntervalReleaseEnvelope>(record.recomputation.product.path);

const identity = validateIntervalMethodChange(record, previous, next, release, digestOf);

// The note is the human half of the marker, so it has to name what the marker binds.
const note = read(record.releaseNote.path);
for (const required of [record.releaseNote.id, previous.methodVersion, next.methodVersion, previous.parameterSha256]) {
  if (!note.includes(required)) throw new Error(`The release note does not name ${required}.`);
}

console.log(
  `interval method change: ${previous.methodVersion} -> ${identity.methodVersion}, parameters ${identity.parameterSha256}, ${identity.spanCount} spans, ${release.jurisdictions.length} jurisdictions, productionEligible=false.`,
);
