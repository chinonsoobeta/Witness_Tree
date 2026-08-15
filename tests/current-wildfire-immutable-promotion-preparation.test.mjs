import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { dryRunLines, validateCurrentWildfirePromotionPreparation, writeSidecars } from "../scripts/prepare-current-wildfire-immutable-promotion.mjs";
const plan = JSON.parse(readFileSync(new URL("../data/current-wildfire-immutable-promotion-preparation.json", import.meta.url), "utf8"));
const staged = JSON.parse(readFileSync(new URL("../data/staged-acquisitions.json", import.meta.url), "utf8"));
test("four current wildfire snapshots remain exact, archive-only, and non-admitted", () => { assert.equal(validateCurrentWildfirePromotionPreparation(plan, staged), plan); const lines = dryRunLines(plan, staged).join("\n"); assert.match(lines, /ADMISSION-BLOCK bc-wildfire geometry=blocked-pending-geometry-policy/); assert.match(lines, /ADMISSION-BLOCK on-fire-disturbance geometry=blocked-pending-geometry-policy/); assert.equal((lines.match(/UPLOAD-PENDING/g) ?? []).length, 4); });
test("preparation fails closed on drift, extra source, or an archive claim", () => { assert.throws(() => validateCurrentWildfirePromotionPreparation({...plan, claims: {...plan.claims, immutableObjectStorage: true}}, staged)); assert.throws(() => validateCurrentWildfirePromotionPreparation({...plan, artifacts: plan.artifacts.slice(0, 3)}, staged)); assert.throws(() => validateCurrentWildfirePromotionPreparation({...plan, artifacts: [{...plan.artifacts[0], geometryDecision: "ready"}, ...plan.artifacts.slice(1)]}, staged)); });

test("sidecars are deterministic and the desired role cannot broaden exact keys", () => {
  const dir = mkdtempSync(join(tmpdir(), "current-wildfire-sidecars-"));
  try { assert.equal(writeSidecars(plan, dir, staged).length, 4); assert.throws(() => writeSidecars(plan, dir, staged), /EEXIST/); }
  finally { rmSync(dir, {recursive: true, force: true}); }
  assert.throws(() => validateCurrentWildfirePromotionPreparation({...plan, proposedRoleScope: {...plan.proposedRoleScope, objectKeys: plan.proposedRoleScope.objectKeys.slice(1)}}, staged));
});

