import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase1BecPublicAlternativeExhaustion } from "../scripts/check-phase1-bec-public-alternative-exhaustion.mjs";

const record = JSON.parse(readFileSync(new URL("../data/phase1-bec-public-alternative-exhaustion.json", import.meta.url), "utf8"));

test("official BC BEC alternatives are exhausted without a complete public artifact", () => {
  assert.equal(validatePhase1BecPublicAlternativeExhaustion(record), record);
  assert.equal(record.routes.length, 13);
  assert.equal(record.routes.find(route => route.id === "public-wfs").observed.numberMatched, 17870);
  assert.equal(record.routes.find(route => route.id === "public-wfs").observed.pagingIsTransactionSafe, false);
  assert.equal(record.routes.find(route => route.id === "hectare-summary").observed.geometryPresent, false);
  assert.equal(record.exhaustion.rawEvidenceCreditImpact, 0);
});

test("BEC alternative gate rejects fabricated completeness, safe paging, or owner authorization", () => {
  assert.throws(() => validatePhase1BecPublicAlternativeExhaustion({ ...record, status: "complete" }), /without a complete artifact/);
  const complete = structuredClone(record);
  complete.exhaustion.lawfulPublicCompleteArtifactFound = true;
  assert.throws(() => validatePhase1BecPublicAlternativeExhaustion(complete), /must be false/);
  const paged = structuredClone(record);
  paged.routes.find(route => route.id === "public-wfs").observed.pagingIsTransactionSafe = true;
  assert.throws(() => validatePhase1BecPublicAlternativeExhaustion(paged), /must be false/);
  const authorized = structuredClone(record);
  authorized.ownerAction.status = "submitted";
  assert.throws(() => validatePhase1BecPublicAlternativeExhaustion(authorized), /prepared-unsent/);
  const credited = structuredClone(record);
  credited.exhaustion.rawEvidenceCreditImpact = 1;
  assert.throws(() => validatePhase1BecPublicAlternativeExhaustion(credited), /must be 0/);
});
