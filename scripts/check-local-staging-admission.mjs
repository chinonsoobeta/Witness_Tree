import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { validateLocalAdmission } from "../lib/archive-staging/admission.ts";
import { validateStagedAcquisitions } from "./check-staged-acquisitions.mjs";
import { validateStagedGeospatialProfile } from "./check-staged-geospatial-profile.mjs";

/**
 * Cross-checks recorded acquisition and profiling metadata only. It does not inspect
 * payload bytes, retrieve sources, transform data, or make any release claim.
 */
export function validateRecordedLocalAdmissions(acquisitions, profile) {
  validateStagedAcquisitions(acquisitions);
  validateStagedGeospatialProfile(profile);
  const profiles = new Map(profile.sources?.map((source) => [source.sourceId, source]));
  for (const source of profile.sources ?? []) {
    if (!acquisitions.entries.some((entry) => entry.sourceId === source.sourceId)) throw new Error(`Missing recorded staging metadata for ${source.sourceId}.`);
  }
  const admissions = (acquisitions.entries ?? []).filter((entry) => profiles.has(entry.sourceId)).map((entry) => {
    const profiled = profiles.get(entry.sourceId);
    if (!profiled) throw new Error(`Missing recorded geometry evidence for ${entry.sourceId}.`);
    if (profiled.inputSha256?.toLowerCase() !== entry.sha256.toLowerCase()) throw new Error(`Recorded geometry evidence checksum must match staged acquisition for ${entry.sourceId}.`);
    const sourceVersion = entry.localPath.split("/").at(-2);
    return validateLocalAdmission({
      status: "local-staging-admission-candidate",
      sourceId: entry.sourceId,
      sourceVersion,
      retrievedAt: entry.verifiedAt,
      input: { byteLength: entry.byteLength, sha256: entry.sha256, localPath: entry.localPath },
      release: { production: false, ingested: false, immutableObjectStorage: false },
      geometryEvidence: profiled.layers.map((layer) => ({
        layer: layer.name,
        geometryType: layer.geometryType,
        featureCount: layer.featureCount,
        missingGeometryCount: layer.missingGeometryCount,
        emptyGeometryCount: layer.emptyGeometryCount,
        invalidGeometryCount: layer.invalidGeometryCount,
        invalidGeometryReasons: layer.invalidGeometryReasons,
      })),
    }, {
      sourceId: entry.sourceId,
      sourceVersion,
      retrievedAt: entry.verifiedAt,
      byteLength: entry.byteLength,
      sha256: entry.sha256,
      publisher: entry.publisher,
      catalogueUrl: entry.catalogueUrl,
      requestedUrl: entry.sourceUrl,
      licenceId: entry.licenceId,
      licenceUrl: entry.licenceUrl,
      requiredAttribution: entry.attribution,
      changesNotice: entry.changesNotice,
      localPath: entry.localPath,
    });
  });
  return admissions;
}

export async function checkLocalStagingAdmission(acquisitionFile = new URL("../data/staged-acquisitions.json", import.meta.url), profileFile = new URL("../data/staged-geospatial-profile.json", import.meta.url)) {
  const [acquisitions, profile] = await Promise.all([readFile(acquisitionFile, "utf8"), readFile(profileFile, "utf8")]);
  return validateRecordedLocalAdmissions(JSON.parse(acquisitions), JSON.parse(profile));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const base = path.dirname(fileURLToPath(import.meta.url));
  const admissions = await checkLocalStagingAdmission(path.resolve(base, "../data/staged-acquisitions.json"), path.resolve(base, "../data/staged-geospatial-profile.json"));
  console.log(`Local staging admission passed for ${admissions.length} recorded candidate${admissions.length === 1 ? "" : "s"}.`);
}
