import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateRemoteAdmissionDecisions } from "../scripts/check-phase1-remote-source-admission-decisions.mjs";

const read = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));
const decisions = read("../data/phase1-remote-source-admission-decisions.json");
const ledger = read("../data/phase1-production-source-ledger.json");

test("nine named rows have narrowly scoped owner source-ledger or PLVI scope decisions only", () => {
  assert.doesNotThrow(() => validateRemoteAdmissionDecisions(decisions, ledger));
  assert.equal(decisions.decisions.filter((decision) => decision.ownerAdmission === "approved-source-ledger-only").length, 9);
  assert.equal(decisions.decisions.filter((decision) => decision.scopeDecision === "accepted-named-source-ledger-only").length, 4);
  assert.equal(decisions.decisions.filter((decision) => decision.scopeDecision === "approved-raw-and-derived-scope-only").length, 1);
  assert.deepEqual(
    ledger.entries.filter((entry) => entry.proof.productionAdmission).map(({ id }) => id).sort(),
    ["elections-canada-45th-files", "fed-2023-ridings"],
  );
  assert.deepEqual(
    ledger.entries.filter((entry) => entry.productionEligible).map(({ id }) => id).sort(),
    ["elections-canada-45th-files", "fed-2023-ridings"],
  );
});

test("remote decision rejects broader authority or a changed Crown exclusion", () => {
  const broader = structuredClone(decisions);
  broader.decisions[0].scope = "This source is approved for transformation.";
  assert.throws(() => validateRemoteAdmissionDecisions(broader, ledger));
  const crown = structuredClone(decisions);
  crown.decisions.find((decision) => decision.id === "ab-avi-crown").scope = "AVI_PostInventoryHarvestIndex FID 2 is excluded; zero AVI_Crown observations and no Crown denominator impact.";
  assert.throws(() => validateRemoteAdmissionDecisions(crown, ledger));
  const plvi = structuredClone(decisions);
  plvi.decisions.find((decision) => decision.id === "ab-primary-land-vegetation").scope = "The owner admitted the derived artifact for transformation and production.";
  assert.throws(() => validateRemoteAdmissionDecisions(plvi, ledger));
});
