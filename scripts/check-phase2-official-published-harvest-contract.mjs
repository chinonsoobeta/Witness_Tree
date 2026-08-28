#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CONTRACT = path.join(ROOT, "data", "phase2-official-published-harvest-contract.json");
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

function externalFile(dataRoot, binding) {
  const lexical = path.resolve(dataRoot, binding.relativePath);
  assert(lexical.startsWith(`${dataRoot}${path.sep}`), "external binding escapes the data root");
  const resolved = realpathSync(lexical);
  assert(resolved.startsWith(`${dataRoot}${path.sep}`), "external binding resolves outside the data root");
  return resolved;
}

export function validateOfficialPublishedHarvestContract(contract) {
  exactKeys(contract, ["claims", "outputContract", "purpose", "recordedAt", "referenceSources", "schemaVersion", "status", "strictNfdBoundary", "trackId", "witnessTreeInput"], "contract");
  assert.equal(contract.schemaVersion, "witness-tree/phase2-official-published-harvest-contract/1");
  assert.equal(contract.status, "approved-engineering-contract");
  assert.equal(contract.trackId, "official-published-harvest-comparison-v1");
  assert.equal(contract.recordedAt, "2026-08-27");
  assert.match(contract.purpose, /separate descriptive comparison.*not a replacement/i);

  exactKeys(contract.strictNfdBoundary, ["fallbackFromKnownSubtotalsForbidden", "mustRemainNull", "pendingExactRows", "profile", "recoveryAudit", "trackBMayModifyStrictTrack"], "strict NFD boundary");
  validateBinding(contract.strictNfdBoundary.profile, "repositoryPath", "strict NFD profile");
  validateBinding(contract.strictNfdBoundary.recoveryAudit, "repositoryPath", "NFD recovery audit");
  assert.deepEqual({
    pendingExactRows: contract.strictNfdBoundary.pendingExactRows,
    mustRemainNull: contract.strictNfdBoundary.mustRemainNull,
    fallbackFromKnownSubtotalsForbidden: contract.strictNfdBoundary.fallbackFromKnownSubtotalsForbidden,
    trackBMayModifyStrictTrack: contract.strictNfdBoundary.trackBMayModifyStrictTrack,
  }, { pendingExactRows: 118, mustRemainNull: true, fallbackFromKnownSubtotalsForbidden: true, trackBMayModifyStrictTrack: false });

  exactKeys(contract.witnessTreeInput, ["coverageRequirement", "join", "quantity", "receipt", "strictComparisonOutput"], "Witness Tree input");
  validateBinding(contract.witnessTreeInput.receipt, "repositoryPath", "fractional comparison receipt");
  validateBinding(contract.witnessTreeInput.strictComparisonOutput, "relativePath", "strict comparison output");
  assert.equal(contract.witnessTreeInput.quantity, "Witness Tree observed forest loss");
  assert.equal(contract.witnessTreeInput.coverageRequirement, "complete");
  assert.equal(contract.witnessTreeInput.join, "province and toYear");

  assert(Array.isArray(contract.referenceSources) && contract.referenceSources.length === 2, "two reference sources are required");
  const [statcan, restricted] = contract.referenceSources;
  exactKeys(statcan, ["attribution", "derivedDisplayUnit", "displayPrecisionHectares", "endYear", "id", "licence", "provinces", "publicationStatus", "publishedUnit", "publisher", "raw", "roundingHalfWidthHectares", "rowCount", "scope", "sourceFlagCounts", "sourceUrl", "startYear", "title"], "StatCan source");
  validateBinding(statcan.raw, "relativePath", "StatCan raw source");
  assert.deepEqual({ id: statcan.id, provinces: statcan.provinces, startYear: statcan.startYear, endYear: statcan.endYear, rowCount: statcan.rowCount, displayPrecisionHectares: statcan.displayPrecisionHectares, roundingHalfWidthHectares: statcan.roundingHalfWidthHectares, publicationStatus: statcan.publicationStatus }, {
    id: "statcan-table-2.10-2018", provinces: ["BC", "AB", "ON", "QC"], startYear: 1990, endYear: 2015, rowCount: 104, displayPrecisionHectares: 100, roundingHalfWidthHectares: 50, publicationStatus: "publishable",
  });
  assert.deepEqual(statcan.sourceFlagCounts, { preliminary: 6, revised: 13, agencyEstimated: 7, unflagged: 78 });
  assert.match(statcan.attribution, /Adapted from Statistics Canada.*does not constitute an endorsement/i);

  exactKeys(restricted, ["id", "licence", "provincesAndYears", "publicationStatus", "publisher", "rowCount", "scope", "sourceUrl", "title", "withholdReason"], "restricted source");
  assert.deepEqual({ id: restricted.id, rowCount: restricted.rowCount, publicationStatus: restricted.publicationStatus }, { id: "nrcan-forest-statistical-profile-f1e8c437", rowCount: 14, publicationStatus: "withheld" });
  assert.match(restricted.licence, /personal use only.*all rights reserved/i);
  assert.match(restricted.withholdReason, /must not enter the public artifact/i);

  assert.deepEqual(contract.outputContract, {
    rowCount: 118,
    statcanRoundedRows: 104,
    restrictedPendingRows: 14,
    safeExactNfdReplacementRows: 0,
    nfdExactTotalsRemainNull: 118,
    computedStatus: "computed-rounded-reference",
    pendingStatus: "pending-restricted-source",
    differenceType: "nominal descriptive difference from a rounded reference",
    uncertaintyTreatment: "Every computed row carries the 50 hectare rounding half-width. The nominal difference and relative difference are not promoted to exact observations.",
    publicationTarget: "bilingual public technical preview after exact receipt and deployment",
  });
  assert.deepEqual(contract.claims, { likeForLike: false, causalAttribution: false, productAccuracy: false, equivalence: false, strictNfdRowsReplaced: false, formalIndependentComparisonGateComplete: false, published: false, released: false, productionEligible: false });
  assert.equal(JSON.stringify(contract).includes(String.fromCodePoint(0x2014)), false, "contract must not contain an em dash");
  return contract;
}

