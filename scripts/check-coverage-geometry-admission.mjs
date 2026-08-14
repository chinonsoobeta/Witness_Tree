import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROVINCES = new Set(["BC", "AB", "ON", "QC"]);
const SHA256 = /^[a-f0-9]{64}$/;
const HTTPS = /^https:\/\//;
const FTP = /^ftp:\/\//;
const BC_TERRESTRIAL_FTP = "ftp://ftp.geobc.gov.bc.ca/sections/outgoing/bmgs/BC_Boundary_Terrestrial/BC_Boundary_Terrestrial.gdb.zip";
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const FORBIDDEN_PROOF = /\b(?:example|fixture|illustrative|latitude(?:[- ]?proxy)?|latitudeproxy)\b/i;
const FORBIDDEN_PARTIAL_CLAIM = /\b(?:land[ -]?base|province[ -]?wide|all\s+alberta|complete\s+alberta|all\s+forest\s+land)\b/i;

function text(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  if (FORBIDDEN_PROOF.test(value)) throw new Error(`${field} cannot use example, fixture, illustrative, or latitude-proxy evidence.`);
}

function https(value, field) {
  text(value, field);
  if (!HTTPS.test(value)) throw new Error(`${field} must use HTTPS.`);
}

function sha256(value, field) {
  text(value, field);
  if (!SHA256.test(value)) throw new Error(`${field} must be a lowercase SHA-256.`);
}

function finite(value, field, minimum = -Infinity) {
  if (!Number.isFinite(value) || value <= minimum) throw new Error(`${field} must be finite and greater than ${minimum}.`);
}

function timestamp(value, field) {
  text(value, field);
  if (!ISO_TIMESTAMP.test(value) || Number.isNaN(new Date(value).getTime())) throw new Error(`${field} must be a UTC timestamp.`);
}

function localEvidencePath(value, field) {
  text(value, field);
  if (!value.startsWith("../Witness_Tree-data/") || value.includes("..", "../Witness_Tree-data/".length)) {
    throw new Error(`${field} must be a normalized Witness_Tree-data evidence path.`);
  }
}

function rejectForbiddenProof(value, path = "manifest") {
  if (typeof value === "string") {
    if (FORBIDDEN_PROOF.test(value)) throw new Error(`${path} cannot use example, fixture, illustrative, or latitude-proxy evidence.`);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_PROOF.test(key)) throw new Error(`${path}.${key} cannot use example, fixture, illustrative, or latitude-proxy evidence.`);
    rejectForbiddenProof(nested, `${path}.${key}`);
  }
}

function validateLayer(layer) {
  if (!layer || typeof layer !== "object") throw new Error("Coverage layer is required.");
  if (!new Set(["versioned-source-geometry", "lineage-bound-derived-geometry"]).has(layer.evidenceClass)) throw new Error("Coverage requires source geometry or lineage-bound derived geometry evidence.");
  text(layer.sourceId, "sourceId");
  if (!PROVINCES.has(layer.province)) throw new Error("Coverage layer must name a required province.");
  text(layer.edition, "edition");
  text(layer.crs, "crs");
  sha256(layer.checksumSha256, "checksumSha256");
  https(layer.sourceUrl, "sourceUrl");
  if (layer.resourceUrl !== undefined) {
    text(layer.resourceUrl, "resourceUrl");
    if (layer.sourceId !== "bc-boundary-terrestrial" || layer.resourceUrl !== BC_TERRESTRIAL_FTP || !FTP.test(layer.resourceUrl)) throw new Error("Only the BC terrestrial reference source may retain its official FTP resource URL.");
  }

  const extent = layer.extent;
  if (!extent || typeof extent !== "object") throw new Error("Coverage extent is required.");
  for (const field of ["west", "south", "east", "north"]) finite(extent[field], `extent.${field}`);
  if (extent.west >= extent.east || extent.south >= extent.north) throw new Error("Coverage extent must have west < east and south < north.");
  finite(layer.areaSquareKilometres, "areaSquareKilometres", 0);

  const profile = layer.profile;
  if (!profile || typeof profile !== "object") throw new Error("Coverage validity/profile evidence is required.");
  text(profile.evidenceId, "profile.evidenceId");
  timestamp(profile.profiledAt, "profile.profiledAt");
  if (profile.evidenceUrl !== undefined) https(profile.evidenceUrl, "profile.evidenceUrl");
  else if (profile.evidencePath !== undefined) localEvidencePath(profile.evidencePath, "profile.evidencePath");
  else localEvidencePath(profile.evidenceLocalPath, "profile.evidenceLocalPath");
  sha256(profile.evidenceChecksumSha256, "profile.evidenceChecksumSha256");
  if (layer.evidenceClass === "versioned-source-geometry") sha256(profile.geometryChecksumSha256, "profile.geometryChecksumSha256");
  text(profile.geometryType, "profile.geometryType");
  if (!Number.isSafeInteger(profile.featureCount) || profile.featureCount <= 0) throw new Error("profile.featureCount must be a positive safe integer.");
  if (!Number.isSafeInteger(profile.invalidGeometryCount) || profile.invalidGeometryCount < 0) throw new Error("profile.invalidGeometryCount must be a known non-negative integer.");
  if (profile.validity !== "passed") throw new Error("Coverage profile validity must have passed.");

  const licence = layer.licence;
  if (!licence || typeof licence !== "object") throw new Error("Coverage licence evidence is required.");
  text(licence.id, "licence.id");
  https(licence.url, "licence.url");
  text(layer.attribution, "attribution");

  if (layer.province === "BC" && layer.coverageClass === "national-baseline-jurisdiction-reference") {
    const scope = layer.scope;
    if (!scope || typeof scope !== "object") throw new Error("BC reference scope is required.");
    if (scope.decision !== "jurisdiction-reference-only") throw new Error("BC scope must be jurisdiction reference only.");
    if (scope.coverageWithinBoundary !== "national-baseline") throw new Error("BC reference geometry must retain the national baseline.");
    if (scope.forestLandBaseDenominator !== false) throw new Error("BC reference geometry cannot be a forest land-base denominator.");
    if (scope.enhancedRecordCoverage !== false) throw new Error("BC reference geometry cannot enable enhanced records.");
    text(scope.limitation, "BC reference limitation");
  } else if (layer.province === "ON" && layer.coverageClass === "national-baseline-plus-managed-forest-context") {
    const scope = layer.scope;
    if (!scope || typeof scope !== "object") throw new Error("Ontario context scope is required.");
    if (scope.decision !== "crown-forest-planning-unit-context-only") throw new Error("Ontario scope must be Crown-forest planning-unit context only.");
    if (scope.outsideBoundaryCoverage !== "national-baseline") throw new Error("Ontario areas outside the planning-unit boundary must retain the national baseline.");
    if (scope.forestLandBaseDenominator !== false) throw new Error("Ontario planning-unit context cannot be a forest land-base denominator.");
    if (scope.enhancedRecordCoverage !== false) throw new Error("Ontario context cannot enable enhanced records.");
    text(scope.enhancedRecordCondition, "Ontario enhancedRecordCondition");
  } else if (layer.evidenceClass === "lineage-bound-derived-geometry") {
    if (layer.coverageScope !== "partial-known-coverage") throw new Error("Derived coverage must be explicitly partial known coverage.");
    if (layer.coverageGrade !== "national-baseline-plus-local-context") throw new Error("Partial known coverage must use national-baseline-plus-local-context.");
    if (!Array.isArray(layer.inputEvidence) || layer.inputEvidence.length < 2) throw new Error("Derived coverage requires at least two lineage-bound inputs.");
    for (const [index, input] of layer.inputEvidence.entries()) {
      if (!input || typeof input !== "object") throw new Error(`inputEvidence.${index} is required.`);
      text(input.sourceId, `inputEvidence.${index}.sourceId`);
      sha256(input.checksumSha256, `inputEvidence.${index}.checksumSha256`);
      https(input.sourceUrl, `inputEvidence.${index}.sourceUrl`);
    }
    const claims = [layer.scopeNotice, layer.claims].filter((value) => typeof value === "string").join(" ");
    text(claims, "Derived coverage scope notice");
    if (FORBIDDEN_PARTIAL_CLAIM.test(claims)) throw new Error("Partial known coverage cannot claim a land base, province-wide, all-Alberta, or all-forest-land extent.");
  } else if (layer.coverageClass !== "land-base") {
    throw new Error("Source geometry must be land-base geometry unless it is an approved bounded reference/context exception.");
  }
  if (layer.province === "BC" && layer.sourceId === "bc-boundary-terrestrial" && layer.coverageClass === "land-base") throw new Error("BC terrestrial boundary cannot be admitted as BC land-base geometry.");
}

