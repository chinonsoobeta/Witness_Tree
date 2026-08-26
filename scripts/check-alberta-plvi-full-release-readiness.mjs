import { readFile } from "node:fs/promises";

const SHA256 = /^[a-f0-9]{64}$/;
const IDS = "17119,17583,17931,19384,20217,21021,21992,23014,40392,50824,82560,161140";

export function validateAlbertaPlviFullReleaseReadiness(record) {
  if (!record || record.status !== "immutable-archived-schema-preflight-blocked" || record.sourceId !== "ab-primary-land-vegetation") throw new Error("PLVI full release must remain immutable-archived and schema-preflight blocked.");
  if (!/raw and derived payloads are remotely verified in immutable storage.*schema drift still blocks ingestion preparation.*does not authorize transformation admission, ingestion, release, production admission/i.test(record.notice)) throw new Error("PLVI notice must distinguish completed immutable archive from blocked downstream readiness.");
  if (record.rawInput?.sha256 !== "017a0a835c680ca1b6c1eb790322a28e1b4c0c64e36924da46d8bb99cb1571d3" || record.rawInput?.featureCount !== 179087 || record.rawInput?.crs !== "EPSG:3400") throw new Error("PLVI full release must bind its exact raw input.");
  if (record.repairPatch?.sha256 !== "70348ce64c3e688ee7dc3948a683e49631aa16d591953a89f51d8186169d94e0" || record.repairPatch?.featureCount !== 12 || record.repairPatch.relativeAreaTolerance !== 1e-9) throw new Error("PLVI full release must bind its exact repair patch and tolerance.");
  const output = record.derivedOutput;
  if (!output || !SHA256.test(output.sha256) || output.byteLength !== 899551232 || output.featureCount !== 179087 || output.crs !== "EPSG:3400" || output.attributeFieldCount !== 60 || "fieldCount" in output || output.emptyOrNullGeometryCount !== 0 || output.invalidGeometryCount !== 0 || output.nonPolygonalGeometryCount !== 0 || output.geometryTypes?.POLYGON !== 179086 || output.geometryTypes?.MULTIPOLYGON !== 1 || !(output.maxRepairedRelativeAreaDelta <= record.repairPatch.relativeAreaTolerance) || !SHA256.test(output.validRawAttributeFingerprintSha256)) throw new Error("PLVI full output must bind the live 60-attribute schema, remain complete, valid, polygonal, checksum-bound, and within repair tolerance.");
  const join = record.closedJoin;
  if (!join || join.repairedPolygonIds?.join(",") !== IDS || join.sourceDuplicateIdentifier?.field !== "POLYGON_ID" || join.sourceDuplicateIdentifier?.value !== 41405 || join.sourceDuplicateIdentifier?.multiplicity !== 2 || join.sourceDuplicateIdentifier?.treatment !== "preserved; no deduplication" || join.inputFeatureCount !== 179087 || join.validCopiedUnchangedCount !== 179075 || join.repairedReplacementCount !== 12 || join.outputFeatureCount !== 179087 || join.silentLossOrDuplication !== false) throw new Error("PLVI closed join must preserve every source feature and explicitly retain the publisher duplicate identifier.");
  if (JSON.stringify(record.immutableArchive) !== JSON.stringify({status:"remote-verified-archived-profiled",evidenceRef:"data/alberta-plvi-immutable-promotion-evidence.json",rawAndDerivedPayloadsVerified:true}) || JSON.stringify(record.ownerScope) !== JSON.stringify({status:"approved-source-ledger-and-exact-raw-derived-scope-only",decisionRef:"data/phase1-remote-source-admission-decisions.json",scopeBoundValidationAuthorized:true,transformationAdmission:false,ingestionAuthorized:false,releaseApproved:false,productionAdmission:false}) || record.immutableObjectStorage !== true || record.ingestionReady !== false || record.productionEligible !== false) throw new Error("PLVI readiness must record immutable archive and exact scope while keeping every downstream gate false.");
  return record;
}

export async function checkAlbertaPlviFullReleaseReadiness(file = new URL("../data/alberta-plvi-full-release-readiness.json", import.meta.url)) {
  return validateAlbertaPlviFullReleaseReadiness(JSON.parse(await readFile(file, "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await checkAlbertaPlviFullReleaseReadiness();
  console.log("Alberta PLVI full release is immutable-archived and remains schema-preflight blocked.");
}
