import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HTTPS = /^https:\/\//;
const ROUTE_IDS = [
  "catalogue-api",
  "geohub-fri-page",
  "term2-web-map",
  "fmu-index-service",
  "romeo-malette-pilot-boundary",
  "romeo-malette-sample-downloads",
  "t1-packaged-products-v2"
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

function iso(value, field) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value ?? "")) throw new Error(`${field} must be a UTC timestamp.`);
}

export function validatePhase1OntarioFriTerm2RouteExhaustion(record, root = ROOT) {
  exact(record?.schemaVersion, 1, "Schema version");
  exact(record?.status, "no-complete-public-term2-package", "Status");
  iso(record?.auditedAt, "Audit timestamp");
  if (JSON.stringify(record?.canonicalRowIds) !== JSON.stringify(["on-fri", "on-fri-term-2"])) throw new Error("The two Ontario FRI rows must remain in scope.");
  required(record?.sourceRecord, "Source record");
  if (!existsSync(path.join(root, record.sourceRecord))) throw new Error("The existing Ontario FRI block record is required.");
  required(record?.nonClaimNotice, "Non-claim notice");

  const catalogue = record.officialSources?.catalogueApi;
  https(catalogue?.url, "Catalogue API URL");
  https(catalogue?.catalogueUrl, "Catalogue URL");
  exact(catalogue?.datasetId, "c4760737-da46-4653-bdf1-b87957260886", "Catalogue dataset id");
  exact(catalogue?.title, "Forest Resource Inventory Term 2 (T2) 2018-2028", "Catalogue title");
  exact(catalogue?.accessLevel, "open", "Catalogue access level");
  exact(catalogue?.isopen, false, "Catalogue isopen");
  exact(catalogue?.licenceId, "OGL-ON-1.0", "Catalogue licence id");
  exact(catalogue?.licence, "Open Government Licence – Ontario", "Catalogue licence");
  https(catalogue?.licenceUrl, "Catalogue licence URL");
  exact(catalogue?.resourceCount, 2, "Catalogue resource count");
  if (!Array.isArray(catalogue?.resources) || catalogue.resources.length !== 2) throw new Error("Exactly two catalogue resources are required.");
  for (const [index, resource] of catalogue.resources.entries()) {
    required(resource.id, `Catalogue resource ${index} id`);
    exact(resource.format, "WEB", `Catalogue resource ${index} format`);
    https(resource.url, `Catalogue resource ${index} URL`);
    exact(resource.size, null, `Catalogue resource ${index} size`);
  }

  const page = record.officialSources?.geoHubPage;
  https(page?.url, "GeoHub page URL");
  https(page?.itemMetadataUrl, "GeoHub page metadata URL");
  exact(page?.itemId, "70a76bb5dc8348b097773bb251c23303", "GeoHub page item id");
  exact(page?.itemStatus, "public_authoritative", "GeoHub page status");
  exact(page?.directions?.contact, "FRI@ontario.ca", "FRI contact");
  exact(page?.rangeLabels?.programOverview, "2018–2027", "Program range label");
  exact(page?.rangeLabels?.inventoryDevelopmentCard, "2018–2028", "Inventory card range label");

  const map = record.officialSources?.term2WebMap;
  for (const [field, value] of Object.entries({ aboutUrl: map?.aboutUrl, exploreUrl: map?.exploreUrl, itemMetadataUrl: map?.itemMetadataUrl, itemDataUrl: map?.itemDataUrl })) https(value, `Term 2 map ${field}`);
  exact(map?.itemId, "ca6def13e17540deb6e91d81e9cb2c89", "Term 2 map item id");
  exact(map?.itemType, "Web Map", "Term 2 map item type");
  exact(map?.access, "public", "Term 2 map access");
  exact(map?.operationalLayerCount, 2, "Term 2 map layer count");
  if (!Array.isArray(map?.operationalLayers) || map.operationalLayers.length !== 2) throw new Error("Term 2 map layers must remain exactly two boundary layers.");
  for (const layer of map.operationalLayers) https(layer.url, `${layer.title} URL`);

  const t1 = record.officialSources?.t1PackagedProductsV2;
  for (const field of ["aboutUrl", "itemMetadataUrl"]) https(t1?.[field], `T1 package ${field}`);
  exact(t1?.itemId, "9de0dad6f1b3435eb46df8ee49f4ecfd", "T1 package item id");
  exact(t1?.directZipLinkCount, 78, "T1 package direct ZIP count");
  exact(t1?.explicitFilenameYearRange?.[0], 2007, "T1 package first filename year");
  exact(t1?.explicitFilenameYearRange?.[1], 2016, "T1 package last filename year");

  const fmu = record.coverage?.fmuIndex;
  https(fmu?.serviceUrl, "FMU service URL");
  https(fmu?.queryCountUrl, "FMU count URL");
  exact(fmu?.featureCount, 39, "FMU feature count");
  exact(fmu?.geometryType, "esriGeometryPolygon", "FMU geometry type");
  exact(fmu?.crs, "EPSG:4269", "FMU CRS");
  exact(fmu?.fieldCount, 19, "FMU field count");

  const pilot = record.coverage?.pilotBoundary;
  https(pilot?.serviceUrl, "Pilot service URL");
  https(pilot?.queryUrl, "Pilot query URL");
  exact(pilot?.featureCount, 1, "Pilot feature count");
  exact(pilot?.fmuCode, "930", "Pilot FMU code");
  exact(pilot?.fmuName, "Romeo Malette Forest", "Pilot FMU name");
  exact(pilot?.geometryType, "esriGeometryPolygon", "Pilot geometry type");
  exact(pilot?.crs, "EPSG:3857", "Pilot CRS");
  exact(pilot?.fieldCount, 19, "Pilot field count");

  if (!Array.isArray(record.routes) || record.routes.length !== ROUTE_IDS.length) throw new Error("The official route inventory is incomplete.");
  const ids = record.routes.map(route => route.id);
  if (new Set(ids).size !== ids.length || ROUTE_IDS.some(id => !ids.includes(id))) throw new Error("The official route inventory is duplicated or missing a route.");
  for (const route of record.routes) {
    exact(route.completeArtifact, false, `${route.id} completeness`);
    https(route.officialUrl, `${route.id} official URL`);
    required(route.blocker, `${route.id} blocker`);
    if (route.additionalOfficialUrl) https(route.additionalOfficialUrl, `${route.id} additional official URL`);
  }

  if (!Array.isArray(record.artifacts) || record.artifacts.length !== 2) throw new Error("The two public pilot samples must be recorded.");
  const expected = new Map([
    ["rmf-fri-sample-set", [354025569, "W/\"354025569-1652369848000\"", "Thu, 12 May 2022 15:37:28 GMT"]],
    ["rmf-predictors-20m-sample-set", [1103374586, "W/\"1103374586-1652372816000\"", "Thu, 12 May 2022 16:26:56 GMT"]]
  ]);
  for (const artifact of record.artifacts) {
    const [bytes, etag, lastModified] = expected.get(artifact.id) ?? [];
    if (!bytes) throw new Error(`Unexpected Ontario FRI artifact ${artifact.id}.`);
    https(artifact.url, `${artifact.id} URL`);
    exact(artifact.observedHead?.status, 200, `${artifact.id} HEAD status`);
    exact(artifact.observedHead?.contentType, "application/zip", `${artifact.id} content type`);
    exact(artifact.observedHead?.contentLength, bytes, `${artifact.id} content length`);
    exact(artifact.observedHead?.etag, etag, `${artifact.id} ETag`);
    exact(artifact.observedHead?.lastModified, lastModified, `${artifact.id} last modified`);
    exact(artifact.expectedBytes, bytes, `${artifact.id} expected bytes`);
    exact(artifact.sha256, null, `${artifact.id} SHA-256`);
    exact(artifact.archiveIntegrity, "not-tested-no-download", `${artifact.id} archive state`);
    exact(artifact.schema, null, `${artifact.id} schema`);
    exact(artifact.crs, null, `${artifact.id} CRS`);
    exact(artifact.downloaded, false, `${artifact.id} downloaded state`);
    exact(artifact.completeArtifact, false, `${artifact.id} completeness`);
  }

  const findings = record.findings;
  exact(findings?.authoritativeDirectionsPublic, true, "Authoritative directions finding");
  for (const field of ["completeTerm2PackageAvailable", "lawfulPublicCompleteArtifactFound", "packageSchemaPublished", "packageCrsPublished", "packageFeatureCountPublished", "coherentReproducibleSnapshot", "dateLabelConflict"]) exact(findings?.[field], field === "dateLabelConflict", `${field} finding`);
  exact(findings?.completePackageExpectedBytes, null, "Complete package bytes");
  exact(findings?.completePackageSha256, null, "Complete package SHA-256");
  required(findings?.conclusion, "Conclusion");

  exact(record.rights?.catalogueLicence, "Open Government Licence – Ontario", "Catalogue rights");
  exact(record.rights?.mapLicence, "Open Government Licence – Ontario", "Map rights");
  exact(record.rights?.exactPackageReuseConfirmed, false, "Exact package rights confirmation");
  exact(record.rights?.status, "unsettled-for-released-package", "Rights status");

  exact(record.ownerAction?.status, "prepared-unsent", "Owner action status");
  if (!record.ownerAction.contacts?.includes("FRI@ontario.ca")) throw new Error("FRI owner contact is required.");
  if (!Array.isArray(record.ownerAction.steps) || record.ownerAction.steps.length < 5) throw new Error("Owner action must be complete.");
  for (const field of ["sent", "formSubmitted", "personalInformationSubmitted", "termsAccepted", "paymentPerformed"]) exact(record.ownerAction[field], false, `Owner action ${field}`);

  if (JSON.stringify(record.phase1Impact?.rowsAffected) !== JSON.stringify(["on-fri", "on-fri-term-2"])) throw new Error("Both Ontario FRI rows must be affected.");
  for (const field of ["preserveAccessBlocked", "sourceLedgerChanged", "artifactAcquired", "archiveCreated", "schemaProfiled", "geometryValidated", "phase2Started"]) exact(record.phase1Impact?.[field], field === "preserveAccessBlocked", `Phase 1 ${field}`);
  exact(record.phase1Impact?.rawEvidenceCreditImpact, 0, "Raw evidence credit impact");
  exact(record.phase1Impact?.productionEligibilityImpact, 0, "Production impact");
  return record;
}

export async function checkPhase1OntarioFriTerm2RouteExhaustion(file = new URL("../data/phase1-ontario-fri-term2-route-exhaustion.json", import.meta.url)) {
  return validatePhase1OntarioFriTerm2RouteExhaustion(JSON.parse(await readFile(file, "utf8")), path.resolve(path.dirname(fileURLToPath(file)), ".."));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const record = await checkPhase1OntarioFriTerm2RouteExhaustion();
  console.log(`Ontario FRI Term 2 route exhaustion passed: ${record.routes.length} official routes; no complete package; ${record.coverage.fmuIndex.featureCount} FMU index features; ${record.artifacts.length} pilot sample heads only.`);
}
