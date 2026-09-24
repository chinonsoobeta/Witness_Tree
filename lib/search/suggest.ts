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

import { formatHectares, formatPercent, type Locale } from "@/lib/domain";
import { formatUnknownSharePercent } from "@/lib/explore/map-style";
import {
  formatSearchShare,
  ridingSearchRow,
  searchPlaceTypeLabel,
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
  ridings: readonly SuggestionRiding[];
}>;

export type SuggestionPage = Readonly<{ query: string; suggestions: readonly Suggestion[]; more: number }>;

const PROVINCE_CODE_BY_NUMBER: Readonly<Record<string, string>> = { "59": "BC", "48": "AB", "35": "ON", "24": "QC" };

function provinceCode(result: SiteSearchResult) {
  if (result.province !== "CA") return result.province;
  return PROVINCE_CODE_BY_NUMBER[result.id.slice(3, 5)] ?? "CA";
}

type RidingRow = NonNullable<ReturnType<typeof ridingSearchRow>>;

/**
 * A riding's figure as one line of text. The search results page and the
 * suggestions both use it, so a riding reads the same wherever it appears.
 */
export function ridingFigure(row: RidingRow | undefined, locale: Locale): string | null {
  if (!row) return null;
  const text = locale === "en"
    ? { unknown: "Unknown", atLeast: "At least", loss: "detected loss", unknownShare: "unknown share" }
    : { unknown: "Inconnu", atLeast: "Au moins", loss: "perte détectée", unknownShare: "part inconnue" };
  if (row.coverage === "complete" && row.observedLossHectares !== null && row.observedLossPercent !== null) {
    return `${formatHectares(row.observedLossHectares, locale)} · ${formatPercent(row.observedLossPercent, locale)} ${text.loss}`;
  }
  const unknown = row.unknownSharePercent === null ? text.unknown : formatUnknownSharePercent(row.unknownSharePercent, locale);
  if (row.coverage === "partial-with-unknown" && row.knownObservedSubtotalHectares !== null && row.knownObservedSubtotalHectares !== undefined && row.knownObservedSubtotalHectares > 0) {
    return `${text.atLeast} ${formatHectares(row.knownObservedSubtotalHectares, locale)} ${text.loss}; ${unknown} ${text.unknownShare}`;
  }
  return `${text.unknown}; ${unknown} ${text.unknownShare}`;
}

/** Whether {@link ridingFigure} states a detected figure, rather than only an unknown share. */
export function ridingFigureIsDetected(row: RidingRow | undefined): boolean {
  if (!row) return false;
  if (row.coverage === "complete") return row.observedLossHectares !== null && row.observedLossPercent !== null;
  return row.coverage === "partial-with-unknown" && (row.knownObservedSubtotalHectares ?? 0) > 0;
}

/** A riding's level and province, such as "Federal riding · QC", read the same in results and suggestions. */
export function ridingMeta(result: SiteSearchResult, locale: Locale): string {
  const level = result.id.startsWith("CA-") ? "federal" : "provincial";
  const levelName = locale === "en"
    ? (level === "federal" ? "Federal riding" : "Provincial riding")
    : (level === "federal" ? "Circonscription fédérale" : "Circonscription provinciale");
  return `${levelName} · ${provinceCode(result)}`;
}

function compareHref(ridingId: string, locale: Locale) {
  if (!ridingId.startsWith("CA-")) return null;
  return `${locale === "en" ? "/en/compare" : "/fr/comparer"}?left=${encodeURIComponent(`federal-${ridingId.slice(3)}`)}`;
}

function completeFigure(row: RidingRow | undefined, locale: Locale) {
  return row && row.coverage === "complete" && row.observedLossPercent !== null
    ? formatPercent(row.observedLossPercent, locale)
    : null;
}

function ridingDetail(row: RidingRow | undefined, locale: Locale) {
  if (row && row.coverage === "complete" && row.observedLossHectares !== null) {
    return `${formatHectares(row.observedLossHectares, locale)} · ${locale === "en" ? "Fully mapped" : "Entièrement cartographiée"}`;
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
    compareHref: level === "federal" ? compareHref(reference.id, locale) : null,
  };
}

function toSuggestion(result: SiteSearchResult, locale: Locale): Suggestion {
  const name = locale === "fr" && result.nameFr ? result.nameFr : result.name;
  const code = provinceCode(result);
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
        ? `${hectares} · A minimum: ${unknown} of the province was never mapped`
        : `${hectares} · Un minimum : ${unknown} de la province n’a jamais été cartographié`,
      compareHref: null,
      ridings: [],
    };
  }
  if (result.kind === "riding") {
    const row = ridingSearchRow(result.id);
    return {
      kind: "riding",
      id: result.id,
      name,
      meta: ridingMeta(result, locale),
      figure: completeFigure(row, locale),
      detail: ridingDetail(row, locale),
      compareHref: compareHref(result.id, locale),
      ridings: [],
    };
  }
  const federal = (result.federal ?? []).map((reference) => suggestionRiding(reference, "federal", locale));
  const provincial = (result.provincial ?? []).map((reference) => suggestionRiding(reference, "provincial", locale));
  const count = federal.length + provincial.length;
  const inRidings = locale === "en"
    ? `in ${count} riding${count === 1 ? "" : "s"}`
    : `dans ${count} circonscription${count === 1 ? "" : "s"}`;
  return {
    kind: "community",
    id: result.id,
    name,
    meta: `${searchPlaceTypeLabel(result.type!, locale)} · ${code} · ${inRidings}`,
    figure: null,
    detail: locale === "en"
      ? "Each riding’s figure is for the whole riding. The share is the part of the community inside it."
      : "Le chiffre de chaque circonscription porte sur toute la circonscription. La part est la portion de la collectivité qui s’y trouve.",
    compareHref: null,
    ridings: [...federal, ...provincial],
  };
}

/** Suggestions for a query, grouped communities first, then ridings, then provinces. */
export function suggestSearch(query: string, locale: Locale): SuggestionPage {
  const trimmed = query.trim();
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
