import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

test("bulk-publication preflight reaches no AWS command before an incomplete local release", () => {
  const dir = mkdtempSync(join(tmpdir(), "phase8-preflight-no-aws-"));
  const marker = join(dir, "aws-called");
  writeFileSync(join(dir, "aws"), `#!/bin/zsh\ntouch ${JSON.stringify(marker)}\nexit 91\n`, { mode: 0o700 });
  try {
    const run = spawnSync("zsh", [runner.pathname, "--preflight"], { encoding: "utf8", env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, WITNESS_TREE_DATA_ROOT: join(dir, "absent-data") } });
    assert.equal(run.status, 65, run.stdout + run.stderr);
    assert.match(run.stderr, /Exact release artifact is absent or unsafe; no AWS call was made/);
    assert.equal(existsSync(marker), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
