import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCHEMA = "witness-tree/bc-forest-tenure-foi-catalogue-response/1";
const STATUS = "official-response-received-catalogue-export-not-yet-verified";
const CATALOGUE_API = "https://catalogue.data.gov.bc.ca/api/3/action/package_show";
const LICENCE_TITLE = "Open Government Licence - British Columbia";
const LICENCE_URL = "https://www2.gov.bc.ca/gov/content?id=A519A56BC2BF44E4A008B33FCF527F61";
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const OFFSET_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const EXPECTED_DATASETS = [
  {
    sourceId: "bc-fta-cutblocks",
    catalogueId: "dfb8b498-fa4b-4286-b3ec-58db88aca1cf",
    title: "Forest Tenure Cutblock Polygons (FTA 4.0)",
    catalogueUrl: "https://catalogue.data.gov.bc.ca/dataset/forest-tenure-cutblock-polygons-fta-4-0",
    metadataModified: "2026-08-27T12:44:28.011625",
    objectName: "WHSE_FOREST_TENURE.FTEN_CUT_BLOCK_POLY_SVW"
  },
  {
    sourceId: "bc-harvesting-authorities",
    catalogueId: "cff7b8f7-6897-444f-8c53-4bb93c7e9f8b",
    title: "Forest Tenure Harvesting Authority Polygons",
    catalogueUrl: "https://catalogue.data.gov.bc.ca/dataset/forest-tenure-harvesting-authority-polygons",
    metadataModified: "2026-08-27T12:42:17.687850",
    objectName: "WHSE_FOREST_TENURE.FTEN_HARVEST_AUTH_POLY_SVW"
  }
];

const EXPECTED_VIEWS = EXPECTED_DATASETS.map(({ objectName }) => objectName);
const EXPECTED_RESOURCES = ["indirect-custom-download", "WMS", "KML-ground-overlay"];

function requiredString(value, field) {
  assert.equal(typeof value, "string", `${field} must be a string.`);
  assert.ok(value.trim(), `${field} must not be empty.`);
}

