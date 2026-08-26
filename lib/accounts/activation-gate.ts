/**
 * A non-secret record of the evidence required before any account mutation or
 * alert delivery can be activated.  This deliberately defaults closed: local
 * policy tests do not prove a Canadian hosted service or safe delivery.
 */
export type AccountActivationApproval = Readonly<{
  canadianHostAndResidency: boolean;
  directRlsIsolationTest: boolean;
  geometryEncryptionAndNoLogVerification: boolean;
  consentDeletionAndRetentionTests: boolean;
  verifiedSenderAndOneClickUnsubscribe: boolean;
  rateLimitAndQueueControls: boolean;
  killSwitchRehearsalUnderFiveMinutes: boolean;
  reviewedEnglishAndFrenchTemplates: boolean;
  privacySecurityAndLegalSignoff: boolean;
  namedIncidentOwnerAndRunbook: boolean;
}>;

export const ACCOUNT_ACTIVATION_REQUIREMENTS = Object.freeze([
  "canadianHostAndResidency",
  "directRlsIsolationTest",
  "geometryEncryptionAndNoLogVerification",
  "consentDeletionAndRetentionTests",
  "verifiedSenderAndOneClickUnsubscribe",
  "rateLimitAndQueueControls",
  "killSwitchRehearsalUnderFiveMinutes",
  "reviewedEnglishAndFrenchTemplates",
  "privacySecurityAndLegalSignoff",
  "namedIncidentOwnerAndRunbook",
] as const satisfies readonly (keyof AccountActivationApproval)[]);

export type AccountActivationStatus = Readonly<{
  enabled: boolean;
  missing: readonly (keyof AccountActivationApproval)[];
}>;

export function accountActivationStatus(approval?: Partial<AccountActivationApproval>): AccountActivationStatus {
  const missing = ACCOUNT_ACTIVATION_REQUIREMENTS.filter((requirement) => approval?.[requirement] !== true);
  return Object.freeze({ enabled: missing.length === 0, missing: Object.freeze(missing) });
}

/** Default state for public routes and every future sender. */
export const ACCOUNT_SERVICE_STATUS = accountActivationStatus();

/** Call at every future account-mutation or alert-delivery boundary. */
export function requireAccountActivation(approval?: Partial<AccountActivationApproval>): void {
  if (!accountActivationStatus(approval).enabled) throw new Error("Account service is not activated.");
}
