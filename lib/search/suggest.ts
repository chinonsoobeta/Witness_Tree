/**
 * Search suggestions, as display-ready text in one locale.
 *
 * The search field suggests places as the reader types. The suggestions come
 * from the same `searchSite` the results page uses, so the two can only differ
 * in how many rows they show, never in which rows match or what their figures
 * say. They are formatted here, on the server, so the browser needs neither the
 * riding table nor the place-name index behind them: every response is a few
 * rows of text.
 */

import { colon, formatHectares, formatPercent, semicolon, type Locale } from "@/lib/domain";
import { formatUnknownSharePercent } from "@/lib/explore/map-style";
import { communityPagePath, ridingPagePath } from "@/lib/place-pages/paths";
import { placeFigure, type PlaceFigure } from "./place-figures";
import { cleanSearchQuery } from "./query";
import { figureUnknownReason, splitUnknownRows, unknownGroupHeading, type UnknownReason } from "./unknown-groups";
import {
  formatSearchShare,
  ridingSearchRow,
  searchPlaceTypeLabel,
  searchProvinceName,
  searchSite,
  type SearchRidingReference,
  type SiteSearchResult,
} from "./site-search";

/** Suggestions shown per kind. The full results page still lists up to 20. */
export const SUGGESTION_LIMITS = { community: 3, riding: 5, province: 4 } as const;

export type SuggestionRiding = Readonly<{
  level: "federal" | "provincial";
  name: string;
  share: string;
  figure: string | null;
  detail: string;
  compareHref: string | null;
  /** The riding's own page. */
  href: string | null;
  /** Null when the whole riding has a detected figure; otherwise why its loss is Unknown. */
  unknownReason: UnknownReason | null;
}>;

export type Suggestion = Readonly<{
  kind: SiteSearchResult["kind"];
  id: string;
  name: string;
  meta: string;
  /** The share of the mapped forest detected as lost, when the figure is complete. */
  figure: string | null;
  /** One line under the figure: the hectares and coverage, or why there is no share. */
  detail: string;
  compareHref: string | null;
  /** The community's or riding's own page; a province has none. */
  href: string | null;
  /** Null when the row has a detected figure; otherwise why its loss is Unknown. */
  unknownReason: UnknownReason | null;
  /** For a place: what its riding figures cover, shown above them. */
  ridingsNote?: string;
  ridings: readonly SuggestionRiding[];
  /**
   * For a place: the ridings of one level and one Unknown reason that read as
   * one counted line, with that line already written. Their rows stay in
   * `ridings`; the field gathers them by level and reason.
   */
  ridingGroups?: readonly SuggestionRidingGroup[];
}>;

export type SuggestionRidingGroup = Readonly<{ level: SuggestionRiding["level"]; reason: UnknownReason; heading: string }>;

export type SuggestionPage = Readonly<{ query: string; suggestions: readonly Suggestion[]; more: number }>;

const PROVINCE_CODE_BY_NUMBER: Readonly<Record<string, string>> = { "59": "BC", "48": "AB", "35": "ON", "24": "QC" };

function provinceCode(result: SiteSearchResult) {
  if (result.province !== "CA") return result.province;
  return PROVINCE_CODE_BY_NUMBER[result.id.slice(3, 5)] ?? "CA";
}

/** The fields a figure line reads, which a riding and a place both carry. */
type RidingRow = Pick<
  NonNullable<ReturnType<typeof ridingSearchRow>>,
  "coverage" | "observedLossHectares" | "observedLossPercent" | "knownObservedSubtotalHectares" | "unknownSharePercent"
> & Readonly<{ admittedUnknownPercent?: number }>;

/**
 * A riding's figure as one line of text. The search results page and the
 * suggestions both use it, so a riding reads the same wherever it appears.
 */
