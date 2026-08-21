import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { multipartPlan, partCount, sidecarFor, validateQcImmutablePromotionPreparation, writeSidecars } from "../scripts/prepare-qc-immutable-promotion.mjs";

const plan = JSON.parse(readFileSync(new URL("../data/qc-immutable-promotion-preparation.json", import.meta.url), "utf8"));
const runnerPath = new URL("../scripts/run-qc-approved-multipart-promotion.sh", import.meta.url).pathname;

function writeQcFakeTools(dir, { serial, identity = { Account: "286853118812", Arn: "arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator" } }) {
  const marker = join(dir, "aws-calls");
  writeFileSync(join(dir, "aws"), `#!/bin/zsh
print -- "$1:$2" >> ${JSON.stringify(marker)}
case "$1:$2" in
  configure:get) print -- ${JSON.stringify(serial)} ;;
  sts:get-session-token|sts:assume-role) print -- '{"Credentials":{"AccessKeyId":"dummy","SecretAccessKey":"dummy","SessionToken":"dummy"}}' ;;
  sts:get-caller-identity) print -- ${JSON.stringify(JSON.stringify(identity))} ;;
  s3api:put-object) exit 88 ;;
  *) exit 99 ;;
esac
`, { mode: 0o700 });
  writeFileSync(join(dir, "stat"), `#!/bin/zsh
case "$3" in
  *qc-current-ecoforest/2026-08-14/CARTE_ECO_MAJ_PROV_GPKG.zip) print -- 12399475076 ;;
  *qc-original-current-inventory/2026-08-14/CARTE_ECO_ORI_PROV_GPKG.zip) print -- 11244667626 ;;
  *) exec /usr/bin/stat "$@" ;;
esac
`, { mode: 0o700 });
  writeFileSync(join(dir, "shasum"), `#!/bin/zsh
case "$3" in
  *qc-current-ecoforest/2026-08-14/CARTE_ECO_MAJ_PROV_GPKG.zip) print -- "c67c56b0c101e95bef4fbca53a06e2f1578fe38293961017f70d815209740cf1  $3" ;;
  *qc-original-current-inventory/2026-08-14/CARTE_ECO_ORI_PROV_GPKG.zip) print -- "c10d691516569de76642dc1fc64e662f2569b5b58ab5d945b58b8b7834ba9c61  $3" ;;
  *) exec /usr/bin/shasum "$@" ;;
esac
`, { mode: 0o700 });
  return marker;
}

function runQcPty(dir) {
  const program = `set timeout 120
set env(PATH) ${JSON.stringify(`${dir}:${process.env.PATH}`)}
spawn -noecho zsh ${JSON.stringify(runnerPath)} --run
expect {
  "Current MFA TOTP (not stored):" { send -- "123456\\r"; exp_continue }
  eof { set result [wait]; exit [lindex $result 3] }
  timeout { exit 2 }
}`;
  return spawnSync("expect", ["-c", program], { encoding: "utf8", timeout: 120_000, env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } });
}

test("Québec immutable preparation binds only the two completed raw archives to safe append-only keys", () => {
  assert.equal(validateQcImmutablePromotionPreparation(plan), plan);
  assert.deepEqual(plan.artifacts.map((item) => item.id), ["qc-ecoforest-map-2026-08-14", "qc-original-current-inventory-2026-08-14"]);
  assert.equal(plan.artifacts.some((item) => /fourth/i.test(JSON.stringify(item))), false);
  assert.equal(plan.artifacts[0].payloadKey.includes("current"), false);
  assert.equal(plan.artifacts[0].payloadKey.includes("latest"), false);
  assert.deepEqual(plan.proposedRoleScope.retentionKeys, plan.artifacts.map((item) => item.payloadKey));
});

test("each archive has a bounded reviewed sequential multipart plan", () => {
  assert.equal(partCount(12399475076), 93);
  assert.equal(partCount(11244667626), 84);
  for (const artifact of plan.artifacts) {
    const parts = multipartPlan(artifact.byteLength);
    assert.equal(parts.at(-1).offsetBytes + parts.at(-1).byteLength, artifact.byteLength);
    assert.ok(parts.every((part, index) => part.partNumber === index + 1 && part.byteLength > 0));
    assert.ok(parts.length <= 10000);
  }
  assert.throws(() => multipartPlan(12399475076, 16 * 1024 * 1024));
});

