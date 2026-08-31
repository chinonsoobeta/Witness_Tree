import { readFile } from "node:fs/promises";
export function validate(record) {
  if (record.status !== "snapshot-access-blocked" || record.sourceId !== "bc-harvesting-authority-polygons") throw Error("BC harvesting-authority identity drift.");
  if (record.licence?.id !== "ogl-british-columbia" || !record.licence?.basis.includes("no implied endorsement")) throw Error("BC harvesting-authority licence evidence drift.");
  const source = record.selectedSource;
  if (source?.customDownloadUrl !== "" || source?.serviceCount !== 46833 || source?.maxRecordCount !== 1000 || source?.serviceVersionMarker !== null || !source?.reason.includes("no stable artifact URL")) throw Error("BC harvesting-authority access evidence drift.");
  const comparison = source.endpointComparison;
  // The serviceCount above is an ArcGIS figure. BC's WFS reports a different
  // population for the same feature class, so the record has to keep saying
  // which endpoint each number came from, and has to keep the authority
  // question open rather than resolving it on our behalf.
  if (comparison?.evidencePath !== "data/bc-ften-endpoint-divergence-2026-08-30.json" || comparison.arcgisTotal !== source.serviceCount) throw Error("BC harvesting-authority endpoint comparison drift.");
  if (comparison.wfsMinusArcgis !== comparison.wfsTotal - comparison.arcgisTotal) throw Error("BC harvesting-authority endpoint delta does not equal its own operands.");
  if (comparison.authoritativeEndpoint !== null) throw Error("BC does not state which endpoint is authoritative, so this record may not.");
  if (record.operationalSemantics?.restriction !== "No status may be normalized as completed harvest without a separately reviewed lifecycle mapping.") throw Error("BC harvesting-authority lifecycle safety drift.");
  if (!record.accessRequestDraft?.includes("This draft has not been sent.")) throw Error("BC harvesting-authority request must remain unsent.");
  for (const key of ["downloaded", "staged", "immutable", "transformed", "ingested", "productionEligible"]) if (record[key] !== false) throw Error("BC harvesting authorities must remain blocked.");
  return record;
}
const record = JSON.parse(await readFile(new URL("../data/bc-harvesting-authority-access-block.json", import.meta.url)));
validate(record);
console.log("BC harvesting-authority access block passed.");
