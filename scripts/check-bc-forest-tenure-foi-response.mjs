import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCHEMA = "witness-tree/bc-forest-tenure-foi-catalogue-response/2";
const STATUS = "official-response-received-public-wfs-export-profiled-owner-reply-sent-withdrawal-not-explicitly-authorized";
const CATALOGUE_API = "https://catalogue.data.gov.bc.ca/api/3/action/package_show";
const LICENCE_TITLE = "Open Government Licence - British Columbia";
const LICENCE_URL = "https://www2.gov.bc.ca/gov/content?id=A519A56BC2BF44E4A008B33FCF527F61";
const EVIDENCE_ROOT = "/Volumes/Extended_SSD/Witness_Tree-data/work/bc-ften-foi-profile-2026-09-01";
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SHA256 = /^[a-f0-9]{64}$/;

const EXPECTED_DATASETS = [
  {
    sourceId: "bc-fta-cutblocks",
    catalogueId: "dfb8b498-fa4b-4286-b3ec-58db88aca1cf",
    title: "Forest Tenure Cutblock Polygons (FTA 4.0)",
    catalogueUrl: "https://catalogue.data.gov.bc.ca/dataset/forest-tenure-cutblock-polygons-fta-4-0",
    metadataModified: "2026-08-27T12:44:28.011625",
    objectName: "WHSE_FOREST_TENURE.FTEN_CUT_BLOCK_POLY_SVW",
  },
  {
    sourceId: "bc-harvesting-authorities",
    catalogueId: "cff7b8f7-6897-444f-8c53-4bb93c7e9f8b",
    title: "Forest Tenure Harvesting Authority Polygons",
    catalogueUrl: "https://catalogue.data.gov.bc.ca/dataset/forest-tenure-harvesting-authority-polygons",
    metadataModified: "2026-08-27T12:42:17.687850",
    objectName: "WHSE_FOREST_TENURE.FTEN_HARVEST_AUTH_POLY_SVW",
  },
];

const EXPECTED_VIEWS = [
  {
    objectName: "WHSE_FOREST_TENURE.FTEN_CUT_BLOCK_POLY_SVW",
    endpoint: "https://openmaps.gov.bc.ca/geo/pub/WHSE_FOREST_TENURE.FTEN_CUT_BLOCK_POLY_SVW/ows",
    pages: 23,
    bytes: 2076333327,
    recordCount: 222618,
    hitsBeforeTimestamp: "2026-09-01T15:04:42.464Z",
    hitsAfterTimestamp: "2026-09-01T15:12:16.996Z",
    distinctPageTimestamps: 23,
    pageTimestampRange: ["2026-09-01T15:04:49.139Z", "2026-09-01T15:07:22.404Z"],
    schema: {
      catalogueColumns: 38,
      describeFeatureTypeFields: 38,
      catalogueOnly: [],
      describeFeatureTypeOnly: [],
      exactMatch: true,
    },
    attributesObservedNonNull: 36,
    geometryTypes: { Polygon: 189475, MultiPolygon: 33141, null: 2 },
    nullGeometryLifecycle: { RETIRED: 2, ACTIVE: 0 },
    extentEpsg3005: [490978.3, 377258.3, 1868337, 1690990.4],
  },
  {
    objectName: "WHSE_FOREST_TENURE.FTEN_HARVEST_AUTH_POLY_SVW",
    endpoint: "https://openmaps.gov.bc.ca/geo/pub/WHSE_FOREST_TENURE.FTEN_HARVEST_AUTH_POLY_SVW/ows",
    pages: 8,
    bytes: 1948187803,
    recordCount: 71876,
    hitsBeforeTimestamp: "2026-09-01T15:04:42.750Z",
    hitsAfterTimestamp: "2026-09-01T15:12:17.348Z",
    distinctPageTimestamps: 8,
    pageTimestampRange: ["2026-09-01T15:07:35.060Z", "2026-09-01T15:10:41.229Z"],
    schema: {
      catalogueColumns: 56,
      describeFeatureTypeFields: 56,
      catalogueOnly: [],
      describeFeatureTypeOnly: [],
      exactMatch: true,
    },
    attributesObservedNonNull: 54,
    geometryTypes: { MultiPolygon: 44862, Polygon: 26989, null: 25 },
    nullGeometryLifecycle: { RETIRED: 21, ACTIVE: 4 },
    extentEpsg3005: [490978.3, 372754.2, 1868337, 1692265.8],
  },
];

