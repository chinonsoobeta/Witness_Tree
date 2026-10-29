import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkBcTimberFacilities, validateFacilitiesAccessBlock, validateFacilitiesDecision } from "../scripts/check-bc-timber-facilities-access.mjs";

const decision = JSON.parse(readFileSync(new URL("../data/plan-scope-decision-2026-10-28-bc-facilities.json", import.meta.url), "utf8"));
const block = JSON.parse(readFileSync(new URL("../data/bc-timber-facilities-access-block.json", import.meta.url), "utf8"));

test("the BC facilities decision is recorded and the source stays blocked", async () => {
  const result = await checkBcTimberFacilities();
  assert.equal(result.decision.owner, "Chinonso Obeta");
  assert.ok(result.decision.ownerWords.includes("I approve the plan amendment for #9."));
  assert.equal(result.decision.ownerConfirmedInterpretation, true);
  assert.equal(result.decision.ownerConfirmation.words, "I did mean plan amendment for #9 should actually be for #10.");
  assert.equal(result.decision.ownerConfirmation.date, "2026-10-28");
  assert.equal(result.block.status, "blocked");
  assert.equal(result.block.rights.openLicence, false);
  assert.equal(result.block.admission.published, false);
});

test("the decision refuses widened scope or granted gates", () => {
  assert.throws(() => validateFacilitiesDecision({ ...decision, doesNotGrant: { ...decision.doesNotGrant, legalSignOff: true } }), /legalSignOff/);
  assert.throws(() => validateFacilitiesDecision({ ...decision, scope: { ...decision.scope, provinces: ["BC", "QC"] } }), /British Columbia only/);
  assert.throws(() => validateFacilitiesDecision({ ...decision, scope: { ...decision.scope, noCause: "" } }), /noCause/);
  assert.throws(() => validateFacilitiesDecision({ ...decision, planSectionsAmended: decision.planSectionsAmended.slice(0, 1) }), /1\.3 and 14\.2/);
  assert.throws(() => validateFacilitiesDecision({ ...decision, ownerWords: "I approve the plan amendment" }), /in full/);
  assert.throws(() => validateFacilitiesDecision({ ...decision, interpretation: undefined }), /interpretation/);
  assert.throws(() => validateFacilitiesDecision({ ...decision, ownerConfirmedInterpretation: undefined }), /ownerConfirmedInterpretation/);
  assert.throws(() => validateFacilitiesDecision({ ...decision, ownerConfirmation: undefined }), /confirmation/);
  assert.throws(() => validateFacilitiesDecision({ ...decision, ownerConfirmation: { ...decision.ownerConfirmation, words: "Yes" } }), /confirmation/);
});

test("the access block refuses open-licence, staging, publication or sent-request drift", () => {
  assert.throws(() => validateFacilitiesAccessBlock({ ...block, status: "admitted" }), /blocked/);
  assert.throws(() => validateFacilitiesAccessBlock({ ...block, rights: { ...block.rights, openLicence: true } }), /no open licence/);
  assert.throws(() => validateFacilitiesAccessBlock({ ...block, admission: { ...block.admission, published: true } }), /published/);
  assert.throws(() => validateFacilitiesAccessBlock({ ...block, requestDraft: { ...block.requestDraft, status: "sent" } }), /unsent/);
  assert.throws(() => validateFacilitiesAccessBlock({ ...block, ledgerEntry: { ...block.ledgerEntry, rawChecksumSha256: "0" } }), /SHA-256/);
});
