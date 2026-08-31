import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const checker = new URL("../scripts/check-current-wildfire-versioned-readback-iam-applied-record-consistency.mjs", import.meta.url).pathname;
const checkerSource = readFileSync(checker, "utf8");
const evidence = JSON.parse(readFileSync(new URL("../data/current-wildfire-versioned-readback-iam-applied-2026-08-25.json", import.meta.url), "utf8"));

test("current-wildfire exact-version IAM evidence stays redacted and checksum-bound", () => {
  const result = spawnSync(process.execPath, [checker], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /does not query AWS/);
  assert.doesNotMatch(checkerSource, /node:child_process|@aws-sdk|from ["']aws-sdk|\bspawn(?:Sync)?\s*\(|\bexec(?:File|Sync)?\s*\(|\bfetch\s*\(/);
  assert.equal(evidence.checksums.desiredPolicySha256, evidence.checksums.readbackPolicySha256);
  assert.equal(evidence.validation.exactVersionRead, "allowed");
  assert.equal(evidence.validation.outOfScopeVersionRead, "implicitDeny");
  assert.equal(evidence.change.resourceCount, 8);
  assert.doesNotMatch(JSON.stringify(evidence), /AccessKeyId|SecretAccessKey|SessionToken|VersionId/i);
});

test("provisioner dry run derives the attested exact version-read policy without writing IAM", () => {
  const dir = mkdtempSync(join(tmpdir(), "current-wildfire-versioned-iam-"));
  try {
    const plan = JSON.parse(readFileSync(new URL("../data/current-wildfire-immutable-promotion-preparation.json", import.meta.url), "utf8"));
    const resources = plan.proposedRoleScope.objectKeys.map((key) => `arn:aws:s3:::witness-tree-raw-archive-ca-central-1/${key}`);
    const base = { Version: "2012-10-17", Statement: [
      { Sid: "ExactCurrentWildfireObjectTransfer", Effect: "Allow", Action: ["s3:PutObject", "s3:GetObject", "s3:AbortMultipartUpload", "s3:ListMultipartUploadParts"], Resource: resources },
      { Sid: "ExactCurrentWildfirePayloadAndSidecarRetention", Effect: "Allow", Action: ["s3:PutObjectRetention", "s3:GetObjectRetention"], Resource: resources }
    ] };
    const fake = join(dir, "aws"); const calls = join(dir, "calls"); const policy = join(dir, "policy.json");
    writeFileSync(policy, JSON.stringify(base));
    writeFileSync(fake, `#!/bin/zsh
print -r -- "$*" >> ${JSON.stringify(calls)}
case "$1:$2" in
  sts:get-caller-identity) print -r -- '{"Account":"286853118812","Arn":"arn:aws:iam::286853118812:root"}' ;;
  iam:get-role) print -r -- '{"Role":{"AssumeRolePolicyDocument":{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"sts:AssumeRole","Principal":{"AWS":"arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator"},"Condition":{"Bool":{"aws:MultiFactorAuthPresent":"true"}}}]}}}' ;;
  iam:get-role-policy) jq -n --slurpfile document ${JSON.stringify(policy)} '{PolicyDocument:$document[0]}' ;;
  accessanalyzer:validate-policy) print -r -- '{"findings":[]}' ;;
  iam:simulate-custom-policy) if [[ "$*" == *not-approved* ]]; then print -r -- '{"EvaluationResults":[{"EvalDecision":"implicitDeny"}]}' ; else print -r -- '{"EvaluationResults":[{"EvalDecision":"allowed"}]}' ; fi ;;
  *) exit 99 ;;
esac
`);
    chmodSync(fake, 0o700);
    const provisioner = new URL("../scripts/provision-current-wildfire-versioned-readback-iam.mjs", import.meta.url).pathname;
    const run = spawnSync(process.execPath, [provisioner], { encoding: "utf8", env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } });
    assert.equal(run.status, 0, run.stdout + run.stderr);
    const result = JSON.parse(run.stdout);
    assert.equal(result.basePolicySha256, evidence.checksums.basePolicySha256);
    assert.equal(result.desiredPolicySha256, evidence.checksums.desiredPolicySha256);
    assert.equal(result.readbackPolicySha256, evidence.checksums.basePolicySha256);
    assert.doesNotMatch(readFileSync(calls, "utf8"), /put-role-policy/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
