import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase1BcOntarioRowAudit } from "../scripts/check-phase1-bc-ontario-row-audit.mjs";

const read = (file) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
const audit = read("data/phase1-bc-ontario-row-audit.json");
const ledger = read("data/phase1-production-source-ledger.json");
const context = {
  access: read("data/phase1-access-blocker-resolution.json"),
  replies: read("data/phase1-outreach-reply-audit.json"),
  raw: read("data/current-wildfire-raw-archive-evidence.json"),
  derived: read("data/current-wildfire-derived-archive-evidence.json"),
  owner: read("data/current-wildfire-owner-admission.json"),
  liveGuard: read("data/current-wildfire-derived-live-recovery-guard-2026-08-20.json"),
  becCustom: read("data/phase1-bec-custom-download-route-audit.json"),
  becPublic: read("data/phase1-bec-public-alternative-exhaustion.json"),
  copyright: read("data/phase1-bc-copyright-permission-form-package.json"),
  friRoute: read("data/phase1-ontario-fri-term2-route-exhaustion.json"),
  partial: read("data/phase1-partial-source-route-exhaustion.json")
};

test("historical BC/ON row audit preserves every scoped snapshot row while validating the later federal admission separately", () => {
  assert.equal(validatePhase1BcOntarioRowAudit(audit, ledger, context), audit);
  assert.equal(audit.rows.length, 11);
  assert.equal(audit.baseline.rawEvidenceNumerator, 14.25);
  assert.equal(audit.baseline.formalEvidenceTrackingPercentage, 38.7903226);
  assert.equal(audit.baseline.bcOntarioRawCreditDelta, 0);
  assert.equal(audit.reconciliation.scoreChange, 0);
});

test("BC/ON audit rejects state or raw-credit promotion", () => {
  const promoted = structuredClone(audit);
  promoted.rows.find(({ id }) => id === "bc-vri").evidenceState = "local-verified-profiled";
  assert.throws(() => validatePhase1BcOntarioRowAudit(promoted, ledger, context), /Expected values|evidenceState|fixed raw-evidence credit|drifted/i);

  const inflated = structuredClone(audit);
  inflated.rows.find(({ id }) => id === "provincial-electoral-boundaries").rawCredit = 0.75;
  assert.throws(() => validatePhase1BcOntarioRowAudit(inflated, ledger, context), /Expected values|rawCredit|fixed raw-evidence credit|drifted/i);
});

test("BC/ON audit rejects invented permission, archive, reply, or production claims", () => {
  const permission = structuredClone(audit);
  permission.rows.find(({ id }) => id === "bc-old-growth-bec").claims.permissionGranted = true;
  assert.throws(() => validatePhase1BcOntarioRowAudit(permission, ledger, context), /Expected values|fail-closed|permissionGranted/i);

  const archive = structuredClone(audit);
  archive.groups[0].currentWildfireArchiveGate.derivedObjectsVerified = true;
  assert.throws(() => validatePhase1BcOntarioRowAudit(archive, ledger, context), /Expected values|derivedObjectsVerified|deepStrictEqual/i);

  const reply = structuredClone(audit);
  reply.rows.find(({ id }) => id === "on-fri").replyRecordIds = [];
  assert.throws(() => validatePhase1BcOntarioRowAudit(reply, ledger, context), /reply mapping drifted/i);
});

test("BC/ON audit requires every canonical evidence reference to remain present", () => {
  const missing = structuredClone(audit);
  missing.rows.find(({ id }) => id === "bc-harvesting-authorities").evidenceRefs = [];
  assert.throws(() => validatePhase1BcOntarioRowAudit(missing, ledger, context), /Expected values|must cite evidence records|drifted/i);
});
