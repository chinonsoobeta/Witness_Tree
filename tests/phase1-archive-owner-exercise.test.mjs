import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const helper = readFileSync(new URL("../scripts/run-phase1-archive-owner-exercise.sh", import.meta.url), "utf8");

test("owner-local archive exercise is MFA prompted, redacted, and fails closed on deletion", () => {
  assert.match(helper, /read -r -s -p "Current WitnessTreeArchiveOperator TOTP/);
  assert.match(helper, /sts get-session-token/);
  assert.match(helper, /sts assume-role/);
  assert.match(helper, /cloudtrail lookup-events/);
  assert.match(helper, /s3api head-object --bucket "\$RECOVERY_BUCKET" --key "\$exercise_key"/);
  assert.match(helper, /put-object-legal-hold.*Status=ON/);
  assert.match(helper, /put-object-legal-hold.*Status=OFF/);
  assert.match(helper, /Safety failure: uploader version-specific delete unexpectedly succeeded/);
  assert.match(helper, /not-verifiable-with-approved-role/);
  assert.match(helper, /exec 2>"\$evidence_dir\/private\.stderr"/);
  assert.doesNotMatch(helper, /--no-verify-ssl|root-access-key|console-password/);
});
