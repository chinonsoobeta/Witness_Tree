import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateNrcanHarvestProfile } from "../scripts/check-nrcan-harvest-profile.mjs";

const profile = JSON.parse(readFileSync(new URL("../data/nrcan-harvest-profile.json", import.meta.url), "utf8"));

test("checksum-bound NRCan harvest profile preserves the 1985–2022 categorical raster facts", () => {
  assert.equal(validateNrcanHarvestProfile(profile), profile);
  assert.equal(profile.raw.sha256, "c6f41dff46d91812874672edb53233dac4126952132ad6d1131ad47b11ad7aad");
  assert.deepEqual(profile.raster.valueTable.values, [0, ...Array.from({ length: 38 }, (_, index) => 1985 + index)]);
  assert.equal(profile.productionEligible, false);
});

test("harvest profile fails closed on archive, grid, class-table, and production drift", () => {
  assert.throws(() => validateNrcanHarvestProfile({ ...profile, raw: { ...profile.raw, zipIntegrity: "unknown" } }), /archive evidence/);
  assert.throws(() => validateNrcanHarvestProfile({ ...profile, raster: { ...profile.raster, pixelSizeMetres: 60 } }), /grid profile/);
  assert.throws(() => validateNrcanHarvestProfile({ ...profile, raster: { ...profile.raster, valueTable: { ...profile.raster.valueTable, values: [0, 1985] } } }), /value-table/);
  assert.throws(() => validateNrcanHarvestProfile({ ...profile, productionEligible: true }), /staging-only/);
});
