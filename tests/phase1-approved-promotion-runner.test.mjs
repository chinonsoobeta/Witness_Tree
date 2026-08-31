import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const runner = readFileSync(new URL("../scripts/run-phase1-approved-promotion.sh", import.meta.url), "utf8");
const directMfaHelper = readFileSync(new URL("../scripts/aws-direct-mfa-role-session.sh", import.meta.url), "utf8");

test("the three-artifact runner is preflight-first and binds every approved checksum and canonical key", () => {
  for (const mode of ["--preflight", "--run", "--run-federal", "--resume", "--validate-resume-state"]) assert.match(runner, new RegExp(mode));
  for (const value of ["c6f41dff46d91812874672edb53233dac4126952132ad6d1131ad47b11ad7aad", "86282401706ac1bd60fb3ed55c14ef6f2ae689decfbd9db178a725912522e124", "4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93", "ca_forest_harvest_1985-2022.zip", "ca_canopy_height_2022.zip", "federalelectoraldistricts_2025_shp.zip"]) assert.match(runner, new RegExp(value));
  assert.match(runner, /2033-08-12T00:00:00Z/);
  assert.match(directMfaHelper, /aws configure get mfa_serial --profile/);
  assert.doesNotMatch(runner, /list-mfa-devices|aws iam |DeleteObject|BypassGovernanceRetention/i);
});

