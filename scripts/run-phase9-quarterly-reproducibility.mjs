#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const POPULATION_SCHEMA = "witness-tree/phase9-quarterly-reproducibility-population/1";
const RESULT_SCHEMA = "witness-tree/phase9-quarterly-reproducibility-result/1";
const DRAW_ALGORITHM = "sha256-seeded-order-v1";
const DRAW_DOMAIN = "witness-tree/phase9-quarterly-reproducibility-draw/1";
const SHA256 = /^[a-f0-9]{64}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const QUARTER = /^\d{4}-Q[1-4]$/;
const POPULATION_CLASSES = new Set(["published-production-figures", "synthetic-test-fixture"]);
const OUTPUT_TOKEN = "{outputPath}";
const DATA_ROOT_TOKEN = "{dataRoot}";
const RUN_TIMEOUT_MS = 4 * 60 * 60 * 1000;

function fail(message) {
  throw new Error(message);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredText(value, name) {
  if (typeof value !== "string" || !value.trim()) fail(`${name} is required.`);
  return value;
}

function requiredSha256(value, name) {
  if (typeof value !== "string" || !SHA256.test(value)) fail(`${name} must be a lowercase hexadecimal SHA-256.`);
  return value;
}

function requiredByteLength(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) fail(`${name} must be a positive integer byte length.`);
  return value;
}

function requiredRelativePath(value, name) {
  requiredText(value, name);
  if (value.includes("\\") || value.includes("\0") || path.isAbsolute(value)) fail(`${name} must be a portable repository-relative path.`);
  const normalized = path.posix.normalize(value);
  if (normalized === "." || normalized === ".." || normalized.startsWith("../") || normalized !== value) fail(`${name} must be a normalized relative path without parent traversal.`);
  return value;
}

