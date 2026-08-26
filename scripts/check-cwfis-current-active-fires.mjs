import { readFile } from "node:fs/promises";

const hash = "fc3d4a0730f30d6f12782b16e9459c173dabd6e50d0715b27cddecd954097f86";
export function validate(record) {
  if (record.status !== "local-staging-profile" || record.sourceId !== "cwfis-current") throw Error("CWFIS current source identity drift.");
  if (record.artifact?.bytes !== 45917 || record.artifact?.sha256 !== hash || record.artifact?.zipIntegrity !== "passed") throw Error("CWFIS current raw artifact integrity drift.");
  if (record.snapshot?.layer !== "public:cwfif_national_activefires" || record.snapshot?.fixedQueryInstant !== "2026-08-14T20:22:42Z" || record.snapshot?.resultTypeHits !== 586) throw Error("CWFIS current fixed snapshot evidence drift.");
  const layer = record.layer;
  if (layer?.count !== 586 || layer.geometry !== "Point" || layer.crs !== "EPSG:3978 — NAD83 / Canada Atlas Lambert" || layer.missing !== 0 || layer.empty !== 0 || layer.invalid !== 0 || layer.agencyCount !== 11 || !Array.isArray(layer.extent) || layer.extent.length !== 4) throw Error("CWFIS current read-only profile drift.");
  if (!record.licence?.basis.includes("Open Government Licence") || !record.licence?.requiredNotice.includes("Canadian Wildland Fire Information") || record.serviceSchema?.length !== 21 || record.shapefileSchema?.length !== 21) throw Error("CWFIS current licence or schema evidence drift.");
  for (const key of ["immutable", "transformed", "ingested", "productionEligible"]) if (record[key] !== false) throw Error("CWFIS current source must remain staging-only.");
  return record;
}

const record = JSON.parse(await readFile(new URL("../data/cwfis-current-active-fires-profile.json", import.meta.url)));
validate(record);
console.log("CWFIS current active-fire staging profile passed.");
