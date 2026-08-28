#!/usr/bin/env node

/**
 * Run the provisional annual-to-NFD join against two explicit local JSON
 * inputs. The runner creates one new rows file and one provenance sidecar.
 * Neither file is an admission, release, publication, or production record.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  constants,
  fchmodSync,
  fsyncSync,
  lstatSync,
  linkSync,
  openSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  COMPARATOR_BASELINE_YEAR,
  COMPARATOR_END_YEAR,
  COMPARATOR_ROW_COUNT,
  COMPARATOR_START_YEAR,
  PROVISIONAL_COMPARISON_LABEL,
  PROVISIONAL_COMPARISON_CLAIMS,
  assertProvisionalAnnualNfdComparison,
  compareAnnualZonalToNfd,
} from "../lib/phase2/annual-nfd-comparator.mjs";

const NO_FOLLOW = constants.O_NOFOLLOW ?? 0;
const OUTPUT_MODE = 0o644;
const CLAIMS = Object.freeze({
  provisional: true,
  nonLikeForLike: true,
  ...PROVISIONAL_COMPARISON_CLAIMS,
  admissionClaim: false,
  releaseClaim: false,
  publicationClaim: false,
});

function fail(message) {
  throw new Error(message);
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function requirePath(value, label) {
  if (typeof value !== "string" || !value.trim()) fail(`${label} is required`);
  return resolve(value);
}

function assertRegularFile(path, label) {
  let info;
  try {
    info = lstatSync(path);
  } catch (error) {
    if (error?.code === "ENOENT") fail(`${label} does not exist: ${path}`);
    throw error;
  }
  if (!info.isFile() || info.isSymbolicLink()) fail(`${label} must be a regular, non-symlink file: ${path}`);
}

function readJsonInput(path, label) {
  assertRegularFile(path, label);
  const bytes = readFileSync(path);
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
  return { path, bytes, value };
}

function assertDestination(path, label, inputPaths) {
  if (!isAbsolute(path)) fail(`${label} must resolve to an absolute path`);
  if (inputPaths.has(path)) fail(`${label} must not replace an input file`);
  let info;
  try {
    info = lstatSync(path);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (info) fail(`${label} already exists; refusing to overwrite: ${path}`);
  try {
    const parent = statSync(dirname(path));
    if (!parent.isDirectory()) fail(`${label} parent is not a directory: ${dirname(path)}`);
  } catch (error) {
    if (error?.code === "ENOENT") fail(`${label} parent directory does not exist: ${dirname(path)}`);
    throw error;
  }
}

function writeAll(fd, bytes) {
  let offset = 0;
  while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
}

/**
 * Publish one new file atomically without replacing an existing path.
 * A temporary file is fsynced, then hard-linked into place. The link step is
 * atomic and fails if another process created the destination first.
 */
export function atomicCreate(path, bytes, mode = OUTPUT_MODE) {
  if (!Buffer.isBuffer(bytes)) fail("atomicCreate requires a Buffer");
  const parent = dirname(path);
  const temporary = join(parent, `.${basename(path)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`);
  let fd = null;
  let linked = false;
  try {
    fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NO_FOLLOW, 0o600);
    fchmodSync(fd, mode);
    writeAll(fd, bytes);
    fsyncSync(fd);
    closeSync(fd);
    fd = null;
    linkSync(temporary, path);
    linked = true;
    unlinkSync(temporary);
    return { path, byteLength: bytes.length, sha256: digest(bytes) };
  } catch (error) {
    if (fd !== null) {
      try { closeSync(fd); } catch { /* preserve the original error */ }
    }
    try { unlinkSync(temporary); } catch { /* preserve the original error */ }
    if (linked) fail(`atomic create completed but cleanup failed for ${path}: ${error.message}`);
    if (error?.code === "EEXIST") fail(`refusing to overwrite an existing destination: ${path}`);
    throw error;
  }
}

