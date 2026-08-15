import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = () => JSON.parse(readFileSync(new URL("../data/current-wildfire-derived-live-recovery-guard-2026-08-20.json", import.meta.url), "utf8"));
const READ_ONLY_OPERATIONS = new Set(["list-objects-v2", "head-object", "get-object-retention"]);

export function validateCurrentWildfireDerivedLiveRecoveryGuard(record = read()) {
  assert.equal(record.schemaVersion, "phase1/current-wildfire-derived-live-recovery-guard/1");
  assert.equal(record.status, "blocked-live-read-only");
  assert.deepEqual(record.mutationsPerformed, []);
  assert.equal(record.ownerAdmission, false);
  assert.equal(record.productionEligible, false);
  assert.equal(record.liveObjects["bc-wildfire"].payloadObjectCount, 1);
  assert.equal(record.liveObjects["bc-wildfire"].payloadBytes, 2162688);
  assert.equal(record.liveObjects["bc-wildfire"].retention, "NONE");
  assert.equal(record.liveObjects["bc-wildfire"].manifestPresent, false);
  assert.equal(record.liveObjects["bc-wildfire"].recoveryObjectCount, 0);
  assert.equal(record.liveObjects["on-fire-disturbance"].payloadObjectCount, 0);
  assert.equal(record.liveObjects["on-fire-disturbance"].recoveryObjectCount, 0);
  assert.ok(record.readOnlyPreconditions.length >= 4);
  for (const precondition of record.readOnlyPreconditions) assert.ok(READ_ONLY_OPERATIONS.has(precondition.operation));
  assert.match(record.permissionPreconditions.versionSpecificReadback, /unverified/);
  assert.match(record.permissionPreconditions.retentionWrite, /unverified/);
  assert.match(record.ownerActions.join("\n"), /do not change IAM/i);
  assert.match(record.failClosedRules.join("\n"), /not an immutable archive proof/i);
  return record;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  validateCurrentWildfireDerivedLiveRecoveryGuard();
  console.log("Derived wildfire live recovery guard passed: BC is an unlocked orphan, Ontario is absent, and no mutation path is authorized.");
}
