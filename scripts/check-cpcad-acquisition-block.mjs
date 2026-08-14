import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SHA256 = /^[a-f0-9]{64}$/;
const HTTPS = /^https:\/\//;

function requiredString(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
}

export function validateCpcadAcquisitionBlock(record) {
  if (!record || record.status !== "blocked-incomplete-snapshot") throw new Error("CPCAD must remain blocked as an incomplete snapshot.");
  if (record.sourceId !== "canadian-protected-and-conserved-areas-database") throw new Error("Unexpected CPCAD source ID.");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(record.retrievedAt)) throw new Error("CPCAD retrieval instant must be UTC.");
  requiredString(record.notice, "Notice");
  for (const field of ["catalogueUrl", "layerUrl"]) if (!HTTPS.test(record[field])) throw new Error(`${field} must be HTTPS.`);
  if (record.licence?.id !== "ogl-canada" || !HTTPS.test(record.licence?.officialUrl)) throw new Error("CPCAD licence must be the official OGL-Canada record.");
  if (record.snapshotIdentity?.kind !== "retrieval-instant") throw new Error("Snapshot identity must not invent a publisher edition.");
  for (const field of ["layerMetadataSha256", "objectIdManifestSha256"]) if (!SHA256.test(record.snapshotIdentity?.[field] ?? "")) throw new Error(`${field} must be a SHA-256.`);
  const service = record.serviceReadback;
  if (!service || service.objectIdField !== "OBJECTID" || service.featureCount !== 22438 || service.minimumObjectId !== 1 || service.maximumObjectId !== 22438 || service.objectIdsUniqueAndContiguous !== true || service.geometryType !== "esriGeometryPolygon" || service.crs !== "EPSG:3978" || service.maxRecordCount !== 25000 || service.supportsPagination !== true || service.supportsOrderBy !== true) throw new Error("CPCAD service readback has drifted.");
  const partial = record.partialRetrieval;
  if (!partial || partial.complete !== false || partial.canonicalArtifactCreated !== false || partial.profileCreated !== false || partial.savedGeoJsonPages !== 45 || partial.savedFeatureCount !== 21782 || partial.firstObjectId !== 1 || partial.lastObjectId !== 22000 || partial.bytes !== 631532464) throw new Error("CPCAD partial retrieval must remain explicitly unusable.");
  const defect = record.geometryDefect;
  if (!defect || defect.objectId !== 21563 || defect.attributesOnly?.httpStatus !== 200 || defect.attributesOnly?.featureCount !== 1 || !SHA256.test(defect.attributesOnly?.sha256 ?? "") || defect.esriJsonGeometry?.httpStatus !== 200 || defect.esriJsonGeometry?.arcgisErrorCode !== 500 || !SHA256.test(defect.esriJsonGeometry?.sha256 ?? "") || !/timed out/i.test(defect.geoJsonGeometry?.result ?? "")) throw new Error("CPCAD geometry defect evidence is incomplete.");
  for (const field of ["immutable", "transformed", "ingested", "productionEligible"]) if (record.staging?.[field] !== false) throw new Error(`CPCAD must not claim ${field}.`);
  requiredString(record.ownerAction, "Owner action");
  return record;
}

export async function checkCpcadAcquisitionBlock(file = new URL("../data/cpcad-acquisition-block.json", import.meta.url)) {
  return validateCpcadAcquisitionBlock(JSON.parse(await readFile(file, "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await checkCpcadAcquisitionBlock(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/cpcad-acquisition-block.json"));
  console.log("CPCAD incomplete-snapshot block passed.");
}
