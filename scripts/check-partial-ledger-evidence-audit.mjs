import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const auditUrl = new URL("../data/partial-ledger-evidence-audit.json", import.meta.url);
const SHA256 = /^[a-f0-9]{64}$/;

export function validatePartialLedgerEvidenceAudit(audit) {
  assert.equal(audit.schemaVersion, 1);
  assert.equal(audit.status, "official-source-audit-complete-evidence-still-partial");
  assert.deepEqual(audit.baseEvidenceHeads, ["e42777e", "626a1ef"]);
  assert.equal(audit.currentRouteExhaustionRef, "data/phase1-partial-source-route-exhaustion.json");
  assert.equal(audit.currentReplyAuditRef, "data/phase1-outreach-reply-audit.json");
  assert.deepEqual(audit.claims, {
    downloadedNewArtifact: false,
    acceptedPublisherAgreement: false,
    permissionRequested: false,
    rawEvidenceCreditChanged: false,
    immutable: false,
    transformed: false,
    ingested: false,
    productionEligible: false,
  });

  // This is an as-of audit. Its row snapshots and numerator are the source of
  // truth; the live production ledger may have advanced since this record was
  // written.
  const partialRows = audit.rows;
  assert.ok(Array.isArray(partialRows));
  assert.deepEqual(partialRows.map((row) => row.id).sort(), ["cwfis-historical", "provincial-electoral-boundaries"]);
  assert.deepEqual(audit.numerator, {
    before: 14.75,
    after: 14.75,
    denominator: 31,
    impact: 0,
    formalEvidenceTrackingScoreBefore: 39.2741935,
    formalEvidenceTrackingScoreAfter: 39.2741935,
  });

  assert.deepEqual(audit.rows.map((row) => row.id).sort(), partialRows.map((row) => row.id).sort());
  for (const row of audit.rows) {
    assert.equal(row.currentEvidenceState, "partial-component");
    assert.equal(row.completionCreditIfResolved, 0.5);
    assert.ok(row.missing.length > 0);
    for (const item of row.alreadyAcquired) {
      assert.match(item.artifactSha256, SHA256);
      assert.ok(Number.isSafeInteger(item.artifactBytes) && item.artifactBytes > 0);
      assert.match(item.profileRef, /^data\//);
    }
    for (const item of row.missing) {
      assert.equal(item.downloaded, false);
      assert.equal(item.artifactBytes, null);
      assert.equal(item.artifactSha256, null);
      assert.match(item.blocker, /\S/);
    }
  }

  const fire = audit.rows.find((row) => row.id === "cwfis-historical");
  assert.equal(fire.alreadyAcquired.length, 1);
  assert.equal(fire.alreadyAcquired[0].featureCount, 48571);
  assert.equal(fire.missing.length, 1);
  assert.equal(fire.missing[0].component, "National Burned Area Composite");
  assert.match(fire.missing[0].artifactUrl, /NBAC_1972to2025_20260513_shp\.zip$/);
  assert.match(fire.missing[0].licenceState, /internal use/i);
  assert.match(fire.missing[0].licenceState, /prior written consent/i);

  const electoral = audit.rows.find((row) => row.id === "provincial-electoral-boundaries");
  assert.deepEqual(electoral.alreadyAcquired.map((item) => item.component), ["British Columbia", "Ontario"]);
  assert.deepEqual(electoral.missing.map((item) => item.component), ["Alberta", "Québec"]);
  assert.match(electoral.missing[0].licenceState, /written permission/i);
  assert.match(electoral.missing[1].currentEdition, /^2017/);
  assert.match(electoral.missing[1].futureEdition, /cannot substitute/i);

  for (const row of partialRows) assert.equal(row.currentEvidenceState, "partial-component");
  return audit;
}

export function loadPartialLedgerEvidenceAudit() {
  return validatePartialLedgerEvidenceAudit(JSON.parse(readFileSync(auditUrl, "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const audit = loadPartialLedgerEvidenceAudit();
  console.log(`Partial-ledger evidence audit passed for ${audit.rows.length} rows; numerator remains ${audit.numerator.after}/${audit.numerator.denominator}.`);
}
