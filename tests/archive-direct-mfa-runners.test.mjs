import assert from "node:assert/strict";
import test from "node:test";
import { validateArchiveDirectMfaRunners, validateRunnerSource } from "../scripts/check-archive-direct-mfa-runners.mjs";
test("archive runners pass the direct-MFA gate", () => assert.equal(validateArchiveDirectMfaRunners(), true));
test("archive runners reject hostile legacy and chained session designs", () => {
  for (const source of [
    "aws sts get-session-token --duration-seconds 43200",
    "aws sts assume-role --duration-seconds 3600",
    "aws sts assume-role --duration-seconds 43200",
    "AWS_ACCESS_KEY_ID=temporary aws sts assume-role --profile operator --serial-number mfa --token-code 123456 --duration-seconds 43200",
    "export AWS_SESSION_TOKEN=temporary\naws sts assume-role --profile operator --serial-number mfa --token-code 123456 --duration-seconds 43200"
  ]) assert.throws(() => validateRunnerSource("hostile.sh", source));
});
