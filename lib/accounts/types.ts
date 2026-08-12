import type { Locale, Reported } from "../domain";
export type Account = Readonly<{ id: string; emailAddress: string; passwordHash: string; locale: Locale; emailVerifiedAt?: string; unsubscribeToken: string; unsubscribedAt?: string; deletionRequestedAt?: string }>;
export type SavedArea = Readonly<{ id: string; ownerId: string; geometry: string; radiusKilometres?: number; alertPreferences: readonly string[] }>;
export type AlertHistory = Readonly<{ id: string; ownerId: string; sentAt: string; figureId: string; reported: Reported }>;
export type CorrectionAlert = Readonly<{ ownerId: string; figureId: string; previous: Reported; restated: Reported }>;
export type AccountStore = Readonly<{ accounts: readonly Account[]; savedAreas: readonly SavedArea[]; alertHistory: readonly AlertHistory[]; killSwitchEnabled: boolean }>;
