import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const record = JSON.parse(readFileSync(`${root}/data/phase2-hansen-gfc-v1.12-sample-profile.json`, "utf8"));
assert.equal(record.schemaVersion, "witness-tree/phase2-hansen-gfc-v1.12-sample-profile/1");
assert.equal(record.status, "locally-staged-cross-check-input-no-comparison-result");
assert.equal(record.source.licence, "CC BY 4.0");
assert.equal(record.source.displayAttribution, "Source: Hansen/UMD/Google/USGS/NASA");
assert.deepEqual(record.artifacts.map(({ provinceSample }) => provinceSample).sort(), ["AB", "BC", "ON", "QC"]);
for (const artifact of record.artifacts) {
  const bytes = readFileSync(`${root}/${artifact.localPath}`);
  assert.equal(bytes.length, artifact.byteLength, `${artifact.provinceSample} byte length`);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), artifact.sha256, `${artifact.provinceSample} SHA-256`);
  assert.equal(artifact.extentWgs84.length, 4);
}
assert.deepEqual(record.claims, {comparisonComputed:false,likeForLike:false,productAccuracyClaim:false,admitted:false,productionEligible:false,released:false});
console.log("Phase 2 Hansen v1.12 sample profile passes; all four raw tiles are checksum-bound and no comparison is claimed.");
