import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateNrcanWildfireProfile } from "../scripts/check-nrcan-wildfire-profile.mjs";

const profile = JSON.parse(readFileSync(new URL("../data/nrcan-wildfire-profile.json", import.meta.url), "utf8"));

test("checksum-bound NRCan wildfire profile preserves the 1985–2022 categorical raster facts", () => {
  assert.equal(validateNrcanWildfireProfile(profile), profile);
  assert.equal(profile.raw.sha256, "725f3b582c87cb7c6f3fd397a523fba6621718ac59c68dc904cd1d849a9160c9");
  assert.deepEqual(profile.raster.valueTable.values, [0, ...Array.from({ length: 38 }, (_, index) => 1985 + index)]);
  assert.equal(profile.productionEligible, false);
});

test("wildfire profile fails closed on archive, grid, class-table, and production drift", () => {
  assert.throws(() => validateNrcanWildfireProfile({ ...profile, raw: { ...profile.raw, zipIntegrity: "unknown" } }), /archive evidence/);
  assert.throws(() => validateNrcanWildfireProfile({ ...profile, raster: { ...profile.raster, pixelSizeMetres: 60 } }), /raster grid/);
  assert.throws(() => validateNrcanWildfireProfile({ ...profile, raster: { ...profile.raster, valueTable: { ...profile.raster.valueTable, values: [0, 1985] } } }), /value-table/);
  assert.throws(() => validateNrcanWildfireProfile({ ...profile, productionEligible: true }), /staging-only/);
});
