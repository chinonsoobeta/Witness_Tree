import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCHEMA = "witness-tree/phase1-owner-decision-queue/1";
const HEAD = "71925af03fc08b052d12077de2ba4acb9239006b";
const INCLUDED = [
  "ntems-annual-land-cover",
  "ntems-forest-harvest",
  "ntems-canopy-cover",
  "ntems-canopy-height",
  "cwfis-current",
  "bc-wildfire",
  "ab-wildfire",
  "on-fire-disturbance",
  "qc-current-ecoforest",
  "qc-original-current-inventory",
  "qc-fourth-inventory",
  "ab-avi-crown",
  "ab-avi-post-harvest",
  "ab-primary-land-vegetation",
  "fed-2023-ridings",
  "elections-canada-45th-files",
];
const PARTIAL = ["cwfis-historical", "provincial-electoral-boundaries"];
const ACCESS_BLOCKED = [
  "sopfeu",
  "bc-fta-cutblocks",
  "bc-harvesting-authorities",
  "bc-vri",
  "bc-consolidated-cutblocks",
  "bc-old-growth-bec",
  "bc-forest-operations-map",
  "on-fri",
  "on-fri-term-2",
  "indian-reserves",
  "first-nation-reserves",
  "historic-treaties",
  "modern-treaties",
];
const CURRENT_WILDFIRE = ["cwfis-current", "bc-wildfire", "ab-wildfire", "on-fire-disturbance"];
const LOCAL_ARCHIVE = [
  "fed-2023-ridings",
  "elections-canada-45th-files",
  "qc-current-ecoforest",
  "qc-original-current-inventory",
  "qc-fourth-inventory",
];

function sameArray(actual, expected, label) {
  assert.deepEqual(actual, expected, label);
}

function sameSet(actual, expected, label) {
  sameArray([...new Set(actual)].sort(), [...new Set(expected)].sort(), label);
}

function validateActionMembership(actionById, actionId, rowId) {
  const action = actionById.get(actionId);
  assert.ok(action, `Missing existing remaining-action ${actionId}.`);
  assert.ok(action.rows.includes(rowId), `${actionId} must cover ${rowId}.`);
}

