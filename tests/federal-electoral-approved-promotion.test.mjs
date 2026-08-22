import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assembleFederalAttestation } from "../scripts/assemble-federal-electoral-promotion-attestation.mjs";
import { validatePrivateFederalAttestation, validateRedactedFederalAttestation } from "../scripts/check-federal-electoral-promotion-attestation.mjs";

const runner = new URL("../scripts/run-federal-electoral-approved-promotion.sh", import.meta.url).pathname;
const plan = JSON.parse(readFileSync(new URL("../data/elections-canada-fed-2025-promotion-preparation.json", import.meta.url)));

function invoke(dir, phase) {
  const privateOutput = join(dir, "private.json");
  const publicOutput = join(dir, "public.json");
  const program = `set timeout 120
set env(PATH) ${JSON.stringify(`${dir}:${process.env.PATH}`)}
set env(FAKE_PHASE) ${JSON.stringify(phase)}
set env(FEDERAL_PRIVATE_OUTPUT) ${JSON.stringify(privateOutput)}
set env(FEDERAL_PUBLIC_OUTPUT) ${JSON.stringify(publicOutput)}
spawn -noecho zsh ${JSON.stringify(runner)} --run
expect {
  "Current MFA TOTP (not stored):" { send -- "123456\\r"; exp_continue }
  eof { set result [wait]; exit [lindex $result 3] }
  timeout { exit 2 }
}`;
  return { run: spawnSync("expect", ["-c", program], { encoding: "utf8", timeout: 120_000, env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, FAKE_PHASE: phase, FEDERAL_PRIVATE_OUTPUT: privateOutput, FEDERAL_PUBLIC_OUTPUT: publicOutput } }), privateOutput, publicOutput };
}

function fixture(phase) {
  const dir = mkdtempSync(join(tmpdir(), "federal-electoral-promotion-"));
  const marker = join(dir, "calls");
  writeFileSync(join(dir, "aws"), `#!/bin/zsh
print -- "$1:$2 $*" >> ${JSON.stringify(marker)}
case "$1:$2" in
  configure:get) print -- 'arn:aws:iam::286853118812:mfa/witness-tree/archive-operator.device' ;;
  sts:get-session-token|sts:assume-role) print -- '{"Credentials":{"AccessKeyId":"dummy","SecretAccessKey":"dummy","SessionToken":"dummy"}}' ;;
  sts:get-caller-identity) print -- '{"UserId":"provider-user-id","Account":"286853118812","Arn":"arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator"}' ;;
  s3api:head-object)
    if [[ "$*" != *--version-id* ]]; then
      [[ "${phase}" == ambiguous ]] && { print -u2 -- 'An error occurred (AccessDenied)'; exit 254; }
      print -u2 -- 'An error occurred (404)'; exit 254
    fi
    if [[ "$*" == *manifest.json* ]]; then print -- '{"VersionId":"manifest-version","ContentLength":594,"ChecksumType":"FULL_OBJECT","ChecksumCRC64NVME":"BBBBBBBBBBB="}'; else print -- '{"VersionId":"payload-version","ContentLength":10301648,"ChecksumType":"FULL_OBJECT","ChecksumCRC64NVME":"AAAAAAAAAAA="}'; fi ;;
  s3api:put-object)
    if [[ "$*" == *manifest.json* ]]; then print -- '{"VersionId":"manifest-version","ChecksumCRC64NVME":"BBBBBBBBBBB="}'; else print -- '{"VersionId":"payload-version","ChecksumCRC64NVME":"AAAAAAAAAAA="}'; fi ;;
  s3api:put-object-retention) print -- '{}' ;;
  s3api:get-object-retention)
    if [[ "${phase}" == retention-mismatch ]]; then print -- '{"Retention":{"Mode":"COMPLIANCE","RetainUntilDate":"2033-08-13T00:00:00Z"}}'; else print -- '{"Retention":{"Mode":"COMPLIANCE","RetainUntilDate":"2033-08-12T00:00:00Z"}}'; fi ;;
  *) exit 99 ;;
esac
`, { mode: 0o700 });
  return { dir, marker };
}

