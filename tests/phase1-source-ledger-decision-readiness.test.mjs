import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase1SourceLedgerDecisionReadiness } from "../scripts/check-phase1-source-ledger-decision-readiness.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const audit = read("../data/phase1-source-ledger-decision-readiness.json");
const ledger = read("../data/phase1-production-source-ledger.json");
const decisions = read("../data/phase1-remote-source-admission-decisions.json");

test("decision-readiness matrix reconciles exactly four admitted rows", () => {
  assert.equal(validatePhase1SourceLedgerDecisionReadiness(audit, ledger, decisions), audit);
  assert.deepEqual(audit.counts, { "owner-decision-recorded": 7, "immutable-archive-then-owner-decision": 5, "owner-scope-decision-after-archive": 0, "owner-scope-decision-recorded-awaiting-archive": 0, "owner-scope-decision-ready": 0, "production-admitted": 4, "external-evidence-blocked": 15 });
  const harvest = audit.entries.find(({ id }) => id === "ntems-forest-harvest");
  assert.equal(harvest.readiness, "owner-decision-recorded");
  assert.equal(ledger.entries.find(({ id }) => id === "ntems-forest-harvest").proof.immutableArchive, true);
  assert.equal(audit.reconciliation.productionProofChangedRows, 4);
  assert.equal(audit.reconciliation.productionEligibleChangedRows, 4);
  assert.equal(audit.reconciliation.transformationAuthorizedRows, 4);
  assert.equal(audit.reconciliation.ingestionAuthorizedRows, 4);
  assert.equal(audit.reconciliation.releaseAuthorizedRows, 4);
});

test("matrix fails closed for an inferred decision, a missing scope, or duplicate Elections archival work", () => {
  const inferred = structuredClone(audit); inferred.entries.find((entry) => entry.id === "ntems-forest-harvest").readiness = "owner-scope-decision-ready";
  inferred.counts["owner-scope-decision-ready"] = 1; inferred.counts["owner-decision-recorded"] = 6;
  assert.throws(() => validatePhase1SourceLedgerDecisionReadiness(inferred, ledger, decisions));
  const scope = structuredClone(audit); delete scope.entries.find((entry) => entry.id === "bc-wildfire").scope;
  assert.throws(() => validatePhase1SourceLedgerDecisionReadiness(scope, ledger, decisions));
  const duplicate = structuredClone(audit); duplicate.minimalOwnerDecisionBundles.find((bundle) => bundle.id === "elections-canada-2025-shared-artifact").rows = ["fed-2023-ridings"];
  assert.throws(() => validatePhase1SourceLedgerDecisionReadiness(duplicate, ledger, decisions));
});
