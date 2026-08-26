import assert from "node:assert/strict";
import test from "node:test";
import { validate } from "../scripts/check-bc-harvesting-authority-access.mjs";
import record from "../data/bc-harvesting-authority-access-block.json" with { type: "json" };
test("BC harvesting authorities reject mutable-service, lifecycle and promotion drift", () => {
  assert.doesNotThrow(() => validate(record));
  for (const bad of [{...record, selectedSource:{...record.selectedSource,serviceCount:1}},{...record, selectedSource:{...record.selectedSource,customDownloadUrl:"https://example.invalid/export.zip"}},{...record, operationalSemantics:{...record.operationalSemantics,restriction:"completed harvest"}},{...record, licence:{...record.licence,id:"unknown"}},{...record,productionEligible:true}]) assert.throws(() => validate(bad));
});
