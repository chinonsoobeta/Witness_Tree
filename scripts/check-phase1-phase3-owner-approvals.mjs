import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateApproval, validateLocalArtifacts } from "./check-wildfire-derived-readback.mjs";

const read = (file) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
const RETENTION = { mode: "COMPLIANCE", retainUntil: "2033-08-12T00:00:00Z" };
export const EXACT_PHASE1_ARCHIVE_APPROVALS = [
  { id: "federal-electoral-archive", rows: ["fed-2023-ridings", "elections-canada-45th-files"], retention: RETENTION, preflight: "zsh scripts/run-phase1-approved-promotion.sh --preflight", commandKey: "ownerCommand", command: "zsh scripts/run-phase1-approved-promotion.sh --run-federal", allowedKeys: ["bindingRef", "canonicalBlockRef", "executionBoundary", "id", "ownerCommand", "preflight", "retention", "rows", "sourceScopeDecision", "status"] },
  { id: "quebec-current-original-archive", rows: ["qc-current-ecoforest", "qc-original-current-inventory"], retention: RETENTION, preflight: "zsh scripts/run-qc-approved-multipart-promotion.sh --preflight", commandKey: "ownerCommand", command: "zsh scripts/run-qc-approved-multipart-promotion.sh --run", allowedKeys: ["bindingRef", "canonicalBlockRef", "executionBoundary", "iamAudit", "id", "ownerCommand", "preflight", "retention", "rows", "sourceScopeDecision", "status", "verbatimApprovalRef"] },
  { id: "quebec-fourth-inventory-archive", rows: ["qc-fourth-inventory"], retention: RETENTION, preflight: "node scripts/qc-fourth-inventory-immutable-promotion.mjs --preflight --data-root /Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree-data", commandKey: "ownerCommandTemplate", command: "node scripts/qc-fourth-inventory-immutable-promotion.mjs --execute --approve-exact-artifact-set --approve-iam-policy --approve-compliance-retention --approve-mfa-session --retention-until 2033-08-12T00:00:00Z --session-ready --data-root <controlled-absolute-path> --state-dir <controlled-absolute-path> --sidecar-dir <controlled-absolute-path>", allowedKeys: ["approvedControls", "bindingRef", "canonicalBlockRef", "executionBoundary", "id", "ownerCommandTemplate", "preflight", "retention", "rows", "sourceScopeDecision", "status", "verbatimApprovalRef"] },
  { id: "current-wildfire-exact-archive-proof", rows: ["cwfis-current", "bc-wildfire", "ab-wildfire", "on-fire-disturbance"], retention: { ...RETENTION, payloadsAndManifests: true }, preflight: "zsh scripts/run-wildfire-derived-readback.sh --preflight <owner-owned-mode-600-copy-of-readback-approval>", commandKey: null, command: null, allowedKeys: ["bindingRef", "canonicalBlockRef", "derivedReadbackApproval", "executionBoundary", "iamDesiredState", "id", "preflight", "retention", "rows", "status", "verbatimApprovalRef"] },
];
export const EXACT_PHASE1_ARCHIVE_CONTROL = { preflight: "scripts/run-phase1-archive-owner-exercise.sh --preflight", ownerCommand: "scripts/run-phase1-archive-owner-exercise.sh --run" };

