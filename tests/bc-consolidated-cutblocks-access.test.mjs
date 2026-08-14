import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateBcConsolidatedCutblocksAccess } from "../scripts/check-bc-consolidated-cutblocks-access.mjs";

const record = JSON.parse(readFileSync(new URL("../data/bc-consolidated-cutblocks-access.json", import.meta.url), "utf8"));

test("BC Consolidated Cutblocks records exact access-only source facts without acquiring the ZIP", () => {
  assert.equal(validateBcConsolidatedCutblocksAccess(record), record);
  assert.equal(record.resource.head.contentLengthBytes, 555382445);
  assert.equal(record.blocker.rawDownloadPerformed, false);
  assert.equal(record.blocker.productionEligible, false);
});

test("BC Consolidated Cutblocks fails closed if access-only evidence is treated as staging or production", () => {
  assert.throws(() => validateBcConsolidatedCutblocksAccess({ ...record, catalogue: { ...record.catalogue, licenceTitle: "Open Government Licence - British Columbia" } }), /Access Only/);
  assert.throws(() => validateBcConsolidatedCutblocksAccess({ ...record, blocker: { ...record.blocker, rawDownloadPerformed: true } }), /must not claim acquisition/);
  assert.throws(() => validateBcConsolidatedCutblocksAccess({ ...record, blocker: { ...record.blocker, productionEligible: true } }), /must not claim acquisition/);
});
