import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { validateCurrentWildfireDownstreamReconciliation } from "../scripts/check-current-wildfire-downstream-reconciliation.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const args = () => [
  read("../data/current-wildfire-downstream-reconciliation.json"),
  read("../data/current-wildfire-owner-admission.json"),
  read("../data/current-wildfire-raw-archive-evidence.json"),
  read("../data/current-wildfire-derived-archive-evidence.json"),
  read("../data/phase1-production-source-ledger.json")
];

test("the sole conditional approval gate activates exactly four current-wildfire rows", () => {
  const [record, ...context] = args();
  assert.equal(validateCurrentWildfireDownstreamReconciliation(record, ...context), record);
});

test("archive, geometry, admission, or release-boundary drift fails closed", () => {
  for (const mutate of [
    (values) => { values[0].gate.verifiedPayloads = 5; },
    (values) => { values[1].ownerDecision.ingestionApproved = false; },
    (values) => { values[2].entries[0].payloadRetention.until = "2033-08-11T23:59:59Z"; },
    (values) => { values[3].objects.find(({ id }) => id === "bc-wildfire-derived-payload").bytes += 1; },
    (values) => { values[4].entries.find(({ id }) => id === "bc-wildfire").productionEligible = false; },
    (values) => { values[0].rows.find(({ id }) => id === "bc-wildfire").releaseBoundary = "217 perimeters"; }
  ]) {
    const values = args();
    mutate(values);
    assert.throws(() => validateCurrentWildfireDownstreamReconciliation(...values));
  }
});
