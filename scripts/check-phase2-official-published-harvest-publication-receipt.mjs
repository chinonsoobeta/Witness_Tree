#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RECEIPT = path.join(ROOT, "data", "phase2-official-published-harvest-publication-receipt-2026-08-27.json");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

function verifyRepositoryBinding(binding, label) {
  const resolved = path.resolve(ROOT, binding.repositoryPath);
  assert(resolved.startsWith(`${ROOT}${path.sep}`), `${label} escapes the repository`);
  const info = lstatSync(resolved);
  assert(info.isFile() && !info.isSymbolicLink(), `${label} must be a regular non-symlink file`);
  const bytes = readFileSync(resolved);
  assert.equal(bytes.length, binding.byteLength, `${label} byte length differs`);
  assert.equal(digest(bytes), binding.sha256, `${label} SHA-256 differs`);
  return JSON.parse(bytes.toString("utf8"));
}

export function validateOfficialPublishedHarvestPublicationReceipt(receipt) {
  assert.equal(receipt.schemaVersion, "witness-tree/phase2-official-published-harvest-publication-receipt/1");
  assert.equal(receipt.status, "published");
  assert.equal(receipt.publishedAt, "2026-08-28T05:45:21.353416Z");
  assert.deepEqual(receipt.source, {
    repository: "https://github.com/chinonsoobeta/Witness_Tree",
    branch: "main",
    commitSha: "2ff85ad357418a363ac26dbd1341c54dce7f3e76",
    pullRequest: "https://github.com/chinonsoobeta/Witness_Tree/pull/79",
  });
  assert.equal(receipt.site.versionNumber, 7);
  assert.equal(receipt.site.deploymentStatus, "succeeded");
  assert.equal(receipt.site.productionUrl, "https://witness-tree-canada.r7bv67rgkk.chatgpt.site");
  assert.match(receipt.site.englishRoute, /\/en\/data\/official-harvest-comparison$/);
  assert.match(receipt.site.frenchRoute, /\/fr\/donnees\/comparaison-recolte-officielle$/);
  assert.deepEqual(receipt.summary, { rows: 118, computedRoundedRows: 104, restrictedPendingRows: 14, strictNfdExactTotalsRemainingNull: 118, restrictedNumericValuesPublished: 0 });
  assert.deepEqual(receipt.claims, { publicPreviewAvailable: true, published: true, released: true, productionEligible: false, strictNfdRowsReplaced: false, likeForLike: false, causalAttribution: false, productAccuracy: false, formalIndependentComparisonGateComplete: false });
  assert.equal(JSON.stringify(receipt).includes(String.fromCodePoint(0x2014)), false, "receipt must not contain an em dash");
  return receipt;
}

export function checkOfficialPublishedHarvestPublicationReceipt(file = RECEIPT) {
  const receipt = validateOfficialPublishedHarvestPublicationReceipt(JSON.parse(readFileSync(file, "utf8")));
  const prepared = verifyRepositoryBinding(receipt.preparedReceipt, "prepared receipt");
  const artifact = verifyRepositoryBinding(receipt.publicArtifact, "public artifact");
  assert.equal(prepared.claims.published, false, "prepared receipt must predate publication");
  assert.equal(prepared.claims.released, false, "prepared receipt must predate release");
  assert.equal(artifact.rows.length, receipt.summary.rows);
  assert.equal(artifact.rows.filter((row) => row.comparisonStatus === "computed-rounded-reference").length, receipt.summary.computedRoundedRows);
  assert.equal(artifact.rows.filter((row) => row.comparisonStatus === "pending-restricted-source").length, receipt.summary.restrictedPendingRows);
  assert.equal(artifact.rows.every((row) => row.strictNfdExactTotalHectares === null), true);
  return receipt;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    checkOfficialPublishedHarvestPublicationReceipt();
    console.log("Phase 2 official published harvest publication receipt passed.");
  } catch (error) {
    console.error(`Stopped: ${error.message}`);
    process.exitCode = 1;
  }
}