export function ridingFigure(row: RidingRow | undefined, locale: Locale): string | null {
  if (!row) return null;
  const text = locale === "en"
    ? { unknown: "Unknown", lossUnknown: "Loss unknown", atLeast: "At least", share: "of the mapped forest detected as lost", lost: "detected as lost", unknownShare: "of the forest is unknown", unmapped: "unmapped", noSatellite: "no satellite data here", noForest: "No forest was mapped here in 1984" }
    : { unknown: "Inconnu", lossUnknown: "Perte inconnue", atLeast: "Au moins", share: "de la forêt cartographiée détectée comme perdue", lost: "détectés comme perdus", unknownShare: "de la forêt est inconnue", unmapped: "non cartographié", noSatellite: "aucune donnée satellitaire ici", noForest: "Aucune forêt n’était cartographiée ici en 1984" };
  if (row.coverage === "complete" && row.observedLossHectares !== null && row.observedLossPercent !== null) {
    const unmapped = row.admittedUnknownPercent === undefined ? "" : ` · ${formatUnknownSharePercent(row.admittedUnknownPercent, locale)} ${text.unmapped}`;
    return `${formatHectares(row.observedLossHectares, locale)} · ${formatPercent(row.observedLossPercent, locale)} ${text.share}${unmapped}`;
  }
  // Not reached by the satellite source at all: say that, not "100% unknown".
  const reason = figureUnknownReason(row);
  if (reason === "no-satellite-data") return `${text.lossUnknown}${semicolon(locale)} ${text.noSatellite}`;
  if (reason === "no-forest-mapped") return text.noForest;
  const unknown = row.unknownSharePercent === null || row.unknownSharePercent === undefined ? null : `${formatUnknownSharePercent(row.unknownSharePercent, locale)} ${text.unknownShare}`;
  if (row.coverage === "partial-with-unknown" && row.knownObservedSubtotalHectares !== null && row.knownObservedSubtotalHectares !== undefined && row.knownObservedSubtotalHectares > 0) {
    return `${text.atLeast} ${formatHectares(row.knownObservedSubtotalHectares, locale)} ${text.lost}${unknown ? `${semicolon(locale)} ${unknown}` : ""}`;
  }
  return unknown ? `${text.lossUnknown}${semicolon(locale)} ${unknown}` : text.unknown;
}

/** Whether {@link ridingFigure} states a detected figure, rather than only an unknown share. */
export function ridingFigureIsDetected(row: RidingRow | undefined): boolean {
  return figureUnknownReason(row) === null;
}

/**
 * What a result is and where, such as "Federal riding · Québec" or
 * "Community · City · British Columbia", read the same in results and
 * suggestions. A community that shares its name, type and province with
 * another match also names the federal riding holding most of it.
 */
export function resultMeta(result: SiteSearchResult, locale: Locale): string {
  const province = searchProvinceName(provinceCode(result), locale);
  if (result.kind === "province") return "Province";
  if (result.kind === "riding") {
    const federal = result.id.startsWith("CA-");
    const level = locale === "en"
      ? (federal ? "Federal riding" : "Provincial riding")
      : (federal ? "Circonscription fédérale" : "Circonscription provinciale");
    return `${level} · ${province}`;
  }
  const kind = locale === "en" ? "Community" : "Collectivité";
  const parts = [kind, searchPlaceTypeLabel(result.type!, locale), province];
  if (result.distinguishedBy) {
    parts.push(`${locale === "en" ? "Federal riding" : "Circonscription fédérale"}${colon(locale)} ${result.distinguishedBy[locale]}`);
  }
  return parts.join(" · ");
}

/**
 * The Compare page with a riding on the left. Search ids map onto Compare ids
 * (see lib/comparison/real-adapter.ts): `CA-59001` is `federal-59001`, and a
 * provincial `BC-258` is `provincial-BC-258`. Compare covers provincial
 * ridings in British Columbia, Alberta, Ontario and Québec only; any other id
 * has no Compare page.
 */
export function ridingCompareHref(ridingId: string, locale: Locale) {
  const base = locale === "en" ? "/en/compare" : "/fr/comparer";
  if (ridingId.startsWith("CA-")) return `${base}?left=${encodeURIComponent(`federal-${ridingId.slice(3)}`)}`;
  if (/^(BC|AB|ON|QC)-./.test(ridingId)) return `${base}?left=${encodeURIComponent(`provincial-${ridingId}`)}`;
  return null;
}

function completeFigure(row: RidingRow | undefined, locale: Locale) {
  return row && row.coverage === "complete" && row.observedLossPercent !== null
    ? formatPercent(row.observedLossPercent, locale)
    : null;
}

/**
 * A place's own figure line. A city the satellite source doesn't reach says
 * so, rather than reading as a place that lost nothing.
 */
export function placeDetail(figure: PlaceFigure | undefined, locale: Locale): string {
  if (figure?.noSatelliteData) {
    return locale === "en"
      ? "No satellite data here. The source covers only Canada’s forest regions, so any loss here is unknown."
      : "Aucune donnée satellitaire ici. La source ne couvre que les régions forestières du Canada, donc toute perte ici est inconnue.";
  }
  if (figure?.coverage === "none-mapped") {
    return locale === "en" ? "No forest was mapped here in 1984." : "Aucune forêt n’était cartographiée ici en 1984.";
  }
  if (figure?.coverage === "complete" && figure.observedLossHectares !== null) {
    return `${formatHectares(figure.observedLossHectares, locale)} · ${locale === "en" ? "Fully mapped" : "Entièrement cartographiée"}`;
  }
  return ridingFigure(figure, locale) ?? (locale === "en" ? "No figure for this place." : "Aucun chiffre pour ce lieu.");
}

