import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const script = readFileSync(new URL("../scripts/run-phase1-approved-promotion.sh", import.meta.url), "utf8");
test("promotion runner validates approved candidates before prompting or writing", () => {
  assert.match(script, /Approved SHA-256 drifted[\s\S]*vared/);
  assert.match(script, /TOTP must be exactly six digits; no AWS call was made/);
  assert.match(script, /WitnessTreeArchivePromotionUploader/);
  assert.doesNotMatch(script, /DeleteObject|PutObjectLegalHold|BypassGovernanceRetention/);
});
