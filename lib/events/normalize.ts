import type { BoundaryComputedResult, EventCategory, EventSubtype, FtaInput, NormalizedForestEvent, Province, ProvinceSummary, TenureType } from "./types";

export const EVENT_CATEGORY_LABELS: Readonly<Record<EventCategory, Readonly<{ en: string; fr: string }>>> = Object.freeze({
  planned: { en: "Planned", fr: "Planifié" },
  authorised: { en: "Authorised", fr: "Autorisé" },
  "recorded-harvest": { en: "Recorded harvest", fr: "Récolte consignée" },
});

const LIFECYCLE_CATEGORY: Readonly<Record<FtaInput["lifecycle"], EventCategory>> = {
  PENDING: "planned",
  ACTIVE: "authorised",
  RETIRED: "recorded-harvest",
};
const PROVINCES = new Set<Province>(["BC", "AB", "ON", "QC"]);
const TENURES = new Set<TenureType>(["Crown", "private", "federal", "reserve", "unknown"]);
const SUBTYPES = new Set<EventSubtype>(["salvage", "partial-cut", "thinning", "undetermined"]);

function requiredId(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Event id is required.");
  return value;
}

export function normalizeFtaEvent(input: FtaInput): NormalizedForestEvent {
  if (input.status !== "example") throw new Error("Event fixtures must be labelled example.");
  const id = requiredId(input.id);
  if (!PROVINCES.has(input.province)) throw new Error("Event province is invalid.");
  if (!Object.hasOwn(LIFECYCLE_CATEGORY, input.lifecycle)) throw new Error("FTA lifecycle is invalid.");
  const category = LIFECYCLE_CATEGORY[input.lifecycle];
  if (input.category !== undefined && input.category !== category) throw new Error("Event category is invalid.");
  if (!TENURES.has(input.tenure)) throw new Error("Event tenure is invalid.");
  const subtype = input.subtype ?? "undetermined";
  if (!SUBTYPES.has(subtype)) throw new Error("Event subtype is invalid.");
  if (!Number.isInteger(input.year) || input.year < 1984 || input.year > new Date().getUTCFullYear()) throw new Error("Event year is invalid.");
  if (!Number.isFinite(input.hectares) || input.hectares <= 0) throw new Error("Event hectares are invalid.");
  return Object.freeze({ status: "example", id, province: input.province, category, tenure: input.tenure, subtype, year: input.year, hectares: input.hectares, rankable: input.tenure !== "reserve" });
}

export function normalizeFtaEvents(inputs: readonly FtaInput[]): readonly NormalizedForestEvent[] {
  const ids = new Set<string>();
  return inputs.map((input) => {
    const event = normalizeFtaEvent(input);
    if (ids.has(event.id)) throw new Error(`Duplicate event id: ${event.id}.`);
    ids.add(event.id);
    return event;
  });
}

export function computeProvinceSummaries(events: readonly NormalizedForestEvent[], boundaryEdition: string): BoundaryComputedResult {
  if (!boundaryEdition.trim()) throw new Error("Boundary edition is required.");
  const provinces = [...PROVINCES].map((province): ProvinceSummary => {
    const records = events.filter((event) => event.province === province);
    const count = (category: EventCategory) => records.filter((event) => event.category === category).length;
    const unknownTenureShare: ProvinceSummary["unknownTenureShare"] = records.length === 0
      ? { kind: "unknown", reason: "No event records for this province and boundary edition." }
      : { kind: "figure", value: records.filter((event) => event.tenure === "unknown").length / records.length };
    return Object.freeze({
      province,
      eventCount: records.length,
      plannedCount: count("planned"),
      authorisedCount: count("authorised"),
      recordedHarvestCount: count("recorded-harvest"),
      unknownTenureShare,
    });
  });
  return Object.freeze({ boundaryEdition, provinces: Object.freeze(provinces) });
}
