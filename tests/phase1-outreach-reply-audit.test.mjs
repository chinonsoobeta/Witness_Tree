import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase1OutreachReplyAudit } from "../scripts/check-phase1-outreach-reply-audit.mjs";

const read = (name) => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), "utf8"));
const audit = read("phase1-outreach-reply-audit");
const matrix = read("phase1-access-blocker-resolution");
const pkg = read("phase1-permission-outreach-package");

test("reply audit maps bounded substantive replies to eight blocked rows and no partial rows", () => {
  assert.equal(validatePhase1OutreachReplyAudit(audit, matrix, pkg), audit);
  assert.equal(audit.counts.substantiveReplyRecords, 5);
  assert.equal(audit.counts.accessBlockedRowsWithSubstantiveReply, 8);
  assert.equal(audit.rows.filter(({ kind, replyRecordIds }) => kind === "access-blocked" && replyRecordIds.length > 0).length, 8);
  assert.equal(audit.rows.filter(({ kind, replyRecordIds }) => kind === "partial-component" && replyRecordIds.length > 0).length, 0);
  assert.equal(audit.rows.every(({ lawfulAcquisitionNow }) => lawfulAcquisitionNow !== true), true);
});

test("reply audit rejects invented resolution or retained Gmail identifiers", () => {
  const resolved = structuredClone(audit);
  resolved.rows.find(({ id }) => id === "bc-vri").lawfulAcquisitionNow = true;
  assert.throws(() => validatePhase1OutreachReplyAudit(resolved, matrix, pkg), /strictly equal|false/);
  const identifier = structuredClone(audit);
  identifier.substantiveReplies[0].threadId = "forbidden";
  assert.throws(() => validatePhase1OutreachReplyAudit(identifier, matrix, pkg), /Gmail message or thread identifiers/i);
});
