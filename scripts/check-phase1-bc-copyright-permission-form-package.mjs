import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HTTPS = /^https:\/\//;
const FORM_URL = "https://forms.gov.bc.ca/copyright-permission-request/";
const DATASETS = [
  ["bc-vri", "VRI - 2025 - Forest Vegetation Composite Polygons", "https://catalogue.data.gov.bc.ca/dataset/6ba30649-14cd-44ad-a11f-794feed39f40"],
  ["bc-forest-operations-map", "Forest Operations Map (FOM) - Cutblocks", "https://catalogue.data.gov.bc.ca/dataset/7dda4615-5d32-427e-a303-1dcdb90a6fea"],
  ["bc-old-growth-bec", "Old Growth Technical Advisory Panel (TAP) - Priority Deferral Areas - Current View", "https://catalogue.data.gov.bc.ca/dataset/f257ca4a-0c33-4eb2-9da8-21dff4482f58"]
];
const FORM_FIELDS = [
  "name.first", "name.last", "title", "organization", "address.street", "address.city", "address.region", "address.postalCode", "address.country",
  "email.enter", "email.confirm", "phone", "fax", "previousPermission", "priorPermissionFileNumber", "materialIsFrom", "publicationTitle",
  "publicationAuthor", "publicationDate", "sourceMinistry", "publicationTotalPages", "publicationIsbn", "publicationPageNumbers", "websiteSourceUrl",
  "websiteNumberOfCopies", "natureOfIntendedUse", "intendedUseDetails", "hiddenValidationName"
];

function required(value, field) {
  assert.equal(typeof value, "string", `${field} must be a string.`);
  assert.ok(value.trim(), `${field} must not be blank.`);
}

function https(value, field) {
  required(value, field);
  assert.match(value, HTTPS, `${field} must be HTTPS.`);
}

