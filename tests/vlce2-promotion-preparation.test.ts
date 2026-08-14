import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateVlce2PromotionPreparation } from "../scripts/check-vlce2-promotion-preparation.mjs";

const plan = JSON.parse(readFileSync(new URL("../data/vlce2-promotion-preparation.json", import.meta.url), "utf8"));

test("the controlled VLCE2 preparation binds all 39 uploads but remains publication-blocked", () => {
  assert.deepEqual(validateVlce2PromotionPreparation(plan), { annualVersions: 39, retained: 1, notRetained: 38, publicationReady: false });
  assert.throws(() => validateVlce2PromotionPreparation(plan, { requireAllRetained: true }), /1985–2022 are not retained/);
});

test("planned retention cannot be represented as evidence", () => {
  const tampered = structuredClone(plan);
  tampered.entries[1].liveRetention.plannedRetention = { mode: "COMPLIANCE", retainUntil: "2033-08-12T00:00:00Z" };
  assert.throws(() => validateVlce2PromotionPreparation(tampered), /plannedRetention is a plan, not retention evidence/);
});

test("full-object CRC64 and version identity are mandatory for every annual payload", () => {
  const badCrc = structuredClone(plan);
  badCrc.entries[10].remote.checksumCrc64nvmeBase64 = "AAAAAAAAAAA=";
  assert.throws(() => validateVlce2PromotionPreparation(badCrc), /S3 CRC64 must bind/);
  const badVersion = structuredClone(plan);
  badVersion.entries[10].remote.versionId = "planned";
  assert.throws(() => validateVlce2PromotionPreparation(badVersion), /match/);
});
