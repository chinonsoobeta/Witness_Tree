import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase1OwnerDecisionQueue } from "../scripts/check-phase1-owner-decision-queue.mjs";

const read = (file) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
const context = {
  ledger: read("data/phase1-production-source-ledger.json"),
  remaining: read("data/phase1-remaining-actions-audit.json"),
  remoteDecisions: read("data/phase1-remote-source-admission-decisions.json"),
  wildfire: read("data/current-wildfire-owner-admission.json"),
  approvals: read("data/phase1-phase3-owner-approvals-2026-08-21.json"),
};

test("consolidates every local/remote Phase 1 row into an owner-decision queue", () => {
  const queue = read("data/phase1-owner-decision-queue.json");
  assert.equal(validatePhase1OwnerDecisionQueue(queue, context), queue);
  assert.equal(queue.queueRows.length, 16);
  assert.equal(queue.baseline.asOf, "2026-08-22");
  assert.deepEqual(queue.queueRows.filter((row) => row.decisionBundle === "current-wildfire-archive-gate").map((row) => row.id), [
    "cwfis-current",
    "bc-wildfire",
    "ab-wildfire",
    "on-fire-disturbance",
  ]);
  assert.deepEqual(queue.excludedRows["partial-component"], ["cwfis-historical", "provincial-electoral-boundaries"]);
  assert.equal(queue.queueRows.find(({ id }) => id === "ntems-forest-harvest").ownerDecisionStatus.scope, "recorded-source-ledger-only");
  assert.equal(queue.queueRows.find(({ id }) => id === "ab-primary-land-vegetation").ownerDecisionStatus.scope, "recorded-approved-raw-and-derived-scope-only");
  assert.equal(queue.queueRows.find(({ id }) => id === "ab-primary-land-vegetation").primaryActionId, "plvi-transformation-ingestion-decisions");
});

test("rejects fabricated approvals, production claims, or omission of a required row", () => {
  const queue = read("data/phase1-owner-decision-queue.json");

  const approval = structuredClone(queue);
  approval.queueRows.find((row) => row.id === "ab-primary-land-vegetation").ownerDecisionStatus.scope = "approved";
  assert.throws(() => validatePhase1OwnerDecisionQueue(approval, context), /unqualified approval|pending/);

  const production = structuredClone(queue);
  production.claims.productionEligible = true;
  assert.throws(() => validatePhase1OwnerDecisionQueue(production, context), /deep-equal|false/);

  const baselineDate = structuredClone(queue);
  baselineDate.baseline.asOf = "2026-08-23";
  assert.throws(() => validatePhase1OwnerDecisionQueue(baselineDate, context), /deep-equal/);

  const omission = structuredClone(queue);
  omission.queueRows = omission.queueRows.filter((row) => row.id !== "ntems-canopy-height");
  assert.throws(() => validatePhase1OwnerDecisionQueue(omission, context), /canonical order|ntems-canopy-height/);

  for (const mutate of [
    (row) => { row.primaryActionId = "plvi-owner-scope-decision"; },
    (row) => { row.exactScopeDecision = "Decide the already-approved source scope again."; },
    (row) => { row.exactNextSteps[0] = "Scope approval is pending."; },
  ]) {
    const drift = structuredClone(queue);
    mutate(drift.queueRows.find((row) => row.id === "ab-primary-land-vegetation"));
    assert.throws(() => validatePhase1OwnerDecisionQueue(drift, context));
  }
});

test("keeps the dependency order and current-wildfire archive condition fail-closed", () => {
  const queue = read("data/phase1-owner-decision-queue.json");

  for (const id of ["cwfis-current", "bc-wildfire", "ab-wildfire", "on-fire-disturbance"]) {
    const preflight = queue.queueRows.find((row) => row.id === id).localReadbackPreflight;
    assert.equal(preflight.status, "available-no-write-owner-approval-file-required");
    assert.equal(preflight.remoteCalls, 0);
    assert.equal(preflight.totpPrompted, false);
    assert.equal(preflight.writePerformed, false);
  }

  const orderDrift = structuredClone(queue);
  orderDrift.decisionOrder[6].dependsOn = ["queue-production-admission"];
  assert.throws(() => validatePhase1OwnerDecisionQueue(orderDrift, context), /later or missing/);

  const wildfireDrift = structuredClone(queue);
  wildfireDrift.queueRows.find((row) => row.id === "bc-wildfire").archiveGate.verifiedObjects = 5;
  assert.throws(() => validatePhase1OwnerDecisionQueue(wildfireDrift, context), /deep-equal|verifiedObjects/);
});

