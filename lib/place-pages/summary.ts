import { formatHectares, formatPercent, UNION_TERM, type Locale } from "@/lib/domain";
import { formatUnknownSharePercent } from "@/lib/explore/map-style";
import { SITE_ORIGIN } from "@/lib/site-metadata";
import { landCoverProvenance, wholeRecordFigures, type WholeRecordFigures } from "./figures";
import { PLACE_DATA_VERSION, PLACE_METHOD_VERSION, placePagePath } from "./paths";
import { placeProvinceName, type PlacePageRecord } from "./index";

/**
 * The words a place page and its share card both print: the coverage line, the
 * unmapped share, the headline figure and the citation. Kept in one place so
 * the card can never say something the page does not.
 */

const COPY = {
  en: {
    complete: "Fully mapped",
    admitted: (share: string) => `Almost fully mapped: ${share} of the forest has no satellite data, under the 1% this record admits`,
    partial: (share: string) => `Partly mapped: ${share} of the forest has no satellite data`,
    none: "No forest was mapped here in 1984",
    noneUnmapped: "None",
    lost: `${UNION_TERM.en}, 1984–2022`,
    atLeast: "at least ",
    unknown: "Unknown",
    shareUnknown: "share Unknown",
  },
  fr: {
    complete: "Entièrement cartographiée",
    admitted: (share: string) => `Presque entièrement cartographiée\u202F: ${share} de la forêt n’a aucune donnée satellitaire, sous le seuil de 1\u00a0% admis pour ce registre`,
    partial: (share: string) => `Partiellement cartographiée\u202F: ${share} de la forêt n’a aucune donnée satellitaire`,
    none: "Aucune forêt n’était cartographiée ici en 1984",
    noneUnmapped: "Aucune",
    lost: `${UNION_TERM.fr}, 1984–2022`,
    atLeast: "au moins ",
    unknown: "Inconnu",
    shareUnknown: "part inconnue",
  },
} as const;

export type PlaceSummary = Readonly<{
  figures: WholeRecordFigures;
  name: string;
  province: string;
  path: string;
  /** The coverage grade in words, with the unmapped share when there is one. */
  coverage: string;
  /** The unmapped share, or "None". */
  unmapped: string;
  /** The label of the whole-record figure. */
  lostLabel: string;
  /** The hectares, "at least" when a minimum, or "Unknown"; never 0 for an Unknown. */
  lost: string;
  /** The share, or "share Unknown". */
  share: string;
  citation: string;
}>;

export function placeSummary(record: PlacePageRecord, locale: Locale): PlaceSummary {
  const text = COPY[locale];
  const figures = wholeRecordFigures(record.cells, { locale, unknownTolerancePercent: record.unknownTolerancePercent });
  const name = record.name[locale];
  const province = placeProvinceName(record.province)[locale];
  const path = placePagePath(locale, record.geography, record.code);
  const coverage = figures.coverage === "complete"
    ? figures.admittedUnknownPercent === undefined
      ? text.complete
      : text.admitted(formatUnknownSharePercent(figures.admittedUnknownPercent, locale))
    : figures.coverage === "partial-with-unknown"
      ? text.partial(formatUnknownSharePercent(figures.unknownSharePercent!, locale))
      : text.none;
  const unmapped = figures.unknownSharePercent === null || figures.unknownSharePercent === 0
    ? text.noneUnmapped
    : formatUnknownSharePercent(figures.unknownSharePercent, locale);
  const lost = figures.lost.kind === "figure"
    ? `${figures.lostIsMinimum ? text.atLeast : ""}${formatHectares(figures.lost.value, locale)}`
    : text.unknown;
  const share = figures.share.kind === "figure" ? formatPercent(figures.share.value, locale) : text.shareUnknown;
  const provenance = landCoverProvenance(locale);
  const citation = locale === "en"
    ? `${name}, ${record.typeLabel.en.toLowerCase()}, ${province} (${record.boundary.edition}, ${record.code}). ${text.lost}: ${lost}; ${share}. Satellite observation from ${provenance.dataset}. Data version ${PLACE_DATA_VERSION}, method ${PLACE_METHOD_VERSION}. ${SITE_ORIGIN}${path}`
    : `${name}, ${record.typeLabel.fr.toLowerCase()}, ${province} (${record.boundary.edition}, ${record.code}). ${text.lost}\u202F: ${lost}\u202F; ${share}. Observation satellitaire tirée de ${provenance.dataset}. Version des données ${PLACE_DATA_VERSION}, méthode ${PLACE_METHOD_VERSION}. ${SITE_ORIGIN}${path}`;
  return { figures, name, province, path, coverage, unmapped, lostLabel: text.lost, lost, share, citation };
}