function requiredHttpsUrl(value, name) {
  requiredText(value, name);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${name} must be a valid URL.`);
  }
  if (parsed.protocol !== "https:") fail(`${name} must use HTTPS.`);
  return value;
}

function requiredUtc(value, name) {
  if (typeof value !== "string" || !UTC.test(value) || Number.isNaN(Date.parse(value))) fail(`${name} must be an exact UTC timestamp.`);
  return value;
}

function requiredSeed(seed) {
  if (typeof seed !== "string" || !SHA256.test(seed)) fail("Seed must be 64 lowercase hexadecimal characters.");
  return seed;
}

function inside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function cleanMessage(error, roots = []) {
  let message = error instanceof Error ? error.message : String(error);
  for (const [root, label] of roots) message = message.split(root).join(label);
  return message.slice(0, 2000);
}

export async function sha256File(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

function validateInputBinding(input, unitId, index) {
  if (!isObject(input)) fail(`${unitId} raw archive input ${index} must be an object.`);
  return {
    archiveKey: requiredRelativePath(input.archiveKey, `${unitId} raw archive input ${index} archive key`),
    versionId: requiredText(input.versionId, `${unitId} raw archive input ${index} version id`),
    relativePath: requiredRelativePath(input.relativePath, `${unitId} raw archive input ${index} path`),
    byteLength: requiredByteLength(input.byteLength, `${unitId} raw archive input ${index} byte length`),
    sha256: requiredSha256(input.sha256, `${unitId} raw archive input ${index} SHA-256`),
  };
}

function validateUnit(unit, index) {
  if (!isObject(unit)) fail(`Population unit ${index} must be an object.`);
  const id = requiredText(unit.id, `Population unit ${index} id`);
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(id)) fail(`Population unit ${index} id is invalid.`);

  if (!isObject(unit.publishedFigure)) fail(`${id} must bind its published figure.`);
  const publishedFigure = {
    publicUrl: requiredHttpsUrl(unit.publishedFigure.publicUrl, `${id} published URL`),
    methodVersion: requiredText(unit.publishedFigure.methodVersion, `${id} published method version`),
    byteLength: requiredByteLength(unit.publishedFigure.byteLength, `${id} published byte length`),
    sha256: requiredSha256(unit.publishedFigure.sha256, `${id} published SHA-256`),
  };

  if (!Array.isArray(unit.rawArchiveInputs) || unit.rawArchiveInputs.length === 0) fail(`${id} requires at least one raw archive input binding.`);
  const rawArchiveInputs = unit.rawArchiveInputs.map((input, inputIndex) => validateInputBinding(input, id, inputIndex));
  if (new Set(rawArchiveInputs.map((input) => input.relativePath)).size !== rawArchiveInputs.length) fail(`${id} raw archive input paths must be unique.`);

  if (!isObject(unit.recomputation)) fail(`${id} must bind a recomputation path.`);
  const runnerPath = requiredRelativePath(unit.recomputation.runnerPath, `${id} recomputation runner path`);
  if (!runnerPath.endsWith(".mjs")) fail(`${id} recomputation runner must be an .mjs file.`);
  const runnerSha256 = requiredSha256(unit.recomputation.runnerSha256, `${id} recomputation runner SHA-256`);
  if (!Array.isArray(unit.recomputation.args) || unit.recomputation.args.length === 0) fail(`${id} recomputation args are required.`);
  const args = unit.recomputation.args.map((arg, argIndex) => requiredText(arg, `${id} recomputation arg ${argIndex}`));
  if (args.filter((arg) => arg === DATA_ROOT_TOKEN).length !== 1) fail(`${id} recomputation args must contain ${DATA_ROOT_TOKEN} exactly once.`);
  if (args.filter((arg) => arg === OUTPUT_TOKEN).length !== 1) fail(`${id} recomputation args must contain ${OUTPUT_TOKEN} exactly once.`);
  for (const arg of args) {
    const placeholders = arg.match(/\{[^}]+\}/g) ?? [];
    if (placeholders.some((placeholder) => placeholder !== DATA_ROOT_TOKEN && placeholder !== OUTPUT_TOKEN)) fail(`${id} recomputation args contain an unsupported placeholder.`);
  }

  return { id, publishedFigure, rawArchiveInputs, recomputation: { runnerPath, runnerSha256, args } };
}

export function validateQuarterlyPopulationManifest(candidate, { allowFixture = false } = {}) {
  if (!isObject(candidate) || candidate.schemaVersion !== POPULATION_SCHEMA) fail(`Population manifest must use ${POPULATION_SCHEMA}.`);
  const populationId = requiredText(candidate.populationId, "Population id");
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(populationId)) fail("Population id is invalid.");
  if (!QUARTER.test(candidate.quarter ?? "")) fail("Population quarter must use YYYY-QN.");
  if (!POPULATION_CLASSES.has(candidate.populationClass)) fail("Population class must identify published production figures or a synthetic test fixture.");
  if (candidate.populationClass === "synthetic-test-fixture" && !allowFixture) fail("Synthetic fixture populations require explicit allowFixture authorization.");
  requiredUtc(candidate.generatedAt, "Population generatedAt");
  if (!Array.isArray(candidate.units) || candidate.units.length === 0) fail("Population manifest requires at least one unit.");
  const units = candidate.units.map(validateUnit);
  if (new Set(units.map((unit) => unit.id)).size !== units.length) fail("Population unit ids must be unique.");
  return { schemaVersion: POPULATION_SCHEMA, populationId, quarter: candidate.quarter, populationClass: candidate.populationClass, generatedAt: candidate.generatedAt, units };
}

export function drawQuarterlySample(population, seed, sampleSize) {
  requiredSeed(seed);
  const units = population?.units;
  if (!Array.isArray(units) || units.length === 0) fail("A validated population with at least one unit is required.");
  if (!Number.isSafeInteger(sampleSize) || sampleSize <= 0 || sampleSize > units.length) fail("Sample size must be a positive integer no larger than the population.");
  return units
    .map((unit, populationIndex) => ({
      id: unit.id,
      populationIndex,
      score: createHash("sha256").update(`${DRAW_DOMAIN}\0${seed}\0${unit.id}`).digest("hex"),
    }))
    .sort((left, right) => left.score.localeCompare(right.score) || left.id.localeCompare(right.id))
    .slice(0, sampleSize)
    .map((entry, index) => ({ drawPosition: index + 1, ...entry }));
}

async function inspectBoundFile(root, relativePath, expected) {
  const lexicalRoot = path.resolve(root);
  const target = path.resolve(lexicalRoot, relativePath);
  if (!inside(lexicalRoot, target)) fail(`${relativePath} escapes its bound root.`);
  const info = await lstat(target);
  if (!info.isFile() || info.isSymbolicLink()) fail(`${relativePath} must be a regular non-symlink file.`);
  const realRoot = await realpath(lexicalRoot);
  const realTarget = await realpath(target);
  if (!inside(realRoot, realTarget)) fail(`${relativePath} resolves outside its bound root.`);
  const observed = { byteLength: info.size, sha256: await sha256File(realTarget) };
  if (expected && ((expected.byteLength !== undefined && observed.byteLength !== expected.byteLength) || (expected.sha256 !== undefined && observed.sha256 !== expected.sha256))) {
    fail(`${relativePath} does not match its bound byte length and SHA-256.`);
  }
  return { target: realTarget, observed };
}

async function recordInputChecks(unit, dataRoot, roots) {
  const results = [];
  for (const input of unit.rawArchiveInputs) {
    try {
      const { observed } = await inspectBoundFile(dataRoot, input.relativePath, input);
      results.push({ archiveKey: input.archiveKey, versionId: input.versionId, relativePath: input.relativePath, expected: { byteLength: input.byteLength, sha256: input.sha256 }, observed, status: "pass" });
    } catch (error) {
      results.push({
        archiveKey: input.archiveKey,
        versionId: input.versionId,
        relativePath: input.relativePath,
        expected: { byteLength: input.byteLength, sha256: input.sha256 },
        observed: null,
        status: "fail",
        reason: cleanMessage(error, roots),
      });
    }
  }
  return results;
}

async function recomputeUnit({ unit, entry, dataRoot, repoRoot, workRoot }) {
  const roots = [[dataRoot, "{dataRoot}"], [repoRoot, "{repoRoot}"], [workRoot, "{workRoot}"]];
  const base = {
    id: unit.id,
    drawPosition: entry.drawPosition,
    score: entry.score,
    publishedFigure: unit.publishedFigure,
    recomputation: { runnerPath: unit.recomputation.runnerPath, runnerSha256: unit.recomputation.runnerSha256 },
  };
  let runner;
  try {
    runner = await inspectBoundFile(repoRoot, unit.recomputation.runnerPath, { sha256: unit.recomputation.runnerSha256 });
  } catch (error) {
    return { ...base, rawArchiveInputs: [], runner: { exitCode: null, signal: null }, output: { expected: { byteLength: unit.publishedFigure.byteLength, sha256: unit.publishedFigure.sha256 }, observed: null }, status: "fail", reason: cleanMessage(error, roots) };
  }

  const rawArchiveInputs = await recordInputChecks(unit, dataRoot, roots);
  if (rawArchiveInputs.some((input) => input.status === "fail")) {
    return { ...base, rawArchiveInputs, runner: { exitCode: null, signal: null }, output: { expected: { byteLength: unit.publishedFigure.byteLength, sha256: unit.publishedFigure.sha256 }, observed: null }, status: "fail", reason: "At least one raw archive input failed its bound byte-length or SHA-256 check." };
  }

  const unitRoot = path.join(workRoot, `${String(entry.drawPosition).padStart(4, "0")}-${unit.id}`);
  await mkdir(unitRoot, { mode: 0o700 });
  const outputPath = path.join(unitRoot, "recomputed-output");
  const args = unit.recomputation.args.map((arg) => arg === DATA_ROOT_TOKEN ? dataRoot : arg === OUTPUT_TOKEN ? outputPath : arg);
  const execution = spawnSync(process.execPath, [runner.target, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, WITNESS_TREE_DATA_ROOT: dataRoot },
    maxBuffer: 4 * 1024 * 1024,
    timeout: RUN_TIMEOUT_MS,
  });
  const runnerResult = { exitCode: execution.status, signal: execution.signal ?? null };
  if (execution.error || execution.status !== 0) {
    const detail = execution.error?.message ?? execution.stderr?.trim() ?? `exit ${String(execution.status)}`;
    return { ...base, rawArchiveInputs, runner: runnerResult, output: { expected: { byteLength: unit.publishedFigure.byteLength, sha256: unit.publishedFigure.sha256 }, observed: null }, status: "fail", reason: cleanMessage(`Recomputation runner failed: ${detail}`, roots) };
  }

  try {
    const { observed } = await inspectBoundFile(unitRoot, "recomputed-output", { byteLength: unit.publishedFigure.byteLength, sha256: unit.publishedFigure.sha256 });
    return { ...base, rawArchiveInputs, runner: runnerResult, output: { expected: { byteLength: unit.publishedFigure.byteLength, sha256: unit.publishedFigure.sha256 }, observed }, status: "pass" };
  } catch (error) {
    let observed = null;
    try {
      observed = (await inspectBoundFile(unitRoot, "recomputed-output")).observed;
    } catch {
      // Absence is recorded as null. It is never rewritten as a zero-byte result.
    }
    return { ...base, rawArchiveInputs, runner: runnerResult, output: { expected: { byteLength: unit.publishedFigure.byteLength, sha256: unit.publishedFigure.sha256 }, observed }, status: "fail", reason: cleanMessage(error, roots) };
  }
}

export function validateQuarterlyReproducibilityResult(record, population, populationBytes) {
  if (!isObject(record) || record.schemaVersion !== RESULT_SCHEMA) fail(`Result record must use ${RESULT_SCHEMA}.`);
  if (record.status !== "passed" && record.status !== "failed") fail("Result status must be passed or failed.");
  requiredUtc(record.startedAt, "Result startedAt");
  requiredUtc(record.completedAt, "Result completedAt");
  if (Date.parse(record.completedAt) < Date.parse(record.startedAt)) fail("Result cannot complete before it starts.");
  requiredSeed(record.seed);
  if (record.drawAlgorithm !== DRAW_ALGORITHM) fail(`Result draw algorithm must be ${DRAW_ALGORITHM}.`);
  if (!isObject(record.population) || record.population.id !== population.populationId || record.population.quarter !== population.quarter || record.population.class !== population.populationClass || record.population.unitCount !== population.units.length) fail("Result population binding does not match the manifest.");
  requiredSha256(record.population.manifestSha256, "Population manifest SHA-256");
  if (!(typeof populationBytes === "string" || Buffer.isBuffer(populationBytes))) fail("Population manifest bytes are required to validate a result.");
  const manifestSha256 = createHash("sha256").update(populationBytes).digest("hex");
  if (record.population.manifestSha256 !== manifestSha256) fail("Result population manifest SHA-256 does not match the supplied manifest bytes.");
  if (!Number.isSafeInteger(record.sampleSize) || record.sampleSize <= 0) fail("Result sample size must be positive.");
  const expectedDraw = drawQuarterlySample(population, record.seed, record.sampleSize);
  if (JSON.stringify(record.draw) !== JSON.stringify(expectedDraw)) fail("Result draw does not match the seeded population draw.");
  if (!Array.isArray(record.units) || record.units.length !== expectedDraw.length) fail("Result must carry one outcome per sampled unit.");
  const populationById = new Map(population.units.map((unit) => [unit.id, unit]));
  let allPassed = true;
  for (let index = 0; index < record.units.length; index += 1) {
    const outcome = record.units[index];
    const drawn = expectedDraw[index];
    const source = populationById.get(drawn.id);
    if (!isObject(outcome) || outcome.id !== drawn.id || outcome.drawPosition !== drawn.drawPosition || outcome.score !== drawn.score) fail("Per-unit outcome does not match the draw.");
    if (outcome.status !== "pass" && outcome.status !== "fail") fail(`${drawn.id} outcome must pass or fail.`);
    if (outcome.publishedFigure?.sha256 !== source.publishedFigure.sha256 || outcome.publishedFigure?.byteLength !== source.publishedFigure.byteLength || outcome.publishedFigure?.publicUrl !== source.publishedFigure.publicUrl || outcome.publishedFigure?.methodVersion !== source.publishedFigure.methodVersion) fail(`${drawn.id} outcome changed the published figure binding.`);
    if (outcome.recomputation?.runnerPath !== source.recomputation.runnerPath || outcome.recomputation?.runnerSha256 !== source.recomputation.runnerSha256) fail(`${drawn.id} outcome changed the recomputation binding.`);
    const inputPass = Array.isArray(outcome.rawArchiveInputs) && outcome.rawArchiveInputs.length === source.rawArchiveInputs.length && outcome.rawArchiveInputs.every((input, inputIndex) => {
      const binding = source.rawArchiveInputs[inputIndex];
      return input.archiveKey === binding.archiveKey
        && input.versionId === binding.versionId
        && input.relativePath === binding.relativePath
        && input.expected?.byteLength === binding.byteLength
        && input.expected?.sha256 === binding.sha256
        && input.status === "pass"
        && input.observed?.byteLength === binding.byteLength
        && input.observed?.sha256 === binding.sha256;
    });
    const outputPass = outcome.output?.expected?.byteLength === source.publishedFigure.byteLength
      && outcome.output?.expected?.sha256 === source.publishedFigure.sha256
      && outcome.output?.observed?.byteLength === source.publishedFigure.byteLength
      && outcome.output?.observed?.sha256 === source.publishedFigure.sha256;
    const computedPass = inputPass && outcome.runner?.exitCode === 0 && outcome.runner?.signal === null && outputPass;
    if ((outcome.status === "pass") !== computedPass) fail(`${drawn.id} outcome status does not equal its observed checks.`);
    if (outcome.status === "fail") {
      allPassed = false;
      requiredText(outcome.reason, `${drawn.id} failure reason`);
    }
  }
  if (record.temporaryOutputsRemoved !== true) allPassed = false;
  if ((record.status === "passed") !== allPassed) fail("Top-level result status must equal the per-unit checks and temporary-output cleanup result.");
  return record;
}

export async function runQuarterlyReproducibility({ populationPath, dataRoot, seed, sampleSize, outputPath, repoRoot = REPO_ROOT, allowFixture = false, now = () => new Date().toISOString() }) {
  requiredText(populationPath, "Population manifest path");
  requiredText(dataRoot, "Data root");
  requiredSeed(seed);
  if (!Number.isSafeInteger(sampleSize) || sampleSize <= 0) fail("Sample size must be a positive integer.");

  const populationBytes = await readFile(populationPath);
  const population = validateQuarterlyPopulationManifest(JSON.parse(populationBytes), { allowFixture });
  const resolvedDataRoot = await realpath(path.resolve(dataRoot));
  const resolvedRepoRoot = await realpath(path.resolve(repoRoot));
  if (!(await stat(resolvedDataRoot)).isDirectory()) fail("Data root must be a directory.");
  if (!(await stat(resolvedRepoRoot)).isDirectory()) fail("Repository root must be a directory.");
  const draw = drawQuarterlySample(population, seed, sampleSize);
  const byId = new Map(population.units.map((unit) => [unit.id, unit]));
  const startedAt = now();
  requiredUtc(startedAt, "Run start time");
  const workRoot = await mkdtemp(path.join(tmpdir(), "witness-tree-quarterly-reproducibility-"));
  const units = [];
  let temporaryOutputsRemoved = false;
  let cleanupFailure;
  try {
    for (const entry of draw) units.push(await recomputeUnit({ unit: byId.get(entry.id), entry, dataRoot: resolvedDataRoot, repoRoot: resolvedRepoRoot, workRoot }));
  } finally {
    try {
      await rm(workRoot, { recursive: true });
      temporaryOutputsRemoved = true;
    } catch (error) {
      cleanupFailure = cleanMessage(error, [[workRoot, "{workRoot}"]]);
    }
  }
  const completedAt = now();
  requiredUtc(completedAt, "Run completion time");
  const passed = temporaryOutputsRemoved && units.every((unit) => unit.status === "pass");
  const record = {
    schemaVersion: RESULT_SCHEMA,
    status: passed ? "passed" : "failed",
    startedAt,
    completedAt,
    seed,
    drawAlgorithm: DRAW_ALGORITHM,
    population: {
      id: population.populationId,
      quarter: population.quarter,
      class: population.populationClass,
      unitCount: population.units.length,
      manifestSha256: createHash("sha256").update(populationBytes).digest("hex"),
    },
    sampleSize,
    draw,
    units,
    temporaryOutputsRemoved,
    ...(cleanupFailure ? { cleanupFailure } : {}),
  };
  validateQuarterlyReproducibilityResult(record, population, populationBytes);
  if (outputPath !== undefined) {
    requiredText(outputPath, "Result output path");
    await writeFile(path.resolve(outputPath), `${JSON.stringify(record, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  }
  return { population, record };
}

function usage() {
  return "Usage: node scripts/run-phase9-quarterly-reproducibility.mjs --population PATH --data-root PATH --seed 64_HEX --sample-size N --output PATH";
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") return { help: true };
    if (arg === "--allow-fixture") values.allowFixture = true;
    else if (["--population", "--data-root", "--seed", "--sample-size", "--output"].includes(arg)) {
      const value = argv[++index];
      if (value === undefined) fail(`${arg} requires a value.`);
      values[arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
    } else fail(`Unknown argument: ${arg}.`);
  }
  if (values.sampleSize !== undefined) values.sampleSize = Number(values.sampleSize);
  for (const name of ["population", "dataRoot", "seed", "sampleSize", "output"]) {
    if (values[name] === undefined) fail(`--${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} is required.`);
  }
  return values;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) console.log(usage());
    else {
      const { record } = await runQuarterlyReproducibility(options);
      console.log(`${record.status.toUpperCase()} Phase 9 quarterly reproducibility: ${record.units.filter((unit) => unit.status === "pass").length}/${record.sampleSize} sampled units matched their published figures; result written to ${options.output}.`);
      if (record.status !== "passed") process.exitCode = 1;
    }
  } catch (error) {
    console.error(`FAIL Phase 9 quarterly reproducibility: ${error.message}\n${usage()}`);
    process.exitCode = 1;
  }
}
