import { readFile } from "node:fs/promises";

const HTTPS = /^https:\/\//;
const EXPECTED = new Map([
  ["bc-fta-4-cutblocks", ["dfb8b498-fa4b-4286-b3ec-58db88aca1cf", "Forest Tenure Cutblock Polygons (FTA 4.0)", 149371, 222198]],
  ["bc-harvesting-authority-polygons", ["cff7b8f7-6897-444f-8c53-4bb93c7e9f8b", "Forest Tenure Harvesting Authority Polygons", 46833, null]],
]);

export function validateBcFtaOperationalSources(record) {
  if (!record || record.schemaVersion !== "1.0" || record.status !== "blocked-publisher-export-required") throw new Error("FTA source audit must remain blocked until a publisher export is available.");
  if (!record.licence || record.licence.id !== "ogl-british-columbia" || record.licence.title !== "Open Government Licence - British Columbia" || !HTTPS.test(record.licence.url)) throw new Error("Both FTA records require the verified BC open-government licence.");
  if (!Array.isArray(record.sources) || record.sources.length !== EXPECTED.size) throw new Error("Both required FTA source records are required.");
  for (const source of record.sources) {
    const expected = EXPECTED.get(source.sourceId);
    if (!expected) throw new Error(`Unexpected FTA source ${source.sourceId}.`);
    const [catalogueId, title, mapServiceCount, wfsNumberMatched] = expected;
    if (source.catalogueId !== catalogueId || source.title !== title || !HTTPS.test(source.catalogueUrl) || !HTTPS.test(source.customDownload) || !HTTPS.test(source.mapService) || !HTTPS.test(source.wfs)) throw new Error(`${source.sourceId} must retain its official identifiers and endpoints.`);
    if (source.serviceObservations?.mapServiceCount !== mapServiceCount || source.serviceObservations?.wfsDefaultPageLimit !== 10000 || source.serviceObservations?.wfsPagingTransactionSafe !== false || source.serviceObservations?.geometryType !== "Polygon" || source.serviceObservations?.crs !== "EPSG:3005") throw new Error(`${source.sourceId} service-safety evidence is incomplete.`);
    if (wfsNumberMatched !== null && source.serviceObservations.wfsNumberMatched !== wfsNumberMatched) throw new Error("Cutblock WFS count observation must remain explicit.");
    if (!Array.isArray(source.serviceObservations.queryFormats) || !source.serviceObservations.queryFormats.includes("geoJSON") || !Array.isArray(source.requiredFieldsObserved) || !source.requiredFieldsObserved.length || !/PENDING.*ACTIVE.*RETIRED/i.test(source.lifecycleSemantics ?? "") || source.productionEligible !== false) throw new Error(`${source.sourceId} must retain lifecycle limits and non-production status.`);
  }
  const blocker = record.blocker;
  if (!blocker || !/PagingIsTransactionSafe=false/.test(blocker.reason ?? "") || !/Custom Download export/.test(blocker.requiredBeforeAcquisition ?? "") || blocker.rawDownloadPerformed !== false || blocker.sha256 !== null || blocker.archiveIntegrity !== "not-run-publisher-export-required" || blocker.schemaProfile !== "not-run-publisher-export-required" || blocker.productionEligible !== false) throw new Error("FTA source audit must fail closed before a publisher-exported snapshot.");
  return record;
}

export async function checkBcFtaOperationalSources(file = new URL("../data/bc-fta-operational-sources.json", import.meta.url)) { return validateBcFtaOperationalSources(JSON.parse(await readFile(file, "utf8"))); }

if (import.meta.url === `file://${process.argv[1]}`) { const record = await checkBcFtaOperationalSources(); console.log(`BC FTA source audit passed for ${record.sources.length} access-controlled source records.`); }
