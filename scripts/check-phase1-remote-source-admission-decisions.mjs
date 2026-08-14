import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const APPROVED = "approved-source-ledger-only";

export function validateRemoteAdmissionDecisions(decisions, ledger) {
  assert.equal(decisions.schemaVersion, 1);
  assert.equal(decisions.status, "owner-decisions-recorded");
  assert.match(decisions.notice, /neither transformation nor ingestion, release, runtime production eligibility, or any unlisted source/i);
  const remote = ledger.entries.filter((entry) => entry.evidenceState === "remote-verified-archived-profiled");
  assert.equal(decisions.decisions.length, 4);
  for (const decision of decisions.decisions) {
    const row = remote.find((entry) => entry.id === decision.id);
    assert.ok(row);
    assert.ok(Object.entries(row.proof).filter(([key]) => key !== "productionAdmission").every(([, value]) => value));
    assert.equal(row.proof.productionAdmission, false);
    assert.equal(row.productionEligible, false);
    assert.equal(decision.sourceEvidenceComplete, true);
    assert.equal(decision.profileIssueResolved, true);
    assert.equal(decision.ownerAdmission, APPROVED);
    assert.match(decision.scope, /does not authorize transformation, ingestion, release, runtime production eligibility, or any other source/i);
  }
  assert.ok(remote.some((entry) => entry.id === "ab-primary-land-vegetation" && entry.proof.immutableArchive && !entry.proof.productionAdmission), "Immutable evidence alone must not be mistaken for an owner decision.");
  const crown = decisions.decisions.find((decision) => decision.id === "ab-avi-crown");
  assert.equal(crown.evidenceRef, "data/alberta-avi-crown-quarantine-decision.json");
  assert.match(crown.scope, /AVI_PostInventoryHarvestIndex FID 1.*zero AVI_Crown observations.*no Crown denominator impact/i);
  return decisions;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const read = (file) => JSON.parse(readFileSync(new URL(`../data/${file}`, import.meta.url)));
  const decisions = validateRemoteAdmissionDecisions(read("phase1-remote-source-admission-decisions.json"), read("phase1-production-source-ledger.json"));
  console.log(`Remote source-ledger decisions recorded for ${decisions.decisions.length}/31 named rows; all remain non-production.`);
}
