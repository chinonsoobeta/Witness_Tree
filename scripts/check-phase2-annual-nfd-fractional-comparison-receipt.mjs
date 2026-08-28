#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertProvisionalAnnualNfdComparison } from "../lib/phase2/annual-nfd-comparator.mjs";
import { verify as verifyFractionalOutput } from "./check-phase2-annual-zonal-fractional-correction.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_RECEIPT = path.join(ROOT, "data", "phase2-annual-nfd-fractional-comparison-receipt-2026-08-27.json");
const SHA256 = /^[a-f0-9]{64}$/;
const PROVINCES = ["BC", "AB", "ON", "QC"];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function exactKeys(value, keys, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label} keys drifted`);
}

function regularDescriptor(filePath, label) {
  const info = lstatSync(filePath);
  assert(info.isFile() && !info.isSymbolicLink(), `${label} must be a regular non-symlink file`);
  const bytes = readFileSync(filePath);
  return { bytes, byteLength: info.size, sha256: sha256(bytes) };
}

function validateBinding(value, label, pathField) {
  exactKeys(value, [pathField, "byteLength", "sha256"], label);
  assert.equal(typeof value[pathField], "string", `${label}.${pathField} must be a path`);
  assert(value[pathField] && !path.isAbsolute(value[pathField]) && !value[pathField].split(/[\\/]/).includes(".."), `${label}.${pathField} must be relative and traversal-free`);
  assert(Number.isSafeInteger(value.byteLength) && value.byteLength > 0, `${label}.byteLength must be positive`);
  assert.match(value.sha256, SHA256, `${label}.sha256 must be a lowercase SHA-256`);
}

export function validateReceipt(receipt) {
  exactKeys(receipt, ["annualZonalOutput", "annualZonalProvenance", "claims", "comparisonOutput", "comparisonProvenance", "dataRoot", "fractionalCorrection", "methodBoundary", "nfdProfile", "notice", "recordedAt", "rows", "schemaVersion", "status", "verification"], "receipt");
  assert.equal(receipt.schemaVersion, "witness-tree/phase2-annual-nfd-fractional-comparison-receipt/1");
  assert.equal(receipt.status, "executed-validated-provisional-nonproduction");
  assert.equal(receipt.recordedAt, "2026-08-27");
  assert.equal(receipt.dataRoot, "Witness_Tree-data");
  validateBinding(receipt.annualZonalOutput, "annualZonalOutput", "relativePath");
  exactKeys(receipt.annualZonalProvenance, ["byteLength", "checkpointRunBindingSha256", "completedAt", "elapsedSeconds", "relativePath", "sha256", "workerSha256"], "annualZonalProvenance");
  assert(receipt.annualZonalProvenance.relativePath && !path.isAbsolute(receipt.annualZonalProvenance.relativePath) && !receipt.annualZonalProvenance.relativePath.split(/[\\/]/).includes(".."));
  assert(Number.isSafeInteger(receipt.annualZonalProvenance.byteLength) && receipt.annualZonalProvenance.byteLength > 0);
  for (const key of ["sha256", "workerSha256", "checkpointRunBindingSha256"]) assert.match(receipt.annualZonalProvenance[key], SHA256);
  assert.match(receipt.annualZonalProvenance.completedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/);
  assert(typeof receipt.annualZonalProvenance.elapsedSeconds === "number" && receipt.annualZonalProvenance.elapsedSeconds > 0);
  validateBinding(receipt.nfdProfile, "nfdProfile", "repositoryPath");
  validateBinding(receipt.comparisonOutput, "comparisonOutput", "relativePath");
  validateBinding(receipt.comparisonProvenance, "comparisonProvenance", "relativePath");
  assert.deepEqual(receipt.rows, {
    annualZonalStructuralRows: 156,
    baselineSnapshotsExcludedFromComparison: 4,
    comparisonRows: 152,
    computedRows: 34,
    pendingRows: 118,
    firstToYear: 1985,
    lastToYear: 2022,
    provinces: PROVINCES,
  });
  assert.equal(receipt.rows.computedRows + receipt.rows.pendingRows, receipt.rows.comparisonRows);
  assert.deepEqual(receipt.fractionalCorrection, {
    tileSize: 1024,
    workers: 10,
    processedWindowCount: 1247,
    candidateCellCount: 5113929,
    fractionalCellCount: 5113667,
    changedCellCount: 1390497,
  });
  exactKeys(receipt.methodBoundary, ["boundaryAreaMethod", "formalScheduleMismatch", "join", "quantityRelationship", "unknownPolicy"], "methodBoundary");
  for (const value of Object.values(receipt.methodBoundary)) assert(typeof value === "string" && value.length >= 40);
  assert.match(receipt.methodBoundary.quantityRelationship, /non-like-for-like/i);
  assert.match(receipt.methodBoundary.boundaryAreaMethod, /exact polygon-cell intersection/i);
  assert.match(receipt.methodBoundary.formalScheduleMismatch, /not relabelled/i);
  assert.deepEqual(receipt.verification, {
    fractionalOutputCheckerPassed: true,
    checkpointReadbackPassed: true,
    comparisonValidatorPassed: true,
    exactOutputReadbackPassed: true,
  });
  assert.deepEqual(receipt.claims, {
    comparisonComputed: true,
    fractionalCorrectionComputed: true,
    provisional: true,
    likeForLike: false,
    causalAttribution: false,
    productAccuracy: false,
    formalIndependentComparisonGateComplete: false,
    published: false,
    admitted: false,
    released: false,
    productionEligible: false,
  });
  assert.match(receipt.notice, /not formal comparison-gate completion.*publication.*production/i);
  return receipt;
}

function verifyBinding(filePath, binding, label) {
  const actual = regularDescriptor(filePath, label);
  assert.equal(actual.byteLength, binding.byteLength, `${label} byte length differs`);
  assert.equal(actual.sha256, binding.sha256, `${label} SHA-256 differs`);
  return actual.bytes;
}

function externalPath(root, binding) {
  const resolved = path.resolve(root, binding.relativePath);
  assert(resolved.startsWith(`${root}${path.sep}`), "external binding escapes the data root");
  return resolved;
}

export function verifyReceipt({ receiptPath = DEFAULT_RECEIPT, dataRoot = null, verifyExternal = false } = {}) {
  const receipt = validateReceipt(JSON.parse(regularDescriptor(receiptPath, "receipt").bytes.toString("utf8")));
  const profilePath = path.resolve(ROOT, receipt.nfdProfile.repositoryPath);
  assert(profilePath.startsWith(`${ROOT}${path.sep}`), "NFD profile escapes the repository");
  verifyBinding(profilePath, receipt.nfdProfile, "NFD profile");
  if (!verifyExternal) return { receipt, externalVerified: false };
  assert.equal(typeof dataRoot, "string", "--data-root is required with --verify-external");
  const root = path.resolve(dataRoot);
  const rootInfo = lstatSync(root);
  assert(rootInfo.isDirectory() && !rootInfo.isSymbolicLink(), "data root must be a real directory");
  const annualOutputPath = externalPath(root, receipt.annualZonalOutput);
  const annualSidecarPath = externalPath(root, receipt.annualZonalProvenance);
  const comparisonOutputPath = externalPath(root, receipt.comparisonOutput);
  const comparisonSidecarPath = externalPath(root, receipt.comparisonProvenance);
  verifyBinding(annualOutputPath, receipt.annualZonalOutput, "fractional annual output");
  const annualSidecar = JSON.parse(verifyBinding(annualSidecarPath, receipt.annualZonalProvenance, "fractional annual provenance").toString("utf8"));
  const annualCheck = verifyFractionalOutput({ outputPath: annualOutputPath, sidecarPath: annualSidecarPath });
  assert.equal(annualCheck.rows.total, receipt.rows.annualZonalStructuralRows);
  assert.equal(annualSidecar.execution.workerSha256, receipt.annualZonalProvenance.workerSha256);
  assert.equal(annualSidecar.execution.checkpoint.runBindingSha256, receipt.annualZonalProvenance.checkpointRunBindingSha256);
  assert.equal(annualSidecar.execution.completedAt, receipt.annualZonalProvenance.completedAt);
  assert.equal(annualSidecar.execution.elapsedSeconds, receipt.annualZonalProvenance.elapsedSeconds);
  for (const [key, value] of Object.entries(receipt.fractionalCorrection)) {
    const actual = key === "tileSize" || key === "workers" ? annualSidecar.execution.parameters[key]
      : key === "processedWindowCount" ? annualSidecar.execution.processedWindowCount
        : annualSidecar.correction[key];
    assert.equal(actual, value, `fractional correction ${key} differs`);
  }
  const comparisonBytes = verifyBinding(comparisonOutputPath, receipt.comparisonOutput, "fractional comparison output");
  const comparisonSidecar = JSON.parse(verifyBinding(comparisonSidecarPath, receipt.comparisonProvenance, "fractional comparison provenance").toString("utf8"));
  const rows = JSON.parse(comparisonBytes.toString("utf8"));
  assertProvisionalAnnualNfdComparison(rows);
  assert.equal(rows.length, receipt.rows.comparisonRows);
  assert.equal(rows.filter((row) => row.comparisonStatus === "computed").length, receipt.rows.computedRows);
  assert.equal(rows.filter((row) => row.comparisonStatus === "pending").length, receipt.rows.pendingRows);
  assert.deepEqual(comparisonSidecar.inputs.annualOutput, { path: annualOutputPath, byteLength: receipt.annualZonalOutput.byteLength, sha256: receipt.annualZonalOutput.sha256 });
  assert.equal(comparisonSidecar.output.byteLength, receipt.comparisonOutput.byteLength);
  assert.equal(comparisonSidecar.output.sha256, receipt.comparisonOutput.sha256);
  assert.equal(comparisonSidecar.claims.likeForLikeClaim, false);
  assert.equal(comparisonSidecar.claims.productionEligible, false);
  return { receipt, externalVerified: true, annualCheck, comparisonRows: rows.length };
}

function parseArguments(argv) {
  const result = { receiptPath: DEFAULT_RECEIPT, dataRoot: null, verifyExternal: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--verify-external") result.verifyExternal = true;
    else if (argv[index] === "--receipt") result.receiptPath = path.resolve(argv[++index] ?? "");
    else if (argv[index] === "--data-root") result.dataRoot = path.resolve(argv[++index] ?? "");
    else throw new Error(`unknown argument: ${argv[index]}`);
  }
  if (result.verifyExternal && !result.dataRoot) throw new Error("--data-root is required with --verify-external");
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = verifyReceipt(parseArguments(process.argv.slice(2)));
    console.log(`Phase 2 fractional annual comparison receipt passed${result.externalVerified ? " with exact external readback" : " structurally"}.`);
  } catch (error) {
    console.error(`Stopped: ${error.message}`);
    process.exitCode = 1;
  }
}