const EXPECTED_REPORTS = {
  "extract-report.json": "6188078d35634e27087d74733f0952ba41597c9549fb3c2ef1f624f1c4530e92",
  "profile-report.json": "592dfa6fd7b1230a2ece8077652a50a061dcfac10aed293de1b3d2de12480f28",
  "extent-report.json": "4cf79111d108ce748af165b67fddd43d933e1e2fabab259cc542820a0746a4b5",
};

const EXPECTED_RESOURCES = ["indirect-custom-download", "WMS", "KML-ground-overlay"];

function requiredString(value, field) {
  assert.equal(typeof value, "string", `${field} must be a string.`);
  assert.ok(value.trim(), `${field} must not be empty.`);
}

function exactTimestamp(value, field) {
  requiredString(value, field);
  assert.match(value, ISO_TIMESTAMP, `${field} must be an ISO-8601 timestamp.`);
  assert.ok(!Number.isNaN(Date.parse(value)), `${field} must be a valid timestamp.`);
}

function exactDate(value, field) {
  requiredString(value, field);
  assert.match(value, DATE, `${field} must be an ISO date.`);
  assert.ok(!Number.isNaN(Date.parse(`${value}T00:00:00Z`)), `${field} must be a valid date.`);
}

function requiredBoolean(value, field) {
  assert.equal(typeof value, "boolean", `${field} must be a boolean.`);
}

function noMailboxIdentifiers(value) {
  const serialized = JSON.stringify(value);
  assert.doesNotMatch(serialized, /mail\.google\.com/i, "Evidence must not retain Gmail mailbox URLs.");
  assert.doesNotMatch(serialized, /\b(?:message|thread)[ _-]?id\b/i, "Evidence must not retain mailbox message or thread identifiers.");
}

function validateCountReconciliation(assessment, exportViews) {
  const verification = assessment.recordCountVerification;
  assert.ok(verification && typeof verification === "object" && !Array.isArray(verification), "assessment.recordCountVerification is required.");
  assert.match(verification.method ?? "", /hits before and after/i);
  assert.ok(Array.isArray(verification.views), "assessment.recordCountVerification.views must be an array.");
  assert.equal(verification.views.length, EXPECTED_VIEWS.length);

  for (const [index, claimed] of verification.views.entries()) {
    const observed = exportViews[index];
    const expected = EXPECTED_VIEWS[index];
    assert.equal(claimed.objectName, expected.objectName);
    assert.equal(claimed.claimedRecordCount, observed.featuresRetrieved, `${expected.objectName} claimed count must match the export profile count.`);
    assert.equal(claimed.hitsBefore, claimed.claimedRecordCount);
    assert.equal(claimed.hitsAfter, claimed.claimedRecordCount);
    assert.equal(claimed.featuresRetrieved, claimed.claimedRecordCount);
    assert.equal(claimed.distinctObjectIds, claimed.claimedRecordCount);
    assert.equal(claimed.duplicateObjectIds, 0);
    assert.equal(claimed.missingRecords, 0);
    assert.equal(claimed.reconciled, true);
  }
}

