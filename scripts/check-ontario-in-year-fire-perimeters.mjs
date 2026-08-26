import { readFile } from "node:fs/promises";

const hash = "99881f19a32068b5d66b244955f7b088e873ffe76eafebf1740f03e16f042f11";
export function validate(record) {
  if (record.status !== "local-staging-profile" || record.sourceId !== "on-fire-disturbance") throw Error("Ontario fire source identity drift.");
  if (record.artifact?.bytes !== 19510504 || record.artifact?.sha256 !== hash || record.artifact?.contentIntegrity !== "passed") throw Error("Ontario fire raw artifact integrity drift.");
  if (record.snapshot?.service !== "LIO_OPEN_DATA/LIO_Open09/MapServer/51" || record.snapshot?.responseMaxRecordCount !== 2000 || record.snapshot?.responseFeatureCount !== 188) throw Error("Ontario fire complete response evidence drift.");
  const layer = record.layer;
  if (layer?.count !== 188 || layer.crs !== "EPSG:4326 — WGS 84" || layer.fieldCount !== 7 || layer.missing !== 0 || layer.empty !== 0 || layer.invalid !== 9 || layer.geometryTypes?.Polygon !== 118 || layer.geometryTypes?.MultiPolygon !== 70 || !Array.isArray(layer.extent) || layer.extent.length !== 4) throw Error("Ontario fire read-only profile drift.");
  if (!record.licence?.basis.includes("Open Government Licence") || !record.licence?.requiredNotice.includes("Ontario Ministry") || record.schema?.length !== 7) throw Error("Ontario fire licence or schema evidence drift.");
  for (const key of ["immutable", "transformed", "ingested", "productionEligible"]) if (record[key] !== false) throw Error("Ontario fire source must remain staging-only.");
  return record;
}

const record = JSON.parse(await readFile(new URL("../data/ontario-in-year-fire-perimeters-profile.json", import.meta.url)));
validate(record);
console.log("Ontario in-year fire-perimeters staging profile passed.");
