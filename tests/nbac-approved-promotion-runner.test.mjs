import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(new URL("../scripts/run-nbac-approved-promotion.sh", import.meta.url), "utf8");

test("NBAC runner is external-root, MFA-role and exact-key bound", () => {
  assert.match(source, /\/Volumes\/Extended_SSD\/Witness_Tree-data/);
  assert.match(source, /ROLE="WitnessTreeArchivePromotionUploader"/);
  assert.match(source, /wt_assume_direct_mfa_role "\$PROFILE" 286853118812 "\$ROLE"/);
  assert.match(source, /c42740eb9d2fe3991a27344d0c33927705ec3e78c277efc5311b502439cb2165/);
  assert.match(source, /--if-none-match '\*'/);
  assert.match(source, /check-nbac-archive-iam-applied\.mjs" --verify-live/);
  assert.match(source, /\.artifact\.payloadKey == \$payload/);
  assert.match(source, /\.artifact\.manifestKey == \$manifest/);
  assert.match(source, /\.mfaGatedExecution\.operatorProfile == \$profile/);
  assert.match(source, /\.mfaGatedExecution\.role == \$role/);
  assert.match(source, /cp "\$RAW" "\$STAGED"/);
  assert.match(source, /--body "\$STAGED"/);
  assert.match(source, /--object-lock-mode COMPLIANCE --object-lock-retain-until-date "\$RETAIN_UNTIL"/);
  assert.match(source, /if put="\$\(aws s3api put-object[\s\S]*--if-none-match '\*'/);
  assert.match(source, /wt_archive_head_current_or_absent "\$PAYLOAD_KEY" nbac-payload/);
  assert.match(source, /wt_archive_head_current_or_absent "\$MANIFEST_KEY" nbac-manifest/);
  assert.match(source, /payload_present=0; manifest_present=0/);
  assert.doesNotMatch(source, /--profile root|arn:aws:iam::286853118812:root/);
});

test("NBAC runner retains payload and manifest without delete or bypass", () => {
  assert.equal((source.match(/wt_archive_ensure_compliance_retention/g) ?? []).length, 2);
  assert.doesNotMatch(source, /delete-object|bypass-governance-retention/i);
});

test("NBAC runner writes the durable receipt only after final exact-version and retention readbacks", () => {
  assert.match(source, /final-payload-head\.json/);
  assert.match(source, /final-manifest-head\.json/);
  assert.match(source, /final-payload-retention\.json/);
  assert.match(source, /final-manifest-retention\.json/);
  assert.match(source, /capture-nbac-archive-receipt\.mjs" --capture/);
  assert.match(source, /data\/nbac-archive-receipt-2026-08-27\.json/);
  assert.ok(source.indexOf("wt_archive_ensure_compliance_retention") < source.indexOf("capture-nbac-archive-receipt.mjs"));
});

test("NBAC runner checks both keys before any write and refuses an orphan manifest", () => {
  const bothHeads = source.indexOf('wt_archive_head_current_or_absent "$PAYLOAD_KEY" nbac-payload');
  const manifestHead = source.indexOf('wt_archive_head_current_or_absent "$MANIFEST_KEY" nbac-manifest');
  const orphanGuard = source.indexOf("A manifest exists without its approved NBAC payload");
  const firstPut = source.indexOf("aws s3api put-object");
  assert.ok(bothHeads >= 0 && manifestHead > bothHeads);
  assert.ok(orphanGuard > manifestHead && orphanGuard < firstPut);
  assert.match(source, /recovery is ambiguous and no write was attempted/);
});

test("NBAC no-write preflight exits before live IAM verification or AWS availability checks", () => {
  const preflightExit = source.indexOf('[[ "$1" == "--preflight" ]] && exit 0');
  assert.ok(preflightExit > source.indexOf("node \"$ROOT/scripts/check-nbac-archive-iam-applied.mjs\" >/dev/null"));
  assert.ok(preflightExit < source.indexOf('command -v aws >/dev/null'));
  assert.ok(preflightExit < source.indexOf('node "$ROOT/scripts/check-nbac-archive-iam-applied.mjs" --verify-live'));
});

test("NBAC preflight completes without reaching an AWS command", () => {
  const dir = mkdtempSync(join(tmpdir(), "nbac-preflight-no-aws-"));
  const marker = join(dir, "aws-called");
  const runner = new URL("../scripts/run-nbac-approved-promotion.sh", import.meta.url).pathname;
  writeFileSync(join(dir, "aws"), `#!/bin/zsh\ntouch ${JSON.stringify(marker)}\nexit 91\n`, { mode: 0o700 });
  try {
    const run = spawnSync("zsh", [runner, "--preflight"], { encoding: "utf8", env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } });
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /PRECHECK passed:.*no TOTP or storage call was made/);
    assert.equal(existsSync(marker), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("NBAC live verification is pinned to the approved operator identity and offline tools do not inherit session credentials", () => {
  assert.match(source, /AWS_PROFILE="\$PROFILE" aws sts get-caller-identity/);
  assert.match(source, /arn:aws:iam::286853118812:user\/WitnessTreeArchiveOperator/);
  assert.match(source, /AWS_PROFILE="\$PROFILE" node "\$ROOT\/scripts\/check-nbac-archive-iam-applied\.mjs" --verify-live/);
  assert.equal((source.match(/env -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY -u AWS_SESSION_TOKEN node/g) ?? []).length, 2);
  assert.match(source, /jq -er '\.Credentials\.AccessKeyId/);
});
