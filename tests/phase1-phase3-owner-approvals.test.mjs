import assert from "node:assert/strict";
import test from "node:test";
import { validate } from "../scripts/check-phase1-phase3-owner-approvals.mjs";
import record from "../data/phase1-phase3-owner-approvals-2026-08-21.json" with {type:"json"};

test("records exact owner approvals without evidence or production overclaim", () => {
  assert.doesNotThrow(() => validate(record));
});

test("rejects fabricated execution, outreach, Phase 2, or production claims", () => {
  for (const field of ["storageMutationPerformed","s3MutationPerformed","irreversibleRetentionApplied","outreachSentByThisRecord","phase2Authorized","productionAdmission","productionEligible"]) {
    assert.throws(() => validate({...structuredClone(record),claims:{...record.claims,[field]:true}}));
  }
  assert.throws(() => validate({...structuredClone(record),claims:{...record.claims,iamMutationPerformed:false}}));
  assert.throws(() => validate({...structuredClone(record),claims:{...record.claims,remoteMutationPerformed:false}}));
  const permission = structuredClone(record); permission.phase1.accessBlockerEngagements.claims.permissionReceived = true;
  assert.throws(() => validate(permission));
  const broaderForm = structuredClone(record); broaderForm.phase1.accessBlockerEngagements.bcCopyrightForm.submittedRows.push("bc-vri");
  assert.throws(() => validate(broaderForm));
});

test("rejects fabricated Mistik authorization or a changed accountable owner", () => {
  const mistik = structuredClone(record); mistik.phase3Governance.productName.mistikAuthorized = true;
  assert.throws(() => validate(mistik));
  const owner = structuredClone(record); owner.phase3Governance.accountableRoles.dataQualityOwner = "Someone Else";
  assert.throws(() => validate(owner));
});
