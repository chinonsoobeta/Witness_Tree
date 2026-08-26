import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  validateComponentInventoryEvidence,
  validatePinnedFiles,
} from "../scripts/check-phase2-real-loss-component-inventory-evidence.mjs";

const SUMMARY_SHA256 = "0296e433ca9fcca89c5ca64ad63b96b8ae39be8880372711d5fefa9c852d14c0";
const evidenceBytes = await readFile(new URL("../data/phase2-real-loss-component-inventory-readback.json", import.meta.url));
const sourceMapBytes = await readFile(new URL("../data/phase2-real-loss-source-map.json", import.meta.url));
const summaryBytes = await readFile(new URL("../data/phase2-real-loss-component-inventory-summary.json", import.meta.url));
const evidence = JSON.parse(evidenceBytes);
const sourceMap = JSON.parse(sourceMapBytes);
const summary = JSON.parse(summaryBytes);
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

test("portable summary is independently pinned by a test-owned digest", () => {
  assert.equal(sha256(summaryBytes), SUMMARY_SHA256);
  validatePinnedFiles(evidenceBytes, sourceMapBytes, summary);
  const result = validateComponentInventoryEvidence(
    structuredClone(evidence), structuredClone(sourceMap), structuredClone(summary),
  );
  assert.equal(result.completedPairCount, 38);
  assert.equal(result.productionEligible, false);
});

test("evidence, source-map, and exact summary drift fail closed", () => {
  const changedEvidence = structuredClone(evidence);
  changedEvidence.pairs[0].inventory.lossCellCount++;
  assert.throws(() => validateComponentInventoryEvidence(changedEvidence, structuredClone(sourceMap), structuredClone(summary)));
  const changedMap = structuredClone(sourceMap);
  changedMap.pairs[0][2] = "f".repeat(64);
  assert.throws(() => validateComponentInventoryEvidence(structuredClone(evidence), changedMap, structuredClone(summary)));
  const changedSummary = structuredClone(summary);
  changedSummary.completedPairCount = 37;
  assert.throws(() => validateComponentInventoryEvidence(structuredClone(evidence), structuredClone(sourceMap), changedSummary));
});

test("coordinated evidence and summary drift still breaks the independent pin", () => {
  const changedEvidence = structuredClone(evidence);
  changedEvidence.readbackAtUtc = "2099-01-01T00:00:00Z";
  const changedBytes = Buffer.from(`${JSON.stringify(changedEvidence, null, 2)}\n`);
  const changedSummary = structuredClone(summary);
  changedSummary.evidence.byteLength = changedBytes.byteLength;
  changedSummary.evidence.sha256 = sha256(changedBytes);
  validatePinnedFiles(changedBytes, sourceMapBytes, changedSummary);
  validateComponentInventoryEvidence(changedEvidence, structuredClone(sourceMap), changedSummary);
  const changedSummaryBytes = Buffer.from(`${JSON.stringify(changedSummary, null, 2)}\n`);
  assert.notEqual(sha256(changedSummaryBytes), SUMMARY_SHA256);
});
