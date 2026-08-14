import { readFile } from "node:fs/promises";

const hash = "46ee3a97ff83128630a030b5cfcc7f3c389fc94e3ca95d463595ab6f4fb57e83";
export function validate(record) {
  if (record.status !== "local-staging-profile" || record.sourceId !== "bc-wildfire") throw Error("BC wildfire source identity drift.");
  if (record.artifact?.bytes !== 4813292 || record.artifact?.sha256 !== hash || record.artifact?.contentIntegrity !== "passed") throw Error("BC wildfire raw artifact integrity drift.");
  if (record.snapshot?.service !== "BCWS_FirePerimeters_PublicView/FeatureServer/0" || record.snapshot?.responseMaxRecordCount !== 1000 || record.snapshot?.responseFeatureCount !== 217) throw Error("BC wildfire complete response evidence drift.");
  const layer = record.layer;
  if (layer?.count !== 217 || layer.crs !== "EPSG:4326 — WGS 84" || layer.missing !== 0 || layer.empty !== 0 || layer.invalid !== 2 || layer.invalidFeatures?.length !== 2 || layer.statusCounts?.["Out of Control"] !== 32 || !Array.isArray(layer.extent) || layer.extent.length !== 4) throw Error("BC wildfire read-only profile drift.");
  if (!record.licence?.basis.includes("Open Government Licence") || !record.licence?.requiredNotice.includes("BC Wildfire Service") || record.schema?.length !== 16) throw Error("BC wildfire licence or schema evidence drift.");
  for (const key of ["immutable", "transformed", "ingested", "productionEligible"]) if (record[key] !== false) throw Error("BC wildfire source must remain staging-only.");
  return record;
}

const record = JSON.parse(await readFile(new URL("../data/bc-wildfire-current-perimeters-profile.json", import.meta.url)));
validate(record);
console.log("BC wildfire current-perimeters staging profile passed.");