export function validatePhase1BcCopyrightPermissionFormPackage(record) {
  assert.equal(record?.schemaVersion, 1);
  assert.equal(record.status, "fom-form-submitted-clarification-replied-permission-pending");
  required(record.nonClaimNotice, "nonClaimNotice");
  assert.match(record.nonClaimNotice, /actually submitted.*only.*FOM.*not permission.*not a licence/i);
  assert.deepEqual(record.canonicalRowIds, ["bc-vri", "bc-forest-operations-map", "bc-old-growth-bec"]);

  const reply = record.sourceEvidence;
  assert.equal(reply.sender, "QPIPPCopyright@gov.bc.ca");
  assert.equal(reply.subject, "RE: Permission and authoritative-export request — VRI 2025, FOM Cutblocks, and TAP deferral layer");
  assert.equal(reply.receivedAt, "2026-08-20T17:39:18Z");
  assert.equal(reply.localReceivedAt, "2026-08-20T10:39:18-07:00");
  assert.equal(reply.oneFormForAllThree, true);
  assert.equal(reply.noDeadlineStated, true);
  assert.equal(reply.permissionGranted, false);
  assert.equal(reply.licenceGranted, false);
  assert.equal(reply.artifactSupplied, false);
  assert.equal(reply.editionChecksumOrAttributionSupplied, false);
  assert.equal(reply.fee.applies, true);
  assert.equal(reply.fee.amount, null);
  assert.equal(reply.fee.paid, false);
  assert.equal(reply.fee.disclosureRequestedBeforeCharge, true);
  assert.equal(reply.formUrl, FORM_URL);

  const outcome = record.submissionOutcome;
  assert.equal(outcome.status, "fom-form-submitted-clarification-replied-permission-pending");
  assert.deepEqual(outcome.submittedCanonicalRowIds, ["bc-forest-operations-map"]);
  assert.deepEqual(outcome.unsubmittedCanonicalRowIds, ["bc-vri", "bc-old-growth-bec"]);
  assert.equal(outcome.submittedAt, "2026-08-21T13:48-07:00");
  assert.equal(outcome.clarificationReceivedAt, "2026-08-21T21:21:55Z");
  assert.equal(outcome.clarificationReplySentAt, "2026-08-21T22:34:39Z");
  assert.match(outcome.submissionEvidence, /FOM catalogue URL/i);
  assert.match(outcome.submissionEvidence, /Personal contact fields.*not retained/i);
  assert.match(outcome.clarificationFinding, /view-only.*(?:not|rather than) downloadable/i);
  assert.ok(outcome.clarificationReplyBoundary.some((value) => /No scraping/i.test(value)));
  assert.ok(outcome.clarificationReplyBoundary.some((value) => /Province-authorized export or service/i.test(value)));
  assert.ok(outcome.clarificationReplyBoundary.some((value) => /No raw redistribution or bulk download/i.test(value)));
  for (const field of ["permissionGranted", "licenceGranted", "authorizedAccessSupplied", "artifactSupplied", "feeAccepted", "termsAccepted"]) assert.equal(outcome[field], false);

  const form = record.officialFormInspection;
  assert.equal(form.url, FORM_URL);
  assert.equal(form.hiddenValidationFieldsUntouched, true);
  assert.match(form.accessMethod, /read-only/i);
  assert.match(form.accessMethod, /No browser session was available/i);
  assert.match(form.processingFeeNotice, /majority.*processing fee/i);
  assert.deepEqual(form.fieldsMarkedRequired, [
    "name", "organization", "address", "email", "phone", "previousPermission", "materialIsFrom", "publicationTitle", "publicationPageNumbers",
    "websiteSourceUrl", "websiteNumberOfCopies", "natureOfIntendedUse", "intendedUseDetails"
  ]);
  const fields = new Map(form.fieldInventory.map((field) => [field.field, field]));
  assert.deepEqual([...fields.keys()], FORM_FIELDS);
  assert.equal(fields.get("previousPermission").options.join(","), "Yes,No");
  assert.equal(fields.get("materialIsFrom").options.join(","), "Publication,Website");
  assert.deepEqual(fields.get("natureOfIntendedUse").options, ["Commercial", "Non Commercial", "Educational"]);

  assert.equal(record.datasets.length, DATASETS.length);
  for (const [rowId, name, url] of DATASETS) {
    const dataset = record.datasets.find(({ canonicalRowIds }) => canonicalRowIds.includes(rowId));
    assert.ok(dataset, `${rowId} dataset is required.`);
    assert.deepEqual(dataset.canonicalRowIds, [rowId]);
    assert.equal(dataset.exactCatalogueName, name);
    assert.equal(dataset.catalogueUrl, url);
    https(dataset.catalogueUrl, `${rowId} catalogue URL`);
    assert.equal(dataset.catalogueLicence, "Access Only");
    required(dataset.purpose, `${rowId} purpose`);
    assert.ok(dataset.transformations.length >= 2, `${rowId} transformations are required.`);
    assert.ok(dataset.limitations.length >= 1, `${rowId} limitations are required.`);
  }
  const tap = record.datasets.find(({ canonicalRowIds }) => canonicalRowIds.includes("bc-old-growth-bec"));
  assert.ok(tap.limitations.some((value) => /not necessarily.*implemented/i.test(value)), "TAP must not be presented as implemented deferrals.");
  assert.ok(tap.limitations.some((value) => /not.*implemented-deferral layer/i.test(value)), "TAP must identify the missing implemented-deferral layer.");
  assert.ok(tap.limitations.some((value) => /legal.*title.*rights.*consultation/i.test(value)), "TAP must retain its legal, title, rights and consultation limits.");

  const intended = record.preparedIntendedUse;
  assert.equal(intended.project, "Witness Tree");
  required(intended.purpose, "prepared purpose");
  assert.equal(intended.natureOfUse.commercial, false);
  assert.equal(intended.natureOfUse.nonCommercial, true);
  assert.equal(intended.natureOfUse.educational, false);
  assert.match(intended.archiveRequest, /immutable Canadian object storage/i);
  assert.match(intended.archiveRequest, /do not redistribute.*raw.*Access Only/i);
  assert.match(intended.accessAndFunding, /free/i);
  assert.match(intended.accessAndFunding, /voluntary donations/i);
  assert.match(intended.accessAndFunding, /no preferential or exclusive access/i);
  assert.match(intended.attributionAndDisclosure, /Province of British Columbia/i);
  assert.match(intended.correctionAndRightOfReply, /correction.*right-of-reply/i);
  assert.ok(intended.publicOutputs.includes("Browser-based map"));
  assert.ok(intended.publicOutputs.some((value) => /generalized vector or raster/i.test(value)));

  const map = new Map(record.formFieldMap.map((field) => [field.field, field]));
  assert.deepEqual([...map.keys()], FORM_FIELDS);
  for (const field of ["name.first", "name.last", "address.street", "address.city", "address.region", "address.postalCode", "address.country", "email.enter", "email.confirm", "phone"]) {
    assert.equal(map.get(field).preparedValue, null, `${field} must remain owner-only.`);
    assert.match(map.get(field).ownerAction, /owner.*enter|did not collect|did not enter/i);
  }
  assert.equal(map.get("organization").preparedValue, "Witness Tree");
  assert.equal(map.get("materialIsFrom").preparedValue, "Website");
  assert.deepEqual(map.get("natureOfIntendedUse").preparedValue, ["Non Commercial"]);
  assert.deepEqual(map.get("websiteSourceUrl").preparedSupportingValues, DATASETS.map(([, , url]) => url));
  assert.equal(map.get("intendedUseDetails").preparedValueRef, "preparedIntendedUse");

  assert.equal(record.ownerAction.status, "fom-awaiting-permission-and-access-response-vri-tap-unsubmitted");
  assert.ok(record.ownerAction.steps.length >= 5);
  assert.ok(record.ownerAction.doNotUnderThisAudit.some((value) => /Do not submit a duplicate FOM form/i.test(value)));
  assert.ok(record.ownerAction.doNotUnderThisAudit.some((value) => /Do not enter personal/i.test(value)));
  assert.ok(record.ownerAction.doNotUnderThisAudit.some((value) => /Do not accept or agree to a fee/i.test(value)));
  assert.equal(record.impact.permissionGranted, false);
  assert.equal(record.impact.licenceGranted, false);
  assert.equal(record.impact.formsSubmitted, true);
  assert.deepEqual(record.impact.submittedCanonicalRowIds, ["bc-forest-operations-map"]);
  assert.equal(record.impact.feePaid, false);
  assert.equal(record.impact.termsAccepted, false);
  assert.equal(record.impact.artifactAcquired, false);
  assert.equal(record.impact.ownerDecisionRecorded, false);
  assert.equal(record.impact.rawEvidenceCreditImpact, 0);
  assert.equal(record.impact.productionEligibilityImpact, 0);
  return record;
}

export async function checkPhase1BcCopyrightPermissionFormPackage(file = new URL("../data/phase1-bc-copyright-permission-form-package.json", import.meta.url)) {
  return validatePhase1BcCopyrightPermissionFormPackage(JSON.parse(await readFile(file, "utf8")));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await checkPhase1BcCopyrightPermissionFormPackage(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/phase1-bc-copyright-permission-form-package.json"));
  console.log(`BC copyright form package passed: the FOM-only form and clarification reply are recorded; VRI/TAP remain unsubmitted and permission, access, and fee remain unresolved.`);
}
