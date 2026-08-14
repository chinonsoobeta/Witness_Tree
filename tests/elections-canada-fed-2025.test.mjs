import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateElectionsCanadaFed2025 } from "../scripts/check-elections-canada-fed-2025.mjs";

const ledger = JSON.parse(readFileSync(new URL("../data/elections-canada-fed-2025-source-ledger.json", import.meta.url), "utf8"));
const profile = JSON.parse(readFileSync(new URL("../data/elections-canada-fed-2025-profile.json", import.meta.url), "utf8"));

test("the only accepted federal boundary release is the current official 45th-election archive", () => {
  assert.deepEqual(validateElectionsCanadaFed2025(ledger, profile), { ledger, profile });
  assert.equal(ledger.source.sourceVersion, "FederalElectoralDistricts_2025_SHP.zip");
  assert.equal(profile.layer.distinctFederalDistrictCount, 343);
  assert.equal(profile.layer.featureCount, 352);
});

test("the gate fails closed on stale source, archive, edition, schema, bilingual, or geometry evidence", () => {
  assert.throws(() => validateElectionsCanadaFed2025({ ...ledger, source: { ...ledger.source, sourceUrl: "https://ftp.maps.canada.ca/pub/elections_elections/Electoral-districts_Circonscription-electorale/federal_electoral_districts_boundaries_2023/FED_CA_2023_EN-SHP.zip" } }, profile), /exact official 45th-election ZIP link/);
  assert.throws(() => validateElectionsCanadaFed2025({ ...ledger, source: { ...ledger.source, sha256: "a".repeat(64) } }, profile), /SHA-256/);
  assert.throws(() => validateElectionsCanadaFed2025({ ...ledger, source: { ...ledger.source, representationOrder: "2013" } }, profile), /current release and representation order/);
  assert.throws(() => validateElectionsCanadaFed2025(ledger, { ...profile, layer: { ...profile.layer, distinctFederalDistrictCount: 352 } }), /Feature and distinct-district/);
  assert.throws(() => validateElectionsCanadaFed2025(ledger, { ...profile, layer: { ...profile.layer, bilingualNames: { englishField: "ED_NAMEE", frenchField: "" } } }), /Bilingual-name/);
  assert.throws(() => validateElectionsCanadaFed2025(ledger, { ...profile, layer: { ...profile.layer, geometryValidation: { ...profile.layer.geometryValidation, invalidGeometryCount: 1 } } }), /Geometry-validity/);
  assert.throws(() => validateElectionsCanadaFed2025({ ...ledger, source: { ...ledger.source, productionEligible: true } }, profile), /immutable or production/);
});