function ridingDetail(row: RidingRow | undefined, locale: Locale) {
  if (row && row.coverage === "complete" && row.observedLossHectares !== null) {
    // A riding admitted under the 1% rule is not fully mapped, and says by how much.
    const mapped = row.admittedUnknownPercent === undefined
      ? (locale === "en" ? "Fully mapped" : "Entièrement cartographiée")
      : `${formatUnknownSharePercent(row.admittedUnknownPercent, locale)} ${locale === "en" ? "unmapped" : "non cartographié"}`;
    return `${formatHectares(row.observedLossHectares, locale)} · ${mapped}`;
  }
  return ridingFigure(row, locale) ?? (locale === "en" ? "No figure is released for this riding." : "Aucun chiffre n’est publié pour cette circonscription.");
}

function suggestionRiding(reference: SearchRidingReference, level: "federal" | "provincial", locale: Locale): SuggestionRiding {
  const row = ridingSearchRow(reference.id);
  return {
    level,
    name: locale === "fr" ? reference.nameFr : reference.name,
    share: formatSearchShare(reference.share, locale),
    figure: completeFigure(row, locale),
    detail: ridingDetail(row, locale),
    compareHref: level === "federal" ? ridingCompareHref(reference.id, locale) : null,
    href: ridingPagePath(locale, reference.id),
    unknownReason: reference.unknownReason,
  };
}

function toSuggestion(result: SiteSearchResult, locale: Locale): Suggestion {
  const name = locale === "fr" && result.nameFr ? result.nameFr : result.name;
  if (result.kind === "province") {
    const unknown = result.unknownSharePercent === null || result.unknownSharePercent === undefined
      ? (locale === "en" ? "Unknown" : "Inconnu")
      : formatUnknownSharePercent(result.unknownSharePercent, locale);
    const hectares = result.unionLossHectares === null || result.unionLossHectares === undefined
      ? (locale === "en" ? "Unknown" : "Inconnu")
      : formatHectares(result.unionLossHectares, locale);
    return {
      kind: "province",
      id: result.id,
      name,
      meta: "Province",
      figure: result.unionLossPercent === null || result.unionLossPercent === undefined ? null : formatPercent(result.unionLossPercent, locale),
      detail: locale === "en"
        ? `${hectares} · A minimum: ${unknown} of the province has no satellite data`
        : `${hectares} · Un minimum\u202F: ${unknown} de la province n’a pas de données satellitaires`,
      compareHref: null,
      href: null,
      unknownReason: result.unknownReason,
      ridings: [],
    };
  }
  if (result.kind === "riding") {
    const row = ridingSearchRow(result.id);
    return {
      kind: "riding",
      id: result.id,
      name,
      meta: resultMeta(result, locale),
      figure: completeFigure(row, locale),
      detail: ridingDetail(row, locale),
      compareHref: ridingCompareHref(result.id, locale),
      href: ridingPagePath(locale, result.id),
      unknownReason: result.unknownReason,
      ridings: [],
    };
  }
  const figure = placeFigure(result.id);
  const federal = (result.federal ?? []).map((reference) => suggestionRiding(reference, "federal", locale));
  const provincial = (result.provincial ?? []).map((reference) => suggestionRiding(reference, "provincial", locale));
  return {
    kind: "community",
    id: result.id,
    name,
    meta: resultMeta(result, locale),
    figure: completeFigure(figure, locale),
    detail: placeDetail(figure, locale),
    compareHref: null,
    href: communityPagePath(locale, result.id),
    unknownReason: result.unknownReason,
    ridingsNote: locale === "en"
      ? `The ridings it’s in. Their figures are for the whole riding.`
      : `Les circonscriptions où il se trouve. Leurs chiffres portent sur toute la circonscription.`,
    ridings: [...federal, ...provincial],
    ridingGroups: (["federal", "provincial"] as const).flatMap((level) =>
      splitUnknownRows(level === "federal" ? federal : provincial, (riding) => riding.unknownReason).groups.map((group) => ({
        level,
        reason: group.reason,
        heading: unknownGroupHeading(group.reason, group.rows.length, level === "federal" ? "federal-ridings" : "provincial-ridings", locale),
      })),
    ),
  };
}

/** Suggestions for a query, grouped communities first, then ridings, then provinces. */
export function suggestSearch(query: string, locale: Locale): SuggestionPage {
  const trimmed = cleanSearchQuery(query);
  if (trimmed.length < 2) return { query: trimmed, suggestions: [], more: 0 };
  const page = searchSite(trimmed);
  const order = ["community", "riding", "province"] as const;
  const suggestions = order.flatMap((kind) =>
    page.results
      .filter((result) => result.kind === kind)
      .slice(0, SUGGESTION_LIMITS[kind])
      .map((result) => toSuggestion(result, locale)),
  );
  const matched = page.results.length + page.more.province + page.more.riding + page.more.community;
  return { query: trimmed, suggestions, more: Math.max(0, matched - suggestions.length) };
}
