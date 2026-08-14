import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateBcBecSnapshotBlock } from "../scripts/check-bc-bec-snapshot.mjs";

const record = JSON.parse(readFileSync(new URL("../data/bc-bec-snapshot-block.json", import.meta.url), "utf8"));

test("BC BEC v13.1 remains an incomplete, unversioned-service snapshot block", () => {
  assert.equal(validateBcBecSnapshotBlock(record), record);
  assert.equal(record.source.authoritativeFeatureCount, 17870);
  assert.equal(record.singleRequestObservation.returnedFeatureCount, 10000);
  assert.equal(record.admission.productionEligible, false);
});

test("BC BEC gate rejects fabricated completeness, safe paging, cross-layer substitution, and admission", () => {
  assert.throws(() => validateBcBecSnapshotBlock({ ...record, status: "candidate" }), /blocked/);
  assert.throws(() => validateBcBecSnapshotBlock({ ...record, singleRequestObservation: { ...record.singleRequestObservation, returnedFeatureCount: 17870 } }), /incomplete/);
  assert.throws(() => validateBcBecSnapshotBlock({ ...record, serviceSemantics: { ...record.serviceSemantics, pagingIsTransactionSafe: true } }), /Unsafe/);
  assert.throws(() => validateBcBecSnapshotBlock({ ...record, scope: { ...record.scope, notEquivalentTo: [] } }), /distinct/);
  assert.throws(() => validateBcBecSnapshotBlock({ ...record, admission: { ...record.admission, staged: true } }), /staged/);
  assert.throws(() => validateBcBecSnapshotBlock({ ...record, requestDraft: { ...record.requestDraft, status: "sent" } }), /unsent/);
});
