#!/usr/bin/env node

/*
 * Fail-closed local runner for federal-electoral-districts-2023-v1.
 *
 * This command is deliberately conservative: --preflight is the default,
 * and --execute requires a separate, exact, future authorization record. The
 * owner scope approval, packet, specification, and source evidence remain
 * read-only inputs; this file never changes them.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, linkSync, mkdirSync, readFileSync, writeFileSync, rmSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RUNNER_VERSION = "phase1-federal-electoral-transformation-runner-v1";
export const SPEC_ID = "federal-electoral-districts-2023-v1";
export const METHOD_VERSION = "phase1-federal-electoral-districts-2023-v1";
export const SPEC_PATH = "data/phase1-production-transformation-specifications-v1.json";
export const SPEC_SHA256 = "258ca3f94e30d484b53cc12e29c83beaf57998993edaea05e44f5a4924979efc";
export const PACKET_PATH = "data/phase1-downstream-admission-packet.json";
export const PACKET_SHA256 = "4859407ea256988a50873c03aa4146c8dd15e5e13f9ced47fa87a7883b404d6a";
export const OWNER_SCOPE_PATH = "data/phase1-transformation-scope-owner-approval-2026-08-25.json";
export const PROFILE_PATH = "data/elections-canada-fed-2025-profile.json";
export const PROFILE_SHA256 = "a742f27e879126ded6cd37dc66f4595b488afd467a4523d8b9defcaa16379301";
export const SOURCE_LEDGER_PATH = "data/elections-canada-fed-2025-source-ledger.json";
export const SOURCE_LEDGER_SHA256 = "b1d28895c43c843a6072ef9adca661c26c3a27fbdda27650ea216abe56c707fb";
export const ARCHIVE_EVIDENCE_PATH = "data/federal-electoral-archive-recovery-evidence.json";
export const ARCHIVE_EVIDENCE_SHA256 = "18b9fbfa5e3eecdc33ad0098f5ffa55f7bfebb1a47d2e33b7f01a94e05a6ed32";
export const INPUT_SHA256 = "4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93";
export const INPUT_BYTE_LENGTH = 10301648;
export const INPUT_RELATIVE_PATH = "raw/elections-canada-federal-electoral-districts/2026-08-14/FederalElectoralDistricts_2025_SHP.zip";
export const LAYER_PATH = "SHP/FED_CA_2025_EN.shp";
export const LAYER_NAME = "FED_CA_2025_EN";
export const OUTPUT_LAYER = "federal_electoral_districts_2023";
export const OUTPUT_RELATIVE_PATH = "derived/phase1/federal-electoral-districts-2023-v1/4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93/phase1-federal-electoral-districts-2023-v1/federal-electoral-districts-2023.gpkg";
export const EXECUTION_APPROVAL_PATH = "data/phase1-federal-electoral-execution-approval.json";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "..");
export const DEFAULT_DATA_ROOT = path.resolve(REPO_ROOT, "../../Witness_Tree-data");
const SELECTED_FIELDS = ["FED_NUM", "ED_NAMEE", "ED_NAMEF", "REPORDER"];
const REQUIRED_OUTPUT_FIELDS = [
  ...SELECTED_FIELDS,
  "source_fid",
  "output_record_id",
  "source_raw_sha256",
  "source_layer",
];

const fail = (message) => { throw new Error(message); };
const readJson = (root, relativePath) => JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));
const sha256Bytes = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sha256File = (filePath) => sha256Bytes(readFileSync(filePath));
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const sortedKeys = (value) => {
  if (Array.isArray(value)) return value.map(sortedKeys);
  if (isObject(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortedKeys(value[key])]));
  return value;
};
export const canonicalJson = (value) => JSON.stringify(sortedKeys(value));
const runOgr = (args) => JSON.parse(execFileSync("ogrinfo", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }));
const runOgr2Ogr = (args) => execFileSync("ogr2ogr", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
const ensureNoSymlink = (target) => {
  let cursor = path.resolve(target);
  const missing = [];
  while (!existsSync(cursor)) { missing.push(cursor); cursor = path.dirname(cursor); }
  while (true) {
    const stat = lstatSync(cursor);
    if (stat.isSymbolicLink()) fail(`symlink path component refused: ${cursor}`);
    if (cursor === path.dirname(cursor)) break;
    cursor = path.dirname(cursor);
  }
  return missing;
};
const assertSha = (root, relativePath, expected) => {
  const filePath = path.join(root, relativePath);
  if (!existsSync(filePath)) fail(`missing bound file: ${relativePath}`);
  const actual = sha256File(filePath);
  if (actual !== expected) fail(`checksum drift: ${relativePath} (expected ${expected}, got ${actual})`);
};
const expectedField = (fields, name) => fields.find((field) => field.name === name);

function loadContext(root = REPO_ROOT, dataRoot = DEFAULT_DATA_ROOT) {
  assertSha(root, SPEC_PATH, SPEC_SHA256);
  assertSha(root, PACKET_PATH, PACKET_SHA256);
  assertSha(root, PROFILE_PATH, PROFILE_SHA256);
  assertSha(root, SOURCE_LEDGER_PATH, SOURCE_LEDGER_SHA256);
  assertSha(root, ARCHIVE_EVIDENCE_PATH, ARCHIVE_EVIDENCE_SHA256);

  const specRecord = readJson(root, SPEC_PATH);
  const spec = specRecord.specifications?.find((candidate) => candidate.id === SPEC_ID);
  if (!spec) fail(`missing bound specification: ${SPEC_ID}`);
  if (spec.methodVersion !== METHOD_VERSION) fail("method version drift");
  if (spec.selection?.layer !== LAYER_PATH) fail("source layer drift");
  if (JSON.stringify(spec.selection?.fields) !== JSON.stringify(SELECTED_FIELDS)) fail("selected field contract drift");
  if (spec.selection?.filter !== "REPORDER = '2023'") fail("REPORDER filter drift");
  if (spec.output?.path !== `../Witness_Tree-data/${OUTPUT_RELATIVE_PATH}`) fail("output path drift");
  if (spec.output?.checksumSha256 !== null) fail("bound specification must not contain an output checksum");

  const ownerScope = readJson(root, OWNER_SCOPE_PATH);
  const approvedScope = ownerScope.approvedScopes?.find((candidate) => candidate.specId === SPEC_ID);
  if (!approvedScope || approvedScope.decision !== "approve") fail("federal-electoral scope is not owner-approved");
  if (approvedScope.specPath !== SPEC_PATH || approvedScope.specSha256 !== SPEC_SHA256) fail("owner scope is not bound to the exact specification");

  for (const binding of spec.inputBindings ?? []) assertSha(root, binding.path, binding.sha256);
  const profile = readJson(root, PROFILE_PATH);
  const ledger = readJson(root, SOURCE_LEDGER_PATH);
  const archiveEvidence = readJson(root, ARCHIVE_EVIDENCE_PATH);
  if (profile.inputSha256 !== INPUT_SHA256) fail("profile raw input checksum drift");
  if (profile.layer?.path !== LAYER_PATH || profile.layer?.name !== LAYER_NAME) fail("profile layer drift");
  if (profile.layer?.featureCount !== 352 || profile.layer?.distinctFederalDistrictCount !== 343) fail("profile feature-count contract drift");
  if (JSON.stringify(profile.layer?.representationOrderValues) !== JSON.stringify(["2023"])) fail("profile representation-order drift");
  if (ledger.source?.sha256 !== INPUT_SHA256 || ledger.source?.localPath !== `../Witness_Tree-data/${INPUT_RELATIVE_PATH}`) fail("source ledger input binding drift");
  if (archiveEvidence.payload?.sha256 !== INPUT_SHA256 || archiveEvidence.payload?.byteLength !== INPUT_BYTE_LENGTH) fail("archive evidence input binding drift");

  const inputPath = path.resolve(dataRoot, INPUT_RELATIVE_PATH);
  if (!existsSync(inputPath)) fail(`missing local input: ${inputPath}`);
  const inputStat = lstatSync(inputPath);
  if (!inputStat.isFile() || inputStat.isSymbolicLink()) fail("local input must be a regular non-symlink file");
  if (inputStat.size !== INPUT_BYTE_LENGTH) fail(`local input byte length drift: expected ${INPUT_BYTE_LENGTH}, got ${inputStat.size}`);
  const actualInputSha = sha256File(inputPath);
  if (actualInputSha !== INPUT_SHA256) fail(`local input checksum drift: expected ${INPUT_SHA256}, got ${actualInputSha}`);

  const outputPath = path.resolve(dataRoot, OUTPUT_RELATIVE_PATH);
  const sidecarPath = `${outputPath}.sidecar.json`;
  if (existsSync(outputPath) || existsSync(sidecarPath)) fail("output or sidecar already exists; overwrite is refused");
  ensureNoSymlink(path.dirname(outputPath));
  return { root, dataRoot, spec, ownerScope, profile, ledger, archiveEvidence, inputPath, outputPath, sidecarPath, sourceDataset: `/vsizip/${inputPath}/${LAYER_PATH}` };
}

const metadataFor = (dataset, layer = undefined) => runOgr(["-ro", "-json", "-so", dataset, ...(layer ? [layer] : [])]).layers?.[0];
const featuresFor = (dataset, layer = undefined) => runOgr(["-ro", "-json", "-features", dataset, ...(layer ? [layer] : [])]).layers?.[0];
const aggregateFor = (dataset, layerName, geometryColumn = "geometry") => {
  const geometry = `"${geometryColumn || "geometry"}"`;
  const sql = `SELECT COUNT(*) AS feature_count, COUNT(DISTINCT "FED_NUM") AS distinct_fed_num_count, SUM(CASE WHEN "REPORDER" <> '2023' OR "REPORDER" IS NULL THEN 1 ELSE 0 END) AS non_2023_count, SUM(CASE WHEN ${geometry} IS NULL THEN 1 ELSE 0 END) AS missing_geometry_count, SUM(CASE WHEN ST_IsEmpty(${geometry}) THEN 1 ELSE 0 END) AS empty_geometry_count, SUM(CASE WHEN NOT ST_IsValid(${geometry}) THEN 1 ELSE 0 END) AS invalid_geometry_count FROM "${layerName}"`;
  return runOgr(["-ro", "-json", "-features", "-dialect", "SQLite", "-sql", sql, dataset]).layers?.[0]?.features?.[0]?.properties ?? {};
};

function validateSourceGeometryAndFeatures(context) {
  const layer = metadataFor(context.sourceDataset);
  if (!layer || layer.name !== LAYER_NAME) fail("source layer metadata missing");
  if (layer.featureCount !== 352) fail(`source feature count must be 352, got ${layer.featureCount}`);
  if (layer.geometryFields?.[0]?.type !== "Polygon") fail("source geometry type must be Polygon");
  const wkt = layer.geometryFields?.[0]?.coordinateSystem?.wkt ?? "";
  if (!/PCS_Lambert_Conformal_Conic/i.test(wkt) || !/NAD83/i.test(wkt)) fail("source CRS is not the bound NAD83 Lambert CRS");
  for (const name of SELECTED_FIELDS) if (!expectedField(layer.fields ?? [], name)) fail(`source field missing: ${name}`);
  const aggregate = aggregateFor(context.sourceDataset, LAYER_NAME, layer.geometryFields?.[0]?.name || "geometry");
  if (aggregate.feature_count !== 352 || aggregate.distinct_fed_num_count !== 343 || aggregate.non_2023_count !== 0 || aggregate.missing_geometry_count !== 0 || aggregate.empty_geometry_count !== 0 || aggregate.invalid_geometry_count !== 0) fail(`source geometry/selection QA failed: ${JSON.stringify(aggregate)}`);
  const featureLayer = featuresFor(context.sourceDataset);
  const features = featureLayer?.features ?? [];
  if (features.length !== 352) fail(`source feature readback must contain 352 features, got ${features.length}`);
  const byFid = new Map();
  for (const feature of features) {
    const fid = Number(feature.fid);
    const properties = feature.properties ?? {};
    if (!Number.isInteger(fid) || byFid.has(fid)) fail("source feature FID is missing or duplicated");
    if (properties.REPORDER !== "2023") fail("source feature outside REPORDER=2023 filter");
    if (!feature.geometry || feature.geometry.type !== "Polygon" || !Array.isArray(feature.geometry.coordinates) || feature.geometry.coordinates.length === 0) fail(`source geometry missing/empty for FID ${fid}`);
    byFid.set(fid, { fid, properties, geometry: feature.geometry });
  }
  return { layer, aggregate, features: byFid };
}

export function expectedOutputRecordId(sourceFid, properties) {
  return sha256Bytes(Buffer.from([SPEC_ID, METHOD_VERSION, INPUT_SHA256, String(sourceFid), String(properties.FED_NUM), String(properties.REPORDER)].join("\u001f")));
}

export function validateExecutionApproval(context) {
  const approvalFile = path.join(context.root, EXECUTION_APPROVAL_PATH);
  if (!existsSync(approvalFile)) fail(`execution refused: missing future authorization record ${EXECUTION_APPROVAL_PATH}`);
  const record = readJson(context.root, EXECUTION_APPROVAL_PATH);
  const requiredKeys = ["schemaVersion", "status", "decision", "approvedAt", "ownerAuthorization", "spec", "packet", "ownerScope", "runner", "source", "output", "authorization"];
  if (JSON.stringify(Object.keys(record).sort()) !== JSON.stringify(requiredKeys.sort())) fail("execution authorization record keys are not exact");
  if (record.schemaVersion !== "witness-tree/phase1-federal-electoral-execution-approval/1" || record.status !== "owner-authorized-execution" || record.decision !== "approve") fail("execution authorization record status/decision is invalid");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(record.approvedAt)) fail("execution authorization approvedAt must be an exact UTC timestamp");
  if (JSON.stringify(record.ownerAuthorization) !== JSON.stringify({ ownerName: "Chinonso Obeta", statement: "You can execute them when complete.", scope: "All seven Phase 1 transformation scopes, including this federal-electoral scope." })) fail("owner execution statement drift");
  if (JSON.stringify(record.spec) !== JSON.stringify({ id: SPEC_ID, methodVersion: METHOD_VERSION, path: SPEC_PATH, sha256: SPEC_SHA256 })) fail("execution authorization spec binding drift");
  if (JSON.stringify(record.packet) !== JSON.stringify({ path: PACKET_PATH, sha256: PACKET_SHA256 })) fail("execution authorization packet binding drift");
  const ownerSha = sha256File(path.join(context.root, OWNER_SCOPE_PATH));
  if (JSON.stringify(record.ownerScope) !== JSON.stringify({ path: OWNER_SCOPE_PATH, sha256: ownerSha, specId: SPEC_ID })) fail("execution authorization owner-scope binding drift");
  const runnerPath = path.relative(context.root, fileURLToPath(import.meta.url));
  const runnerSha = sha256File(fileURLToPath(import.meta.url));
  if (JSON.stringify(record.runner) !== JSON.stringify({ path: runnerPath, sha256: runnerSha, version: RUNNER_VERSION })) fail("execution authorization runner binding drift");
  const expectedSource = { path: `../Witness_Tree-data/${INPUT_RELATIVE_PATH}`, sha256: INPUT_SHA256, byteLength: INPUT_BYTE_LENGTH, profilePath: PROFILE_PATH, profileSha256: PROFILE_SHA256, ledgerPath: SOURCE_LEDGER_PATH, ledgerSha256: SOURCE_LEDGER_SHA256, archiveEvidencePath: ARCHIVE_EVIDENCE_PATH, archiveEvidenceSha256: ARCHIVE_EVIDENCE_SHA256 };
  if (JSON.stringify(record.source) !== JSON.stringify(expectedSource)) fail("execution authorization source binding drift");
  const expectedOutput = { path: `../Witness_Tree-data/${OUTPUT_RELATIVE_PATH}`, sidecarPath: `../Witness_Tree-data/${OUTPUT_RELATIVE_PATH}.sidecar.json`, layer: OUTPUT_LAYER };
  if (JSON.stringify(record.output) !== JSON.stringify(expectedOutput)) fail("execution authorization output binding drift");
  const expectedAuthorization = { executionAuthorized: true, ingestionAuthorized: false, releaseAuthorized: false, productionAdmissionAuthorized: false, productionEligibilityGranted: false, externalMutationPerformed: false, overwriteExisting: false };
  if (JSON.stringify(record.authorization) !== JSON.stringify(expectedAuthorization)) fail("execution authorization boundary drift");
  return record;
}

function mutateLineage(outputPath, rows) {
  const cases = rows.map(({ source_fid: sourceFid, output_record_id: outputRecordId }) => `WHEN ${Number(sourceFid)} THEN '${outputRecordId}'`).join(" ");
  const update = `UPDATE "${OUTPUT_LAYER}" SET output_record_id = CASE source_fid ${cases} ELSE NULL END`;
  execFileSync("ogrinfo", ["-update", outputPath, "-dialect", "SQLite", "-sql", update], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  execFileSync("ogrinfo", ["-update", outputPath, "-dialect", "SQLite", "-sql", `UPDATE gpkg_contents SET last_change='2000-01-01T00:00:00.000Z' WHERE table_name='${OUTPUT_LAYER}'`], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
}

function validateOutput(context, sourceReadback, datasetPath = context.outputPath) {
  const layer = metadataFor(datasetPath, OUTPUT_LAYER);
  if (!layer || layer.name !== OUTPUT_LAYER || layer.featureCount !== 352) fail("output layer/count contract failed");
  if (layer.geometryFields?.[0]?.type !== "Polygon") fail("output geometry type must remain Polygon");
  const outputWkt = layer.geometryFields?.[0]?.coordinateSystem?.wkt ?? "";
  if (!/PCS_Lambert_Conformal_Conic/i.test(outputWkt) || !/NAD83/i.test(outputWkt)) fail("output CRS drift");
  for (const name of REQUIRED_OUTPUT_FIELDS) if (!expectedField(layer.fields ?? [], name)) fail(`output field missing: ${name}`);
  const aggregate = aggregateFor(datasetPath, OUTPUT_LAYER, layer.geometryFields?.[0]?.name || "geometry");
  if (aggregate.feature_count !== 352 || aggregate.distinct_fed_num_count !== 343 || aggregate.non_2023_count !== 0 || aggregate.missing_geometry_count !== 0 || aggregate.empty_geometry_count !== 0 || aggregate.invalid_geometry_count !== 0) fail(`output geometry/selection QA failed: ${JSON.stringify(aggregate)}`);
  const featureLayer = featuresFor(datasetPath, OUTPUT_LAYER);
  const features = featureLayer?.features ?? [];
  if (features.length !== 352) fail("output feature readback count failed");
  const seen = new Set();
  for (const feature of features) {
    const props = feature.properties ?? {};
    const sourceFid = Number(props.source_fid);
    const source = sourceReadback.features.get(sourceFid);
    if (!source || seen.has(sourceFid)) fail(`output source_fid mismatch: ${props.source_fid}`);
    seen.add(sourceFid);
    for (const field of SELECTED_FIELDS) if (props[field] !== source.properties[field]) fail(`output field drift for ${field}, source_fid ${sourceFid}`);
    if (canonicalJson(feature.geometry) !== canonicalJson(source.geometry)) fail(`output geometry changed for source_fid ${sourceFid}`);
    if (props.output_record_id !== expectedOutputRecordId(sourceFid, source.properties)) fail(`output_record_id mismatch for source_fid ${sourceFid}`);
    if (props.source_raw_sha256 !== INPUT_SHA256 || props.source_layer !== LAYER_PATH) fail(`output lineage mismatch for source_fid ${sourceFid}`);
  }
  if (seen.size !== 352) fail("output does not retain all source polygon features");
  return { aggregate, featureCount: features.length };
}

function toolVersion(command, args = ["--version"]) {
  try { return execFileSync(command, args, { encoding: "utf8" }).trim().split("\n")[0]; } catch { return "unavailable"; }
}

function execute(context, sourceReadback, approval) {
  const outputParent = path.dirname(context.outputPath);
  mkdirSync(outputParent, { recursive: true });
  ensureNoSymlink(outputParent);
  if (existsSync(context.outputPath) || existsSync(context.sidecarPath)) fail("output appeared after preflight; refusing overwrite");
  const tempPath = `${context.outputPath}.tmp-${process.pid}`;
  const tempSidecarPath = `${context.sidecarPath}.tmp-${process.pid}`;
  if (existsSync(tempPath)) fail("temporary output already exists");
  if (existsSync(tempSidecarPath)) fail("temporary sidecar already exists");
  const sql = `SELECT FID AS source_fid, FED_NUM, ED_NAMEE, ED_NAMEF, REPORDER, '' AS output_record_id, '${INPUT_SHA256}' AS source_raw_sha256, '${LAYER_PATH}' AS source_layer FROM "${LAYER_NAME}" WHERE "REPORDER" = '2023'`;
  let publishedOutput = false;
  let publishedSidecar = false;
  try {
    runOgr2Ogr(["-f", "GPKG", "-nln", OUTPUT_LAYER, "-dialect", "OGRSQL", "-sql", sql, "-dsco", "VERSION=1.2", tempPath, context.sourceDataset]);
    const rows = [...sourceReadback.features.values()].map(({ fid, properties }) => ({ source_fid: fid, output_record_id: expectedOutputRecordId(fid, properties), source_raw_sha256: INPUT_SHA256, source_layer: LAYER_PATH }));
    mutateLineage(tempPath, rows);
    const outputQa = validateOutput(context, sourceReadback, tempPath);
    const outputBytes = readFileSync(tempPath);
    const sidecar = {
      specId: SPEC_ID,
      methodVersion: METHOD_VERSION,
      inputBindings: context.spec.inputBindings,
      command: "node scripts/run-phase1-federal-electoral-transformation.mjs --execute",
      toolVersions: { gdal: toolVersion("ogr2ogr"), node: process.version },
      output: { path: `../Witness_Tree-data/${OUTPUT_RELATIVE_PATH}`, layer: OUTPUT_LAYER, featureCount: outputQa.featureCount, polygonFeatureCount: 352, distinctFederalDistrictCount: 343 },
      outputSha256: sha256Bytes(outputBytes),
      outputByteLength: outputBytes.length,
      createdAt: approval.approvedAt,
      qa: { filter: "REPORDER = '2023'", sourceFeatureCount: 352, outputFeatureCount: outputQa.featureCount, distinctFED_NUM: 343, geometry: "zero missing, empty, or invalid geometries; exact geometry readback matched", crs: "NAD83 Lambert Conformal Conic retained", deterministic: true, executionAuthorization: EXECUTION_APPROVAL_PATH },
    };
    writeFileSync(tempSidecarPath, `${canonicalJson(sidecar)}\n`, { flag: "wx", mode: 0o600 });
    linkSync(tempPath, context.outputPath); publishedOutput = true;
    linkSync(tempSidecarPath, context.sidecarPath); publishedSidecar = true;
    unlinkSync(tempPath);
    unlinkSync(tempSidecarPath);
    return sidecar;
  } catch (error) {
    if (publishedSidecar) rmSync(context.sidecarPath, { force: true });
    if (publishedOutput) rmSync(context.outputPath, { force: true });
    if (existsSync(tempPath)) rmSync(tempPath, { force: true });
    if (existsSync(tempSidecarPath)) rmSync(tempSidecarPath, { force: true });
    throw error;
  }
}

export function preflight({ root = REPO_ROOT, dataRoot = DEFAULT_DATA_ROOT } = {}) {
  const context = loadContext(root, dataRoot);
  const sourceReadback = validateSourceGeometryAndFeatures(context);
  return { context, sourceReadback };
}

function parseArgs(argv) {
  let mode = "preflight";
  let dataRoot;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--preflight") mode = "preflight";
    else if (arg === "--execute") mode = "execute";
    else if (arg === "--data-root") dataRoot = path.resolve(argv[++index] ?? fail("--data-root requires a path"));
    else if (arg === "--help" || arg === "-h") return { help: true };
    else fail(`unknown argument: ${arg}`);
  }
  return { mode, dataRoot };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log("Usage: node scripts/run-phase1-federal-electoral-transformation.mjs [--preflight|--execute] [--data-root PATH]");
    } else {
      const result = preflight({ dataRoot: args.dataRoot });
      if (args.mode === "preflight") {
        console.log(`Preflight passed: ${SPEC_ID}; 352 polygon features, 343 FED_NUM districts; execution remains blocked until ${EXECUTION_APPROVAL_PATH} exists.`);
      } else {
        const approval = validateExecutionApproval(result.context);
        const sidecar = execute(result.context, result.sourceReadback, approval);
        console.log(`Transformation completed: ${result.context.outputPath} (${sidecar.outputSha256})`);
      }
    }
  } catch (error) {
    console.error(`Stopped: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
