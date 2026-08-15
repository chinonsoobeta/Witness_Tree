import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase1CurrentStateCompletionAudit } from "../scripts/check-phase1-current-state-completion-audit.mjs";

const read = (file) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
const args = ["phase1-current-state-completion-audit", "phase1-production-source-ledger", "phase1-source-ledger-decision-readiness", "phase1-immutable-promotion-readiness", "current-wildfire-owner-admission", "phase1-permission-outreach-package", "partial-ledger-owner-review-outreach-package", "phase1-access-blocker-resolution"].map((name) => read(`data/${name}.json`));

test("current-state audit accounts for all 31 rows and remains fail closed", () => {
  const audit = validatePhase1CurrentStateCompletionAudit(...args);
  assert.equal(audit.rows.length, 31);
  assert.equal(audit.ledger.productionEligibleRows, 0);
  assert.equal(audit.globalGates.normalArchiveExercise.complete, false);
});

test("current-state audit rejects invented eligibility, outreach, or archive evidence", () => {
  const eligible = structuredClone(args[0]); eligible.ledger.productionEligibleRows = 1;
  assert.throws(() => validatePhase1CurrentStateCompletionAudit(eligible, ...args.slice(1)));
  const reply = structuredClone(args[0]); reply.globalGates.outreach.repliesRecorded = 1;
  assert.throws(() => validatePhase1CurrentStateCompletionAudit(reply, ...args.slice(1)));
  const archive = structuredClone(args[0]); archive.globalGates.normalArchiveExercise.complete = true;
  assert.throws(() => validatePhase1CurrentStateCompletionAudit(archive, ...args.slice(1)));
});

test("every blocked row maps to its real outreach or owner-review request", () => {
  const missing = structuredClone(args[0]);
  missing.rows.find(({ id }) => id === "modern-treaties").outreachMessageIds = [];
  assert.throws(() => validatePhase1CurrentStateCompletionAudit(missing, ...args.slice(1)));
  const wrong = structuredClone(args[0]);
  wrong.rows.find(({ id }) => id === "cwfis-historical").outreachRequestIds = ["elections-alberta-boundary-permission"];
  assert.throws(() => validatePhase1CurrentStateCompletionAudit(wrong, ...args.slice(1)));
});
