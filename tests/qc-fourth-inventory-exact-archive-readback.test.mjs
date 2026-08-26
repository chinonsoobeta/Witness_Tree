import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateQcFourthInventoryExactArchiveReadback } from "../scripts/check-qc-fourth-inventory-exact-archive-readback.mjs";

const evidence = JSON.parse(readFileSync(new URL("../data/qc-fourth-inventory-exact-archive-readback-2026-08-25.json", import.meta.url), "utf8"));

test("the Québec exact readback binds 62 planned objects without disclosing private identifiers", () => {
  assert.equal(validateQcFourthInventoryExactArchiveReadback(evidence), evidence);
  assert.equal(evidence.verification.exactPrivateVersionsMatched, 62);
  assert.deepEqual(evidence.verification.checksumTypes, { COMPOSITE: 6, FULL_OBJECT: 56 });
  assert.equal(evidence.claims.productionEligible, false);
});

test("the Québec exact readback fails closed on plan, readback, retention, or redaction drift", () => {
  for (const mutate of [
    (candidate) => { candidate.planBinding.objectCount = 61; },
    (candidate) => { candidate.planBinding.objectDescriptorSha256 = "0".repeat(64); },
    (candidate) => { candidate.verification.checksumTypes.COMPOSITE = 5; },
    (candidate) => { candidate.verification.retainUntil = "2033-08-11T00:00:00Z"; },
    (candidate) => { candidate.claims.ownerAdmission = true; },
    (candidate) => { candidate.note = "VersionId=private"; }
  ]) {
    const changed = structuredClone(evidence); mutate(changed);
    assert.throws(() => validateQcFourthInventoryExactArchiveReadback(changed));
  }
});
