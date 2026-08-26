import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, lstatSync, openSync, readFileSync, readSync, closeSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SPEC_PATH = "data/phase1-production-transformation-specifications-v1.json";
const GRID_PATH = "data/raster-grid.json";
const DEFECTS_PATH = "data/raster-defects.json";
const DEFAULT_DATA_ROOT = "/Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree-data";
const AUTHORIZATION_BY_SPEC = {
  "ntems-annual-land-cover-v1": "data/phase1-ntems-annual-land-cover-execution-authorization.json",
  "ntems-forest-harvest-v1": "data/phase1-ntems-forest-harvest-execution-authorization.json",
  "ntems-canopy-cover-v1": "data/phase1-ntems-canopy-cover-execution-authorization.json",
  "ntems-canopy-height-v1": "data/phase1-ntems-canopy-height-execution-authorization.json",
};
const DEFAULT_COMPOSITE_EVIDENCE = "data/phase1-ntems-transformation-readback-evidence-2026-08-26.json";
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

const readJson = (root, relativePath) => JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

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

function fail(message) {
  throw new Error(`NTEMS readback stopped: ${message}`);
}

function exact(actual, expected, label) {
  try { assert.deepEqual(actual, expected); } catch { fail(`${label} drifted.`); }
}

function exactKeys(value, keys, label) {
  exact(Object.keys(value ?? {}).sort(), [...keys].sort(), `${label} keys`);
}

function utc(value, label) {
  if (typeof value !== "string" || !UTC.test(value) || new Date(value).toISOString() !== value.replace("Z", ".000Z")) fail(`${label} is not a fixed UTC instant.`);
  return value;
}

function regular(root, relativePath) {
  if (typeof relativePath !== "string" || path.isAbsolute(relativePath) || relativePath.includes("..")) fail(`unsafe relative path: ${relativePath}`);
  const file = path.resolve(root, relativePath);
  const info = lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink()) fail(`${relativePath} is not a regular non-symlink file.`);
  return file;
}

function gdalJson(file) {
  const result = spawnSync("gdalinfo", ["-json", file], { encoding: "utf8" });
  if (result.status !== 0) fail(`gdalinfo failed for ${file}: ${result.stderr || result.stdout}`);
  try { return JSON.parse(result.stdout); } catch { fail(`gdalinfo did not return JSON for ${file}.`); }
}

function gdalChecksum(file) {
  const result = spawnSync("gdalinfo", ["-json", "-checksum", file], { encoding: "utf8" });
  if (result.status !== 0) fail(`gdalinfo checksum failed for ${file}: ${result.stderr || result.stdout}`);
  const checksum = JSON.parse(result.stdout).bands?.[0]?.checksum;
  if (!Number.isInteger(checksum)) fail(`gdalinfo returned no integer pixel checksum for ${file}.`);
  return checksum;
}

