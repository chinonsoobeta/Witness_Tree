import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SHA256 = /^[a-f0-9]{64}$/;
const TABLES = [
  ["pee_ori_prov", "feature", 8387062, 8387062, 33],
  ["meta_ori_prov", "feature", 8387062, 8387062, 34],
  ["essence_ori_prov", "attribute", 19113947, 6411086, 5],
  ["etage_ori_prov", "attribute", 6465021, 6411086, 8]
];
const RECEIPTS = [
  "data/qc-original-current-inventory-zip-integrity-2026-08-14.txt",
  "data/qc-original-current-inventory-geocode-tables-2026-08-14.generated.json",
  "data/qc-original-current-inventory-geometry-validity-2026-08-14.txt"
];

function requireValue(value, message) {
  if (!value) throw new Error(message);
}

export function validateQcOriginalCurrentInventory(profile) {
  if (profile?.schemaVersion !== 1 || profile.status !== "local-verified-profiled") throw new Error("Québec original/current profile must remain local verified evidence.");
  if (profile.sourceId !== "qc-original-current-inventory" || !/distinct from .*current ecoforest.*fourth-inventory/i.test(profile.sourceDistinction ?? "")) throw new Error("Profile must distinguish the original/current product from the current and fourth products.");
  const raw = profile.rawArchive;
  if (!raw || raw.byteLength !== 11244667626 || raw.sha256 !== "c10d691516569de76642dc1fc64e662f2569b5b58ab5d945b58b8b7834ba9c61" || raw.zipIntegrity !== "passed" || raw.zipMemberCount !== 1 || raw.uncompressedByteLength !== 33243570176) throw new Error("Original/current raw archive evidence drifted.");
  if (!SHA256.test(profile.extractedGeoPackage?.sha256) || profile.extractedGeoPackage.byteLength !== 33243570176 || profile.extractedGeoPackage.sqliteIntegrity !== "passed" || profile.extractedGeoPackage.crs !== "EPSG:32198") throw new Error("Extracted GeoPackage evidence is incomplete.");
  if (!profile.licence || profile.licence.id !== "cc-by-4.0" || !profile.licence.attribution || profile.retrieval?.sourceVersion !== "undeclared") throw new Error("Licence, attribution, and edition-absence evidence are required.");
  if (!Array.isArray(profile.spatialLayers) || profile.spatialLayers.length !== 2) throw new Error("Both original/current spatial layers are required.");
  for (const [name, geometryType, extent] of [["pee_ori_prov", "MultiPolygon", [-830340.25, 117964.15, 543807.64, 942382.67]], ["meta_ori_prov", "Point", [-829465.43, 118007.94, 534128.5, 942313]]]) {
    const layer = profile.spatialLayers.find((item) => item.name === name);
    if (!layer || layer.geometryType !== geometryType || layer.featureCount !== 8387062 || layer.crs !== "EPSG:32198" || JSON.stringify(layer.extent) !== JSON.stringify(extent) || layer.geocodeField !== "geocode" || layer.fields?.length !== layer.fieldCount) throw new Error(`${name} schema or extent drifted.`);
    if (JSON.stringify(layer.geometryValidation) !== JSON.stringify({ missingGeometryCount: 0, emptyGeometryCount: 0, invalidGeometryCount: 0 })) throw new Error(`${name} geometry validation must remain exhaustive and clean.`);
  }
  if (!Array.isArray(profile.geocodeLinkedTables) || profile.geocodeLinkedTables.length !== TABLES.length) throw new Error("Every GEOCODE-linked table is required.");
  for (const [name, kind, rowCount, distinct, fieldCount] of TABLES) {
    const table = profile.geocodeLinkedTables.find((item) => item.name === name);
    if (!table || table.kind !== kind || table.rowCount !== rowCount || table.distinctNonblankGeocodeCount !== distinct || table.nullOrBlankGeocodeCount !== 0 || table.fieldCount !== fieldCount || (kind === "attribute" && table.fields?.length !== fieldCount)) throw new Error(`${name} GEOCODE evidence drifted.`);
  }
  if (profile.immutableObjectStorage !== false || profile.productionEligible !== false || !/Immutable archive/i.test(profile.blocker ?? "")) throw new Error("Local profile cannot imply archive or production admission.");
  if (JSON.stringify(profile.evidenceReceipts) !== JSON.stringify(RECEIPTS)) throw new Error("Profile must retain its exact integrity, key, and geometry receipts.");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  for (const receipt of RECEIPTS) requireValue(existsSync(path.join(root, receipt)), "Profile receipt is missing from repository evidence.");
  return profile;
}

export async function checkQcOriginalCurrentInventory(file = new URL("../data/qc-original-current-inventory-profile.json", import.meta.url)) {
  return validateQcOriginalCurrentInventory(JSON.parse(await readFile(file, "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const profile = await checkQcOriginalCurrentInventory(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/qc-original-current-inventory-profile.json"));
  console.log(`Québec original/current inventory profile passed for ${profile.spatialLayers.length} spatial layers.`);
}
