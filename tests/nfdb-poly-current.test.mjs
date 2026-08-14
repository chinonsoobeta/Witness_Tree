import assert from "node:assert/strict";
import test from "node:test";
import { validate } from "../scripts/check-nfdb-poly-current.mjs";
import record from "../data/nfdb-poly-current-profile.json" with { type: "json" };

test("NFDB profile rejects integrity, attribution, geometry and promotion drift", () => {
  assert.doesNotThrow(() => validate(record));
  for (const bad of [
    { ...record, artifact: { ...record.artifact, bytes: 1 } },
    { ...record, artifact: { ...record.artifact, sha256: "a".repeat(64) } },
    { ...record, licence: { ...record.licence, basis: "Open Government Licence – Canada" } },
    { ...record, layers: [{ ...record.layers[0], invalid: 0 }, record.layers[1]] },
    { ...record, productionEligible: true }
  ]) assert.throws(() => validate(bad));
});
