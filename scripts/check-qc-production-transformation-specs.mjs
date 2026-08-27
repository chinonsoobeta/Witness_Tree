import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SPECS = [
  ["qc-current-ecoforest-stand-copy-v1.json", "qc-current-ecoforest", "specified-not-approved-not-executed", "c67c56b0c101e95bef4fbca53a06e2f1578fe38293961017f70d815209740cf1", 12399475076, "CARTE_ECO_MAJ_PROV.gpkg", "4f592f99786770600bdf219e8cdae5908d9a2398ab6a9ae45662fafa2494aa00", "pee_maj_prov", 9827536],
  ["qc-original-current-inventory-stand-copy-v1.json", "qc-original-current-inventory", "specified-not-approved-not-executed", "c10d691516569de76642dc1fc64e662f2569b5b58ab5d945b58b8b7834ba9c61", 11244667626, "CARTE_ECO_ORI_PROV.gpkg", "819a5698456089a9f291925a9b9bf1eb1415f29985ff43107d383c1f46753dfd", "pee_ori_prov", 8387062]
];
const NO_JOIN = "None. Do not join meta or other tables in this operation.";
const NO_GEOMETRY_CHANGE = /(?:Do not|without) .*simplif(?:y|ication).*snap(?:ping)?.*dissol(?:ve|ution).*reproject(?:ion)?.*buffer(?:ing)?.*repair/i;
const OWNER_NON_DECISIONS = ["ingestion", "release", "production admission", "semantic interpretation of source-coded attributes"];
const FOURTH_DECISIONS = ["intended fourth-inventory use", "canonical layer or view selection", "cross-sheet key and duplicate policy", "attribute join and aggregation policy", "temporal and semantic interpretation", "geometry and coverage handling"];

function requireValue(value, message) { if (!value) throw new Error(message); }
function noAdmission(spec) {
  for (const value of Object.values(spec.admission ?? {})) if (value !== false) throw new Error(`${spec.id} must not imply admission.`);
}
export function validateQcProductionTransformationSpecs(specs) {
  if (!Array.isArray(specs) || specs.length !== 3) throw new Error("Three Québec specifications are required.");
  for (const [file, sourceId, status, rawSha, rawBytes, member, extractedSha, layer, count] of SPECS) {
    const spec = specs.find((entry) => entry.file === file)?.value;
    requireValue(spec?.schemaVersion === "witness-tree/transformation-spec/1", `${file} schema version drifted.`);
    requireValue(spec.sourceId === sourceId && spec.status === status, `${file} source or status drifted.`);
    requireValue(spec.sourceBinding?.rawArchiveSha256 === rawSha && spec.sourceBinding?.rawArchiveBytes === rawBytes && spec.sourceBinding?.archiveMember === member && spec.sourceBinding?.extractedGeoPackageSha256 === extractedSha, `${file} must bind the exact source bytes.`);
    requireValue(spec.input?.format === "GeoPackage" && spec.input?.layer === layer && spec.input?.featureCount === count && spec.input?.sourceRowKey === "fid" && spec.input?.geometryColumn === "geom" && spec.input?.geometryType === "MultiPolygon" && spec.input?.crs === "EPSG:32198" && Array.isArray(spec.input?.publishedAttributes) && spec.input.publishedAttributes.length > 0 && new Set(spec.input.publishedAttributes).size === spec.input.publishedAttributes.length, `${file} input schema drifted.`);
    requireValue(spec.operation?.kind === "lossless-single-layer-copy" && spec.operation?.joins === NO_JOIN && (sourceId !== "qc-original-current-inventory" || /No joins are executed/.test(spec.interpretation?.joinPolicy ?? "")), `${file} must prohibit unapproved joins.`);
    requireValue(NO_GEOMETRY_CHANGE.test(spec.operation?.geometry ?? ""), `${file} must prohibit every geometry alteration.`);
    requireValue(spec.operation?.outputCrs === "EPSG:32198" && /Copy every published attribute by the same name and type/.test(spec.operation?.fieldMapping ?? "") && /source_fid/.test(spec.operation?.rowIdentity ?? ""), `${file} must preserve the published fields and CRS.`);
    requireValue(Array.isArray(spec.prohibitedClaims) && spec.prohibitedClaims.length >= 4, `${file} must retain prohibited claims.`);
    noAdmission(spec);
    requireValue(/^Approve, reject, or defer this exact checksum-bound lossless stand-copy scope only\.$/.test(spec.ownerDecision?.decision ?? "") && OWNER_NON_DECISIONS.every((value) => spec.ownerDecision?.doesNotDecide?.includes(value)), `${file} is not owner-decision-ready.`);
  }
  const fourth = specs.find((entry) => entry.file === "qc-fourth-inventory-preflight-v1.json")?.value;
  requireValue(fourth?.sourceId === "qc-fourth-inventory" && fourth.status === "blocked-preflight-only-not-approved-not-executed", "Fourth-inventory spec must remain blocked preflight only.");
  requireValue(fourth.sourceBinding?.archiveSetSha256 === "394f05f984b164b7524e77b00fc73246a791d6c4112f7cc080c43fb3d8a2c0e0" && fourth.sourceBinding?.archiveCount === 56 && fourth.knownSchema?.layerSetVariantCount === 6, "Fourth-inventory source binding drifted.");
  requireValue(Array.isArray(fourth.preflightOnly?.forbidden) && fourth.preflightOnly.forbidden.includes("selecting a result view") && fourth.preflightOnly.forbidden.includes("admission or release"), "Fourth-inventory preflight must prohibit semantic selection and admission.");
  requireValue(Array.isArray(fourth.preflightOnly?.requiredOwnerDecisionBeforeTransformation) && FOURTH_DECISIONS.every((value) => fourth.preflightOnly.requiredOwnerDecisionBeforeTransformation.includes(value)), "Fourth-inventory owner decisions must be explicit.");
  requireValue(!("operation" in fourth) && !("output" in fourth) && !("input" in fourth), "Fourth-inventory preflight must not select or define a transformation output.");
  noAdmission(fourth);
  return specs;
}
export async function checkQcProductionTransformationSpecs(root = ROOT) {
  const specs = await Promise.all(SPECS.map(async ([file]) => ({ file, value: JSON.parse(await readFile(path.join(root, "data/transformation-specs", file), "utf8")) })).concat([
    (async () => ({ file: "qc-fourth-inventory-preflight-v1.json", value: JSON.parse(await readFile(path.join(root, "data/transformation-specs/qc-fourth-inventory-preflight-v1.json"), "utf8")) }))()
  ]));
  return validateQcProductionTransformationSpecs(specs);
}
if (import.meta.url === `file://${process.argv[1]}`) { await checkQcProductionTransformationSpecs(); console.log("Québec production transformation specifications are checksum-bound and remain unapproved."); }
