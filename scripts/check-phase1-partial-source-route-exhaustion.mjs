import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const recordUrl = new URL("../data/phase1-partial-source-route-exhaustion.json", import.meta.url);
const ledgerUrl = new URL("../data/phase1-production-source-ledger.json", import.meta.url);

const read = (url) => JSON.parse(readFileSync(url, "utf8"));
const expectedRows = ["cwfis-historical", "provincial-electoral-boundaries"];
const expectedCounts = {
  "remote-verified-archived-profiled": 7,
  "local-verified-profiled": 9,
  "partial-component": 2,
  "access-blocked": 13,
};

export function validatePhase1PartialSourceRouteExhaustion(record, ledger) {
  assert.equal(record.schemaVersion, 1);
  assert.equal(record.status, "official-route-exhaustion-complete-no-lawful-intended-scope-acquisition");
  assert.equal(record.authoritativeHead, "650a7da");
  assert.equal(record.reconciledAtHead, "1749b501f17b5cb55a686178232dc6ac191d3e81");
  assert.deepEqual(record.scope, expectedRows);
  assert.match(record.boundary, /read-only/i);
  assert.match(record.boundary, /No agreement.*form.*message.*download/i);

  assert.equal(record.mailbox.status, "no-matching-partial-row-replies");
  assert.equal(record.mailbox.partialRowsWithSubstantiveReply, 0);
  assert.equal(record.mailbox.partialRowsWithoutSubstantiveReply, 2);
  assert.equal(record.mailbox.messageIdsRetained, false);
  assert.equal(record.mailbox.attachmentsRead, false);
  assert.equal(record.mailbox.externalStateChanged, false);
  assert.ok(record.mailbox.searches.length >= 4);

  const partialEntries = ledger.entries.filter(({ id }) => expectedRows.includes(id));
  assert.deepEqual(partialEntries.map(({ id }) => id), expectedRows);
  assert.ok(partialEntries.every(({ evidenceState, productionEligible }) => evidenceState === "partial-component" && productionEligible === false));

  assert.ok(Array.isArray(record.routes) && record.routes.length >= 8);
  const routeIds = new Set(record.routes.map(({ id }) => id));
  assert.equal(routeIds.size, record.routes.length);
  for (const route of record.routes) {
    assert.ok(expectedRows.includes(route.rowId), `${route.id} must be in scope`);
    assert.equal(route.downloaded, false, `${route.id} cannot claim download`);
    assert.equal(route.sha256, null, `${route.id} cannot claim checksum`);
    assert.equal(route.profileComplete, false, `${route.id} cannot claim profile`);
    assert.equal(route.rights.lawfulForIntendedScope, false, `${route.id} cannot clear intended-scope rights`);
    assert.match(route.rights.blocker, /\S/);
    assert.match(route.nextOwnerAction, /\S/);
    if (route.head) {
      assert.ok(Number.isInteger(route.head.status));
      assert.ok(Number.isSafeInteger(route.head.contentLength) && route.head.contentLength > 0);
      assert.match(route.head.contentType, /\S/);
    }
  }

  const nbac = record.routes.find(({ id }) => id === "cwfis-nbac-dated-shapefile-release");
  assert.equal(nbac.coherentArtifact, true);
  assert.equal(nbac.head.status, 200);
  assert.equal(nbac.head.contentLength, 1257052370);
  assert.equal(nbac.rights.agreementRequired, true);
  assert.equal(nbac.rights.accessTriggersAgreement, true);
  assert.equal(nbac.rights.internalUseOnly, true);
  assert.equal(nbac.rights.transferRequiresPriorWrittenConsent, true);
  assert.match(nbac.artifactUrl, /NBAC_1972to2025_20260513_shp\.zip$/);

  const alberta = record.routes.find(({ id }) => id === "elections-alberta-current-ed-shapefile");
  assert.equal(alberta.coherentArtifact, true);
  assert.equal(alberta.head.status, 200);
  assert.equal(alberta.head.contentLength, 2852757);
  assert.equal(alberta.rights.unchangedNonCommercialReproductionAllowed, true);
  assert.equal(alberta.rights.modificationAllowed, false);
  assert.equal(alberta.rights.transformationAndPublicServicePermissionVerified, false);

  const quebec = record.routes.find(({ id }) => id === "elections-quebec-current-2017-atlas-shapefile");
  assert.equal(quebec.coherentArtifact, true);
  assert.equal(quebec.head.status, 200);
  assert.equal(quebec.head.contentLength, 30007395);
  assert.equal(quebec.rights.nonCommercialReproductionAllowedWithAttribution, true);
  assert.equal(quebec.rights.adaptationAllowed, false);
  assert.equal(quebec.rights.statisticsCanadaMaterialPresent, true);
  assert.match(quebec.artifactUrl, /\/autres\/atlas\/2017\.zip$/);

  const blockedGeoJson = record.routes.find(({ id }) => id === "elections-quebec-current-2017-direct-geojson");
  assert.equal(blockedGeoJson.head.status, 403);
  const future = record.routes.find(({ id }) => id === "elections-quebec-2026-future-edition");
  assert.equal(future.currentForThisRow, false);

  for (const row of record.rows) {
    assert.ok(expectedRows.includes(row.id));
    assert.equal(row.evidenceState, "partial-component");
    assert.equal(row.substantiveReplyCount, 0);
    assert.equal(row.lawfulAcquisitionNow, false);
    assert.equal(row.missingArtifactAcquired, false);
    assert.equal(row.permissionReceived, false);
    assert.equal(row.agreementAccepted, false);
    assert.ok(row.remainingBlockers.length >= 3);
    assert.match(row.ownerAction, /\S/);
  }

  assert.equal(record.impact.rawEvidenceNumeratorBefore, 14.25);
  assert.equal(record.impact.rawEvidenceNumeratorAfter, 14.25);
  assert.equal(record.impact.rawEvidenceDenominator, ledger.entries.length);
  assert.equal(record.impact.rawCreditDelta, 0);
  assert.equal(record.impact.formalEvidenceTrackingPercentageBefore, 38.7903226);
  assert.equal(record.impact.formalEvidenceTrackingPercentageAfter, 38.7903226);
  assert.deepEqual(record.impact.evidenceStateCounts, expectedCounts);
  assert.equal(record.impact.immutableArchiveCompleteRows, 7);
  assert.equal(record.impact.productionEligibleRows, 0);
  return record;
}

export function loadPhase1PartialSourceRouteExhaustion() {
  return validatePhase1PartialSourceRouteExhaustion(read(recordUrl), read(ledgerUrl));
}

if (process.argv[1]?.endsWith("check-phase1-partial-source-route-exhaustion.mjs")) {
  const record = loadPhase1PartialSourceRouteExhaustion();
  console.log(`Historical partial source-route exhaustion passed for ${record.scope.length} rows; its at-the-time score was ${record.impact.rawEvidenceNumeratorAfter}/${record.impact.rawEvidenceDenominator}.`);
}
