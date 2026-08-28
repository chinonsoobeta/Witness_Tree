#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertProvisionalAnnualNfdComparison } from "../lib/phase2/annual-nfd-comparator.mjs";
import { verify as verifyAnnualOutput } from "./check-phase2-annual-zonal-output.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_RECEIPT = path.join(ROOT, "data", "phase2-annual-nfd-provisional-comparison-receipt-2026-08-27.json");
const SHA256 = /^[a-f0-9]{64}$/;
const PROVINCES = ["BC", "AB", "ON", "QC"];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function regularFile(filePath, label) {
  const info = lstatSync(filePath);
  assert(info.isFile() && !info.isSymbolicLink(), `${label} must be a regular non-symlink file`);
  return info;
}

function descriptor(filePath, label) {
  const info = regularFile(filePath, label);
  const bytes = readFileSync(filePath);
  return { byteLength: info.size, sha256: sha256(bytes), bytes };
}

function validateBinding(value, label, pathField) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  assert.equal(typeof value[pathField], "string", `${label}.${pathField} must be a path`);
  assert(value[pathField].length > 0 && !path.isAbsolute(value[pathField]) && !value[pathField].split(/[\\/]/).includes(".."), `${label}.${pathField} must remain relative and traversal-free`);
  assert(Number.isSafeInteger(value.byteLength) && value.byteLength > 0, `${label}.byteLength must be a positive safe integer`);
  assert.match(value.sha256, SHA256, `${label}.sha256 must be a lowercase SHA-256`);
}

export function validateReceipt(receipt) {
  assert(receipt && typeof receipt === "object" && !Array.isArray(receipt), "receipt must be an object");
  assert.equal(receipt.schemaVersion, "witness-tree/phase2-annual-nfd-provisional-comparison-receipt/1");
  assert.equal(receipt.status, "executed-validated-provisional-nonproduction");
  assert.equal(receipt.recordedAt, "2026-08-27");
  assert.equal(receipt.dataRoot, "Witness_Tree-data");
  validateBinding(receipt.annualZonalOutput, "annualZonalOutput", "relativePath");
  validateBinding(receipt.annualZonalProvenance, "annualZonalProvenance", "relativePath");
  validateBinding(receipt.nfdProfile, "nfdProfile", "repositoryPath");
  validateBinding(receipt.comparisonOutput, "comparisonOutput", "relativePath");
  validateBinding(receipt.comparisonProvenance, "comparisonProvenance", "relativePath");
  assert.match(receipt.annualZonalProvenance.workerSha256, SHA256);
  assert.match(receipt.annualZonalProvenance.completedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/);
  assert.equal(typeof receipt.annualZonalProvenance.elapsedSeconds, "number");
  assert(receipt.annualZonalProvenance.elapsedSeconds > 0);
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
  for (const field of ["join", "quantityRelationship", "unknownPolicy", "boundaryAreaMethod", "formalScheduleMismatch"]) {
    assert.equal(typeof receipt.methodBoundary[field], "string");
    assert(receipt.methodBoundary[field].length >= 40);
  }
  assert.match(receipt.methodBoundary.quantityRelationship, /non-like-for-like/i);
  assert.match(receipt.methodBoundary.boundaryAreaMethod, /binary.*not.*fractional-area/i);
  assert.match(receipt.methodBoundary.formalScheduleMismatch, /not relabelled/i);
  assert.deepEqual(receipt.verification, {
    annualOutputCheckerPassed: true,
    comparisonValidatorPassed: true,
    exactOutputReadbackPassed: true,
  });
  assert.deepEqual(receipt.claims, {
    comparisonComputed: true,
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

function bindingPath(root, binding) {
  const resolved = path.resolve(root, binding.relativePath);
  assert(resolved.startsWith(`${path.resolve(root)}${path.sep}`), "external binding escapes the data root");
  return resolved;
}

function verifyBoundFile(filePath, binding, label) {
  const actual = descriptor(filePath, label);
  assert.equal(actual.byteLength, binding.byteLength, `${label} byte length differs`);
  assert.equal(actual.sha256, binding.sha256, `${label} SHA-256 differs`);
  return actual;
}

export function verifyReceipt({ receiptPath = DEFAULT_RECEIPT, dataRoot = null, verifyExternal = false } = {}) {
  const receiptBytes = descriptor(receiptPath, "receipt").bytes;
  const receipt = validateReceipt(JSON.parse(receiptBytes.toString("utf8")));
  const profilePath = path.resolve(ROOT, receipt.nfdProfile.repositoryPath);
  assert(profilePath.startsWith(`${ROOT}${path.sep}`), "NFD profile escapes the repository");
  verifyBoundFile(profilePath, receipt.nfdProfile, "NFD profile");
  if (!verifyExternal) return { receipt, externalVerified: false };
  assert.equal(typeof dataRoot, "string", "--data-root is required with --verify-external");
  const root = path.resolve(dataRoot);
  const rootInfo = lstatSync(root);
  assert(rootInfo.isDirectory() && !rootInfo.isSymbolicLink(), "data root must be a real directory, not a symlink");
  const annualOutputPath = bindingPath(root, receipt.annualZonalOutput);
  const annualSidecarPath = bindingPath(root, receipt.annualZonalProvenance);
  const comparisonOutputPath = bindingPath(root, receipt.comparisonOutput);
  const comparisonSidecarPath = bindingPath(root, receipt.comparisonProvenance);
  verifyBoundFile(annualOutputPath, receipt.annualZonalOutput, "annual zonal output");
  verifyBoundFile(annualSidecarPath, receipt.annualZonalProvenance, "annual zonal provenance");
  const annualCheck = verifyAnnualOutput({ outputPath: annualOutputPath, sidecarPath: annualSidecarPath });
  assert.equal(annualCheck.rows.total, receipt.rows.annualZonalStructuralRows);
  const comparisonBytes = verifyBoundFile(comparisonOutputPath, receipt.comparisonOutput, "comparison output").bytes;
  const comparisonSidecar = JSON.parse(verifyBoundFile(comparisonSidecarPath, receipt.comparisonProvenance, "comparison provenance").bytes.toString("utf8"));
  const comparisonRows = JSON.parse(comparisonBytes.toString("utf8"));
  assertProvisionalAnnualNfdComparison(comparisonRows);
  assert.equal(comparisonRows.length, receipt.rows.comparisonRows);
  assert.equal(comparisonRows.filter((row) => row.comparisonStatus === "computed").length, receipt.rows.computedRows);
  assert.equal(comparisonRows.filter((row) => row.comparisonStatus === "pending").length, receipt.rows.pendingRows);
  assert.equal(comparisonSidecar.output.byteLength, receipt.comparisonOutput.byteLength);
  assert.equal(comparisonSidecar.output.sha256, receipt.comparisonOutput.sha256);
  assert.equal(comparisonSidecar.claims.likeForLikeClaim, false);
  assert.equal(comparisonSidecar.claims.productionEligible, false);
  return { receipt, externalVerified: true, annualCheck, comparisonRows: comparisonRows.length };
}

function argumentsFrom(argv) {
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
    const result = verifyReceipt(argumentsFrom(process.argv.slice(2)));
    console.log(`Phase 2 provisional annual comparison receipt passed${result.externalVerified ? " with exact external readback" : " structurally"}.`);
  } catch (error) {
    console.error(`Stopped: ${error.message}`);
    process.exitCode = 1;
  }
}
