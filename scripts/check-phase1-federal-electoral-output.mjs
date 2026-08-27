#!/usr/bin/env node

/*
 * Independent read-only verifier for the completed federal-electoral output.
 * It never opens the canonical artifact for update. Determinism is checked by
 * creating the same artifact in a private temporary directory and comparing
 * bytes before removing that directory.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_DATA_ROOT = path.resolve(REPO_ROOT, "../../Witness_Tree-data");
export const SPEC_ID = "federal-electoral-districts-2023-v1";
export const METHOD_VERSION = "phase1-federal-electoral-districts-2023-v1";
export const SPEC_PATH = "data/phase1-production-transformation-specifications-v1.json";
export const SPEC_SHA256 = "258ca3f94e30d484b53cc12e29c83beaf57998993edaea05e44f5a4924979efc";
export const PACKET_PATH = "data/phase1-downstream-admission-packet.json";
export const PACKET_SHA256 = "82c55e3bea87d1a3856b233b2e483cd9b5318afd3d998bd753867af944370520";
export const OWNER_SCOPE_PATH = "data/phase1-transformation-scope-owner-approval-2026-08-25.json";
export const PROFILE_PATH = "data/elections-canada-fed-2025-profile.json";
export const PROFILE_SHA256 = "a742f27e879126ded6cd37dc66f4595b488afd467a4523d8b9defcaa16379301";
export const SOURCE_LEDGER_PATH = "data/elections-canada-fed-2025-source-ledger.json";
export const SOURCE_LEDGER_SHA256 = "b1d28895c43c843a6072ef9adca661c26c3a27fbdda27650ea216abe56c707fb";
export const ARCHIVE_EVIDENCE_PATH = "data/federal-electoral-archive-recovery-evidence.json";
export const ARCHIVE_EVIDENCE_SHA256 = "18b9fbfa5e3eecdc33ad0098f5ffa55f7bfebb1a47d2e33b7f01a94e05a6ed32";
export const EXECUTION_APPROVAL_PATH = "data/phase1-federal-electoral-execution-approval.json";
export const INPUT_SHA256 = "4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93";
export const INPUT_BYTE_LENGTH = 10301648;
export const INPUT_RELATIVE_PATH = "raw/elections-canada-federal-electoral-districts/2026-08-14/FederalElectoralDistricts_2025_SHP.zip";
export const LAYER_PATH = "SHP/FED_CA_2025_EN.shp";
export const LAYER_NAME = "FED_CA_2025_EN";
export const OUTPUT_LAYER = "federal_electoral_districts_2023";
export const OUTPUT_RELATIVE_PATH = "derived/phase1/federal-electoral-districts-2023-v1/4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93/phase1-federal-electoral-districts-2023-v1/federal-electoral-districts-2023.gpkg";
export const EVIDENCE_PATH = "data/phase1-federal-electoral-output-verification-evidence.json";
const SELECTED_FIELDS = ["FED_NUM", "ED_NAMEE", "ED_NAMEF", "REPORDER"];
const OUTPUT_FIELDS = ["source_fid", ...SELECTED_FIELDS, "output_record_id", "source_raw_sha256", "source_layer"];
const RUNNER_VERSION = "phase1-federal-electoral-transformation-runner-v1";
const FIXED_GPKG_TIMESTAMP = "2000-01-01T00:00:00.000Z";

const fail = (message) => { throw new Error(message); };
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const sortKeys = (value) => Array.isArray(value)
  ? value.map(sortKeys)
  : isObject(value)
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]))
    : value;
export const canonicalJson = (value) => JSON.stringify(sortKeys(value));
const sha256Bytes = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sha256File = (filePath) => sha256Bytes(readFileSync(filePath));
const readJson = (root, relativePath) => JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));
const runOgr = (args) => JSON.parse(execFileSync("ogrinfo", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }));
const runOgr2Ogr = (args) => execFileSync("ogr2ogr", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
const metadataFor = (dataset, layer) => runOgr(["-ro", "-json", "-so", dataset, ...(layer ? [layer] : [])]).layers?.[0];
const featuresFor = (dataset, layer) => runOgr(["-ro", "-json", "-features", dataset, ...(layer ? [layer] : [])]).layers?.[0];
const expectedField = (fields, name) => fields.find((field) => field.name === name);
const assertSha = (root, relativePath, expected) => {
  const filePath = path.join(root, relativePath);
  if (!existsSync(filePath)) fail(`missing bound file: ${relativePath}`);
  const actual = sha256File(filePath);
  if (actual !== expected) fail(`checksum drift: ${relativePath}`);
};
const assertRegular = (filePath, label) => {
  if (!existsSync(filePath)) fail(`missing ${label}: ${filePath}`);
  const stat = lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} must be a regular non-symlink file`);
};

export function expectedOutputRecordId(sourceFid, properties) {
  return sha256Bytes(Buffer.from([SPEC_ID, METHOD_VERSION, INPUT_SHA256, String(sourceFid), String(properties.FED_NUM), String(properties.REPORDER)].join("\u001f")));
}

function aggregateFor(dataset, layerName, geometryColumn) {
  const geometry = `"${geometryColumn || "geometry"}"`;
  const sql = `SELECT COUNT(*) AS feature_count, COUNT(DISTINCT "FED_NUM") AS distinct_fed_num_count, SUM(CASE WHEN "REPORDER" <> '2023' OR "REPORDER" IS NULL THEN 1 ELSE 0 END) AS non_2023_count, SUM(CASE WHEN ${geometry} IS NULL THEN 1 ELSE 0 END) AS missing_geometry_count, SUM(CASE WHEN ST_IsEmpty(${geometry}) THEN 1 ELSE 0 END) AS empty_geometry_count, SUM(CASE WHEN NOT ST_IsValid(${geometry}) THEN 1 ELSE 0 END) AS invalid_geometry_count FROM "${layerName}"`;
  return runOgr(["-ro", "-json", "-features", "-dialect", "SQLite", "-sql", sql, dataset]).layers?.[0]?.features?.[0]?.properties ?? {};
}

function boundContext(root = REPO_ROOT, dataRoot = DEFAULT_DATA_ROOT) {
  for (const [file, sha] of [[SPEC_PATH, SPEC_SHA256], [PACKET_PATH, PACKET_SHA256], [PROFILE_PATH, PROFILE_SHA256], [SOURCE_LEDGER_PATH, SOURCE_LEDGER_SHA256], [ARCHIVE_EVIDENCE_PATH, ARCHIVE_EVIDENCE_SHA256]]) assertSha(root, file, sha);
  const specRecord = readJson(root, SPEC_PATH);
  const spec = specRecord.specifications?.find((candidate) => candidate.id === SPEC_ID);
  if (!spec || spec.methodVersion !== METHOD_VERSION || spec.selection?.layer !== LAYER_PATH || spec.selection?.filter !== "REPORDER = '2023'") fail("bound federal specification drift");
  if (JSON.stringify(spec.selection?.fields) !== JSON.stringify(SELECTED_FIELDS) || spec.output?.path !== `../Witness_Tree-data/${OUTPUT_RELATIVE_PATH}` || spec.output?.checksumSha256 !== null) fail("bound federal output contract drift");
  const profile = readJson(root, PROFILE_PATH);
  const ledger = readJson(root, SOURCE_LEDGER_PATH);
  const archive = readJson(root, ARCHIVE_EVIDENCE_PATH);
  if (profile.inputSha256 !== INPUT_SHA256 || profile.layer?.featureCount !== 352 || profile.layer?.distinctFederalDistrictCount !== 343 || JSON.stringify(profile.layer?.representationOrderValues) !== JSON.stringify(["2023"])) fail("bound profile drift");
  if (ledger.source?.sha256 !== INPUT_SHA256 || ledger.source?.localPath !== `../Witness_Tree-data/${INPUT_RELATIVE_PATH}`) fail("bound source ledger drift");
  if (archive.payload?.sha256 !== INPUT_SHA256 || archive.payload?.byteLength !== INPUT_BYTE_LENGTH) fail("bound archive evidence drift");
  const inputPath = path.resolve(dataRoot, INPUT_RELATIVE_PATH);
  assertRegular(inputPath, "local input");
  const inputStat = lstatSync(inputPath);
  if (inputStat.size !== INPUT_BYTE_LENGTH || sha256File(inputPath) !== INPUT_SHA256) fail("local input checksum/length drift");
  const outputPath = path.resolve(dataRoot, OUTPUT_RELATIVE_PATH);
  const sidecarPath = `${outputPath}.sidecar.json`;
  assertRegular(outputPath, "canonical output");
  assertRegular(sidecarPath, "canonical sidecar");
  return { root, dataRoot, spec, profile, ledger, archive, inputPath, sourceDataset: `/vsizip/${inputPath}/${LAYER_PATH}`, outputPath, sidecarPath };
}

function executionApproval(context) {
  const record = readJson(context.root, EXECUTION_APPROVAL_PATH);
  if (record.schemaVersion !== "witness-tree/phase1-federal-electoral-execution-approval/1" || record.status !== "owner-authorized-execution" || record.decision !== "approve") fail("execution approval status drift");
  const expectedBoundary = { executionAuthorized: true, ingestionAuthorized: false, releaseAuthorized: false, productionAdmissionAuthorized: false, productionEligibilityGranted: false, externalMutationPerformed: false, overwriteExisting: false };
  if (canonicalJson(record.authorization) !== canonicalJson(expectedBoundary)) fail("execution approval boundary is not fail-closed");
  if (record.spec?.id !== SPEC_ID || record.spec?.methodVersion !== METHOD_VERSION || record.spec?.path !== SPEC_PATH || record.spec?.sha256 !== SPEC_SHA256) fail("execution approval spec binding drift");
  if (record.packet?.path !== PACKET_PATH || record.packet?.sha256 !== PACKET_SHA256) fail("execution approval packet binding drift");
  const ownerSha = sha256File(path.join(context.root, OWNER_SCOPE_PATH));
  if (record.ownerScope?.path !== OWNER_SCOPE_PATH || record.ownerScope?.sha256 !== ownerSha || record.ownerScope?.specId !== SPEC_ID) fail("execution approval owner-scope binding drift");
  const runnerPath = "scripts/run-phase1-federal-electoral-transformation.mjs";
  if (record.runner?.path !== runnerPath || record.runner?.version !== RUNNER_VERSION || record.runner?.sha256 !== sha256File(path.join(context.root, runnerPath))) fail("execution approval runner binding drift");
  if (record.output?.path !== `../Witness_Tree-data/${OUTPUT_RELATIVE_PATH}` || record.output?.sidecarPath !== `../Witness_Tree-data/${OUTPUT_RELATIVE_PATH}.sidecar.json` || record.output?.layer !== OUTPUT_LAYER) fail("execution approval output binding drift");
  return record;
}

function sourceReadback(context) {
  const layer = metadataFor(context.sourceDataset);
  if (!layer || layer.name !== LAYER_NAME || layer.featureCount !== 352 || layer.geometryFields?.[0]?.type !== "Polygon") fail("source layer metadata QA failed");
  const sourceWkt = layer.geometryFields?.[0]?.coordinateSystem?.wkt ?? "";
  if (!/PCS_Lambert_Conformal_Conic/i.test(sourceWkt) || !/NAD83/i.test(sourceWkt)) fail("source CRS QA failed");
  for (const field of SELECTED_FIELDS) if (!expectedField(layer.fields ?? [], field)) fail(`source field missing: ${field}`);
  const aggregate = aggregateFor(context.sourceDataset, LAYER_NAME, layer.geometryFields?.[0]?.name || "geometry");
  if (aggregate.feature_count !== 352 || aggregate.distinct_fed_num_count !== 343 || aggregate.non_2023_count !== 0 || aggregate.missing_geometry_count !== 0 || aggregate.empty_geometry_count !== 0 || aggregate.invalid_geometry_count !== 0) fail(`source geometry QA failed: ${JSON.stringify(aggregate)}`);
  const features = featuresFor(context.sourceDataset)?.features ?? [];
  if (features.length !== 352) fail("source feature count QA failed");
  const byFid = new Map();
  for (const feature of features) {
    const fid = Number(feature.fid);
    const properties = feature.properties ?? {};
    if (!Number.isInteger(fid) || byFid.has(fid) || properties.REPORDER !== "2023" || !feature.geometry || feature.geometry.type !== "Polygon" || !feature.geometry.coordinates?.length) fail(`source feature QA failed at FID ${feature.fid}`);
    byFid.set(fid, { fid, properties, geometry: feature.geometry });
  }
  return { layer, aggregate, features: byFid };
}

export function validateSidecarDocument(document, raw, { outputSha256, outputByteLength, expectedInputBindings, expectedOutputPath }) {
  if (raw !== `${canonicalJson(document)}\n`) fail("sidecar is not canonical deterministic JSON");
  if (document.specId !== SPEC_ID || document.methodVersion !== METHOD_VERSION) fail("sidecar spec/method binding drift");
  if (canonicalJson(document.inputBindings) !== canonicalJson(expectedInputBindings)) fail("sidecar input bindings drift");
  if (document.command !== "node scripts/run-phase1-federal-electoral-transformation.mjs --execute") fail("sidecar command drift");
  if (document.output?.path !== expectedOutputPath || document.output?.layer !== OUTPUT_LAYER || document.output?.featureCount !== 352 || document.output?.polygonFeatureCount !== 352 || document.output?.distinctFederalDistrictCount !== 343) fail("sidecar output contract drift");
  if (document.outputSha256 !== outputSha256 || document.outputByteLength !== outputByteLength) fail("sidecar output hash/length does not match canonical output");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(document.createdAt ?? "")) fail("sidecar createdAt is not an exact UTC timestamp");
  if (document.qa?.deterministic !== true || document.qa?.sourceFeatureCount !== 352 || document.qa?.outputFeatureCount !== 352 || document.qa?.distinctFED_NUM !== 343) fail("sidecar QA contract drift");
  if (!document.toolVersions?.gdal || !document.toolVersions?.node) fail("sidecar tool versions missing");
  return document;
}

function outputReadback(context, source) {
  const layer = metadataFor(context.outputPath, OUTPUT_LAYER);
  if (!layer || layer.name !== OUTPUT_LAYER || layer.featureCount !== 352 || layer.geometryFields?.[0]?.type !== "Polygon") fail("canonical output metadata/schema QA failed");
  const outputWkt = layer.geometryFields?.[0]?.coordinateSystem?.wkt ?? "";
  if (!/PCS_Lambert_Conformal_Conic/i.test(outputWkt) || !/NAD83/i.test(outputWkt)) fail("canonical output CRS QA failed");
  if ((layer.fields ?? []).map(({ name }) => name).join("\u001f") !== OUTPUT_FIELDS.join("\u001f")) fail("canonical output field order/schema drift");
  const aggregate = aggregateFor(context.outputPath, OUTPUT_LAYER, layer.geometryFields?.[0]?.name || "geometry");
  if (aggregate.feature_count !== 352 || aggregate.distinct_fed_num_count !== 343 || aggregate.non_2023_count !== 0 || aggregate.missing_geometry_count !== 0 || aggregate.empty_geometry_count !== 0 || aggregate.invalid_geometry_count !== 0) fail(`canonical output geometry QA failed: ${JSON.stringify(aggregate)}`);
  const features = featuresFor(context.outputPath, OUTPUT_LAYER)?.features ?? [];
  if (features.length !== 352) fail("canonical output feature count QA failed");
  const seen = new Set();
  for (const feature of features) {
    const properties = feature.properties ?? {};
    const sourceFid = Number(properties.source_fid);
    const original = source.features.get(sourceFid);
    if (!original || seen.has(sourceFid)) fail(`canonical output lineage source_fid mismatch: ${properties.source_fid}`);
    seen.add(sourceFid);
    for (const field of SELECTED_FIELDS) if (properties[field] !== original.properties[field]) fail(`canonical output field drift: ${field} at source_fid ${sourceFid}`);
    if (canonicalJson(feature.geometry) !== canonicalJson(original.geometry)) fail(`canonical output geometry drift at source_fid ${sourceFid}`);
    if (properties.output_record_id !== expectedOutputRecordId(sourceFid, original.properties)) fail(`canonical output record ID drift at source_fid ${sourceFid}`);
    if (properties.source_raw_sha256 !== INPUT_SHA256 || properties.source_layer !== LAYER_PATH) fail(`canonical output lineage hash/layer drift at source_fid ${sourceFid}`);
  }
  if (seen.size !== 352) fail("canonical output does not retain all source polygons");
  return { layer, aggregate, featureCount: features.length };
}

function mutateEphemeralLineage(outputPath, source) {
  const cases = [...source.features.values()].map(({ fid, properties }) => `WHEN ${Number(fid)} THEN '${expectedOutputRecordId(fid, properties)}'`).join(" ");
  const update = `UPDATE "${OUTPUT_LAYER}" SET output_record_id = CASE source_fid ${cases} ELSE NULL END`;
  execFileSync("ogrinfo", ["-update", outputPath, "-dialect", "SQLite", "-sql", update], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  execFileSync("ogrinfo", ["-update", outputPath, "-dialect", "SQLite", "-sql", `UPDATE gpkg_contents SET last_change='${FIXED_GPKG_TIMESTAMP}' WHERE table_name='${OUTPUT_LAYER}'`], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
}

function regenerateEphemeral(context, source) {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "witness-tree-federal-output-"));
  const tempPath = path.join(tempRoot, "federal-electoral-districts-2023.gpkg");
  try {
    const sql = `SELECT FID AS source_fid, FED_NUM, ED_NAMEE, ED_NAMEF, REPORDER, '' AS output_record_id, '${INPUT_SHA256}' AS source_raw_sha256, '${LAYER_PATH}' AS source_layer FROM "${LAYER_NAME}" WHERE "REPORDER" = '2023'`;
    runOgr2Ogr(["-f", "GPKG", "-nln", OUTPUT_LAYER, "-dialect", "OGRSQL", "-sql", sql, "-dsco", "VERSION=1.2", tempPath, context.sourceDataset]);
    mutateEphemeralLineage(tempPath, source);
    const metadata = metadataFor(tempPath, OUTPUT_LAYER);
    const aggregate = aggregateFor(tempPath, OUTPUT_LAYER, metadata?.geometryFields?.[0]?.name || "geometry");
    const bytes = readFileSync(tempPath);
    return { path: tempPath, bytes, sha256: sha256Bytes(bytes), byteLength: bytes.length, metadata, aggregate };
  } catch (error) {
    rmSync(tempRoot, { recursive: true, force: true });
    throw error;
  } finally {
    // The bytes are returned in memory; the temp artifact itself is always removed.
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

export function verify({ root = REPO_ROOT, dataRoot = DEFAULT_DATA_ROOT, writeEvidence = false } = {}) {
  const context = boundContext(root, dataRoot);
  const approval = executionApproval(context);
  const source = sourceReadback(context);
  const outputBytes = readFileSync(context.outputPath);
  const outputSha256 = sha256Bytes(outputBytes);
  const sidecarRaw = readFileSync(context.sidecarPath, "utf8");
  const sidecar = validateSidecarDocument(JSON.parse(sidecarRaw), sidecarRaw, { outputSha256, outputByteLength: outputBytes.length, expectedInputBindings: context.spec.inputBindings, expectedOutputPath: `../Witness_Tree-data/${OUTPUT_RELATIVE_PATH}` });
  if (sidecar.createdAt !== approval.approvedAt) fail("sidecar createdAt does not match execution approval");
  const outputQa = outputReadback(context, source);
  const ephemeral = regenerateEphemeral(context, source);
  if (ephemeral.sha256 !== outputSha256 || ephemeral.byteLength !== outputBytes.length || !Buffer.from(ephemeral.bytes).equals(outputBytes)) fail(`deterministic regeneration mismatch: canonical ${outputSha256}/${outputBytes.length}, ephemeral ${ephemeral.sha256}/${ephemeral.byteLength}`);
  const result = {
    schemaVersion: "witness-tree/phase1-federal-electoral-output-verification/1",
    status: "read-only-completed-output-verified",
    verifiedAt: new Date().toISOString(),
    notice: "Read-only verification evidence. This record does not admit, release, deploy, or make the artifact production eligible.",
    bindings: { specId: SPEC_ID, methodVersion: METHOD_VERSION, specPath: SPEC_PATH, specSha256: SPEC_SHA256, packetPath: PACKET_PATH, packetSha256: PACKET_SHA256, sourceSha256: INPUT_SHA256, executionApprovalPath: EXECUTION_APPROVAL_PATH },
    output: { path: `../Witness_Tree-data/${OUTPUT_RELATIVE_PATH}`, layer: OUTPUT_LAYER, sha256: outputSha256, byteLength: outputBytes.length, sidecarPath: `../Witness_Tree-data/${OUTPUT_RELATIVE_PATH}.sidecar.json`, sidecarSha256: sha256Bytes(Buffer.from(sidecarRaw)), sidecarByteLength: Buffer.byteLength(sidecarRaw), featureCount: outputQa.featureCount, distinctFederalDistrictCount: 343 },
    deterministicRegeneration: { sha256: ephemeral.sha256, byteLength: ephemeral.byteLength, exactByteMatch: true, fixedGpkgTimestamp: FIXED_GPKG_TIMESTAMP, temporaryArtifactRemoved: true },
    qa: { sourceFeatureCount: 352, outputFeatureCount: outputQa.featureCount, distinctFED_NUM: 343, reporder: "2023", crs: "NAD83 Lambert Conformal Conic retained", geometry: "zero missing, empty, or invalid geometries; exact source geometry readback matched", lineage: "source_fid, output_record_id, source_raw_sha256, and source_layer validated" },
    claims: { outputPresent: true, transformationVerified: true, ingested: false, released: false, productionAdmission: false, productionEligible: false, deployment: false, externalMutationPerformed: false },
  };
  if (writeEvidence) {
    const evidenceFile = path.join(root, EVIDENCE_PATH);
    if (existsSync(evidenceFile)) fail(`evidence already exists; refusing overwrite: ${EVIDENCE_PATH}`);
    writeFileSync(evidenceFile, `${canonicalJson(result)}\n`, { flag: "wx", mode: 0o644 });
  } else {
    const evidenceFile = path.join(root, EVIDENCE_PATH);
    if (existsSync(evidenceFile)) {
      const recorded = JSON.parse(readFileSync(evidenceFile, "utf8"));
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(recorded.verifiedAt ?? "")) fail("recorded verification timestamp is invalid");
      const stable = (value) => Object.fromEntries(Object.entries(value).filter(([key]) => key !== "verifiedAt"));
      if (canonicalJson(stable(recorded)) !== canonicalJson(stable(result))) fail("recorded federal output evidence drifted from live verification");
    }
  }
  return result;
}

function parseArgs(argv) {
  let dataRoot;
  let writeEvidence = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--write-evidence") writeEvidence = true;
    else if (arg === "--data-root") dataRoot = path.resolve(argv[++index] ?? fail("--data-root requires a path"));
    else if (arg === "--help" || arg === "-h") return { help: true };
    else fail(`unknown argument: ${arg}`);
  }
  return { dataRoot, writeEvidence };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) console.log("Usage: node scripts/check-phase1-federal-electoral-output.mjs [--write-evidence] [--data-root PATH]");
    else {
      const result = verify(args);
      console.log(`Read-only verification passed: ${result.output.sha256}; deterministic ephemeral artifact matched byte-for-byte.`);
      if (args.writeEvidence) console.log(`Evidence written: ${EVIDENCE_PATH}`);
    }
  } catch (error) {
    console.error(`Stopped: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
