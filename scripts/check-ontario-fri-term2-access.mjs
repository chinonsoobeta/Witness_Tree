import { readFile } from "node:fs/promises";
export function validate(record) {
  if (record.status !== "access-and-rights-blocked" || record.sourceId !== "ontario-fri-term-2-2018-2028") throw Error("Ontario FRI identity drift.");
  const catalogue = record.catalogue;
  if (catalogue?.resourceCount !== 2 || JSON.stringify(catalogue?.resourceFormats) !== JSON.stringify(["WEB", "WEB"]) || catalogue?.licence !== "Open Government Licence – Ontario" || catalogue.resourceUrls?.some((url) => !url.startsWith("https://geohub"))) throw Error("Ontario FRI catalogue evidence drift.");
  if (record.access?.directStableArtifact !== false || record.access?.deterministicApi !== false || !record.access?.reason.includes("only English and French WEB explorer")) throw Error("Ontario FRI access must remain blocked.");
  if (record.rights?.status !== "unsettled-for-released-package" || !record.rights?.reason.includes("Electronic Intellectual Property")) throw Error("Ontario FRI rights evidence drift.");
  if (!record.accessRequestDraft?.includes("This draft has not been sent.")) throw Error("Ontario FRI request must remain unsent.");
  for (const key of ["downloaded", "staged", "immutable", "transformed", "ingested", "productionEligible"]) if (record[key] !== false) throw Error("Ontario FRI must remain non-production.");
  return record;
}
const record = JSON.parse(await readFile(new URL("../data/ontario-fri-term2-access-block.json", import.meta.url)));
validate(record);
console.log("Ontario FRI Term 2 access block passed.");
