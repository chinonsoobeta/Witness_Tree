import assert from "node:assert/strict";
import test from "node:test";
import { validate } from "../scripts/check-ontario-fri-term2-access.mjs";
import record from "../data/ontario-fri-term2-access-block.json" with { type: "json" };
test("Ontario FRI rejects fabricated bulk access, settled rights and promotion", () => {
  assert.doesNotThrow(() => validate(record));
  for (const bad of [{...record,catalogue:{...record.catalogue,resourceCount:3}},{...record,access:{...record.access,directStableArtifact:true}},{...record,rights:{...record.rights,status:"settled"}},{...record,accessRequestDraft:"send it"},{...record,productionEligible:true}]) assert.throws(() => validate(bad));
});
