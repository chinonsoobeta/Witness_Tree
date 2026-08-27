import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RECORD = path.join(ROOT, "data/phase1-nbac-owner-authorization-2026-08-27.json");
const HISTORICAL_RECORD = "data/phase1-nbac-outreach-sent-2026-08-27.json";
const UUID = "537a1fd0-698e-4a7b-85a1-e02581ae78b2";
const API_URL = `https://catalogue.cwfif.nrcan.gc.ca/geonetwork/srv/api/records/${UUID}/formatters/json`;
const ARTIFACT_URL = "https://cwfis.cfs.nrcan.gc.ca/downloads/nbac/NBAC_1972to2025_20260513_shp.zip";
const METADATA_URL = "https://cwfis.cfs.nrcan.gc.ca/downloads/nbac/NBAC_1972to2025_20260513_shp_metadata.pdf";
const INDEX_URL = "https://cwfis.cfs.nrcan.gc.ca/downloads/nbac/";
const LICENCE_URL = "https://open.canada.ca/en/open-government-licence-canada";
const CITATION = "Canadian Forest Service. National Burned Area Composite (NBAC). Natural Resources Canada, Canadian Forest Service, Northern Forestry Centre, Edmonton, Alberta. https://cwfis.cfs.nrcan.gc.ca.";
const FALSE_EVIDENCE_STATE = {
  byteEvidencePresent: false,
  artifactDownloaded: false,
  artifactProfiled: false,
  artifactArchived: false,
  staged: false,
  artifactIngested: false,
  artifactReleased: false,
  artifactPublished: false,
  productionAdmitted: false,
  productionEligible: false,
};
const HISTORICAL_CLAIMS = {
  agreementAccepted: false,
  writtenConsentReceived: false,
  artifactAcquired: false,
  ledgerCreditChanged: false,
  productionAdmission: false,
};

function exactKeys(value, keys, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label} fields differ`);
}

function readJson(root, relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));
}

function assertNoByteEvidenceKeys(value, label = "record") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assert.ok(!["sha256", "sha-256", "byteLength", "checksum"].includes(key), `${label}.${key} cannot be added before byte evidence exists`);
    assertNoByteEvidenceKeys(child, `${label}.${key}`);
  }
}

export function validatePhase1NbacOwnerAuthorization(record, { root = ROOT, verifyHistorical = true } = {}) {
  exactKeys(record, [
    "currentTerms",
    "decidedAt",
    "decisions",
    "decisionId",
    "evidenceState",
    "historicalEvidence",
    "limits",
    "ownerAuthorization",
    "schemaVersion",
    "source",
    "status",
  ], "record");
  assert.equal(record.schemaVersion, "witness-tree/phase1-nbac-owner-authorization/1");
  assert.equal(record.status, "owner-approval-recorded-artifact-evidence-separate");
  assert.equal(record.decisionId, "phase1-nbac-acquisition-publication-2026-08-27");
  assert.equal(record.decidedAt, "2026-08-27");

  exactKeys(record.ownerAuthorization, ["decision", "ownerName", "statement"], "ownerAuthorization");
  assert.deepEqual(record.ownerAuthorization, {
    ownerName: "Chinonso Obeta",
    decision: "approve",
    statement: "I explicitly authorize NBAC acquisition, ingestion, release, production admission and publication now, and I do not want to wait for permission. Assume that you have full legal sign-off.",
  });

  exactKeys(record.source, ["artifactUrl", "component", "metadataUrl", "officialCatalogue", "officialIndexUrl", "publisher", "sourceId", "title"], "source");
  assert.equal(record.source.sourceId, "cwfis-historical");
  assert.equal(record.source.component, "National Burned Area Composite");
  assert.equal(record.source.title, "National Burned Area Composite");
  assert.equal(record.source.publisher, "Natural Resources Canada, Canadian Forest Service");
  assert.equal(record.source.officialIndexUrl, INDEX_URL);
  assert.equal(record.source.artifactUrl, ARTIFACT_URL);
  assert.equal(record.source.metadataUrl, METADATA_URL);
  exactKeys(record.source.officialCatalogue, ["apiUrl", "uuid"], "source.officialCatalogue");
  assert.equal(record.source.officialCatalogue.uuid, UUID);
  assert.equal(record.source.officialCatalogue.apiUrl, API_URL);

  exactKeys(record.currentTerms, ["citation", "licence", "metadata", "noEndorsement", "status"], "currentTerms");
  assert.equal(record.currentTerms.status, "official-current-cwfis-geonetwork-metadata");
  exactKeys(record.currentTerms.metadata, ["apiUrl", "creationDate", "publicationDate", "timestamp", "uuid"], "currentTerms.metadata");
  assert.deepEqual(record.currentTerms.metadata, {
    uuid: UUID,
    apiUrl: API_URL,
    timestamp: "2026-06-17T16:42:35.514Z",
    publicationDate: "2026-05-13",
    creationDate: "2026-05-13",
  });
  exactKeys(record.currentTerms.licence, ["name", "url"], "currentTerms.licence");
  assert.deepEqual(record.currentTerms.licence, {
    name: "Open Government Licence - Canada",
    url: LICENCE_URL,
  });
  assert.equal(record.currentTerms.citation, CITATION);
  assert.equal(record.currentTerms.noEndorsement, "Do not imply official status or endorsement.");

  exactKeys(record.decisions, [
    "acquisitionApproved",
    "ingestionApproved",
    "productionAdmissionApproved",
    "publicationApproved",
    "releaseApproved",
    "waitForAdditionalPermission",
  ], "decisions");
  assert.deepEqual(record.decisions, {
    acquisitionApproved: true,
    ingestionApproved: true,
    releaseApproved: true,
    productionAdmissionApproved: true,
    publicationApproved: true,
    waitForAdditionalPermission: false,
  });

  exactKeys(record.evidenceState, Object.keys(FALSE_EVIDENCE_STATE), "evidenceState");
  assert.deepEqual(record.evidenceState, FALSE_EVIDENCE_STATE, "owner approval must not become artifact evidence");

  exactKeys(record.historicalEvidence, ["claimsRemainFalse", "path", "remainsHistorical", "status"], "historicalEvidence");
  assert.deepEqual(record.historicalEvidence, {
    path: HISTORICAL_RECORD,
    status: "sent-awaiting-response",
    remainsHistorical: true,
    claimsRemainFalse: true,
  });
  if (verifyHistorical) {
    const historical = readJson(root, HISTORICAL_RECORD);
    assert.equal(historical.status, "sent-awaiting-response");
    assert.deepEqual(historical.claims, HISTORICAL_CLAIMS, "historical outreach claims must remain false");
  }

  assert.ok(Array.isArray(record.limits) && record.limits.length === 3, "authorization limits are required");
  assert.match(record.limits[0], /not byte, checksum, profile, archive, ingestion, release, publication or production evidence/i);
  assert.match(record.limits[1], /exact artifact must be downloaded and byte-bound/i);
  assert.match(record.limits[2], /earlier outreach-sent record remains historical/i);
  assertNoByteEvidenceKeys(record);
  return record;
}

export const validate = validatePhase1NbacOwnerAuthorization;

export function checkPhase1NbacOwnerAuthorization(file = RECORD, options = {}) {
  return validatePhase1NbacOwnerAuthorization(JSON.parse(readFileSync(file, "utf8")), options);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  checkPhase1NbacOwnerAuthorization();
  console.log("NBAC owner authorization and current terms passed; artifact evidence remains separately proven.");
}
