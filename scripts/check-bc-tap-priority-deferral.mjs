import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HTTPS = /^https:\/\//;
function required(value, field) { if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`); }
function https(value, field) { required(value, field); if (!HTTPS.test(value)) throw new Error(`${field} must be HTTPS.`); }

export function validateBcTapPriorityDeferralBlock(record) {
  if (!record || record.status !== "blocked") throw new Error("BC TAP priority deferral source must remain blocked.");
  required(record.nonClaimNotice, "Non-claim notice");
  const source = record.source ?? {};
  if (source.inventoryRow !== "bc-old-growth-bec" || source.id !== "bc-tap-priority-deferral-current-view") throw new Error("The exact old-growth inventory row and source are required.");
  for (const field of ["catalogueUrl", "serviceUrl", "licenceUrl"]) https(source[field], field);
  if (source.licence !== "Access Only" || source.declaredCrs !== "EPSG:3005" || source.serviceFeatureCount !== 255486 || source.maxRecordCount !== 1000) throw new Error("Exact Access Only and service facts are required.");
  if (!Array.isArray(record.observedLimitations) || record.observedLimitations.length !== 4 || !record.observedLimitations.some((item) => /may not be reproduced or redistributed/i.test(item)) || !record.observedLimitations.some((item) => /does not represent the supported old-growth deferral/i.test(item))) throw new Error("Rights and implementation limitations are required.");
  if (!record.scope?.notEquivalentTo?.includes("the separate BEC ecosystem map") || !record.scope.notEquivalentTo.includes("currently supported old-growth deferral areas being implemented")) throw new Error("BEC and implemented-deferral non-substitution is required.");
  for (const field of ["downloaded", "staged", "immutable", "transformed", "ingested", "productionEligible"]) if (record.admission?.[field] !== false) throw new Error(`${field} must remain false.`);
  if (record.requestDraft?.status !== "unsent") throw new Error("Permission request must remain unsent.");
  https(record.requestDraft?.permissionRoute, "Permission route");
  for (const locale of ["en", "fr"]) required(record.requestDraft?.[locale], `Request ${locale}`);
  return record;
}

export async function checkBcTapPriorityDeferralBlock(file = new URL("../data/bc-tap-priority-deferral-block.json", import.meta.url)) {
  return validateBcTapPriorityDeferralBlock(JSON.parse(await readFile(file, "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await checkBcTapPriorityDeferralBlock(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/bc-tap-priority-deferral-block.json"));
  console.log("BC TAP priority-deferral rights and snapshot block passed.");
}