function validateQueueRows(queue, context) {
  const ledgerById = new Map(context.ledger.entries.map((entry) => [entry.id, entry]));
  const actionById = new Map(context.remaining.actions.map((action) => [action.id, action]));
  sameArray(queue.queueRows.map((row) => row.id), INCLUDED, "The queue must cover each selected row once in canonical order.");

  for (const row of queue.queueRows) {
    const ledger = ledgerById.get(row.id);
    assert.ok(ledger, `Queue row ${row.id} is not in the canonical ledger.`);
    assert.equal(ledger.evidenceState, row.evidenceState);
    assert.equal(ledger.rawCredit, row.rawCredit);
    assert.equal(ledger.productionEligible, false);
    assert.equal(row.productionEligible, false);
    assert.ok(row.evidenceRefs.length > 0, `${row.id} must retain existing evidence references.`);
    validateActionMembership(actionById, row.primaryActionId, row.id);
    for (const actionId of row.dependentActionIds ?? []) validateActionMembership(actionById, actionId, row.id);
    assert.ok(row.exactNextSteps.length > 0, `${row.id} needs an exact next-step record.`);
    for (const status of Object.values(row.ownerDecisionStatus)) {
      assert.notEqual(status, "approved", `${row.id} cannot use an unqualified approval claim.`);
      assert.notEqual(status, "admitted", `${row.id} cannot claim admission.`);
    }
  }

  for (const id of ["ntems-annual-land-cover", "ntems-canopy-cover", "ab-avi-crown", "ab-avi-post-harvest"]) {
    const row = queue.queueRows.find((candidate) => candidate.id === id);
    assert.equal(row.ownerDecisionStatus.sourceLedger, "recorded-approved-source-ledger-only");
    assert.equal(row.ownerDecisionStatus.transformation, "pending");
    assert.equal(row.ownerDecisionStatus.ingestion, "pending");
    assert.equal(row.ownerDecisionStatus.release, "pending");
    assert.equal(row.ownerDecisionStatus.productionAdmission, "pending");
  }

  for (const id of ["ntems-forest-harvest", "ntems-canopy-height"]) {
    const row = queue.queueRows.find((candidate) => candidate.id === id);
    assert.equal(row.ownerDecisionStatus.sourceLedger, "recorded-approved-source-ledger-only");
    assert.equal(row.ownerDecisionStatus.scope, "recorded-source-ledger-only");
    assert.equal(row.primaryActionId, "national-archived-owner-source-ledger-decisions");
    assert.ok(row.evidenceRefs.includes("data/phase1-remote-source-admission-decisions.json"));
    assert.ok(row.evidenceRefs.includes("data/phase1-scope-bound-validation-preparation.json"));
  }

  const plvi = queue.queueRows.find((row) => row.id === "ab-primary-land-vegetation");
  assert.equal(plvi.ownerDecisionStatus.sourceLedger, "recorded-approved-source-ledger-only");
  assert.equal(plvi.ownerDecisionStatus.scope, "recorded-approved-raw-and-derived-scope-only");
  assert.equal(plvi.ownerDecisionStatus.transformation, "pending-under-approved-scope");
  assert.equal(plvi.ownerDecisionStatus.ingestion, "pending-under-approved-scope");
  assert.match(plvi.exactScopeDecision, /179,087-feature closed-join derived artifact with 12 bounded repairs/);
  assert.match(plvi.exactScopeDecision, /POLYGON_ID 41405/);
  assert.ok(plvi.evidenceRefs.includes("data/phase1-remote-source-admission-decisions.json"));
  assert.ok(plvi.evidenceRefs.includes("data/phase1-scope-bound-validation-preparation.json"));

  for (const id of CURRENT_WILDFIRE) {
    const row = queue.queueRows.find((candidate) => candidate.id === id);
    assert.deepEqual(row.ownerDecisionStatus, {
      sourceLedger: "recorded-conditional",
      scope: "recorded-conditional",
      transformation: "recorded-conditional",
      ingestion: "recorded-conditional",
      release: "recorded-conditional",
      productionAdmission: "recorded-conditional",
    });
    assert.deepEqual(row.archiveGate, {
      requiredObjects: 6,
      verifiedObjects: 4,
      missingDerivedReadbacks: ["bc-wildfire", "on-fire-disturbance"],
      productionEligible: false,
    });
    assert.deepEqual(row.localReadbackPreflight, {
      status: "available-no-write-owner-approval-file-required",
      checker: "scripts/check-wildfire-derived-readback.mjs",
      runner: "scripts/run-wildfire-derived-readback.sh",
      safeCommand: "zsh scripts/run-wildfire-derived-readback.sh --preflight <mode-600-owner-approval-file>",
      remoteCalls: 0,
      totpPrompted: false,
      writePerformed: false,
      productionEligible: false,
    });
  }

  for (const id of LOCAL_ARCHIVE) {
    const row = queue.queueRows.find((candidate) => candidate.id === id);
    assert.equal(row.ownerDecisionStatus.archivePromotion.startsWith("pending"), true);
    assert.equal(row.ownerDecisionStatus.sourceLedger, "pending-after-archive");
    assert.equal(row.ownerDecisionStatus.transformation, "pending-after-archive");
    assert.equal(row.ownerDecisionStatus.ingestion, "pending-after-archive");
  }

  assert.deepEqual(context.remoteDecisions.decisions.map((decision) => decision.id), [
    "ntems-forest-harvest",
    "ntems-annual-land-cover",
    "ntems-canopy-height",
    "ntems-canopy-cover",
    "ab-avi-crown",
    "ab-avi-post-harvest",
    "ab-primary-land-vegetation",
  ]);
  assert.equal(context.wildfire.ownerDecision.scopeApproved, true);
  assert.equal(context.wildfire.ownerDecision.transformationApproved, true);
  assert.equal(context.wildfire.ownerDecision.ingestionApproved, true);
  assert.equal(context.wildfire.ownerDecision.publicReleaseApproved, true);
  assert.equal(context.wildfire.ownerDecision.productionAdmissionApproved, true);
  assert.equal(context.wildfire.archiveGate.requiredObjectCount, 6);
  assert.equal(context.wildfire.archiveGate.verifiedObjectCount, 4);
  assert.equal(context.wildfire.archiveGate.productionEligible, false);
}

