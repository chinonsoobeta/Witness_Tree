import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const RECORD_PATH = `${root}/data/phase2-hansen-gfc-v1.12-sample-profile.json`;

export function validateHansenSampleProfile(record, readArtifact = (localPath) => readFileSync(`${root}/${localPath}`)) {
  assert.equal(record.schemaVersion, "witness-tree/phase2-hansen-gfc-v1.12-sample-profile/1", "Hansen sample profile schema version drifted");
  assert.equal(record.status, "locally-staged-cross-check-input-no-comparison-result");
  assert.equal(record.source.licence, "CC BY 4.0");
  assert.equal(record.source.displayAttribution, "Source: Hansen/UMD/Google/USGS/NASA");
  assert.deepEqual(record.artifacts.map(({ provinceSample }) => provinceSample).sort(), ["AB", "BC", "ON", "QC"]);
  for (const artifact of record.artifacts) {
    const bytes = readArtifact(artifact.localPath);
    assert.equal(bytes.length, artifact.byteLength, `${artifact.provinceSample} byte length`);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), artifact.sha256, `${artifact.provinceSample} SHA-256`);
    assert.equal(artifact.extentWgs84.length, 4);
  }
  assert.deepEqual(record.claims, {comparisonComputed:false,likeForLike:false,productAccuracyClaim:false,admitted:false,productionEligible:false,released:false});
  return record;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const record = JSON.parse(readFileSync(RECORD_PATH, "utf8"));
  validateHansenSampleProfile(record);
  console.log("Phase 2 Hansen v1.12 sample profile passes; all four raw tiles are checksum-bound and no comparison is claimed.");
}
