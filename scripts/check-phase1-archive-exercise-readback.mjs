import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/;
const REDACTED = /(?:\b\d{12}\b|arn:aws:|AccessKeyId|SecretAccessKey|SessionToken|VersionId|[A-Za-z0-9+/]{40,}={0,2})/i;

function utc(value, name) {
  assert.match(value, UTC, `${name} must be an ISO-8601 UTC instant.`);
  assert.ok(!Number.isNaN(Date.parse(value)), `${name} must be a real instant.`);
}

export function validateArchiveExerciseReadback(record) {
  assert.equal(record?.schemaVersion, 1);
  utc(record.capturedAt, "capturedAt");
  assert.equal(record.identity, "mfa-temporary-session-verified; identifiers omitted");
  assert.equal(record.productionEligible, false);
  assert.doesNotMatch(JSON.stringify(record), REDACTED, "Exercise evidence must stay redacted.");

  if (record.recoveredLatestExercise) {
    const recovery = record.recoveredLatestExercise;
    assert.deepEqual(Object.keys(recovery).sort(), ["complianceRetentionUnchanged", "legalHoldAfter", "legalHoldBefore", "retainUntil"]);
    assert.equal(recovery.legalHoldBefore, "ON");
    assert.equal(recovery.legalHoldAfter, "OFF");
    assert.equal(recovery.complianceRetentionUnchanged, true);
    utc(recovery.retainUntil, "recoveredLatestExercise.retainUntil");
    return { kind: "recovery", completed: true };
  }

  assert.deepEqual(Object.keys(record.legalHold ?? {}).sort(), ["complianceRetentionUnchanged", "offReadback", "onReadback", "retainUntil"]);
  assert.equal(record.legalHold.onReadback, "ON");
  assert.equal(record.legalHold.offReadback, "OFF");
  assert.equal(record.legalHold.complianceRetentionUnchanged, true);
  utc(record.legalHold.retainUntil, "legalHold.retainUntil");
  assert.equal(record.deniedVersionDeleteProbe, "denied-as-required");
  assert.equal(record.cloudTrail, "not-queryable-by-verifier-role");
  assert.ok(["replica-readback-authorized", "replica-readback-pending"].includes(record.recoveryReplication));
  assert.equal(record.completed, record.recoveryReplication === "replica-readback-authorized", "completed must be false until the recovery replica reads back.");
  return { kind: "normal", completed: record.completed };
}

if (process.argv[1]?.endsWith("check-phase1-archive-exercise-readback.mjs")) {
  const evidenceFile = process.argv[2] ?? fileURLToPath(new URL("../data/phase1-archive-exercise-readback-2026-08-25.json", import.meta.url));
  const record = JSON.parse(readFileSync(evidenceFile, "utf8"));
  const verdict = validateArchiveExerciseReadback(record);
  console.log(`Redacted ${verdict.kind} archive-exercise evidence is valid (${verdict.completed ? "complete" : "recovery pending"}).`);
}