/**
 * Validates evidence only. It does not read geometry, infer coverage from a
 * coordinate, fetch a source, or admit any land-base coverage by default.
 */
export function validateCoverageGeometryAdmission(manifest) {
  if (!manifest || typeof manifest !== "object") throw new Error("Coverage admission manifest is required.");
  rejectForbiddenProof(manifest);
  if (manifest.schemaVersion !== "1.0") throw new Error("Coverage admission schemaVersion must be 1.0.");
  if (!new Set(["pending-evidence", "partial", "complete"]).has(manifest.status)) throw new Error("Coverage admission status is invalid.");
  text(manifest.notice, "notice");
  if (!Array.isArray(manifest.layers)) throw new Error("Coverage layers must be an array.");
  const provinces = new Set();
  for (const layer of manifest.layers) {
    validateLayer(layer);
    if (provinces.has(layer.province)) throw new Error("Only one land-base coverage layer per province is allowed.");
    provinces.add(layer.province);
  }
  const decisions = manifest.requiredProvinceDecisions;
  if (!decisions || typeof decisions !== "object") throw new Error("Required province decisions are required.");
  for (const key of ["ontarioManagedForest", "quebecSouthOf52"]) {
    if (!new Set(["pending", "approved"]).has(decisions[key])) throw new Error(`${key} must be pending or approved.`);
  }
  if (manifest.status === "pending-evidence" && manifest.layers.length !== 0) throw new Error("Pending evidence cannot admit coverage layers.");
  if (manifest.status === "partial" && manifest.layers.length === 0) throw new Error("Partial coverage requires at least one admitted bounded layer.");
  if (manifest.status === "complete") {
    if (provinces.size !== PROVINCES.size || [...PROVINCES].some((province) => !provinces.has(province))) throw new Error("Complete coverage requires versioned geometry evidence for BC, AB, ON, and QC.");
    if (decisions.ontarioManagedForest !== "approved") throw new Error("Complete coverage requires the Ontario managed-forest decision.");
    if (decisions.quebecSouthOf52 !== "approved") throw new Error("Complete coverage requires the Québec south-of-52 decision.");
  }
  return manifest;
}

export async function checkCoverageGeometryAdmission(file = new URL("../data/coverage-geometry-admission.json", import.meta.url)) {
  return validateCoverageGeometryAdmission(JSON.parse(await readFile(file, "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const manifest = await checkCoverageGeometryAdmission(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/coverage-geometry-admission.json"));
  console.log(`Coverage geometry admission passed with ${manifest.layers.length} admitted coverage-evidence layers.`);
}
