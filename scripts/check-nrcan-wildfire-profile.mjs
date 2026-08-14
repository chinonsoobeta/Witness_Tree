import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SHA256 = /^[a-f0-9]{64}$/;
const YEARS = Array.from({ length: 38 }, (_, index) => 1985 + index);

export function validateNrcanWildfireProfile(profile) {
  if (!profile || profile.schemaVersion !== "1.0" || profile.status !== "read-only-staging-profile" || !/not a transformation, ingestion, immutable archive, or production dataset/i.test(profile.notice ?? "") || profile.sourceId !== "nrcan-ca-forest-wildfire-1985-2022") throw new Error("Wildfire profile must remain a read-only staging profile.");
  const raw = profile.raw;
  if (!raw || !raw.localPath?.startsWith("../Witness_Tree-data/raw/nrcan-ca-forest-wildfire-1985-2022/") || !SHA256.test(raw.sha256) || raw.byteLength !== 252364563 || raw.zipIntegrity !== "passed" || raw.memberCount !== 8 || raw.uncompressedByteLength !== 751116195) throw new Error("Wildfire raw archive evidence is incomplete or drifted.");
  const raster = profile.raster;
  if (!raster || raster.member !== "CA_Forest_Fire_1985-2022.tif" || raster.driver !== "GTiff" || raster.geometryKind !== "raster" || raster.bandCount !== 1 || raster.dataType !== "UInt16" || raster.pixelWidth !== 193936 || raster.pixelHeight !== 128340 || raster.pixelSizeMetres !== 30 || raster.crs !== "EPSG:3978 (GDAL identification confidence 70%)" || raster.noDataValue !== 65536) throw new Error("Wildfire raster grid profile is incomplete or drifted.");
  const table = raster.valueTable;
  if (!table || table.member !== "CA_Forest_Fire_1985-2022.tif.vat.dbf" || table.rowCount !== 39 || JSON.stringify(table.fields) !== JSON.stringify(["Value", "Count"]) || JSON.stringify(table.values) !== JSON.stringify([0, ...YEARS]) || table.pixelCountSum !== 24889746240 || table.matchesRasterCellCount !== true) throw new Error("Wildfire value-table profile is incomplete or drifted.");
  if (raster.geometryValidity !== "not-applicable-raster" || profile.productionEligible !== false || !Array.isArray(profile.limitations) || profile.limitations.length < 4) throw new Error("Wildfire profile must retain raster limits and staging-only status.");
  return profile;
}

export async function checkNrcanWildfireProfile(file = new URL("../data/nrcan-wildfire-profile.json", import.meta.url)) {
  return validateNrcanWildfireProfile(JSON.parse(await readFile(file, "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const profile = await checkNrcanWildfireProfile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/nrcan-wildfire-profile.json"));
  console.log(`NRCan wildfire staging profile passed for ${profile.raster.member}.`);
}
