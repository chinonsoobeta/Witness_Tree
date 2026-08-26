import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DESIRED } from "../scripts/check-wildfire-derived-readback-iam.mjs";

const provisionerPath = new URL("../scripts/provision-wildfire-derived-readback-iam.mjs", import.meta.url).pathname;
const trust = DESIRED.trustPolicy;
const basePolicy = {
  Version: DESIRED.rolePolicy.Version,
  Statement: DESIRED.rolePolicy.Statement.filter(({ Sid }) => Sid !== DESIRED.requiredDelta.Sid)
};

function writeFakeAws(dir, { race = false, alreadyPresent = false } = {}) {
  const marker = join(dir, "aws-calls");
  const state = join(dir, "live-policy.json");
  const raceState = join(dir, "race-policy.json");
  const raceMarker = join(dir, "race-seen");
  writeFileSync(state, `${JSON.stringify(alreadyPresent ? DESIRED.rolePolicy : basePolicy)}\n`, { mode: 0o600 });
  writeFileSync(raceState, `${JSON.stringify({ ...basePolicy, Statement: [...basePolicy.Statement, { Sid: "Unexpected", Effect: "Allow", Action: ["s3:GetObject"], Resource: ["arn:aws:s3:::witness-tree-raw-archive-ca-central-1/derived/not-approved/payload.gpkg"] }] })}\n`, { mode: 0o600 });
  const fake = [
    "#!/bin/zsh",
    `print -r -- "$*" >> ${JSON.stringify(marker)}`,
    "case \"$1:$2\" in",
    `  sts:get-caller-identity) print -r -- ${JSON.stringify(JSON.stringify({ Account: DESIRED.account, Arn: `arn:aws:iam::${DESIRED.account}:root` }))} ;;`,
    `  iam:get-role) print -r -- ${JSON.stringify(JSON.stringify({ Role: { RoleName: DESIRED.roleName, AssumeRolePolicyDocument: trust } }))} ;;`,
    "  iam:get-role-policy)",
    race ? `    if [[ ! -e ${JSON.stringify(raceMarker)} ]]; then touch ${JSON.stringify(raceMarker)}; fi; if [[ -e ${JSON.stringify(raceMarker)} && -e ${JSON.stringify(state)} && -e ${JSON.stringify(raceState)} && $(wc -l < ${JSON.stringify(marker)}) -gt 3 ]]; then policy_file=${JSON.stringify(raceState)}; else policy_file=${JSON.stringify(state)}; fi` : `    policy_file=${JSON.stringify(state)}`,
    `    jq -n --arg role ${JSON.stringify(DESIRED.roleName)} --arg policy ${JSON.stringify(DESIRED.policyName)} --slurpfile document "$policy_file" '{RoleName:$role,PolicyName:$policy,PolicyDocument:$document[0]}'`,
    "    ;;",
    "  iam:put-role-policy)",
    "    policy_uri=''",
    "    for ((index=1; index <= $#; index++)); do if [[ \"${@[$index]}\" == '--policy-document' ]]; then next=$((index + 1)); policy_uri=\"${@[$next]}\"; fi; done",
    `    cp "\${policy_uri#file://}" ${JSON.stringify(state)}`,
    "    ;;",
    "  accessanalyzer:validate-policy) print -r -- '{\"findings\":[]}' ;;",
    "  iam:simulate-principal-policy)",
    "    if [[ \"$*\" == *s3:DeleteObject* || \"$*\" == *derived/not-approved/* ]]; then decision=implicitDeny; else decision=allowed; fi",
    "    print -r -- \"{\\\"EvaluationResults\\\":[{\\\"EvalDecision\\\":\\\"$decision\\\"}]}\"",
    "    ;;",
    "  *) print -u2 -- 'unexpected AWS operation'; exit 99 ;;",
    "esac",
    ""
  ].join("\n");
  const awsPath = join(dir, "aws");
  writeFileSync(awsPath, fake, { mode: 0o700 });
  chmodSync(awsPath, 0o700);
  return { marker, state, awsPath };
}

function runProvisioner(dir, attestation, extra = []) {
  return spawnSync(process.execPath, [provisionerPath, "--profile", "default", "--attestation", attestation, ...extra], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}` }
  });
}

test("dry-run is default, appends only the exact versioned-readback statement, and writes a redacted mode-600 plan", () => {
  const dir = mkdtempSync(join(tmpdir(), "wildfire-derived-iam-provision-dry-run-"));
  try {
    const fake = writeFakeAws(dir);
    const attestation = join(dir, "attestation.json");
    const run = runProvisioner(dir, attestation);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    const planned = JSON.parse(readFileSync(attestation, "utf8"));
    assert.equal(planned.status, "planned");
    assert.equal(planned.applied, false);
    assert.equal(planned.change, "append-versioned-readback");
    assert.equal(planned.readbackPolicySha256, null);
    assert.equal(planned.noCredentials, true);
    assert.equal(planned.noObjectVersionIds, true);
    assert.equal(planned.noUploadIds, true);
    assert.equal(statSync(attestation).mode & 0o777, 0o600);
    assert.doesNotMatch(readFileSync(fake.marker, "utf8"), /put-role-policy/);
    assert.doesNotMatch(run.stdout + run.stderr, /secret|version-id|upload-id/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("dry-run accepts the exact statement when already present without rewriting IAM", () => {
  const dir = mkdtempSync(join(tmpdir(), "wildfire-derived-iam-provision-present-"));
  try {
    const fake = writeFakeAws(dir, { alreadyPresent: true });
    const attestation = join(dir, "attestation.json");
    const run = runProvisioner(dir, attestation);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    const planned = JSON.parse(readFileSync(attestation, "utf8"));
    assert.equal(planned.status, "planned");
    assert.equal(planned.applied, false);
    assert.equal(planned.change, "already-present");
    assert.equal(planned.basePolicySha256, planned.desiredPolicySha256);
    assert.equal(planned.readbackPolicySha256, null);
    assert.doesNotMatch(readFileSync(fake.marker, "utf8"), /put-role-policy/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("mocked apply path performs one additive put and proves the post-apply SHA attestation", () => {
  const dir = mkdtempSync(join(tmpdir(), "wildfire-derived-iam-provision-apply-"));
  try {
    const fake = writeFakeAws(dir);
    const attestation = join(dir, "attestation.json");
    const run = runProvisioner(dir, attestation, ["--apply"]);
    assert.equal(run.status, 0, run.stdout + run.stderr);
    const applied = JSON.parse(readFileSync(attestation, "utf8"));
    assert.equal(applied.status, "applied");
    assert.equal(applied.applied, true);
    assert.equal(applied.readbackPolicySha256, applied.desiredPolicySha256);
    assert.equal(readFileSync(fake.marker, "utf8").match(/iam put-role-policy/g)?.length, 1);
    assert.doesNotMatch(readFileSync(fake.marker, "utf8"), /list-user-policies|get-user-policy|list-attached-user-policies|get-policy-version/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("race before apply fails closed without a policy write", () => {
  const dir = mkdtempSync(join(tmpdir(), "wildfire-derived-iam-provision-race-"));
  try {
    const fake = writeFakeAws(dir, { race: true });
    const attestation = join(dir, "attestation.json");
    const run = runProvisioner(dir, attestation, ["--apply"]);
    assert.equal(run.status, 77, run.stdout + run.stderr);
    assert.match(run.stdout + run.stderr, /live policy changed during preflight/);
    assert.doesNotMatch(readFileSync(fake.marker, "utf8"), /iam put-role-policy/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
