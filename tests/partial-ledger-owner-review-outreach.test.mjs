import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePartialLedgerOwnerReviewOutreach } from "../scripts/check-partial-ledger-owner-review-outreach.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const pkg = read("../data/partial-ledger-owner-review-outreach-package.json");
const audit = read("../data/partial-ledger-evidence-audit.json");
const existing = read("../data/phase1-permission-outreach-package.json");

test("three exact owner-review drafts are complete and do not change credit", () => {
  assert.equal(validatePartialLedgerOwnerReviewOutreach(pkg, audit, existing), pkg);
});

test("sent, accepted, permitted or acquired claims fail closed", () => {
  for (const claim of ["ownerApproved", "agreementAccepted", "messageSent", "permissionReceived", "artifactAcquired", "rawEvidenceCreditChanged"]) {
    const changed = structuredClone(pkg);
    changed.claims[claim] = true;
    assert.throws(() => validatePartialLedgerOwnerReviewOutreach(changed, audit, existing));
  }
});

test("duplicate outreach fails closed", () => {
  const changed = structuredClone(pkg);
  changed.requests[0].id = existing.messages[0].id;
  assert.throws(() => validatePartialLedgerOwnerReviewOutreach(changed, audit, existing));
});

test("wrong contact route or incomplete rights request fails closed", () => {
  const wrongRoute = structuredClone(pkg);
  wrongRoute.requests[1].delivery.recipient = "unverified@example.invalid";
  assert.throws(() => validatePartialLedgerOwnerReviewOutreach(wrongRoute, audit, existing));
  const incomplete = structuredClone(pkg);
  incomplete.requests[2].requestTerms = incomplete.requests[2].requestTerms.filter((term) => !term.includes("adaptation"));
  assert.throws(() => validatePartialLedgerOwnerReviewOutreach(incomplete, audit, existing));
});

test("historical snapshot completion or new raw credit fails closed", () => {
  const changed = structuredClone(audit);
  changed.rows.find(({ id }) => id === "cwfis-historical").currentEvidenceState = "local-verified-profiled";
  assert.throws(() => validatePartialLedgerOwnerReviewOutreach(pkg, changed, existing));
});