test("phase-one preflight reaches no AWS command when an approved local payload is absent", () => {
  const dir = mkdtempSync(join(tmpdir(), "phase1-preflight-no-aws-"));
  const marker = join(dir, "aws-called");
  const executable = new URL("../scripts/run-phase1-approved-promotion.sh", import.meta.url).pathname;
  writeFileSync(join(dir, "aws"), `#!/bin/zsh\ntouch ${JSON.stringify(marker)}\nexit 91\n`, { mode: 0o700 });
  try {
    const run = spawnSync("zsh", [executable, "--preflight"], { encoding: "utf8", env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, WITNESS_TREE_DATA_ROOT: join(dir, "absent-data") } });
    assert.equal(run.status, 65, run.stdout + run.stderr);
    assert.match(run.stderr, /Approved local payload is missing; no TOTP or AWS call was made/);
    assert.equal(existsSync(marker), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("federal-only mode cannot revisit the archived harvest or preserved canopy prefix", () => {
  assert.match(runner, /MODE.*run-federal/);
  assert.match(runner, /PROMOTION_INDICES=\(3\)/);
  assert.match(runner, /for i in \$PROMOTION_INDICES/);
  assert.match(runner, /Harvest is already archived and the canopy prefix is resumed separately/);
});

function writeApprovedPromotionLocalChecks(dir) {
  writeFileSync(join(dir, "stat"), `#!/bin/zsh
case "$3" in
  *CA_Forest_Harvest_1985-2022.zip) print -- 247945479 ;;
  *CA_canopy_height_2022.zip) print -- 10347564066 ;;
  *FederalElectoralDistricts_2025_SHP.zip) print -- 10301648 ;;
  *.json) /usr/bin/stat -f %z "$3" ;;
  *) exit 99 ;;
esac
`, { mode: 0o700 });
  writeFileSync(join(dir, "shasum"), `#!/bin/zsh
case "$3" in
  *CA_Forest_Harvest_1985-2022.zip) print -- "c6f41dff46d91812874672edb53233dac4126952132ad6d1131ad47b11ad7aad  $3" ;;
  *CA_canopy_height_2022.zip) print -- "86282401706ac1bd60fb3ed55c14ef6f2ae689decfbd9db178a725912522e124  $3" ;;
  *FederalElectoralDistricts_2025_SHP.zip) print -- "4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93  $3" ;;
  *federal-existing-payload) print -- "4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93  $3" ;;
  *) exit 99 ;;
esac
`, { mode: 0o700 });
}

function runFederalWithTotp(executable, dir) {
  return spawnSync("expect", ["-c", `set timeout 120
set env(PATH) ${JSON.stringify(`${dir}:${process.env.PATH}`)}
spawn -noecho zsh ${JSON.stringify(executable)} --run-federal
expect {
  "Current MFA TOTP (not stored):" { send -- "123456\\r"; exp_continue }
  eof { set result [wait]; exit [lindex $result 3] }
  timeout { exit 2 }
}`], { encoding: "utf8", timeout: 120_000, env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } });
}

test("federal recovery audits existing exact payload and manifest versions, applies only missing retention, and never puts another object", () => {
  const dir = mkdtempSync(join(tmpdir(), "phase1-federal-recovery-"));
  const marker = join(dir, "calls");
  const executable = new URL("../scripts/run-phase1-approved-promotion.sh", import.meta.url).pathname;
  writeApprovedPromotionLocalChecks(dir);
  writeFileSync(join(dir, "aws"), `#!/bin/zsh
print -- "$1:$2:$*" >> ${JSON.stringify(marker)}
case "$1:$2" in
  configure:get) print -- "arn:aws:iam::286853118812:mfa/witness-tree/archive-operator.device" ;;
  sts:get-caller-identity) print -- '{"Account":"286853118812","Arn":"arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator"}' ;;
  sts:assume-role) print -- '{"Credentials":{"AccessKeyId":"dummy","SecretAccessKey":"dummy","SessionToken":"dummy","Expiration":"2099-01-01T00:00:00Z"},"AssumedRoleUser":{"Arn":"arn:aws:sts::286853118812:assumed-role/WitnessTreeArchivePromotionUploader/witness-tree-approved-promotion"}}' ;;
  s3api:head-object)
    if [[ "$*" == *manifest.json* ]]; then print -- '{"VersionId":"manifest-v1","ContentLength":572,"ChecksumType":"FULL_OBJECT","ChecksumCRC64NVME":"AAAAAAAAAAA="}'; else print -- '{"VersionId":"payload-v1","ContentLength":10301648,"ChecksumType":"FULL_OBJECT","ChecksumCRC64NVME":"AAAAAAAAAAA="}'; fi ;;
  s3api:get-object)
    output="\${@: -1}"
    if [[ "$*" == *manifest.json* ]]; then
      jq -n --arg id elections-canada-federal-electoral-districts-45th-general-election-2025-shp --arg payload raw/elections-canada-federal-electoral-districts-45th-general-election-2025-shp/federal-electoral-districts-2025-shp/2026-08-14T17-42-35Z/4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93/payload/federalelectoraldistricts_2025_shp.zip --arg sha 4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93 --argjson bytes 10301648 '{schemaVersion:1,sourceId:$id,payloadKey:$payload,byteLength:$bytes,sha256:$sha,notice:"Approved raw payload; no transformation, ingestion, or release."}' > "$output"
    else print -- payload > "$output"; fi
    print -- '{}' ;;
  s3api:get-object-retention)
    if [[ "$*" == *manifest.json* && -f ${JSON.stringify(join(dir, "manifest-retained"))} ]] || [[ "$*" != *manifest.json* && -f ${JSON.stringify(join(dir, "payload-retained"))} ]]; then print -- '{"Retention":{"Mode":"COMPLIANCE","RetainUntilDate":"2033-08-12T00:00:00Z"}}'; else print -u2 -- NoSuchObjectLockConfiguration; exit 255; fi ;;
  s3api:put-object-retention)
    if [[ "$*" == *manifest.json* ]]; then : > ${JSON.stringify(join(dir, "manifest-retained"))}; else : > ${JSON.stringify(join(dir, "payload-retained"))}; fi
    print -- '{}' ;;
  s3api:put-object) print -u2 -- "unexpected object overwrite"; exit 91 ;;
  *) print -u2 -- "unexpected: $*"; exit 99 ;;
esac
`, { mode: 0o700 });
  try {
    const run = runFederalWithTotp(executable, dir);
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    assert.match(`${run.stdout}${run.stderr}`, /exact version-specific payload, manifest, and retention read-backs/);
    assert.doesNotMatch(`${run.stdout}${run.stderr}`, /123456/);
    const calls = readFileSync(marker, "utf8");
    assert.equal((calls.match(/s3api:put-object:/g) ?? []).length, 0, calls);
    assert.equal((calls.match(/s3api:put-object-retention:/g) ?? []).length, 2, calls);
    assert.match(calls, /s3api:get-object:/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("federal recovery fails closed on a mismatched existing manifest without a put-object", () => {
  const dir = mkdtempSync(join(tmpdir(), "phase1-federal-recovery-mismatch-"));
  const marker = join(dir, "calls");
  const executable = new URL("../scripts/run-phase1-approved-promotion.sh", import.meta.url).pathname;
  writeApprovedPromotionLocalChecks(dir);
  writeFileSync(join(dir, "aws"), `#!/bin/zsh
print -- "$1:$2:$*" >> ${JSON.stringify(marker)}
case "$1:$2" in
  configure:get) print -- "arn:aws:iam::286853118812:mfa/witness-tree/archive-operator.device" ;;
  sts:get-caller-identity) print -- '{"Account":"286853118812","Arn":"arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator"}' ;;
  sts:assume-role) print -- '{"Credentials":{"AccessKeyId":"dummy","SecretAccessKey":"dummy","SessionToken":"dummy","Expiration":"2099-01-01T00:00:00Z"},"AssumedRoleUser":{"Arn":"arn:aws:sts::286853118812:assumed-role/WitnessTreeArchivePromotionUploader/witness-tree-approved-promotion"}}' ;;
  s3api:head-object) if [[ "$*" == *manifest.json* ]]; then print -- '{"VersionId":"manifest-v1","ContentLength":572,"ChecksumType":"FULL_OBJECT","ChecksumCRC64NVME":"AAAAAAAAAAA="}'; else print -- '{"VersionId":"payload-v1","ContentLength":10301648,"ChecksumType":"FULL_OBJECT","ChecksumCRC64NVME":"AAAAAAAAAAA="}'; fi ;;
  s3api:get-object) output="\${@: -1}"; if [[ "$*" == *manifest.json* ]]; then print -- '{"wrong":"manifest"}' > "$output"; else print -- payload > "$output"; fi; print -- '{}' ;;
  s3api:put-object|s3api:put-object-retention) print -u2 -- "unexpected write"; exit 91 ;;
  *) print -u2 -- "unexpected: $*"; exit 99 ;;
esac
`, { mode: 0o700 });
  try {
    const run = runFederalWithTotp(executable, dir);
    assert.equal(run.status, 73, `${run.stdout}\n${run.stderr}`);
    assert.match(`${run.stdout}${run.stderr}`, /Existing manifest content differs from the deterministic approved manifest/);
    const calls = readFileSync(marker, "utf8");
    assert.equal((calls.match(/s3api:put-object:/g) ?? []).length, 0, calls);
    assert.equal((calls.match(/s3api:put-object-retention:/g) ?? []).length, 0, calls);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("federal recovery treats an unrecognized retention read error as ambiguous and performs no retention mutation", () => {
  const dir = mkdtempSync(join(tmpdir(), "phase1-federal-retention-error-"));
  const marker = join(dir, "calls");
  const executable = new URL("../scripts/run-phase1-approved-promotion.sh", import.meta.url).pathname;
  writeApprovedPromotionLocalChecks(dir);
  writeFileSync(join(dir, "aws"), `#!/bin/zsh
print -- "$1:$2:$*" >> ${JSON.stringify(marker)}
case "$1:$2" in
  configure:get) print -- "arn:aws:iam::286853118812:mfa/witness-tree/archive-operator.device" ;;
  sts:get-caller-identity) print -- '{"Account":"286853118812","Arn":"arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator"}' ;;
  sts:assume-role) print -- '{"Credentials":{"AccessKeyId":"dummy","SecretAccessKey":"dummy","SessionToken":"dummy","Expiration":"2099-01-01T00:00:00Z"},"AssumedRoleUser":{"Arn":"arn:aws:sts::286853118812:assumed-role/WitnessTreeArchivePromotionUploader/witness-tree-approved-promotion"}}' ;;
  s3api:head-object) if [[ "$*" == *manifest.json* ]]; then print -- '{"VersionId":"manifest-v1","ContentLength":572,"ChecksumType":"FULL_OBJECT","ChecksumCRC64NVME":"AAAAAAAAAAA="}'; else print -- '{"VersionId":"payload-v1","ContentLength":10301648,"ChecksumType":"FULL_OBJECT","ChecksumCRC64NVME":"AAAAAAAAAAA="}'; fi ;;
  s3api:get-object)
    output="\${@: -1}"
    if [[ "$*" == *manifest.json* ]]; then jq -n --arg id elections-canada-federal-electoral-districts-45th-general-election-2025-shp --arg payload raw/elections-canada-federal-electoral-districts-45th-general-election-2025-shp/federal-electoral-districts-2025-shp/2026-08-14T17-42-35Z/4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93/payload/federalelectoraldistricts_2025_shp.zip --arg sha 4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93 --argjson bytes 10301648 '{schemaVersion:1,sourceId:$id,payloadKey:$payload,byteLength:$bytes,sha256:$sha,notice:"Approved raw payload; no transformation, ingestion, or release."}' > "$output"; else print -- payload > "$output"; fi
    print -- '{}' ;;
  s3api:get-object-retention) print -u2 -- AccessDenied; exit 255 ;;
  s3api:put-object|s3api:put-object-retention) print -u2 -- "unexpected write"; exit 91 ;;
  *) print -u2 -- "unexpected: $*"; exit 99 ;;
esac
`, { mode: 0o700 });
  try {
    const run = runFederalWithTotp(executable, dir);
    assert.equal(run.status, 73, `${run.stdout}\n${run.stderr}`);
    assert.match(`${run.stdout}${run.stderr}`, /Could not read payload retention; recovery refused/);
    const calls = readFileSync(marker, "utf8");
    assert.equal((calls.match(/s3api:put-object:/g) ?? []).length, 0, calls);
    assert.equal((calls.match(/s3api:put-object-retention:/g) ?? []).length, 0, calls);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("federal recovery rejects an existing payload whose exact-version SHA-256 differs from the approved local artifact", () => {
  const dir = mkdtempSync(join(tmpdir(), "phase1-federal-payload-sha-mismatch-"));
  const marker = join(dir, "calls");
  const executable = new URL("../scripts/run-phase1-approved-promotion.sh", import.meta.url).pathname;
  writeApprovedPromotionLocalChecks(dir);
  writeFileSync(join(dir, "shasum"), `#!/bin/zsh
case "$3" in
  *CA_Forest_Harvest_1985-2022.zip) print -- "c6f41dff46d91812874672edb53233dac4126952132ad6d1131ad47b11ad7aad  $3" ;;
  *CA_canopy_height_2022.zip) print -- "86282401706ac1bd60fb3ed55c14ef6f2ae689decfbd9db178a725912522e124  $3" ;;
  *FederalElectoralDistricts_2025_SHP.zip) print -- "4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93  $3" ;;
  *federal-existing-payload) print -- "0000000000000000000000000000000000000000000000000000000000000000  $3" ;;
  *) exit 99 ;;
esac
`, { mode: 0o700 });
  writeFileSync(join(dir, "aws"), `#!/bin/zsh
print -- "$1:$2:$*" >> ${JSON.stringify(marker)}
case "$1:$2" in
  configure:get) print -- "arn:aws:iam::286853118812:mfa/witness-tree/archive-operator.device" ;;
  sts:get-caller-identity) print -- '{"Account":"286853118812","Arn":"arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator"}' ;;
  sts:assume-role) print -- '{"Credentials":{"AccessKeyId":"dummy","SecretAccessKey":"dummy","SessionToken":"dummy","Expiration":"2099-01-01T00:00:00Z"},"AssumedRoleUser":{"Arn":"arn:aws:sts::286853118812:assumed-role/WitnessTreeArchivePromotionUploader/witness-tree-approved-promotion"}}' ;;
  s3api:head-object) if [[ "$*" == *manifest.json* ]]; then print -- '{"VersionId":"manifest-v1","ContentLength":572,"ChecksumType":"FULL_OBJECT","ChecksumCRC64NVME":"AAAAAAAAAAA="}'; else print -- '{"VersionId":"payload-v1","ContentLength":10301648,"ChecksumType":"FULL_OBJECT","ChecksumCRC64NVME":"AAAAAAAAAAA="}'; fi ;;
  s3api:get-object) output="\${@: -1}"; print -- payload > "$output"; print -- '{}' ;;
  s3api:put-object|s3api:put-object-retention) print -u2 -- "unexpected write"; exit 91 ;;
  *) print -u2 -- "unexpected: $*"; exit 99 ;;
esac
`, { mode: 0o700 });
  try {
    const run = runFederalWithTotp(executable, dir);
    assert.equal(run.status, 73, `${run.stdout}\n${run.stderr}`);
    assert.match(`${run.stdout}${run.stderr}`, /Existing payload bytes do not match the approved SHA-256/);
    const calls = readFileSync(marker, "utf8");
    assert.equal((calls.match(/s3api:put-object:/g) ?? []).length, 0, calls);
    assert.equal((calls.match(/s3api:put-object-retention:/g) ?? []).length, 0, calls);
  } finally { rmSync(dir, { recursive: true, force: true }); }
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
  sts:get-caller-identity) print -- '{"Account":"286853118812","Arn":"arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator"}' ;;
  sts:assume-role) print -- '{"Credentials":{"AccessKeyId":"dummy","SecretAccessKey":"dummy","SessionToken":"dummy","Expiration":"2099-01-01T00:00:00Z"},"AssumedRoleUser":{"Arn":"arn:aws:sts::286853118812:assumed-role/WitnessTreeArchivePromotionUploader/witness-tree-approved-promotion"}}' ;;
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
    assert.deepEqual(readFileSync(marker, "utf8").trim().split("\n"), ["sts:get-caller-identity", "configure:get", "sts:assume-role", "s3api:head-object", "s3api:put-object"]);
    assert.match(readFileSync(join(dir, "arguments"), "utf8"), /sts assume-role --profile WitnessTreeArchiveOperator --role-arn arn:aws:iam::286853118812:role\/WitnessTreeArchivePromotionUploader/);
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
case "$1:$2" in
  sts:get-caller-identity) print -- '{"Account":"286853118812","Arn":"arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator"}' ;;
  configure:get) print -- ${JSON.stringify(serial)} ;;
  *) exit 99 ;;
esac
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
    assert.deepEqual(readFileSync(marker, "utf8").trim().split("\n"), ["sts:get-caller-identity", "configure:get"]);
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

test("the explicit resume-state validator accepts safe contiguous prefixes at 49, 102, and 155 with no TOTP or AWS", () => {
  const dir = mkdtempSync(join(tmpdir(), "phase1-approved-resume-validation-"));
  const marker = join(dir, "calls");
  const state = join(dir, "resume.json");
  const payloadKey = "raw/nrcan-forest-canopy-height-2022/undeclared/2026-08-14T18-57-22Z/86282401706ac1bd60fb3ed55c14ef6f2ae689decfbd9db178a725912522e124/payload/ca_canopy_height_2022.zip";
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
    for (const count of [49, 102, 155]) {
      const parts = Array.from({ length: count }, (_, index) => ({ PartNumber: index + 1, ETag: `"etag-${index + 1}"`, ChecksumCRC64NVME: "AAAAAAAAAAA=", Size: index === 154 ? 12_799_010 : 67_108_864 }));
      writeFileSync(state, `${JSON.stringify({ schemaVersion: 1, bucket: "witness-tree-raw-archive-ca-central-1", region: "ca-central-1", key: payloadKey, uploadId: "private-upload-id-that-is-never-printed", partSize: 67_108_864, parts })}\n`, { mode: 0o600 });
      const run = spawnSync("zsh", [executable, "--validate-resume-state", state], { encoding: "utf8", env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } });
      assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
      assert.match(run.stdout, /Private canopy resume state validation passed; no TOTP or AWS call was made/);
    }
    assert.equal(existsSync(marker), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("resume-state validation rejects gaps, wrong sizes, bad acknowledgements, and an incorrect final remainder offline", () => {
  const dir = mkdtempSync(join(tmpdir(), "phase1-approved-resume-shape-rejection-"));
  const state = join(dir, "resume.json");
  const marker = join(dir, "calls");
  const payloadKey = "raw/nrcan-forest-canopy-height-2022/undeclared/2026-08-14T18-57-22Z/86282401706ac1bd60fb3ed55c14ef6f2ae689decfbd9db178a725912522e124/payload/ca_canopy_height_2022.zip";
  writeFileSync(join(dir, "aws"), `#!/bin/zsh\nprint -- called >> ${JSON.stringify(marker)}\nexit 99\n`, { mode: 0o700 });
  writeFileSync(join(dir, "stat"), `#!/bin/zsh
case "$3" in *CA_Forest_Harvest_1985-2022.zip) print -- 247945479 ;; *CA_canopy_height_2022.zip) print -- 10347564066 ;; *FederalElectoralDistricts_2025_SHP.zip) print -- 10301648 ;; *.json) print -- 600 ;; *) exit 99 ;; esac
`, { mode: 0o700 });
  writeFileSync(join(dir, "shasum"), `#!/bin/zsh
case "$3" in *CA_Forest_Harvest_1985-2022.zip) print -- "c6f41dff46d91812874672edb53233dac4126952132ad6d1131ad47b11ad7aad  $3" ;; *CA_canopy_height_2022.zip) print -- "86282401706ac1bd60fb3ed55c14ef6f2ae689decfbd9db178a725912522e124  $3" ;; *FederalElectoralDistricts_2025_SHP.zip) print -- "4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93  $3" ;; *) exit 99 ;; esac
`, { mode: 0o700 });
  const executable = new URL("../scripts/run-phase1-approved-promotion.sh", import.meta.url).pathname;
  const base = Array.from({ length: 102 }, (_, index) => ({ PartNumber: index + 1, ETag: `"etag-${index + 1}"`, ChecksumCRC64NVME: "AAAAAAAAAAA=", Size: 67_108_864 }));
  const cases = [
    (parts) => { parts[50].PartNumber = 52; },
    (parts) => { parts[50].Size = 67_108_865; },
    (parts) => { parts[50].ETag = ""; },
    (parts) => { parts[50].ChecksumCRC64NVME = ""; },
    (parts) => { while (parts.length < 155) parts.push({ PartNumber: parts.length + 1, ETag: `"etag-${parts.length + 1}"`, ChecksumCRC64NVME: "AAAAAAAAAAA=", Size: 67_108_864 }); }
  ];
  try {
    for (const mutate of cases) {
      const parts = structuredClone(base); mutate(parts);
      writeFileSync(state, `${JSON.stringify({ schemaVersion: 1, bucket: "witness-tree-raw-archive-ca-central-1", region: "ca-central-1", key: payloadKey, uploadId: "private-upload-id-that-is-never-printed", partSize: 67_108_864, parts })}\n`, { mode: 0o600 });
      const run = spawnSync("zsh", [executable, "--validate-resume-state", state], { encoding: "utf8", env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } });
      assert.equal(run.status, 65, `${run.stdout}\n${run.stderr}`);
      assert.match(`${run.stdout}${run.stderr}`, /Private resume state does not bind the exact approved canopy upload/);
    }
    assert.equal(existsSync(marker), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("PTY resume canonicalizes provider-only LastModified metadata and completes without re-upload", () => {
 for (const initialCount of [49, 102, 155]) {
  const dir = mkdtempSync(join(tmpdir(), "phase1-approved-resume-"));
  const marker = join(dir, "calls");
  const state = join(dir, "resume.json");
  const payloadKey = "raw/nrcan-forest-canopy-height-2022/undeclared/2026-08-14T18-57-22Z/86282401706ac1bd60fb3ed55c14ef6f2ae689decfbd9db178a725912522e124/payload/ca_canopy_height_2022.zip";
  const initialParts = Array.from({ length: initialCount }, (_, index) => ({ PartNumber: index + 1, ETag: `"${String(index + 1).padStart(32, "0")}"`, ChecksumCRC64NVME: "AAAAAAAAAAA=", Size: index === 154 ? 12_799_010 : 67_108_864, LastModified: "2026-08-20T18:00:00Z" }));
  writeFileSync(state, `${JSON.stringify({ schemaVersion: 1, bucket: "witness-tree-raw-archive-ca-central-1", region: "ca-central-1", key: payloadKey, uploadId: "private-upload-id-that-is-never-printed", partSize: 67_108_864, parts: initialParts })}\n`, { mode: 0o600 });
  const aws = join(dir, "aws");
  const stat = join(dir, "stat");
  const shasum = join(dir, "shasum");
  const dd = join(dir, "dd");
  const listResponse = JSON.stringify({ Parts: initialParts.map(({ PartNumber, ETag, ChecksumCRC64NVME, Size }) => ({ PartNumber, ETag, ChecksumCRC64NVME, Size })) });
  writeFileSync(aws, `#!/bin/zsh
print -- "$1:$2" >> ${JSON.stringify(marker)}
case "$1:$2" in
  configure:get) print -- "arn:aws:iam::286853118812:mfa/a-different-safe-device-path" ;;
  sts:get-caller-identity) print -- '{"Account":"286853118812","Arn":"arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator"}' ;;
  sts:assume-role) print -- '{"Credentials":{"AccessKeyId":"dummy","SecretAccessKey":"dummy","SessionToken":"dummy","Expiration":"2099-01-01T00:00:00Z"},"AssumedRoleUser":{"Arn":"arn:aws:sts::286853118812:assumed-role/WitnessTreeArchivePromotionUploader/witness-tree-approved-promotion"}}' ;;
  s3api:list-parts) print -r -- ${JSON.stringify(listResponse)} ;;
  s3api:upload-part) if [[ "\${FAKE_PHASE:-}" == expired ]]; then print -u2 -- ExpiredToken; exit 255; fi; jq -cn --arg ETag '"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"' --arg ChecksumCRC64NVME AAAAAAAAAAA= '{ETag:$ETag,ChecksumCRC64NVME:$ChecksumCRC64NVME}' ;;
  s3api:complete-multipart-upload)
    for argument in "$@"; do [[ "$argument" == file://* ]] && completion_file="\${argument#file://}"; done
    jq -e '.Parts|length == 155 and all(.[]; (keys|sort) == ["ChecksumCRC64NVME","ETag","PartNumber"])' "$completion_file" >/dev/null || exit 98
    print -- '{"VersionId":"version-1","ChecksumType":"FULL_OBJECT","ChecksumCRC64NVME":"AAAAAAAAAAA="}' ;;
  s3api:put-object) print -- '{"VersionId":"sidecar-version","ChecksumCRC64NVME":"AAAAAAAAAAA="}' ;;
  s3api:head-object) if [[ "$*" == *"manifest.json"* ]]; then print -- '{"VersionId":"sidecar-version","ContentLength":600,"ChecksumType":"FULL_OBJECT","ChecksumCRC64NVME":"AAAAAAAAAAA="}'; else print -- '{"VersionId":"version-1","ContentLength":10347564066,"ChecksumType":"FULL_OBJECT","ChecksumCRC64NVME":"AAAAAAAAAAA="}'; fi ;;
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
    if (initialCount < 155) {
      const expired = invoke("expired");
      assert.equal(expired.status, 75, `${expired.stdout}\n${expired.stderr}`);
      assert.match(`${expired.stdout}${expired.stderr}`, /private resume state was preserved unchanged/);
      assert.doesNotMatch(`${expired.stdout}${expired.stderr}`, /123456|private-upload-id/);
      assert.equal(JSON.parse(readFileSync(state, "utf8")).parts.length, initialCount);
    }
    const complete = invoke("complete");
    assert.equal(complete.status, 0, `${complete.stdout}\n${complete.stderr}`);
    assert.match(`${complete.stdout}${complete.stderr}`, /Canopy multipart resume completed with required read-backs/);
    const completedState = JSON.parse(readFileSync(state, "utf8"));
    assert.equal(completedState.parts.length, 155);
    assert.doesNotMatch(readFileSync(state, "utf8"), /dummy|123456|SecretAccessKey|SessionToken/);
    const calls = readFileSync(marker, "utf8");
    assert.match(calls, /s3api:list-parts/);
    assert.match(calls, /s3api:complete-multipart-upload/);
    if (initialCount === 155) assert.doesNotMatch(calls, /s3api:upload-part/);
    assert.doesNotMatch(calls, /abort|delete|bypass/i);
  } finally { rmSync(dir, { recursive: true, force: true }); }
 }
});
