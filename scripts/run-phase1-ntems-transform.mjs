import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { openSync, readSync, closeSync, existsSync, linkSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validatePhase1TransformationScopeOwnerApproval } from "./check-phase1-transformation-scope-owner-approval.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNNER_RELATIVE_PATH = "scripts/run-phase1-ntems-transform.mjs";
const SCOPE_APPROVAL_PATH = "data/phase1-transformation-scope-owner-approval-2026-08-25.json";
const SPEC_PATH = "data/phase1-production-transformation-specifications-v1.json";
const DEFAULT_DATA_ROOT = "/Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree-data";
const GRID_PATH = "data/raster-grid.json";
const DEFECTS_PATH = "data/raster-defects.json";
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const SPEC_IDS = [
  "ntems-annual-land-cover-v1",
  "ntems-forest-harvest-v1",
  "ntems-canopy-cover-v1",
  "ntems-canopy-height-v1",
];

const readJson = (root, relativePath) => JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));
const hashBytes = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function sha256File(file) {
  const fd = openSync(file, "r");
  const hash = createHash("sha256");
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
  throw new Error(`NTEMS transformation stopped: ${message}`);
}

function exact(actual, expected, label) {
  try { assert.deepEqual(actual, expected); } catch { fail(`${label} drifted.`); }
}

function safeRegularFile(root, relativePath) {
  if (typeof relativePath !== "string" || path.isAbsolute(relativePath) || relativePath.includes("..")) fail(`unsafe data-root relative path: ${relativePath}`);
  const candidate = path.resolve(root, relativePath);
  const info = lstatSync(candidate);
  if (!info.isFile() || info.isSymbolicLink()) fail(`${relativePath} must be a regular non-symlink file.`);
  const resolved = realpathSync(candidate);
  if (resolved !== candidate && !resolved.startsWith(`${root}${path.sep}`)) fail(`${relativePath} escapes data root.`);
  return candidate;
}

function sourceRelativeFromProfile(localPath) {
  const marker = "Witness_Tree-data/";
  const index = localPath.indexOf(marker);
  if (index < 0) fail(`profile path does not identify Witness_Tree-data: ${localPath}`);
  return localPath.slice(index + marker.length);
}

function utc(value, label) {
  if (typeof value !== "string" || !UTC.test(value) || new Date(value).toISOString() !== value.replace("Z", ".000Z")) fail(`${label} must be a fixed UTC instant such as 2026-08-25T00:00:00Z.`);
  return value;
}

function loadApprovedSpecs(root) {
  const scope = readJson(root, SCOPE_APPROVAL_PATH);
  validatePhase1TransformationScopeOwnerApproval(scope, root);
  const record = readJson(root, SPEC_PATH);
  const specs = new Map(record.specifications.map((specification) => [specification.id, specification]));
  const selected = SPEC_IDS.map((id) => {
    const specification = specs.get(id);
    if (!specification) fail(`missing approved specification ${id}.`);
    const binding = scope.approvedScopes.find(({ specId }) => specId === id);
    if (!binding || binding.specPath !== SPEC_PATH) fail(`scope approval does not bind ${id}.`);
    if (hashBytes(readFileSync(path.join(root, SPEC_PATH))) !== binding.specSha256) fail(`specification checksum drifted: ${id}.`);
    return specification;
  });
  return { scope, specs: selected };
}

function validateEvidenceBindings(root, specification) {
  for (const input of specification.inputBindings) {
    const file = path.join(root, input.path);
    if (hashBytes(readFileSync(file)) !== input.sha256) fail(`${specification.id} evidence binding drifted: ${input.path}.`);
  }
}

function gdalJson(input, executable = "gdalinfo") {
  const result = spawnSync(executable, ["-json", input], { encoding: "utf8" });
  if (result.status !== 0) fail(`${executable} could not read ${input}: ${result.stderr || result.stdout}`);
  try { return JSON.parse(result.stdout); } catch { fail(`${executable} returned non-JSON output for ${input}.`); }
}

