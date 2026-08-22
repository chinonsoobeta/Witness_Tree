import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { validateComponentInventoryEvidence } from "../scripts/check-phase2-real-loss-component-inventory-evidence.mjs";

const evidence = JSON.parse(await readFile(new URL("../data/phase2-real-loss-component-inventory-readback.json", import.meta.url), "utf8"));
const sourceMap = JSON.parse(await readFile(new URL("../data/phase2-real-loss-source-map.json", import.meta.url), "utf8"));

test("exact 38-pair inventory evidence is checksum pinned and non-production", () => {
  const result = validateComponentInventoryEvidence(structuredClone(evidence), structuredClone(sourceMap));
  assert.equal(result.completedPairCount, 38);
  assert.equal(result.productionEligible, false);
});

test("evidence and source-map drift fail closed", () => {
  const changedEvidence = structuredClone(evidence);
  changedEvidence.pairs[0].inventory.lossCellCount++;
  assert.throws(() => validateComponentInventoryEvidence(changedEvidence, structuredClone(sourceMap)));
  const changedMap = structuredClone(sourceMap);
  changedMap.pairs[0][2] = "f".repeat(64);
  assert.throws(() => validateComponentInventoryEvidence(structuredClone(evidence), changedMap));
});
