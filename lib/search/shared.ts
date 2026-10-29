/**
 * Search helpers that hold no data, so the results page, the suggestion route
 * and the search field in the browser all read a query and an Unknown the same
 * way.
 */

import type { Locale } from "@/lib/domain/localized";

/**
 * The query as search reads it: one string, with every run of whitespace
 * (including non-breaking and zero-width spaces) made one space and the ends
 * trimmed. A query that is nothing but whitespace is no query.
 */
export function cleanSearchQuery(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\s\u200B-\u200D\u2060\uFEFF]+/g, " ").trim();
}

/** Why a place has no loss figure. It is a stated state, never a zero. */
export type UnknownReason = "no-satellite-data" | "no-forest-mapped" | "partly-mapped" | "no-figure";

const REASON_ORDER: readonly UnknownReason[] = ["no-satellite-data", "partly-mapped", "no-forest-mapped", "no-figure"];

/** The fields a figure's reason reads, which a riding and a place both carry. */
export type FigureFields = Readonly<{
  coverage: "complete" | "partial-with-unknown" | "none-mapped";
  observedLossHectares: number | null;
  observedLossPercent: number | null;
  knownObservedSubtotalHectares?: number | null;
  /** 100 exactly when no forest was mapped but some of the area is unknown: no satellite data. */
  unknownSharePercent?: number | null;
}>;

/**
 * Null when the row states a detected figure: a complete share, or a minimum
 * from a partly mapped area. Otherwise, why its loss is Unknown.
 */
export function figureUnknownReason(row: FigureFields | undefined): UnknownReason | null {
  if (!row) return "no-figure";
  if (row.coverage === "complete" && row.observedLossHectares !== null && row.observedLossPercent !== null) return null;
  if (row.coverage === "partial-with-unknown" && (row.knownObservedSubtotalHectares ?? 0) > 0) return null;
  if (row.unknownSharePercent === 100) return "no-satellite-data";
  if (row.coverage === "none-mapped") return "no-forest-mapped";
  if (row.coverage === "partial-with-unknown") return "partly-mapped";
  return "no-figure";
}

/**
 * Same-reason Unknown rows from this many up are gathered under one line that
 * gives their count and reason. Fewer stay in the list as they are.
 */
export const UNKNOWN_GROUP_MIN = 3;

export type UnknownGroup<T> = Readonly<{ reason: UnknownReason; rows: readonly T[] }>;

/**
 * Splits rows into those listed as they are and same-reason groups of
 * Unknowns. Measured rows, and rows `keep` names (such as the place the reader
 * named exactly), are always listed. Order is kept within each part.
 */
export function splitUnknownRows<T>(
  rows: readonly T[],
  reasonOf: (row: T) => UnknownReason | null,
  keep: (row: T) => boolean = () => false,
): Readonly<{ listed: readonly T[]; groups: readonly UnknownGroup<T>[] }> {
  const byReason = new Map<UnknownReason, T[]>();
  for (const row of rows) {
    const reason = reasonOf(row);
    if (reason === null || keep(row)) continue;
    byReason.set(reason, [...(byReason.get(reason) ?? []), row]);
  }
  const grouped = new Set<T>();
  const groups: UnknownGroup<T>[] = [];
  for (const reason of REASON_ORDER) {
    const members = byReason.get(reason) ?? [];
    if (members.length < UNKNOWN_GROUP_MIN) continue;
    members.forEach((row) => grouped.add(row));
    groups.push({ reason, rows: members });
  }
  return { listed: rows.filter((row) => !grouped.has(row)), groups };
}

/** What the grouped rows are, in the plural: every noun here is feminine in French. */
export type UnknownGroupNoun = "communities" | "ridings" | "provinces" | "federal-ridings" | "provincial-ridings";

const NOUNS: Readonly<Record<UnknownGroupNoun, Readonly<Record<Locale, string>>>> = {
  communities: { en: "communities", fr: "collectivités" },
  ridings: { en: "ridings", fr: "circonscriptions" },
  provinces: { en: "provinces", fr: "provinces" },
  "federal-ridings": { en: "federal ridings", fr: "circonscriptions fédérales" },
  "provincial-ridings": { en: "provincial ridings", fr: "circonscriptions provinciales" },
};

/**
 * The one line that stands for a group: its count, what the rows are, and why
 * their loss is Unknown. A group always has at least {@link UNKNOWN_GROUP_MIN}
 * rows, so the line is always plural.
 */
export function unknownGroupHeading(reason: UnknownReason, count: number, noun: UnknownGroupNoun, locale: Locale): string {
  const what = `${count.toLocaleString(locale === "en" ? "en-CA" : "fr-CA")} ${NOUNS[noun][locale]}`;
  if (locale === "en") {
    switch (reason) {
      case "no-satellite-data": return `${what} have no satellite data, so their loss is Unknown`;
      case "partly-mapped": return `${what} are only partly mapped, so their loss is Unknown`;
      case "no-forest-mapped": return `${what} had no forest mapped in 1984, so they have no loss figure`;
      case "no-figure": return `${what} have no released figure, so their loss is Unknown`;
    }
  }
  switch (reason) {
    case "no-satellite-data": return `${what} n’ont pas de données satellitaires, donc leur perte est inconnue`;
    case "partly-mapped": return `${what} ne sont que partiellement cartographiées, donc leur perte est inconnue`;
    case "no-forest-mapped": return `${what} n’avaient aucune forêt cartographiée en 1984, donc elles n’ont pas de chiffre de perte`;
    case "no-figure": return `${what} n’ont pas de chiffre publié, donc leur perte est inconnue`;
  }
}
