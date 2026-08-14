import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SHA256 = /^[a-f0-9]{64}$/;
const YEARS = Array.from({ length: 38 }, (_, index) => 1985 + index);

function required(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
}

export function validateNrcanHarvestProfile(profile) {
  if (!profile || profile.schemaVersion !== "1.0" || profile.status !== "read-only-staging-profile") throw new Error("Harvest profile must remain a read-only staging profile.");
  required(profile.notice, "notice");
  if (!/not a transformation, ingestion, immutable archive, or production dataset/i.test(profile.notice)) throw new Error("Harvest profile must retain all staging limitations.");
  if (profile.sourceId !== "nrcan-ca-forest-harvest-1985-2022") throw new Error("Harvest profile source id is fixed.");
  const raw = profile.raw;
  if (!raw || !raw.localPath?.startsWith("../Witness_Tree-data/raw/nrcan-ca-forest-harvest-1985-2022/") || !SHA256.test(raw.sha256) || raw.byteLength !== 247945479 || raw.zipIntegrity !== "passed" || raw.memberCount !== 8 || raw.uncompressedByteLength !== 751204296) throw new Error("Harvest raw archive evidence is incomplete or drifted.");
  const raster = profile.raster;
  if (!raster || raster.member !== "CA_Forest_Harvest_1985-2022.tif" || raster.driver !== "GTiff" || raster.geometryKind !== "raster" || raster.bandCount !== 1 || raster.dataType !== "UInt16") throw new Error("Harvest raster profile is incomplete or drifted.");
  if (raster.pixelWidth !== 193936 || raster.pixelHeight !== 128340 || raster.pixelSizeMetres !== 30 || raster.crs !== "EPSG:3978 (GDAL identification confidence 70%)" || raster.noDataValue !== 65536) throw new Error("Harvest grid profile is incomplete or drifted.");
  const table = raster.valueTable;
  if (!table || table.member !== "CA_Forest_Harvest_1985-2022.tif.vat.dbf" || table.rowCount !== 39 || JSON.stringify(table.fields) !== JSON.stringify(["Value", "Count"]) || JSON.stringify(table.values) !== JSON.stringify([0, ...YEARS]) || table.pixelCountSum !== 24889746240 || table.matchesRasterCellCount !== true) throw new Error("Harvest value-table profile is incomplete or drifted.");
  if (raster.geometryValidity !== "not-applicable-raster" || profile.productionEligible !== false || !Array.isArray(profile.limitations) || profile.limitations.length < 4) throw new Error("Harvest profile must retain raster limits and staging-only status.");
  return profile;
}

export async function checkNrcanHarvestProfile(file = new URL("../data/nrcan-harvest-profile.json", import.meta.url)) {
  return validateNrcanHarvestProfile(JSON.parse(await readFile(file, "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const profile = await checkNrcanHarvestProfile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/nrcan-harvest-profile.json"));
  console.log(`NRCan harvest staging profile passed for ${profile.raster.member}.`);
}
