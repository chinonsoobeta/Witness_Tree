import { readFile } from "node:fs/promises";
export function validateQcOriginalCurrentInventoryDistinctionBlock(record) {
  if (record?.schemaVersion !== 1 || record.status !== "distinct-source-and-access-blocked" || record.productionRowId !== "qc-original-current-inventory") throw new Error("QC original/current distinction identity drift.");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(record.reviewedAt ?? "")) throw new Error("QC original/current distinction needs a UTC review timestamp.");
  const current = record.currentEcoforestArchive;
  if (current?.rowId !== "qc-current-ecoforest" || current?.bytes !== 12399475076 || current?.sourceLayer !== "PEE_MAJ_PROV") throw new Error("QC current ecoforest archive identity drift.");
  const original = record.originalCurrentInventory;
  if (original?.datasetTitle !== "Carte écoforestière originale et résultats d’inventaire courants" || original?.licence !== "CC BY 4.0" || original?.catalogueAdvertisedProvincialGpkgBytes !== 10600000000) throw new Error("QC original/current official candidate drift.");
  for (const key of ["sameArtifact", "sameSourceRow", "samePurpose"]) if (record.distinction?.[key] !== false) throw new Error(`QC original/current ${key} must remain false.`);
  for (const key of ["exactVersionedArtifactVerified", "exactArtifactChecksumAndArchiveRecoveryVerified", "exactArtifactProfileVerified", "engagementOrScopeDecisionVerified"]) if (record.authorityAndAccess?.[key] !== false) throw new Error(`QC original/current ${key} must remain unresolved.`);
  for (const [action, value] of Object.entries(record.actions ?? {})) if (value !== false) throw new Error(`QC original/current ${action} must remain false.`);
  if (!Array.isArray(record.requiredBeforeAnyAcquisition) || record.requiredBeforeAnyAcquisition.length !== 4) throw new Error("QC original/current block must retain prerequisites.");
  return record;
}
if (import.meta.url === `file://${process.argv[1]}`) { const record = JSON.parse(await readFile(new URL("../data/qc-original-current-inventory-distinction-block.json", import.meta.url))); validateQcOriginalCurrentInventoryDistinctionBlock(record); console.log("QC original/current inventory distinction block passed."); }
