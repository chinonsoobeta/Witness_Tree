import assert from "node:assert/strict";
import test from "node:test";
import { validate } from "../scripts/check-sopfeu-wildfire-access.mjs";
import record from "../data/sopfeu-wildfire-access-block.json" with { type: "json" };
test("SOPFEU rejects fabricated rights, snapshots and promotion", () => {
  assert.doesNotThrow(() => validate(record));
  for (const bad of [{...record,current:{...record.current,publishedSnapshotEndpoint:"https://example.invalid/data.zip"}},{...record,historical:{...record.historical,sopfeuHistoricalArtifact:"https://example.invalid/history.zip"}},{...record,terms:{...record.terms,result:"Open data"}},{...record,permissionRequest:{...record.permissionRequest,fr:""}},{...record,productionEligible:true}]) assert.throws(() => validate(bad));
});
