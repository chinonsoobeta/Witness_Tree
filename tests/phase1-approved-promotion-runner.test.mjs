import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const runner = readFileSync(new URL("../scripts/run-phase1-approved-promotion.sh", import.meta.url), "utf8");

test("the three-artifact runner is preflight-first and binds every approved checksum and canonical key", () => {
  for (const mode of ["--preflight", "--run", "--resume", "--validate-resume-state"]) assert.match(runner, new RegExp(mode));
  for (const value of ["c6f41dff46d91812874672edb53233dac4126952132ad6d1131ad47b11ad7aad", "86282401706ac1bd60fb3ed55c14ef6f2ae689decfbd9db178a725912522e124", "4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93", "ca_forest_harvest_1985-2022.zip", "ca_canopy_height_2022.zip", "federalelectoraldistricts_2025_shp.zip"]) assert.match(runner, new RegExp(value));
  assert.match(runner, /2033-08-12T00:00:00Z/);
  assert.match(runner, /aws configure get mfa_serial --profile/);
  assert.doesNotMatch(runner, /list-mfa-devices|aws iam |DeleteObject|BypassGovernanceRetention/i);
});

test("the canopy archive uses explicit checked multipart calls and never aborts an unfinished upload", () => {
  assert.match(runner, /create-multipart-upload[\s\S]*--checksum-algorithm CRC64NVME/);
  assert.match(runner, /upload-part[\s\S]*--part-number/);
  assert.match(runner, /complete-multipart-upload[\s\S]*file:\/\//);
  assert.doesNotMatch(runner, /abort-multipart-upload/);
  assert.match(runner, /An approved payload key already has a version; no replacement was attempted/);
  assert.match(runner, /get-object-retention[\s\S]*Retention\.Mode == "COMPLIANCE"/);
  assert.match(runner, /list-parts[\s\S]*Remote multipart parts do not exactly match private resume state/);
  assert.match(runner, /Private resume state does not bind the exact approved canopy upload; no storage call was made/);
  assert.match(runner, /private resume state was preserved unchanged\. Resume with:/);
  assert.doesNotMatch(runner, /DeleteObject|BypassGovernanceRetention|abort-multipart-upload/);
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
  sts:get-session-token|sts:assume-role) print -- '{"Credentials":{"AccessKeyId":"dummy","SecretAccessKey":"dummy","SessionToken":"dummy","Expiration":"2099-01-01T00:00:00Z"}}' ;;
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

test("a malformed private resume state fails before a TOTP prompt, STS, or S3 call", () => {
  const dir = mkdtempSync(join(tmpdir(), "phase1-approved-resume-rejection-"));
  const marker = join(dir, "calls");
  const state = join(dir, "resume.json");
  const aws = join(dir, "aws");
  const stat = join(dir, "stat");
  const shasum = join(dir, "shasum");
  writeFileSync(state, "+{not-json}\n", { mode: 0o600 });
  writeFileSync(aws, `#!/bin/zsh
print -- "$1:$2" >> ${JSON.stringify(marker)}
exit 99
`, { mode: 0o700 });
  writeFileSync(stat, `#!/bin/zsh
case "$3" in
  *CA_Forest_Harvest_1985-2022.zip) print -- 247945479 ;;
  *CA_canopy_height_2022.zip) print -- 10347564066 ;;
  *FederalElectoralDistricts_2025_SHP.zip) print -- 10301648 ;;
  *.json) print -- 600 ;;
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
  const executable = new URL("../scripts/run-phase1-approved-promotion.sh", import.meta.url).pathname;
  try {
    const run = spawnSync("zsh", [executable, "--resume", state], { encoding: "utf8", env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } });
    assert.equal(run.status, 65, `${run.stdout}\n${run.stderr}`);
    assert.match(`${run.stdout}${run.stderr}`, /Private resume state does not bind the exact approved canopy upload/);
    assert.doesNotMatch(`${run.stdout}${run.stderr}`, /Current MFA TOTP/);
    assert.equal(existsSync(marker), false);
    assert.equal(readFileSync(state, "utf8"), "+{not-json}\n");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the explicit resume-state validator is no-TOTP and no-AWS after exact local preflight", () => {
  const dir = mkdtempSync(join(tmpdir(), "phase1-approved-resume-validation-"));
  const marker = join(dir, "calls");
  const state = join(dir, "resume.json");
  const payloadKey = "raw/nrcan-forest-canopy-height-2022/undeclared/2026-08-14T18-57-22Z/86282401706ac1bd60fb3ed55c14ef6f2ae689decfbd9db178a725912522e124/payload/ca_canopy_height_2022.zip";
  const parts = Array.from({ length: 49 }, (_, index) => ({ PartNumber: index + 1, ETag: `"${String(index + 1).padStart(32, "0")}"`, ChecksumCRC64NVME: "AAAAAAAAAAA=", Size: 67_108_864 }));
  writeFileSync(state, `${JSON.stringify({ schemaVersion: 1, bucket: "witness-tree-raw-archive-ca-central-1", region: "ca-central-1", key: payloadKey, uploadId: "private-upload-id-that-is-never-printed", partSize: 67_108_864, parts })}\n`, { mode: 0o600 });
  writeFileSync(join(dir, "aws"), `#!/bin/zsh\nprint -- called >> ${JSON.stringify(marker)}\nexit 99\n`, { mode: 0o700 });
  writeFileSync(join(dir, "stat"), `#!/bin/zsh
case "$3" in
  *CA_Forest_Harvest_1985-2022.zip) print -- 247945479 ;;
  *CA_canopy_height_2022.zip) print -- 10347564066 ;;
  *FederalElectoralDistricts_2025_SHP.zip) print -- 10301648 ;;
  *.json) print -- 600 ;;
  *) exit 99 ;;
esac
`, { mode: 0o700 });
  writeFileSync(join(dir, "shasum"), `#!/bin/zsh
case "$3" in
  *CA_Forest_Harvest_1985-2022.zip) print -- "c6f41dff46d91812874672edb53233dac4126952132ad6d1131ad47b11ad7aad  $3" ;;
  *CA_canopy_height_2022.zip) print -- "86282401706ac1bd60fb3ed55c14ef6f2ae689decfbd9db178a725912522e124  $3" ;;
  *FederalElectoralDistricts_2025_SHP.zip) print -- "4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93  $3" ;;
  *) exit 99 ;;
esac
`, { mode: 0o700 });
  const executable = new URL("../scripts/run-phase1-approved-promotion.sh", import.meta.url).pathname;
  try {
    const run = spawnSync("zsh", [executable, "--validate-resume-state", state], { encoding: "utf8", env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } });
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    assert.match(run.stdout, /Private canopy resume state validation passed; no TOTP or AWS call was made/);
    assert.equal(existsSync(marker), false);
    assert.doesNotMatch(`${run.stdout}${run.stderr}`, /private-upload-id/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("an expired resume preserves the private state and a fresh invocation completes from the same verified 49 parts", () => {
  const dir = mkdtempSync(join(tmpdir(), "phase1-approved-resume-"));
  const marker = join(dir, "calls");
  const state = join(dir, "resume.json");
  const payloadKey = "raw/nrcan-forest-canopy-height-2022/undeclared/2026-08-14T18-57-22Z/86282401706ac1bd60fb3ed55c14ef6f2ae689decfbd9db178a725912522e124/payload/ca_canopy_height_2022.zip";
  const initialParts = Array.from({ length: 49 }, (_, index) => ({ PartNumber: index + 1, ETag: `"${String(index + 1).padStart(32, "0")}"`, ChecksumCRC64NVME: "AAAAAAAAAAA=", Size: 67_108_864 }));
  writeFileSync(state, `${JSON.stringify({ schemaVersion: 1, bucket: "witness-tree-raw-archive-ca-central-1", region: "ca-central-1", key: payloadKey, uploadId: "private-upload-id-that-is-never-printed", partSize: 67_108_864, parts: initialParts })}\n`, { mode: 0o600 });
  const aws = join(dir, "aws");
  const stat = join(dir, "stat");
  const shasum = join(dir, "shasum");
  const dd = join(dir, "dd");
  const listResponse = JSON.stringify({ Parts: initialParts });
  writeFileSync(aws, `#!/bin/zsh
print -- "$1:$2" >> ${JSON.stringify(marker)}
case "$1:$2" in
  configure:get) print -- "arn:aws:iam::286853118812:mfa/a-different-safe-device-path" ;;
  sts:get-session-token|sts:assume-role) print -- '{"Credentials":{"AccessKeyId":"dummy","SecretAccessKey":"dummy","SessionToken":"dummy","Expiration":"2099-01-01T00:00:00Z"}}' ;;
  sts:get-caller-identity) print -- 286853118812 ;;
  s3api:list-parts) print -r -- ${JSON.stringify(listResponse)} ;;
  s3api:upload-part) if [[ "\${FAKE_PHASE:-}" == expired ]]; then print -u2 -- ExpiredToken; exit 255; fi; jq -cn --arg ETag '"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"' --arg ChecksumCRC64NVME AAAAAAAAAAA= '{ETag:$ETag,ChecksumCRC64NVME:$ChecksumCRC64NVME}' ;;
  s3api:complete-multipart-upload) print -- '{"VersionId":"version-1","ChecksumCRC64NVME":"AAAAAAAAAAA="}' ;;
  s3api:put-object) print -- '{"VersionId":"sidecar-version","ChecksumCRC64NVME":"AAAAAAAAAAA="}' ;;
  s3api:head-object) if [[ "$*" == *"manifest.json"* ]]; then print -- '{"VersionId":"sidecar-version","ChecksumCRC64NVME":"AAAAAAAAAAA="}'; else print -- '{"VersionId":"version-1","ContentLength":10347564066,"ChecksumCRC64NVME":"AAAAAAAAAAA="}'; fi ;;
  s3api:put-object-retention) print -- '{}' ;;
  s3api:get-object-retention) print -- '{"Retention":{"Mode":"COMPLIANCE","RetainUntilDate":"2033-08-12T00:00:00Z"}}' ;;
  *) print -u2 -- "unexpected: $*"; exit 99 ;;
esac
`, { mode: 0o700 });
  writeFileSync(stat, `#!/bin/zsh
case "$3" in
  *CA_Forest_Harvest_1985-2022.zip) print -- 247945479 ;;
  *CA_canopy_height_2022.zip) print -- 10347564066 ;;
  *FederalElectoralDistricts_2025_SHP.zip) print -- 10301648 ;;
  *.json) print -- 600 ;;
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
  writeFileSync(dd, `#!/bin/zsh
for argument in "$@"; do [[ "$argument" == of=* ]] && print -n -- x > "\${argument#of=}"; done
exit 0
`, { mode: 0o700 });
  const executable = new URL("../scripts/run-phase1-approved-promotion.sh", import.meta.url).pathname;
  const invoke = (phase) => spawnSync("expect", ["-c", `set timeout 120
set env(PATH) ${JSON.stringify(`${dir}:${process.env.PATH}`)}
set env(FAKE_PHASE) ${phase}
spawn -noecho zsh ${JSON.stringify(executable)} --resume ${JSON.stringify(state)}
expect {
  "Current MFA TOTP (not stored):" { send -- "123456\\r"; exp_continue }
  eof { set result [wait]; exit [lindex $result 3] }
  timeout { exit 2 }
}`], { encoding: "utf8", timeout: 120_000, env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, FAKE_PHASE: phase } });
  try {
    const expired = invoke("expired");
    assert.equal(expired.status, 75, `${expired.stdout}\n${expired.stderr}`);
    assert.match(`${expired.stdout}${expired.stderr}`, /private resume state was preserved unchanged/);
    assert.doesNotMatch(`${expired.stdout}${expired.stderr}`, /123456|private-upload-id/);
    assert.equal(JSON.parse(readFileSync(state, "utf8")).parts.length, 49);
    const complete = invoke("complete");
    assert.equal(complete.status, 0, `${complete.stdout}\n${complete.stderr}`);
    assert.match(`${complete.stdout}${complete.stderr}`, /Canopy multipart resume completed with required read-backs/);
    const completedState = JSON.parse(readFileSync(state, "utf8"));
    assert.equal(completedState.parts.length, 155);
    assert.doesNotMatch(readFileSync(state, "utf8"), /dummy|123456|SecretAccessKey|SessionToken/);
    const calls = readFileSync(marker, "utf8");
    assert.match(calls, /s3api:list-parts/);
    assert.match(calls, /s3api:complete-multipart-upload/);
    assert.doesNotMatch(calls, /abort|delete|bypass/i);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
