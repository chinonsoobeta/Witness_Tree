import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HTTPS = /^https:\/\//;
const REVIEW_FIELDS = ["storageReviewed", "computeReviewed", "checksumPlanReviewed", "attributionReviewed", "sourceSelected"];
const REVIEW_UNRESOLVED_FIELDS = new Map([
  ["storageReviewed", "Storage"],
  ["computeReviewed", "Compute"],
  ["checksumPlanReviewed", "Checksum"],
  ["attributionReviewed", "Attribution"],
]);
const FORBIDDEN_FIELDS = /(?:retriev|ingest|checksum)/i;
const EXPECTED = new Map([
  ["nrcan-annual-land-cover-v2", {
    bytes: 58954694668, annualFiles: 39, sourceVersion: "Version 2", licence: "Open Government Licence – Canada", updateCadence: "as-needed", temporalCoverage: "1984-2022",
    urlTemplate: "https://opendata.nfis.org/downloads/forest_change/CA_forest_VLCE2_{YEAR}.zip",
  }],
  ["qc-current-ecoforest", {
    bytes: 12399475076, licence: "CC BY 4.0", updateCadence: "annual",
    url: "https://diffusion.mffp.gouv.qc.ca/Diffusion/DonneeGratuite/Foret/DONNEES_FOR_ECO_SUD/Cartes_ecoforestieres_perturbations/02-Donnees/PROV/CARTE_ECO_MAJ_PROV_GPKG.zip",
  }],
  ["qc-historic-wildfire-detailed", {
    bytes: 414244435, licence: "CC BY 4.0", updateCadence: "annual", temporalCoverage: "since 1976; catalogue temporal endpoint 2024",
    url: "https://diffusion.mffp.gouv.qc.ca/Diffusion/DonneeGratuite/Foret/PERTURBATIONS_NATURELLES/Feux_foret/02-Donnees/PROV/FEUX_PROV_GPKG.zip",
  }],
  ["alberta-avi-crown", {
    bytes: 557041258, format: "FGDB ZIP", licence: "Open Government Licence - Alberta", updateCadence: "irregular", lastModified: "2022-03-24T19:21:24Z",
    url: "https://extranet.gov.ab.ca/srd/geodiscover/srd_pub/biota/AlbertaVegetationInventoryCrown.zip",
  }],
  ["ontario-fri-term-2-2018-2028", {
    kind: "discovery-blocked",
    catalogueUrl: "https://data.ontario.ca/dataset/forest-resource-inventory-term-2-t2-2018-2028",
  }],
]);

function requiredString(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
}

function isoDate(value, field) {
  requiredString(value, field);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error(`${field} must be an ISO date.`);
}

function httpsUrl(value, field) {
  requiredString(value, field);
  if (!HTTPS.test(value)) throw new Error(`${field} must be HTTPS.`);
}

function rejectForbiddenFields(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_FIELDS.test(key) && key !== "checksumPlanReviewed") throw new Error("Readiness registry must contain HEAD observations only, not retrieval, checksum, or ingestion metadata.");
    rejectForbiddenFields(nested);
  }
}

export function validateAcquisitionReadiness(registry) {
  if (!registry || registry.status !== "audit-observed") throw new Error("Registry status must be audit-observed.");
  requiredString(registry.notice, "Notice");
  if (!Array.isArray(registry.sources) || registry.sources.length !== EXPECTED.size) throw new Error("Registry must contain the audited sources.");
  rejectForbiddenFields(registry);
  const ids = new Set();
  for (const source of registry.sources) {
    if (!source || typeof source !== "object") throw new Error("Source is required.");
    requiredString(source.id, "Source id");
    if (ids.has(source.id) || !EXPECTED.has(source.id)) throw new Error("Source ids must be the audited source ids and unique.");
    ids.add(source.id);
    const expected = EXPECTED.get(source.id);
    if (expected.kind === "discovery-blocked") {
      if (source.kind !== "discovery-blocked") throw new Error("Ontario FRI must remain a blocked discovery record.");
      requiredString(source.publisher, "publisher"); requiredString(source.datasetTitle, "datasetTitle"); httpsUrl(source.catalogueUrl, "Catalogue URL");
      if ("url" in source || "urlTemplate" in source || "head" in source || "format" in source) throw new Error("Discovery records must not claim a verified data URL, format, or HEAD size.");
    } else {
      if (source.kind !== undefined) throw new Error("HEAD-observed sources must not be discovery records.");
      for (const field of ["publisher", "datasetTitle", "format", "licence", "updateCadence"]) requiredString(source[field], field);
      httpsUrl(source.url ?? source.urlTemplate, "Source URL");
      if (!source.head || typeof source.head !== "object") throw new Error("HEAD observation is required.");
      isoDate(source.head.observedOn, "HEAD observation date");
      if (source.head.observedTimezone !== "America/Vancouver") throw new Error("HEAD observation timezone must be America/Vancouver.");
      if (!Number.isSafeInteger(source.head.contentLengthBytes) || source.head.contentLengthBytes <= 0) throw new Error("HEAD content length must be a positive safe integer.");
      if (source.head.contentLengthBytes !== expected.bytes) throw new Error(`HEAD content length for ${source.id} must match the audited total.`);
      if (expected.annualFiles && source.annualFiles !== expected.annualFiles) throw new Error("NRCan annual file count must be 39.");
      if (expected.lastModified && source.head.lastModified !== expected.lastModified) throw new Error("Alberta HEAD last-modified value must match the audited header.");
    }
    for (const field of ["kind", "url", "urlTemplate", "catalogueUrl", "sourceVersion", "format", "licence", "updateCadence", "temporalCoverage"]) {
      if (expected[field] !== undefined && source[field] !== expected[field]) throw new Error(`${field} for ${source.id} must match the audited fact.`);
    }
    if (!Array.isArray(source.unresolvedFields) || source.unresolvedFields.length === 0 || source.unresolvedFields.some((field) => typeof field !== "string" || !field.trim())) throw new Error("Unresolved fields are required.");
    for (const field of REVIEW_FIELDS) if (typeof source[field] !== "boolean") throw new Error(`${field} must be boolean.`);
    for (const [review, unresolved] of REVIEW_UNRESOLVED_FIELDS) {
      if (source[review] === source.unresolvedFields.includes(unresolved)) throw new Error(`${review} must correspond to the ${unresolved} unresolved field.`);
    }
    if (source.productionEligible !== false) throw new Error("Sources must remain production ineligible.");
  }
  if (ids.size !== EXPECTED.size) throw new Error("Registry is missing an audited source.");
  return registry;
}

export async function checkAcquisitionReadiness(file = new URL("../data/acquisition-readiness.json", import.meta.url)) {
  return validateAcquisitionReadiness(JSON.parse(await readFile(file, "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const registry = await checkAcquisitionReadiness(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/acquisition-readiness.json"));
  console.log(`Acquisition readiness passed for ${registry.sources.length} audit-observed sources.`);
}
