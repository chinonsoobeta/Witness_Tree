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
  assert.match(runner, /aws configure get mfa_serial --profile/);
  assert.doesNotMatch(runner, /list-mfa-devices|iam list/i);
});

test("valid-shaped dummy TOTP uses local MFA config then STS and role assumption before a mocked S3 boundary", () => {
  const dir = mkdtempSync(join(tmpdir(), "plvi-mfa-sts-"));
  const marker = join(dir, "calls");
  const aws = join(dir, "aws");
  writeFileSync(aws, `#!/bin/zsh
case "$1:$2" in
  configure:get) print -- "configure-get" >> ${JSON.stringify(marker)}; print -- "arn:aws:iam::286853118812:mfa/approved-device-name" ;;
  sts:get-session-token) print -- "sts-get-session-token" >> ${JSON.stringify(marker)}; print -- '{"Credentials":{"AccessKeyId":"dummy","SecretAccessKey":"dummy","SessionToken":"dummy"}}' ;;
  sts:get-caller-identity) print -- "sts-get-caller-identity" >> ${JSON.stringify(marker)}; print -- "286853118812" ;;
  sts:assume-role) print -- "sts-assume-role" >> ${JSON.stringify(marker)}; print -- '{"Credentials":{"AccessKeyId":"dummy","SecretAccessKey":"dummy","SessionToken":"dummy"}}' ;;
  s3:cp) print -- "s3-cp-blocked" >> ${JSON.stringify(marker)}; exit 88 ;;
  *) print -- "unexpected-$1-$2" >> ${JSON.stringify(marker)}; exit 98 ;;
esac
`, { mode: 0o700 });
  const runner = new URL("../scripts/run-alberta-plvi-approved-promotion.sh", import.meta.url).pathname;
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
    const run = spawnSync("expect", ["-c", expectProgram], { encoding: "utf8", timeout: 120_000, env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } });
    assert.equal(run.status, 88, `${run.stdout}\n${run.stderr}`);
    assert.deepEqual(readFileSync(marker, "utf8").trim().split("\n"), ["configure-get", "sts-get-session-token", "sts-get-caller-identity", "sts-assume-role", "s3-cp-blocked"]);
    assert.doesNotMatch(readFileSync(marker, "utf8"), /iam|list-mfa/i);
    assert.doesNotMatch(`${run.stdout}${run.stderr}`, /123456/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("runner accepts an alternate safe device path but rejects a wrong account before STS", () => {
  const dir = mkdtempSync(join(tmpdir(), "plvi-mfa-serial-"));
  const marker = join(dir, "calls");
  const aws = join(dir, "aws");
  const runner = new URL("../scripts/run-alberta-plvi-approved-promotion.sh", import.meta.url).pathname;
  const attempt = (serial) => {
    writeFileSync(aws, `#!/bin/zsh
case "$1:$2" in
  configure:get) print -- "configure-get" >> ${JSON.stringify(marker)}; print -- ${JSON.stringify(serial)} ;;
  sts:get-session-token) print -- "sts-get-session-token" >> ${JSON.stringify(marker)}; exit 77 ;;
  *) print -- "unexpected-$1-$2" >> ${JSON.stringify(marker)}; exit 98 ;;
esac
`, { mode: 0o700 });
    const expectProgram = `set timeout 120
set env(PATH) "${dir}:$env(PATH)"
spawn -noecho zsh ${runner} --run
expect {
  "Current MFA TOTP (not stored):" { send -- "123456\\r"; exp_continue }
  eof { set result [wait]; exit [lindex $result 3] }
  timeout { exit 2 }
}`;
    return spawnSync("expect", ["-c", expectProgram], { encoding: "utf8", timeout: 120_000, env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } });
  };
  try {
    const accepted = attempt("arn:aws:iam::286853118812:mfa/team/alternate-device_1");
    assert.equal(accepted.status, 77, `${accepted.stdout}\n${accepted.stderr}`);
    assert.deepEqual(readFileSync(marker, "utf8").trim().split("\n"), ["configure-get", "sts-get-session-token"]);
    rmSync(marker);
    const rejected = attempt("arn:aws:iam::999999999999:mfa/alternate-device");
    assert.equal(rejected.status, 69, `${rejected.stdout}\n${rejected.stderr}`);
    assert.deepEqual(readFileSync(marker, "utf8").trim().split("\n"), ["configure-get"]);
    assert.doesNotMatch(`${rejected.stdout}${rejected.stderr}`, /999999999999|123456/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("runner constructs the exact approved role ARN before the S3 boundary", () => {
  const dir = mkdtempSync(join(tmpdir(), "plvi-role-arn-"));
  const marker = join(dir, "calls");
  const aws = join(dir, "aws");
  const runner = new URL("../scripts/run-alberta-plvi-approved-promotion.sh", import.meta.url).pathname;
  writeFileSync(aws, `#!/bin/zsh
case "$1:$2" in
  configure:get) print -- "arn:aws:iam::286853118812:mfa/approved-device" ;;
  sts:get-session-token) print -- '{"Credentials":{"AccessKeyId":"dummy","SecretAccessKey":"dummy","SessionToken":"dummy"}}' ;;
  sts:get-caller-identity) print -- "286853118812" ;;
  sts:assume-role) print -r -- "$@" > ${JSON.stringify(marker)}; exit 77 ;;
  *) exit 98 ;;
esac
`, { mode: 0o700 });
  const expectProgram = `set timeout 120
set env(PATH) "${dir}:$env(PATH)"
spawn -noecho zsh ${runner} --run
expect {
  "Current MFA TOTP (not stored):" { send -- "123456\\r"; exp_continue }
  eof { set result [wait]; exit [lindex $result 3] }
  timeout { exit 2 }
}`;
  try {
    const run = spawnSync("expect", ["-c", expectProgram], { encoding: "utf8", timeout: 120_000, env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } });
    assert.equal(run.status, 77, `${run.stdout}\n${run.stderr}`);
    assert.match(readFileSync(marker, "utf8"), /--role-arn arn:aws:iam::286853118812:role\/WitnessTreePlviArchivePromotionUploader/);
    assert.doesNotMatch(readFileSync(marker, "utf8"), /286853118812ole/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
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
