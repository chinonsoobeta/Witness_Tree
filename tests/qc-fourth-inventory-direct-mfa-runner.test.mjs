import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const runner = new URL("../scripts/run-qc-fourth-inventory-approved-promotion.sh", import.meta.url).pathname;

test("Québec fourth-inventory direct-MFA wrapper has two fixed roles, batches, paths, and approval set", () => {
  const source = readFileSync(runner, "utf8");
  assert.match(source, /"WitnessTreeQcFourthArchivePromotionUploader:batch-one"/);
  assert.match(source, /"WitnessTreeQcFourthArchivePromotionUploaderBatchTwo:batch-two"/);
  assert.match(source, /--resume-batch-two/);
  assert.match(source, /batches=\("WitnessTreeQcFourthArchivePromotionUploaderBatchTwo:batch-two"\)/);
  assert.match(source, /--batch "\$BATCH"/);
  assert.match(source, /wt_assume_direct_mfa_role/);
  assert.match(source, /--approve-exact-artifact-set[\s\\]+--approve-iam-policy[\s\\]+--approve-compliance-retention[\s\\]+--approve-mfa-session/);
  assert.match(source, /--retention-until 2033-08-12T00:00:00Z/);
  assert.match(source, /--session-ready/);
  assert.match(source, /immutable-promotion-state/);
  assert.match(source, /immutable-promotion-sidecars/);
  assert.doesNotMatch(source, /ListMFADevices|list-mfa-devices|aws iam |get-session-token|--token-code \$|\$totp/);
  assert.doesNotMatch(source, /--profile\s+\$|--role-arn\s+\$|--data-root\s+\$1/);
});

test("hostile wrapper invocation stops before MFA, STS, or storage", () => {
  const dir = mkdtempSync(join(tmpdir(), "qc-fourth-wrapper-hostile-"));
  const marker = join(dir, "calls");
  writeFileSync(join(dir, "aws"), `#!/bin/zsh\nprint -- "$1:$2" >> ${JSON.stringify(marker)}\nexit 91\n`, { mode: 0o700 });
  try {
    const result = spawnSync("zsh", [runner, "--run", "--data-root", "/hostile"], {
      encoding: "utf8", env: { ...process.env, PATH: `${dir}:${process.env.PATH}` }
    });
    assert.equal(result.status, 64, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}${result.stderr}`, /Usage:/);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /Current MFA TOTP/);
    assert.throws(() => readFileSync(marker, "utf8"), /ENOENT/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("wrapper does not accept an MFA value on the command line", () => {
  const source = readFileSync(runner, "utf8");
  for (const forbidden of ["--totp", "--mfa-code", "--token-code", "read -r", "read -s"]) assert.doesNotMatch(source, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(readFileSync(new URL("../scripts/aws-direct-mfa-role-session.sh", import.meta.url), "utf8"), /read -r -s 'totp\?Current MFA TOTP \(not stored\): '/);
});
