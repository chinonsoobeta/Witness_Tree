import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase1OutreachReplyAudit } from "../scripts/check-phase1-outreach-reply-audit.mjs";

const read = (name) => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), "utf8"));
const audit = read("phase1-outreach-reply-audit");
const matrix = read("phase1-access-blocker-resolution");
const pkg = read("phase1-permission-outreach-package");
const routeAudit = read("phase1-bec-custom-download-route-audit");

test("reply audit maps seven substantive replies and records the BEC ticket receipt without resolution", () => {
  assert.equal(validatePhase1OutreachReplyAudit(audit, matrix, pkg, routeAudit), audit);
  assert.equal(audit.counts.substantiveReplyRecords, 7);
  assert.equal(audit.counts.automaticOrAcknowledgementOnlyRecords, 4);
  assert.equal(audit.automaticOrAcknowledgementOnly.length, 4);
  const becTicketReceipt = audit.automaticOrAcknowledgementOnly.find(({ outreachMessageId }) => outreachMessageId === "bc-bec-v13-1-snapshot");
  assert.equal(becTicketReceipt?.status, "service-portal-ticket-received-and-queued");
  assert.deepEqual(becTicketReceipt?.canonicalRowIds, ["bc-old-growth-bec"]);
  assert.equal(audit.counts.accessBlockedRowsWithSubstantiveReply, 8);
  assert.equal(audit.rows.filter(({ kind, replyRecordIds }) => kind === "access-blocked" && replyRecordIds.length > 0).length, 8);
  assert.equal(audit.rows.filter(({ kind, replyRecordIds }) => kind === "partial-component" && replyRecordIds.length > 0).length, 0);
  assert.equal(audit.rows.every(({ lawfulAcquisitionNow }) => lawfulAcquisitionNow !== true), true);
  assert.equal(audit.officialRouteAuditFile, "data/phase1-bec-custom-download-route-audit.json");
});
test("reply audit rejects invented resolution or retained Gmail identifiers", () => {
  const resolved = structuredClone(audit);
  resolved.rows.find(({ id }) => id === "bc-vri").lawfulAcquisitionNow = true;
  assert.throws(() => validatePhase1OutreachReplyAudit(resolved, matrix, pkg, routeAudit), /strictly equal|false/);
  const identifier = structuredClone(audit);
  identifier.substantiveReplies[0].threadId = "forbidden";
  assert.throws(() => validatePhase1OutreachReplyAudit(identifier, matrix, pkg, routeAudit), /Gmail message or thread identifiers/i);
});
