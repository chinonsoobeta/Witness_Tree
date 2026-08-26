import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase1SourceLedgerDecisionReadiness } from "../scripts/check-phase1-source-ledger-decision-readiness.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const audit = read("../data/phase1-source-ledger-decision-readiness.json");
const ledger = read("../data/phase1-production-source-ledger.json");
const decisions = read("../data/phase1-remote-source-admission-decisions.json");

test("decision-readiness matrix reconciles all rows and stays strictly non-admitting", () => {
  assert.equal(validatePhase1SourceLedgerDecisionReadiness(audit, ledger, decisions), audit);
  assert.deepEqual(audit.counts, { "owner-decision-recorded": 9, "immutable-archive-then-owner-decision": 3, "owner-scope-decision-after-archive": 0, "owner-scope-decision-recorded-awaiting-archive": 4, "owner-scope-decision-ready": 0, "external-evidence-blocked": 15 });
  const harvest = audit.entries.find(({ id }) => id === "ntems-forest-harvest");
  assert.equal(harvest.readiness, "owner-decision-recorded");
  assert.equal(ledger.entries.find(({ id }) => id === "ntems-forest-harvest").proof.immutableArchive, true);
  assert.equal(audit.nonProduction.productionProofChanged, false);
  assert.equal(audit.nonProduction.productionEligibleChanged, false);
  assert.equal(audit.nonProduction.transformationAuthorized, false);
  assert.equal(audit.nonProduction.ingestionAuthorized, false);
  assert.equal(audit.nonProduction.releaseAuthorized, false);
});

test("matrix fails closed for an inferred decision, a missing scope, or duplicate Elections archival work", () => {
  const inferred = structuredClone(audit); inferred.entries.find((entry) => entry.id === "ntems-forest-harvest").readiness = "owner-scope-decision-ready";
  inferred.counts["owner-scope-decision-ready"] = 1; inferred.counts["owner-decision-recorded"] = 8;
  assert.throws(() => validatePhase1SourceLedgerDecisionReadiness(inferred, ledger, decisions));
  const scope = structuredClone(audit); delete scope.entries.find((entry) => entry.id === "bc-wildfire").scope;
  assert.throws(() => validatePhase1SourceLedgerDecisionReadiness(scope, ledger, decisions));
  const duplicate = structuredClone(audit); duplicate.minimalOwnerDecisionBundles.find((bundle) => bundle.id === "elections-canada-2025-shared-artifact").rows = ["fed-2023-ridings"];
  assert.throws(() => validatePhase1SourceLedgerDecisionReadiness(duplicate, ledger, decisions));
});

test("the readiness matrix validates its historical federal rows after later admission", () => {
  assert.equal(validatePhase1SourceLedgerDecisionReadiness(audit, ledger, decisions), audit);
  for (const id of ["fed-2023-ridings", "elections-canada-45th-files"]) {
    const entry = audit.entries.find((candidate) => candidate.id === id);
    assert.equal(entry.readiness, "immutable-archive-then-owner-decision");
    const current = ledger.entries.find((candidate) => candidate.id === id);
    assert.equal(current.evidenceState, "production-admitted");
    assert.equal(current.productionEligible, true);
  }
});

test("the readiness matrix rejects a corrupted later federal admission", () => {
  const corrupted = structuredClone(ledger);
  corrupted.entries.find(({ id }) => id === "elections-canada-45th-files").proof.productionAdmission = false;
  assert.throws(() => validatePhase1SourceLedgerDecisionReadiness(audit, corrupted, decisions), /exact later federal admission state|later federal admission/i);
});
