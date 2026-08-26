import { readFile } from "node:fs/promises";

const hash = "a0373a6dd8e341c3440ed9907f81e8ba6227135dacd9cdc07e4c6af0a59b1b4e";
export function validate(record) {
  if (record.status !== "local-staging-profile" || record.sourceId !== "cwfis-nfdb-fire-polygons-current") throw Error("NFDB source identity drift.");
  if (record.artifact?.bytes !== 778498701 || record.artifact?.sha256 !== hash || record.artifact?.zipIntegrity !== "passed") throw Error("NFDB raw archive integrity drift.");
  if (!record.licence?.basis.includes("Open Government Licence") || !record.licence?.basis.includes("no implied endorsement") || record.licence.requiredNotices?.length !== 3) throw Error("NFDB licence or attribution evidence drift.");
  if (record.snapshot?.cadence !== "publisher current-version directory; not a real-time feed") throw Error("NFDB cadence or real-time claim drift.");
  const expected = [["NFDB_poly_1972to2020_20250630", 41210, 441], ["NFDB_poly_2021to2024_20250630", 7361, 41]];
  if (!Array.isArray(record.layers) || record.layers.length !== expected.length) throw Error("NFDB layer set drift.");
  for (const [index, [name, count, invalid]] of expected.entries()) {
    const layer = record.layers[index];
    if (layer?.name !== name || layer.count !== count || layer.missing !== 0 || layer.empty !== 0 || layer.invalid !== invalid || layer.geometry !== "3D Polygon" || !Array.isArray(layer.extent) || layer.extent.length !== 4) throw Error("NFDB profile drift.");
  }
  for (const key of ["immutable", "transformed", "ingested", "productionEligible"]) if (record[key] !== false) throw Error("NFDB must remain non-production staging.");
  return record;
}

const record = JSON.parse(await readFile(new URL("../data/nfdb-poly-current-profile.json", import.meta.url)));
validate(record);
console.log("NFDB polygon staging profile passed.");
