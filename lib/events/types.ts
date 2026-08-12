export const FTA_LIFECYCLES = ["PENDING", "ACTIVE", "RETIRED"] as const;
export type FtaLifecycle = (typeof FTA_LIFECYCLES)[number];

export const EVENT_CATEGORIES = ["planned", "authorised", "recorded-harvest"] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const TENURE_TYPES = ["Crown", "private", "federal", "reserve", "unknown"] as const;
export type TenureType = (typeof TENURE_TYPES)[number];

export const EVENT_SUBTYPES = ["salvage", "partial-cut", "thinning", "undetermined"] as const;
export type EventSubtype = (typeof EVENT_SUBTYPES)[number];

export type LocalizedLabel = Readonly<{ en: string; fr: string }>;
export type Province = "BC" | "AB" | "ON" | "QC";

export type FtaInput = Readonly<{
  status: "example";
  id: string;
  province: Province;
  lifecycle: FtaLifecycle;
  /** Optional source-supplied category is checked against the lifecycle mapping. */
  category?: EventCategory;
  tenure: TenureType;
  subtype?: Exclude<EventSubtype, "undetermined">;
  year: number;
  hectares: number;
}>;

export type NormalizedForestEvent = Readonly<{
  status: "example";
  id: string;
  province: Province;
  category: EventCategory;
  tenure: TenureType;
  subtype: EventSubtype;
  year: number;
  hectares: number;
  rankable: boolean;
}>;

export type ProvinceSummary = Readonly<{
  province: Province;
  eventCount: number;
  plannedCount: number;
  authorisedCount: number;
  recordedHarvestCount: number;
  unknownTenureShare: Readonly<{ kind: "figure"; value: number }> | Readonly<{ kind: "unknown"; reason: string }>;
}>;

export type BoundaryComputedResult = Readonly<{
  boundaryEdition: string;
  provinces: readonly ProvinceSummary[];
}>;