function gdalPixelChecksum(input) {
  const result = spawnSync("gdalinfo", ["-json", "-checksum", input], { encoding: "utf8" });
  if (result.status !== 0) fail(`gdalinfo checksum could not read ${input}: ${result.stderr || result.stdout}`);
  try {
    const value = JSON.parse(result.stdout).bands?.[0]?.checksum;
    if (!Number.isInteger(value)) fail(`gdalinfo returned no band checksum for ${input}.`);
    return value;
  } catch (error) {
    if (error?.message?.startsWith("NTEMS transformation stopped:")) throw error;
    fail(`gdalinfo returned invalid checksum JSON for ${input}.`);
  }
}

export function validateRasterMetadata(info, contract, label = "raster", options = {}) {
  exact(info.size, [contract.width, contract.height], `${label} dimensions`);
  exact(info.geoTransform, contract.geotransform, `${label} geotransform`);
  if (info.bands?.length !== 1) fail(`${label} must contain exactly one band.`);
  const band = info.bands[0];
  if (band.type !== contract.dataType) fail(`${label} data type is ${band.type}, expected ${contract.dataType}.`);
  if (Math.abs(Number(band.noDataValue) - Number(contract.noDataValue)) > Math.max(1e-9, Math.abs(Number(contract.noDataValue)) * 1e-7)) fail(`${label} nodata differs from ${contract.noDataValue}.`);
  if (!info.coordinateSystem?.wkt) fail(`${label} has no CRS WKT.`);
  if (options.proj4 && options.proj4.trim() !== contract.proj4.trim()) fail(`${label} CRS does not match the canonical grid.`);
  const rows = band.rat?.row ?? [];
  if (contract.classValues) {
    const values = rows.map((row) => row.f?.[0]).sort((a, b) => a - b);
    const expected = [...contract.classValues].sort((a, b) => a - b);
    if (values.length === 0) {
      if (!options.allowEmptyRat) fail(`${label} has no class table.`);
      return { classSemantics: "unknown-empty-rat" };
    }
    exact(values, expected, `${label} class values`);
    return { classSemantics: "published-class-values-bound" };
  }
  return { classSemantics: contract.continuousRange ? `continuous-${contract.continuousRange[0]}-${contract.continuousRange[1]}` : "continuous-source-values-preserved" };
}

