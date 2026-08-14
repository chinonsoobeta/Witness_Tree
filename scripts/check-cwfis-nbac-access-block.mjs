import { readFile } from "node:fs/promises";

export function validate(record) {
  if (record.status !== "rights-and-snapshot-blocked" || record.sourceId !== "cwfis-historical") throw Error("CWFIS NBAC identity drift.");
  if (record.officialRequestUrl !== "https://cwfis.cfs.nrcan.gc.ca/datamart/datarequest/nbac" || record.dataset !== "National Burned Area Composite") throw Error("CWFIS NBAC official route drift.");
  if (record.licenceFinding?.type !== "End-user agreement, not an open-data licence" || !record.licenceFinding?.result.includes("internal-use rights")) throw Error("CWFIS NBAC rights finding drift.");
  if (record.scope?.selectedEdition !== null || record.scope?.publishedArtifactUrl !== null || record.scope?.snapshotCadence !== null || !record.scope?.nfdb.includes("not a substitute")) throw Error("CWFIS NBAC acquisition scope drift.");
  for (const language of ["en", "fr"]) if (!record.permissionRequest?.[language]?.includes(language === "en" ? "This draft has not been sent." : "Ce brouillon n’a pas été envoyé.")) throw Error("CWFIS NBAC request must remain bilingual and unsent.");
  for (const key of ["downloaded", "staged", "immutable", "transformed", "ingested", "productionEligible"]) if (record[key] !== false) throw Error("CWFIS NBAC must remain blocked.");
  return record;
}

const record = JSON.parse(await readFile(new URL("../data/cwfis-nbac-access-block.json", import.meta.url)));
validate(record);
console.log("CWFIS NBAC access block passed.");
