import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { multipartPlan, partCount, sidecarFor, validateQcImmutablePromotionPreparation, writeSidecars } from "../scripts/prepare-qc-immutable-promotion.mjs";

const plan = JSON.parse(readFileSync(new URL("../data/qc-immutable-promotion-preparation.json", import.meta.url), "utf8"));

test("Québec immutable preparation binds only the two completed raw archives to safe append-only keys", () => {
  assert.equal(validateQcImmutablePromotionPreparation(plan), plan);
  assert.deepEqual(plan.artifacts.map((item) => item.id), ["qc-ecoforest-map-2026-08-14", "qc-original-current-inventory-2026-08-14"]);
  assert.equal(plan.artifacts.some((item) => /fourth/i.test(JSON.stringify(item))), false);
  assert.equal(plan.artifacts[0].payloadKey.includes("current"), false);
  assert.equal(plan.artifacts[0].payloadKey.includes("latest"), false);
  assert.deepEqual(plan.proposedRoleScope.retentionKeys, plan.artifacts.map((item) => item.payloadKey));
});

test("each archive has a bounded reviewed sequential multipart plan", () => {
  assert.equal(partCount(12399475076), 93);
  assert.equal(partCount(11244667626), 84);
  for (const artifact of plan.artifacts) {
    const parts = multipartPlan(artifact.byteLength);
    assert.equal(parts.at(-1).offsetBytes + parts.at(-1).byteLength, artifact.byteLength);
    assert.ok(parts.every((part, index) => part.partNumber === index + 1 && part.byteLength > 0));
    assert.ok(parts.length <= 10000);
  }
  assert.throws(() => multipartPlan(12399475076, 16 * 1024 * 1024));
});

test("sidecars are deterministic and the preparation rejects remote claims, aliases, and scope widening", () => {
  const dir = mkdtempSync(join(tmpdir(), "qc-promotion-sidecars-"));
  try { assert.equal(writeSidecars(plan, dir).length, 2); assert.throws(() => writeSidecars(plan, dir), /EEXIST/); }
  finally { rmSync(dir, { recursive: true, force: true }); }
  assert.match(sidecarFor(plan, plan.artifacts[0]), /rebuildable-not-locked/);
  assert.throws(() => validateQcImmutablePromotionPreparation({ ...plan, claims: { ...plan.claims, immutableObjectStorage: true } }));
  assert.throws(() => validateQcImmutablePromotionPreparation({ ...plan, artifacts: [{ ...plan.artifacts[0], archiveSourceId: "qc-current-ecoforest" }, plan.artifacts[1]] }));
  assert.throws(() => validateQcImmutablePromotionPreparation({ ...plan, proposedRoleScope: { ...plan.proposedRoleScope, retentionKeys: plan.proposedRoleScope.retentionKeys.slice(1) } }));
});

test("owner-local runner is multipart-only and excludes high-level copies, deletion, IAM, and bypass", () => {
  const runner = readFileSync(new URL("../scripts/run-qc-approved-multipart-promotion.sh", import.meta.url), "utf8");
  assert.match(runner, /if \[\[ \$# -eq 0 \]\]; then node/);
  assert.match(runner, /PRECHECK passed[\s\S]*read -r -s/);
  assert.match(runner, /create-multipart-upload[\s\S]*upload-part[\s\S]*complete-multipart-upload/);
  assert.match(runner, /list-parts[\s\S]*Previously uploaded part does not match/);
  assert.match(runner, /ChecksumType=="COMPOSITE"[\s\S]*put-object-retention[\s\S]*get-object-retention/);
  assert.doesNotMatch(runner, /aws s3 cp|DeleteObject|BypassGovernanceRetention|PutObjectLegalHold|aws iam /i);
  assert.match(runner, /aws configure get mfa_serial --profile/);
  assert.doesNotMatch(runner, /list-mfa-devices|iam list/i);
});