function validateOrder(queue) {
  sameArray(queue.decisionOrder.map((step) => step.step), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], "Decision order must be complete and deterministic.");
  const seen = new Set();
  const byId = new Map();
  for (const step of queue.decisionOrder) {
    assert.ok(!byId.has(step.id), `Duplicate decision-order bundle ${step.id}.`);
    byId.set(step.id, step);
    for (const dependency of step.dependsOn) {
      assert.ok(byId.has(dependency), `${step.id} depends on a later or missing step ${dependency}.`);
    }
    for (const id of step.rows) seen.add(id);
  }
  sameSet(seen, INCLUDED, "Decision order must cover every selected row.");
  const final = queue.decisionOrder.at(-1);
  sameSet(final.rows, INCLUDED, "The final production-admission step must cover every selected row.");
  assert.ok(final.dependsOn.includes("archived-remote-downstream"));
  assert.ok(final.dependsOn.includes("wildfire-downstream"));
  assert.ok(final.dependsOn.includes("local-row-downstream"));
  assert.ok(final.dependsOn.includes("alberta-plvi-scope"));
}

export function validatePhase1OwnerDecisionQueue(queue, context) {
  assert.equal(queue.schemaVersion, SCHEMA);
  assert.equal(queue.status, "owner-action-queue-read-only");
  assert.equal(queue.derivedFromHead, HEAD);
  assert.match(queue.notice, /does not create an approval.*AWS.*transform.*production eligible/i);
  assert.match(queue.selectionRule, /local-verified-profiled.*remote-verified-archived-profiled/);
  assert.deepEqual(queue.baseline, {
    productionRows: 31,
    rawEvidenceNumerator: 15.25,
    rawEvidenceDenominator: 31,
    formalEvidenceTrackingPercentage: 39.7580645,
    evidenceStateCounts: {
      "remote-verified-archived-profiled": 11,
      "local-verified-profiled": 5,
      "partial-component": 2,
      "access-blocked": 13,
    },
    immutableArchiveCompleteRows: 11,
    productionAdmissionCompleteRows: 0,
    productionEligibleRows: 0,
    queueRowCount: 16,
  });
  const ledgerIds = context.ledger.entries.map((entry) => entry.id);
  sameSet(queue.excludedRows["partial-component"], PARTIAL, "Partial rows must remain outside the owner pipeline queue.");
  sameSet(queue.excludedRows["access-blocked"], ACCESS_BLOCKED, "Access-blocked rows must remain outside the owner pipeline queue.");
  sameSet([...queue.queueRows.map((row) => row.id), ...queue.excludedRows["partial-component"], ...queue.excludedRows["access-blocked"]], ledgerIds, "Queue plus explicit exclusions must account for all 31 rows.");
  validateQueueRows(queue, context);
  validateOrder(queue);
  assert.deepEqual(queue.claims, {
    ownerDecisionsCreated: false,
    ownerApprovalsGranted: false,
    remoteMutationPerformed: false,
    externalMutationPerformed: false,
    transformed: false,
    ingested: false,
    released: false,
    productionAdmission: false,
    productionEligible: false,
    rawEvidenceDelta: 0,
    formalEvidenceTrackingPercentagePointDelta: 0,
  });
  return queue;
}

export async function checkPhase1OwnerDecisionQueue(root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")) {
  const read = async (file) => JSON.parse(await readFile(path.join(root, file), "utf8"));
  const [queue, ledger, remaining, remoteDecisions, wildfire] = await Promise.all([
    read("data/phase1-owner-decision-queue.json"),
    read("data/phase1-production-source-ledger.json"),
    read("data/phase1-remaining-actions-audit.json"),
    read("data/phase1-remote-source-admission-decisions.json"),
    read("data/current-wildfire-owner-admission.json"),
  ]);
  return validatePhase1OwnerDecisionQueue(queue, { ledger, remaining, remoteDecisions, wildfire });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const queue = await checkPhase1OwnerDecisionQueue();
  console.log(`Phase 1 owner-decision queue passed for ${queue.queueRows.length} local/remote rows; approvals remain read-only and production is fail-closed.`);
}
