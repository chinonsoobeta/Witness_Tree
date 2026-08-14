import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { commandPlan, executeArchiveControls, policies, validateArchiveControlsExecution, validateExecutionOptions } from "../scripts/phase1-archive-controls-execution.mjs";

const plan = JSON.parse(readFileSync(new URL("../data/phase1-archive-controls-execution.json", import.meta.url), "utf8"));
const approved = (workDir) => ({ execute: true, "approve-identities": true, "approve-identity-bootstrap": true, "approve-audit-logging": true, "approve-inventory": true, "approve-lifecycle": true, "approve-legal-hold-exercise": true, "approve-recovery-replication": true, "approve-usd-10-monthly-ceiling": true, accountId: "123456789012", trustedPrincipalArn: "arn:aws:iam::123456789012:user/WitnessTreeArchiveOperator", exerciseRetentionUntil: "2033-08-12T00:00:00Z", exerciseKey: "raw/legal-hold-exercises/2030-01-01/test-run/payload.txt", exercisePayloadFile: join(workDir, "payload.txt"), monthlyCeiling: 10, workDir });

test("archive-controls package remains explicit, Canadian, cost-bounded, and dry-run by default", () => {
  assert.equal(validateArchiveControlsExecution(plan), plan);
  const commands = commandPlan(plan, { execute: false });
  assert.ok(commands.some((command) => command.includes("--object-lock-enabled-for-bucket")));
  assert.ok(commands.some((command) => command.includes("put-bucket-inventory-configuration")));
  assert.ok(commands.some((command) => command.includes("put-bucket-lifecycle-configuration")));
  assert.ok(commands.filter((command) => ["s3api", "cloudtrail"].includes(command[0])).every((command) => command.includes("ca-central-1")));
  assert.equal(commands.filter((command) => command.includes("put-bucket-lifecycle-configuration")).length, 1);
  const generated = policies(plan, approved("/private/tmp/archive-controls-test"));
  assert.equal(generated.uploaderTrust.Statement[0].Condition.Bool["aws:MultiFactorAuthPresent"], "true");
  assert.equal(generated.breakGlassTrust.Statement[0].Principal.AWS, "arn:aws:iam::123456789012:user/WitnessTreeArchiveOperator");
});

test("execution fails closed without every approval, a Canadian account principal, bounded cost, or dedicated exercise key", () => {
  const dir = mkdtempSync(join(tmpdir(), "archive-controls-"));
  try {
    const options = approved(dir);
    assert.throws(() => validateExecutionOptions(plan, { ...options, "approve-inventory": false }), /approve-inventory/);
    assert.throws(() => validateExecutionOptions(plan, { ...options, accountId: "not-an-account" }), /12-digit/);
    assert.throws(() => validateExecutionOptions(plan, { ...options, trustedPrincipalArn: "arn:aws:iam::123456789012:role/wrong" }), /no-console IAM bootstrap user/);
    assert.throws(() => validateExecutionOptions(plan, { ...options, monthlyCeiling: 11 }), /US\$10/);
    assert.throws(() => validateExecutionOptions(plan, { ...options, exerciseKey: "raw/source.zip" }), /dedicated non-source/);
    assert.throws(() => validateArchiveControlsExecution({ ...plan, state: "applied" }), /unapplied/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("approved execution creates only local policy files before invoking the injected AWS runner", () => {
  const dir = mkdtempSync(join(tmpdir(), "archive-controls-"));
  try {
    writeFileSync(join(dir, "payload.txt"), "legal-hold exercise only\n");
    const calls = [];
    const commands = executeArchiveControls(plan, approved(dir), (args) => calls.push(args));
    assert.equal(calls.length, commands.length);
    const lifecycle = JSON.parse(readFileSync(join(dir, "lifecycle.json"), "utf8"));
    assert.deepEqual(lifecycle.Rules[0], { ID: "abort-incomplete-multipart-after-7-days", Status: "Enabled", Filter: { Prefix: "raw/" }, AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 } });
    const replication = JSON.parse(readFileSync(join(dir, "replication.json"), "utf8"));
    assert.equal(replication.Rules[0].ExistingObjectReplication.Status, "Disabled");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
