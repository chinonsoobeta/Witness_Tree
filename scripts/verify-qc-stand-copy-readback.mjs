#!/usr/bin/env node
/**
 * Independent, read-only post-publication verifier for the two Québec
 * stand-copy GeoPackages.
 *
 * The no-flag mode is deliberately a cheap presence preflight.  A full
 * readback is opt-in with --verify (or --write-evidence), and uses read-only
 * ogrinfo/SQLite reads.  It never transforms or changes a GeoPackage, or
 * makes an ingestion, release, or production-admission decision.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { closeSync, lstatSync, openSync, readFileSync, readSync, statSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_DATA_ROOT = path.resolve(ROOT, "../../Witness_Tree-data");
export const VERIFIER_PATH = "scripts/verify-qc-stand-copy-readback.mjs";
export const VERIFIER_METHOD_VERSION = "qc-stand-copy-independent-readback-v1";
export const SIDECAR_SCHEMA = "witness-tree/qc-stand-copy-sidecar/1";
export const EVIDENCE_SCHEMA = "witness-tree/qc-stand-copy-readback-evidence/1";
export const PACKET_SHA256 = "4859407ea256988a50873c03aa4146c8dd15e5e13f9ced47fa87a7883b404d6a";
export const OWNER_SCOPE_APPROVAL_SHA256 = "fda1c43d2ee23adb35907ddf012c9b64aa23e69774866c725271ed91223dffb2";
export const METHOD_VERSION = "qc-stand-copy-runner-v1";
const SHA256 = /^[0-9a-f]{64}$/;

const CURRENT_FIELDS = Object.freeze([
  "geoc_maj", "geocode", "origine", "an_origine", "perturb", "an_perturb", "reb_ess1", "reb_ess2", "reb_ess3", "et_domi", "part_str", "type_couv", "gr_ess", "cl_dens", "cl_haut", "cl_age", "etagement", "couv_gaule", "cl_pent", "dep_sur", "cl_drai", "type_eco", "co_ter", "type_ter", "strate", "met_at_str", "superficie", "toponyme", "no_prg", "ver_prg", "in_maj", "shape_length", "shape_area",
]);
const ORIGINAL_FIELDS = Object.freeze([
  "geocode", "origine", "an_origine", "perturb", "an_perturb", "reb_ess1", "reb_ess2", "reb_ess3", "et_domi", "part_str", "type_couv", "gr_ess", "cl_dens", "cl_haut", "cl_age", "etagement", "couv_gaule", "cl_pent", "dep_sur", "cl_drai", "type_eco", "co_ter", "type_ter", "strate", "met_at_str", "superficie", "toponyme", "no_prg", "ver_prg", "shape_length", "shape_area",
]);

function outputSchema(fields) {
  return ["fid", "geom", ...fields, "source_fid", "output_record_id", "source_raw_sha256", "source_layer"];
}

function outputRelativePath(specId, rawSha256, layer) {
  return `derived/phase1/${specId}/${rawSha256}/${METHOD_VERSION}/${layer}.gpkg`;
}

export const SCOPES = Object.freeze({
  "qc-current-ecoforest": Object.freeze({
    rowId: "qc-current-ecoforest",
    specId: "qc-current-ecoforest-stand-copy-v1",
    specSha256: "44cdb08f033fc80040a7edf373189a0ce8c74bc3132d4e0892816fcf3f22bb1d",
    specPath: "data/transformation-specs/qc-current-ecoforest-stand-copy-v1.json",
    sourceRelativePath: "work/qc-current-ecoforest/2026-08-14/CARTE_ECO_MAJ_PROV.gpkg",
    sourceLayer: "pee_maj_prov",
    sourceRawSha256: "c67c56b0c101e95bef4fbca53a06e2f1578fe38293961017f70d815209740cf1",
    sourceRawBytes: 12399475076,
    extractedSha256: "4f592f99786770600bdf219e8cdae5908d9a2398ab6a9ae45662fafa2494aa00",
    archiveMember: "CARTE_ECO_MAJ_PROV.gpkg",
    outputLayer: "qc_current_ecoforest_stands",
    featureCount: 9827536,
    geometryType: "MultiPolygon",
    crs: "EPSG:32198",
    sourceRowKey: "fid",
    joinKey: undefined,
    fields: CURRENT_FIELDS,
    executionApprovalSha256: "e6b746fc433a40c3bc44651d0354b794dbf6700f4e28d1496b5467b8fe71dac5",
    prohibitedClaims: ["production admission", "complete Québec forest-land coverage", "harvest event identification", "disturbance causation", "current real-time conditions", "a change to publisher data"],
    evidencePath: "data/qc-current-ecoforest-stand-copy-readback-evidence.json",
  }),
  "qc-original-current-inventory": Object.freeze({
    rowId: "qc-original-current-inventory",
    specId: "qc-original-current-inventory-stand-copy-v1",
    specSha256: "71707b702f2367d46c985e84f5f16e19ad75012c8efe71b2ff17dd8063c7ab2c",
    specPath: "data/transformation-specs/qc-original-current-inventory-stand-copy-v1.json",
    sourceRelativePath: "extracted/qc-original-current-inventory/2026-08-14/CARTE_ECO_ORI_PROV.gpkg",
    sourceLayer: "pee_ori_prov",
    sourceRawSha256: "c10d691516569de76642dc1fc64e662f2569b5b58ab5d945b58b8b7834ba9c61",
    sourceRawBytes: 11244667626,
    extractedSha256: "70539d99497de2773342611d73bf9e4fadf01f1fdbfe3ca536ad711d87916e7c",
    archiveMember: "CARTE_ECO_ORI_PROV.gpkg",
    outputLayer: "qc_original_current_inventory_stands",
    featureCount: 8387062,
    geometryType: "MultiPolygon",
    crs: "EPSG:32198",
    sourceRowKey: "fid",
    joinKey: "geocode",
    fields: ORIGINAL_FIELDS,
    executionApprovalSha256: "af17727494ae2ef9c1c67d8bcb38110a855493a7edf2538b593c0b8147badb89",
    prohibitedClaims: ["production admission", "a temporal update chronology", "a fourth-inventory result", "a complete forest-land denominator", "harmonized disturbance or harvest classification"],
    evidencePath: "data/qc-original-current-inventory-stand-copy-readback-evidence.json",
  }),
});

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function canonicalJson(value) {
  return `${canonical(value)}\n`;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function sha256File(file) {
  const hash = createHash("sha256");
  const fd = openSync(file, "r");
  const buffer = Buffer.allocUnsafe(8 * 1024 * 1024);
  try {
    for (;;) {
      const count = readSync(fd, buffer, 0, buffer.length, null);
      if (count === 0) break;
      hash.update(buffer.subarray(0, count));
    }
  } finally {
    closeSync(fd);
  }
  return hash.digest("hex");
}

function exact(actual, expected, label) {
  assert.deepEqual(actual, expected, `${label} drifted.`);
}

function exactKeys(value, keys, label) {
  exact(Object.keys(value ?? {}).sort(), [...keys].sort(), `${label} keys`);
}

function object(value, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
}

function regularFile(file, label) {
  const info = lstatSync(file);
  assert.equal(info.isFile(), true, `${label} must be a regular file.`);
  assert.equal(info.isSymbolicLink(), false, `${label} must not be a symlink.`);
  return info;
}

function safeRelative(value, label, allowParent = false) {
  assert.equal(typeof value, "string", `${label} must be a string.`);
  assert.ok(value.length > 0, `${label} must not be empty.`);
  assert.equal(path.isAbsolute(value), false, `${label} must be relative.`);
  assert.equal(value.includes("\0"), false, `${label} must not contain NUL.`);
  if (!allowParent) assert.equal(value.split(/[\\/]/).includes(".."), false, `${label} must not contain parent traversal.`);
}

function run(command, args, { spawnImpl = spawn, maxOutput = 32 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const out = [];
    const err = [];
    let outputBytes = 0;
    child.stdout.on("data", (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes <= maxOutput) out.push(chunk);
    });
    child.stderr.on("data", (chunk) => err.push(chunk));
    child.on("error", reject);
    child.on("close", (code, signal) => {
      const result = { code, signal, stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8") };
      if (code !== 0) reject(new Error(`${command} ${args.join(" ")} failed (${code ?? signal}): ${result.stderr.trim()}`));
      else resolve(result);
    });
  });
}

async function ogrJson(args, dependencies = {}) {
  const command = dependencies.ogrinfoBin || process.env.OGRINFO_BIN || "ogrinfo";
  const result = dependencies.runOgr
    ? await dependencies.runOgr(args)
    : dependencies.runCommand
      ? await dependencies.runCommand(command, args)
      : await run(command, args, dependencies);
  if (result && typeof result === "object" && result.layers) return result;
  if (typeof result === "string") return JSON.parse(result);
  assert.equal(result?.code ?? 0, 0, "ogrinfo read failed.");
  try { return JSON.parse(result.stdout); } catch (error) { throw new Error(`ogrinfo did not return JSON: ${error.message}`); }
}

function metadataFrom(result, label) {
  const metadata = result?.layers?.[0];
  object(metadata, `${label} metadata`);
  return metadata;
}

function normalizeGeometryType(value) {
  return String(value ?? "").replaceAll(/\s+/g, "").toLowerCase();
}

function metadataCrs(metadata) {
  const geometry = metadata.geometryFields?.[0];
  const id = geometry?.coordinateSystem?.projjson?.id;
  if (id?.authority && id?.code !== undefined) return `${id.authority}:${id.code}`;
  if (id?.code !== undefined) return `EPSG:${id.code}`;
  const name = geometry?.coordinateSystem?.projjson?.name;
  return typeof name === "string" ? name : undefined;
}

function metadataSignature(metadata, expected, { output, label }) {
  exact(metadata.name, output ? expected.outputLayer : expected.sourceLayer, `${label} layer`);
  exact(metadata.fidColumnName, "fid", `${label} FID column`);
  exact(metadata.featureCount, expected.featureCount, `${label} feature count`);
  const geometry = metadata.geometryFields?.find((field) => field.name === "geom") ?? metadata.geometryFields?.[0];
  object(geometry, `${label} geometry metadata`);
  exact(geometry.name, "geom", `${label} geometry column`);
  assert.equal(normalizeGeometryType(geometry.type), normalizeGeometryType(expected.geometryType), `${label} geometry type drifted.`);
  exact(metadataCrs(metadata), expected.crs, `${label} CRS`);
  const fields = (metadata.fields ?? []).map((field) => field.name);
  const expectedFields = output ? expected.fields.concat(["source_fid", "output_record_id", "source_raw_sha256", "source_layer"]) : expected.fields;
  exact(fields, expectedFields, `${label} attribute schema`);
  return {
    layer: metadata.name,
    geometryColumn: geometry.name,
    geometryType: geometry.type,
    crs: expected.crs,
    featureCount: metadata.featureCount,
    fields: output ? outputSchema(expected.fields) : ["fid", "geom", ...expected.fields],
  };
}

function quoteIdentifier(value) {
  assert.match(value, /^[A-Za-z_][A-Za-z0-9_]*$/, `unsafe SQLite identifier: ${value}`);
  return `"${value}"`;
}

function qaSql(expected, { output }) {
  const layer = quoteIdentifier(output ? expected.outputLayer : expected.sourceLayer);
  const fid = quoteIdentifier(expected.sourceRowKey);
  const geom = quoteIdentifier("geom");
  const key = expected.joinKey ? `SUM(CASE WHEN ${quoteIdentifier(expected.joinKey)} IS NULL OR TRIM(CAST(${quoteIdentifier(expected.joinKey)} AS TEXT)) = '' THEN 1 ELSE 0 END)` : "0";
  const lineage = output ? `,
    SUM(CASE WHEN ${quoteIdentifier("source_fid")} IS NULL OR ${quoteIdentifier("output_record_id")} IS NULL OR ${quoteIdentifier("source_raw_sha256")} IS NULL OR ${quoteIdentifier("source_layer")} IS NULL THEN 1 ELSE 0 END) AS lineage_missing_count,
    SUM(CASE WHEN ${quoteIdentifier("source_fid")} <> ${fid} THEN 1 ELSE 0 END) AS lineage_fid_mismatch_count,
    SUM(CASE WHEN ${quoteIdentifier("source_raw_sha256")} <> '${expected.sourceRawSha256}' THEN 1 ELSE 0 END) AS lineage_raw_sha256_mismatch_count,
    SUM(CASE WHEN ${quoteIdentifier("source_layer")} <> '${expected.sourceLayer}' THEN 1 ELSE 0 END) AS lineage_layer_mismatch_count` : "";
  return `SELECT COUNT(*) AS feature_count, COUNT(DISTINCT ${fid}) AS distinct_fid_count, SUM(CASE WHEN ${fid} IS NULL THEN 1 ELSE 0 END) AS missing_fid_count, SUM(CASE WHEN ${geom} IS NULL THEN 1 ELSE 0 END) AS missing_geometry_count, SUM(CASE WHEN ST_IsEmpty(${geom}) THEN 1 ELSE 0 END) AS empty_geometry_count, SUM(CASE WHEN ST_IsValid(${geom}) = 0 THEN 1 ELSE 0 END) AS invalid_geometry_count, ${key} AS blank_key_count${lineage} FROM ${layer}`;
}

function qaFrom(result, label) {
  const feature = result?.layers?.[0]?.features?.[0]?.properties;
  object(feature, `${label} QA`);
  const qa = Object.fromEntries(Object.entries(feature).map(([key, value]) => [key, Number(value ?? 0)]));
  return qa;
}

function validateQa(qa, expected, { output, label }) {
  const required = {
    feature_count: expected.featureCount,
    distinct_fid_count: expected.featureCount,
    missing_fid_count: 0,
    missing_geometry_count: 0,
    empty_geometry_count: 0,
    invalid_geometry_count: 0,
    blank_key_count: 0,
  };
  if (output) Object.assign(required, { lineage_missing_count: 0, lineage_fid_mismatch_count: 0, lineage_raw_sha256_mismatch_count: 0, lineage_layer_mismatch_count: 0 });
  exact(qa, required, `${label} geometry/count QA`);
  return qa;
}

// Python's sqlite3 adapter uses this exact tagged representation in the
// production runner.  Keeping the representation here means the independent
// readback can compare the runner's published row fingerprints byte-for-byte.
const FLOAT_BUFFER = new ArrayBuffer(8);
const FLOAT_VIEW = new DataView(FLOAT_BUFFER);
function pythonFloatHex(value) {
  if (Object.is(value, -0)) return "-0x0.0p+0";
  if (value === 0) return "0x0.0p+0";
  if (!Number.isFinite(value)) return String(value).toLowerCase();
  FLOAT_VIEW.setFloat64(0, value, false);
  const high = FLOAT_VIEW.getUint32(0, false);
  const low = FLOAT_VIEW.getUint32(4, false);
  const sign = high >>> 31 ? "-" : "";
  const exponent = (high >>> 20) & 0x7ff;
  const fraction = (BigInt(high & 0xfffff) << 32n) | BigInt(low);
  if (exponent === 0 && fraction === 0n) return `${sign}0x0.0p+0`;
  if (exponent === 0x7ff) return `${sign}${fraction === 0n ? "inf" : "nan"}`;
  const significand = exponent === 0 ? fraction : (1n << 52n) | fraction;
  const exponentValue = exponent === 0 ? -1022 : exponent - 1023;
  const integer = exponent === 0 ? "0" : "1";
  const fractionHex = (significand & ((1n << 52n) - 1n)).toString(16).padStart(13, "0");
  return `${sign}0x${integer}.${fractionHex}p${exponentValue >= 0 ? "+" : ""}${exponentValue}`;
}

function valueBytes(value, declaredType = "") {
  if (value === null || value === undefined) return Buffer.from("N");
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    const bytes = Buffer.from(value);
    return Buffer.concat([Buffer.from("B"), lengthBytes(bytes.length), bytes]);
  }
  if (typeof value === "bigint" || (typeof value === "number" && Number.isInteger(value) && !/REAL|DOUBLE|FLOAT/i.test(declaredType))) return Buffer.from(`I${value}`);
  if (typeof value === "number") return Buffer.from(`F${pythonFloatHex(value)}`);
  return Buffer.from(`T${String(value)}`, "utf8");
}

function lengthBytes(length) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(BigInt(length));
  return bytes;
}

function digestRows(db, layer, columns) {
  const query = `SELECT ${columns.map(quoteIdentifier).join(", ")} FROM ${quoteIdentifier(layer)} ORDER BY ${quoteIdentifier("fid")} ASC`;
  const tableInfo = db.prepare(`PRAGMA table_info(${quoteIdentifier(layer)})`).all();
  const declaredTypes = new Map(tableInfo.map((entry) => [entry.name, entry.type ?? ""]));
  const digest = createHash("sha256");
  let count = 0;
  for (const row of db.prepare(query).iterate()) {
    for (const column of columns) {
      const token = valueBytes(row[column], declaredTypes.get(column));
      digest.update(lengthBytes(token.length));
      digest.update(token);
    }
    count += 1;
  }
  return { count, sha256: digest.digest("hex") };
}

function validateOutputLineage(db, expected) {
  const sql = `SELECT ${["fid", "source_fid", "output_record_id", "source_raw_sha256", "source_layer"].map(quoteIdentifier).join(", ")} FROM ${quoteIdentifier(expected.outputLayer)} ORDER BY ${quoteIdentifier("fid")} ASC`;
  let count = 0;
  for (const row of db.prepare(sql).iterate()) {
    const fid = row.fid;
    exact(row.source_fid, fid, "output source_fid lineage");
    exact(row.source_raw_sha256, expected.sourceRawSha256, "output source_raw_sha256 lineage");
    exact(row.source_layer, expected.sourceLayer, "output source_layer lineage");
    exact(row.output_record_id, sha256(Buffer.from(`${expected.sourceRawSha256}:${expected.sourceLayer}:${fid}`)), "output_record_id lineage");
    count += 1;
  }
  exact(count, expected.featureCount, "output lineage row count");
  return true;
}

function sqliteFingerprints(sourceFile, outputFile, expected, dependencies = {}) {
  if (dependencies.readSqlite) return dependencies.readSqlite({ sourceFile, outputFile, expected });
  regularFile(sourceFile, "source GeoPackage");
  regularFile(outputFile, "published GeoPackage");
  const sourceDb = new DatabaseSync(sourceFile, { readOnly: true });
  const outputDb = new DatabaseSync(outputFile, { readOnly: true });
  try {
    const columns = ["fid", "geom", ...expected.fields];
    const source = digestRows(sourceDb, expected.sourceLayer, columns);
    const output = digestRows(outputDb, expected.outputLayer, columns);
    validateOutputLineage(outputDb, expected);
    exact(source.count, expected.featureCount, "SQLite source row count");
    exact(output.count, expected.featureCount, "SQLite output row count");
    return { sourceRowFingerprintSha256: source.sha256, outputRowFingerprintSha256: output.sha256, sourceCount: source.count, outputCount: output.count };
  } finally {
    sourceDb.close();
    outputDb.close();
  }
}

function expectedSidecar(expected, scopeId, outputSha256, fingerprints) {
  return {
    schemaVersion: SIDECAR_SCHEMA,
    methodVersion: METHOD_VERSION,
    scopeId,
    specification: { id: expected.specId, sha256: expected.specSha256 },
    packetSha256: PACKET_SHA256,
    ownerScopeApprovalSha256: OWNER_SCOPE_APPROVAL_SHA256,
    executionApprovalSha256: expected.executionApprovalSha256,
    source: {
      rawArchiveSha256: expected.sourceRawSha256,
      rawArchiveBytes: expected.sourceRawBytes,
      archiveMember: expected.archiveMember,
      archiveMemberSha256: expected.extractedSha256,
      extractedGeoPackageSha256: expected.extractedSha256,
    },
    input: {
      layer: expected.sourceLayer,
      geometryColumn: "geom",
      geometryType: expected.geometryType,
      crs: 32198,
      featureCount: expected.featureCount,
      fields: expected.fields,
      qa: {
        feature_count: expected.featureCount,
        distinct_fid_count: expected.featureCount,
        missing_fid_count: 0,
        missing_geometry_count: 0,
        empty_geometry_count: 0,
        invalid_geometry_count: 0,
        blank_key_count: 0,
      },
    },
    output: {
      layer: expected.outputLayer,
      sha256: outputSha256,
      schema: outputSchema(expected.fields),
      featureCount: expected.featureCount,
      sourceRowFingerprintSha256: fingerprints.sourceRowFingerprintSha256,
      outputRowFingerprintSha256: fingerprints.outputRowFingerprintSha256,
      geometryByteCopy: true,
    },
    qa: {
      exactInputBindings: true,
      schemaCrsFeatureCountGeometryChecks: true,
      joins: false,
      reprojection: false,
      repair: false,
      simplify: false,
      snap: false,
      dissolve: false,
      semanticInference: false,
      losslessRowFingerprintMatch: true,
      deterministicRerunArtifactMatch: true,
    },
    prohibitedClaims: expected.prohibitedClaims,
  };
}

export function validateSidecarContract(sidecar, sidecarBytes, scopeId, expected, outputSha256, fingerprints) {
  object(sidecar, `${scopeId} sidecar`);
  exactKeys(sidecar, ["schemaVersion", "methodVersion", "scopeId", "specification", "packetSha256", "ownerScopeApprovalSha256", "executionApprovalSha256", "source", "input", "output", "qa", "prohibitedClaims"], `${scopeId} sidecar`);
  exact(sidecar, expectedSidecar(expected, scopeId, outputSha256, fingerprints), `${scopeId} sidecar contract`);
  exact(Buffer.from(sidecarBytes).toString("utf8"), canonicalJson(sidecar), `${scopeId} sidecar canonical bytes`);
  assert.match(sidecar.output.sourceRowFingerprintSha256, SHA256, `${scopeId} source row fingerprint`);
  assert.match(sidecar.output.outputRowFingerprintSha256, SHA256, `${scopeId} output row fingerprint`);
  return true;
}

function evidenceRecord({ dataRoot, scopeId, expected, outputFile, sidecarFile, outputMetadata, sourceMetadata, outputQa, sourceQa, fingerprints, outputSha256, sidecarSha256, sidecarByteLength, verifierSha256 }) {
  const outputPath = path.relative(dataRoot, outputFile).split(path.sep).join("/");
  const sidecarPath = path.relative(dataRoot, sidecarFile).split(path.sep).join("/");
  const sourcePath = path.relative(dataRoot, path.join(dataRoot, expected.sourceRelativePath)).split(path.sep).join("/");
  return {
    schemaVersion: EVIDENCE_SCHEMA,
    status: "complete-readback-verified",
    mode: "post-publication-readback",
    scopeId,
    verifier: { path: VERIFIER_PATH, sha256: verifierSha256, methodVersion: VERIFIER_METHOD_VERSION },
    specification: { id: expected.specId, path: expected.specPath, sha256: expected.specSha256 },
    output: {
      path: outputPath,
      sidecarPath,
      layer: expected.outputLayer,
      schema: outputMetadata.fields,
      crs: expected.crs,
      geometryType: expected.geometryType,
      featureCount: expected.featureCount,
      byteLength: statSync(outputFile).size,
      sha256: outputSha256,
      sidecarByteLength,
      sidecarSha256,
      sourceRowFingerprintSha256: fingerprints.sourceRowFingerprintSha256,
      outputRowFingerprintSha256: fingerprints.outputRowFingerprintSha256,
    },
    source: {
      path: sourcePath,
      layer: expected.sourceLayer,
      schema: sourceMetadata.fields,
      crs: expected.crs,
      geometryType: expected.geometryType,
      featureCount: expected.featureCount,
      sha256: expected.extractedSha256,
    },
    qa: {
      source: sourceQa,
      output: outputQa,
      sourceOutputFeatureCountMatch: true,
      sourceOutputSchemaMatch: true,
      sourceOutputCrsMatch: true,
      sourceOutputGeometryTypeMatch: true,
      sourceOutputRowFingerprintMatch: fingerprints.sourceRowFingerprintSha256 === fingerprints.outputRowFingerprintSha256,
      geometryValidity: true,
      sidecarContract: true,
      outputAndSidecarHashes: true,
    },
    claims: { transformed: true, ingested: false, released: false, productionAdmission: false, productionEligible: false, externalMutationPerformed: false },
    admissionClaim: false,
    productionAdmission: false,
    productionEligible: false,
  };
}

export function validateReadbackEvidence(record) {
  object(record, "readback evidence");
  exactKeys(record, ["schemaVersion", "status", "mode", "scopeId", "verifier", "specification", "output", "source", "qa", "claims", "admissionClaim", "productionAdmission", "productionEligible"], "readback evidence");
  exact(record.schemaVersion, EVIDENCE_SCHEMA, "readback evidence schema");
  exact(record.status, "complete-readback-verified", "readback evidence status");
  exact(record.mode, "post-publication-readback", "readback evidence mode");
  assert.match(record.scopeId, /^qc-(current-ecoforest|original-current-inventory)$/);
  exactKeys(record.verifier, ["path", "sha256", "methodVersion"], "readback verifier");
  exact(record.verifier.path, VERIFIER_PATH, "readback verifier path");
  exact(record.verifier.methodVersion, VERIFIER_METHOD_VERSION, "readback verifier method");
  assert.match(record.verifier.sha256, SHA256, "readback verifier SHA-256");
  exact(record.claims, { transformed: true, ingested: false, released: false, productionAdmission: false, productionEligible: false, externalMutationPerformed: false }, "readback claims");
  exact(record.admissionClaim, false, "admission claim");
  exact(record.productionAdmission, false, "production admission claim");
  exact(record.productionEligible, false, "production eligibility claim");
  assert.equal(record.qa.sourceOutputRowFingerprintMatch, true, "source/output row fingerprints must match.");
  assert.match(record.output.sha256, SHA256, "output SHA-256");
  assert.match(record.output.sidecarSha256, SHA256, "sidecar SHA-256");
  assert.match(record.output.sourceRowFingerprintSha256, SHA256, "source row fingerprint");
  assert.match(record.output.outputRowFingerprintSha256, SHA256, "output row fingerprint");
  exact(record.output.sourceRowFingerprintSha256, record.output.outputRowFingerprintSha256, "lossless row fingerprint");
  return true;
}

function scopeFor(scopeId) {
  const expected = SCOPES[scopeId];
  assert.ok(expected, `Unsupported Québec stand-copy scope: ${scopeId}.`);
  return expected;
}

function pathsFor(root, dataRoot, scopeId, expected, options = {}) {
  const outputFile = options.output ? path.resolve(options.output) : path.join(dataRoot, outputRelativePath(expected.specId, expected.sourceRawSha256, expected.outputLayer));
  const sidecarFile = options.sidecar ? path.resolve(options.sidecar) : `${outputFile}.json`;
  const sourceFile = options.source ? path.resolve(options.source) : path.join(dataRoot, expected.sourceRelativePath);
  regularFile(outputFile, "published GeoPackage");
  regularFile(sidecarFile, "published sidecar");
  regularFile(sourceFile, "source GeoPackage");
  exact(path.resolve(sidecarFile), path.resolve(`${outputFile}.json`), "published sidecar/output path relation");
  exact(path.relative(dataRoot, outputFile).split(path.sep).join("/"), outputRelativePath(expected.specId, expected.sourceRawSha256, expected.outputLayer), "canonical output path");
  exact(path.relative(dataRoot, sidecarFile).split(path.sep).join("/"), `${outputRelativePath(expected.specId, expected.sourceRawSha256, expected.outputLayer)}.json`, "canonical sidecar path");
  exact(path.relative(dataRoot, sourceFile).split(path.sep).join("/"), expected.sourceRelativePath, "canonical source path");
  return { outputFile, sidecarFile, sourceFile };
}

export function preflightScope({ root = ROOT, dataRoot = DEFAULT_DATA_ROOT, scopeId, output, sidecar, source } = {}) {
  const expected = scopeFor(scopeId);
  const outputFile = output ? path.resolve(output) : path.join(dataRoot, outputRelativePath(expected.specId, expected.sourceRawSha256, expected.outputLayer));
  const sidecarFile = sidecar ? path.resolve(sidecar) : `${outputFile}.json`;
  const sourceFile = source ? path.resolve(source) : path.join(dataRoot, expected.sourceRelativePath);
  // Presence is three-valued on purpose. A bare catch returning false said
  // "not there" for a permission error, an I/O error, a symlink loop, or an
  // entry of the wrong kind, and an operator reading "not there" re-runs a
  // producer. Only the filesystem actually reporting nothing at the path is
  // absence; anything we could not read stays null, never false.
  const presenceNotes = [];
  const regular = (file, label) => {
    try {
      regularFile(file, "preflight artifact");
      return true;
    } catch (error) {
      if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return false;
      presenceNotes.push(`${label}: could not determine presence (${error?.code ?? error?.message ?? "unknown error"})`);
      return null;
    }
  };
  const outputPresent = regular(outputFile, "output");
  const sidecarPresent = regular(sidecarFile, "sidecar");
  const sourcePresent = regular(sourceFile, "source");
  return {
    schemaVersion: "witness-tree/qc-stand-copy-readback-preflight/1",
    mode: "preflight",
    scopeId,
    paths: { output: outputFile, sidecar: sidecarFile, source: sourceFile },
    outputPresent,
    sidecarPresent,
    sourcePresent,
    presenceNotes,
    admissionClaim: false,
    productionAdmission: false,
    productionEligible: false,
    heavyReadPerformed: false,
    verifierRoot: root,
  };
}

export async function verifyScope({ root = ROOT, dataRoot = DEFAULT_DATA_ROOT, scopeId, output, sidecar: sidecarPathOption, source, preflight: preflightOnly = false, writeEvidence = false, evidencePath, dependencies = {} } = {}) {
  if (preflightOnly) return preflightScope({ root, dataRoot, scopeId, output, sidecar: sidecarPathOption, source });
  const expected = { ...scopeFor(scopeId) };
  const specPath = path.join(root, expected.specPath);
  regularFile(specPath, "bound transformation specification");
  const spec = JSON.parse(readFileSync(specPath, "utf8"));
  exact(sha256File(specPath), expected.specSha256, `${scopeId} specification SHA-256`);
  exact(spec.id, expected.specId, `${scopeId} specification id`);
  exact(spec.input?.layer, expected.sourceLayer, `${scopeId} specification source layer`);
  exact(spec.operation?.outputLayer, expected.outputLayer, `${scopeId} specification output layer`);
  exact(spec.input?.publishedAttributes, expected.fields, `${scopeId} specification fields`);
  exact(spec.input?.featureCount, expected.featureCount, `${scopeId} specification feature count`);
  exact(spec.input?.crs, expected.crs, `${scopeId} specification CRS`);
  const { outputFile, sidecarFile, sourceFile } = pathsFor(root, dataRoot, scopeId, expected, { output, sidecar: sidecarPathOption, source });
  const outputSha256 = sha256File(outputFile);
  const sidecarBytes = readFileSync(sidecarFile);
  const sidecarRecord = JSON.parse(sidecarBytes);
  const sidecarSha256 = sha256(sidecarBytes);
  const [sourceMetadataRaw, outputMetadataRaw, sourceQaRaw, outputQaRaw] = await Promise.all([
    ogrJson(["-ro", "-json", "-so", sourceFile, expected.sourceLayer], dependencies),
    ogrJson(["-ro", "-json", "-so", outputFile, expected.outputLayer], dependencies),
    ogrJson(["-ro", "-json", "-features", "-dialect", "SQLite", "-sql", qaSql(expected, { output: false }), sourceFile], dependencies),
    ogrJson(["-ro", "-json", "-features", "-dialect", "SQLite", "-sql", qaSql(expected, { output: true }), outputFile], dependencies),
  ]);
  const sourceMetadata = metadataSignature(metadataFrom(sourceMetadataRaw, "source"), expected, { output: false, label: `${scopeId} source` });
  const outputMetadata = metadataSignature(metadataFrom(outputMetadataRaw, "output"), expected, { output: true, label: `${scopeId} output` });
  const sourceQa = validateQa(qaFrom(sourceQaRaw, `${scopeId} source`), expected, { output: false, label: `${scopeId} source` });
  const outputQa = validateQa(qaFrom(outputQaRaw, `${scopeId} output`), expected, { output: true, label: `${scopeId} output` });
  const fingerprints = sqliteFingerprints(sourceFile, outputFile, expected, dependencies);
  exact(fingerprints.sourceRowFingerprintSha256, fingerprints.outputRowFingerprintSha256, `${scopeId} source/output lossless fingerprint`);
  validateSidecarContract(sidecarRecord, sidecarBytes, scopeId, expected, outputSha256, fingerprints);
  const verifierSha256 = sha256File(path.join(root, VERIFIER_PATH));
  const result = evidenceRecord({ dataRoot, scopeId, expected, outputFile, sidecarFile, outputMetadata, sourceMetadata, outputQa, sourceQa, fingerprints, outputSha256, sidecarSha256, sidecarByteLength: sidecarBytes.length, verifierSha256 });
  validateReadbackEvidence(result);
  if (writeEvidence) {
    const relativeEvidencePath = evidencePath ?? expected.evidencePath;
    safeRelative(relativeEvidencePath, "evidence path");
    const destination = path.join(root, relativeEvidencePath);
    if (path.resolve(destination) !== destination || !destination.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error("evidence path escaped repository root");
    writeFileSync(destination, canonicalJson(result), { flag: "wx", mode: 0o600 });
    result.evidencePath = relativeEvidencePath;
    result.evidenceSha256 = sha256File(destination);
  }
  return result;
}

export const verify = verifyScope;
export const preflight = preflightScope;

function optionValue(argv, flag) {
  const index = argv.indexOf(flag);
  return index < 0 ? undefined : argv[index + 1];
}

async function cli(argv = process.argv.slice(2)) {
  if (argv.includes("--help")) {
    console.log("Usage: node scripts/verify-qc-stand-copy-readback.mjs --scope <qc-current-ecoforest|qc-original-current-inventory> [--preflight|--verify] [--write-evidence --evidence-path data/FILE] [--data-root PATH]");
    return;
  }
  const scopeId = optionValue(argv, "--scope");
  if (!scopeId) throw new Error("--scope is required.");
  const root = optionValue(argv, "--root") ? path.resolve(optionValue(argv, "--root")) : ROOT;
  const dataRoot = optionValue(argv, "--data-root") ? path.resolve(optionValue(argv, "--data-root")) : DEFAULT_DATA_ROOT;
  const writeEvidence = argv.includes("--write-evidence");
  const verify = argv.includes("--verify") || writeEvidence;
  if (argv.includes("--preflight") && verify) throw new Error("--preflight cannot be combined with --verify or --write-evidence.");
  const options = { root, dataRoot, scopeId, output: optionValue(argv, "--output"), sidecar: optionValue(argv, "--sidecar"), source: optionValue(argv, "--source") };
  console.log(JSON.stringify(verify ? await verifyScope({ ...options, writeEvidence, evidencePath: optionValue(argv, "--evidence-path") }) : preflightScope(options), null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) cli().catch((error) => { console.error(`Stopped: ${error.message}`); process.exitCode = 1; });
