import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateArchiveExerciseReadback } from "../scripts/check-phase1-archive-exercise-readback.mjs";

const normal = {
  schemaVersion: 1, capturedAt: "2026-08-14T20:47:33Z",
  identity: "mfa-temporary-session-verified; identifiers omitted",
  legalHold: { onReadback: "ON", offReadback: "OFF", complianceRetentionUnchanged: true, retainUntil: "2026-08-16T20:19:26Z" },
  deniedVersionDeleteProbe: "denied-as-required", cloudTrail: "not-queryable-by-verifier-role",
  recoveryReplication: "replica-readback-authorized", completed: true, productionEligible: false
};

test("normal exercise evidence requires the recovery replica before completion", () => {
  assert.deepEqual(validateArchiveExerciseReadback(normal), { kind: "normal", completed: true });
  assert.deepEqual(validateArchiveExerciseReadback({ ...normal, recoveryReplication: "replica-readback-pending", completed: false }), { kind: "normal", completed: false });
  assert.throws(() => validateArchiveExerciseReadback({ ...normal, recoveryReplication: "replica-readback-pending", completed: true }), /completed/);
});

test("evidence schema refuses identifiers and credentials", () => {
  assert.throws(() => validateArchiveExerciseReadback({ ...normal, note: "arn:aws:iam::123456789012:role/example" }), /redacted/);
  assert.throws(() => validateArchiveExerciseReadback({ ...normal, deniedVersionDeleteProbe: "unexpected-success" }), /denied/);
});

test("recovery evidence captures only the permitted legal-hold outcome", () => {
  const recovery = { schemaVersion: 1, capturedAt: "2026-08-14T20:47:33Z", identity: "mfa-temporary-session-verified; identifiers omitted", recoveredLatestExercise: { legalHoldBefore: "ON", legalHoldAfter: "OFF", complianceRetentionUnchanged: true, retainUntil: "2026-08-16T20:19:26+00:00" }, productionEligible: false };
  assert.deepEqual(validateArchiveExerciseReadback(recovery), { kind: "recovery", completed: true });
});

test("captured 2026-08-25 owner exercise completed every redacted control", () => {
  const captured = JSON.parse(readFileSync(new URL("../data/phase1-archive-exercise-readback-2026-08-25.json", import.meta.url), "utf8"));
  assert.deepEqual(validateArchiveExerciseReadback(captured), { kind: "normal", completed: true });
});
