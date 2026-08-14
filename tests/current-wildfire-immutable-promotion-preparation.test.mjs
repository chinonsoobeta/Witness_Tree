import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { dryRunLines, validateCurrentWildfirePromotionPreparation } from "../scripts/prepare-current-wildfire-immutable-promotion.mjs";
const plan = JSON.parse(readFileSync(new URL("../data/current-wildfire-immutable-promotion-preparation.json", import.meta.url), "utf8"));
const staged = JSON.parse(readFileSync(new URL("../data/staged-acquisitions.json", import.meta.url), "utf8"));
test("four current wildfire snapshots remain exact, archive-only, and non-admitted", () => { assert.equal(validateCurrentWildfirePromotionPreparation(plan, staged), plan); const lines = dryRunLines(plan, staged).join("\n"); assert.match(lines, /ADMISSION-BLOCK bc-wildfire geometry=blocked-pending-geometry-policy/); assert.match(lines, /ADMISSION-BLOCK on-fire-disturbance geometry=blocked-pending-geometry-policy/); assert.equal((lines.match(/UPLOAD-PENDING/g) ?? []).length, 4); });
test("preparation fails closed on drift, extra source, or an archive claim", () => { assert.throws(() => validateCurrentWildfirePromotionPreparation({...plan, claims: {...plan.claims, immutableObjectStorage: true}}, staged)); assert.throws(() => validateCurrentWildfirePromotionPreparation({...plan, artifacts: plan.artifacts.slice(0, 3)}, staged)); assert.throws(() => validateCurrentWildfirePromotionPreparation({...plan, artifacts: [{...plan.artifacts[0], geometryDecision: "ready"}, ...plan.artifacts.slice(1)]}, staged)); });
