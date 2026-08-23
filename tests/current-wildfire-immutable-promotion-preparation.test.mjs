import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { validateApprovedWildfireIamGate } from "../scripts/check-current-wildfire-promotion-iam.mjs";
import { dryRunLines, validateCurrentWildfirePromotionPreparation, writeSidecars } from "../scripts/prepare-current-wildfire-immutable-promotion.mjs";
const plan = JSON.parse(readFileSync(new URL("../data/current-wildfire-immutable-promotion-preparation.json", import.meta.url), "utf8"));
const staged = JSON.parse(readFileSync(new URL("../data/staged-acquisitions.json", import.meta.url), "utf8"));
function writeIamGate(dir) {
  const live = { schemaVersion: "witness-tree/current-wildfire-promotion-iam-live-attestation/1", status: "exact-live-readback-passed", capturedAt: "2026-08-23T12:00:00.000Z", account: "286853118812", operatorArn: "arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator", roleName: "WitnessTreeCurrentWildfirePromotionUploader", roleArn: "arn:aws:iam::286853118812:role/WitnessTreeCurrentWildfirePromotionUploader", trust: { principal: "arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator", mfaRequired: true }, actions: plan.proposedRoleScope.allow, resources: plan.proposedRoleScope.objectKeys, accessAnalyzerFindings: 0, simulations: { exactEightKeysAllActions: "allowed", exactEightKeysGetObjectVersion: "allowed", otherKeyPutObject: "implicitDeny", otherKeyGetObjectVersion: "implicitDeny", deleteObject: "implicitDeny", iamMutation: "implicitDeny" }, mutation: { iamMutationPerformed: false, s3MutationPerformed: false } };
  const liveBytes = Buffer.from(`${JSON.stringify(live, null, 2)}\n`); const livePath = join(dir, "live-iam.json"); writeFileSync(livePath, liveBytes, { mode: 0o600 });
  const approval = { schemaVersion: "witness-tree/current-wildfire-get-object-version-owner-approval/1", status: "owner-approved-live-iam-bound", roleName: "WitnessTreeCurrentWildfirePromotionUploader", action: "s3:GetObjectVersion", resources: "data/current-wildfire-immutable-promotion-preparation.json#/proposedRoleScope/objectKeys", reason: "The historical approval omitted version-specific read permission. This separate delta must be explicitly approved and live-verified before any storage mutation.", approvedAt: "2026-08-23T12:01:00.000Z", ownerStatement: "I approve s3:GetObjectVersion on the eight exact current-wildfire keys.", liveIamAttestationSha256: createHash("sha256").update(liveBytes).digest("hex"), claims: { ownerApproved: true, liveIamVerified: true, iamMutationPerformed: false, s3MutationPerformed: false } };
  const approvalPath = join(dir, "approval.json"); writeFileSync(approvalPath, `${JSON.stringify(approval, null, 2)}\n`, { mode: 0o600 }); return { approvalPath, livePath };
}
test("four current wildfire snapshots remain exact and archive-pending after scoped owner approval", () => { assert.equal(validateCurrentWildfirePromotionPreparation(plan, staged), plan); const lines = dryRunLines(plan, staged).join("\n"); assert.match(lines, /ADMISSION-BLOCK bc-wildfire geometry=owner-approved-derived-216-one-permanent-quarantine/); assert.match(lines, /ADMISSION-BLOCK on-fire-disturbance geometry=owner-approved-derived-188-zero-exclusion/); assert.equal((lines.match(/UPLOAD-PENDING/g) ?? []).length, 4); });
test("preparation fails closed on drift, extra source, or an archive claim", () => { assert.throws(() => validateCurrentWildfirePromotionPreparation({...plan, claims: {...plan.claims, immutableObjectStorage: true}}, staged)); assert.throws(() => validateCurrentWildfirePromotionPreparation({...plan, artifacts: plan.artifacts.slice(0, 3)}, staged)); assert.throws(() => validateCurrentWildfirePromotionPreparation({...plan, artifacts: [{...plan.artifacts[0], geometryDecision: "ready"}, ...plan.artifacts.slice(1)]}, staged)); });

test("sidecars are deterministic and the desired role cannot broaden exact keys", () => {
  const dir = mkdtempSync(join(tmpdir(), "current-wildfire-sidecars-"));
  try { assert.equal(writeSidecars(plan, dir, staged).length, 4); assert.throws(() => writeSidecars(plan, dir, staged), /EEXIST/); }
  finally { rmSync(dir, {recursive: true, force: true}); }
  assert.throws(() => validateCurrentWildfirePromotionPreparation({...plan, proposedRoleScope: {...plan.proposedRoleScope, objectKeys: plan.proposedRoleScope.objectKeys.slice(1)}}, staged));
});

