import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateBcTapPriorityDeferralBlock } from "../scripts/check-bc-tap-priority-deferral.mjs";

const record = JSON.parse(readFileSync(new URL("../data/bc-tap-priority-deferral-block.json", import.meta.url), "utf8"));

test("BC TAP priority-deferral current view is separately blocked by rights and implementation scope", () => {
  assert.equal(validateBcTapPriorityDeferralBlock(record), record);
  assert.equal(record.source.licence, "Access Only");
  assert.equal(record.admission.productionEligible, false);
});

test("BC TAP gate rejects licence substitution, current-view substitution, admission, and sent request", () => {
  assert.throws(() => validateBcTapPriorityDeferralBlock({ ...record, source: { ...record.source, licence: "Open Government Licence - British Columbia" } }), /Access Only/);
  assert.throws(() => validateBcTapPriorityDeferralBlock({ ...record, scope: { ...record.scope, notEquivalentTo: [] } }), /non-substitution/);
  assert.throws(() => validateBcTapPriorityDeferralBlock({ ...record, admission: { ...record.admission, staged: true } }), /staged/);
  assert.throws(() => validateBcTapPriorityDeferralBlock({ ...record, requestDraft: { ...record.requestDraft, status: "sent" } }), /unsent/);
});
