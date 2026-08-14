import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateArchiveOperationsReadiness } from "../scripts/check-archive-operations-readiness.mjs";

const record = JSON.parse(readFileSync(new URL("../data/archive-operations-readiness.json", import.meta.url), "utf8"));

test("archive operations record is explicitly blocked and non-production until evidence exists", () => {
  assert.equal(validateArchiveOperationsReadiness(record), record);
  assert.equal(record.status, "blocked");
  assert.equal(record.productionEligible, false);
  assert.equal(record.controls.every((control) => control.state === "missing" && control.evidence.length === 0), true);
});

test("archive operations readiness fails closed for missing ownership, evidence, or premature readiness", () => {
  assert.throws(() => validateArchiveOperationsReadiness({ ...record, status: "ready" }), /only after every decision and control/);
  assert.throws(() => validateArchiveOperationsReadiness({ ...record, productionEligible: true }), /must remain production ineligible/);
  assert.throws(() => validateArchiveOperationsReadiness({ ...record, archive: { ...record.archive, resourceState: "production" } }), /non-production/);
  assert.throws(() => validateArchiveOperationsReadiness({ ...record, controls: record.controls.filter((control) => control.id !== "legal-hold") }), /Every archive operations control/);
  assert.throws(() => validateArchiveOperationsReadiness({ ...record, controls: record.controls.map((control) => control.id === "access-logging" ? { ...control, state: "evidenced", evidence: [] } : control) }), /needs evidence/);
  assert.throws(() => validateArchiveOperationsReadiness({ ...record, controls: record.controls.map((control) => control.id === "lifecycle" ? { ...control, ownerRole: "" } : control) }), /owner role/);
});
