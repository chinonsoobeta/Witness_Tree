import assert from "node:assert/strict";
import test from "node:test";
import record from "../data/modern-treaties-authority-access-block.json" with { type: "json" };
import { validateModernTreatiesAuthorityAccessBlock } from "../scripts/check-modern-treaties-authority-access-block.mjs";
test("Modern treaties block rejects precise, consultation, or production claims", () => {
  assert.doesNotThrow(() => validateModernTreatiesAuthorityAccessBlock(record));
  for (const altered of [{ ...record, legalGeometryLimit: { ...record.legalGeometryLimit, boundariesApproximateAndSubjectToRevision: false } }, { ...record, legalGeometryLimit: { ...record.legalGeometryLimit, consultationRelianceForbidden: false } }, { ...record, actions: { ...record.actions, profiled: true } }]) assert.throws(() => validateModernTreatiesAuthorityAccessBlock(altered));
});
