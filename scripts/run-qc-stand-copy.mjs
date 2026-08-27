#!/usr/bin/env node
/**
 * Fail-closed, checksum-bound Québec stand-copy runner.
 *
 * The default is a read-only preflight.  Execution requires --execute and a
 * separate, future execution-approval record that binds the exact packet,
 * owner scope approval, specification, runner, and input bytes.
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, link, lstat, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_ROOT = path.resolve(ROOT, "../../Witness_Tree-data");
const PACKET_REL = "data/phase1-downstream-admission-packet.json";
const OWNER_REL = "data/phase1-transformation-scope-owner-approval-2026-08-25.json";
const PACKET_SHA256 = "82c55e3bea87d1a3856b233b2e483cd9b5318afd3d998bd753867af944370520";
const OWNER_SHA256 = "98c1becf3f4b392fdcfa57ae65a3e85e56a2b4b22d9671b418c300dc769d1be1";
const METHOD_VERSION = "qc-stand-copy-runner-v1";
const PYTHON_HELPER = path.join(ROOT, "scripts/qc-stand-copy-append.py");

const SCOPES = {
  "qc-current-ecoforest": {
    specFile: "qc-current-ecoforest-stand-copy-v1.json",
    raw: ["raw", "qc-current-ecoforest", "2026-08-14", "CARTE_ECO_MAJ_PROV_GPKG.zip"],
    extracted: ["work", "qc-current-ecoforest", "2026-08-14", "CARTE_ECO_MAJ_PROV.gpkg"],
    profile: ["work", "qc-current-ecoforest", "2026-08-14", "source-geospatial-profile-native2.json"],
  },
  "qc-original-current-inventory": {
    specFile: "qc-original-current-inventory-stand-copy-v1.json",
    raw: ["raw", "qc-original-current-inventory", "2026-08-14", "CARTE_ECO_ORI_PROV_GPKG.zip"],
    extracted: ["extracted", "qc-original-current-inventory", "2026-08-14", "CARTE_ECO_ORI_PROV.gpkg"],
  },
};

const EXPECTED = {
  "qc-current-ecoforest": {
    specSha256: "44cdb08f033fc80040a7edf373189a0ce8c74bc3132d4e0892816fcf3f22bb1d",
    rawSha256: "c67c56b0c101e95bef4fbca53a06e2f1578fe38293961017f70d815209740cf1",
    rawBytes: 12399475076,
    extractedSha256: "4f592f99786770600bdf219e8cdae5908d9a2398ab6a9ae45662fafa2494aa00",
    member: "CARTE_ECO_MAJ_PROV.gpkg",
    layer: "pee_maj_prov",
    outputLayer: "qc_current_ecoforest_stands",
    featureCount: 9827536,
    geometryType: "MultiPolygon",
    crs: 32198,
    sourceProfileSha256: "fc16cb1abfb94f6bf5a6414f9f90a150a9c548688a719ce636f495561b7295d7",
  },
  "qc-original-current-inventory": {
    specSha256: "09d647959275497ec1c380a4989c70d46935c4967f2621c01edab272ccfccf3e",
    rawSha256: "c10d691516569de76642dc1fc64e662f2569b5b58ab5d945b58b8b7834ba9c61",
    rawBytes: 11244667626,
    extractedSha256: "819a5698456089a9f291925a9b9bf1eb1415f29985ff43107d383c1f46753dfd",
    member: "CARTE_ECO_ORI_PROV.gpkg",
    layer: "pee_ori_prov",
    outputLayer: "qc_original_current_inventory_stands",
    featureCount: 8387062,
    geometryType: "MultiPolygon",
    crs: 32198,
  },
};

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function canonicalJson(value) { return `${canonical(value)}\n`; }
function sha256Bytes(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
async function sha256File(file) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(file)) { hash.update(chunk); bytes += chunk.length; }
  return { sha256: hash.digest("hex"), bytes };
}
async function regularFile(file, label) {
  const info = await lstat(file).catch(() => null);
  if (!info?.isFile() || info.isSymbolicLink()) throw new Error(`${label} must be a regular non-symlink file: ${file}`);
  return info;
}
function run(command, args, { maxOutput = 32 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const out = []; const err = []; let size = 0;
    child.stdout.on("data", (chunk) => { size += chunk.length; if (size <= maxOutput) out.push(chunk); });
    child.stderr.on("data", (chunk) => err.push(chunk));
    child.on("error", reject);
    child.on("close", (code, signal) => {
      const result = { code, signal, stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8") };
      if (code !== 0) reject(new Error(`${command} ${args.join(" ")} failed (${code ?? signal}): ${result.stderr.trim()}`));
      else resolve(result);
    });
  });
}
async function zipMemberHash(zip, member) {
  const list = (await run(process.env.UNZIP_BIN || "unzip", ["-Z1", zip])).stdout.split(/\r?\n/).filter(Boolean);
  if (list.filter((value) => value === member).length !== 1) throw new Error(`archive must contain exactly one ${member} member`);
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.UNZIP_BIN || "unzip", ["-p", zip, member], { stdio: ["ignore", "pipe", "pipe"] });
    const hash = createHash("sha256"); let bytes = 0; const errors = [];
    child.stdout.on("data", (chunk) => { hash.update(chunk); bytes += chunk.length; });
    child.stderr.on("data", (chunk) => errors.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve({ sha256: hash.digest("hex"), bytes }) : reject(new Error(`archive member read failed: ${Buffer.concat(errors).toString("utf8").trim()}`)));
  });
}
function quote(value) { return `"${value.replaceAll('"', '""')}"`; }
async function ogrJson(args) { return JSON.parse((await run(process.env.OGRINFO_BIN || "ogrinfo", args)).stdout); }
async function sourceProfile(gpkg, spec, expected) {
  const metadata = (await ogrJson(["-ro", "-json", "-so", gpkg, spec.input.layer])).layers?.[0];
  if (!metadata) throw new Error("GDAL did not return the bound input layer");
  const geometry = metadata.geometryFields?.find((field) => field.name === spec.input.geometryColumn);
  if (!geometry || geometry.type.toLowerCase() !== expected.geometryType.toLowerCase()) throw new Error("geometry column/type does not match the bound spec");
  const crs = geometry.coordinateSystem?.projjson?.id?.code;
  const fields = (metadata.fields ?? []).map((field) => field.name);
  if (metadata.name !== spec.input.layer || metadata.fidColumnName !== spec.input.sourceRowKey || metadata.featureCount !== expected.featureCount || crs !== expected.crs) throw new Error("layer, CRS, fid, or feature count does not match the bound spec");
  if (JSON.stringify(fields) !== JSON.stringify(spec.input.publishedAttributes)) throw new Error("published attribute schema does not match the bound spec");
  const blank = spec.input.joinKey ? `SUM(CASE WHEN ${quote(spec.input.joinKey)} IS NULL OR TRIM(CAST(${quote(spec.input.joinKey)} AS TEXT)) = '' THEN 1 ELSE 0 END)` : "0";
  const sql = `SELECT COUNT(*) AS feature_count, COUNT(DISTINCT ${quote(spec.input.sourceRowKey)}) AS distinct_fid_count, SUM(CASE WHEN ${quote(spec.input.sourceRowKey)} IS NULL THEN 1 ELSE 0 END) AS missing_fid_count, SUM(CASE WHEN ${quote(spec.input.geometryColumn)} IS NULL THEN 1 ELSE 0 END) AS missing_geometry_count, SUM(CASE WHEN ST_IsEmpty(${quote(spec.input.geometryColumn)}) THEN 1 ELSE 0 END) AS empty_geometry_count, SUM(CASE WHEN ST_IsValid(${quote(spec.input.geometryColumn)}) = 0 THEN 1 ELSE 0 END) AS invalid_geometry_count, ${blank} AS blank_key_count FROM ${quote(spec.input.layer)}`;
  const validity = (await ogrJson(["-ro", "-json", "-features", "-dialect", "SQLite", "-sql", sql, gpkg])).layers?.[0]?.features?.[0]?.properties;
  if (!validity) throw new Error("GDAL did not return complete geometry QA");
  const qa = Object.fromEntries(Object.entries(validity).map(([key, value]) => [key, Number(value || 0)]));
  if (qa.feature_count !== expected.featureCount || qa.distinct_fid_count !== expected.featureCount || qa.missing_fid_count || qa.missing_geometry_count || qa.empty_geometry_count || qa.invalid_geometry_count || qa.blank_key_count) throw new Error(`exact source geometry/count QA failed: ${JSON.stringify(qa)}`);
  return { layer: metadata.name, geometryColumn: geometry.name, geometryType: geometry.type, crs, featureCount: qa.feature_count, fields, qa };
}

async function loadScope(root, scopeId, options = {}) {
  const expected = EXPECTED[scopeId]; const config = SCOPES[scopeId];
  if (!expected || !config) throw new Error(`unsupported scope: ${scopeId}`);
  const specPath = path.join(root, "data/transformation-specs", config.specFile);
  const packetPath = path.join(root, PACKET_REL); const ownerPath = path.join(root, OWNER_REL);
  const [specBytes, packetBytes, ownerBytes] = await Promise.all([readFile(specPath), readFile(packetPath), readFile(ownerPath)]);
  const specSha256 = sha256Bytes(specBytes), packetSha256 = sha256Bytes(packetBytes), ownerSha256 = sha256Bytes(ownerBytes);
  if (specSha256 !== expected.specSha256 || packetSha256 !== PACKET_SHA256 || ownerSha256 !== OWNER_SHA256) throw new Error("bound packet, owner approval, or specification bytes changed; refusing to proceed");
  const spec = JSON.parse(specBytes), packet = JSON.parse(packetBytes), owner = JSON.parse(ownerBytes);
  if (spec.status !== "specified-not-approved-not-executed" || spec.operation?.kind !== "lossless-single-layer-copy" || spec.operation?.joins !== "None. Do not join meta or other tables in this operation." || Object.values(spec.admission ?? {}).some((value) => value !== false)) throw new Error("spec is not the exact unadmitted lossless stand-copy scope");
  const registryBytes = await readFile(path.join(root, packet.specificationRegistry.path));
  const registry = JSON.parse(registryBytes);
  const packetBinding = registry.specificationBindings?.find((entry) => entry.specId === spec.id);
  const ownerBinding = owner.approvedScopes?.find((entry) => entry.specId === spec.id);
  if (!packetBinding || packetBinding.sha256 !== specSha256 || ownerBinding?.decision !== "approve" || ownerBinding.specSha256 !== specSha256 || owner.decisionBoundary?.executionAuthorized !== false) throw new Error("packet/owner scope binding is not exact or is already execution-authorized");
  const dataRoot = options.dataRoot || DATA_ROOT;
  const raw = options.raw || path.join(dataRoot, ...config.raw);
  const extracted = options.extracted || path.join(dataRoot, ...config.extracted);
  const profilePath = options.profile || (config.profile && path.join(dataRoot, ...config.profile));
  await regularFile(raw, "raw archive"); await regularFile(extracted, "extracted GeoPackage");
  const rawDigest = await sha256File(raw); const extractedDigest = await sha256File(extracted);
  if (rawDigest.sha256 !== expected.rawSha256 || rawDigest.bytes !== expected.rawBytes) throw new Error("raw archive SHA-256 or byte count does not match the bound spec");
  if (extractedDigest.sha256 !== expected.extractedSha256) throw new Error("extracted GeoPackage SHA-256 does not match the bound spec");
  const memberDigest = await zipMemberHash(raw, expected.member);
  if (memberDigest.sha256 !== extractedDigest.sha256 || memberDigest.bytes !== extractedDigest.bytes) throw new Error("archive member and extracted GeoPackage bytes differ");
  if (expected.sourceProfileSha256) {
    if (!profilePath) throw new Error("bound source profile is required");
    await regularFile(profilePath, "source profile");
    const profileDigest = await sha256File(profilePath);
    if (profileDigest.sha256 !== expected.sourceProfileSha256) throw new Error("bound source profile SHA-256 differs");
  }
  const profile = await sourceProfile(extracted, spec, expected);
  return { scopeId, expected, config, spec, specPath, specSha256, packetSha256, ownerSha256, rawDigest, extractedDigest, memberDigest, profile, raw, extracted };
}

export function validateExecutionApproval(record, binding, runnerSha256) {
  if (!record || record.schemaVersion !== "witness-tree/phase1-transformation-execution-approval/1" || record.status !== "owner-approved-execution-only" || record.decision !== "approve") throw new Error("execution approval record has the wrong schema, status, or decision");
  if (record.packet?.sha256 !== binding.packetSha256 || record.ownerScopeApproval?.sha256 !== binding.ownerSha256 || record.specification?.sha256 !== binding.specSha256) throw new Error("execution approval is not bound to the exact packet, owner scope approval, and specification");
  if (record.runner?.methodVersion !== METHOD_VERSION || record.runner?.sha256 !== runnerSha256) throw new Error("execution approval must bind this exact runner and method version");
  const scope = record.approvedScopes?.filter((entry) => entry.specId === binding.spec.id && entry.decision === "approve");
  if (scope?.length !== 1 || scope[0].specSha256 !== binding.specSha256) throw new Error("execution approval does not name this exact scope");
  const input = record.inputBinding;
  if (!input || input.rawArchiveSha256 !== binding.expected.rawSha256 || input.extractedGeoPackageSha256 !== binding.expected.extractedSha256 || input.rawArchiveBytes !== binding.expected.rawBytes || input.extractedGeoPackageBytes !== binding.extractedDigest.bytes || input.layer !== binding.spec.input.layer || input.geometryType !== binding.spec.input.geometryType || input.crs !== binding.spec.input.crs || input.featureCount !== binding.spec.input.featureCount) throw new Error("execution approval does not bind the exact preflighted input bytes/schema");
  const outputRelativePath = path.posix.join("derived/phase1", binding.spec.id, binding.expected.rawSha256, METHOD_VERSION, `${binding.expected.outputLayer}.gpkg`);
  if (record.outputBinding?.artifactRelativePath !== outputRelativePath || record.outputBinding?.sidecarRelativePath !== `${outputRelativePath}.json` || record.outputBinding?.layer !== binding.expected.outputLayer) throw new Error("execution approval does not bind the canonical output paths and layer");
  const boundary = record.decisionBoundary;
  if (boundary?.executionAuthorized !== true || boundary.ingestionAuthorized !== false || boundary.releaseAuthorized !== false || boundary.productionAdmissionAuthorized !== false || boundary.productionEligibilityGranted !== false || boundary.externalMutationPerformed !== false) throw new Error("execution approval crosses an ingestion, release, admission, or mutation boundary");
  return true;
}

async function executeScope(binding, options, runnerSha256) {
  const approvalBytes = await readFile(options.executionApproval); const approval = JSON.parse(approvalBytes); const approvalSha256 = sha256Bytes(approvalBytes);
  validateExecutionApproval(approval, binding, runnerSha256);
  if (options.outputDir) throw new Error("custom output directories are not permitted for an approved execution");
  const outputRoot = path.join(options.dataRoot || DATA_ROOT, "derived/phase1", binding.spec.id, binding.expected.rawSha256, METHOD_VERSION);
  await mkdir(outputRoot, { recursive: true });
  const artifact = path.join(outputRoot, `${binding.expected.outputLayer}.gpkg`); const sidecar = `${artifact}.json`;
  for (const target of [artifact, sidecar]) if (await access(target).then(() => true).catch(() => false)) throw new Error(`refusing to overwrite existing artifact: ${target}`);
  const temporary = await mkdtemp(path.join(outputRoot, ".qc-stand-copy-"));
  const tempArtifact = path.join(temporary, "artifact.gpkg"); const rerunArtifact = path.join(temporary, "rerun.gpkg");
  let publishedArtifact = false;
  let publishedSidecar = false;
  try {
    const copyArgs = (target) => ["-f", "GPKG", target, binding.extracted, binding.spec.input.layer, "-nln", binding.expected.outputLayer, "-select", binding.spec.input.publishedAttributes.join(","), "-progress"];
    await run(process.env.OGR2OGR_BIN || "ogr2ogr", copyArgs(tempArtifact));
    const helperArgs = (target) => [PYTHON_HELPER, "--source", binding.extracted, "--source-layer", binding.spec.input.layer, "--artifact", target, "--layer", binding.expected.outputLayer, "--published-attributes", JSON.stringify(binding.spec.input.publishedAttributes), "--raw-sha256", binding.expected.rawSha256];
    const first = JSON.parse((await run(process.env.PYTHON_BIN || "python3", helperArgs(tempArtifact))).stdout);
    await run(process.env.OGR2OGR_BIN || "ogr2ogr", copyArgs(rerunArtifact));
    const second = JSON.parse((await run(process.env.PYTHON_BIN || "python3", helperArgs(rerunArtifact))).stdout);
    const firstHash = await sha256File(tempArtifact), secondHash = await sha256File(rerunArtifact);
    if (firstHash.sha256 !== secondHash.sha256 || first.sourceRowFingerprintSha256 !== second.sourceRowFingerprintSha256 || first.outputRowFingerprintSha256 !== second.outputRowFingerprintSha256) throw new Error("deterministic rerun QA failed");
    const record = { schemaVersion: "witness-tree/qc-stand-copy-sidecar/1", methodVersion: METHOD_VERSION, scopeId: binding.scopeId, specification: { id: binding.spec.id, sha256: binding.specSha256 }, packetSha256: binding.packetSha256, ownerScopeApprovalSha256: binding.ownerSha256, executionApprovalSha256: approvalSha256, source: { rawArchiveSha256: binding.rawDigest.sha256, rawArchiveBytes: binding.rawDigest.bytes, archiveMember: binding.expected.member, archiveMemberSha256: binding.memberDigest.sha256, extractedGeoPackageSha256: binding.extractedDigest.sha256 }, input: binding.profile, output: { layer: binding.expected.outputLayer, sha256: firstHash.sha256, schema: first.outputSchema, featureCount: first.featureCount, sourceRowFingerprintSha256: first.sourceRowFingerprintSha256, outputRowFingerprintSha256: first.outputRowFingerprintSha256, geometryByteCopy: first.geometryByteCopy }, qa: { exactInputBindings: true, schemaCrsFeatureCountGeometryChecks: true, joins: false, reprojection: false, repair: false, simplify: false, snap: false, dissolve: false, semanticInference: false, losslessRowFingerprintMatch: first.sourceRowFingerprintSha256 === first.outputRowFingerprintSha256, deterministicRerunArtifactMatch: true }, prohibitedClaims: binding.spec.prohibitedClaims };
    const tempSidecar = `${temporary}/sidecar.json`;
    await writeFile(tempSidecar, canonicalJson(record), { flag: "wx", mode: 0o600 });
    await link(tempArtifact, artifact); publishedArtifact = true;
    await link(tempSidecar, sidecar); publishedSidecar = true;
    await unlink(tempArtifact);
    await unlink(tempSidecar);
    return { mode: "execute", scopeId: binding.scopeId, artifact, sidecar, artifactSha256: firstHash.sha256, sidecarSha256: sha256Bytes(Buffer.from(canonicalJson(record))) };
  } catch (error) {
    if (publishedSidecar) await rm(sidecar, { force: true });
    if (publishedArtifact) await rm(artifact, { force: true });
    throw error;
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

export async function preflightScope({ root = ROOT, scopeId, dataRoot, raw, extracted, profile } = {}) {
  const binding = await loadScope(root, scopeId, { dataRoot, raw, extracted, profile });
  return { schemaVersion: "witness-tree/qc-stand-copy-preflight/1", mode: "preflight", scopeId, specification: { id: binding.spec.id, sha256: binding.specSha256 }, packetSha256: binding.packetSha256, ownerScopeApprovalSha256: binding.ownerSha256, source: { rawArchiveSha256: binding.rawDigest.sha256, rawArchiveBytes: binding.rawDigest.bytes, archiveMember: binding.expected.member, archiveMemberSha256: binding.memberDigest.sha256, extractedGeoPackageSha256: binding.extractedDigest.sha256 }, input: binding.profile, operation: { kind: binding.spec.operation.kind, outputLayer: binding.expected.outputLayer, outputCrs: binding.spec.operation.outputCrs, joins: "none", geometry: "byte-for-byte copy; no reprojection, repair, simplify, snap, dissolve, buffer, or semantic inference" }, qa: { exactSourceShaAndBytes: true, exactArchiveMember: true, exactLayerSchemaCrsFeatureCount: true, exactGeometryValidity: true, executionAuthorized: false, transformed: false, ingested: false, released: false, productionAdmission: false } };
}

async function main(argv = process.argv.slice(2)) {
  const get = (name) => { const index = argv.indexOf(name); return index < 0 ? undefined : argv[index + 1]; };
  if (argv.includes("--help")) { console.log("Usage: node scripts/run-qc-stand-copy.mjs --scope <qc-current-ecoforest|qc-original-current-inventory> [--preflight] [--execute --execution-approval FILE]"); return; }
  const scopeId = get("--scope"); if (!scopeId || !SCOPES[scopeId]) throw new Error("--scope must name one approved Québec scope");
  const execute = argv.includes("--execute"); if (execute && !get("--execution-approval")) throw new Error("--execute requires --execution-approval FILE");
  const root = get("--root") || ROOT; const dataRoot = get("--data-root"); const binding = await loadScope(root, scopeId, { dataRoot, raw: get("--raw"), extracted: get("--extracted"), profile: get("--profile") });
  const runnerSha256 = (await sha256File(path.join(root, "scripts/run-qc-stand-copy.mjs"))).sha256;
  if (!execute) { console.log(canonicalJson({ schemaVersion: "witness-tree/qc-stand-copy-preflight/1", mode: "preflight", scopeId, specification: { id: binding.spec.id, sha256: binding.specSha256 }, packetSha256: binding.packetSha256, ownerScopeApprovalSha256: binding.ownerSha256, source: { rawArchiveSha256: binding.rawDigest.sha256, rawArchiveBytes: binding.rawDigest.bytes, archiveMember: binding.expected.member, archiveMemberSha256: binding.memberDigest.sha256, extractedGeoPackageSha256: binding.extractedDigest.sha256 }, input: binding.profile, operation: { kind: binding.spec.operation.kind, outputLayer: binding.expected.outputLayer, outputCrs: binding.spec.operation.outputCrs, joins: "none", geometry: "byte-for-byte copy; no reprojection, repair, simplify, snap, dissolve, buffer, or semantic inference" }, qa: { exactSourceShaAndBytes: true, exactArchiveMember: true, exactLayerSchemaCrsFeatureCount: true, exactGeometryValidity: true, executionAuthorized: false, transformed: false, ingested: false, released: false, productionAdmission: false } })); return; }
  console.log(JSON.stringify(await executeScope(binding, { dataRoot, outputDir: get("--output-dir"), executionApproval: get("--execution-approval") }, runnerSha256)));
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => { console.error(`Stopped: ${error.message}`); process.exitCode = 1; });
