import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = () => JSON.parse(readFileSync(new URL("../data/phase1-archive-owner-command-reconciliation-2026-08-20.json", import.meta.url), "utf8"));

export function validatePhase1ArchiveOwnerCommandReconciliation(record = read()) {
  assert.equal(record.schemaVersion, "phase1/archive-owner-command-reconciliation/1");
  assert.equal(record.status, "read-only-reconciled-blocked");
  assert.deepEqual(record.mutationsPerformed, []);
  assert.equal(record.versionIdsRecorded, false);
  assert.match(record.national.ownerRunCommand, /BLOCKED/);
  assert.match(record.national.runnerConflict, /already-existing harvest key/);
  assert.match(record.national.localPreflightCommand, /--preflight$/);
  assert.match(record.quebecCurrentOriginal.ownerRunCommand, /BLOCKED/);
  assert.match(record.quebecCurrentOriginal.localPreflightCommand, /--preflight$/);
  assert.match(record.quebecFourth.dryRunCommand, /qc-fourth-inventory-immutable-promotion\.mjs$/);
  assert.match(record.quebecFourth.executeTemplate, /<owner-supplied>/);
  assert.deepEqual(record.quebecFourth.requiredApprovals, {
    exactArtifactSet: false,
    irreversibleComplianceRetention: false,
    leastPrivilegeIamPolicy: false,
    mfaSessionExecution: false,
  });
  assert.match(record.globalBlocker, /does not add permissions, apply retention, upload, delete/i);
  return record;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  validatePhase1ArchiveOwnerCommandReconciliation();
  console.log("Archive owner-command reconciliation passed: national and Quebec runs remain blocked behind exact preconditions.");
}
