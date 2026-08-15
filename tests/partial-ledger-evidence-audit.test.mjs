import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePartialLedgerEvidenceAudit } from "../scripts/check-partial-ledger-evidence-audit.mjs";

const audit = JSON.parse(readFileSync(new URL("../data/partial-ledger-evidence-audit.json", import.meta.url), "utf8"));
const ledger = JSON.parse(readFileSync(new URL("../data/phase1-production-source-ledger.json", import.meta.url), "utf8"));

test("the only two partial rows retain exact missing components and zero new credit", () => {
  assert.equal(validatePartialLedgerEvidenceAudit(audit, ledger), audit);
  assert.equal(audit.numerator.impact, 0);
});

test("NBAC agreement acceptance or download cannot be fabricated", () => {
  const accepted = structuredClone(audit);
  accepted.claims.acceptedPublisherAgreement = true;
  assert.throws(() => validatePartialLedgerEvidenceAudit(accepted, ledger));
  const downloaded = structuredClone(audit);
  downloaded.rows[0].missing[0].downloaded = true;
  assert.throws(() => validatePartialLedgerEvidenceAudit(downloaded, ledger));
});

test("future Québec geometry and one provincial component cannot complete the aggregate row", () => {
  const future = structuredClone(audit);
  future.rows[1].missing[1].currentEdition = "2026, 127 electoral divisions";
  assert.throws(() => validatePartialLedgerEvidenceAudit(future, ledger));
  const completed = structuredClone(ledger);
  completed.entries.find((row) => row.id === "provincial-electoral-boundaries").evidenceState = "local-verified-profiled";
  assert.throws(() => validatePartialLedgerEvidenceAudit(audit, completed));
});
