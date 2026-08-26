import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
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
  assert.equal(plan.artifacts[0].sourceEvidence.attributeFieldCount, 60);
  assert.equal(plan.artifacts[1].derivedLineage.attributeFieldCount, 60);
  assert.match(sidecarFor(plan, plan.artifacts[1]), /repairPatchSha256/);
});

test("sidecars are deterministic and the preparation rejects drift or remote claims", () => {
  const dir = mkdtempSync(join(tmpdir(), "plvi-sidecars-"));
  try { const first = writeSidecars(plan, dir); assert.equal(first.length, 2); assert.throws(() => writeSidecars(plan, dir), /EEXIST/); }
  finally { rmSync(dir, {recursive: true, force: true}); }
  assert.throws(() => validateAlbertaPlviImmutablePromotionPreparation({...plan, claims: {...plan.claims, immutableObjectStorage: true}}));
  assert.throws(() => validateAlbertaPlviImmutablePromotionPreparation({...plan, artifacts: [{...plan.artifacts[0], sha256: "0".repeat(64)}, plan.artifacts[1]]}));
  assert.throws(() => validateAlbertaPlviImmutablePromotionPreparation({...plan, proposedRoleScope: {...plan.proposedRoleScope, objectKeys: plan.proposedRoleScope.objectKeys.slice(1)}}));
  assert.throws(() => validateAlbertaPlviImmutablePromotionPreparation({...plan, artifacts: [{...plan.artifacts[0], sourceEvidence: {...plan.artifacts[0].sourceEvidence, attributeFieldCount: 63}}, plan.artifacts[1]]}));
  assert.throws(() => validateAlbertaPlviImmutablePromotionPreparation({...plan, artifacts: [plan.artifacts[0], {...plan.artifacts[1], derivedLineage: {...plan.artifacts[1].derivedLineage, fieldCount: 63}}]}));
});

