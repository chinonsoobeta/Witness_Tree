import { CoverageBand } from "@/components/policy";
import type { ComparisonPlace } from "@/lib/comparison";
import type { Locale } from "@/lib/domain";

const labels = {
  en: {
    complete: "Fully mapped",
    "partial-with-unknown": "Partly mapped; an unknown area remains",
    "none-mapped": "Not mapped",
  },
  fr: {
    complete: "Entièrement cartographiée",
    "partial-with-unknown": "Partiellement cartographiée\u202F; une zone inconnue demeure",
    "none-mapped": "Non cartographiée",
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
    return locale === "en" ? "– Partial mapped coverage; the measurement is unavailable." : "– Couverture cartographiée partielle\u202F; la mesure est indisponible.";
  }
  return locale === "en" ? "– No measured value is available." : "– Aucune valeur mesurée n’est disponible.";
}
