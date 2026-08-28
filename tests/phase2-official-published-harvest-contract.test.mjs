import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { validateOfficialPublishedHarvestContract, verifyOfficialPublishedHarvestContract } from "../scripts/check-phase2-official-published-harvest-contract.mjs";

const contractPath = new URL("../data/phase2-official-published-harvest-contract.json", import.meta.url);
const readContract = () => JSON.parse(readFileSync(contractPath, "utf8"));

test("the two-track contract preserves 118 strict nulls and exposes only 104 rounded references", () => {
  const result = verifyOfficialPublishedHarvestContract({ contractPath });
  assert.equal(result.externalVerified, false);
  assert.equal(result.contract.strictNfdBoundary.pendingExactRows, 118);
  assert.equal(result.contract.outputContract.statcanRoundedRows, 104);
  assert.equal(result.contract.outputContract.restrictedPendingRows, 14);
  assert.equal(result.contract.outputContract.safeExactNfdReplacementRows, 0);
});

test("the contract rejects scope laundering and affirmative downstream claims", () => {
  const mutations = [
    (value) => { value.strictNfdBoundary.mustRemainNull = false; },
    (value) => { value.strictNfdBoundary.fallbackFromKnownSubtotalsForbidden = false; },
    (value) => { value.referenceSources[0].roundingHalfWidthHectares = 0; },
    (value) => { value.referenceSources[1].publicationStatus = "publishable"; },
    (value) => { value.claims.likeForLike = true; },
    (value) => { value.claims.formalIndependentComparisonGateComplete = true; },
    (value) => { value.claims.productionEligible = true; },
  ];
  for (const mutate of mutations) {
    const candidate = readContract();
    mutate(candidate);
    assert.throws(() => validateOfficialPublishedHarvestContract(candidate));
  }
});

test("repository binding drift fails exact verification", () => {
  const candidate = readContract();
  candidate.strictNfdBoundary.profile.sha256 = "0".repeat(64);
  const directory = mkdtempSync(path.join(os.tmpdir(), "witness-tree-track-b-contract-"));
  const temporary = path.join(directory, "contract.json");
  writeFileSync(temporary, `${JSON.stringify(candidate)}\n`);
  try {
    assert.throws(() => verifyOfficialPublishedHarvestContract({ contractPath: temporary }), /strict NFD profile SHA-256 differs/i);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
