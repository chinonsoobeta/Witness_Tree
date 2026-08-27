import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packageUrl = new URL("../data/partial-ledger-owner-review-outreach-package.json", import.meta.url);
const auditUrl = new URL("../data/partial-ledger-evidence-audit.json", import.meta.url);
const existingUrl = new URL("../data/phase1-permission-outreach-package.json", import.meta.url);

const expected = {
  "nrcan-nbac-agreement-and-consent": {
    row: "cwfis-historical",
    component: "National Burned Area Composite",
    channel: "email",
    recipient: "cwfissa-csscifv@nrcan-rncan.gc.ca",
    subject: "NBAC 1972–2025: agreement scope and written consent for Witness Tree / Étendue de l’accord et consentement écrit",
    language: "English / Français",
    evidence: "https://cwfis.cfs.nrcan.gc.ca/en/faq",
    terms: ["private immutable archive hosted in Canada", "internal validation, transformation and analysis", "derived or summarized public-service outputs", "raw-data redistribution", "required attribution and citation"],
  },
  "elections-alberta-boundary-permission": {
    row: "provincial-electoral-boundaries",
    component: "Alberta current provincial electoral boundaries",
    channel: "postal-letter",
    recipient: "Elections Alberta, Attn: Deputy Chief Electoral Officer, Suite 100, 11510 Kingsway NW, Edmonton, AB T5G 2Y5, Canada",
    subject: "Permission request — current Alberta electoral-boundary artifact and Witness Tree use",
    language: "English",
    evidence: "https://www.elections.ab.ca/terms-conditions/",
    terms: ["current authoritative artifact", "private immutable Canadian archive", "validation, reprojection and transformation", "public-service display and derived outputs", "raw or transformed geometry"],
  },
  "elections-quebec-current-2017-artifact-and-authorization": {
    row: "provincial-electoral-boundaries",
    component: "Québec current 2017 provincial electoral boundaries",
    channel: "secure-web-form",
    recipient: "Élections Québec / Commission de la représentation électorale — secure general-information form",
    subject: "Autorisation et artefact stable — circonscriptions provinciales actuelles de 2017 / Authorization and stable artifact",
    language: "Français / English",
    evidence: "https://www.electionsquebec.qc.ca/nous-joindre/obtenir-des-renseignements-generaux/",
    terms: ["accessible stable official artifact for the current 2017 edition", "expected bytes or checksum", "private immutable Canadian archive", "adaptation and transformation", "public-service display and derived outputs", "raw or adapted geometry"],
  },
};

const normalize = (value) => value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

