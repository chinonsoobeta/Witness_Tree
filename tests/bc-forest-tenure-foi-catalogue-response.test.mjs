import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateBcForestTenureFoiResponse } from "../scripts/check-bc-forest-tenure-foi-response.mjs";

const record = JSON.parse(readFileSync(new URL("../data/bc-forest-tenure-foi-catalogue-response-2026-08-27.json", import.meta.url), "utf8"));

test("BC FOI response preserves the observed complete WFS profile without claiming timestamp coherence", () => {
  assert.equal(validateBcForestTenureFoiResponse(record), record);
  assert.equal(record.assessment.completeRecordCountVerified, true);
  assert.equal(record.assessment.stableReadWindowVerified, true);
  assert.equal(record.assessment.directFullProvincePackagePresent, false);
  assert.equal(record.assessment.coherentTimestampedExtractVerified, false);
  assert.equal(record.exportProfile.readWindow.distinctPageTimestamps, 31);
  assert.deepEqual(
    record.exportProfile.views.map(({ featuresRetrieved }) => featuresRetrieved),
    [222618, 71876],
  );
  assert.deepEqual(record.exportProfile.views[1].nullGeometryLifecycle, { RETIRED: 21, ACTIVE: 4 });
  assert.equal(record.request.outboundReplySent, true);
  assert.equal(record.request.outboundReplySentOn, "2026-09-01");
  assert.equal(record.request.outboundReplySentAt, undefined);
  assert.equal(record.request.outboundReplyContinuesRequest, false);
  assert.equal(record.request.withdrawalRequestedByRequester, true);
  assert.equal(record.request.withdrawalConfirmedByMinistry, false);
});

test("BC FOI response rejects identity, provenance, and evidence drift", () => {
  const cases = [
    ["status", { ...record, status: "resolved" }],
    ["request summary", { ...record, request: { ...record.request, requestedOutcomeIsSummary: false } }],
    ["response provenance", { ...record, request: { ...record.request, responseProvenance: { ...record.request.responseProvenance, senderDomain: "example.invalid" } } }],
    ["outbound provenance", { ...record, request: { ...record.request, outboundReplyProvenance: { ...record.request.outboundReplyProvenance, recipientDomain: "example.invalid" } } }],
    ["catalogue identity", { ...record, catalogueReadback: { ...record.catalogueReadback, datasets: [{ ...record.catalogueReadback.datasets[0], objectName: "WRONG" }, record.catalogueReadback.datasets[1]] } }],
    ["resource set", { ...record, catalogueReadback: { ...record.catalogueReadback, datasets: [{ ...record.catalogueReadback.datasets[0], resources: ["direct-download"] }, record.catalogueReadback.datasets[1]] } }],
    ["manifest digest", { ...record, exportProfile: { ...record.exportProfile, manifest: { ...record.exportProfile.manifest, sha256: "0".repeat(64) } } }],
    ["null lifecycle", { ...record, exportProfile: { ...record.exportProfile, views: [record.exportProfile.views[0], { ...record.exportProfile.views[1], nullGeometryLifecycle: { RETIRED: 25, ACTIVE: 0 } }] } }],
  ];
  for (const [label, candidate] of cases) {
    assert.throws(() => validateBcForestTenureFoiResponse(candidate), undefined, label);
  }
});

test("BC FOI response rejects a coherence claim across multiple page timestamps", () => {
  const candidate = structuredClone(record);
  candidate.assessment.coherentTimestampedExtractVerified = true;
  assert.throws(
    () => validateBcForestTenureFoiResponse(candidate),
    /distinctPageTimestamps is greater than 1/,
  );
});

test("BC FOI response rejects a claimed record count that differs from the export profile", () => {
  const candidate = structuredClone(record);
  candidate.assessment.recordCountVerification.views[0].claimedRecordCount += 1;
  assert.throws(
    () => validateBcForestTenureFoiResponse(candidate),
    /claimed count must match the export profile count/,
  );
});

test("BC FOI response rejects withdrawal while any verification remains false", () => {
  const candidate = structuredClone(record);
  candidate.assessment.withdrawalRecommended = true;
  assert.throws(
    () => validateBcForestTenureFoiResponse(candidate),
    /withdrawalRecommended requires directFullProvincePackagePresent to be true/,
  );
});

test("BC FOI response requires the owner-stated send date and rejects mailbox identifiers", () => {
  const missingDate = structuredClone(record);
  delete missingDate.request.outboundReplySentOn;
  assert.throws(() => validateBcForestTenureFoiResponse(missingDate), /outboundReplySentOn|send date/i);

  const wrongDate = structuredClone(record);
  wrongDate.request.outboundReplySentOn = "2026-09-02";
  assert.throws(() => validateBcForestTenureFoiResponse(wrongDate));

  const mailboxIdentifier = structuredClone(record);
  mailboxIdentifier.request.message_id = "must-not-be-retained";
  assert.throws(() => validateBcForestTenureFoiResponse(mailboxIdentifier), /mailbox message or thread identifiers/i);
});

test("BC FOI response refuses a send time nobody observed", () => {
  // No mailbox was read. A clock-precise send time could only have been invented,
  // and pinning one in the gate would promote the invention to a required fact.
  const invented = structuredClone(record);
  invented.request.outboundReplySentAt = "2026-09-01T08:21:13-07:00";
  assert.throws(() => validateBcForestTenureFoiResponse(invented), /send time was never observed/i);
});

test("BC FOI response separates the requester's withdrawal from ministry closure", () => {
  const unconfirmed = structuredClone(record);
  unconfirmed.request.withdrawalConfirmedByMinistry = true;
  assert.throws(() => validateBcForestTenureFoiResponse(unconfirmed), /confirmation date/i);

  const noChannel = structuredClone(record);
  noChannel.request.withdrawalConfirmedByMinistry = true;
  noChannel.request.withdrawalConfirmedOn = "2026-09-02";
  assert.throws(() => validateBcForestTenureFoiResponse(noChannel), /channel/i);

  const claimsClosure = structuredClone(record);
  claimsClosure.status = `${record.status}-withdrawn`;
  assert.throws(() => validateBcForestTenureFoiResponse(claimsClosure), /must not claim closure/i);
});
