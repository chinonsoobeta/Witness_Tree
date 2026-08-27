import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validate as validateFederalAdmission } from "./check-phase1-federal-electoral-production-admission.mjs";

const READINESS = new Set(["owner-decision-recorded", "immutable-archive-then-owner-decision", "owner-scope-decision-after-archive", "owner-scope-decision-recorded-awaiting-archive", "owner-scope-decision-ready", "external-evidence-blocked"]);
const OWNER_SCOPE_EVIDENCE_BY_ROW = new Map([
  ["cwfis-current", "data/current-wildfire-owner-admission.json"],
  ["cwfis-historical", "data/phase1-nbac-owner-authorization-2026-08-27.json"],
  ["bc-wildfire", "data/current-wildfire-owner-admission.json"],
  ["ab-wildfire", "data/current-wildfire-owner-admission.json"],
  ["on-fire-disturbance", "data/current-wildfire-owner-admission.json"],
]);
const FEDERAL_IDS = new Set(["fed-2023-ridings", "elections-canada-45th-files"]);
const HISTORICAL_FEDERAL_STATE = {
  evidenceState: "local-verified-profiled",
  rawCredit: 0.75,
  immutableArchive: false,
  productionAdmission: false,
  productionEligible: false,
};
const LATER_FEDERAL_STATE = {
  evidenceState: "production-admitted",
  rawCredit: 1,
  immutableArchive: true,
  productionAdmission: true,
  productionEligible: true,
};

function ledgerState(entry) {
  return {
    evidenceState: entry.evidenceState,
    rawCredit: entry.rawCredit,
    immutableArchive: entry.proof?.immutableArchive,
    productionAdmission: entry.proof?.productionAdmission,
    productionEligible: entry.productionEligible,
  };
}

function projectHistoricalFederalEntry(entry) {
  const current = ledgerState(entry);
  if (JSON.stringify(current) === JSON.stringify(HISTORICAL_FEDERAL_STATE)) return { entry, laterAdmission: false };
  assert.deepEqual(current, LATER_FEDERAL_STATE, `${entry.id} must be either the historical readiness state or the exact later federal admission state.`);
  return {
    entry: {
      ...entry,
      evidenceState: HISTORICAL_FEDERAL_STATE.evidenceState,
      rawCredit: HISTORICAL_FEDERAL_STATE.rawCredit,
      proof: { ...entry.proof, immutableArchive: HISTORICAL_FEDERAL_STATE.immutableArchive, productionAdmission: HISTORICAL_FEDERAL_STATE.productionAdmission },
      productionEligible: HISTORICAL_FEDERAL_STATE.productionEligible,
    },
    laterAdmission: true,
  };
}

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
  const laterFederalRows = new Set();
  for (const entry of audit.entries) {
    assert.ok(READINESS.has(entry.readiness));
    const canonical = ledger.entries.find((candidate) => candidate.id === entry.id);
    assert.ok(canonical);
    const projected = FEDERAL_IDS.has(entry.id) ? projectHistoricalFederalEntry(canonical) : { entry: canonical, laterAdmission: false };
    const row = projected.entry;
    if (projected.laterAdmission) laterFederalRows.add(entry.id);
    assert.equal(row.productionEligible, false);
    assert.equal(row.proof.productionAdmission, false);
    if (entry.readiness === "owner-decision-recorded") {
      assert.equal(row.evidenceState, "remote-verified-archived-profiled");
      assert.ok(decisions.decisions.some((decision) => decision.id === entry.id && decision.ownerAdmission === "approved-source-ledger-only"));
    }
    if (entry.readiness === "immutable-archive-then-owner-decision") {
      assert.ok(["local-verified-profiled", "remote-verified-archived-profiled"].includes(row.evidenceState));
      assert.equal(row.proof.immutableArchive, row.evidenceState === "remote-verified-archived-profiled");
      assert.equal(row.proof.productionAdmission, false);
    }
    if (entry.readiness === "owner-scope-decision-after-archive") {
      assert.equal(row.evidenceState, "local-verified-profiled");
      assert.equal(row.proof.immutableArchive, false);
      assert.equal(row.proof.productionAdmission, false);
    }
    if (entry.readiness === "owner-scope-decision-recorded-awaiting-archive") {
      assert.ok(["local-verified-profiled", "remote-verified-archived-profiled"].includes(row.evidenceState));
      assert.equal(row.proof.immutableArchive, row.evidenceState === "remote-verified-archived-profiled");
      assert.equal(row.proof.productionAdmission, false);
      const requiredEvidence = OWNER_SCOPE_EVIDENCE_BY_ROW.get(row.id);
      assert.ok(requiredEvidence, `${row.id} has no exact owner-scope evidence mapping`);
      assert.ok(row.evidenceRefs.includes(requiredEvidence), `${row.id} lacks its exact owner-scope evidence`);
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
  if (laterFederalRows.size > 0) {
    assert.deepEqual([...laterFederalRows].sort(), [...FEDERAL_IDS].sort(), "The shared federal admission must cover both ledger rows.");
    validateFederalAdmission(JSON.parse(readFileSync(new URL("../data/phase1-federal-electoral-production-admission.json", import.meta.url), "utf8")));
  }
  assert.deepEqual(audit.nonProduction, { productionProofChanged: false, productionEligibleChanged: false, transformationAuthorized: false, ingestionAuthorized: false, releaseAuthorized: false, activationBlockedOnImmutableReadbacks: true });
  const nationalIds = ["ntems-forest-harvest", "ntems-canopy-height"];
  for (const id of nationalIds) {
    const entry = audit.entries.find((candidate) => candidate.id === id);
    assert.equal(entry.readiness, "owner-decision-recorded");
    assert.match(entry.scope, /source-ledger evidence only.*transformation admission, ingestion, release and production remain separate/i);
  }
  const plvi = audit.entries.find((candidate) => candidate.id === "ab-primary-land-vegetation");
  assert.equal(plvi.readiness, "owner-decision-recorded");
  assert.match(plvi.scope, /179,087-feature closed-join derived artifact.*12 bounded repairs.*POLYGON_ID 41405.*scope-bound validation and ingestion preparation only/i);
  const nbac = audit.entries.find((candidate) => candidate.id === "cwfis-historical");
  assert.equal(nbac.readiness, "owner-scope-decision-recorded-awaiting-archive");
  assert.match(nbac.scope, /OGL Canada.*NFDB and NBAC.*49 invalid NBAC geometries.*quarantined/i);
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
