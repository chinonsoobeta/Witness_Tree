import { readFile } from "node:fs/promises";
export function validate(record) {
  if (record.status !== "local-staging-profile" || record.sourceId !== "bc-provincial-electoral-districts-2023") throw new Error("BC electoral record identity changed.");
  if (record.artifact?.bytes !== 21828718 || record.artifact?.sha256 !== "d2403eeb488be4ef761f7dcbc72c25f8af3a046fce9980536307ba145993f193") throw new Error("BC electoral artifact evidence changed.");
  const p=record.profile; if (!p || p.featureCount!==93 || p.crs!=="EPSG:3005" || p.missingGeometry!==0 || p.emptyGeometry!==0 || p.invalidGeometry!==0 || p.geometryTypes?.join()!=="Polygon") throw new Error("BC electoral profile changed.");
  for (const key of ["immutable","transformed","ingested","productionEligible"]) if (record[key]!==false) throw new Error(`BC electoral must not claim ${key}.`);
  return record;
}
const record=JSON.parse(await readFile(new URL("../data/bc-provincial-electoral-2023-profile.json",import.meta.url))); validate(record); console.log("BC provincial electoral staging profile passed.");