function validateExportProfile(profile) {
  assert.ok(profile && typeof profile === "object" && !Array.isArray(profile), "exportProfile is required.");
  assert.equal(profile.evidenceRoot, EVIDENCE_ROOT);
  exactTimestamp(profile.profiledAt, "exportProfile.profiledAt");
  assert.equal(profile.profiledAt, "2026-09-01T15:12:17Z");
  assert.match(profile.evidenceHandling ?? "", /read-only/i);
  assert.match(profile.evidenceHandling ?? "", /no data pages are copied/i);
  assert.deepEqual(profile.catalogueDistribution, {
    customDownloadAccessMethod: "indirect access",
    customDownloadDirectUrlPresent: false,
    wmsPresent: true,
    kmlGroundOverlayPresent: true,
  });
  assert.deepEqual(profile.wfs, {
    version: "2.0.0",
    outputFormat: "application/json",
    srsName: "EPSG:3005",
    pageSize: 10000,
    paging: "startIndex",
    sortBy: "OBJECTID",
    oneFeaturePositiveControlPerView: true,
  });

  const readWindow = profile.readWindow;
  assert.deepEqual(readWindow, {
    startedAt: "2026-09-01T15:04:41Z",
    finishedAt: "2026-09-01T15:12:17Z",
    totalPages: 31,
    distinctPageTimestamps: 31,
    pageTimestampRange: ["2026-09-01T15:04:49.139Z", "2026-09-01T15:10:41.229Z"],
  });
  assert.equal(profile.manifest.path, "MANIFEST.sha256");
  assert.match(profile.manifest.sha256, SHA256);
  assert.equal(profile.manifest.sha256, "e6b89d4872d3bed6dd3d8442123210ca4eff5f8bfefe61e839f891482f9869b4");
  assert.equal(profile.manifest.listedFilesVerified, 10);
  assert.equal(profile.manifest.listedFilesFailed, 0);
  assert.deepEqual(profile.reports, EXPECTED_REPORTS);
  for (const [name, digest] of Object.entries(profile.reports)) assert.match(digest, SHA256, `${name} digest must be SHA-256.`);

  assert.ok(Array.isArray(profile.views), "exportProfile.views must be an array.");
  assert.equal(profile.views.length, EXPECTED_VIEWS.length);
  for (const [index, view] of profile.views.entries()) {
    const expected = EXPECTED_VIEWS[index];
    assert.equal(view.objectName, expected.objectName);
    assert.equal(view.endpoint, expected.endpoint);
    assert.equal(view.pages, expected.pages);
    assert.equal(view.bytes, expected.bytes);
    assert.equal(view.featuresRetrieved, expected.recordCount);
    assert.equal(view.distinctObjectIds, expected.recordCount);
    assert.equal(view.duplicateObjectIds, 0);
    assert.equal(view.missingRecords, 0);
    assert.deepEqual(view.hitsBefore, { count: expected.recordCount, timestamp: expected.hitsBeforeTimestamp });
    assert.deepEqual(view.hitsAfter, { count: expected.recordCount, timestamp: expected.hitsAfterTimestamp });
    assert.equal(view.distinctPageTimestamps, expected.distinctPageTimestamps);
    assert.deepEqual(view.pageTimestampRange, expected.pageTimestampRange);
    assert.deepEqual(view.schema, expected.schema);
    assert.equal(view.attributePopulation.attributesObservedNonNull, expected.attributesObservedNonNull);
    assert.match(view.attributePopulation.limitation ?? "", /does not independently prove/i);
    assert.deepEqual(view.geometryTypes, expected.geometryTypes);
    assert.deepEqual(view.nullGeometryLifecycle, expected.nullGeometryLifecycle);
    assert.equal(Object.values(view.nullGeometryLifecycle).reduce((sum, count) => sum + count, 0), view.geometryTypes.null);
    assert.deepEqual(view.extentEpsg3005, expected.extentEpsg3005);
    assert.equal(view.adminDistrictCount, 23);
  }
  assert.equal(profile.views.reduce((sum, view) => sum + view.pages, 0), readWindow.totalPages);
  assert.equal(profile.views.reduce((sum, view) => sum + view.distinctPageTimestamps, 0), readWindow.distinctPageTimestamps);
  return profile.views;
}

