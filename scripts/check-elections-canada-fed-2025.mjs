import { readFile } from "node:fs/promises";

const SHA256 = "4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93";
const SOURCE_URL = "https://www.elections.ca/res/cir/mapsCorner/vector/FederalElectoralDistricts_2025_SHP.zip";
const LISTING_URL = "https://www.elections.ca/content.aspx?dir=cir%2FmapsCorner%2Fvector&document=index&lang=e&section=res";
const REQUIRED_FIELDS = [
  ["FED_NUM", "Integer64", 10],
  ["ED_NAMEE", "String", 100],
  ["ED_NAMEF", "String", 100],
  ["REPORDER", "String", 8],
  ["SHAPE_Leng", "Real", 19, 11],
  ["SHAPE_Area", "Real", 19, 11],
];

function required(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
}
function timestamp(value, field) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value ?? "") || Number.isNaN(new Date(value).getTime())) throw new Error(`${field} must be a UTC timestamp.`);
}
function https(value, field) {
  required(value, field);
  if (!value.startsWith("https://")) throw new Error(`${field} must use HTTPS.`);
}

export function validateElectionsCanadaFed2025(ledger, profile) {
  if (ledger?.status !== "local-staging-source-ledger") throw new Error("Source ledger must remain local-staging-source-ledger.");
  if (!/not immutable object storage/i.test(ledger.notice ?? "") || !/not .*production/i.test(ledger.notice ?? "")) throw new Error("Source ledger must retain staging limits.");
  const source = ledger.source;
  if (!source || source.id !== "elections-canada-federal-electoral-districts-45th-general-election-2025-shp") throw new Error("Unexpected Elections Canada source identity.");
  if (source.publisher !== "Elections Canada") throw new Error("Publisher must be Elections Canada.");
  if (source.sourceUrl !== SOURCE_URL || source.officialListingUrl !== LISTING_URL) throw new Error("The exact official 45th-election ZIP link is required.");
  https(source.officialListingUrl, "Official listing URL"); https(source.officialCurrentOrderUrl, "Current-order URL"); https(source.sourceUrl, "Source URL");
  if (source.sourceVersion !== "FederalElectoralDistricts_2025_SHP.zip" || source.representationOrder !== "2023") throw new Error("The current release and representation order changed.");
  if (!/45th general election/i.test(source.currentEditionBasis ?? "") || !/2025-03-23/.test(source.currentEditionBasis ?? "")) throw new Error("Current-edition basis is incomplete.");
  if (source.sha256 !== SHA256 || !/^[a-f0-9]{64}$/.test(source.sha256)) throw new Error("Archive SHA-256 changed.");
  if (source.http?.contentLength !== 10301648 || source.http?.lastModified !== "2025-11-25T17:58:54Z" || source.http?.etag !== "f869df29355edc1:0") throw new Error("Official HTTP provenance changed.");
  timestamp(source.retrievedAt, "Retrieved time"); timestamp(source.verifiedAt, "Verified time"); timestamp(source.http.observedAt, "HTTP observation time");
  if (source.zipIntegrity !== "passed" || source.zipEntryCount !== 9 || !Array.isArray(source.archiveMembers) || source.archiveMembers.length !== 9) throw new Error("ZIP integrity evidence changed.");
  if (!source.archiveMembers.includes("SHP/FED_CA_2025_EN.shp") || !source.archiveMembers.includes("SHP/Data Dictionary.pdf")) throw new Error("Required archive members are missing.");
  if (source.licence?.id !== "ogl-canada-2.0" || source.licence?.name !== "Open Government Licence – Canada, version 2.0" || source.licence?.requiredAttribution !== "Contains information licensed under the Open Government Licence – Canada.") throw new Error("OGL Canada attribution evidence changed.");
  https(source.licence.url, "Licence URL");
  if (source.immutableObjectStorage !== false || source.productionEligible !== false) throw new Error("Local staging cannot claim immutable or production status.");

  if (profile?.status !== "local-staging-profile" || profile.sourceId !== source.id || profile.inputSha256 !== SHA256 || profile.productionEligible !== false) throw new Error("Profile is not bound to the staged source.");
  if (!/No source geometry was changed/i.test(profile.notice ?? "")) throw new Error("Profile must retain read-only limit.");
  timestamp(profile.profiledAt, "Profile time");
  if (profile.tools?.gdal !== "3.13.2") throw new Error("GDAL evidence changed.");
  const layer = profile.layer;
  if (!layer || layer.path !== "SHP/FED_CA_2025_EN.shp" || layer.name !== "FED_CA_2025_EN" || layer.geometryType !== "Polygon") throw new Error("Layer identity changed.");
  if (layer.featureCount !== 352 || layer.distinctFederalDistrictCount !== 343) throw new Error("Feature and distinct-district counts changed.");
  if (layer.representationOrderField !== "REPORDER" || JSON.stringify(layer.representationOrderValues) !== JSON.stringify(["2023"])) throw new Error("Representation-order evidence changed.");
  if (layer.encoding !== "UTF-8" || layer.bilingualNames?.englishField !== "ED_NAMEE" || layer.bilingualNames?.frenchField !== "ED_NAMEF") throw new Error("Bilingual-name evidence changed.");
  if (layer.geometryValidation?.missingGeometryCount !== 0 || layer.geometryValidation?.emptyGeometryCount !== 0 || layer.geometryValidation?.invalidGeometryCount !== 0) throw new Error("Geometry-validity evidence changed.");
  if (layer.crs?.name !== "PCS_Lambert_Conformal_Conic" || layer.crs?.datum !== "NAD83" || layer.crs?.unit !== "metre" || layer.crs?.authority !== null) throw new Error("CRS identity changed.");
  const parameters = layer.crs.parameters;
  if (!parameters || parameters.latitudeOfFalseOrigin !== 63.390675 || parameters.longitudeOfFalseOrigin !== -91.8666666666667 || parameters.standardParallel1 !== 49 || parameters.standardParallel2 !== 77 || parameters.falseEasting !== 6200000 || parameters.falseNorthing !== 3000000) throw new Error("CRS parameters changed.");
  if (JSON.stringify(layer.extent) !== JSON.stringify([3658201.494286, 658872.974286, 9019156.614286, 6083004.851429])) throw new Error("Layer extent changed.");
  if (!Array.isArray(layer.fields) || layer.fields.length !== REQUIRED_FIELDS.length) throw new Error("Schema field count changed.");
  for (const [index, expected] of REQUIRED_FIELDS.entries()) {
    const field = layer.fields[index];
    if (!field || field.name !== expected[0] || field.type !== expected[1] || field.width !== expected[2] || (expected[3] !== undefined && field.precision !== expected[3])) throw new Error(`Schema field ${expected[0]} changed.`);
  }
  if (!/343 distinct FED_NUM/.test(layer.featureCountExplanation ?? "") || !/FED_NUM with representation order 2023/.test(layer.identifierWarning ?? "")) throw new Error("Identifier and multipart warnings are required.");
  return { ledger, profile };
}

export async function checkElectionsCanadaFed2025(ledgerFile = new URL("../data/elections-canada-fed-2025-source-ledger.json", import.meta.url), profileFile = new URL("../data/elections-canada-fed-2025-profile.json", import.meta.url)) {
  return validateElectionsCanadaFed2025(JSON.parse(await readFile(ledgerFile, "utf8")), JSON.parse(await readFile(profileFile, "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await checkElectionsCanadaFed2025();
  console.log("Current Elections Canada 45th-general-election federal-boundary evidence passed.");
}
