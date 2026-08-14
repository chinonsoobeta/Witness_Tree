import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const helperPath = new URL("../scripts/run-phase1-archive-owner-exercise.sh", import.meta.url).pathname;
const helper = readFileSync(helperPath, "utf8");

function invalidTotpPty(input) {
  const program = [
    "set timeout 5",
    `spawn bash ${helperPath} --run`,
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
  assert.match(helper, /--cli-connect-timeout "\$CLI_CONNECT_TIMEOUT" --cli-read-timeout "\$CLI_READ_TIMEOUT"/);
  assert.match(helper, /sts get-session-token/);
  assert.match(helper, /Set this profile's exact assigned virtual-MFA serial locally, then retry\./);
  assert.doesNotMatch(helper, /mfa_serial="arn:aws:iam::\$\{account_id\}:mfa\/WitnessTreeArchiveOperator"/);
  assert.match(helper, /sts assume-role/);
  assert.match(helper, /put-object-legal-hold.*Status=ON/);
  assert.match(helper, /put-object-legal-hold.*Status=OFF/);
  assert.match(helper, /Safety failure: uploader version-specific delete unexpectedly succeeded/);
  assert.match(helper, /not-verifiable-with-approved-role/);
  assert.doesNotMatch(helper, /exec 2>|--no-verify-ssl|root-access-key|console-password/);
  assert.ok(helper.indexOf('read -r -s -p "Current WitnessTreeArchiveOperator TOTP') < helper.indexOf('identity="$(run_aws identity'), "TOTP validation must occur before the first AWS call.");
});

test("interactive PTY shows prompt and rejects invalid or empty input before AWS mutation", () => {
  invalidTotpPty("abc");
  invalidTotpPty("");
});
