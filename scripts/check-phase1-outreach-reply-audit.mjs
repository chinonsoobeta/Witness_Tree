import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { validatePhase1BecCustomDownloadRouteAudit } from "./check-phase1-bec-custom-download-route-audit.mjs";

const ACCESS_ROWS = [
  "bc-fta-cutblocks", "bc-harvesting-authorities", "on-fri", "on-fri-term-2",
  "bc-old-growth-bec", "bc-consolidated-cutblocks", "bc-vri", "bc-forest-operations-map",
  "sopfeu", "indian-reserves", "first-nation-reserves", "historic-treaties", "modern-treaties"
];
const PARTIAL_ROWS = ["cwfis-historical", "provincial-electoral-boundaries"];
const REPLY_STATUSES = new Set([
  "reply-received-foi-route-no-export",
  "reply-received-catalogue-deferral-no-package",
  "replies-received-service-route-and-permission-process-no-resolution",
  "replies-received-service-route-custom-download-and-permission-process-no-resolution",
  "reply-received-use-details-clarified-no-authorization",
  "reply-received-permission-process-no-authorization",
  "custom-download-route-no-acquisition",
  "no-substantive-reply",
  "automatic-reply-only-no-substantive-guidance",
  "owner-review-draft-not-sent",
  "owner-review-drafts-not-sent"
]);

function noMailboxIdentifiers(value) {
  const serialized = JSON.stringify(value);
  assert.doesNotMatch(serialized, /mail\.google\.com/i, "Reply evidence must not retain Gmail mailbox links.");
  assert.doesNotMatch(serialized, /\b(?:message|thread)[ _-]?id\b/i, "Reply evidence must not retain Gmail message or thread identifiers.");
}
export function validatePhase1OutreachReplyAudit(audit, matrix, pkg, routeAudit) {
  assert.equal(audit?.schemaVersion, 1);
  assert.equal(audit.status, "read-only-reply-audit-complete-no-resolution");
  assert.match(audit.auditedAt ?? "", /^2026-08-20T\d{2}:\d{2}:\d{2}Z$/);
  assert.match(audit.source ?? "", /Gmail read-only searches and bounded thread reads/i);
  assert.match(audit.nonClaimNotice ?? "", /not permission.*not an acquisition.*production eligibility/i);
  assert.equal(audit.officialRouteAuditFile, "data/phase1-bec-custom-download-route-audit.json");
  validatePhase1BecCustomDownloadRouteAudit(routeAudit);
  noMailboxIdentifiers(audit);
  assert.deepEqual(audit.counts, {
    canonicalAccessBlockedRows: 13,
    canonicalPartialRows: 2,
    substantiveReplyRecords: 6,
    accessBlockedRowsWithSubstantiveReply: 8,
    accessBlockedRowsWithoutSubstantiveReply: 5,
    partialRowsWithSubstantiveReply: 0,
    partialRowsWithoutSubstantiveReply: 2,
    automaticOrAcknowledgementOnlyRecords: 3,
    ownerFollowUpsObserved: 3,
    rawEvidenceCreditImpact: 0,
    productionEligibilityImpact: 0
  });
  assert.equal(audit.substantiveReplies.length, 6);
  assert.equal(audit.automaticOrAcknowledgementOnly.length, 3);
  assert.equal(audit.ownerFollowUpsObserved.length, 3);
  assert.equal(audit.rows.length, 15);
  const matrixRows = matrix?.rankedRows?.map(({ id }) => id) ?? [];
  assert.deepEqual(matrixRows, ACCESS_ROWS);
  const rowIds = audit.rows.map(({ id }) => id);
  assert.deepEqual(rowIds, [...ACCESS_ROWS, ...PARTIAL_ROWS]);
  const replyIds = new Set(audit.substantiveReplies.map(({ id }) => id));
  assert.equal(replyIds.size, 6);
  const packageIds = new Set(pkg?.messages?.map(({ id }) => id) ?? []);
  for (const reply of audit.substantiveReplies) {
    assert.ok(packageIds.has(reply.outreachMessageId), `Reply ${reply.id} must map to an outreach message.`);
    assert.ok(reply.canonicalRowIds?.length);
    assert.match(reply.receivedAt ?? "", /^2026-08-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    assert.equal(reply.status.includes("permission") && reply.status.includes("granted"), false);
    assert.equal(reply.remainingBlockers.length > 0, true);
  }
  const rowsWithSubstantive = audit.rows.filter(({ replyRecordIds }) => replyRecordIds.length > 0 && replyRecordIds.some((id) => replyIds.has(id)));
  assert.equal(rowsWithSubstantive.filter(({ kind }) => kind === "access-blocked").length, 8);
  assert.equal(rowsWithSubstantive.filter(({ kind }) => kind === "partial-component").length, 0);
  for (const row of audit.rows) {
    assert.ok(REPLY_STATUSES.has(row.replyStatus), `${row.id} has an unknown reply status.`);
    assert.ok(Array.isArray(row.remainingBlockers) && row.remainingBlockers.length > 0, `${row.id} must retain remaining blockers.`);
    if (row.kind === "access-blocked") assert.equal(row.lawfulAcquisitionNow, false);
    for (const replyId of row.replyRecordIds) assert.ok(replyIds.has(replyId), `${row.id} references an unknown substantive reply.`);
  }
  return audit;
}

export async function checkPhase1OutreachReplyAudit() {
  const base = new URL("../", import.meta.url);
  const [audit, matrix, pkg, routeAudit] = await Promise.all([
    readFile(new URL("data/phase1-outreach-reply-audit.json", base), "utf8").then(JSON.parse),
    readFile(new URL("data/phase1-access-blocker-resolution.json", base), "utf8").then(JSON.parse),
    readFile(new URL("data/phase1-permission-outreach-package.json", base), "utf8").then(JSON.parse),
    readFile(new URL("data/phase1-bec-custom-download-route-audit.json", base), "utf8").then(JSON.parse)
  ]);
  return validatePhase1OutreachReplyAudit(audit, matrix, pkg, routeAudit);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const audit = await checkPhase1OutreachReplyAudit();
  console.log(`Phase 1 reply audit passed: ${audit.counts.substantiveReplyRecords} substantive replies; ${audit.counts.accessBlockedRowsWithSubstantiveReply}/13 blocked rows touched; BEC route remains blocked before order; no acquisition or permission.`);
}
