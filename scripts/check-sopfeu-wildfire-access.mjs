import { readFile } from "node:fs/promises";
export function validate(record) {
  if (record.status !== "rights-and-snapshot-blocked" || record.sourceId !== "sopfeu-live-wildfire") throw Error("SOPFEU identity drift.");
  if (record.current?.publishedSnapshotEndpoint !== null || record.current?.publishedVersion !== null || record.current?.publishedCadence !== null || !record.current?.reason.includes("no official open-data catalogue")) throw Error("SOPFEU snapshot evidence drift.");
  if (record.historical?.sopfeuHistoricalArtifact !== null || !record.historical?.rule.includes("separate source")) throw Error("SOPFEU historical-source separation drift.");
  if (!record.terms?.exactRestrictionFr.includes("reproduction, distribution ou modification") || record.terms?.result !== "No open reuse, redistribution, transformation, sublicensing, archival, or API grant is verified.") throw Error("SOPFEU terms evidence drift.");
  for (const language of ["en", "fr"]) if (!record.permissionRequest?.[language]?.includes(language === "en" ? "This draft has not been sent." : "Ce brouillon n’a pas été envoyé.")) throw Error("SOPFEU permission request must remain bilingual and unsent.");
  for (const key of ["downloaded", "staged", "immutable", "transformed", "ingested", "productionEligible"]) if (record[key] !== false) throw Error("SOPFEU must remain blocked.");
  return record;
}
const record = JSON.parse(await readFile(new URL("../data/sopfeu-wildfire-access-block.json", import.meta.url)));
validate(record);
console.log("SOPFEU wildfire access block passed.");
