import { CoverageBand } from "@/components/policy";
import type { ComparisonPlace } from "@/lib/comparison";
import { formatHectares, type Locale } from "@/lib/domain";
import { formatUnknownSharePercent } from "@/lib/explore/map-style";

const labels = {
  en: {
    complete: "Fully mapped",
    "partial-with-unknown": "Partly mapped; an unknown area remains",
    "none-mapped": "Not mapped",
    admitted: (share: string) => `${share} unmapped; the share is of the mapped forest`,
  },
  fr: {
    complete: "Entièrement cartographiée",
    "partial-with-unknown": "Partiellement cartographiée\u202F; une zone inconnue demeure",
    "none-mapped": "Non cartographiée",
    admitted: (share: string) => `${share} non cartographié\u202F; la part porte sur la forêt cartographiée`,
  },
} as const;

export function MeasurementCoverage({ place, locale }: Readonly<{
  place: Pick<ComparisonPlace, "coverageGrade" | "measurementCoverage" | "admittedUnknownPercent">;
  locale: Locale;
}>) {
  if (!place.measurementCoverage) return <CoverageBand coverageGrade={place.coverageGrade} locale={locale} />;
  // A riding admitted under the 1% rule is not fully mapped, and says by how much.
  const text = place.measurementCoverage === "complete" && place.admittedUnknownPercent !== undefined
    ? labels[locale].admitted(formatUnknownSharePercent(place.admittedUnknownPercent, locale))
    : labels[locale][place.measurementCoverage];
  return <span className="coverage-band">{text}</span>;
}

export function missingMeasurement(place: Pick<ComparisonPlace, "measurementCoverage">, locale: Locale): string {
  if (place.measurementCoverage === "none-mapped") {
    return locale === "en" ? "– No mapped coverage." : "– Aucune couverture cartographiée.";
  }
  if (place.measurementCoverage === "partial-with-unknown") {
    return locale === "en" ? "– Partial mapped coverage; the measurement is unavailable." : "– Couverture cartographiée partielle\u202F; la mesure est indisponible.";
  }
  return locale === "en" ? "– No measured value is available." : "– Aucune valeur mesurée n’est disponible.";
}

/**
 * The forested-area figure. A riding with nothing mapped has an unknown forest
 * area, not none, so it carries the coverage reason rather than "0 ha".
 */
export function forestedArea(place: Pick<ComparisonPlace, "measurementCoverage" | "forestedHectares">, locale: Locale): string {
  return place.measurementCoverage !== undefined && place.measurementCoverage !== "complete" && place.forestedHectares === 0
    ? missingMeasurement(place, locale)
    : formatHectares(place.forestedHectares, locale);
}
