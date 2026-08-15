import assert from "node:assert/strict";
import test from "node:test";
import { validateCurrentWildfireDerivedLiveRecoveryGuard } from "../scripts/check-current-wildfire-derived-live-recovery-guard.mjs";

test("derived live recovery guard stays fail closed for the BC orphan and absent Ontario prefix", () => {
  const record = validateCurrentWildfireDerivedLiveRecoveryGuard();
  assert.equal(record.permissionPreconditions.versionSpecificReadback, "unverified; no additional permission requested");
  assert.equal(record.permissionPreconditions.retentionWrite, "unverified; no retention attempted");
  assert.deepEqual(record.mutationsPerformed, []);
  assert.equal(record.ownerAdmission, false);
  assert.equal(record.productionEligible, false);
});

test("derived guard rejects a false immutable claim", () => {
  assert.throws(() => validateCurrentWildfireDerivedLiveRecoveryGuard({
    ...validateCurrentWildfireDerivedLiveRecoveryGuard(),
    liveObjects: {
      ...validateCurrentWildfireDerivedLiveRecoveryGuard().liveObjects,
      "bc-wildfire": {
        ...validateCurrentWildfireDerivedLiveRecoveryGuard().liveObjects["bc-wildfire"],
        retention: "COMPLIANCE"
      }
    }
  }), /NONE/);
});
