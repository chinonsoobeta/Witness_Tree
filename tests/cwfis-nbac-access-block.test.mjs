import assert from "node:assert/strict";
import test from "node:test";
import { validate } from "../scripts/check-cwfis-nbac-access-block.mjs";
import record from "../data/cwfis-nbac-access-block.json" with { type: "json" };

test("CWFIS NBAC rejects fabricated rights, snapshots, and promotion", () => {
  assert.doesNotThrow(() => validate(record));
  for (const bad of [
    { ...record, licenceFinding: { ...record.licenceFinding, type: "Open data" } },
    { ...record, scope: { ...record.scope, publishedArtifactUrl: "https://example.invalid/NBAC.zip" } },
    { ...record, permissionRequest: { ...record.permissionRequest, fr: "" } },
    { ...record, productionEligible: true }
  ]) assert.throws(() => validate(bad));
});