test("runner defaults to preparation and external execution is fail-closed", () => {
  const runner = readFileSync(new URL("../scripts/run-current-wildfire-approved-promotion.sh", import.meta.url), "utf8");
  assert.match(runner, /if \[\[ \$# -eq 0 \]\]; then/);
  assert.match(runner, /no descriptor-consuming upload adapter/);
  assert.match(readFileSync(new URL("../scripts/check-current-wildfire-promotion-checkpoint.mjs", import.meta.url), "utf8"), /ChecksumType.*FULL_OBJECT/);
  assert.doesNotMatch(runner, /aws |--body|read -r -s|mktemp|rm -/i);
});

test("execution cannot reach a mocked AWS command or prompt for MFA", () => {
  const dir = mkdtempSync(join(tmpdir(), "current-wildfire-mfa-sts-"));
  const marker = join(dir, "calls");
  const aws = join(dir, "aws");
  writeFileSync(aws, `#!/bin/zsh
case "$1:$2" in
  configure:get) print -- "configure-get" >> ${JSON.stringify(marker)}; print -- "arn:aws:iam::286853118812:mfa/WitnessTreeArchiveOperator" ;;
  sts:get-session-token) print -- "sts-get-session-token" >> ${JSON.stringify(marker)}; print -- '{"Credentials":{"AccessKeyId":"dummy","SecretAccessKey":"dummy","SessionToken":"dummy"}}' ;;
  sts:get-caller-identity) print -- "sts-get-caller-identity" >> ${JSON.stringify(marker)}; if [[ "$AWS_ACCESS_KEY_ID" == "role-dummy" ]]; then print -- '{"UserId":"role","Account":"286853118812","Arn":"arn:aws:sts::286853118812:assumed-role/WitnessTreeCurrentWildfirePromotionUploader/test"}'; else print -- '{"UserId":"operator","Account":"286853118812","Arn":"arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator"}'; fi ;;
  sts:assume-role) print -- "sts-assume-role" >> ${JSON.stringify(marker)}; print -- '{"Credentials":{"AccessKeyId":"role-dummy","SecretAccessKey":"dummy","SessionToken":"dummy"}}' ;;
  s3api:put-object) print -- "s3-put-object-blocked" >> ${JSON.stringify(marker)}; exit 88 ;;
  *) print -- "unexpected-$1-$2" >> ${JSON.stringify(marker)}; exit 98 ;;
esac
`, {mode: 0o700});
  const runner = new URL("../scripts/run-current-wildfire-approved-promotion.sh", import.meta.url).pathname;
  const checkpoint = join(dir, "checkpoint.json"); const privateOutput = join(dir, "private.json"); const publicOutput = join(dir, "public.json");
  try {
    const run = spawnSync("zsh", [runner, "--run", checkpoint, privateOutput, publicOutput], {encoding: "utf8", env: {...process.env, PATH: `${dir}:${process.env.PATH}`}});
    assert.equal(run.status, 75, `${run.stdout}\n${run.stderr}`);
    assert.match(`${run.stdout}${run.stderr}`, /descriptor-consuming upload adapter/);
    assert.equal(run.stdout.includes("TOTP"), false); assert.throws(() => readFileSync(marker));
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test("external execution stops before MFA, IAM inspection, and every AWS call", () => {
  const dir = mkdtempSync(join(tmpdir(), "current-wildfire-iam-gate-")); const marker = join(dir, "called"); const aws = join(dir, "aws"); const runner = new URL("../scripts/run-current-wildfire-approved-promotion.sh", import.meta.url).pathname;
  try { writeFileSync(aws, `#!/bin/zsh\nprint called > ${JSON.stringify(marker)}\n`, { mode: 0o700 }); const run = spawnSync("zsh", [runner, "--run", join(dir, "checkpoint.json"), join(dir, "private.json"), join(dir, "public.json")], { encoding: "utf8", env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } }); assert.equal(run.status, 75, `${run.stdout}\n${run.stderr}`); assert.match(`${run.stdout}${run.stderr}`, /fail-closed|descriptor-consuming/i); assert.throws(() => readFileSync(marker)); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});

test("live IAM gate rejects negated approval, digest drift, and widened resources", () => {
  const dir = mkdtempSync(join(tmpdir(), "current-wildfire-iam-exact-"));
  try {
    const { approvalPath, livePath } = writeIamGate(dir); const approval = JSON.parse(readFileSync(approvalPath)); const live = JSON.parse(readFileSync(livePath));
    assert.doesNotThrow(() => validateApprovedWildfireIamGate(readFileSync(approvalPath), readFileSync(livePath), plan));
    assert.throws(() => validateApprovedWildfireIamGate(Buffer.from(JSON.stringify({ ...approval, ownerStatement: "I do not approve s3:GetObjectVersion on the eight exact current-wildfire keys." })), readFileSync(livePath), plan));
    assert.throws(() => validateApprovedWildfireIamGate(Buffer.from(JSON.stringify({ ...approval, liveIamAttestationSha256: "0".repeat(64) })), readFileSync(livePath), plan));
    const widenedBytes = Buffer.from(JSON.stringify({ ...live, resources: [...live.resources, "arn:aws:s3:::witness-tree-raw-archive-ca-central-1/other"] }));
    assert.throws(() => validateApprovedWildfireIamGate(Buffer.from(JSON.stringify({ ...approval, liveIamAttestationSha256: createHash("sha256").update(widenedBytes).digest("hex") })), widenedBytes, plan));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