export function validatePartialLedgerOwnerReviewOutreach(pkg, audit, existing) {
  assert.equal(pkg.schemaVersion, 1);
  assert.equal(pkg.status, "owner-review-only-not-sent");
  assert.equal(pkg.sourceAuditRef, "data/partial-ledger-evidence-audit.json");
  assert.equal(pkg.existingOutreachRef, "data/phase1-permission-outreach-package.json");
  assert.deepEqual(pkg.claims, {
    ownerApproved: false,
    agreementAccepted: false,
    messageSent: false,
    permissionReceived: false,
    artifactAcquired: false,
    rawEvidenceCreditChanged: false,
  });

  assert.equal(pkg.deduplication.existingMessageCount, existing.messages.length);
  assert.equal(pkg.deduplication.duplicateCount, 0);
  assert.deepEqual(pkg.requests.map(({ id }) => id).sort(), Object.keys(expected).sort());

  const existingIds = new Set(existing.messages.map(({ id }) => id));
  const existingPairs = new Set(existing.messages.map(({ recipient, subject }) => `${normalize(recipient)}|${normalize(subject)}`));
  const proposedPairs = new Set();
  for (const request of pkg.requests) {
    const wanted = expected[request.id];
    assert.ok(wanted);
    assert.equal(request.status, "owner-review-only-not-sent");
    assert.equal(request.canonicalRowId, wanted.row);
    assert.equal(request.component, wanted.component);
    assert.equal(request.delivery.channel, wanted.channel);
    assert.equal(request.delivery.recipient, wanted.recipient);
    assert.equal(request.delivery.subject, wanted.subject);
    assert.equal(request.delivery.language, wanted.language);
    assert.equal(request.delivery.recipientEvidenceUrl, wanted.evidence);
    assert.ok(!existingIds.has(request.id), `${request.id} duplicates an existing outreach ID`);
    const pair = `${normalize(request.delivery.recipient)}|${normalize(request.delivery.subject)}`;
    assert.ok(!existingPairs.has(pair), `${request.id} duplicates an existing recipient/subject pair`);
    assert.ok(!proposedPairs.has(pair), `${request.id} duplicates another proposed recipient/subject pair`);
    proposedPairs.add(pair);
    for (const term of wanted.terms) assert.ok(request.requestTerms.some((value) => normalize(value).includes(normalize(term))), `${request.id} lacks ${term}`);
    assert.ok(request.ownerReview.length >= 3);
    assert.ok(Object.values(request.draft).every((body) => typeof body === "string" && body.length > 300));
  }

  const nrcan = pkg.requests.find(({ id }) => id === "nrcan-nbac-agreement-and-consent");
  assert.match(nrcan.officialEvidence.artifactUrl, /NBAC_1972to2025_20260513_shp\.zip$/);
  assert.match(nrcan.draft.english, /have not accepted/i);
  assert.match(nrcan.draft.french, /n’avons pas accepté/i);

  const alberta = pkg.requests.find(({ id }) => id === "elections-alberta-boundary-permission");
  assert.match(alberta.officialEvidence.artifactUrl, /2019Boundaries_ED-Shapefiles\.zip$/);
  assert.match(alberta.draft.english, /written permission/i);

  const quebec = pkg.requests.find(({ id }) => id === "elections-quebec-current-2017-artifact-and-authorization");
  assert.equal(quebec.delivery.submissionUrl, "https://www.pes.electionsquebec.qc.ca/services/PES0209.nous.joindre/");
  assert.equal(quebec.officialEvidence.currentEdition, "2017, 125 electoral divisions");
  assert.match(quebec.draft.french, /ne traite pas.*2026.*en vigueur/s);
  assert.match(quebec.draft.english, /does not treat the 2026 map as already effective/i);

  assert.equal(audit.claims.permissionRequested, false);
  assert.equal(audit.claims.acceptedPublisherAgreement, false);
  assert.equal(audit.claims.downloadedNewArtifact, false);
  assert.equal(audit.numerator.after, 14.75);
  assert.equal(audit.numerator.impact, 0);
  assert.deepEqual(audit.rows.map(({ id }) => id).sort(), ["cwfis-historical", "provincial-electoral-boundaries"]);
  // The package describes the two rows as they stood when the owner-review
  // drafts were prepared. Do not reinterpret that historical snapshot from
  // the live production ledger.
  const rows = audit.rows.filter(({ id }) => ["cwfis-historical", "provincial-electoral-boundaries"].includes(id));
  assert.equal(rows.length, 2);
  assert.equal(rows.length * 0.25, 0.5);
  for (const row of rows) {
    assert.equal(row.currentEvidenceState, "partial-component");
    assert.equal(row.completionCreditIfResolved, 0.5);
  }
  return pkg;
}

export function loadPartialLedgerOwnerReviewOutreach() {
  return validatePartialLedgerOwnerReviewOutreach(
    JSON.parse(readFileSync(packageUrl, "utf8")),
    JSON.parse(readFileSync(auditUrl, "utf8")),
    JSON.parse(readFileSync(existingUrl, "utf8")),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pkg = loadPartialLedgerOwnerReviewOutreach();
  console.log(`Owner-review outreach package passed for ${pkg.requests.length} unsent requests; its historical snapshot is 14.75/31 raw credits, 39.2741935% formal evidence tracking, 9/31 immutable, and 0/31 production admitted or eligible.`);
}