function parseArguments(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") {
      return { help: true };
    }
    const names = {
      "--annual-output": "annualOutput",
      "--annual": "annualOutput",
      "--nfd-profile": "nfdProfile",
      "--profile": "nfdProfile",
      "--output": "output",
      "--sidecar": "sidecar",
    };
    const key = names[argument];
    if (!key) fail(`unknown argument ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail(`${argument} requires a path`);
    if (parsed[key] !== undefined) fail(`${argument} was provided more than once`);
    parsed[key] = value;
    index += 1;
  }
  for (const [key, label] of [["annualOutput", "--annual-output"], ["nfdProfile", "--nfd-profile"], ["output", "--output"], ["sidecar", "--sidecar"]]) {
    if (parsed[key] === undefined) fail(`${label} is required`);
  }
  return parsed;
}

function usage() {
  return [
    "Usage:",
    "  node scripts/run-phase2-annual-nfd-comparator.mjs \\",
    "    --annual-output <annual-output.json> \\",
    "    --nfd-profile <nfd-harvest-statistics-profile.json> \\",
    "    --output <new-comparison.json> \\",
    "    --sidecar <new-comparison.provenance.json>",
  ].join("\n");
}

function descriptor(input) {
  return { path: input.path, byteLength: input.bytes.length, sha256: digest(input.bytes) };
}

function buildProvenance({ annualInput, nfdInput, output, rows }) {
  const computedRowCount = rows.filter((row) => row.comparisonStatus === "computed").length;
  return {
    schemaVersion: "witness-tree/phase2-annual-nfd-provisional-comparison-run/1",
    status: "provisional-local-nonproduction",
    algorithm: "annual-zonal-to-nfd-by-toYear",
    claims: { ...CLAIMS },
    comparison: {
      classification: "non-like-for-like-descriptive-difference-only",
      label: PROVISIONAL_COMPARISON_LABEL,
      witnessTreeQuantity: "Witness Tree observed forest loss",
      nfdQuantity: "NFD reported harvest",
      joinKey: "province:toYear",
      baselineYear: COMPARATOR_BASELINE_YEAR,
      baselineRowsExcluded: 4,
      firstToYear: COMPARATOR_START_YEAR,
      lastToYear: COMPARATOR_END_YEAR,
      rowCount: rows.length,
      expectedRowCount: COMPARATOR_ROW_COUNT,
      computedRowCount,
      pendingRowCount: rows.length - computedRowCount,
    },
    inputs: {
      annualOutput: descriptor(annualInput),
      nfdProfile: descriptor(nfdInput),
    },
    output: output,
  };
}

/**
 * Read, compare, and create the rows file and provenance sidecar. Paths are
 * explicit and resolved relative to the caller's current directory.
 */
export function runAnnualNfdComparator({ annualOutput, nfdProfile, output, sidecar }) {
  const annualPath = requirePath(annualOutput, "annual output path");
  const nfdPath = requirePath(nfdProfile, "NFD profile path");
  const outputPath = requirePath(output, "output path");
  const sidecarPath = requirePath(sidecar, "sidecar path");
  const inputPaths = new Set([annualPath, nfdPath]);
  if (outputPath === sidecarPath) fail("output and sidecar must be different paths");
  assertDestination(outputPath, "output", inputPaths);
  assertDestination(sidecarPath, "sidecar", inputPaths);

  const annualInput = readJsonInput(annualPath, "annual output");
  const nfdInput = readJsonInput(nfdPath, "NFD profile");
  const rows = compareAnnualZonalToNfd(annualInput.value, nfdInput.value);
  assertProvisionalAnnualNfdComparison(rows);
  const outputBytes = Buffer.from(`${JSON.stringify(rows, null, 2)}\n`, "utf8");
  const outputDescriptor = { path: outputPath, byteLength: outputBytes.length, sha256: digest(outputBytes) };
  const provenance = buildProvenance({ annualInput, nfdInput, output: outputDescriptor, rows });
  const provenanceBytes = Buffer.from(`${JSON.stringify(provenance, null, 2)}\n`, "utf8");

  atomicCreate(outputPath, outputBytes);
  try {
    atomicCreate(sidecarPath, provenanceBytes);
  } catch (error) {
    // The output was created by this invocation and did not exist at preflight.
    // Remove that exact partial result so callers never observe half of the pair.
    try { unlinkSync(outputPath); } catch (cleanupError) {
      fail(`sidecar creation failed and partial-output cleanup also failed: ${error.message}; ${cleanupError.message}`);
    }
    throw error;
  }
  const writtenOutput = readFileSync(outputPath);
  if (writtenOutput.length !== outputDescriptor.byteLength || digest(writtenOutput) !== outputDescriptor.sha256) {
    fail("written comparison output does not match its bound byte length and SHA-256");
  }
  const writtenSidecar = readFileSync(sidecarPath);
  const sidecarDescriptor = { path: sidecarPath, byteLength: provenanceBytes.length, sha256: digest(provenanceBytes) };
  if (writtenSidecar.length !== sidecarDescriptor.byteLength || digest(writtenSidecar) !== sidecarDescriptor.sha256) {
    fail("written comparison sidecar does not match its expected byte length and SHA-256");
  }
  return { rows, output: outputDescriptor, sidecar: sidecarDescriptor };
}

export { buildProvenance, digest, parseArguments, usage };

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    const args = parseArguments(process.argv.slice(2));
    if (args.help) {
      console.log(usage());
    } else {
      const result = runAnnualNfdComparator(args);
      console.log(JSON.stringify({
        status: "provisional-local-nonproduction",
        rowCount: result.rows.length,
        output: result.output,
        sidecar: result.sidecar,
      }));
    }
  } catch (error) {
    console.error(`annual NFD comparator failed: ${error.message}`);
    process.exitCode = 1;
  }
}