export function verifyOfficialPublishedHarvestContract({ contractPath = DEFAULT_CONTRACT, verifyExternal = false, dataRoot = null } = {}) {
  const contract = validateOfficialPublishedHarvestContract(JSON.parse(readFileSync(contractPath, "utf8")));
  const profile = JSON.parse(verifyFile(repositoryFile(contract.strictNfdBoundary.profile), contract.strictNfdBoundary.profile, "strict NFD profile"));
  const recovery = JSON.parse(verifyFile(repositoryFile(contract.strictNfdBoundary.recoveryAudit), contract.strictNfdBoundary.recoveryAudit, "NFD recovery audit"));
  const receipt = JSON.parse(verifyFile(repositoryFile(contract.witnessTreeInput.receipt), contract.witnessTreeInput.receipt, "fractional comparison receipt"));
  assert.equal(profile.frame.rows.filter((row) => row.areaHectares === null).length, 118, "strict NFD pending count differs");
  assert.equal(recovery.summary.safeExactReplacementRows, 0, "recovery audit exact replacement count differs");
  assert.equal(recovery.summary.remainingPendingRows, 118, "recovery audit pending count differs");
  assert.deepEqual(receipt.comparisonOutput, contract.witnessTreeInput.strictComparisonOutput, "strict comparison output binding differs from its receipt");
  if (!verifyExternal) return { contract, externalVerified: false };
  assert(typeof dataRoot === "string" && dataRoot, "data root is required for external verification");
  const root = realpathSync(path.resolve(dataRoot));
  assert(lstatSync(root).isDirectory(), "data root must be a directory");
  const html = verifyFile(externalFile(root, contract.referenceSources[0].raw), contract.referenceSources[0].raw, "StatCan raw source").toString("utf8");
  assert.match(html, /As of 1990, figures include provincial and private lands and federal land\./);
  assert.match(html, /square kilometers/);
  verifyFile(externalFile(root, contract.witnessTreeInput.strictComparisonOutput), contract.witnessTreeInput.strictComparisonOutput, "strict comparison output");
  return { contract, externalVerified: true };
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
    const result = verifyOfficialPublishedHarvestContract(parseArguments(process.argv.slice(2)));
    console.log(`Phase 2 official published harvest contract passed${result.externalVerified ? " with exact external readback" : " structurally"}.`);
  } catch (error) {
    console.error(`Stopped: ${error.message}`);
    process.exitCode = 1;
  }
}
