import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase1BcCopyrightPermissionFormPackage } from "../scripts/check-phase1-bc-copyright-permission-form-package.mjs";

const record = JSON.parse(readFileSync(new URL("../data/phase1-bc-copyright-permission-form-package.json", import.meta.url), "utf8"));

test("BC copyright package records the FOM-only submission and reply without broadening permission", () => {
  assert.equal(validatePhase1BcCopyrightPermissionFormPackage(record), record);
  assert.equal(record.sourceEvidence.oneFormForAllThree, true);
  assert.deepEqual(record.formFieldMap.find(({ field }) => field === "websiteSourceUrl").preparedSupportingValues, [
    "https://catalogue.data.gov.bc.ca/dataset/6ba30649-14cd-44ad-a11f-794feed39f40",
    "https://catalogue.data.gov.bc.ca/dataset/7dda4615-5d32-427e-a303-1dcdb90a6fea",
    "https://catalogue.data.gov.bc.ca/dataset/f257ca4a-0c33-4eb2-9da8-21dff4482f58"
  ]);
  assert.equal(record.impact.rawEvidenceCreditImpact, 0);
  assert.equal(record.impact.permissionGranted, false);
  assert.equal(record.impact.formsSubmitted, true);
  assert.deepEqual(record.submissionOutcome.submittedCanonicalRowIds, ["bc-forest-operations-map"]);
  assert.deepEqual(record.submissionOutcome.unsubmittedCanonicalRowIds, ["bc-vri", "bc-old-growth-bec"]);
});

test("BC copyright package fails closed on broader submission, permission, personal data, fee, or TAP conflation", () => {
  const broader = structuredClone(record);
  broader.submissionOutcome.submittedCanonicalRowIds.push("bc-vri");
  assert.throws(() => validatePhase1BcCopyrightPermissionFormPackage(broader));

  const noSubmission = structuredClone(record);
  noSubmission.impact.formsSubmitted = false;
  assert.throws(() => validatePhase1BcCopyrightPermissionFormPackage(noSubmission));

  const permission = structuredClone(record);
  permission.impact.permissionGranted = true;
  assert.throws(() => validatePhase1BcCopyrightPermissionFormPackage(permission), /false/);

  const paid = structuredClone(record);
  paid.sourceEvidence.fee.paid = true;
  assert.throws(() => validatePhase1BcCopyrightPermissionFormPackage(paid), /false/);

  const personal = structuredClone(record);
  personal.formFieldMap.find(({ field }) => field === "email.enter").preparedValue = "owner@example.invalid";
  assert.throws(() => validatePhase1BcCopyrightPermissionFormPackage(personal), /owner-only|did not collect|must remain/);

  const conflated = structuredClone(record);
  conflated.datasets.find(({ canonicalRowIds }) => canonicalRowIds.includes("bc-old-growth-bec")).limitations = ["TAP is the implemented-deferral layer."];
  assert.throws(() => validatePhase1BcCopyrightPermissionFormPackage(conflated), /TAP must not be presented/);
});