test("sidecars are deterministic and the preparation rejects remote claims, aliases, and scope widening", () => {
  const dir = mkdtempSync(join(tmpdir(), "qc-promotion-sidecars-"));
  try { assert.equal(writeSidecars(plan, dir).length, 2); assert.throws(() => writeSidecars(plan, dir), /EEXIST/); }
  finally { rmSync(dir, { recursive: true, force: true }); }
  assert.match(sidecarFor(plan, plan.artifacts[0]), /rebuildable-not-locked/);
  assert.throws(() => validateQcImmutablePromotionPreparation({ ...plan, claims: { ...plan.claims, immutableObjectStorage: true } }));
  assert.throws(() => validateQcImmutablePromotionPreparation({ ...plan, artifacts: [{ ...plan.artifacts[0], archiveSourceId: "qc-current-ecoforest" }, plan.artifacts[1]] }));
  assert.throws(() => validateQcImmutablePromotionPreparation({ ...plan, proposedRoleScope: { ...plan.proposedRoleScope, retentionKeys: plan.proposedRoleScope.retentionKeys.slice(1) } }));
});

test("owner-local runner is multipart-only and excludes high-level copies, deletion, IAM, and bypass", () => {
  const runner = readFileSync(new URL("../scripts/run-qc-approved-multipart-promotion.sh", import.meta.url), "utf8");
  assert.match(runner, /if \[\[ \$# -eq 0 \]\]; then node/);
  assert.match(runner, /PRECHECK passed[\s\S]*read -r -s/);
  assert.match(runner, /create-multipart-upload[\s\S]*upload-part[\s\S]*complete-multipart-upload/);
  assert.match(runner, /list-parts[\s\S]*Previously uploaded part does not match/);
  assert.match(runner, /ChecksumType=="COMPOSITE"[\s\S]*put-object-retention[\s\S]*get-object-retention/);
  assert.doesNotMatch(runner, /aws s3 cp|DeleteObject|BypassGovernanceRetention|PutObjectLegalHold|aws iam /i);
  assert.match(runner, /aws configure get mfa_serial --profile/);
  assert.doesNotMatch(runner, /list-mfa-devices|iam list/i);
});

test("owner-local runner accepts an approved-account MFA path and pins the exact post-MFA operator", () => {
  const dir = mkdtempSync(join(tmpdir(), "qc-promotion-mfa-path-"));
  try {
    const marker = writeQcFakeTools(dir, { serial: "arn:aws:iam::286853118812:mfa/witness-tree/archive-operator.device" });
    const run = runQcPty(dir);
    assert.equal(run.status, 70, `${run.stdout}\n${run.stderr}`);
    assert.match(`${run.stdout}${run.stderr}`, /Sidecar upload failed/);
    assert.doesNotMatch(`${run.stdout}${run.stderr}`, /123456/);
    assert.deepEqual(readFileSync(marker, "utf8").trim().split("\n"), ["configure:get", "sts:get-session-token", "sts:get-caller-identity", "sts:assume-role", "s3api:put-object"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("empty, malformed, and wrong-account MFA serials stop before STS or storage", () => {
  for (const serial of ["", "not-an-arn", "arn:aws:iam::999999999999:mfa/witness-tree/archive-operator.device"]) {
    const dir = mkdtempSync(join(tmpdir(), "qc-promotion-mfa-rejection-"));
    try {
      const marker = writeQcFakeTools(dir, { serial });
      const run = runQcPty(dir);
      assert.equal(run.status, 69, `${run.stdout}\n${run.stderr}`);
      assert.match(`${run.stdout}${run.stderr}`, /Configured MFA serial is absent, malformed, or outside the approved account/);
      assert.doesNotMatch(`${run.stdout}${run.stderr}`, /123456/);
      assert.deepEqual(readFileSync(marker, "utf8").trim().split("\n"), ["configure:get"]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test("a valid MFA device cannot substitute another post-MFA principal", () => {
  const dir = mkdtempSync(join(tmpdir(), "qc-promotion-identity-rejection-"));
  try {
    const marker = writeQcFakeTools(dir, { serial: "arn:aws:iam::286853118812:mfa/alternate-device", identity: { Account: "286853118812", Arn: "arn:aws:iam::286853118812:user/OtherUser" } });
    const run = runQcPty(dir);
    assert.equal(run.status, 77, `${run.stdout}\n${run.stderr}`);
    assert.match(`${run.stdout}${run.stderr}`, /not the exact approved operator identity/);
    assert.deepEqual(readFileSync(marker, "utf8").trim().split("\n"), ["configure:get", "sts:get-session-token", "sts:get-caller-identity"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
