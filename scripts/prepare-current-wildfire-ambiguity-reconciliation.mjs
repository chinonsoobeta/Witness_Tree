import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadCheckpoint } from "./check-current-wildfire-promotion-checkpoint.mjs";

const APPROVAL = new URL("../data/current-wildfire-ambiguity-reconciliation-owner-approval.json", import.meta.url);

export function prepareAmbiguityReconciliation(checkpointPath, approval = JSON.parse(readFileSync(APPROVAL, "utf8"))) {
  assert.deepEqual(approval, {
    schemaVersion: "witness-tree/current-wildfire-ambiguity-reconciliation-owner-approval/1",
    status: "pending-owner-approval",
    scope: "read-only inspection of an ambiguous current-wildfire checkpoint; no retry, mutation, replacement, or deletion",
    approvedAt: null,
    ownerStatement: null,
    claims: { readOnlyRecoveryAuthorized: false, storageMutationAuthorized: false, retryAuthorized: false }
  }, "ambiguity reconciliation approval is not the exact pending owner record");
  const checkpoint = loadCheckpoint(checkpointPath);
  const ambiguousObjects = checkpoint.objects.filter(({ status }) => status === "ambiguous-response").map(({ artifactId, kind, ambiguity }) => ({ artifactId, kind, phase: ambiguity.phase }));
  assert.ok(ambiguousObjects.length > 0, "checkpoint has no ambiguous boundary");
  return {
    schemaVersion: "witness-tree/current-wildfire-ambiguity-reconciliation-preparation/1",
    status: "blocked-owner-approval-required",
    ambiguousObjects,
    permittedCommands: [],
    claims: { externalCallsPerformed: false, storageMutationPerformed: false, retryAuthorized: false, replacementAuthorized: false }
  };
}

if (process.argv[1]?.endsWith("prepare-current-wildfire-ambiguity-reconciliation.mjs")) {
  assert.equal(process.argv.length, 3, "Usage: prepare-current-wildfire-ambiguity-reconciliation.mjs CHECKPOINT");
  console.log(JSON.stringify(prepareAmbiguityReconciliation(process.argv[2]), null, 2));
}
