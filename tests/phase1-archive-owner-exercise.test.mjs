import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const helperPath = new URL("../scripts/run-phase1-archive-owner-exercise.sh", import.meta.url).pathname;
const helper = readFileSync(helperPath, "utf8");

function invalidTotpPty(mode, input) {
  const program = [
    "set timeout 5",
    `spawn bash ${helperPath} ${mode}`,
    "expect \"Current WitnessTreeArchiveOperator TOTP (not saved): \"",
    "send -- \"" + input + "\\n\"",
    "expect \"Stopped: TOTP must contain 6–8 digits.\"",
    "expect eof"
  ].join("; ");
  const result = spawnSync("/usr/bin/expect", ["-c", program], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(`${result.stdout}${result.stderr}`, /Current WitnessTreeArchiveOperator TOTP \(not saved\):/);
  assert.match(`${result.stdout}${result.stderr}`, /Stopped: TOTP must contain 6–8 digits\./);
}

test("owner-local archive exercise has bounded, redacted MFA and control flow", () => {
  assert.match(helper, /read -r -s -p "Current WitnessTreeArchiveOperator TOTP/);
  assert.match(helper, /CLI_READ_TIMEOUT=15/);
  assert.match(helper, /--cli-connect-timeout "\$CLI_CONNECT_TIMEOUT" --cli-read-timeout "\$CLI_READ_TIMEOUT"/);
  assert.match(helper, /sts get-session-token/);
  assert.match(helper, /Date\.parse\(wanted\) !== Date\.parse\(actual\)/);
  assert.doesNotMatch(helper, /Retention\.RetainUntilDate == \$until/);
  assert.match(helper, /Set this profile's exact assigned virtual-MFA serial locally, then retry\./);
  assert.match(helper, /arn:aws:iam::\$\{account_id\}:mfa\/WitnessTreeArchiveOperator/);
  assert.doesNotMatch(helper, /mfa_serial="arn:aws:iam::\$\{account_id\}:mfa\/WitnessTreeArchiveOperator"/);
  assert.match(helper, /sts assume-role/);
  assert.match(helper, /VERIFIER_ROLE="WitnessTreeArchiveVerifier"/);
  assert.match(helper, /--recover-latest/);
  assert.match(helper, /verifier-list-exercise-versions/);
  assert.match(helper, /recovery-legal-hold-off/);
  assert.match(helper, /redacted-recovery-readback\.json/);
  assert.match(helper, /assert_same_retention/);
  assert.match(helper, /put-object-legal-hold.*Status=ON/);
  assert.match(helper, /put-object-legal-hold.*Status=OFF/);
  assert.match(helper, /Safety failure: uploader version-specific delete unexpectedly succeeded/);
  assert.match(helper, /not-queryable-by-verifier-role/);
  assert.match(helper, /bounded recovery-replica readback \$\{attempt\}\/6/);
  assert.match(helper, /Recovery replica did not read back within the bounded window/);
  assert.match(helper, /check-phase1-archive-exercise-readback\.mjs/);
  assert.doesNotMatch(helper, /exec 2>|--no-verify-ssl|root-access-key|console-password/);
  assert.ok(helper.indexOf('read -r -s -p "Current WitnessTreeArchiveOperator TOTP') < helper.indexOf('identity="$(run_aws identity'), "TOTP validation must occur before the first AWS call.");
});

test("retention instants compare across equivalent Z and UTC-offset forms", () => {
  assert.equal(Date.parse("2026-08-16T12:34:56Z"), Date.parse("2026-08-16T12:34:56+00:00"));
});

test("interactive PTY shows prompt and rejects invalid or empty input before AWS mutation", () => {
  invalidTotpPty("--run", "abc");
  invalidTotpPty("--run", "");
  invalidTotpPty("--recover-latest", "abc");
});
