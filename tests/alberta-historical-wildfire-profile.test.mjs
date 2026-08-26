import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateAlbertaHistoricalWildfireProfile } from "../scripts/check-alberta-historical-wildfire-profile.mjs";

const profile = JSON.parse(readFileSync(new URL("../data/alberta-historical-wildfire-profile.json", import.meta.url), "utf8"));

test("Alberta historical-wildfire profile is checksum-bound and staging-only", () => {
  assert.equal(validateAlbertaHistoricalWildfireProfile(profile), profile);
  assert.equal(profile.raw.rowCount, 27828);
  assert.equal(profile.table.geometryKind, "none");
});

test("Alberta historical-wildfire profile fails closed on raw drift or production claims", () => {
  assert.throws(() => validateAlbertaHistoricalWildfireProfile({ ...profile, raw: { ...profile.raw, byteLength: 1 } }));
  assert.throws(() => validateAlbertaHistoricalWildfireProfile({ ...profile, productionEligible: true }));
});
