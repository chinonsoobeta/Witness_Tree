import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { approvalTemplate, buildEvidence, validateApproval, validateEvidence, validateHead, validateRetention } from "../scripts/check-wildfire-derived-manifest-retention.mjs";
import { expectedObjects } from "../scripts/check-wildfire-derived-recovery.mjs";

const head = (name, version) => ({ ContentLength: expectedObjects()[name].byteLength, ChecksumType: "FULL_OBJECT", ChecksumCRC64NVME: "AAAAAAAAAAA=", VersionId: version });
const retention = () => ({ Retention: { Mode: "COMPLIANCE", RetainUntilDate: "2033-08-12T00:00:00Z" } });
const approved = () => ({ ...approvalTemplate(), status: "owner-approved", approved: true });

test("manifest-retention approval is limited to the two exact manifests", () => {
  const value = approved();
  assert.equal(validateApproval(value), true);
  assert.deepEqual(value.targetObjectNames, ["bcManifest", "ontarioManifest"]);
  value.targetObjectNames.push("bcPayload");
  assert.throws(() => validateApproval(value), /targetObjectNames is not exact/);
});

test("manifest-retention preflight reaches no AWS command when the controlled data root is absent", () => {
  const dir = mkdtempSync(join(tmpdir(), "manifest-retention-preflight-no-aws-"));
  const marker = join(dir, "aws-called");
  const runner = new URL("../scripts/run-wildfire-derived-manifest-retention.sh", import.meta.url).pathname;
  const approval = join(dir, "approval.json");
  const evidence = join(dir, "evidence.json");
  writeFileSync(approval, "{}\n", { mode: 0o600 });
  writeFileSync(join(dir, "aws"), `#!/bin/zsh\ntouch ${JSON.stringify(marker)}\nexit 91\n`, { mode: 0o700 });
  try {
    const run = spawnSync("zsh", [runner, "--preflight", approval, evidence], { encoding: "utf8", env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, WITNESS_TREE_DATA_ROOT: join(dir, "absent-data") } });
    assert.equal(run.status, 65, run.stdout + run.stderr);
    assert.match(run.stderr, /Paths must be absolute and the data root must exist; no TOTP or AWS call was made/);
    assert.equal(existsSync(marker), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("heads and retention fail closed on drift", () => {
  assert.equal(validateHead(head("bcManifest", "bc-manifest-version"), "bcManifest"), true);
  assert.equal(validateRetention(retention(), "bcManifest"), true);
  assert.throws(() => validateHead({ ...head("bcManifest", "v"), ContentLength: 1 }, "bcManifest"), /byte length/);
  assert.throws(() => validateRetention({ Retention: { Mode: "GOVERNANCE", RetainUntilDate: "2033-08-12T00:00:00Z" } }, "bcManifest"), /COMPLIANCE/);
});

test("redacted evidence binds all exact heads and only the two manifest retentions", () => {
  const heads = { bcPayload: head("bcPayload", "bc-payload-version"), bcManifest: head("bcManifest", "bc-manifest-version"), ontarioPayload: head("ontarioPayload", "on-payload-version"), ontarioManifest: head("ontarioManifest", "on-manifest-version") };
  const evidence = buildEvidence(approved(), heads, { bcPayload: retention(), bcManifest: retention(), ontarioPayload: retention(), ontarioManifest: retention() });
  assert.equal(evidence.status, "completed");
  assert.deepEqual(Object.keys(evidence.objectRetention).sort(), ["bcManifest", "bcPayload", "ontarioManifest", "ontarioPayload"]);
  assert.doesNotMatch(JSON.stringify(evidence), /bc-manifest-version|on-manifest-version|AAAAAAAAAAA=/);
});

test("captured owner-run evidence is exact and tamper resistant", () => {
  const evidence = JSON.parse(readFileSync(new URL("../data/current-wildfire-derived-manifest-retention-evidence.json", import.meta.url), "utf8"));
  const approval = JSON.parse(readFileSync(new URL("../data/current-wildfire-derived-manifest-retention-owner-approval.json", import.meta.url), "utf8"));
  assert.equal(validateEvidence(evidence, approval), true);
  assert.throws(() => validateEvidence({ ...evidence, productionEligible: true }, approval), /cannot authorize production/);
});
