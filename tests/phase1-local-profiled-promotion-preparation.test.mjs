import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateLocalProfiledPromotionPreparation } from "../scripts/prepare-phase1-local-profiled-immutable-promotion.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const plan = read("../data/phase1-local-profiled-promotion-preparation.json");
const staged = read("../data/staged-acquisitions.json");
const ledger = read("../data/phase1-production-source-ledger.json");

test("one dry-run preparation binds the remaining national local-profiled rows to one shared artifact", () => {
  assert.equal(validateLocalProfiledPromotionPreparation(plan, staged, ledger), plan);
  assert.equal(plan.artifacts.length, 1);
  assert.deepEqual(plan.artifacts.at(-1).productionRowIds, ["fed-2023-ridings", "elections-canada-45th-files"]);
  assert.deepEqual([...plan.plannedProductionRowIds].sort(), ["elections-canada-45th-files", "fed-2023-ridings"]);
});

test("preparation rejects missing local rows, mutable aliases, invented archive claims, and duplicated uploads", () => {
  const missing = structuredClone(plan); missing.artifacts.pop();
  assert.throws(() => validateLocalProfiledPromotionPreparation(missing, staged, ledger));
  const alias = structuredClone(plan); alias.artifacts[0].archiveKeyVersion = "latest";
  assert.throws(() => validateLocalProfiledPromotionPreparation(alias, staged, ledger));
  const drift = structuredClone(plan); drift.artifacts[0].sha256 = "0".repeat(64);
  assert.throws(() => validateLocalProfiledPromotionPreparation(drift, staged, ledger));
  const claimed = structuredClone(plan); claimed.claims.retentionApplied = true;
  assert.throws(() => validateLocalProfiledPromotionPreparation(claimed, staged, ledger));
  const duplicate = structuredClone(plan); duplicate.artifacts.push(structuredClone(plan.artifacts[0]));
  assert.throws(() => validateLocalProfiledPromotionPreparation(duplicate, staged, ledger));
  const unprofiled = structuredClone(plan); unprofiled.plannedProductionRowIds.push("ntems-annual-land-cover");
  assert.throws(() => validateLocalProfiledPromotionPreparation(unprofiled, staged, ledger));
});