function proj4(file) {
  const result = spawnSync("gdalsrsinfo", ["-o", "proj4", file], { encoding: "utf8" });
  if (result.status !== 0) fail(`gdalsrsinfo failed for ${file}: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function sourcePath(dataRoot, input) {
  const zip = regular(dataRoot, input.path);
  const member = `/vsizip/${zip}/${input.member}`;
  return { zip, member };
}

function specFor(specRecord, id) {
  const specification = specRecord.specifications.find(({ id: candidate }) => candidate === id);
  if (!specification) fail(`specification is missing: ${id}`);
  return specification;
}

function canonicalInputs(root, specification) {
  if (specification.id === "ntems-annual-land-cover-v1") {
    const preparation = readJson(root, "data/vlce2-promotion-preparation.json");
    const evidence = readJson(root, "data/vlce2-remote-promotion-evidence.json");
    const evidenceByYear = new Map(evidence.entries.map((entry) => [entry.year, entry]));
    return preparation.entries.map((entry) => {
      const remote = evidenceByYear.get(entry.year);
      if (!remote || !remote.payload?.key?.includes(entry.sha256) || remote.payload.byteLength !== entry.byteLength) fail(`annual source evidence/preparation mismatch for ${entry.year}.`);
      return { path: path.join("raw/nrcan-annual-land-cover-v2/2026-08-12", entry.originalFilename), sha256: entry.sha256, byteLength: entry.byteLength, member: `CA_forest_VLCE2_${entry.year}.tif`, year: entry.year };
    });
  }
  const profilePath = specification.id === "ntems-forest-harvest-v1" ? "data/nrcan-harvest-profile.json" : specification.id === "ntems-canopy-cover-v1" ? "data/nrcan-canopy-cover-profile.json" : "data/nrcan-canopy-height-profile.json";
  const profile = readJson(root, profilePath);
  const marker = "Witness_Tree-data/";
  const index = profile.raw.localPath.indexOf(marker);
  if (index < 0) fail(`profile path is not canonical: ${profile.raw.localPath}`);
  return [{ path: profile.raw.localPath.slice(index + marker.length), sha256: profile.raw.sha256, byteLength: profile.raw.byteLength, member: profile.raster.member, ...(specification.id === "ntems-forest-harvest-v1" ? {} : { year: 2022 }) }];
}

function specificationContract(specification, grid, defects, year) {
  const common = { width: grid.grid.width, height: grid.grid.height, geotransform: grid.grid.geotransform, proj4: grid.grid.crs.proj4 };
  if (specification.id === "ntems-annual-land-cover-v1") return { ...common, dataType: "Byte", noDataValue: 255, classValues: specification.selection.includeClassValues.filter((value) => value !== 255), allowEmptyRat: defects.defects.some((defect) => defect.year === year) };
  if (specification.id === "ntems-forest-harvest-v1") return { ...common, dataType: "UInt16", noDataValue: 65536, classValues: [0, ...Array.from({ length: 38 }, (_, index) => index + 1985)] };
  if (specification.id === "ntems-canopy-cover-v1") return { ...common, dataType: "Float32", noDataValue: -3.402823e+38, continuousRange: [0, 100] };
  if (specification.id === "ntems-canopy-height-v1") return { ...common, dataType: "Float32", noDataValue: -3.402823e+38, continuousRange: [0, 62.503] };
  fail(`unsupported specification: ${specification.id}`);
}

export function validateRasterStructure(info, contract, label, options = {}) {
  exact(info.size, [contract.width, contract.height], `${label} dimensions`);
  exact(info.geoTransform, contract.geotransform, `${label} geotransform`);
  if (info.bands?.length !== 1) fail(`${label} must have one band.`);
  const band = info.bands[0];
  if (band.type !== contract.dataType) fail(`${label} data type differs.`);
  if (Math.abs(Number(band.noDataValue) - Number(contract.noDataValue)) > Math.max(1e-9, Math.abs(Number(contract.noDataValue)) * 1e-7)) fail(`${label} nodata differs.`);
  if (!info.coordinateSystem?.wkt) fail(`${label} CRS WKT is missing.`);
  if (options.proj4 && options.proj4.trim() !== contract.proj4.trim()) fail(`${label} CRS differs from the canonical grid.`);
  if (contract.classValues) {
    const values = (band.rat?.row ?? []).map((row) => row.f?.[0]).sort((a, b) => a - b);
    const expected = [...contract.classValues].sort((a, b) => a - b);
    if (values.length === 0) {
      if (!contract.allowEmptyRat && !options.allowMissingClassTable) fail(`${label} class table is missing.`);
    } else exact(values, expected, `${label} class values`);
  }
  return true;
}

function expectedOutput(dataRoot, specification, input) {
  const inputSha = specification.id === "ntems-annual-land-cover-v1" ? specification.inputBindings[0].sha256 : input.sha256;
  const base = path.join(dataRoot, "derived/phase1", specification.id, inputSha, specification.methodVersion);
  const name = specification.id === "ntems-annual-land-cover-v1" ? `annual-land-cover-${input.year}.tif` : specification.id === "ntems-forest-harvest-v1" ? "forest-harvest-year-1985-2022.tif" : specification.id === "ntems-canopy-cover-v1" ? "canopy-cover-2022.tif" : "canopy-height-2022.tif";
  return { output: path.join(base, name), sidecar: path.join(base, `${name}.sidecar.json`), relativeOutput: path.relative(path.join(dataRoot, "derived/phase1"), path.join(base, name)) };
}

function expectedCommand(input, relativeOutput, dataType) {
  return ["-of", "GTiff", "-co", "TILED=YES", "-co", "BIGTIFF=YES", "-co", "COMPRESS=DEFLATE", "-co", `PREDICTOR=${dataType === "Float32" ? 3 : 2}`, "-co", "NUM_THREADS=1", `data-root/${input.path}/${input.member}`, `output-root/${relativeOutput}`];
}

function toolVersions() {
  return { gdalTranslate: execFileSync("gdal_translate", ["--version"], { encoding: "utf8" }).trim(), gdalInfo: execFileSync("gdalinfo", ["--version"], { encoding: "utf8" }).trim(), gdalsrsinfo: execFileSync("gdalsrsinfo", ["--version"], { encoding: "utf8" }).trim() };
}

export function validateAuthorization(record, root, selectedIds = null) {
  exactKeys(record, ["boundary", "createdAt", "decisionId", "inputs", "ownerDecision", "runner", "schemaVersion", "specifications", "status"], "authorization");
  if (record.schemaVersion !== "witness-tree/phase1-ntems-execution-authorization/1" || record.status !== "approved-owner-local-execution") fail("authorization is not an approved owner-local execution record.");
  assert.equal(record.decisionId, "phase1-ntems-raster-execution-v1");
  exactKeys(record.ownerDecision, ["decision", "ownerName", "scope", "statement"], "authorization owner decision");
  assert.equal(record.ownerDecision.decision, "approve");
  assert.equal(record.ownerDecision.ownerName, "Chinonso Obeta");
  const expectedScope = record.specifications.length === 1 ? `This record selects ${record.specifications[0].id} from the four NTEMS raster scopes within the seven approved Phase 1 transformation scopes.` : record.specifications.length === 4 ? "All four NTEMS raster scopes within the seven approved Phase 1 transformation scopes." : undefined;
  if (!expectedScope) fail("authorization must select one scope or all four NTEMS scopes.");
  exact(record.ownerDecision, { decision: "approve", ownerName: "Chinonso Obeta", statement: "You can execute them when complete.", scope: expectedScope }, "authorization owner decision");
  utc(record.createdAt, "authorization.createdAt");
  exact(record.boundary, { localOnly: true, externalMutation: false, ingestion: false, release: false, productionAdmission: false, productionEligible: false, overwriteExisting: false }, "authorization boundary");
  const runner = regular(root, record.runner.path);
  if (sha256File(runner) !== record.runner.sha256) fail("runner SHA-256 does not match authorization.");
  const specRecord = readJson(root, SPEC_PATH);
  const specsInAuthorization = record.specifications.map((binding) => {
    exactKeys(binding, ["id", "path", "sha256"], `authorization specification ${binding.id ?? "unknown"}`);
    if (binding.path !== SPEC_PATH) fail(`non-canonical specification path: ${binding.path}`);
    if (sha256File(path.join(root, binding.path)) !== binding.sha256) fail(`specification SHA-256 does not match authorization: ${binding.id}`);
    const specification = specFor(specRecord, binding.id);
    for (const dependency of specification.inputBindings) {
      const dependencyPath = regular(root, dependency.path);
      if (sha256File(dependencyPath) !== dependency.sha256) fail(`specification dependency SHA-256 does not match: ${dependency.path}`);
    }
    const canonical = canonicalInputs(root, specification);
    const bound = record.inputs.filter((input) => canonical.some(({ path: candidate }) => candidate === input.path));
    exact(bound, canonical, `authorization inputs for ${binding.id}`);
    return specification;
  });
  if (!specsInAuthorization.length) fail("authorization contains no specifications.");
  const canonicalInputsForAuthorization = specsInAuthorization.flatMap((specification) => canonicalInputs(root, specification));
  exact(record.inputs, canonicalInputsForAuthorization, "authorization input bindings");
  const specs = selectedIds ? specsInAuthorization.filter(({ id }) => selectedIds.includes(id)) : specsInAuthorization;
  if (!specs.length) fail(`authorization does not contain the selected specification: ${selectedIds.join(", ")}`);
  return { specs, specRecord };
}

function selectedInputs(record, specification) {
  const prefix = specification.id === "ntems-annual-land-cover-v1" ? "raw/nrcan-annual-land-cover-v2/" : specification.id === "ntems-forest-harvest-v1" ? "raw/nrcan-ca-forest-harvest-1985-2022/" : specification.id === "ntems-canopy-cover-v1" ? "raw/nrcan-forest-canopy-cover-2022/" : "raw/nrcan-forest-canopy-height-2022/";
  const inputs = record.inputs.filter((input) => input.path.startsWith(prefix));
  if (!inputs.length) fail(`authorization has no inputs for ${specification.id}.`);
  return inputs.sort((left, right) => (left.year ?? 0) - (right.year ?? 0) || left.path.localeCompare(right.path));
}

function validateInput(root, dataRoot, input) {
  const file = regular(dataRoot, input.path);
  if (statSync(file).size !== input.byteLength) fail(`input byte length drifted: ${input.path}`);
  if (sha256File(file) !== input.sha256) fail(`input SHA-256 drifted: ${input.path}`);
  return sourcePath(dataRoot, input);
}

export function rejectStagingFiles(expected) {
  if (!existsSync(path.dirname(expected.output))) return;
  const outputName = path.basename(expected.output);
  const sidecarName = path.basename(expected.sidecar);
  const staging = readdirSync(path.dirname(expected.output)).filter((name) => name.startsWith(`${outputName}.tmp-`) || name.startsWith(`${sidecarName}.tmp-`));
  if (staging.length) fail(`unfinished staging files are present beside ${expected.relativeOutput}: ${staging.join(", ")}`);
}

function entryExists(file) {
  try { lstatSync(file); return true; } catch (error) { if (error?.code === "ENOENT") return false; throw error; }
}

function classSemantics(info, contract) {
  if (!contract.classValues) return contract.continuousRange ? `continuous-${contract.continuousRange[0]}-${contract.continuousRange[1]}` : "continuous-source-values-preserved";
  return (info.bands?.[0]?.rat?.row ?? []).length ? "published-class-values-bound" : "unknown-empty-rat";
}

export function validateSidecarRecord(sidecar, expected, context) {
  exactKeys(sidecar, ["claims", "command", "createdAt", "inputBindings", "methodVersion", "output", "outputByteLength", "outputSha256", "qa", "schemaVersion", "specId", "toolVersions"], "sidecar");
  assert.equal(sidecar.schemaVersion, "witness-tree/phase1-ntems-transformation-sidecar/1");
  assert.equal(sidecar.specId, context.specification.id);
  assert.equal(sidecar.methodVersion, context.specification.methodVersion);
  exact(sidecar.inputBindings, [context.inputBinding], "sidecar input binding");
  exact(sidecar.output, { path: expected.relativeOutput, format: "GTiff" }, "sidecar output");
  exact(sidecar.command, expected.command, "sidecar command");
  exact(sidecar.toolVersions, context.toolVersions, "sidecar tool versions");
  assert.equal(sidecar.createdAt, context.createdAt);
  assert.match(sidecar.outputSha256, /^[0-9a-f]{64}$/);
  if (context.outputSha256) assert.equal(sidecar.outputSha256, context.outputSha256);
  assert.equal(sidecar.outputByteLength, context.outputByteLength);
  exact(sidecar.claims, { transformed: true, ingested: false, released: false, productionAdmission: false, productionEligible: false, externalMutationPerformed: false }, "sidecar claims");
  exact(sidecar.qa, { source: context.sourceQa, outputMetadataChecked: true, outputChecksumChecked: true, noResamplingOrReprojection: true, noOverwrite: true, sourcePixelChecksum: context.sourcePixelChecksum, outputPixelChecksum: context.outputPixelChecksum }, "sidecar QA");
  return sidecar;
}

function verifyOne(root, dataRoot, authorization, specification, input, grid, defects, versions) {
  const source = validateInput(root, dataRoot, input);
  const expected = expectedOutput(dataRoot, specification, input);
  rejectStagingFiles(expected);
  const outputExists = entryExists(expected.output);
  const sidecarExists = entryExists(expected.sidecar);
  if (!outputExists && !sidecarExists) return { specification: specification.id, input: input.path, status: "missing" };
  if (!outputExists || !sidecarExists) fail(`partial pair for ${expected.relativeOutput}; output and sidecar must appear together.`);
  const outputInfo = gdalJson(expected.output);
  const contract = specificationContract(specification, grid, defects, input.year);
  validateRasterStructure(outputInfo, contract, expected.relativeOutput, {
    proj4: proj4(expected.output),
    allowMissingClassTable: contract.allowEmptyRat,
  });
  const sourceInfo = gdalJson(source.member);
  validateRasterStructure(sourceInfo, contract, `${input.path}/${input.member}`, { proj4: proj4(source.member), allowMissingClassTable: contract.allowEmptyRat });
  const sourcePixelChecksum = gdalChecksum(source.member);
  const outputPixelChecksum = gdalChecksum(expected.output);
  if (sourcePixelChecksum !== outputPixelChecksum) fail(`source/output pixel checksum differs for ${expected.relativeOutput}.`);
  const outputByteLength = statSync(expected.output).size;
  const outputSha256 = sha256File(expected.output);
  const sidecarBytes = readFileSync(expected.sidecar);
  const sidecar = JSON.parse(sidecarBytes);
  const sourceQa = { classSemantics: classSemantics(sourceInfo, contract) };
  const expectedInputBinding = { ...input, classSemantics: sourceQa.classSemantics };
  validateSidecarRecord(sidecar, { relativeOutput: expected.relativeOutput, command: expectedCommand(input, expected.relativeOutput, outputInfo.bands[0].type) }, { specification, inputBinding: expectedInputBinding, toolVersions: versions, createdAt: authorization.createdAt, outputByteLength, outputSha256, sourceQa, sourcePixelChecksum, outputPixelChecksum });
  if (sidecar.outputSha256 !== outputSha256) fail(`sidecar output SHA-256 differs for ${expected.relativeOutput}.`);
  if (Buffer.compare(sidecarBytes, Buffer.from(`${JSON.stringify(sidecar, null, 2)}\n`)) !== 0) fail(`sidecar bytes are not deterministic for ${expected.relativeOutput}.`);
  for (const pathName of [expected.output, expected.sidecar]) {
    const info = lstatSync(pathName);
    if (!info.isFile() || info.isSymbolicLink()) fail(`canonical output is not a regular non-symlink file: ${pathName}`);
  }
  return { specification: specification.id, input: input.path, status: "verified", output: expected.relativeOutput, outputSha256, outputByteLength, sidecarSha256: sha256(sidecarBytes), sourcePixelChecksum, outputPixelChecksum };
}

export function verify(options, root = REPO_ROOT) {
  const authorizationPath = options.authorization ?? (options.specId ? AUTHORIZATION_BY_SPEC[options.specId] : undefined);
  if (!authorizationPath) fail("provide --authorization, or provide a supported --spec-id so the matching per-scope authorization can be selected.");
  const authorization = readJson(root, authorizationPath);
  const selectedIds = options.specId ? [options.specId] : null;
  const { specs } = validateAuthorization(authorization, root, selectedIds);
  const dataRoot = path.resolve(options.dataRoot ?? DEFAULT_DATA_ROOT);
  const grid = readJson(root, GRID_PATH);
  const defects = readJson(root, DEFECTS_PATH);
  const versions = toolVersions();
  const rows = [];
  for (const specification of specs.filter(({ id }) => !selectedIds || selectedIds.includes(id))) {
    for (const input of selectedInputs(authorization, specification)) rows.push(verifyOne(root, dataRoot, authorization, specification, input, grid, defects, versions));
  }
  const verified = rows.filter(({ status }) => status === "verified");
  const missing = rows.filter(({ status }) => status === "missing");
  if (options.requireComplete && missing.length) fail(`${missing.length} expected output(s) are missing.`);
  const result = { schemaVersion: "witness-tree/phase1-ntems-transformation-readback-evidence/1", status: missing.length ? "partial-readback-verified" : "complete-readback-verified", authorization: { path: authorizationPath, sha256: sha256File(path.join(root, authorizationPath)), createdAt: authorization.createdAt }, runner: authorization.runner, specifications: authorization.specifications.filter(({ id }) => !selectedIds || selectedIds.includes(id)), outputs: verified, counts: { expected: rows.length, verified: verified.length, missing: missing.length }, claims: { transformed: verified.length > 0, ingested: false, released: false, productionAdmission: false, productionEligible: false, externalMutationPerformed: false }, sourceRecord: { path: SPEC_PATH, sha256: sha256File(path.join(root, SPEC_PATH)) } };
  validateEvidenceRecord(result);
  if (options.writeEvidence) {
    if (!verified.length) fail("cannot write evidence without a verified output.");
    const evidencePath = options.evidencePath ?? (result.specifications.length === 1 ? `data/${result.specifications[0].id}-readback-evidence-2026-08-26.json` : DEFAULT_COMPOSITE_EVIDENCE);
    if (path.isAbsolute(evidencePath) || evidencePath.includes("..")) fail("--evidence-path must be a repository-relative path.");
    const destination = path.join(root, evidencePath);
    writeFileSync(destination, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    result.evidencePath = evidencePath;
  }
  return result;
}

export function validateEvidenceRecord(record) {
  exactKeys(record, ["authorization", "claims", "counts", "outputs", "runner", "schemaVersion", "sourceRecord", "specifications", "status"], "readback evidence");
  assert.equal(record.schemaVersion, "witness-tree/phase1-ntems-transformation-readback-evidence/1");
  assert.ok(["partial-readback-verified", "complete-readback-verified"].includes(record.status));
  exactKeys(record.authorization, ["createdAt", "path", "sha256"], "readback evidence authorization");
  if (path.isAbsolute(record.authorization.path) || record.authorization.path.includes("..")) fail("readback evidence authorization path is unsafe.");
  assert.match(record.authorization.sha256, /^[0-9a-f]{64}$/);
  utc(record.authorization.createdAt, "readback evidence authorization.createdAt");
  exactKeys(record.runner, ["path", "sha256"], "readback evidence runner");
  if (path.isAbsolute(record.runner.path) || record.runner.path.includes("..")) fail("readback evidence runner path is unsafe.");
  assert.match(record.runner.sha256, /^[0-9a-f]{64}$/);
  assert.ok(Array.isArray(record.specifications) && record.specifications.length > 0);
  for (const specification of record.specifications) {
    exactKeys(specification, ["id", "path", "sha256"], "readback evidence specification");
    assert.match(specification.id, /^ntems-[a-z0-9-]+-v1$/);
    if (path.isAbsolute(specification.path) || specification.path.includes("..")) fail("readback evidence specification path is unsafe.");
    assert.match(specification.sha256, /^[0-9a-f]{64}$/);
  }
  exactKeys(record.counts, ["expected", "missing", "verified"], "readback evidence counts");
  for (const key of ["expected", "missing", "verified"]) assert.ok(Number.isInteger(record.counts[key]) && record.counts[key] >= 0);
  assert.equal(record.counts.expected, record.counts.missing + record.counts.verified);
  assert.equal(record.counts.verified, record.outputs.length);
  assert.equal(record.status === "complete-readback-verified", record.counts.missing === 0);
  exact(record.claims, { transformed: record.counts.verified > 0, ingested: false, released: false, productionAdmission: false, productionEligible: false, externalMutationPerformed: false }, "readback evidence claims");
  exactKeys(record.sourceRecord, ["path", "sha256"], "readback evidence source record");
  if (record.sourceRecord.path !== SPEC_PATH) fail("readback evidence source record is not the canonical specification record.");
  assert.match(record.sourceRecord.sha256, /^[0-9a-f]{64}$/);
  if (!Array.isArray(record.outputs)) fail("readback evidence outputs must be an array.");
  for (const output of record.outputs) {
    exactKeys(output, ["input", "output", "outputByteLength", "outputSha256", "outputPixelChecksum", "sidecarSha256", "sourcePixelChecksum", "specification", "status"], "readback evidence output");
    assert.equal(output.status, "verified");
    assert.match(output.specification, /^ntems-[a-z0-9-]+-v1$/);
    if (typeof output.input !== "string" || typeof output.output !== "string" || path.isAbsolute(output.input) || path.isAbsolute(output.output) || output.input.includes("..") || output.output.includes("..")) fail("readback evidence output paths are invalid.");
    assert.ok(Number.isInteger(output.outputByteLength) && output.outputByteLength > 0);
    assert.match(output.outputSha256, /^[0-9a-f]{64}$/);
    assert.match(output.sidecarSha256, /^[0-9a-f]{64}$/);
    assert.ok(Number.isInteger(output.sourcePixelChecksum) && Number.isInteger(output.outputPixelChecksum));
    assert.equal(output.sourcePixelChecksum, output.outputPixelChecksum);
  }
  return true;
}

function parseOptions(argv) {
  const value = (flag) => { const index = argv.indexOf(flag); return index < 0 ? undefined : argv[index + 1]; };
  return { authorization: value("--authorization"), dataRoot: value("--data-root") ?? DEFAULT_DATA_ROOT, specId: value("--spec-id"), requireComplete: argv.includes("--require-complete"), writeEvidence: argv.includes("--write-evidence"), evidencePath: value("--evidence-path") };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { console.log(JSON.stringify(verify(parseOptions(process.argv.slice(2))), null, 2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