function proj4For(input) {
  const result = spawnSync("gdalsrsinfo", ["-o", "proj4", input], { encoding: "utf8" });
  if (result.status !== 0) fail(`gdalsrsinfo could not read ${input}: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function sourceContract(specification, grid, defects, year = null) {
  const common = { width: grid.grid.width, height: grid.grid.height, geotransform: grid.grid.geotransform, proj4: grid.grid.crs.proj4 };
  if (specification.id === "ntems-annual-land-cover-v1") return { ...common, dataType: "Byte", noDataValue: 255, classValues: specification.selection.includeClassValues.filter((value) => value !== 255), allowEmptyRat: defects.defects.some((defect) => defect.year === year) };
  if (specification.id === "ntems-forest-harvest-v1") return { ...common, dataType: "UInt16", noDataValue: 65536, classValues: [0, ...Array.from({ length: 38 }, (_, index) => index + 1985)] };
  if (specification.id === "ntems-canopy-cover-v1") return { ...common, dataType: "Float32", noDataValue: -3.402823e+38, continuousRange: [0, 100] };
  if (specification.id === "ntems-canopy-height-v1") return { ...common, dataType: "Float32", noDataValue: -3.402823e+38, continuousRange: [0, 62.503] };
  fail(`unsupported NTEMS specification: ${specification.id}`);
}

function sourceDescriptor(root, specification) {
  validateEvidenceBindings(root, specification);
  if (specification.id === "ntems-annual-land-cover-v1") {
    const evidence = readJson(root, "data/vlce2-remote-promotion-evidence.json");
    const preparation = readJson(root, "data/vlce2-promotion-preparation.json");
    const prepared = new Map(preparation.entries.map((entry) => [entry.year, entry]));
    return evidence.entries.map((entry) => {
      const source = prepared.get(entry.year);
      if (!source || !entry.payload?.key?.includes(source.sha256) || entry.payload?.byteLength !== source.byteLength) fail(`annual source evidence/preparation mismatch for ${entry.year}.`);
      const relativePath = path.join("raw/nrcan-annual-land-cover-v2/2026-08-12", source.originalFilename);
      return { year: entry.year, relativePath, expectedSha256: source.sha256, expectedByteLength: source.byteLength, member: `CA_forest_VLCE2_${entry.year}.tif` };
    }).map((entry) => ({ ...entry, specification }));
  }
  const profilePath = specification.id === "ntems-forest-harvest-v1" ? "data/nrcan-harvest-profile.json" : specification.id === "ntems-canopy-cover-v1" ? "data/nrcan-canopy-cover-profile.json" : "data/nrcan-canopy-height-profile.json";
  const profile = readJson(root, profilePath);
  const relativePath = sourceRelativeFromProfile(profile.raw.localPath);
  return [{ specification, relativePath, expectedSha256: profile.raw.sha256, expectedByteLength: profile.raw.byteLength, member: profile.raster.member, year: specification.id === "ntems-forest-harvest-v1" ? null : 2022 }];
}

export function collectInputBindings(root, dataRoot, specification, grid, defects, inspect = true) {
  const descriptors = sourceDescriptor(root, specification);
  const bindings = [];
  for (const descriptor of descriptors) {
    const file = safeRegularFile(dataRoot, descriptor.relativePath);
    const size = statSync(file).size;
    if (size !== descriptor.expectedByteLength) fail(`${descriptor.relativePath} byte length differs from the bound source.`);
    const sha256 = sha256File(file);
    if (sha256 !== descriptor.expectedSha256) fail(`${descriptor.relativePath} SHA-256 differs from the bound source.`);
    const input = `/vsizip/${file}/${descriptor.member}`;
    let qa;
    if (inspect) {
      const info = gdalJson(input);
      qa = validateRasterMetadata(info, sourceContract(specification, grid, defects, descriptor.year), `${descriptor.relativePath}/${descriptor.member}`, { proj4: proj4For(input), allowEmptyRat: sourceContract(specification, grid, defects, descriptor.year).allowEmptyRat });
      if (specification.id === "ntems-forest-harvest-v1" && !/EPSG[", ]+3978/.test(spawnSync("gdalsrsinfo", ["-e", input], { encoding: "utf8" }).stdout)) fail("harvest source does not identify as EPSG:3978.");
    }
    bindings.push({ path: descriptor.relativePath, sha256, byteLength: size, member: descriptor.member, ...(descriptor.year === null ? {} : { year: descriptor.year }), ...(qa ?? {}) });
  }
  return bindings;
}

function inputSha(specification, bindings) {
  if (specification.id === "ntems-annual-land-cover-v1") return specification.inputBindings[0].sha256;
  return bindings[0].sha256;
}

export function buildPlans(specification, bindings, outputRoot) {
  const base = path.join(outputRoot, specification.id, inputSha(specification, bindings), specification.methodVersion);
  return bindings.map((input) => {
    const name = specification.id === "ntems-annual-land-cover-v1" ? `annual-land-cover-${input.year}.tif` : specification.id === "ntems-forest-harvest-v1" ? "forest-harvest-year-1985-2022.tif" : specification.id === "ntems-canopy-cover-v1" ? "canopy-cover-2022.tif" : "canopy-height-2022.tif";
    const output = path.join(base, name);
    return { specification, input, output, sidecar: `${output}.sidecar.json`, relativeOutput: path.relative(outputRoot, output), relativeSidecar: path.relative(outputRoot, `${output}.sidecar.json`) };
  });
}

export function buildGdalTranslateArgs(input, output, dataType) {
  return ["-of", "GTiff", "-co", "TILED=YES", "-co", "BIGTIFF=YES", "-co", "COMPRESS=DEFLATE", "-co", `PREDICTOR=${dataType === "Float32" ? 3 : 2}`, "-co", "NUM_THREADS=1", input, output];
}

function ensureAbsent(file) {
  try { lstatSync(file); fail(`refusing to overwrite existing output: ${file}`); } catch (error) { if (error?.message?.startsWith("NTEMS transformation stopped:")) throw error; if (error.code !== "ENOENT") fail(`cannot safely inspect output: ${file}`); }
}

function executionExpected(root, dataRoot, specs, inputBindings) {
  const runnerSha256 = sha256File(path.join(root, RUNNER_RELATIVE_PATH));
  return {
    runner: { path: RUNNER_RELATIVE_PATH, sha256: runnerSha256 },
    specifications: specs.map((specification) => ({ id: specification.id, path: SPEC_PATH, sha256: hashBytes(readFileSync(path.join(root, SPEC_PATH))) })),
    inputs: inputBindings.flat().map(({ path: relativePath, sha256, byteLength, member, year }) => ({ path: relativePath, sha256, byteLength, member, ...(year === undefined ? {} : { year }) })).sort((left, right) => left.path.localeCompare(right.path)),
    dataRoot,
  };
}

export function validateExecutionAuthorization(record, expected, createdAt) {
  exact(Object.keys(record).sort(), ["boundary", "createdAt", "decisionId", "inputs", "ownerDecision", "runner", "schemaVersion", "specifications", "status"].sort(), "execution authorization keys");
  if (record.schemaVersion !== "witness-tree/phase1-ntems-execution-authorization/1" || record.status !== "approved-owner-local-execution") fail("execution authorization is not an approved owner-local record.");
  assert.equal(record.decisionId, "phase1-ntems-raster-execution-v1");
  assert.equal(record.ownerDecision?.decision, "approve");
  assert.equal(record.ownerDecision?.ownerName, "Chinonso Obeta");
  assert.match(record.ownerDecision?.scope ?? "", /four NTEMS raster scopes/i);
  assert.deepEqual(record.runner, expected.runner);
  assert.deepEqual(record.specifications, expected.specifications);
  assert.deepEqual(record.inputs, expected.inputs);
  assert.deepEqual(record.boundary, { localOnly: true, externalMutation: false, ingestion: false, release: false, productionAdmission: false, productionEligible: false, overwriteExisting: false });
  assert.equal(record.createdAt, utc(createdAt, "--created-at"));
  return record;
}

function sidecarFor(plan, outputInfo, outputSha256, outputByteLength, createdAt, toolVersions, sourceQa) {
  return {
    schemaVersion: "witness-tree/phase1-ntems-transformation-sidecar/1",
    specId: plan.specification.id,
    methodVersion: plan.specification.methodVersion,
    inputBindings: [plan.input],
    command: buildGdalTranslateArgs(`data-root/${plan.input.path}/${plan.input.member}`, `output-root/${plan.relativeOutput}`, outputInfo.bands[0].type),
    toolVersions,
    output: { path: plan.relativeOutput, format: "GTiff" },
    outputSha256,
    outputByteLength,
    createdAt,
    qa: { source: sourceQa, outputMetadataChecked: true, outputChecksumChecked: true, noResamplingOrReprojection: true, noOverwrite: true },
    claims: { transformed: true, ingested: false, released: false, productionAdmission: false, productionEligible: false, externalMutationPerformed: false },
  };
}

function toolVersions() {
  return { gdalTranslate: execFileSync("gdal_translate", ["--version"], { encoding: "utf8" }).trim(), gdalInfo: execFileSync("gdalinfo", ["--version"], { encoding: "utf8" }).trim(), gdalsrsinfo: execFileSync("gdalsrsinfo", ["--version"], { encoding: "utf8" }).trim() };
}

export function parseOptions(argv) {
  const value = (flag) => { const index = argv.indexOf(flag); return index < 0 ? undefined : argv[index + 1]; };
  const execute = argv.includes("--execute");
  if (argv.includes("--preflight") && execute) fail("--preflight and --execute are mutually exclusive.");
  return { execute, specId: value("--spec-id"), dataRoot: path.resolve(value("--data-root") ?? DEFAULT_DATA_ROOT), outputRoot: path.resolve(value("--output-root") ?? path.join(value("--data-root") ?? DEFAULT_DATA_ROOT, "derived/phase1")), authorization: value("--execution-authorization"), createdAt: value("--created-at") };
}

export function run(options, root = REPO_ROOT) {
  if (options.execute && (!options.authorization || !options.createdAt)) fail("--execute requires --execution-authorization and --created-at.");
  const { specs } = loadApprovedSpecs(root);
  const selected = options.specId ? specs.filter((specification) => specification.id === options.specId) : specs;
  if (selected.length !== (options.specId ? 1 : 4)) fail(`unknown or unapproved --spec-id: ${options.specId}`);
  const grid = readJson(root, GRID_PATH);
  const defects = readJson(root, DEFECTS_PATH);
  const inputSets = selected.map((specification) => collectInputBindings(root, options.dataRoot, specification, grid, defects, true));
  const canonicalOutputRoot = path.join(options.dataRoot, "derived/phase1");
  if (options.outputRoot !== canonicalOutputRoot) fail(`custom output root is not permitted; expected ${canonicalOutputRoot}.`);
  const expected = executionExpected(root, options.dataRoot, selected, inputSets);
  if (!options.execute) return { mode: "preflight", specs: selected.map(({ id }) => id), inputs: expected.inputs, outputs: 0, claims: { transformed: false, ingested: false, released: false, productionAdmission: false, productionEligible: false, externalMutationPerformed: false } };
  const authorizationPath = path.resolve(options.authorization);
  const authorization = JSON.parse(readFileSync(authorizationPath, "utf8"));
  validateExecutionAuthorization(authorization, expected, options.createdAt);
  const versions = toolVersions();
  const results = [];
  for (const [index, specification] of selected.entries()) {
    for (const plan of buildPlans(specification, inputSets[index], options.outputRoot)) {
      ensureAbsent(plan.output); ensureAbsent(plan.sidecar);
      mkdirSync(path.dirname(plan.output), { recursive: true });
      const realOutputParent = realpathSync(path.dirname(plan.output));
      const realCanonicalRoot = realpathSync(canonicalOutputRoot);
      if (realOutputParent !== realCanonicalRoot && !realOutputParent.startsWith(`${realCanonicalRoot}${path.sep}`)) fail(`output parent escapes canonical output root: ${realOutputParent}.`);
      const temporary = `${plan.output}.tmp-${process.pid}`;
      const temporarySidecar = `${plan.sidecar}.tmp-${process.pid}`;
      ensureAbsent(temporary);
      ensureAbsent(temporarySidecar);
      const source = `/vsizip/${path.join(options.dataRoot, plan.input.path)}/${plan.input.member}`;
      const args = buildGdalTranslateArgs(source, temporary, specification.id.includes("canopy") ? "Float32" : specification.id.includes("harvest") ? "UInt16" : "Byte");
      let publishedOutput = false;
      let publishedSidecar = false;
      try {
        const result = spawnSync("gdal_translate", args, { encoding: "utf8", stdio: "inherit" });
        if (result.status !== 0) fail(`gdal_translate failed for ${plan.input.path}.`);
        const outputInfo = gdalJson(temporary);
        const contract = sourceContract(specification, grid, defects, plan.input.year);
        const outputQa = validateRasterMetadata(outputInfo, contract, plan.relativeOutput, { proj4: proj4For(temporary), allowEmptyRat: contract.allowEmptyRat });
        const sourcePixelChecksum = gdalPixelChecksum(source);
        const outputPixelChecksum = gdalPixelChecksum(temporary);
        if (outputPixelChecksum !== sourcePixelChecksum) fail(`pixel checksum changed for ${plan.relativeOutput}.`);
        const outputSha256 = sha256File(temporary); const outputByteLength = statSync(temporary).size;
        const createdAt = utc(options.createdAt, "--created-at");
        const sidecar = sidecarFor(plan, outputInfo, outputSha256, outputByteLength, createdAt, versions, outputQa);
        sidecar.qa.sourcePixelChecksum = sourcePixelChecksum;
        sidecar.qa.outputPixelChecksum = outputPixelChecksum;
        writeFileSync(temporarySidecar, `${JSON.stringify(sidecar, null, 2)}\n`, { flag: "wx", mode: 0o600 });
        linkSync(temporary, plan.output); publishedOutput = true;
        linkSync(temporarySidecar, plan.sidecar); publishedSidecar = true;
        unlinkSync(temporary);
        unlinkSync(temporarySidecar);
        results.push({ specId: specification.id, path: plan.relativeOutput, sha256: outputSha256, byteLength: outputByteLength, sidecar: plan.relativeSidecar });
      } catch (error) {
        if (publishedSidecar) rmSync(plan.sidecar, { force: true });
        if (publishedOutput) rmSync(plan.output, { force: true });
        if (existsSync(temporary)) rmSync(temporary, { force: true });
        if (existsSync(temporarySidecar)) rmSync(temporarySidecar, { force: true });
        throw error;
      }
    }
  }
  return { mode: "execute", specs: selected.map(({ id }) => id), inputs: expected.inputs, outputs: results, claims: { transformed: true, ingested: false, released: false, productionAdmission: false, productionEligible: false, externalMutationPerformed: false } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const result = run(parseOptions(process.argv.slice(2)));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
