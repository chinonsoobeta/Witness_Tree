import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SHA256 = /^[a-f0-9]{64}$/;
const DATASET_ID = "77ec9009-b733-4f09-ade3-99d7b2156ad4";
const ARCHIVE_SET_SHA256 = "394f05f984b164b7524e77b00fc73246a791d6c4112f7cc080c43fb3d8a2c0e0";
const PROFILE_SHA256 = "5450a1beade6f8dbbf73320a8751a3131bede150d95bb8847d9522b10ad985f9";

function exactObject(value, expected, label) {
  if (JSON.stringify(value) !== JSON.stringify(expected)) throw new Error(`${label} drifted.`);
}

function checksumRecord(record, prefix, bytes, sha256, label) {
  if (!record || !record.localPath?.startsWith(prefix) || record.byteLength !== bytes || record.sha256 !== sha256 || !SHA256.test(record.sha256)) {
    throw new Error(`${label} checksum evidence is incomplete or drifted.`);
  }
}

export function validateQcFourthInventoryEvidence(evidence) {
  if (!evidence || evidence.schemaVersion !== "1.0" || evidence.status !== "local-verified-profiled") throw new Error("Québec fourth-inventory evidence must remain a local verified profile.");
  if (!/not immutable object storage, a transformation, ingestion, production admission, or production eligibility/i.test(evidence.notice || "")) throw new Error("Québec fourth-inventory evidence must retain every local-only limitation.");

  const dataset = evidence.dataset;
  if (!dataset || dataset.id !== DATASET_ID || dataset.title !== "Carte écoforestière originale et résultats du quatrième inventaire") throw new Error("Québec fourth-inventory product identity drifted.");
  if (!/fixed fourth-inventory product/i.test(dataset.distinction || "") || !/neither the disturbance-updated current ecoforest map nor the rolling current-original inventory product/i.test(dataset.distinction || "")) throw new Error("Québec fourth inventory must remain distinct from both current ecoforest products.");
  if (dataset.licence?.id !== "cc-by-4.0" || dataset.licence?.url !== "https://www.donneesquebec.ca/licence/#cc-by" || !/Ministère des Ressources naturelles et des Forêts/.test(dataset.attribution || "")) throw new Error("Québec fourth-inventory licence or attribution drifted.");
  if (!/2001–2018/.test(dataset.edition || "") || !/complete since 2018/.test(dataset.edition || "")) throw new Error("Québec fourth-inventory edition drifted.");

  const records = evidence.publisherRecords;
  checksumRecord(records?.metadata, "../Witness_Tree-data/raw/qc-fourth-inventory/", 26567, "eb78b91cb0c8ec05ad0b25e13a0a2569663e04abc6a6f42432f51b66e1676e60", "Publisher metadata");
  checksumRecord(records?.documentation, "../Witness_Tree-data/raw/qc-fourth-inventory/", 612203, "ffeacd42c75c27b019f4ea46e2bfd73e9b23a04b55be236259ecf6a2147e456c", "Publisher documentation");
  checksumRecord(records?.downloadIndex, "../Witness_Tree-data/raw/qc-fourth-inventory/", 29104, "8525f3153f2e4ea30b6be78f0c93019e80fb9f4570db53221badea4c4a4abadd", "Publisher download index");

  const provincial = evidence.provincialMapComponent;
  if (!/cannot satisfy the canonical row alone/i.test(provincial?.notice || "") || provincial.byteLength !== 8096656664 || provincial.sha256 !== "62f61998be33d1e3d2f23f6c77e90ca946a40bda0d5d86b00c976c339877d25b" || provincial.zipIntegrity !== "passed") throw new Error("The provincial map component must remain supporting-only and checksum-bound.");
  if (provincial.member?.name !== "CARTE_ECO_ORI_4_PROV.gpkg" || provincial.member?.byteLength !== 22784430080 || provincial.member?.sha256 !== "5492d599d08aac9637471ea45e7a3f427f864410251cb36be4c05fa920e1b9e7") throw new Error("The provincial GeoPackage member drifted.");
  exactObject(provincial.layers, { PEE_ORI_4_PROV: 7439159, META_ORI_4_PROV: 7439159, ESSENCE_ORI_4_PROV: 5873511, ETAGE_ORI_4_PROV: 2841085 }, "Provincial component layers");

  const acquisition = evidence.fullProductAcquisition;
  if (!acquisition?.sourcePattern?.includes("PRODUITS_IEQM_4_{sheet}_GPKG.zip") || acquisition.officialSheetCount !== 56 || acquisition.archiveCount !== 56 || acquisition.archiveByteLength !== 16177306782 || acquisition.archiveSetSha256 !== ARCHIVE_SET_SHA256 || acquisition.zipIntegrity !== "passed-all-56") throw new Error("The complete 56-sheet archive evidence is incomplete or drifted.");
  const defect = acquisition.publishedIndexDefect;
  if (defect?.status !== "all-56-published-gpkg-links-returned-404" || !/same official sheet directories/i.test(defect.resolution || "") || defect.headEvidenceByteLength !== 12661 || defect.headEvidenceSha256 !== "cf8b068eb3164fd3d195ce6c84edd1057ff93dae3e844f50fbea54ceda700539") throw new Error("The official download-index defect and corrected refetch evidence must remain explicit.");

  const profile = evidence.profile;
  checksumRecord(profile, "../Witness_Tree-data/work/qc-fourth-inventory/", 1027637, PROFILE_SHA256, "External profile");
  if (profile.crs !== "EPSG:32198" || profile.layerSetVariantCount !== 6 || profile.layerSetVariantSheetCounts?.reduce((sum, count) => sum + count, 0) !== 56) throw new Error("The all-sheet CRS or layer-set profile drifted.");
  const expectedGeometry = {
    perimetre_no_terri: { geometryType: "Multi Polygon", featureCount: 56, extent: [-886998, 643731, 6895.33, 1000400], missing: 0, empty: 0, invalid: 0 },
    pee_ori_4: { geometryType: "Multi Polygon", featureCount: 7489195, extent: [-830340, 543808, 117964, 900666], missing: 0, empty: 0, invalid: 0 },
    meta_ori_4: { geometryType: "Point", featureCount: 7489195, extent: [-829347, 534128, 118044, 900318], missing: 0, empty: 0, invalid: 0 }
  };
  exactObject(profile.baseGeometry, expectedGeometry, "Exhaustive base-geometry profile");
  if (!/Every profiled spatial result view obtains geometry from pee_ori_4/.test(profile.spatialViewGeometryLineage || "")) throw new Error("Spatial-view geometry lineage drifted.");

  for (const flag of ["immutableObjectStorage", "transformed", "ingested", "productionAdmission", "productionEligible"]) {
    if (evidence[flag] !== false) throw new Error(`Québec fourth-inventory ${flag} must remain false.`);
  }
  return evidence;
}

export async function checkQcFourthInventoryEvidence(file = new URL("../data/qc-fourth-inventory-evidence.json", import.meta.url)) {
  return validateQcFourthInventoryEvidence(JSON.parse(await readFile(file, "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const evidence = await checkQcFourthInventoryEvidence(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/qc-fourth-inventory-evidence.json"));
  console.log(`Québec fourth-inventory local evidence passed: ${evidence.fullProductAcquisition.archiveCount} official sheet archives, ${evidence.profile.baseGeometry.pee_ori_4.featureCount.toLocaleString("en-CA")} stand features.`);
}
