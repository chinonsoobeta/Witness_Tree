import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateQcOriginalCurrentInventory } from "../scripts/check-qc-original-current-inventory.mjs";

const profile = JSON.parse(readFileSync(new URL("../data/qc-original-current-inventory-profile.json", import.meta.url), "utf8"));

test("Québec original/current inventory remains checksum-bound local staging evidence", () => {
  assert.equal(validateQcOriginalCurrentInventory(profile), profile);
  assert.equal(profile.rawArchive.byteLength, 11244667626);
  assert.equal(profile.spatialLayers.reduce((sum, layer) => sum + layer.featureCount, 0), 16774124);
  assert.equal(profile.geocodeLinkedTables.every((table) => table.nullOrBlankGeocodeCount === 0), true);
});

test("Québec original/current profile fails closed for source conflation, checksum drift, geometry failure, or production admission", () => {
  const conflated = structuredClone(profile); conflated.sourceDistinction = "current ecoforest";
  assert.throws(() => validateQcOriginalCurrentInventory(conflated), /distinguish/i);
  const checksum = structuredClone(profile); checksum.rawArchive.sha256 = "0".repeat(64);
  assert.throws(() => validateQcOriginalCurrentInventory(checksum), /raw archive/i);
  const geometry = structuredClone(profile); geometry.spatialLayers[0].geometryValidation.invalidGeometryCount = 1;
  assert.throws(() => validateQcOriginalCurrentInventory(geometry), /geometry validation/i);
  const production = structuredClone(profile); production.productionEligible = true;
  assert.throws(() => validateQcOriginalCurrentInventory(production), /cannot imply/i);
});