function https(value, field) {
  requiredString(value, field);
  assert.match(value, /^https:\/\//, `${field} must use HTTPS.`);
}

function exactTimestamp(value, field, pattern = OFFSET_TIMESTAMP) {
  requiredString(value, field);
  assert.match(value, pattern, `${field} must be an ISO-8601 timestamp.`);
  assert.ok(!Number.isNaN(Date.parse(value)), `${field} must be a valid timestamp.`);
}

function exactDate(value, field) {
  requiredString(value, field);
  assert.match(value, DATE, `${field} must be an ISO date.`);
  assert.ok(!Number.isNaN(Date.parse(`${value}T00:00:00Z`)), `${field} must be a valid date.`);
}

function noMailboxIdentifiers(value) {
  const serialized = JSON.stringify(value);
  assert.doesNotMatch(serialized, /mail\.google\.com/i, "Evidence must not retain Gmail mailbox URLs.");
  assert.doesNotMatch(serialized, /\b(?:message|thread)[ _-]?id\b/i, "Evidence must not retain mailbox message or thread identifiers.");
}

export function validateBcForestTenureFoiCatalogueResponse(record) {
  assert.ok(record && typeof record === "object" && !Array.isArray(record), "The FOI response record must be an object.");
  assert.equal(record.schemaVersion, SCHEMA);
  assert.equal(record.status, STATUS);
  assert.equal(record.recordedOn, "2026-08-27");

  const request = record.request;
  assert.ok(request && typeof request === "object" && !Array.isArray(request), "The FOI request section is required.");
  assert.equal(request.reference, "FOR-2026-056834");
  assert.deepEqual(request.requestedViews, EXPECTED_VIEWS);
  requiredString(request.requestedOutcome, "request.requestedOutcome");
  assert.equal(request.requestedOutcomeIsSummary, true, "request.requestedOutcome must be labelled as a summary.");
  assert.match(request.requestedOutcomeBasis ?? "", /condensed|summary/i, "The requested-outcome summary needs its basis.");
  assert.match(request.requestedOutcomeBasis ?? "", /separate per-view timestamps/i, "The summary must retain the separate-timestamp condition.");
  exactTimestamp(request.responseReceivedAt, "request.responseReceivedAt");
  assert.equal(request.responseReceivedAt, "2026-08-27T09:00:10-07:00");
  exactDate(request.responseDeadline, "request.responseDeadline");
  assert.equal(request.responseDeadline, "2026-09-01");
  requiredString(request.responseSummary, "request.responseSummary");
  assert.match(request.responseSummary, /publicly available/i);
  assert.match(request.responseSummary, /withdraw/i);
  const provenance = request.responseProvenance;
  assert.ok(provenance && typeof provenance === "object" && !Array.isArray(provenance), "Non-sensitive response provenance is required.");
  assert.equal(provenance.channel, "official email");
  assert.equal(provenance.senderDomain, "gov.bc.ca");
  assert.equal(provenance.subject, "FOI Request FOR-2026-056834 - Withdrawal request");
  assert.equal(request.outboundReplySent, false, "The record must not claim that a reply was sent.");
  noMailboxIdentifiers(record);

  const catalogue = record.catalogueReadback;
  assert.ok(catalogue && typeof catalogue === "object" && !Array.isArray(catalogue), "The catalogue readback section is required.");
  exactTimestamp(catalogue.retrievedAt, "catalogueReadback.retrievedAt", UTC_TIMESTAMP);
  assert.equal(catalogue.retrievedAt, "2026-08-27T17:00:00Z");
  assert.equal(catalogue.api, CATALOGUE_API);
  assert.ok(Array.isArray(catalogue.datasets), "catalogueReadback.datasets must be an array.");
  assert.deepEqual(catalogue.datasets.map(({ sourceId }) => sourceId), EXPECTED_DATASETS.map(({ sourceId }) => sourceId));
  assert.equal(catalogue.datasets.length, EXPECTED_DATASETS.length);
  for (const [index, dataset] of catalogue.datasets.entries()) {
    const expected = EXPECTED_DATASETS[index];
    assert.deepEqual(
      {
        sourceId: dataset.sourceId,
        catalogueId: dataset.catalogueId,
        title: dataset.title,
        catalogueUrl: dataset.catalogueUrl,
        metadataModified: dataset.metadataModified,
        objectName: dataset.objectName
      },
      expected,
      `${dataset.sourceId} catalogue identity drifted.`
    );
    https(dataset.catalogueUrl, `${dataset.sourceId}.catalogueUrl`);
    assert.equal(dataset.licence, LICENCE_TITLE);
    assert.equal(dataset.licenceUrl, LICENCE_URL);
    assert.deepEqual(dataset.resources, EXPECTED_RESOURCES);
  }

  const assessment = record.assessment;
  assert.ok(assessment && typeof assessment === "object" && !Array.isArray(assessment), "The assessment section is required.");
  assert.equal(assessment.officialProgramAreaSaysPubliclyAvailable, true);
  assert.equal(assessment.exactCatalogueLicenceVerified, true);
  for (const field of ["directFullProvincePackagePresent", "coherentTimestampedExtractVerified", "completeRecordCountVerified", "archiveOrProductionAdmission", "withdrawalRecommended"]) {
    assert.equal(assessment[field], false, `${field} must remain false until exact extract evidence exists.`);
  }
  requiredString(assessment.reason, "assessment.reason");
  assert.match(assessment.reason, /no direct timestamped full-province package/i);
  assert.match(assessment.reason, /checksum/i);
  requiredString(record.nextSafeStep, "nextSafeStep");
  assert.match(record.nextSafeStep, /profile.*custom-download/i);
  return record;
}

export async function checkBcForestTenureFoiCatalogueResponse(file = new URL("../data/bc-forest-tenure-foi-catalogue-response-2026-08-27.json", import.meta.url)) {
  return validateBcForestTenureFoiCatalogueResponse(JSON.parse(await readFile(file, "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const record = await checkBcForestTenureFoiCatalogueResponse(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/bc-forest-tenure-foi-catalogue-response-2026-08-27.json"));
  console.log(`BC FTA FOI catalogue response passed: ${record.catalogueReadback.datasets.length} official catalogue records remain export-blocked.`);
}
