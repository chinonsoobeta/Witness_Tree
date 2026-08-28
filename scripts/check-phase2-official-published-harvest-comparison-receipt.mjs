#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateOfficialPublishedHarvestComparison } from "../lib/phase2/official-published-harvest-comparator.mjs";
import { verifyOfficialPublishedHarvestContract } from "./check-phase2-official-published-harvest-contract.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_RECEIPT = path.join(ROOT, "data", "phase2-official-published-harvest-comparison-receipt-2026-08-27.json");
const SHA256 = /^[a-f0-9]{64}$/;
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

function exactKeys(value, keys, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label} keys drifted`);
}

function validateBinding(binding, pathKey, label) {
  exactKeys(binding, [pathKey, "byteLength", "sha256"], label);
  assert(typeof binding[pathKey] === "string" && binding[pathKey] && !path.isAbsolute(binding[pathKey]) && !binding[pathKey].split(/[\\/]/).includes(".."), `${label} path is invalid`);
  assert(Number.isSafeInteger(binding.byteLength) && binding.byteLength > 0, `${label} byte length is invalid`);
  assert.match(binding.sha256, SHA256, `${label} SHA-256 is invalid`);
}

function verifyFile(filePath, binding, label) {
  const info = lstatSync(filePath);
  assert(info.isFile() && !info.isSymbolicLink(), `${label} must be a regular non-symlink file`);
  const bytes = readFileSync(filePath);
  assert.equal(bytes.length, binding.byteLength, `${label} byte length differs`);
  assert.equal(digest(bytes), binding.sha256, `${label} SHA-256 differs`);
  return bytes;
}

function repositoryFile(binding) {
  const resolved = path.resolve(ROOT, binding.repositoryPath);
  assert(resolved.startsWith(`${ROOT}${path.sep}`), "repository binding escapes the repository");
  return resolved;
}

function externalFile(root, binding) {
  const lexical = path.resolve(root, binding.relativePath);
  assert(lexical.startsWith(`${root}${path.sep}`), "external binding escapes the data root");
  const resolved = realpathSync(lexical);
  assert(resolved.startsWith(`${root}${path.sep}`), "external binding resolves outside the data root");
  return resolved;
}

export function validateOfficialPublishedHarvestReceipt(receipt) {
  exactKeys(receipt, ["claims", "contract", "dataRoot", "externalOutput", "externalProvenance", "methodBoundary", "publicArtifact", "recordedAt", "runner", "schemaVersion", "status", "summary", "trackId", "verification"], "receipt");
  assert.equal(receipt.schemaVersion, "witness-tree/phase2-official-published-harvest-comparison-receipt/1");
  assert.equal(receipt.status, "executed-validated-public-artifact-prepared");
  assert.equal(receipt.recordedAt, "2026-08-28T05:35:00.000Z");
  assert.equal(receipt.dataRoot, "Witness_Tree-data");
  assert.equal(receipt.trackId, "official-published-harvest-comparison-v1");
  validateBinding(receipt.contract, "repositoryPath", "contract");
  validateBinding(receipt.runner, "repositoryPath", "runner");
  validateBinding(receipt.externalOutput, "relativePath", "external output");
  validateBinding(receipt.externalProvenance, "relativePath", "external provenance");
  validateBinding(receipt.publicArtifact, "repositoryPath", "public artifact");
  assert.equal(receipt.publicArtifact.byteLength, receipt.externalOutput.byteLength);
  assert.equal(receipt.publicArtifact.sha256, receipt.externalOutput.sha256);
  assert.deepEqual(receipt.summary, { rows: 118, computedRoundedRows: 104, restrictedPendingRows: 14, strictNfdExactTotalsRemainingNull: 118, safeExactNfdReplacementRows: 0, preliminaryRows: 6, revisedRows: 13, agencyEstimatedRows: 7, restrictedNumericValuesPublished: 0 });
  exactKeys(receipt.methodBoundary, ["comparison", "formalGate", "reference", "restricted", "strictNfd"], "method boundary");
  assert.match(receipt.methodBoundary.reference, /50 hectare rounding half-width/i);
  assert.match(receipt.methodBoundary.restricted, /personal use only.*all rights reserved/i);
  assert.match(receipt.methodBoundary.strictNfd, /118 target values stay null/i);
  assert.match(receipt.methodBoundary.comparison, /non-like-for-like.*descriptive only/i);
  assert.match(receipt.methodBoundary.formalGate, /does not complete/i);
  assert.deepEqual(receipt.verification, { contractCheckerPassed: true, exactInputBindingsPassed: true, sourceParserPassed: true, comparisonValidatorPassed: true, restrictedValueLeakCheckPassed: true, externalOutputReadbackPassed: true, publicArtifactByteEqualityPassed: true });
  assert.deepEqual(receipt.claims, { comparisonComputed: true, publicArtifactPrepared: true, strictNfdRowsReplaced: false, likeForLike: false, causalAttribution: false, productAccuracy: false, equivalence: false, formalIndependentComparisonGateComplete: false, published: false, released: false, productionEligible: false });
  assert.equal(JSON.stringify(receipt).includes(String.fromCodePoint(0x2014)), false, "receipt must not contain an em dash");
  return receipt;
}

export function verifyOfficialPublishedHarvestReceipt({ receiptPath = DEFAULT_RECEIPT, verifyExternal = false, dataRoot = null } = {}) {
  const receipt = validateOfficialPublishedHarvestReceipt(JSON.parse(readFileSync(receiptPath, "utf8")));
  const contractBytes = verifyFile(repositoryFile(receipt.contract), receipt.contract, "contract");
  verifyFile(repositoryFile(receipt.runner), receipt.runner, "runner");
  const publicBytes = verifyFile(repositoryFile(receipt.publicArtifact), receipt.publicArtifact, "public artifact");
  const publicOutput = JSON.parse(publicBytes.toString("utf8"));
  assert.equal(publicOutput.schemaVersion, "witness-tree/phase2-official-published-harvest-comparison/1");
  assert.equal(publicOutput.trackId, receipt.trackId);
  assert.deepEqual(publicOutput.summary, { rows: 118, computedRoundedRows: 104, restrictedPendingRows: 14, strictNfdExactTotalsRemainingNull: 118, safeExactNfdReplacementRows: 0 });
  assert.deepEqual(publicOutput.claims, JSON.parse(contractBytes.toString("utf8")).claims);
  validateOfficialPublishedHarvestComparison(publicOutput.rows);
  const computed = publicOutput.rows.filter((row) => row.comparisonStatus === "computed-rounded-reference");
  const pending = publicOutput.rows.filter((row) => row.comparisonStatus === "pending-restricted-source");
  assert.equal(computed.length, 104);
  assert.equal(pending.length, 14);
  assert.equal(computed.filter((row) => row.referenceSourceFlags.preliminary).length, 6);
  assert.equal(computed.filter((row) => row.referenceSourceFlags.revised).length, 13);
  assert.equal(computed.filter((row) => row.referenceSourceFlags.agencyEstimated).length, 7);
  assert.equal(pending.some((row) => row.referenceHectaresNominal !== null || row.referenceSourceValueSquareKilometres !== null), false, "restricted numeric value leaked");
  verifyOfficialPublishedHarvestContract({ contractPath: repositoryFile(receipt.contract), verifyExternal, dataRoot });
  if (!verifyExternal) return { receipt, publicOutput, externalVerified: false };
  assert(typeof dataRoot === "string" && dataRoot, "data root is required for external verification");
  const root = realpathSync(path.resolve(dataRoot));
  const externalOutput = verifyFile(externalFile(root, receipt.externalOutput), receipt.externalOutput, "external output");
  assert.deepEqual(externalOutput, publicBytes, "public artifact differs from external output");
  const sidecar = JSON.parse(verifyFile(externalFile(root, receipt.externalProvenance), receipt.externalProvenance, "external provenance").toString("utf8"));
  exactKeys(sidecar, ["claims", "executedAt", "inputs", "output", "runner", "schemaVersion", "status", "summary"], "external provenance");
  assert.equal(sidecar.schemaVersion, "witness-tree/phase2-official-published-harvest-comparison-run/1");
  assert.equal(sidecar.status, "executed-validated");
  assert(Number.isFinite(Date.parse(sidecar.executedAt)), "sidecar execution time is invalid");
  assert(Date.parse(sidecar.executedAt) <= Date.parse(receipt.recordedAt), "receipt predates the bound execution");
  assert.equal(sidecar.runner.sha256, receipt.runner.sha256, "sidecar runner binding differs");
  assert.equal(sidecar.runner.byteLength, receipt.runner.byteLength, "sidecar runner byte length differs");
  const contract = JSON.parse(contractBytes.toString("utf8"));
  assert.equal(sidecar.inputs.contract.byteLength, receipt.contract.byteLength, "sidecar contract byte length differs");
  assert.equal(sidecar.inputs.contract.sha256, receipt.contract.sha256, "sidecar contract SHA-256 differs");
  const strictComparison = contract.witnessTreeInput.strictComparisonOutput;
  const statcanHtml = contract.referenceSources.find((source) => source.id === "statcan-table-2.10-2018").raw;
  assert.deepEqual(sidecar.inputs.strictComparison, { path: externalFile(root, strictComparison), byteLength: strictComparison.byteLength, sha256: strictComparison.sha256 }, "sidecar strict comparison binding differs");
  assert.deepEqual(sidecar.inputs.statcanHtml, { path: externalFile(root, statcanHtml), byteLength: statcanHtml.byteLength, sha256: statcanHtml.sha256 }, "sidecar Statistics Canada binding differs");
  assert.deepEqual(sidecar.output, { path: externalFile(root, receipt.externalOutput), byteLength: receipt.externalOutput.byteLength, sha256: receipt.externalOutput.sha256 }, "sidecar output binding differs");
  assert.deepEqual(sidecar.summary, publicOutput.summary, "sidecar summary differs");
  assert.deepEqual(sidecar.claims, publicOutput.claims, "sidecar claims differ");
  return { receipt, publicOutput, externalVerified: true };
}

function parseArguments(argv) {
  const options = { verifyExternal: false, dataRoot: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--verify-external") options.verifyExternal = true;
    else if (argv[index] === "--data-root") options.dataRoot = argv[++index] ?? null;
    else throw new Error(`unknown argument: ${argv[index]}`);
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = verifyOfficialPublishedHarvestReceipt(parseArguments(process.argv.slice(2)));
    console.log(`Phase 2 official published harvest comparison receipt passed${result.externalVerified ? " with exact external readback" : " structurally"}.`);
  } catch (error) {
    console.error(`Stopped: ${error.message}`);
    process.exitCode = 1;
  }
}
