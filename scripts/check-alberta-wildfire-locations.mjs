import { readFile } from "node:fs/promises";

const hash = "f0e86ea34a7624c365349b3a8fbb77967bb45ab73c507cf441efb8f6a8736ee0";
export function validate(record) {
  if (record.status !== "local-staging-profile" || record.sourceId !== "ab-wildfire") throw Error("Alberta wildfire source identity drift.");
  if (record.artifact?.bytes !== 423853 || record.artifact?.sha256 !== hash || record.artifact?.contentIntegrity !== "passed") throw Error("Alberta wildfire raw artifact integrity drift.");
  if (record.snapshot?.service !== "wildfire/alberta_fire_status/FeatureServer/0" || record.snapshot?.responseMaxRecordCount !== 1000 || record.snapshot?.responseFeatureCount !== 751) throw Error("Alberta wildfire complete response evidence drift.");
  const layer = record.layer;
  if (layer?.count !== 751 || layer.crs !== "EPSG:4326 — WGS 84" || layer.geometryType !== "Point" || layer.fieldCount !== 17 || layer.missing !== 0 || layer.empty !== 0 || layer.invalid !== 0 || !Array.isArray(layer.extent) || layer.extent.length !== 4) throw Error("Alberta wildfire read-only profile drift.");
  if (!record.licence?.basis.includes("Open Government Licence") || !record.licence?.requiredNotice.includes("Government Licence") || record.schema?.length !== 17) throw Error("Alberta wildfire licence or schema evidence drift.");
  for (const key of ["immutable", "transformed", "ingested", "productionEligible"]) if (record[key] !== false) throw Error("Alberta wildfire source must remain staging-only.");
  return record;
}

const record = JSON.parse(await readFile(new URL("../data/alberta-wildfire-locations-profile.json", import.meta.url)));
validate(record);
console.log("Alberta wildfire-locations staging profile passed.");