export function validate(record = read("data/phase1-phase3-owner-approvals-2026-08-21.json")) {
  const partial = read("data/partial-ledger-owner-review-outreach-package.json");
  const access = read("data/phase1-permission-outreach-package.json");
  const wildfire = read("data/current-wildfire-derived-readback-owner-approval.json");
  assert.equal(record.schemaVersion, "witness-tree/phase1-phase3-owner-approvals/1");
  assert.equal(record.derivedFromHead, "9850af7da9f5fb7c7abb063bc09b1e5ec15a5df9");
  assert.deepEqual(record.owner, {name:"Chinonso Obeta",statement:"I approve every single one of those decisions"});
  assert.deepEqual(record.baseline, {rawEvidenceNumerator:14.25,rawEvidenceDenominator:31,formalEvidenceTrackingPercentage:38.7903226,immutableRows:7,productionAdmissionRows:0,productionEligibleRows:0});
  assert.deepEqual(record.phase1.archiveApprovals.map(({id}) => id), EXACT_PHASE1_ARCHIVE_APPROVALS.map(({ id }) => id));
  for (const [index, approval] of record.phase1.archiveApprovals.entries()) {
    const expected = EXACT_PHASE1_ARCHIVE_APPROVALS[index];
    assert.match(approval.status, /^approved-owner-local-/);
    assert.deepEqual(Object.keys(approval).sort(), expected.allowedKeys);
    assert.deepEqual(approval.rows, expected.rows);
    assert.deepEqual(approval.retention, expected.retention);
    assert.equal(approval.preflight, expected.preflight);
    if (expected.commandKey) assert.equal(approval[expected.commandKey], expected.command);
    else {
      assert.equal(Object.hasOwn(approval, "ownerCommand"), false);
      assert.equal(Object.hasOwn(approval, "ownerCommandTemplate"), false);
    }
  }
  assert.equal(record.phase1.archiveControlExercise.preflight, EXACT_PHASE1_ARCHIVE_CONTROL.preflight);
  assert.equal(record.phase1.archiveControlExercise.ownerCommand, EXACT_PHASE1_ARCHIVE_CONTROL.ownerCommand);
  assert.equal(record.phase1.archiveApprovals[0].sourceScopeDecision, "accept");
  assert.deepEqual(record.phase1.archiveApprovals[1].sourceScopeDecision, {"qc-current-ecoforest":"accept","qc-original-current-inventory":"accept"});
  assert.deepEqual(record.phase1.archiveApprovals[1].iamAudit, {roleExists:true,dedicatedOperatorPolicyExists:true,getObjectVersionExplicitlyApproved:true,accessAnalyzerFindings:0,exactReadbackHashesPassed:true,normalizedOperatorPrestatePreserved:true,iamMutationPerformed:true,s3MutationPerformed:false});
  assert.deepEqual(record.phase1.archiveApprovals[2].approvedControls, ["exact-artifact-set","IAM","MFA-session","irreversible-COMPLIANCE-retention"]);
  assert.deepEqual(record.phase1.archiveApprovals[3].iamDesiredState, {staticValidation:"passed",liveDryRun:"passed",change:"already-present",baseAndDesiredPolicySha256:"1b2f75726e3d3e97107e8cceca2d491048592e8cf571c24e419979c480cb65e3",accessAnalyzerFindings:0,exactAllowSimulations:6,negativeImplicitDenySimulations:2,mutationPerformed:false,noObjectVersionIdsRecorded:true});
  validateApproval(wildfire);
  validateLocalArtifacts(undefined);
  assert.deepEqual(record.phase1.partialOutreach.requests.map(({id}) => id), partial.requests.map(({id}) => id));
  assert.equal(record.phase1.partialOutreach.requests.every(({sendStatus}) => sendStatus.startsWith("not-sent") || sendStatus.startsWith("blocked")), true);
  assert.equal(record.phase1.partialOutreach.claims.messageSent, false);
  const messageKeys = access.messages.map(({recipient,subject}) => `${recipient}\n${subject}`.toLowerCase());
  assert.equal(new Set(messageKeys).size, messageKeys.length, "recorded access engagement contains a duplicate recipient/subject");
  assert.equal(record.phase1.accessBlockerEngagements.alreadyRecordedMessages, access.messages.length);
  assert.deepEqual(record.phase1.accessBlockerEngagements.bcCopyrightForm, {status:"fom-only-submitted-clarification-replied-permission-and-access-pending",submittedRows:["bc-forest-operations-map"],unsubmittedRows:["bc-vri","bc-old-growth-bec"],evidence:"data/phase1-bc-copyright-permission-form-package.json"});
  assert.deepEqual(record.phase1.accessBlockerEngagements.claims, {newInitialMessageSent:false,followUpSent:true,formSubmitted:true,permissionReceived:false,authorizedAccessReceived:false,feeAccepted:false,creditChanged:false});
  assert.deepEqual(record.phase3Governance.accountableRoles, {publishedContentOwner:"Chinonso Obeta",dataQualityOwner:"Chinonso Obeta",disputeEscalationOwner:"Chinonso Obeta"});
  assert.equal(record.phase3Governance.productName.approvedWorkingName, "Witness Tree");
  assert.equal(record.phase3Governance.productName.mistikAuthorized, false);
  assert.deepEqual(record.phase3Governance.phase3FixedMaturity, {before:47,after:47,deltaPercentagePoints:0,reason:"Owner governance approval does not supply real Phase 2 data, external review, or human checkpoint evidence."});
  assert.equal(Object.hasOwn(record.claims, "remoteMutationPerformed"), false, "ambiguous remote-mutation claim is prohibited");
  assert.deepEqual(record.claims, {storageMutationPerformed:false,s3MutationPerformed:false,iamMutationPerformed:true,irreversibleRetentionApplied:false,outreachSentByThisRecord:false,phase2Authorized:false,productionAdmission:false,productionEligible:false,phase1RawCreditDelta:0,phase1FormalPercentagePointDelta:0});
  return record;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  validate();
  console.log("Phase 1 owner approvals and Phase 3 governance passed: exact approvals recorded, all external/MFA/irreversible steps remain fail-closed, and score delta is zero.");
}
