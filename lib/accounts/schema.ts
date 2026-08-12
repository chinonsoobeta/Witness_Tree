import type { AccountStore } from "./types";
/** Database-agnostic logical schema; production storage is deliberately not assumed. */
export const ACCOUNT_SCHEMA = Object.freeze({ account: ["id", "emailAddress", "passwordHash", "locale", "emailVerifiedAt", "unsubscribeToken", "unsubscribedAt", "deletionRequestedAt"], savedArea: ["id", "ownerId", "geometry", "radiusKilometres", "alertPreferences"], alertHistory: ["id", "ownerId", "sentAt", "figureId", "reported"] });
export const emptyAccountStore = (): AccountStore => ({ accounts: [], savedAreas: [], alertHistory: [], killSwitchEnabled: false });
