import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => JSON.parse(readFileSync(new URL(`../data/${file}`, import.meta.url), "utf8"));
const RETENTION = { mode: "COMPLIANCE", retainUntil: "2033-08-12T00:00:00Z" };
const FEDERAL = { id: "federal-electoral-archive", rows: ["fed-2023-ridings", "elections-canada-45th-files"], preflight: "zsh scripts/run-phase1-approved-promotion.sh --preflight", ownerCommand: "zsh scripts/run-phase1-approved-promotion.sh --run-federal" };
const QC = { id: "quebec-current-original-archive", rows: ["qc-current-ecoforest", "qc-original-current-inventory"], preflight: "zsh scripts/run-qc-approved-multipart-promotion.sh --preflight", ownerCommand: "zsh scripts/run-qc-approved-multipart-promotion.sh --run" };
const FOURTH = { id: "quebec-fourth-inventory-archive", rows: ["qc-fourth-inventory"], preflight: "node scripts/qc-fourth-inventory-immutable-promotion.mjs --preflight --data-root /Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree-data", ownerCommandTemplate: "node scripts/qc-fourth-inventory-immutable-promotion.mjs --execute --approve-exact-artifact-set --approve-iam-policy --approve-compliance-retention --approve-mfa-session --retention-until 2033-08-12T00:00:00Z --session-ready --data-root <controlled-absolute-path> --state-dir <controlled-absolute-path> --sidecar-dir <controlled-absolute-path>" };

export function validatePhase1ArchiveOwnerCommandReconciliation(record = read("phase1-archive-owner-command-reconciliation-2026-08-20.json"), approvals = read("phase1-phase3-owner-approvals-2026-08-21.json")) {
  assert.equal(record.schemaVersion, "phase1/archive-owner-command-reconciliation/1");
  assert.equal(record.status, "read-only-reconciled-blocked");
  assert.deepEqual(record.mutationsPerformed, []);
  assert.equal(record.versionIdsRecorded, false);
  assert.match(record.sourceOfTruth, /Historical 2026-08-20.*later owner-approval record.*not current live proof/i);
  assert.ok(record.national.historicalObservationsAtCapture);
  assert.match(record.quebecCurrentOriginal.historicalObservationsAtCapture, /not a current readback/i);
  assert.match(record.quebecFourth.historicalObservationsAtCapture, /not a current readback/i);
  const exact = approvals.phase1.archiveApprovals;
  assert.equal(exact.length, 4);
  for (const expected of [FEDERAL, QC, FOURTH]) {
    const approval = exact.find(({ id }) => id === expected.id);
    assert.ok(approval); assert.deepEqual(approval.rows, expected.rows); assert.deepEqual(approval.retention, RETENTION); assert.equal(approval.preflight, expected.preflight);
    assert.equal(approval.ownerCommand ?? approval.ownerCommandTemplate, expected.ownerCommand ?? expected.ownerCommandTemplate);
  }
  assert.equal(record.national.localPreflightCommand, FEDERAL.preflight);
  assert.equal(record.national.ownerRunCommand, FEDERAL.ownerCommand);
  assert.match(record.national.runnerConflict, /generic --run.*prohibited.*--run-federal/i);
  assert.equal(record.quebecCurrentOriginal.localPreflightCommand, QC.preflight);
  assert.equal(record.quebecCurrentOriginal.ownerRunCommand, QC.ownerCommand);
  assert.equal(record.quebecFourth.dryRunCommand, FOURTH.preflight);
  assert.equal(record.quebecFourth.executeTemplate, FOURTH.ownerCommandTemplate);
  assert.deepEqual(record.quebecFourth.requiredApprovals, {
    exactArtifactSet: true,
    irreversibleComplianceRetention: true,
    leastPrivilegeIamPolicy: true,
    mfaSessionExecution: true,
  });
  assert.deepEqual(approvals.phase1.archiveControlExercise, {
    status: "approved-owner-local-execution-pending",
    preflight: "scripts/run-phase1-archive-owner-exercise.sh --preflight",
    ownerCommand: "scripts/run-phase1-archive-owner-exercise.sh --run",
    requiredEvidence: ["legal hold ON and OFF readbacks", "unchanged COMPLIANCE retention", "denied exact-version deletion", "authorized recovery replica readback"],
    executionBoundary: "MFA/TOTP and live archive mutations are not performed by this record."
  });
  assert.equal(record.archiveControl.preflight, approvals.phase1.archiveControlExercise.preflight);
  assert.equal(record.archiveControl.ownerCommand, approvals.phase1.archiveControlExercise.ownerCommand);
  assert.equal(record.archiveControl.completionEvidence, false);
  assert.match(record.globalBlocker, /execution and exact readback evidence remain absent/i);
  return record;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  validatePhase1ArchiveOwnerCommandReconciliation();
  console.log("Historical archive owner-command reconciliation passed; current completion state is determined by the canonical promotion evidence records.");
}