export function validateBcForestTenureFoiResponse(record) {
  assert.ok(record && typeof record === "object" && !Array.isArray(record), "The FOI response record must be an object.");
  assert.equal(record.schemaVersion, SCHEMA);
  assert.equal(record.status, STATUS);
  assert.equal(record.recordedOn, "2026-08-27");

  const request = record.request;
  assert.ok(request && typeof request === "object" && !Array.isArray(request), "The FOI request section is required.");
  assert.equal(request.reference, "FOR-2026-056834");
  assert.deepEqual(request.requestedViews, EXPECTED_DATASETS.map(({ objectName }) => objectName));
  requiredString(request.requestedOutcome, "request.requestedOutcome");
  assert.equal(request.requestedOutcomeIsSummary, true);
  assert.match(request.requestedOutcomeBasis ?? "", /separate per-view timestamps/i);
  exactTimestamp(request.responseReceivedAt, "request.responseReceivedAt");
  assert.equal(request.responseReceivedAt, "2026-08-27T09:00:10-07:00");
  exactDate(request.responseDeadline, "request.responseDeadline");
  assert.equal(request.responseDeadline, "2026-09-01");
  assert.match(request.responseSummary ?? "", /publicly available/i);
  assert.match(request.responseSummary ?? "", /withdraw/i);
  assert.deepEqual(request.responseProvenance, {
    channel: "official email",
    senderDomain: "gov.bc.ca",
    subject: "FOI Request FOR-2026-056834 - Withdrawal request",
  });
  requiredBoolean(request.outboundReplySent, "request.outboundReplySent");
  if (request.outboundReplySent) {
    exactTimestamp(request.outboundReplySentAt, "request.outboundReplySentAt");
  } else {
    assert.equal(request.outboundReplySentAt, undefined, "An unsent reply must not carry a send date.");
  }
  assert.equal(request.outboundReplySent, true, "The verified owner reply must remain recorded as sent.");
  assert.equal(request.outboundReplySentAt, "2026-09-01T08:21:13-07:00");
  assert.deepEqual(request.outboundReplyProvenance, {
    channel: "official email",
    recipientDomain: "gov.bc.ca",
    subject: "Re: FOI Request FOR-2026-056834 - Withdrawal request",
    verificationBasis: "Read-only mailbox readback of the sent message's Date header, recipient, subject and body.",
  });
  assert.match(request.outboundReplySummary ?? "", /complete provincial layers/i);
  assert.match(request.outboundReplySummary ?? "", /not as a continued request/i);
  assert.match(request.outboundReplySummary ?? "", /did not explicitly authorize withdrawal/i);
  assert.equal(request.outboundReplyContinuesRequest, false);
  assert.equal(request.outboundReplyExplicitlyAuthorizesWithdrawal, false);
  noMailboxIdentifiers(record);

  const catalogue = record.catalogueReadback;
  assert.equal(catalogue.retrievedAt, "2026-08-27T17:00:00Z");
  assert.equal(catalogue.api, CATALOGUE_API);
  assert.ok(Array.isArray(catalogue.datasets));
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
        objectName: dataset.objectName,
      },
      expected,
      `${dataset.sourceId} catalogue identity drifted.`,
    );
    assert.equal(dataset.licence, LICENCE_TITLE);
    assert.equal(dataset.licenceUrl, LICENCE_URL);
    assert.deepEqual(dataset.resources, EXPECTED_RESOURCES);
  }

  const exportViews = validateExportProfile(record.exportProfile);
  const assessment = record.assessment;
  assert.equal(assessment.officialProgramAreaSaysPubliclyAvailable, true);
  assert.equal(assessment.exactCatalogueLicenceVerified, true);
  assert.equal(assessment.directFullProvincePackagePresent, false);
  assert.equal(assessment.completeRecordCountVerified, true);
  requiredBoolean(assessment.coherentTimestampedExtractVerified, "assessment.coherentTimestampedExtractVerified");
  assert.equal(assessment.stableReadWindowVerified, true);
  assert.equal(assessment.archiveOrProductionAdmission, false);
  requiredBoolean(assessment.withdrawalRecommended, "assessment.withdrawalRecommended");
  validateCountReconciliation(assessment, exportViews);
  assert.deepEqual(assessment.stableReadWindow, {
    startedAt: record.exportProfile.readWindow.startedAt,
    finishedAt: record.exportProfile.readWindow.finishedAt,
    basis: assessment.stableReadWindow.basis,
  });
  assert.match(assessment.stableReadWindow.basis ?? "", /not a one-timestamp snapshot/i);
  if (assessment.coherentTimestampedExtractVerified) {
    assert.ok(record.exportProfile.readWindow.distinctPageTimestamps <= 1, "Timestamp coherence cannot be verified when distinctPageTimestamps is greater than 1.");
  }
  if (assessment.withdrawalRecommended) {
    const verificationFields = [
      "officialProgramAreaSaysPubliclyAvailable",
      "exactCatalogueLicenceVerified",
      "directFullProvincePackagePresent",
      "completeRecordCountVerified",
      "coherentTimestampedExtractVerified",
      "stableReadWindowVerified",
    ];
    for (const field of verificationFields) assert.equal(assessment[field], true, `withdrawalRecommended requires ${field} to be true.`);
  }
  assert.match(assessment.reason ?? "", /31 distinct response timestamps/i);
  assert.match(assessment.reason ?? "", /no direct full-province package/i);
  assert.match(assessment.ownerDecision ?? "", /did not explicitly authorize withdrawal/i);
  assert.match(assessment.ownerDecision ?? "", /does not infer/i);
  assert.match(record.nextSafeStep ?? "", /await any ministry acknowledgment or closure notice/i);
  assert.match(record.nextSafeStep ?? "", /do not infer/i);
  return record;
}

export async function checkBcForestTenureFoiResponse(file = new URL("../data/bc-forest-tenure-foi-catalogue-response-2026-08-27.json", import.meta.url)) {
  return validateBcForestTenureFoiResponse(JSON.parse(await readFile(file, "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/bc-forest-tenure-foi-catalogue-response-2026-08-27.json");
  const record = await checkBcForestTenureFoiResponse(file);
  console.log(`BC FTA FOI response passed: ${record.exportProfile.views.length} public WFS views reconcile, the owner reply is verified sent, and withdrawal remains unconfirmed.`);
}
