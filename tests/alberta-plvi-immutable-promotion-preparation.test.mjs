import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { dryRunLines, sidecarFor, validateAlbertaPlviImmutablePromotionPreparation, writeSidecars } from "../scripts/prepare-alberta-plvi-immutable-promotion.mjs";

const plan = JSON.parse(readFileSync(new URL("../data/alberta-plvi-immutable-promotion-preparation.json", import.meta.url), "utf8"));

test("PLVI promotion preparation binds the raw archive and derived release to distinct canonical keys", () => {
  assert.equal(validateAlbertaPlviImmutablePromotionPreparation(plan), plan);
  assert.equal(plan.artifacts.length, 2);
  assert.match(dryRunLines(plan).join("\n"), /RETAIN-PENDING.*2033-08-12T00:00:00Z/);
  assert.notEqual(plan.artifacts[0].payloadKey, plan.artifacts[1].payloadKey);
  assert.match(sidecarFor(plan, plan.artifacts[1]), /repairPatchSha256/);
});

test("sidecars are deterministic and the preparation rejects drift or remote claims", () => {
  const dir = mkdtempSync(join(tmpdir(), "plvi-sidecars-"));
  try { const first = writeSidecars(plan, dir); assert.equal(first.length, 2); assert.throws(() => writeSidecars(plan, dir), /EEXIST/); }
  finally { rmSync(dir, {recursive: true, force: true}); }
  assert.throws(() => validateAlbertaPlviImmutablePromotionPreparation({...plan, claims: {...plan.claims, immutableObjectStorage: true}}));
  assert.throws(() => validateAlbertaPlviImmutablePromotionPreparation({...plan, artifacts: [{...plan.artifacts[0], sha256: "0".repeat(64)}, plan.artifacts[1]]}));
  assert.throws(() => validateAlbertaPlviImmutablePromotionPreparation({...plan, proposedRoleScope: {...plan.proposedRoleScope, objectKeys: plan.proposedRoleScope.objectKeys.slice(1)}}));
});

test("MFA runner has a dry-run default and excludes deletion, IAM mutation, and retention bypass", () => {
  const runner = readFileSync(new URL("../scripts/run-alberta-plvi-approved-promotion.sh", import.meta.url), "utf8");
  assert.match(runner, /if \[\[ \$# -eq 0 \]\]; then node/);
  assert.match(runner, /Approved raw ZIP drifted[\s\S]*vared/);
  assert.match(runner, /WitnessTreePlviArchivePromotionUploader/);
  assert.doesNotMatch(runner, /DeleteObject|BypassGovernanceRetention|aws iam (?:create|put|delete|attach|update)/i);
});
