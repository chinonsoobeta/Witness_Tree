import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SHA256 = /^[a-f0-9]{64}$/;
const HTTPS = /^https:\/\//;

function required(value, field) { if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`); }
function https(value, field) { required(value, field); if (!HTTPS.test(value)) throw new Error(`${field} must be HTTPS.`); }

export function validateBcBecSnapshotBlock(record) {
  if (!record || record.status !== "blocked") throw new Error("BC BEC must remain blocked.");
  required(record.nonClaimNotice, "Non-claim notice");
  if (record.source?.inventoryRow !== "bc-old-growth-bec" || record.source?.id !== "bc-bec-map-v13-1") throw new Error("BC BEC must bind the exact Phase 1 row and source.");
  for (const field of ["catalogueUrl", "wfsUrl"]) https(record.source?.[field], field);
  if (record.source?.edition !== "13.1" || record.source?.editionDate !== "2026-07-08") throw new Error("BEC v13.1 edition facts are required.");
  if (record.source?.licence !== "Open Government Licence - British Columbia") throw new Error("BEC OGL-BC fact is required.");
  if (record.source?.declaredCrs !== "EPSG:3005" || record.source?.authoritativeFeatureCount !== 17870) throw new Error("Authoritative CRS and count are required.");
  if (record.singleRequestObservation?.requestedCount !== 17870 || record.singleRequestObservation?.returnedFeatureCount !== 10000 || record.singleRequestObservation?.zipIntegrity !== "passed") throw new Error("Exact incomplete one-request observation is required.");
  if (!SHA256.test(record.singleRequestObservation?.excludedDiagnosticSha256 ?? "")) throw new Error("Excluded diagnostic checksum is required.");
  if (record.serviceSemantics?.pagingIsTransactionSafe !== false || record.serviceSemantics?.implementsFeatureVersioning !== false) throw new Error("Unsafe unversioned paging must remain explicit.");
  if (!/cannot establish a complete, internally consistent/i.test(record.serviceSemantics?.consequence ?? "")) throw new Error("Paging consequence is required.");
  if (!record.scope?.notEquivalentTo?.includes("Old Growth Technical Advisory Panel layers") || !record.scope.notEquivalentTo.includes("Forest Tenure Cutblock Polygons (FTA 4.0)")) throw new Error("BEC must remain distinct from TAP and FTA layers.");
  for (const field of ["downloaded", "staged", "immutable", "transformed", "ingested", "productionEligible"]) if (record.admission?.[field] !== false) throw new Error(`${field} must remain false.`);
  if (!Array.isArray(record.blockers) || record.blockers.length !== 3) throw new Error("All snapshot blockers are required.");
  if (record.requestDraft?.status !== "unsent") throw new Error("Request draft must remain unsent.");
  required(record.requestDraft?.contact, "Publisher contact");
  if (!Array.isArray(record.requestDraft?.requestedItems) || record.requestDraft.requestedItems.length < 4) throw new Error("Complete request scope is required.");
  return record;
}

export async function checkBcBecSnapshotBlock(file = new URL("../data/bc-bec-snapshot-block.json", import.meta.url)) {
  return validateBcBecSnapshotBlock(JSON.parse(await readFile(file, "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const record = await checkBcBecSnapshotBlock(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/bc-bec-snapshot-block.json"));
  console.log(`BC BEC snapshot block passed for version ${record.source.edition}.`);
}