test("MFA runner defaults to dry run and excludes prohibited operations", () => {
  const runner = readFileSync(new URL("../scripts/run-current-wildfire-approved-promotion.sh", import.meta.url), "utf8");
  assert.match(runner, /if \[\[ \$# -eq 0 \]\]; then node/);
  assert.match(runner, /Approved .* artifact drifted[\s\S]*read -r -s/);
  assert.match(runner, /WitnessTreeCurrentWildfirePromotionUploader/);
  assert.match(runner, /aws s3api put-object/);
  assert.match(runner, /ChecksumType=="FULL_OBJECT"/);
  assert.match(runner, /put-object-retention/);
  assert.doesNotMatch(runner, /aws s3 cp|DeleteObject|BypassGovernanceRetention|PutObjectLegalHold|ReplicateObject|aws iam /i);
  assert.match(runner, /aws configure get mfa_serial --profile/);
  assert.match(runner, /mfa\/\[A-Za-z0-9\+=,.@_\/-\]\+/);
  assert.match(runner, /Arn == "arn:aws:iam::286853118812:user\/WitnessTreeArchiveOperator"/);
  assert.doesNotMatch(runner, /list-mfa-devices|iam list/i);
});

test("valid-shaped dummy TOTP reaches only the mocked direct PutObject boundary", () => {
  const dir = mkdtempSync(join(tmpdir(), "current-wildfire-mfa-sts-"));
  const marker = join(dir, "calls");
  const aws = join(dir, "aws");
  writeFileSync(aws, `#!/bin/zsh
case "$1:$2" in
  configure:get) print -- "configure-get" >> ${JSON.stringify(marker)}; print -- "arn:aws:iam::286853118812:mfa/alternate-safe-device.path" ;;
  sts:get-session-token) print -- "sts-get-session-token" >> ${JSON.stringify(marker)}; print -- '{"Credentials":{"AccessKeyId":"dummy","SecretAccessKey":"dummy","SessionToken":"dummy"}}' ;;
  sts:get-caller-identity) print -- "sts-get-caller-identity" >> ${JSON.stringify(marker)}; print -- '{"Account":"286853118812","Arn":"arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator"}' ;;
  sts:assume-role) print -- "sts-assume-role" >> ${JSON.stringify(marker)}; print -- '{"Credentials":{"AccessKeyId":"dummy","SecretAccessKey":"dummy","SessionToken":"dummy"}}' ;;
  s3api:put-object) print -- "s3-put-object-blocked" >> ${JSON.stringify(marker)}; exit 88 ;;
  *) print -- "unexpected-$1-$2" >> ${JSON.stringify(marker)}; exit 98 ;;
esac
`, {mode: 0o700});
  const runner = new URL("../scripts/run-current-wildfire-approved-promotion.sh", import.meta.url).pathname;
  const expectProgram = `set timeout 120
set env(PATH) "${dir}:$env(PATH)"
set runner "${runner}"
spawn -noecho zsh $runner --run
expect {
  "Current MFA TOTP (not stored):" { send -- "123456\\r"; exp_continue }
  eof { set result [wait]; exit [lindex $result 3] }
  timeout { exit 2 }
}`;
  try {
    const run = spawnSync("expect", ["-c", expectProgram], {encoding: "utf8", timeout: 120_000, env: {...process.env, PATH: `${dir}:${process.env.PATH}`}});
    assert.equal(run.status, 70, `${run.stdout}\n${run.stderr}`);
    assert.match(`${run.stdout}${run.stderr}`, /Payload upload failed/);
    assert.deepEqual(readFileSync(marker, "utf8").trim().split("\n"), ["configure-get", "sts-get-session-token", "sts-get-caller-identity", "sts-assume-role", "s3-put-object-blocked"]);
    assert.doesNotMatch(readFileSync(marker, "utf8"), /iam|list-mfa/i);
    assert.doesNotMatch(`${run.stdout}${run.stderr}`, /123456/);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test("empty, malformed, or wrong-account MFA serial stops after local config and never reaches STS or S3", () => {
  for (const serial of ["", "arn:aws:iam::999999999999:mfa/other-device", "not-an-arn"]) {
    const dir = mkdtempSync(join(tmpdir(), "current-wildfire-mfa-rejection-"));
    const marker = join(dir, "calls");
    const aws = join(dir, "aws");
    writeFileSync(aws, `#!/bin/zsh
print -- "$1:$2" >> ${JSON.stringify(marker)}
case "$1:$2" in configure:get) print -- ${JSON.stringify(serial)} ;; *) exit 99 ;; esac
`, {mode: 0o700});
    const runner = new URL("../scripts/run-current-wildfire-approved-promotion.sh", import.meta.url).pathname;
    const expectProgram = `set timeout 120
set env(PATH) "${dir}:$env(PATH)"
spawn -noecho zsh ${JSON.stringify(runner)} --run
expect {
  "Current MFA TOTP (not stored):" { send -- "123456\\r"; exp_continue }
  eof { set result [wait]; exit [lindex $result 3] }
  timeout { exit 2 }
}`;
    try {
      const run = spawnSync("expect", ["-c", expectProgram], {encoding: "utf8", timeout: 120_000, env: {...process.env, PATH: `${dir}:${process.env.PATH}`}});
      assert.equal(run.status, 69, `${run.stdout}\n${run.stderr}`);
      assert.match(`${run.stdout}${run.stderr}`, /Configured MFA serial is absent, malformed, or outside the approved account/);
      assert.doesNotMatch(`${run.stdout}${run.stderr}`, /123456/);
      assert.deepEqual(readFileSync(marker, "utf8").trim().split("\n"), ["configure:get"]);
    } finally { rmSync(dir, {recursive: true, force: true}); }
  }
});
