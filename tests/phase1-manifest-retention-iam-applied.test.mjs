import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { evidencePath, validateAppliedManifestRetentionIam } from "../scripts/check-phase1-manifest-retention-iam-applied.mjs";

const raw = () => readFileSync(evidencePath, "utf8");
test("applied IAM record is exact and policy-only", () => assert.equal(validateAppliedManifestRetentionIam(), true));
for (const [name, from, to] of [
  ["retention action", "s3:GetObjectRetention", "s3:DeleteObject"],
  ["analyzer finding", "securityWarningFindings\": 0", "securityWarningFindings\": 1"],
  ["production claim", "phase1Complete\": false", "phase1Complete\": true"],
  ["live policy hash", "dd9e6519218141459dbddbb0e7a0a6cab2f2a7ea1ea2fa084297fbd36b1e74cd", "0000000000000000000000000000000000000000000000000000000000000000"]
]) test(`rejects ${name} tampering`, () => assert.throws(() => validateAppliedManifestRetentionIam(raw().replace(from, to)), /checksum/));
