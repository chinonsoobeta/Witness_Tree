import { CoverageBand } from "@/components/policy";
import type { ComparisonPlace } from "@/lib/comparison";
import type { Locale } from "@/lib/domain";

const labels = {
  en: {
    complete: "Complete mapped coverage",
    "partial-with-unknown": "Partial mapped coverage; unknown area remains",
    "none-mapped": "No mapped coverage",
  },
  fr: {
    complete: "Couverture cartographiée complète",
    "partial-with-unknown": "Couverture cartographiée partielle; une zone inconnue demeure",
    "none-mapped": "Aucune couverture cartographiée",
  },
} as const;

export function MeasurementCoverage({ place, locale }: Readonly<{
  place: Pick<ComparisonPlace, "coverageGrade" | "measurementCoverage">;
  locale: Locale;
}>) {
  return place.measurementCoverage
    ? <span className="coverage-band">{labels[locale][place.measurementCoverage]}</span>
    : <CoverageBand coverageGrade={place.coverageGrade} locale={locale} />;
}

export function missingMeasurement(place: Pick<ComparisonPlace, "measurementCoverage">, locale: Locale): string {
  if (place.measurementCoverage === "none-mapped") {
    return locale === "en" ? "– No mapped coverage." : "– Aucune couverture cartographiée.";
  }
  if (place.measurementCoverage === "partial-with-unknown") {
    return locale === "en" ? "– Partial mapped coverage; the measurement is unavailable." : "– Couverture cartographiée partielle; la mesure est indisponible.";
  }
  return locale === "en" ? "– No measured value is available." : "– Aucune valeur mesurée n’est disponible.";
}
