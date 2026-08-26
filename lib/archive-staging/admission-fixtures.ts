import type { LocalAdmissionCandidate, RecordedStagingMetadata } from "./admission";

export const EXAMPLE_RECORDED_STAGING: RecordedStagingMetadata = {
  sourceId: "qc-historic-wildfire",
  sourceVersion: "2026-08-11",
  retrievedAt: "2026-08-12T05:22:16Z",
  byteLength: 414244435,
  sha256: "cfed6c16eac901e6887a2518f566dff7608d4c4c371bd9c1ce6b2eff03fa0815",
  publisher: "Ministère des Ressources naturelles et des Forêts du Québec",
  catalogueUrl: "https://www.donneesquebec.ca/recherche/dataset/feux-de-foret",
  requestedUrl: "https://diffusion.mffp.gouv.qc.ca/FEUX_PROV_GPKG.zip",
  licenceId: "cc-by-4.0-quebec",
  licenceUrl: "https://www.donneesquebec.ca/licence/#cc-by",
  requiredAttribution: "Source: Ministère des Ressources naturelles et des Forêts du Québec.",
  changesNotice: "Raw archive unchanged.",
  localPath: "../Witness_Tree-data/raw/qc-historic-wildfire/2026-08-11/FEUX_PROV_GPKG.zip",
};

export const EXAMPLE_LOCAL_ADMISSION: LocalAdmissionCandidate = {
  status: "local-staging-admission-candidate",
  sourceId: EXAMPLE_RECORDED_STAGING.sourceId,
  sourceVersion: EXAMPLE_RECORDED_STAGING.sourceVersion,
  retrievedAt: EXAMPLE_RECORDED_STAGING.retrievedAt,
  input: { byteLength: EXAMPLE_RECORDED_STAGING.byteLength, sha256: EXAMPLE_RECORDED_STAGING.sha256, localPath: EXAMPLE_RECORDED_STAGING.localPath },
  release: { production: false, ingested: false, immutableObjectStorage: false },
  geometryEvidence: [{ layer: "feux_prov", geometryType: "MultiPolygon", featureCount: 94572, missingGeometryCount: 0, emptyGeometryCount: 0, invalidGeometryCount: 0, invalidGeometryReasons: {} }],
};
