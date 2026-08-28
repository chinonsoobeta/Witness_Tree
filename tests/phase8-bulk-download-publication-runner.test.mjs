import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const runner = new URL("../scripts/run-phase8-bulk-download-publication.sh", import.meta.url);
const source = readFileSync(runner, "utf8");

test("bulk publication runner is syntactically valid and exact-scope fail-closed", () => {
  execFileSync("zsh", ["-n", runner.pathname]);
  assert.match(source, /WitnessTreePublicDeliveryUploader/);
  assert.match(source, /--if-none-match '\*'/);
  assert.match(source, /--checksum-algorithm SHA256/);
  assert.match(source, /fullPublicReadbackSha256/);
  assert.doesNotMatch(source, /s3api\s+(?:delete-object|list-objects|list-object-versions)|--acl\b|iam\s+/);
  assert.equal((source.match(/releases\/phase8-bulk-download-v1\/\$RELEASE_ID\/downloads\//g) ?? []).length, 2);
  assert.match(source, /MANIFEST_KEY="releases\/phase8-bulk-download-v1\/\$RELEASE_ID\/manifest\.json"/);
  assert.match(source, /exactObjectCount:3/);
});

test("the durable release checker cannot create a missing release", () => {
  const checker = readFileSync(new URL("../scripts/check-phase8-bulk-download-release.mjs", import.meta.url), "utf8");
  assert.match(checker, /buildPhase8BulkDownloads\(\{ dataRoot, verifyOnly: true \}\)/);
  assert.doesNotMatch(checker, /writeFile|copyFile|mkdir/);
});
