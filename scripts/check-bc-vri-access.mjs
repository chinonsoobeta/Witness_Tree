import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HTTPS = /^https:\/\//;

function required(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
}

function https(value, field) {
  required(value, field);
  if (!HTTPS.test(value)) throw new Error(`${field} must be HTTPS.`);
}

export function validateBcVriAccessBlock(record) {
  if (!record || record.status !== "blocked") throw new Error("BC VRI must remain blocked.");
  required(record.nonClaimNotice, "Non-claim notice");
  if (!record.source || record.source.id !== "bc-vri-2025-composite-polygons") throw new Error("Exact current VRI source id is required.");
  for (const field of ["catalogueUrl", "advertisedArtifactUrl"]) https(record.source[field], `Source ${field}`);
  if (record.source.edition !== "2025") throw new Error("Current VRI edition must remain 2025.");
  if (record.source.observedAccess?.result !== "HTTP 404 Not Found") throw new Error("The advertised artifact access defect must remain explicit.");
  if (record.rights?.catalogueLicence !== "Access Only") throw new Error("Current VRI must retain its Access Only rights state.");
  https(record.rights.officialTermsUrl, "Official terms URL");
  if (!/may not be reproduced or redistributed without written permission/i.test(record.rights.officialRestriction ?? "")) throw new Error("Written-permission restriction is required.");
  if (!Array.isArray(record.scope?.notEquivalentTo) || !record.scope.notEquivalentTo.includes("Forest Tenure Cutblock Polygons (FTA 4.0)") || !record.scope.notEquivalentTo.includes("Forest Tenure Harvesting Authority Polygons")) throw new Error("VRI must remain distinct from FTA cutblocks and harvesting authorities.");
  for (const [field, value] of Object.entries(record.admission ?? {})) if (value !== false) throw new Error(`${field} must remain false.`);
  for (const field of ["downloaded", "staged", "immutable", "transformed", "ingested", "productionEligible"]) if (record.admission?.[field] !== false) throw new Error(`Admission ${field} must remain false.`);
  if (!Array.isArray(record.blockers) || record.blockers.length < 3) throw new Error("Rights, access, and snapshot blockers are required.");
  if (record.requestDraft?.status !== "unsent") throw new Error("Permission request must remain unsent.");
  https(record.requestDraft?.permissionFormUrl, "Permission form URL");
  if (!Array.isArray(record.requestDraft?.requestedPermissions) || record.requestDraft.requestedPermissions.length < 5) throw new Error("Complete permission request scope is required.");
  return record;
}

export async function checkBcVriAccessBlock(file = new URL("../data/bc-vri-access-block.json", import.meta.url)) {
  return validateBcVriAccessBlock(JSON.parse(await readFile(file, "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const record = await checkBcVriAccessBlock(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/bc-vri-access-block.json"));
  console.log(`BC VRI access block passed for ${record.source.edition}.`);
}
