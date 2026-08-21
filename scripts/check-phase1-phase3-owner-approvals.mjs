import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateApproval, validateLocalArtifacts } from "./check-wildfire-derived-readback.mjs";

const read = (file) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));

export function validate(record = read("data/phase1-phase3-owner-approvals-2026-08-21.json")) {
  const packet = read("data/phase1-owner-approval-packet.json");
  const partial = read("data/partial-ledger-owner-review-outreach-package.json");
  const access = read("data/phase1-permission-outreach-package.json");
  const wildfire = read("data/current-wildfire-derived-readback-owner-approval.json");
  assert.equal(record.schemaVersion, "witness-tree/phase1-phase3-owner-approvals/1");
  assert.equal(record.derivedFromHead, "9850af7da9f5fb7c7abb063bc09b1e5ec15a5df9");
  assert.deepEqual(record.owner, {name:"Chinonso Obeta",statement:"I approve every single one of those decisions"});
  assert.deepEqual(record.baseline, {rawEvidenceNumerator:14.25,rawEvidenceDenominator:31,formalEvidenceTrackingPercentage:38.7903226,immutableRows:7,productionAdmissionRows:0,productionEligibleRows:0});
  assert.deepEqual(record.phase1.archiveApprovals.map(({id}) => id), packet.decisionOrder.slice(0, 3).map(({id}) => id).concat("current-wildfire-exact-archive-proof"));
  for (const approval of record.phase1.archiveApprovals) assert.match(approval.status, /^approved-owner-local-/);
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
  assert.equal(record.phase1.accessBlockerEngagements.claims.newMessageSent, false);
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
