import assert from "node:assert/strict";
import test from "node:test";
import record from "../data/historic-treaties-authority-access-block.json" with { type: "json" };
import { validateHistoricTreatiesAuthorityAccessBlock } from "../scripts/check-historic-treaties-authority-access-block.mjs";
test("Historic treaties block rejects surveyed/legal, non-illustrative, or production claims", () => {
  assert.doesNotThrow(() => validateHistoricTreatiesAuthorityAccessBlock(record));
  for (const altered of [{ ...record, legalGeometryLimit: { ...record.legalGeometryLimit, boundariesUsuallySurveyed: true } }, { ...record, legalGeometryLimit: { ...record.legalGeometryLimit, informationalAndRepresentationalOnly: false } }, { ...record, actions: { ...record.actions, profiled: true } }]) assert.throws(() => validateHistoricTreatiesAuthorityAccessBlock(altered));
});
