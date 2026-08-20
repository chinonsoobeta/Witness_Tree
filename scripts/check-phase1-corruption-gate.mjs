import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateAcquisitionReadiness } from "./check-acquisition-readiness.mjs";
import { validateStagedAcquisitions } from "./check-staged-acquisitions.mjs";
import { validateStagedGeospatialProfile } from "./check-staged-geospatial-profile.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const readJson = async (relativePath) => JSON.parse(await readFile(path.join(ROOT, relativePath), "utf8"));

function mustReject(label, callback) {
  try {
    callback();
  } catch {
    return { id: label, rejected: true };
  }
  throw new Error(`Phase 1 corruption probe was admitted: ${label}.`);
}

/**
 * Runs synthetic metadata corruptions through the existing Phase 1 boundaries.
 * It never opens, downloads, uploads, transforms, or ingests a source archive.
 */
export function runPhase1CorruptionGate({ acquisitionReadiness, stagedAcquisitions, geospatialProfile }) {
  validateAcquisitionReadiness(acquisitionReadiness);
  validateStagedAcquisitions(stagedAcquisitions);
  validateStagedGeospatialProfile(geospatialProfile);

  const readinessSource = acquisitionReadiness.sources[0];
  const stagedEntry = stagedAcquisitions.entries[0];
  const profiledSource = geospatialProfile.sources[0];
  const profiledLayer = profiledSource.layers[0];

  return {
    status: "passed",
    notice: "Synthetic metadata corruptions are rejected by the Phase 1 source, staging, and geometry gates.",
    probes: [
      mustReject("audited-head-length", () => validateAcquisitionReadiness({
        ...acquisitionReadiness,
        sources: [{ ...readinessSource, head: { ...readinessSource.head, contentLengthBytes: 1 } }, ...acquisitionReadiness.sources.slice(1)],
      })),
      mustReject("staged-archive-integrity", () => validateStagedAcquisitions({
        ...stagedAcquisitions,
        entries: [{ ...stagedEntry, zipIntegrity: "failed" }, ...stagedAcquisitions.entries.slice(1)],
      })),
      mustReject("staged-production-claim", () => validateStagedAcquisitions({
        ...stagedAcquisitions,
        entries: [{ ...stagedEntry, productionEligible: true }, ...stagedAcquisitions.entries.slice(1)],
      })),
      mustReject("profiled-geometry-count", () => validateStagedGeospatialProfile({
        ...geospatialProfile,
        sources: [{
          ...profiledSource,
          layers: [{ ...profiledLayer, invalidGeometryCount: profiledLayer.invalidGeometryCount + 1 }, ...profiledSource.layers.slice(1)],
        }, ...geospatialProfile.sources.slice(1)],
      })),
    ],
  };
}

export async function checkPhase1CorruptionGate() {
  const [acquisitionReadiness, stagedAcquisitions, geospatialProfile] = await Promise.all([
    readJson("data/acquisition-readiness.json"),
    readJson("data/staged-acquisitions.json"),
    readJson("data/staged-geospatial-profile.json"),
  ]);
  return runPhase1CorruptionGate({ acquisitionReadiness, stagedAcquisitions, geospatialProfile });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await checkPhase1CorruptionGate();
  console.log(`Phase 1 corruption gate passed for ${result.probes.length} synthetic probes.`);
}
