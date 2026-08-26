import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase1CurrentStateCompletionAudit } from "../scripts/check-phase1-current-state-completion-audit.mjs";

const read = (file) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
const args = ["phase1-current-state-completion-audit", "phase1-production-source-ledger", "phase1-source-ledger-decision-readiness", "phase1-immutable-promotion-readiness", "current-wildfire-owner-admission", "phase1-permission-outreach-package", "partial-ledger-owner-review-outreach-package", "phase1-access-blocker-resolution", "phase1-outreach-reply-audit", "phase1-bec-custom-download-route-audit"].map((name) => read(`data/${name}.json`));

test("current-state audit accounts for all 31 rows and remains fail closed", () => {
  const audit = validatePhase1CurrentStateCompletionAudit(...args);
  assert.equal(audit.rows.length, 31);
  assert.equal(audit.ledger.productionEligibleRows, 0);
  assert.equal(audit.ledger.rawEvidenceNumerator, 16.5);
  assert.equal(audit.ledger.immutableArchiveCompleteRows, 16);
  assert.equal(audit.rows.find(({ id }) => id === "ntems-canopy-height").actionPlan, "national-source-ledger-recorded");
  assert.equal(audit.rows.find(({ id }) => id === "ntems-forest-harvest").actionPlan, "national-source-ledger-recorded");
  assert.equal(audit.rows.find(({ id }) => id === "ab-primary-land-vegetation").actionPlan, "plvi-scope-approved");
  assert.equal(audit.rows.find(({ id }) => id === "qc-current-ecoforest").actionPlan, "quebec-source-ledger-recorded");
  assert.equal(audit.globalGates.outreach.repliesRecorded, 8);
  assert.equal(audit.globalGates.normalArchiveExercise.complete, true);
});

test("current-state audit rejects invented eligibility, outreach, or archive evidence", () => {
  const eligible = structuredClone(args[0]); eligible.ledger.productionEligibleRows = 1;
  assert.throws(() => validatePhase1CurrentStateCompletionAudit(eligible, ...args.slice(1)));
  const reply = structuredClone(args[0]); reply.globalGates.outreach.repliesRecorded = 1;
  assert.throws(() => validatePhase1CurrentStateCompletionAudit(reply, ...args.slice(1)));
  const archive = structuredClone(args[0]); archive.globalGates.normalArchiveExercise.complete = false;
  assert.throws(() => validatePhase1CurrentStateCompletionAudit(archive, ...args.slice(1)));
});

test("merged audit rejects stale evidence from either divergent Phase 1 head", () => {
  const staleArchive = structuredClone(args[0]);
  staleArchive.ledger.rawEvidenceNumerator = 13.75;
  staleArchive.ledger.formalEvidenceTrackingPercentage = 38.3064516;
  staleArchive.ledger.immutableArchiveCompleteRows = 5;
  staleArchive.globalGates.immutableArchives.completeRows = 5;
  staleArchive.globalGates.immutableArchives.localRowsAwaitingArchive = 11;
  staleArchive.globalGates.immutableArchives.currentWildfireVerifiedObjects = 0;
  assert.throws(() => validatePhase1CurrentStateCompletionAudit(staleArchive, ...args.slice(1)));

  const staleReplies = structuredClone(args[0]);
  staleReplies.globalGates.outreach.repliesRecorded = 0;
  staleReplies.globalGates.outreach.accessBlockedRowsWithSubstantiveReply = 0;
  assert.throws(() => validatePhase1CurrentStateCompletionAudit(staleReplies, ...args.slice(1)));
});

test("every blocked row maps to its real outreach or owner-review request", () => {
  const missing = structuredClone(args[0]);
  missing.rows.find(({ id }) => id === "modern-treaties").outreachMessageIds = [];
  assert.throws(() => validatePhase1CurrentStateCompletionAudit(missing, ...args.slice(1)));
  const wrong = structuredClone(args[0]);
  wrong.rows.find(({ id }) => id === "cwfis-historical").outreachRequestIds = ["elections-alberta-boundary-permission"];
  assert.throws(() => validatePhase1CurrentStateCompletionAudit(wrong, ...args.slice(1)));
});
