import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { evidencePath, validateRoleReadback } from "../scripts/check-aws-role-max-session-readback.mjs";

test("redacted role-duration readback is checksum-bound and exact", () => assert.equal(validateRoleReadback(), true));
test("role-duration readback rejects tampering", () => assert.throws(() => validateRoleReadback(readFileSync(evidencePath, "utf8").replace("43200", "3600")), /checksum/));
