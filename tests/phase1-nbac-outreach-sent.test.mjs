import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase1NbacOutreachSent } from "../scripts/check-phase1-nbac-outreach-sent.mjs";

const record = JSON.parse(readFileSync(new URL("../data/phase1-nbac-outreach-sent-2026-08-27.json", import.meta.url), "utf8"));
const clone = () => structuredClone(record);

test("NBAC sent evidence binds the exact approved bilingual draft without provider identifiers", () => {
  assert.equal(validatePhase1NbacOutreachSent(record), record);
});

test("NBAC sent evidence rejects a changed recipient, subject, or body", () => {
  for (const mutate of [
    (candidate) => { candidate.delivery.recipient = "other@example.com"; },
    (candidate) => { candidate.delivery.subject = "Changed"; },
    (candidate) => { candidate.sourceDraft.sentBodySha256 = "0".repeat(64); },
  ]) {
    const candidate = clone();
    mutate(candidate);
    assert.throws(() => validatePhase1NbacOutreachSent(candidate));
  }
});

test("a send never proves agreement, consent, acquisition, credit, or admission", () => {
  for (const claim of Object.keys(record.claims)) {
    const candidate = clone();
    candidate.claims[claim] = true;
    assert.throws(() => validatePhase1NbacOutreachSent(candidate));
  }
});
