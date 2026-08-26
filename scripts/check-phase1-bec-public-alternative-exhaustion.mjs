import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HTTPS = /^https:\/\//;
const SHA256 = /^[a-f0-9]{64}$/;
const REQUIRED_ROUTES = [
  "bcgw-custom-download",
  "public-wfs",
  "arcgis-whse-layer21",
  "arcgis-mpcm-layer38",
  "wms",
  "kml-loader",
  "hectare-summary",
  "poster-map",
  "letter-map",
  "revision-history-map",
  "district-scale-maps",
  "bec-website",
  "generalized-arcgis-substitutions"
];

function required(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
}

function https(value, field) {
  required(value, field);
  if (!HTTPS.test(value)) throw new Error(`${field} must be HTTPS.`);
}

function exact(value, expected, field) {
  if (value !== expected) throw new Error(`${field} must be ${JSON.stringify(expected)}.`);
}

export function validatePhase1BecPublicAlternativeExhaustion(record) {
  if (!record || record.status !== "no-complete-public-artifact") throw new Error("BEC public alternatives must remain exhausted without a complete artifact.");
  required(record.nonClaimNotice, "Non-claim notice");
  exact(record.canonicalRowId, "bc-old-growth-bec", "Canonical row");

  exact(record.source?.datasetId, "f358a53b-ffde-4830-a325-a5a03ff672c3", "Dataset id");
  exact(record.source?.datasetVersion, "13.1", "Dataset version");
  exact(record.source?.editionDate, "2026-07-08", "Edition date");
  exact(record.source?.publisher, "Forest Analysis and Inventory Branch", "Publisher");
  exact(record.source?.objectName, "WHSE_FOREST_VEGETATION.BEC_BIOGEOCLIMATIC_POLY", "Object name");
  exact(record.source?.declaredCrs, "EPSG:3005", "Declared CRS");
  exact(record.source?.wfsFeatureCount, 17870, "WFS feature count");
  for (const [field, value] of Object.entries({
    catalogueUrl: record.source?.catalogueUrl,
    packageApiUrl: record.source?.packageApiUrl,
    licenceUrl: record.source?.licenceUrl,
    catalogueResourceUrl: record.source?.catalogueResourceUrl
  })) https(value, `Source ${field}`);
  exact(record.source?.licence, "Open Government Licence - British Columbia", "Licence");
  required(record.source?.attribution, "Attribution");

  exact(record.rightsAndBoundary?.catalogueDownloadAudience, "Public", "Catalogue audience");
  exact(record.rightsAndBoundary?.catalogueIsOpen, false, "Catalogue isopen");
  exact(record.rightsAndBoundary?.publicWfsFees, "NONE", "WFS fees");
  exact(record.rightsAndBoundary?.publicWfsAccessConstraints, "NONE", "WFS access constraints");
  exact(record.rightsAndBoundary?.publicServiceAuthenticationObserved, false, "Public service authentication");
  for (const field of ["newTermsAcceptancePerformed", "formsSubmitted", "personalInformationSubmitted", "paymentPerformed", "linksOpenedBeyondReadOnlyMetadata"]) exact(record.rightsAndBoundary?.[field], false, field);

  if (!Array.isArray(record.routes) || record.routes.length !== REQUIRED_ROUTES.length) throw new Error("All official BEC alternative routes must be recorded.");
  const routeIds = record.routes.map(route => route.id);
  if (new Set(routeIds).size !== routeIds.length || REQUIRED_ROUTES.some(id => !routeIds.includes(id))) throw new Error("The official route inventory is incomplete or duplicated.");
  for (const route of record.routes) {
    if (route.completeArtifact !== false) throw new Error(`${route.id} cannot claim a complete artifact.`);
    if (route.officialUrl) https(route.officialUrl, `${route.id} official URL`);
    if (route.officialUrls) for (const [index, value] of route.officialUrls.entries()) https(value, `${route.id} official URL ${index}`);
  }

  const custom = record.routes.find(route => route.id === "bcgw-custom-download");
  exact(custom.status, "blocked-before-order", "Custom download status");
  exact(custom.observed?.requiresEmail, true, "Custom email gate");
  exact(custom.observed?.requiresTermsAndConditionsCheckbox, true, "Custom terms gate");
  exact(custom.observed?.requiresSubmitAndContinue, true, "Custom submit gate");
  exact(custom.observed?.requiresProvinceIdentityOrAccountReview, true, "Custom identity gate");

  const wfs = record.routes.find(route => route.id === "public-wfs");
  exact(wfs.status, "public-but-no-coherent-snapshot", "WFS status");
  exact(wfs.observed?.numberMatched, 17870, "WFS numberMatched");
  exact(wfs.observed?.countDefault, 10000, "WFS count default");
  exact(wfs.observed?.pagingIsTransactionSafe, false, "WFS transaction-safe paging");
  exact(wfs.observed?.implementsFeatureVersioning, false, "WFS feature versioning");
  exact(wfs.observed?.schemaColumnCount, 20, "WFS schema column count");
  exact(wfs.existingDiagnostic?.requestedCount, 17870, "WFS diagnostic requested count");
  exact(wfs.existingDiagnostic?.returnedFeatureCount, 10000, "WFS diagnostic returned count");
  exact(wfs.existingDiagnostic?.zipIntegrity, "passed", "WFS diagnostic ZIP integrity");
  if (!SHA256.test(wfs.existingDiagnostic?.sha256 ?? "")) throw new Error("WFS diagnostic checksum is required.");
  exact(wfs.boundedRangeProbe?.responseStatus, 200, "WFS range response status");
  exact(wfs.boundedRangeProbe?.transferEncoding, "chunked", "WFS range transfer encoding");
  exact(wfs.boundedRangeProbe?.contentLength, null, "WFS range content length");
  if (!(wfs.boundedRangeProbe?.partialBytesObservedBeforeStop > 0)) throw new Error("WFS bounded probe must retain its observed lower bound.");
  exact(wfs.boundedRangeProbe?.responseRetained, false, "WFS bounded probe retention");

  const whse = record.routes.find(route => route.id === "arcgis-whse-layer21");
  exact(whse.observed?.count, 15666, "WHSE ArcGIS count");
  exact(whse.observed?.maxRecordCount, 1000, "WHSE ArcGIS max record count");
  exact(whse.observed?.supportsPagination, true, "WHSE ArcGIS pagination");
  exact(whse.observed?.serviceItemId, null, "WHSE ArcGIS service item id");
  exact(whse.observed?.timeInfo, null, "WHSE ArcGIS time info");
  exact(whse.observed?.editingInfo, null, "WHSE ArcGIS editing info");

  const mpcm = record.routes.find(route => route.id === "arcgis-mpcm-layer38");
  exact(mpcm.observed?.count, 17870, "MPCM ArcGIS count");
  exact(mpcm.observed?.maxRecordCount, 1000, "MPCM ArcGIS max record count");
  exact(mpcm.observed?.supportsPagination, true, "MPCM ArcGIS pagination");
  exact(mpcm.observed?.serviceItemId, null, "MPCM ArcGIS service item id");
  exact(mpcm.observed?.timeInfo, null, "MPCM ArcGIS time info");
  exact(mpcm.observed?.editingInfo, null, "MPCM ArcGIS editing info");

  const wms = record.routes.find(route => route.id === "wms");
  if (!wms.observed?.operations?.includes("GetMap") || !wms.observed?.operations?.includes("GetFeatureInfo") || wms.observed?.operations?.includes("GetFeature")) throw new Error("WMS must remain display-only.");
  exact(record.routes.find(route => route.id === "kml-loader").observed?.headStatus, 404, "KML loader status");

  const summary = record.routes.find(route => route.id === "hectare-summary");
  exact(summary.status, "supplemental-acquired-not-complete", "Hectare summary status");
  exact(summary.observed?.byteLength, 74839, "Hectare summary bytes");
  if (!SHA256.test(summary.observed?.sha256 ?? "")) throw new Error("Hectare summary checksum is required.");
  exact(summary.observed?.zipIntegrity, "passed", "Hectare summary integrity");
  exact(summary.observed?.geometryPresent, false, "Hectare summary geometry");
  exact(summary.observed?.vectorFeatureCount, null, "Hectare summary vector count");
  exact(summary.creditImpact, 0, "Hectare summary credit impact");

  exact(record.exhaustion?.lawfulPublicCompleteArtifactFound, false, "Complete public artifact finding");
  exact(record.exhaustion?.lawfulPublicServiceRoutesFound, true, "Public service route finding");
  for (const field of ["completeVectorAcquired", "completeVectorProfiled", "completeVectorChecksumBound", "archiveIntegrityVerified", "geometryValidityVerified", "vriFomTapChanged"]) exact(record.exhaustion?.[field], false, field);
  exact(record.exhaustion?.rawEvidenceCreditImpact, 0, "Raw evidence impact");
  exact(record.exhaustion?.productionEligibilityImpact, 0, "Production impact");
  if (!Array.isArray(record.exhaustion?.rowsAffected) || record.exhaustion.rowsAffected.length !== 1 || record.exhaustion.rowsAffected[0] !== "bc-old-growth-bec") throw new Error("Only the BEC row may be affected.");
  required(record.exhaustion?.conclusion, "Exhaustion conclusion");

  exact(record.ownerAction?.status, "prepared-unsent", "Owner action status");
  if (!record.ownerAction?.contacts?.includes("datamaps@gov.bc.ca") || !record.ownerAction.contacts.includes("FAIB.Data.Management@gov.bc.ca")) throw new Error("Publisher contacts are required.");
  if (!Array.isArray(record.ownerAction?.steps) || record.ownerAction.steps.length < 5) throw new Error("Complete owner action is required.");
  for (const field of ["sourceLedgerAdmitted", "transformed", "ingested", "productionAdmitted", "productionEligible"]) exact(record.admission?.[field], false, `Admission ${field}`);
  return record;
}

export async function checkPhase1BecPublicAlternativeExhaustion(file = new URL("../data/phase1-bec-public-alternative-exhaustion.json", import.meta.url)) {
  return validatePhase1BecPublicAlternativeExhaustion(JSON.parse(await readFile(file, "utf8")));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const record = await checkPhase1BecPublicAlternativeExhaustion(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/phase1-bec-public-alternative-exhaustion.json"));
  console.log(`BEC official-route exhaustion passed: ${record.routes.length} routes; no complete public artifact; ${record.source.wfsFeatureCount} WFS features remain unversioned/non-transaction-safe.`);
}
