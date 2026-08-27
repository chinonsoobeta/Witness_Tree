import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase1NbacOwnerAuthorization } from "../scripts/check-phase1-nbac-owner-authorization.mjs";

const record = JSON.parse(readFileSync(new URL("../data/phase1-nbac-owner-authorization-2026-08-27.json", import.meta.url), "utf8"));
const clone = () => structuredClone(record);

test("NBAC owner authorization binds the current official catalogue and terms", () => {
  assert.doesNotThrow(() => validatePhase1NbacOwnerAuthorization(record));
  assert.equal(record.source.officialCatalogue.uuid, "537a1fd0-698e-4a7b-85a1-e02581ae78b2");
  assert.equal(record.currentTerms.metadata.timestamp, "2026-06-17T16:42:35.514Z");
  assert.equal(record.currentTerms.metadata.publicationDate, "2026-05-13");
  assert.equal(record.currentTerms.metadata.creationDate, "2026-05-13");
  assert.equal(record.currentTerms.licence.url, "https://open.canada.ca/en/open-government-licence-canada");
  assert.match(record.currentTerms.citation, /^Canadian Forest Service\. National Burned Area Composite \(NBAC\)\./);
  assert.match(record.currentTerms.noEndorsement, /not imply.*endorsement/i);
});

test("authorization requires every requested owner decision and does not wait for permission", () => {
  for (const key of ["acquisitionApproved", "ingestionApproved", "releaseApproved", "productionAdmissionApproved", "publicationApproved"]) {
    const candidate = clone();
    candidate.decisions[key] = false;
    assert.throws(() => validatePhase1NbacOwnerAuthorization(candidate));
  }
  const candidate = clone();
  candidate.decisions.waitForAdditionalPermission = true;
  assert.throws(() => validatePhase1NbacOwnerAuthorization(candidate));
});

test("owner approval cannot fabricate download, profile, archive, admission, or publication evidence", () => {
  for (const key of Object.keys(record.evidenceState)) {
    const candidate = clone();
    candidate.evidenceState[key] = true;
    assert.throws(() => validatePhase1NbacOwnerAuthorization(candidate));
  }
  const candidate = clone();
  candidate.source.byteLength = 123;
  assert.throws(() => validatePhase1NbacOwnerAuthorization(candidate));
});

test("current terms and exact source bindings are fail-closed", () => {
  for (const mutate of [
    (candidate) => { candidate.source.officialCatalogue.uuid = "wrong"; },
    (candidate) => { candidate.source.artifactUrl = "https://example.invalid/NBAC.zip"; },
    (candidate) => { candidate.source.metadataUrl = "https://example.invalid/metadata.pdf"; },
    (candidate) => { candidate.currentTerms.licence.url = "https://example.invalid/licence"; },
    (candidate) => { candidate.currentTerms.citation = "Changed citation"; },
    (candidate) => { candidate.currentTerms.noEndorsement = "Endorsement implied"; },
  ]) {
    const candidate = clone();
    mutate(candidate);
    assert.throws(() => validatePhase1NbacOwnerAuthorization(candidate));
  }
});

test("the earlier outreach-sent evidence remains historical with false claims", () => {
  assert.equal(record.historicalEvidence.remainsHistorical, true);
  assert.equal(record.historicalEvidence.claimsRemainFalse, true);
  const historical = JSON.parse(readFileSync(new URL("../data/phase1-nbac-outreach-sent-2026-08-27.json", import.meta.url), "utf8"));
  assert.equal(historical.status, "sent-awaiting-response");
  assert.deepEqual(historical.claims, {
    agreementAccepted: false,
    writtenConsentReceived: false,
    artifactAcquired: false,
    ledgerCreditChanged: false,
    productionAdmission: false,
  });
});
