import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateImmutablePromotions } from "../scripts/check-immutable-promotions.mjs";

const record = JSON.parse(readFileSync(new URL("../data/immutable-promotions.json", import.meta.url), "utf8"));

test("promotion evidence cannot claim revision before the evidence it carries", () => {
  assert.equal(validateImmutablePromotions(record), record);

  const beforeEvidence = structuredClone(record);
  beforeEvidence.revisedAt = "2026-08-12T23:55:00Z";
  assert.throws(
    () => validateImmutablePromotions(beforeEvidence),
    /revisedAt: cannot precede the evidence date recorded in evidenceAddedOn/,
  );
});

test("promotion evidence requires a bilingual basis beside revisedAt", () => {
  const noBasis = structuredClone(record);
  delete noBasis.revisedAtBasis;
  assert.throws(() => validateImmutablePromotions(noBasis), /revisedAtBasis: must be a LocalizedString/);
});
