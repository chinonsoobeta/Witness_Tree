import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
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
  assert.match(runner, /Approved raw ZIP drifted[\s\S]*read -r -s/);
  assert.match(runner, /WitnessTreePlviArchivePromotionUploader/);
  assert.doesNotMatch(runner, /DeleteObject|BypassGovernanceRetention|aws iam (?:create|put|delete|attach|update)/i);
});

test("owner-local preflight finds and fully hashes both controlled workspace artifacts before TOTP or AWS", () => {
  const runner = new URL("../scripts/run-alberta-plvi-approved-promotion.sh", import.meta.url).pathname;
  const pass = spawnSync("zsh", [runner, "--preflight"], { encoding: "utf8", timeout: 120_000 });
  assert.equal(pass.status, 0, pass.stderr);
  assert.match(pass.stdout, /PRECHECK passed: both approved artifacts exist/);
  assert.doesNotMatch(`${pass.stdout}${pass.stderr}`, /Current MFA TOTP|aws (?:s3|sts|iam)/i);
  const fail = spawnSync("zsh", [runner, "--preflight"], { encoding: "utf8", env: { ...process.env, WITNESS_TREE_PLVI_PREFLIGHT_DATA_ROOT: "/private/tmp/witness-tree-plvi-missing-data-root" } });
  assert.equal(fail.status, 65);
  assert.match(fail.stderr, /missing at the controlled workspace-data path/);
  assert.doesNotMatch(`${fail.stdout}${fail.stderr}`, /Current MFA TOTP|aws (?:s3|sts|iam)/i);
});

test("macOS zsh runner prompts without echo and rejects invalid TOTP before any AWS command", () => {
  const dir = mkdtempSync(join(tmpdir(), "plvi-mfa-pty-"));
  const marker = join(dir, "aws-called");
  const aws = join(dir, "aws");
  writeFileSync(aws, `#!/bin/zsh\nprintf called > ${JSON.stringify(marker)}\nexit 99\n`, { mode: 0o700 });
  const runner = new URL("../scripts/run-alberta-plvi-approved-promotion.sh", import.meta.url).pathname;
  try {
    const expectProgram = `set timeout 120
set env(PATH) "${dir}:$env(PATH)"
set runner "${runner}"
spawn -noecho zsh $runner --run
expect {
  "Current MFA TOTP (not stored):" { send -- "12bad\\r"; exp_continue }
  "TOTP must be exactly six digits; no AWS call was made" { expect eof; set result [wait]; exit [lindex $result 3] }
  timeout { exit 2 }
  eof { exit 3 }
}`;
    const run = spawnSync("expect", ["-c", expectProgram], { encoding: "utf8", timeout: 120_000, env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } });
    assert.equal(run.status, 64, `${run.stdout}\n${run.stderr}`);
    assert.match(`${run.stdout}${run.stderr}`, /Current MFA TOTP \(not stored\):/);
    assert.match(`${run.stdout}${run.stderr}`, /TOTP must be exactly six digits; no AWS call was made/);
    assert.equal(existsSync(marker), false);
    assert.doesNotMatch(`${run.stdout}${run.stderr}`, /12bad/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("provisioning policies bind only the named MFA operator, four keys, and two payload retentions", () => {
  const trust = JSON.parse(readFileSync(new URL("../infra/aws/plvi-archive-promotion-trust-policy.json", import.meta.url), "utf8"));
  const role = JSON.parse(readFileSync(new URL("../infra/aws/plvi-archive-promotion-role-policy.json", import.meta.url), "utf8"));
  const operator = JSON.parse(readFileSync(new URL("../infra/aws/plvi-archive-promotion-assume-role-policy.json", import.meta.url), "utf8"));
  assert.equal(trust.Statement[0].Principal.AWS, "arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator");
  assert.equal(trust.Statement[0].Condition.Bool["aws:MultiFactorAuthPresent"], "true");
  assert.equal(role.Statement[0].Resource.length, 4);
  assert.deepEqual(role.Statement[0].Action, ["s3:PutObject", "s3:GetObject", "s3:AbortMultipartUpload", "s3:ListMultipartUploadParts"]);
  assert.equal(role.Statement[1].Resource.length, 2);
  assert.deepEqual(role.Statement[1].Action, ["s3:PutObjectRetention", "s3:GetObjectRetention"]);
  assert.equal(role.Statement.length, 3);
  assert.ok(role.Statement[2].Action.includes("s3:DeleteObject"));
  assert.ok(role.Statement[2].Action.includes("s3:BypassGovernanceRetention"));
  assert.equal(role.Statement.flatMap((statement) => statement.Action).includes("s3:ListBucketMultipartUploads"), false);
  assert.equal(operator.Statement[0].Resource, "arn:aws:iam::286853118812:role/WitnessTreePlviArchivePromotionUploader");
  assert.equal(operator.Statement[0].Condition.Bool["aws:MultiFactorAuthPresent"], "true");
});