test("recorded archive approvals remove duplicate approval requests without implying completion", () => {
  const queue = read("data/phase1-owner-decision-queue.json");
  for (const id of ["fed-2023-ridings", "elections-canada-45th-files", "qc-fourth-inventory"]) {
    const row = queue.queueRows.find((candidate) => candidate.id === id);
    assert.equal(row.ownerDecisionStatus.archivePromotion, "approved-owner-local-execution-evidence-pending");
    assert.equal(row.productionEligible, false);
    assert.equal(row.exactNextSteps.some((step) => /obtain.*approval/i.test(step)), false);
  }
  for (const id of ["qc-current-ecoforest", "qc-original-current-inventory"]) {
    const row = queue.queueRows.find((candidate) => candidate.id === id);
    assert.equal(row.ownerDecisionStatus.archivePromotion, "completed-evidence-integrated");
    assert.equal(row.productionEligible, false);
  }
});

test("queue validation rejects every mutated recorded approval binding", () => {
  const queue = read("data/phase1-owner-decision-queue.json");
  for (const mutate of [
    (copy) => { copy.phase1.archiveApprovals[0].rows = []; },
    (copy) => { copy.phase1.archiveApprovals[0].ownerCommand = "zsh scripts/run-phase1-approved-promotion.sh --run-everything"; },
    (copy) => { copy.phase1.archiveApprovals[1].retention.mode = "GOVERNANCE"; },
    (copy) => { copy.phase1.archiveApprovals[2].retention.retainUntil = "2099-08-12T00:00:00Z"; },
    (copy) => { copy.phase1.archiveApprovals.splice(1, 1); },
    (copy) => { copy.phase1.archiveApprovals[2].id = "plausible-wildfire-archive-proof"; },
    (copy) => { copy.phase1.archiveApprovals[3].rows[0] = "cwfis-current-fabricated"; },
    (copy) => { copy.phase1.archiveApprovals[3].ownerCommand = "zsh scripts/run-current-wildfire-approved-promotion.sh --run"; },
    (copy) => { copy.phase1.archiveApprovals[3].ownerCommandTemplate = "zsh scripts/run-wildfire-derived-readback.sh --readback <approval>"; },
    (copy) => { copy.phase1.archiveApprovals[3].ownerExecutionCommand = "plausible-but-unauthorized-command"; },
    (copy) => { copy.phase1.archiveApprovals[2].ownerCommandTemplate += " --force"; },
    (copy) => { copy.phase1.archiveControlExercise.preflight += " --write"; },
    (copy) => { copy.phase1.archiveControlExercise.ownerCommand = "scripts/run-phase1-archive-owner-exercise.sh --recover-latest"; },
  ]) {
    const mutatedContext = structuredClone(context);
    mutate(mutatedContext.approvals);
    assert.throws(() => validatePhase1OwnerDecisionQueue(queue, mutatedContext));
  }
});

test("the historical queue remains valid when the shared federal rows are later admitted", () => {
  const queue = read("data/phase1-owner-decision-queue.json");
  assert.equal(validatePhase1OwnerDecisionQueue(queue, context), queue);
  for (const id of ["fed-2023-ridings", "elections-canada-45th-files"]) {
    const row = context.ledger.entries.find((entry) => entry.id === id);
    assert.equal(row.evidenceState, "production-admitted");
    assert.equal(row.proof.productionAdmission, true);
    assert.equal(row.productionEligible, true);
    assert.equal(queue.queueRows.find((entry) => entry.id === id).productionEligible, false);
  }
});

test("the historical queue rejects a partial or corrupted later federal admission", () => {
  const queue = read("data/phase1-owner-decision-queue.json");
  const corruptedContext = structuredClone(context);
  corruptedContext.ledger.entries.find(({ id }) => id === "fed-2023-ridings").productionEligible = false;
  assert.throws(() => validatePhase1OwnerDecisionQueue(queue, corruptedContext), /exact later federal admission state|later federal admission/i);
});
