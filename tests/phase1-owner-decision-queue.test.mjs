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
};

test("consolidates every local/remote Phase 1 row into an owner-decision queue", () => {
  const queue = read("data/phase1-owner-decision-queue.json");
  assert.equal(validatePhase1OwnerDecisionQueue(queue, context), queue);
  assert.equal(queue.queueRows.length, 16);
  assert.deepEqual(queue.queueRows.filter((row) => row.decisionBundle === "current-wildfire-archive-gate").map((row) => row.id), [
    "cwfis-current",
    "bc-wildfire",
    "ab-wildfire",
    "on-fire-disturbance",
  ]);
  assert.deepEqual(queue.excludedRows["partial-component"], ["cwfis-historical", "provincial-electoral-boundaries"]);
});

test("rejects fabricated approvals, production claims, or omission of a required row", () => {
  const queue = read("data/phase1-owner-decision-queue.json");

  const approval = structuredClone(queue);
  approval.queueRows.find((row) => row.id === "ab-primary-land-vegetation").ownerDecisionStatus.scope = "approved";
  assert.throws(() => validatePhase1OwnerDecisionQueue(approval, context), /unqualified approval|pending/);

  const production = structuredClone(queue);
  production.claims.productionEligible = true;
  assert.throws(() => validatePhase1OwnerDecisionQueue(production, context), /deep-equal|false/);

  const omission = structuredClone(queue);
  omission.queueRows = omission.queueRows.filter((row) => row.id !== "ntems-canopy-height");
  assert.throws(() => validatePhase1OwnerDecisionQueue(omission, context), /canonical order|ntems-canopy-height/);
});

test("keeps the dependency order and current-wildfire archive condition fail-closed", () => {
  const queue = read("data/phase1-owner-decision-queue.json");

  const orderDrift = structuredClone(queue);
  orderDrift.decisionOrder[6].dependsOn = ["queue-production-admission"];
  assert.throws(() => validatePhase1OwnerDecisionQueue(orderDrift, context), /later or missing/);

  const wildfireDrift = structuredClone(queue);
  wildfireDrift.queueRows.find((row) => row.id === "bc-wildfire").archiveGate.verifiedObjects = 6;
  assert.throws(() => validatePhase1OwnerDecisionQueue(wildfireDrift, context), /deep-equal|verifiedObjects/);
});