test("MFA runner has a dry-run default and excludes deletion, IAM mutation, and retention bypass", () => {
  const runner = readFileSync(new URL("../scripts/run-alberta-plvi-approved-promotion.sh", import.meta.url), "utf8");
  assert.match(runner, /if \[\[ \$# -eq 0 \]\]; then node/);
  assert.match(runner, /Approved raw ZIP drifted/);
  assert.match(runner, /wt_assume_direct_mfa_role/);
  assert.match(runner, /WitnessTreePlviArchivePromotionUploader/);
  assert.match(runner, /archive-existing-key-recovery\.sh/);
  assert.match(runner, /--if-none-match '\*'/);
  assert.match(runner, /wt_archive_verify_existing_payload/);
  assert.match(runner, /wt_archive_ensure_compliance_retention/);
  assert.doesNotMatch(runner, /DeleteObject|BypassGovernanceRetention|aws iam (?:create|put|delete|attach|update)/i);
  assert.match(readFileSync(new URL("../scripts/aws-direct-mfa-role-session.sh", import.meta.url), "utf8"), /aws configure get mfa_serial --profile/);
  assert.doesNotMatch(runner, /list-mfa-devices|iam list/i);
});

test("hostile ambiguous existing PLVI key stops before any replacement write", () => {
  const dir = mkdtempSync(join(tmpdir(), "plvi-mfa-sts-"));
  const marker = join(dir, "calls");
  const aws = join(dir, "aws");
  writeFileSync(aws, `#!/bin/zsh
case "$1:$2" in
  configure:get) print -- "configure-get" >> ${JSON.stringify(marker)}; print -- "arn:aws:iam::286853118812:mfa/WitnessTreeArchiveOperator" ;;
  sts:get-caller-identity) print -- "sts-get-caller-identity" >> ${JSON.stringify(marker)}; print -- '{"Account":"286853118812","Arn":"arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator"}' ;;
  sts:assume-role) print -- "sts-assume-role" >> ${JSON.stringify(marker)}; print -- '{"Credentials":{"AccessKeyId":"dummy","SecretAccessKey":"dummy","SessionToken":"dummy"},"AssumedRoleUser":{"Arn":"arn:aws:sts::286853118812:assumed-role/WitnessTreePlviArchivePromotionUploader/test"}}' ;;
  s3api:head-object) print -- "s3-head-ambiguous" >> ${JSON.stringify(marker)}; print -u2 -- AccessDenied; exit 88 ;;
  s3api:put-object|s3api:put-object-retention) print -- "unexpected-write" >> ${JSON.stringify(marker)}; exit 91 ;;
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
    assert.equal(run.status, 73, `${run.stdout}\n${run.stderr}`);
    assert.match(`${run.stdout}${run.stderr}`, /Could not resolve whether plvi-.*-payload exists; recovery refused without a write/);
    assert.deepEqual(readFileSync(marker, "utf8").trim().split("\n"), ["sts-get-caller-identity", "configure-get", "sts-assume-role", "s3-head-ambiguous"]);
    assert.doesNotMatch(readFileSync(marker, "utf8"), /iam|list-mfa/i);
    assert.doesNotMatch(`${run.stdout}${run.stderr}`, /123456/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("hostile orphan PLVI manifest stops before any replacement write", () => {
  const dir = mkdtempSync(join(tmpdir(), "plvi-orphan-manifest-"));
  const marker = join(dir, "calls");
  writeFileSync(join(dir, "aws"), `#!/bin/zsh
print -- "$1:$2:$*" >> ${JSON.stringify(marker)}
case "$1:$2" in
  configure:get) print -- "arn:aws:iam::286853118812:mfa/WitnessTreeArchiveOperator" ;;
  sts:get-caller-identity) print -- '{"Account":"286853118812","Arn":"arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator"}' ;;
  sts:assume-role) print -- '{"Credentials":{"AccessKeyId":"dummy","SecretAccessKey":"dummy","SessionToken":"dummy"},"AssumedRoleUser":{"Arn":"arn:aws:sts::286853118812:assumed-role/WitnessTreePlviArchivePromotionUploader/test"}}' ;;
  s3api:head-object) if [[ "$*" == *payload/* ]]; then print -u2 -- NoSuchKey; exit 255; else print -- '{"VersionId":"orphan-manifest-v1","ContentLength":1,"ChecksumType":"FULL_OBJECT","ChecksumCRC64NVME":"AAAAAAAAAAA="}'; fi ;;
  s3api:put-object|s3api:put-object-retention) print -u2 -- unexpected-write; exit 91 ;;
  *) print -u2 -- unexpected; exit 99 ;;
esac
`, { mode: 0o700 });
  const runner = new URL("../scripts/run-alberta-plvi-approved-promotion.sh", import.meta.url).pathname;
  const program = `set timeout 120
set env(PATH) "${dir}:$env(PATH)"
spawn -noecho zsh ${runner} --run
expect {
  "Current MFA TOTP (not stored):" { send -- "123456\\r"; exp_continue }
  eof { set result [wait]; exit [lindex $result 3] }
  timeout { exit 2 }
}`;
  try {
    const run = spawnSync("expect", ["-c", program], { encoding: "utf8", timeout: 120_000, env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } });
    assert.equal(run.status, 73, `${run.stdout}\n${run.stderr}`);
    assert.match(`${run.stdout}${run.stderr}`, /A manifest exists without its approved PLVI payload/);
    const calls = readFileSync(marker, "utf8");
    assert.doesNotMatch(calls, /s3api:put-object(?:-retention)?/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("runner uses conditional writes and exact-version recovery verification", () => {
  const runner = readFileSync(new URL("../scripts/run-alberta-plvi-approved-promotion.sh", import.meta.url), "utf8");
  assert.match(runner, /--if-none-match '\*'/);
  assert.match(runner, /--cli-read-timeout 0/);
  assert.match(runner, /A manifest exists without its approved PLVI payload; recovery is ambiguous/);
  assert.match(runner, /wt_archive_verify_existing_manifest/);
  assert.doesNotMatch(runner, /aws s3 cp/);
});
