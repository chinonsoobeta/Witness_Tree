import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { dryRunLines, validateCurrentWildfirePromotionPreparation, writeSidecars } from "../scripts/prepare-current-wildfire-immutable-promotion.mjs";
const plan = JSON.parse(readFileSync(new URL("../data/current-wildfire-immutable-promotion-preparation.json", import.meta.url), "utf8"));
const staged = JSON.parse(readFileSync(new URL("../data/staged-acquisitions.json", import.meta.url), "utf8"));
test("four current wildfire snapshots remain exact and archive-pending after scoped owner approval", () => { assert.equal(validateCurrentWildfirePromotionPreparation(plan, staged), plan); const lines = dryRunLines(plan, staged).join("\n"); assert.match(lines, /ADMISSION-BLOCK bc-wildfire geometry=owner-approved-derived-216-one-permanent-quarantine/); assert.match(lines, /ADMISSION-BLOCK on-fire-disturbance geometry=owner-approved-derived-188-zero-exclusion/); assert.equal((lines.match(/UPLOAD-PENDING/g) ?? []).length, 4); });
test("preparation fails closed on drift, extra source, or an archive claim", () => { assert.throws(() => validateCurrentWildfirePromotionPreparation({...plan, claims: {...plan.claims, immutableObjectStorage: true}}, staged)); assert.throws(() => validateCurrentWildfirePromotionPreparation({...plan, artifacts: plan.artifacts.slice(0, 3)}, staged)); assert.throws(() => validateCurrentWildfirePromotionPreparation({...plan, artifacts: [{...plan.artifacts[0], geometryDecision: "ready"}, ...plan.artifacts.slice(1)]}, staged)); assert.throws(() => validateCurrentWildfirePromotionPreparation({...plan, artifacts: [plan.artifacts[0], {...plan.artifacts[1], archiveGeometryDecision: plan.artifacts[1].geometryDecision}, ...plan.artifacts.slice(2)]}, staged)); });

test("sidecars are deterministic and the desired role cannot broaden exact keys", () => {
  const dir = mkdtempSync(join(tmpdir(), "current-wildfire-sidecars-"));
  try { assert.equal(writeSidecars(plan, dir, staged).length, 4); assert.throws(() => writeSidecars(plan, dir, staged), /EEXIST/); }
  finally { rmSync(dir, {recursive: true, force: true}); }
  assert.throws(() => validateCurrentWildfirePromotionPreparation({...plan, proposedRoleScope: {...plan.proposedRoleScope, objectKeys: plan.proposedRoleScope.objectKeys.slice(1)}}, staged));
});

test("archive sidecars preserve the decision recorded when each snapshot was created", () => {
  const dir = mkdtempSync(join(tmpdir(), "current-wildfire-archive-decisions-"));
  try {
    const written = writeSidecars(plan, dir, staged);
    const bc = written.find(({artifactId}) => artifactId === "bc-wildfire-current-perimeters-2026-08-14");
    const on = written.find(({artifactId}) => artifactId === "ontario-in-year-fire-perimeters-2026-08-14");
    assert.equal(bc.sha256, "07d6005d8a3c3c1be7a41802a801aa029f2cb64c39687294f04a9eeb6c13ee59");
    assert.equal(JSON.parse(readFileSync(bc.file, "utf8")).profile.geometryDecision, "blocked-pending-geometry-policy");
    assert.equal(JSON.parse(readFileSync(on.file, "utf8")).profile.geometryDecision, "blocked-pending-geometry-policy");
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test("MFA runner defaults to dry run and excludes prohibited operations", () => {
  const runner = readFileSync(new URL("../scripts/run-current-wildfire-approved-promotion.sh", import.meta.url), "utf8");
  assert.match(runner, /if \[\[ \$# -eq 0 \]\]; then node/);
  assert.match(runner, /Approved .* artifact drifted/);
  assert.match(runner, /wt_assume_direct_mfa_role/);
  assert.match(runner, /WitnessTreeCurrentWildfirePromotionUploader/);
  assert.match(runner, /archive-existing-key-recovery\.sh/);
  assert.match(runner, /--if-none-match '\*'/);
  assert.match(runner, /wt_archive_verify_existing_payload/);
  assert.match(runner, /wt_archive_ensure_compliance_retention/);
  assert.doesNotMatch(runner, /aws s3 cp|DeleteObject|BypassGovernanceRetention|PutObjectLegalHold|ReplicateObject|aws iam /i);
  assert.match(readFileSync(new URL("../scripts/aws-direct-mfa-role-session.sh", import.meta.url), "utf8"), /aws configure get mfa_serial --profile/);
  assert.doesNotMatch(runner, /list-mfa-devices|iam list/i);
});

test("current-wildfire preflight reaches no AWS command when its controlled local root is absent", () => {
  const dir = mkdtempSync(join(tmpdir(), "current-wildfire-preflight-no-aws-"));
  const marker = join(dir, "aws-called");
  const runner = new URL("../scripts/run-current-wildfire-approved-promotion.sh", import.meta.url).pathname;
  writeFileSync(join(dir, "aws"), `#!/bin/zsh\ntouch ${JSON.stringify(marker)}\nexit 91\n`, { mode: 0o700 });
  try {
    const run = spawnSync("zsh", [runner, "--preflight"], { encoding: "utf8", env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, WITNESS_TREE_CURRENT_WILDFIRE_PREFLIGHT_DATA_ROOT: join(dir, "absent-data") } });
    assert.equal(run.status, 65, run.stdout + run.stderr);
    assert.match(run.stderr, /artifact drifted or is missing; no TOTP or AWS call was made/);
    assert.equal(existsSync(marker), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("hostile ambiguous existing current-wildfire key stops before any replacement write", () => {
  const dir = mkdtempSync(join(tmpdir(), "current-wildfire-mfa-sts-"));
  const marker = join(dir, "calls");
  const aws = join(dir, "aws");
  writeFileSync(aws, `#!/bin/zsh
case "$1:$2" in
  configure:get) print -- "configure-get" >> ${JSON.stringify(marker)}; print -- "arn:aws:iam::286853118812:mfa/WitnessTreeArchiveOperator" ;;
  sts:get-caller-identity) print -- "sts-get-caller-identity" >> ${JSON.stringify(marker)}; print -- '{"Account":"286853118812","Arn":"arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator"}' ;;
  sts:assume-role) print -- "sts-assume-role" >> ${JSON.stringify(marker)}; print -- '{"Credentials":{"AccessKeyId":"dummy","SecretAccessKey":"dummy","SessionToken":"dummy"},"AssumedRoleUser":{"Arn":"arn:aws:sts::286853118812:assumed-role/WitnessTreeCurrentWildfirePromotionUploader/test"}}' ;;
  s3api:head-object) print -- "s3-head-ambiguous" >> ${JSON.stringify(marker)}; print -u2 -- AccessDenied; exit 88 ;;
  s3api:put-object|s3api:put-object-retention) print -- "unexpected-write" >> ${JSON.stringify(marker)}; exit 91 ;;
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
    assert.equal(run.status, 73, `${run.stdout}\n${run.stderr}`);
    assert.match(`${run.stdout}${run.stderr}`, /Could not resolve whether current-.*-payload exists; recovery refused without a write/);
    assert.deepEqual(readFileSync(marker, "utf8").trim().split("\n"), ["sts-get-caller-identity", "configure-get", "sts-assume-role", "s3-head-ambiguous"]);
    assert.doesNotMatch(readFileSync(marker, "utf8"), /iam|list-mfa/i);
    assert.doesNotMatch(`${run.stdout}${run.stderr}`, /123456/);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});
