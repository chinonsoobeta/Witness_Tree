import type { Locale, Reported } from "../domain";
export type AlertCadence = "immediate" | "daily-digest" | "weekly-digest" | "monthly-digest";
export type Account = Readonly<{ id: string; emailAddress: string; passwordHash: string; locale: Locale; emailVerifiedAt?: string; unsubscribeToken: string; unsubscribedAt?: string; deletionRequestedAt?: string; consentWording?: string; consentedAt?: string }>;
/** Legacy callers may omit the alert fields; new alert evaluation validates all of them. */
export type SavedArea = Readonly<{ id: string; ownerId: string; geometry: string; radiusKilometres?: number; areaSquareKilometres?: number; alertPreferences: readonly string[]; name?: string; note?: string; alertCadence?: AlertCadence; alertLocale?: Locale }>;
export type AlertHistory = Readonly<{ id: string; ownerId: string; sentAt: string; figureId: string; reported: Reported; dataVersion?: string }>;
export type CorrectionAlert = Readonly<{ ownerId: string; figureId: string; previous: Reported; restated: Reported }>;
export type AccountStore = Readonly<{ accounts: readonly Account[]; savedAreas: readonly SavedArea[]; alertHistory: readonly AlertHistory[]; killSwitchEnabled: boolean }>;
