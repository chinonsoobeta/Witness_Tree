import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const HTTPS = /^https:\/\//;
const ISO = /^2026-08-20T\d{2}:\d{2}:\d{2}Z$/;

function https(value, field) {
  assert.equal(typeof value, "string", `${field} must be a string.`);
  assert.match(value, HTTPS, `${field} must be HTTPS.`);
}
export function validatePhase1BecCustomDownloadRouteAudit(audit) {
  assert.equal(audit?.schemaVersion, 1);
  assert.equal(audit.status, "blocked-before-custom-download-order");
  assert.match(audit.auditedAt ?? "", ISO);
  assert.match(audit.source ?? "", /read-only inspection/i);
  assert.equal(audit.canonicalRowId, "bc-old-growth-bec");

  const official = audit.official;
  assert.equal(official.publisher, "Forest Analysis and Inventory Branch");
  assert.equal(official.datasetTitle, "BEC Map");
  assert.equal(official.datasetName, "bec-map");
  assert.equal(official.datasetId, "f358a53b-ffde-4830-a325-a5a03ff672c3");
  assert.equal(official.datasetVersion, "13.1");
  assert.equal(official.versionReleasedAt, "2026-07-08");
  assert.equal(official.licence, "Open Government Licence - British Columbia");
  assert.equal(official.downloadAudience, "Public");
  assert.equal(official.isOpen, false);
  https(official.catalogueUrl, "Catalogue URL");
  https(official.packageApiUrl, "Package API URL");
  https(official.catalogueLicenceUrl, "Catalogue licence URL");
  https(official.currentLicenceUrl, "Current licence URL");
  assert.equal(official.attribution, "Contains information licensed under the Open Government Licence – British Columbia.");

  const resource = official.resource;
  assert.equal(resource.id, "46ceb84a-3f6d-436c-b4c1-c89beb72d11a");
  assert.equal(resource.name, "BC Geographic Warehouse Custom Download");
  assert.equal(resource.objectName, "WHSE_FOREST_VEGETATION.BEC_BIOGEOCLIMATIC_POLY");
  assert.equal(resource.projection, "epsg3005");
  assert.equal(resource.spatialDatatype, "SDO_GEOMETRY");
  assert.equal(resource.accessMethod, "indirect access");
  assert.equal(resource.lastModified, "2026-07-08T22:15:10");
  assert.equal(resource.url, null);
  assert.equal(resource.featureCount, null);
  https(resource.resourceApiUrl, "Resource API URL");
  https(resource.catalogueResourceUrl, "Catalogue resource URL");
  assert.equal(resource.schemaColumns.length, 20);
  assert.deepEqual(resource.schemaColumns.map(({ name }) => name), [
    "FEATURE_CLASS_SKEY", "ZONE", "SUBZONE", "VARIANT", "PHASE", "NATURAL_DISTURBANCE",
    "MAP_LABEL", "BGC_LABEL", "ZONE_NAME", "SUBZONE_NAME", "VARIANT_NAME", "PHASE_NAME",
    "NATURAL_DISTURBANCE_NAME", "FEATURE_AREA_SQM", "FEATURE_LENGTH_M", "GEOMETRY",
    "FEATURE_AREA", "FEATURE_LENGTH", "OBJECTID", "SE_ANNO_CAD_DATA"
  ]);

  const terms = audit.terms;
  https(terms.distributionGuideUrl, "Distribution guide URL");
  https(terms.accessPolicyUrl, "Access policy URL");
  assert.equal(terms.requiresIndirectOrder, true);
  assert.deepEqual(terms.requiredOrderInputs, ["coordinate system", "area of interest or full-extent decision", "clipping mode", "format", "included layers", "notification email address"]);
  assert.equal(terms.requiresTermsAndConditionsCheckbox, true);
  assert.equal(terms.requiresSubmitOrder, true);
  assert.equal(terms.requiresContinueConfirmation, true);
  assert.equal(terms.requiresProvinceIdentityOrAccountReview, true);
  assert.equal(terms.requiresNewTermsAcceptanceForThisAudit, true);
  assert.equal(terms.requiresPersonalInformationForThisAudit, true);
  assert.equal(terms.feeMentionedInInspectedOfficialInstructions, false);
  assert.match(terms.policyEligibilityText, /current employee, contractor, agent or representative/i);
  assert.equal(terms.accepted, false);
  assert.equal(terms.submitted, false);
  assert.equal(terms.paid, false);

  assert.equal(audit.artifact.acquired, false);
  assert.equal(audit.artifact.downloadUrl, null);
  assert.equal(audit.artifact.head, null);
  assert.equal(audit.artifact.bytes, null);
  assert.equal(audit.artifact.sha256, null);
  assert.equal(audit.artifact.archiveIntegrity, null);
  assert.deepEqual(audit.artifact.contents, {schemaVerified:false, crsVerified:false, featureCount:null, geometryValidityVerified:false});
  assert.equal(audit.officialAlternativeExhaustionFile, "data/phase1-bec-public-alternative-exhaustion.json");
  assert.equal(audit.ownerAction.status, "prepared-awaiting-owner-authorization");
  assert.equal(audit.ownerAction.steps.length, 5);
  return audit;
}

export async function checkPhase1BecCustomDownloadRouteAudit(file = new URL("../data/phase1-bec-custom-download-route-audit.json", import.meta.url)) {
  return validatePhase1BecCustomDownloadRouteAudit(JSON.parse(await readFile(file, "utf8")));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const audit = await checkPhase1BecCustomDownloadRouteAudit();
  console.log(`BEC custom-download route remains blocked before order: ${audit.official.datasetVersion}; no artifact, terms acceptance, submission or payment.`);
}
