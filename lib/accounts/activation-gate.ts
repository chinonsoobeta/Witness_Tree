/** A non-secret record of evidence required before account features may activate. */
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
  "canadianHostAndResidency", "directRlsIsolationTest", "geometryEncryptionAndNoLogVerification",
  "consentDeletionAndRetentionTests", "verifiedSenderAndOneClickUnsubscribe", "rateLimitAndQueueControls",
  "killSwitchRehearsalUnderFiveMinutes", "reviewedEnglishAndFrenchTemplates",
  "privacySecurityAndLegalSignoff", "namedIncidentOwnerAndRunbook",
] as const satisfies readonly (keyof AccountActivationApproval)[]);

export type AccountActivationStatus = Readonly<{ enabled: boolean; missing: readonly (keyof AccountActivationApproval)[] }>;

export function accountActivationStatus(approval?: Partial<AccountActivationApproval>): AccountActivationStatus {
  const missing = ACCOUNT_ACTIVATION_REQUIREMENTS.filter((requirement) => approval?.[requirement] !== true);
  return Object.freeze({ enabled: missing.length === 0, missing: Object.freeze(missing) });
}

/** Default state: account routes and any future sender stay unavailable. */
export const ACCOUNT_SERVICE_STATUS = accountActivationStatus();

/** Call this at every future account-mutation or delivery boundary. */
export function requireAccountActivation(approval?: Partial<AccountActivationApproval>): void {
  if (!accountActivationStatus(approval).enabled) throw new Error("Account service is not activated.");
}
