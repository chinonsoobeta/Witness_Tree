import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const runner = readFileSync(new URL("../scripts/run-phase1-approved-promotion.sh", import.meta.url), "utf8");

test("the three-artifact runner is preflight-first and binds every approved checksum and canonical key", () => {
  assert.match(runner, /--preflight\|--run/);
  for (const value of ["c6f41dff46d91812874672edb53233dac4126952132ad6d1131ad47b11ad7aad", "86282401706ac1bd60fb3ed55c14ef6f2ae689decfbd9db178a725912522e124", "4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93", "ca_forest_harvest_1985-2022.zip", "ca_canopy_height_2022.zip", "federalelectoraldistricts_2025_shp.zip"]) assert.match(runner, new RegExp(value));
  assert.match(runner, /2033-08-12T00:00:00Z/);
  assert.match(runner, /aws configure get mfa_serial --profile/);
  assert.doesNotMatch(runner, /list-mfa-devices|aws iam |DeleteObject|BypassGovernanceRetention/i);
});

test("the canopy archive uses explicit checked multipart calls and abandons only incomplete uploads", () => {
  assert.match(runner, /create-multipart-upload[\s\S]*--checksum-algorithm CRC64NVME/);
  assert.match(runner, /upload-part[\s\S]*--part-number/);
  assert.match(runner, /complete-multipart-upload[\s\S]*file:\/\//);
  assert.match(runner, /abort-multipart-upload/);
  assert.match(runner, /An approved payload key already has a version; no replacement was attempted/);
  assert.match(runner, /get-object-retention[\s\S]*Retention\.Mode == "COMPLIANCE"/);
});

test("a visible zsh read prompt uses the configured exact MFA serial and exact role ARN before an S3 boundary", () => {
  const dir = mkdtempSync(join(tmpdir(), "phase1-approved-promotion-"));
  const marker = join(dir, "calls");
  const aws = join(dir, "aws");
  const stat = join(dir, "stat");
  const shasum = join(dir, "shasum");
  writeFileSync(aws, `#!/bin/zsh
print -- "$1:$2" >> ${JSON.stringify(marker)}
print -- "$*" >> ${JSON.stringify(join(dir, "arguments"))}
case "$1:$2" in
  configure:get) print -- "arn:aws:iam::286853118812:mfa/witness-tree/archive-operator.device" ;;
  sts:get-session-token|sts:assume-role) print -- '{"Credentials":{"AccessKeyId":"dummy","SecretAccessKey":"dummy","SessionToken":"dummy"}}' ;;
  sts:get-caller-identity) print -- "286853118812" ;;
  s3api:head-object) exit 1 ;;
  s3api:put-object) exit 88 ;;
  *) exit 99 ;;
esac
`, { mode: 0o700 });
  writeFileSync(stat, `#!/bin/zsh
case "$3" in
  *CA_Forest_Harvest_1985-2022.zip) print -- 247945479 ;;
  *CA_canopy_height_2022.zip) print -- 10347564066 ;;
  *FederalElectoralDistricts_2025_SHP.zip) print -- 10301648 ;;
  *) exit 99 ;;
esac
`, { mode: 0o700 });
  writeFileSync(shasum, `#!/bin/zsh
case "$3" in
  *CA_Forest_Harvest_1985-2022.zip) print -- "c6f41dff46d91812874672edb53233dac4126952132ad6d1131ad47b11ad7aad  $3" ;;
  *CA_canopy_height_2022.zip) print -- "86282401706ac1bd60fb3ed55c14ef6f2ae689decfbd9db178a725912522e124  $3" ;;
  *FederalElectoralDistricts_2025_SHP.zip) print -- "4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93  $3" ;;
  *) exit 99 ;;
esac
`, { mode: 0o700 });
  const runner = new URL("../scripts/run-phase1-approved-promotion.sh", import.meta.url).pathname;
  const program = `set timeout 120
set env(PATH) ${JSON.stringify(`${dir}:${process.env.PATH}`)}
spawn -noecho zsh ${JSON.stringify(runner)} --run
expect {
  "Current MFA TOTP (not stored):" { send -- "123456\\r"; exp_continue }
  eof { set result [wait]; exit [lindex $result 3] }
  timeout { exit 2 }
}`;
  try {
    const run = spawnSync("expect", ["-c", program], { encoding: "utf8", timeout: 120_000, env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } });
    assert.equal(run.status, 70, `${run.stdout}\n${run.stderr}`);
    assert.match(`${run.stdout}${run.stderr}`, /Payload upload failed/);
    assert.doesNotMatch(`${run.stdout}${run.stderr}`, /123456/);
    assert.deepEqual(readFileSync(marker, "utf8").trim().split("\n"), ["configure:get", "sts:get-session-token", "sts:get-caller-identity", "sts:assume-role", "s3api:head-object", "s3api:put-object"]);
    assert.match(readFileSync(join(dir, "arguments"), "utf8"), /sts assume-role --role-arn arn:aws:iam::286853118812:role\/WitnessTreeArchivePromotionUploader/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("empty or wrong-account configured MFA serial stops after local config lookup and never reaches STS or S3", () => {
  for (const serial of ["", "arn:aws:iam::999999999999:mfa/another-device"]) {
    const dir = mkdtempSync(join(tmpdir(), "phase1-approved-mfa-rejection-"));
    const marker = join(dir, "calls");
    const aws = join(dir, "aws");
    const stat = join(dir, "stat");
    const shasum = join(dir, "shasum");
    writeFileSync(aws, `#!/bin/zsh
print -- "$1:$2" >> ${JSON.stringify(marker)}
case "$1:$2" in configure:get) print -- ${JSON.stringify(serial)} ;; *) exit 99 ;; esac
`, { mode: 0o700 });
    writeFileSync(stat, `#!/bin/zsh
case "$3" in *CA_Forest_Harvest_1985-2022.zip) print -- 247945479 ;; *CA_canopy_height_2022.zip) print -- 10347564066 ;; *FederalElectoralDistricts_2025_SHP.zip) print -- 10301648 ;; *) exit 99 ;; esac
`, { mode: 0o700 });
    writeFileSync(shasum, `#!/bin/zsh
case "$3" in *CA_Forest_Harvest_1985-2022.zip) print -- "c6f41dff46d91812874672edb53233dac4126952132ad6d1131ad47b11ad7aad  $3" ;; *CA_canopy_height_2022.zip) print -- "86282401706ac1bd60fb3ed55c14ef6f2ae689decfbd9db178a725912522e124  $3" ;; *FederalElectoralDistricts_2025_SHP.zip) print -- "4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93  $3" ;; *) exit 99 ;; esac
`, { mode: 0o700 });
    const runner = new URL("../scripts/run-phase1-approved-promotion.sh", import.meta.url).pathname;
    const program = `set timeout 120
set env(PATH) ${JSON.stringify(`${dir}:${process.env.PATH}`)}
spawn -noecho zsh ${JSON.stringify(runner)} --run
expect {
  "Current MFA TOTP (not stored):" { send -- "123456\\r"; exp_continue }
  eof { set result [wait]; exit [lindex $result 3] }
  timeout { exit 2 }
}`;
    try {
      const run = spawnSync("expect", ["-c", program], { encoding: "utf8", timeout: 120_000, env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } });
      assert.equal(run.status, 69, `${run.stdout}\n${run.stderr}`);
      assert.match(`${run.stdout}${run.stderr}`, /Configured MFA serial is absent, malformed, or outside the approved account/);
      assert.doesNotMatch(`${run.stdout}${run.stderr}`, /123456/);
      assert.deepEqual(readFileSync(marker, "utf8").trim().split("\n"), ["configure:get"]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});
