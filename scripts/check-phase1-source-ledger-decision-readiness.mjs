import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const READINESS = new Set(["owner-decision-recorded", "immutable-archive-then-owner-decision", "owner-scope-decision-after-archive", "owner-scope-decision-recorded-awaiting-archive", "owner-scope-decision-ready", "external-evidence-blocked"]);

export function validatePhase1SourceLedgerDecisionReadiness(audit, ledger, decisions) {
  assert.equal(audit.schemaVersion, 1);
  assert.equal(audit.status, "non-admitting-audit");
  assert.match(audit.notice, /neither changes a ledger proof nor grants archival admission, transformation, ingestion, release, production admission, or production eligibility/i);
  assert.deepEqual(audit.contract, ["licence", "attribution", "retrievalVersion", "checksum", "rawArchiveRefetch", "profile", "immutableArchive", "ownerSourceLedgerDecision"]);
  assert.equal(audit.entries.length, ledger.entries.length);
  const ledgerIds = new Set(ledger.entries.map(({ id }) => id));
  assert.deepEqual(new Set(audit.entries.map(({ id }) => id)), ledgerIds);
  const counts = Object.groupBy(audit.entries, ({ readiness }) => readiness);
  for (const [readiness, expected] of Object.entries(audit.counts)) assert.equal(counts[readiness]?.length ?? 0, expected, `Wrong ${readiness} count.`);
  assert.equal(Object.values(audit.counts).reduce((sum, count) => sum + count, 0), 31);
  for (const entry of audit.entries) {
    assert.ok(READINESS.has(entry.readiness));
    const row = ledger.entries.find((candidate) => candidate.id === entry.id);
    assert.ok(row);
    assert.equal(row.productionEligible, false);
    assert.equal(row.proof.productionAdmission, false);
    if (entry.readiness === "owner-decision-recorded") {
      assert.equal(row.evidenceState, "remote-verified-archived-profiled");
      assert.ok(decisions.decisions.some((decision) => decision.id === entry.id && decision.ownerAdmission === "approved-source-ledger-only"));
    }
    if (entry.readiness === "immutable-archive-then-owner-decision" || entry.readiness === "owner-scope-decision-after-archive") {
      assert.equal(row.evidenceState, "local-verified-profiled");
      assert.equal(row.proof.immutableArchive, false);
      assert.equal(row.proof.productionAdmission, false);
    }
    if (entry.readiness === "owner-scope-decision-recorded-awaiting-archive") {
      assert.equal(row.evidenceState, "local-verified-profiled");
      assert.equal(row.proof.immutableArchive, false);
      assert.equal(row.proof.productionAdmission, false);
      assert.ok(row.evidenceRefs.includes("data/current-wildfire-owner-admission.json"));
    }
    if (entry.readiness === "owner-scope-decision-after-archive" || entry.readiness === "owner-scope-decision-recorded-awaiting-archive" || entry.readiness === "owner-scope-decision-ready") assert.match(entry.scope, /.+/);
    if (entry.readiness === "owner-scope-decision-ready") {
      assert.equal(row.evidenceState, "remote-verified-archived-profiled");
      assert.equal(row.proof.immutableArchive, true);
      assert.equal(row.proof.productionAdmission, false);
      assert.equal(decisions.decisions.some((decision) => decision.id === entry.id), false);
    }
    if (entry.readiness === "external-evidence-blocked") assert.match(entry.blocker, /.+/);
  }
  assert.deepEqual(audit.nonProduction, { productionProofChanged: false, productionEligibleChanged: false, transformationAuthorized: true, ingestionAuthorized: true, releaseAuthorized: true, activationBlockedOnImmutableReadbacks: true });
  const elections = audit.entries.filter((entry) => entry.physicalArtifactGroup === "elections-canada-2025-shp");
  assert.deepEqual(elections.map(({ id }) => id), ["fed-2023-ridings", "elections-canada-45th-files"]);
  const shared = audit.minimalOwnerDecisionBundles.find((bundle) => bundle.id === "elections-canada-2025-shared-artifact");
  assert.deepEqual(shared.rows, elections.map(({ id }) => id));
  return audit;
}

const read = (relativePath) => JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));
if (import.meta.url === `file://${process.argv[1]}`) {
  const audit = validatePhase1SourceLedgerDecisionReadiness(read("../data/phase1-source-ledger-decision-readiness.json"), read("../data/phase1-production-source-ledger.json"), read("../data/phase1-remote-source-admission-decisions.json"));
  console.log(`Phase 1 source-ledger decision readiness is non-admitting: ${audit.entries.length} rows; ${Object.entries(audit.counts).map(([kind, count]) => `${kind}=${count}`).join(", ")}.`);
}
