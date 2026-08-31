import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { verifies, validateAlbertaPlviVersionedReadbackIamApplied } from "../scripts/check-alberta-plvi-versioned-readback-iam-applied-record-consistency.mjs";

const evidence = JSON.parse(readFileSync(new URL("../data/alberta-plvi-versioned-readback-iam-applied-2026-08-25.json", import.meta.url), "utf8"));
const checkerSource = readFileSync(new URL("../scripts/check-alberta-plvi-versioned-readback-iam-applied-record-consistency.mjs", import.meta.url), "utf8");
test("PLVI IAM evidence records only the narrow exact-version and sidecar-retention correction", () => {
  assert.equal(validateAlbertaPlviVersionedReadbackIamApplied(evidence), evidence);
  assert.match(verifies, /does not query AWS/);
  assert.doesNotMatch(checkerSource, /node:child_process|@aws-sdk|from ["']aws-sdk|\bspawn(?:Sync)?\s*\(|\bexec(?:File|Sync)?\s*\(|\bfetch\s*\(/);
  assert.doesNotMatch(JSON.stringify(evidence), /AccessKeyId|SecretAccessKey|SessionToken|VersionId/i);
});
test("PLVI IAM evidence rejects widened scope or false readback", () => {
  const changed = structuredClone(evidence); changed.change.wildcardsAdded = true;
  assert.throws(() => validateAlbertaPlviVersionedReadbackIamApplied(changed));
  const drift = structuredClone(evidence); drift.checksums.readbackPolicySha256 = "0".repeat(64);
  assert.throws(() => validateAlbertaPlviVersionedReadbackIamApplied(drift));
});
