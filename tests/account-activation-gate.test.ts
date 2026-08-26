import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCOUNT_ACTIVATION_REQUIREMENTS,
  ACCOUNT_SERVICE_STATUS,
  accountActivationStatus,
  requireAccountActivation,
  type AccountActivationApproval,
}
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../lib/accounts/activation-gate.ts";

const approved: AccountActivationApproval = {
  canadianHostAndResidency: true,
  directRlsIsolationTest: true,
  geometryEncryptionAndNoLogVerification: true,
  consentDeletionAndRetentionTests: true,
  verifiedSenderAndOneClickUnsubscribe: true,
  rateLimitAndQueueControls: true,
  killSwitchRehearsalUnderFiveMinutes: true,
  reviewedEnglishAndFrenchTemplates: true,
  privacySecurityAndLegalSignoff: true,
  namedIncidentOwnerAndRunbook: true,
};

test("account service is disabled by default and lists every missing activation record", () => {
  assert.equal(ACCOUNT_SERVICE_STATUS.enabled, false);
  assert.deepEqual(ACCOUNT_SERVICE_STATUS.missing, ACCOUNT_ACTIVATION_REQUIREMENTS);
  assert.throws(() => requireAccountActivation(), /not activated/);
});

test("one missing approval keeps account routes and future senders disabled", () => {
  const partial = { ...approved, killSwitchRehearsalUnderFiveMinutes: false };
  assert.deepEqual(accountActivationStatus(partial).missing, ["killSwitchRehearsalUnderFiveMinutes"]);
  assert.throws(() => requireAccountActivation(partial), /not activated/);
});

test("only a complete explicit approval record can satisfy the local activation guard", () => {
  assert.equal(accountActivationStatus(approved).enabled, true);
  assert.doesNotThrow(() => requireAccountActivation(approved));
});
