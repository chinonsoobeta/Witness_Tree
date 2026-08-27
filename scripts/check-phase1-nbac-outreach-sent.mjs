import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RECORD = path.join(ROOT, "data/phase1-nbac-outreach-sent-2026-08-27.json");
const REQUEST_ID = "nrcan-nbac-agreement-and-consent";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function exactKeys(value, keys, label) {
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label} fields differ`);
}

export function validatePhase1NbacOutreachSent(record, { root = ROOT } = {}) {
  exactKeys(record, ["canonicalRowId", "claims", "delivery", "nextStep", "privacy", "requestId", "schemaVersion", "sentAt", "sourceDraft", "status"], "record");
  assert.equal(record.schemaVersion, "witness-tree/phase1-owner-outreach-sent/1");
  assert.equal(record.status, "sent-awaiting-response");
  assert.match(record.sentAt, /^2026-08-27T\d{2}:\d{2}:\d{2}Z$/);
  assert.equal(record.requestId, REQUEST_ID);
  assert.equal(record.canonicalRowId, "cwfis-historical");

  assert.deepEqual(record.delivery, {
    channel: "email",
    recipient: "cwfissa-csscifv@nrcan-rncan.gc.ca",
    recipientDomain: "nrcan-rncan.gc.ca",
    subject: "NBAC 1972–2025: agreement scope and written consent for Witness Tree / Étendue de l’accord et consentement écrit",
    language: "English / Français",
    sentLabelConfirmed: true,
  });

  assert.equal(record.sourceDraft.path, "data/partial-ledger-owner-review-outreach-package.json");
  const draftBytes = readFileSync(path.join(root, record.sourceDraft.path));
  assert.equal(sha256(draftBytes), record.sourceDraft.sha256, "source draft checksum differs");
  const draft = JSON.parse(draftBytes).requests.find(({ id }) => id === REQUEST_ID);
  assert.ok(draft, "canonical NBAC draft is missing");
  assert.equal(sha256(draft.draft.english), record.sourceDraft.englishSha256);
  assert.equal(sha256(draft.draft.french), record.sourceDraft.frenchSha256);
  assert.equal(sha256(`${draft.draft.english}\n\n---\n\n${draft.draft.french}`), record.sourceDraft.sentBodySha256);
  assert.equal(record.sourceDraft.composition, "english + two newlines + three hyphens + two newlines + french");

  assert.deepEqual(record.privacy, {
    providerMessageIdStored: false,
    providerThreadIdStored: false,
    mailboxUrlStored: false,
    senderAddressStored: false,
  });
  assert.deepEqual(record.claims, {
    agreementAccepted: false,
    writtenConsentReceived: false,
    artifactAcquired: false,
    ledgerCreditChanged: false,
    productionAdmission: false,
  });
  assert.ok(record.nextStep.trim());
  const recordWithoutPrivacyDeclarations = structuredClone(record);
  delete recordWithoutPrivacyDeclarations.privacy;
  assert.doesNotMatch(JSON.stringify(recordWithoutPrivacyDeclarations), /mail\.google\.com|threadId|messageId|1a0446903adc61c3/i);
  return record;
}

export function checkPhase1NbacOutreachSent(file = RECORD) {
  return validatePhase1NbacOutreachSent(JSON.parse(readFileSync(file, "utf8")));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const record = checkPhase1NbacOutreachSent();
  console.log(`NBAC outreach sent at ${record.sentAt}; written response remains pending.`);
}
