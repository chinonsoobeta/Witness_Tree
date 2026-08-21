import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HTTPS = /^https:\/\//;

export function validateBcForestOperationsMapAccess(record) {
  if (!record || record.schemaVersion !== "1.0" || record.status !== "blocked-access-only-licence" || record.sourceId !== "bc-forest-operations-map") throw new Error("Forest Operations Map record must remain blocked by the Access Only licence.");
  const catalogue = record.catalogue;
  if (!catalogue || !HTTPS.test(catalogue.url) || catalogue.datasetId !== "7dda4615-5d32-427e-a303-1dcdb90a6fea" || catalogue.title !== "Forest Operations Map (FOM) - Cutblocks" || catalogue.publisher !== "Forest Science, Planning and Practices Branch" || catalogue.licenceTitle !== "Access Only" || !HTTPS.test(catalogue.licenceUrl)) throw new Error("Authoritative Forest Operations Map catalogue and Access Only licence evidence are required.");
  const service = record.authoritativeService;
  if (!service || service.itemId !== "d3424124ff4541ff8375d8e95ea79668" || service.itemType !== "Feature Service" || service.access !== "public" || service.licence !== "Access Only" || !HTTPS.test(service.itemUrl) || service.observedLayer?.url !== "https://delivery.maps.gov.bc.ca/arcgis/rest/services/whse/bcgw_pub_whse_forest_tenure/MapServer/32" || service.observedLayer?.featureCount !== 47654 || service.observedLayer?.spatialReference !== "EPSG:3005" || service.observedLayer?.maxRecordCount !== 1000) throw new Error("Public service observation must remain bounded and must not replace licence evidence.");
  if (!Array.isArray(record.scopeAndLifecycleCaveats) || record.scopeAndLifecycleCaveats.length < 4 || !record.scopeAndLifecycleCaveats.some((caveat) => /not yet permitted/i.test(caveat)) || !record.scopeAndLifecycleCaveats.some((caveat) => /completed harvest/i.test(caveat))) throw new Error("Planned-activity and lifecycle caveats are required.");
  const request = record.permissionRequest;
  if (!request || request.status !== "form-submitted-clarification-replied-permission-pending" || request.proposedSender !== "Chinonso Obeta <chinonso8@gmail.com>" || request.recipientRoute !== "https://forms.gov.bc.ca/copyright-permission-request/" || request.copyrightContact !== "QPIPPCopyright@gov.bc.ca" || request.subject !== "Copyright Permission Request" || request.submittedAt !== "2026-08-21T13:48-07:00" || request.clarificationReceivedAt !== "2026-08-21T21:21:55Z" || request.clarificationReplySentAt !== "2026-08-21T22:34:39Z" || request.submittedCatalogueUrl !== "https://catalogue.data.gov.bc.ca/dataset/7dda4615-5d32-427e-a303-1dcdb90a6fea" || request.authorizationOutcome !== "pending-no-permission-or-access") throw new Error("Only the exact FOM form and clarification evidence is allowed; permission and access must remain pending.");
  if (!/No scraping.*Province-authorized export\/service.*official viewer.*expressly permitted static excerpts/i.test(request.clarificationBoundary)) throw new Error("FOM clarification must retain the lawful-use boundary.");
  for (const key of Object.keys(request)) if (/gmail.*(?:message|thread)|(?:message|thread).*gmail/i.test(key)) throw new Error("Permission evidence must not store Gmail identifiers.");
  const blocker = record.blocker;
  if (!blocker || !/written Province of British Columbia copyright permission|redistributable licence/i.test(blocker.requiredBeforeAcquisition ?? "") || blocker.rawDownloadPerformed !== false || blocker.sha256 !== null || blocker.archiveIntegrity !== "not-run-access-blocked" || blocker.schemaProfile !== "not-run-access-blocked" || blocker.productionEligible !== false) throw new Error("Access-only source must not claim acquisition, integrity, profiling, or production.");
  return record;
}

export async function checkBcForestOperationsMapAccess(file = new URL("../data/bc-forest-operations-map-access.json", import.meta.url)) {
  return validateBcForestOperationsMapAccess(JSON.parse(await readFile(file, "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await checkBcForestOperationsMapAccess(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/bc-forest-operations-map-access.json"));
  console.log("BC Forest Operations Map remains correctly blocked by the Access Only licence.");
}
