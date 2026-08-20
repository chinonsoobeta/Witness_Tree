import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase1PermissionOutreachPackage } from "../scripts/check-phase1-permission-outreach-package.mjs";

const pkg = JSON.parse(readFileSync(new URL("../data/phase1-permission-outreach-package.json", import.meta.url), "utf8"));
const matrix = JSON.parse(readFileSync(new URL("../data/phase1-access-blocker-resolution.json", import.meta.url), "utf8"));

test("verified outreach sends cover every access-blocked row without claiming a response or admission", () => {
  assert.equal(validatePhase1PermissionOutreachPackage(pkg, matrix), pkg);
  assert.equal(pkg.messages.filter((message) => typeof message.verifiedSentAt === "string").length, 7);
  assert.equal(pkg.messages.filter((message) => message.status.includes("already-sent")).length, 1);
  assert.equal(pkg.messages.filter((message) => typeof message.verifiedSentAt === "string").every((message) => message.verifiedSentAt && message.sentVerification), true);
  assert.equal(pkg.messages.filter((message) => message.status === "reply-received-awaiting-resolution").length, 4);
  assert.equal(pkg.messages.filter((message) => message.status === "automatic-reply-only-awaiting-substantive-response").length, 1);
  assert.equal(pkg.officialRouteAuditFile, "data/phase1-bec-custom-download-route-audit.json");
  assert.match(pkg.scope, /not an acquisition.*production eligibility/i);
  assert.deepEqual(new Set(pkg.messages.flatMap((message) => message.canonicalRowIds)), new Set(matrix.rankedRows.map((row) => row.id)));
});

test("outreach package rejects a missing row, unverifiable sent evidence, or retained Gmail identifiers", () => {
  const missing = structuredClone(pkg); missing.messages[0].canonicalRowIds = ["bc-fta-cutblocks"];
  assert.throws(() => validatePhase1PermissionOutreachPackage(missing, matrix), /every canonical access-blocked row/i);
  const missingSentEvidence = structuredClone(pkg); delete missingSentEvidence.messages[0].verifiedSentAt;
  assert.throws(() => validatePhase1PermissionOutreachPackage(missingSentEvidence, matrix), /bounded, non-sensitive verified send evidence/i);
  const identifier = structuredClone(pkg); identifier.messages[0].messageId = "forbidden";
  assert.throws(() => validatePhase1PermissionOutreachPackage(identifier, matrix), /must not retain Gmail message or thread identifiers/i);
});
