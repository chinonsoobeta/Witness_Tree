import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase1SourceInventory } from "../scripts/check-phase1-source-inventory.mjs";

const inventory = JSON.parse(readFileSync(new URL("../data/phase1-source-inventory.json", import.meta.url), "utf8"));

test("Phase 1 inventory represents every required plan category without asserting acquisition", () => {
  assert.equal(validatePhase1SourceInventory(inventory), inventory);
  assert.equal(inventory.entries.some((entry) => entry.planUse === "production"), true);
  assert.equal(inventory.entries.some((entry) => entry.planUse === "reference"), true);
  assert.equal(inventory.entries.some((entry) => entry.planUse === "excluded"), true);
  assert.match(inventory.notice, /not a selected, licensed, retrieved, ingested, or production source/i);
});

test("unresolved plan entries cannot lose their accountable role or risk", () => {
  const entry = inventory.entries.find((item) => item.planUse === "production");
  assert.throws(() => validatePhase1SourceInventory({ ...inventory, entries: [{ ...entry, ownerRole: "" }] }), /ownerRole/);
  assert.throws(() => validatePhase1SourceInventory({ ...inventory, entries: [{ ...entry, missing: "" }] }), /missing/);
  assert.throws(() => validatePhase1SourceInventory({ ...inventory, entries: [{ ...entry, externalDependency: "" }] }), /externalDependency/);
  assert.throws(() => validatePhase1SourceInventory({ ...inventory, entries: inventory.entries.filter((item) => item.category !== "fire") }), /Missing required category: fire/);
});
