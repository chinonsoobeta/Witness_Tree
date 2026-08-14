import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase1PermissionOutreachPackage } from "../scripts/check-phase1-permission-outreach-package.mjs";

const pkg = JSON.parse(readFileSync(new URL("../data/phase1-permission-outreach-package.json", import.meta.url), "utf8"));
const matrix = JSON.parse(readFileSync(new URL("../data/phase1-access-blocker-resolution.json", import.meta.url), "utf8"));

test("owner-review outreach package covers every access-blocked row without claiming a send", () => {
  assert.equal(validatePhase1PermissionOutreachPackage(pkg, matrix), pkg);
  assert.equal(pkg.messages.filter((message) => message.status === "draft-not-sent").length, 7);
  assert.equal(pkg.messages.filter((message) => message.status.includes("already-sent")).length, 1);
  assert.deepEqual(new Set(pkg.messages.flatMap((message) => message.canonicalRowIds)), new Set(matrix.rankedRows.map((row) => row.id)));
});

test("outreach package rejects a missing row or an invented sent draft", () => {
  const missing = structuredClone(pkg); missing.messages[0].canonicalRowIds = ["bc-fta-cutblocks"];
  assert.throws(() => validatePhase1PermissionOutreachPackage(missing, matrix), /every canonical access-blocked row/i);
  const sent = structuredClone(pkg); sent.messages[0].status = "sent-awaiting-response";
  assert.throws(() => validatePhase1PermissionOutreachPackage(sent, matrix), /unsent drafts/i);
});
