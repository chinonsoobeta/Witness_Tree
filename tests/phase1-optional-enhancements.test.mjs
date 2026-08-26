import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase1OptionalEnhancements } from "../scripts/check-phase1-optional-enhancements.mjs";

const record = JSON.parse(readFileSync(new URL("../data/phase1-optional-enhancements.json", import.meta.url), "utf8"));
const inventory = JSON.parse(readFileSync(new URL("../data/phase1-source-inventory.json", import.meta.url), "utf8"));

test("restricted provincial sources remain optional risks rather than V2.1 core blockers", () => {
  assert.equal(validatePhase1OptionalEnhancements(record, inventory), record);
  assert.equal(record.entries.length, 9);
  assert.equal(record.entries.every((entry) => entry.optionalEnhancement && !entry.phase1CoreBlocker && !entry.productionEligible), true);
  assert.equal(record.historicalEvidenceScore.status, "historical-not-v2-1-phase-completion");
});

test("optional-enhancement gate rejects admission, phase-blocking, or score reinterpretation", () => {
  assert.throws(() => validatePhase1OptionalEnhancements({ ...record, entries: record.entries.map((entry, index) => index === 0 ? { ...entry, phase1CoreBlocker: true } : entry) }, inventory), /restricted, optional, non-core, and non-production/);
  assert.throws(() => validatePhase1OptionalEnhancements({ ...record, entries: record.entries.map((entry, index) => index === 0 ? { ...entry, productionEligible: true } : entry) }, inventory), /restricted, optional, non-core, and non-production/);
  assert.throws(() => validatePhase1OptionalEnhancements({ ...record, entries: record.entries.filter((entry) => entry.sourceId !== "on-fri") }, inventory), /Every restricted optional source/);
  assert.throws(() => validatePhase1OptionalEnhancements({ ...record, historicalEvidenceScore: { ...record.historicalEvidenceScore, status: "phase-complete" } }, inventory), /Historical evidence score/);
});