test("federal preflight validates exact local identity without AWS or MFA", () => {
  const run = spawnSync("zsh", [runner, "--preflight"], { encoding: "utf8" });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, /no TOTP or AWS call was made/);
});

test("ambiguous destination state stops before every write and leaks no identity", () => {
  const { dir, marker } = fixture("ambiguous");
  try {
    const { run, privateOutput, publicOutput } = invoke(dir, "ambiguous");
    assert.equal(run.status, 70, `${run.stdout}\n${run.stderr}`);
    assert.match(`${run.stdout}${run.stderr}`, /Cannot unambiguously classify/);
    assert.doesNotMatch(`${run.stdout}${run.stderr}`, /123456|provider-user-id|arn:aws/);
    assert.doesNotMatch(readFileSync(marker, "utf8"), /s3api:put-object/);
    assert.equal(existsSync(privateOutput), false);
    assert.equal(existsSync(publicOutput), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("preexisting evidence output stops before MFA and AWS", () => {
  const { dir, marker } = fixture("success");
  try {
    writeFileSync(join(dir, "private.json"), "preexisting", { mode: 0o600 });
    const { run, publicOutput } = invoke(dir, "success");
    assert.equal(run.status, 73, `${run.stdout}\n${run.stderr}`);
    assert.equal(existsSync(marker), false);
    assert.equal(readFileSync(join(dir, "private.json"), "utf8"), "preexisting");
    assert.equal(existsSync(publicOutput), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("retention mismatch stops before manifest write and publishes no attestation", () => {
  const { dir, marker } = fixture("retention-mismatch");
  try {
    const { run, privateOutput, publicOutput } = invoke(dir, "retention-mismatch");
    assert.equal(run.status, 70, `${run.stdout}\n${run.stderr}`);
    assert.match(`${run.stdout}${run.stderr}`, /retention read-back mismatch/);
    assert.doesNotMatch(`${run.stdout}${run.stderr}`, /payload-version|arn:aws|provider-user-id/);
    const calls = readFileSync(marker, "utf8");
    assert.equal((calls.match(/s3api:put-object /g) || []).length, 1);
    assert.equal(existsSync(privateOutput), false);
    assert.equal(existsSync(publicOutput), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("successful run binds acknowledgement versions and writes a redacted owner-only pair", () => {
  const { dir, marker } = fixture("success");
  try {
    const { run, privateOutput, publicOutput } = invoke(dir, "success");
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    const privateValue = JSON.parse(readFileSync(privateOutput));
    const publicValue = JSON.parse(readFileSync(publicOutput));
    validatePrivateFederalAttestation(privateValue, plan);
    validateRedactedFederalAttestation(publicValue, plan);
    assert.doesNotMatch(readFileSync(publicOutput, "utf8"), /provider-user-id|arn:aws|payload-version|manifest-version/);
    const calls = readFileSync(marker, "utf8");
    assert.match(calls, /head-object .*--version-id payload-version/);
    assert.match(calls, /head-object .*--version-id manifest-version/);
    assert.match(calls, /get-object-retention .*--version-id payload-version/);
    assert.doesNotMatch(calls, /delete|abort|bypass/i);

    const secondPrivate = join(dir, "second-private.json");
    const occupiedPublic = join(dir, "occupied-public.json");
    writeFileSync(occupiedPublic, "preexisting", { mode: 0o600 });
    assert.throws(() => assembleFederalAttestation({ capturePath: privateOutput, planPath: new URL("../data/elections-canada-fed-2025-promotion-preparation.json", import.meta.url).pathname, privatePath: secondPrivate, publicPath: occupiedPublic }), /without exposing provider values/);
    assert.equal(existsSync(secondPrivate), false);
    assert.equal(readFileSync(occupiedPublic, "utf8"), "preexisting");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
