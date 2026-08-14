import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HTTPS = /^https:\/\//;

export function validateBcConsolidatedCutblocksAccess(record) {
  if (!record || record.schemaVersion !== "1.0" || record.status !== "blocked-access-only-licence" || record.sourceId !== "bc-consolidated-cutblocks") throw new Error("Consolidated Cutblocks record must remain blocked by the Access Only licence.");
  const catalogue = record.catalogue;
  if (!catalogue || !HTTPS.test(catalogue.url) || catalogue.datasetId !== "b1b647a6-f271-42e0-9cd0-89ec24bce9f7" || catalogue.licenceTitle !== "Access Only" || !HTTPS.test(catalogue.licenceUrl) || catalogue.pointOfContact?.email !== "FAIB.Data.Management@gov.bc.ca" || catalogue.pointOfContact?.role !== "pointOfContact") throw new Error("Authoritative catalogue, contact, and Access Only licence evidence are required.");
  const resource = record.resource;
  if (!resource || resource.format !== "fgdb ZIP" || resource.url !== "https://www.for.gov.bc.ca/ftp/HTS/external/!publish/DataCatalogue_FAIB_Data/consolidated_cutblocks/Cut_Block_all_BC.zip" || resource.head?.status !== 200 || resource.head?.contentType !== "application/x-zip-compressed" || resource.head?.contentLengthBytes !== 555382445 || resource.head?.lastModified !== "2025-07-25T23:00:56Z") throw new Error("Exact access-only resource observation is required.");
  const edition = record.editionAndCadence;
  if (!edition || edition.documentationEdition !== "November 2024" || edition.datasetRunCadence !== "quarterly" || edition.satelliteChangeDetectionCadence !== "annual 1999–2023; quarterly since 2023") throw new Error("Edition and cadence evidence are required.");
  if (!Array.isArray(record.scopeAndLifecycleCaveats) || record.scopeAndLifecycleCaveats.length < 4) throw new Error("Lifecycle caveats are required.");
  const permissionRequest = record.permissionRequest;
  if (!permissionRequest || permissionRequest.status !== "sent-awaiting-response" || permissionRequest.sentAt !== "2026-08-14T17:17:15Z" || permissionRequest.sender !== "Chinonso Obeta <chinonso8@gmail.com>" || permissionRequest.recipient !== "FAIB.Data.Management@gov.bc.ca" || permissionRequest.subject !== "Permission request — Harvested Areas of BC (Consolidated Cutblocks)" || permissionRequest.authorizationOutcome !== "pending") throw new Error("Sent permission-request evidence must be bounded and awaiting a response.");
  for (const key of Object.keys(permissionRequest)) if (/gmail.*(?:message|thread)|(?:message|thread).*gmail/i.test(key)) throw new Error("Permission evidence must not store Gmail identifiers.");
  const blocker = record.blocker;
  if (!blocker || !/written publisher authorization|redistributable licence/i.test(blocker.requiredBeforeAcquisition ?? "") || blocker.rawDownloadPerformed !== false || blocker.sha256 !== null || blocker.archiveIntegrity !== "not-run-access-blocked" || blocker.schemaProfile !== "not-run-access-blocked" || blocker.productionEligible !== false) throw new Error("Access-only source must not claim acquisition, integrity, profiling, or production.");
  return record;
}

export async function checkBcConsolidatedCutblocksAccess(file = new URL("../data/bc-consolidated-cutblocks-access.json", import.meta.url)) {
  return validateBcConsolidatedCutblocksAccess(JSON.parse(await readFile(file, "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await checkBcConsolidatedCutblocksAccess(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/bc-consolidated-cutblocks-access.json"));
  console.log("BC Consolidated Cutblocks remains correctly blocked by the Access Only licence.");
}
