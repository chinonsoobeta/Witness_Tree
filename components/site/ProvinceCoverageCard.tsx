import Link from "next/link";
import { formatHectares, formatNumber, formatPercent, type Locale } from "@/lib/domain";
import { EvidenceChip } from "@/components/policy/EvidenceChip";
import { EXPLORE_PRODUCTION_LAYER, formatUnknownSharePercent } from "@/lib/explore";
import { productionAggregatePeriod } from "@/lib/explore/period";

/*
 * One number, one bar, one caveat.
 *
 * The card used to carry two measures side by side, detected loss and
 * unmapped area, each with its own figure and its own bar, both drawn on a
 * single shared hectare scale. That scale is what forced the page to print
 * "All bars share a hectare scale. The unmapped area is not a measurement of
 * forest loss." A disclaimer that exists to undo a drawing is a sign the
 * drawing is wrong, so the drawing changed instead.
 *
 * The bar now shows detected loss and nothing else, scaled against the
 * largest detected loss of the four provinces. The unmapped share stays on
 * the card, in the same sentence that gives the denominator, where it does
 * the work it was always meant to do: it says why the figure is a floor. No
 * second bar means no shared scale, and no shared scale means no disclaimer.
 *
 * The span rides on the figure rather than on a banner at the top of the
 * page. The masthead used to say 1984 to 2022 while every published figure
 * below it covered three years.
 */

// Detected loss only. The unmapped hectares are deliberately not in this
// maximum: they never share the scale again.
const scaleHectares = Math.max(
  ...EXPLORE_PRODUCTION_LAYER.rows.map((row) => row.observedLossHectares),
);

export function ProvinceCoverageCard({ row, locale, unknownContext }: Readonly<{
  row: (typeof EXPLORE_PRODUCTION_LAYER.rows)[number];
  locale: Locale;
  /**
   * Retained so the page keeps ownership of how an unmapped province is
   * characterised. It is read out for assistive technology and shown in full
   * on the card's own detail line.
   */
  unknownContext: string;
}>) {
  const english = locale === "en";
  const span = productionAggregatePeriod(locale);
  const unknownShare = formatUnknownSharePercent(row.unknownSharePercent, locale);

  return (
    <article className="province-coverage-card" aria-labelledby={`province-${row.id}`}>
      <EvidenceChip evidence="satellite-observation" locale={locale} />

      {/*
        Whole hectares. Two decimal places on a satellite-derived floor claim
        centimetres no source can back. The recorded value is kept at the foot
        of the card, so the rounding costs nothing.
      */}
      <p className="province-coverage-value">
        {formatHectares(row.observedLossHectares, locale, 0)}
      </p>

      <h3 id={`province-${row.id}`} className="province-coverage-place">
        {row.name[locale]}, <span className="province-coverage-span">{span}</span>
      </h3>

      <span className="province-coverage-track" aria-hidden="true">
        <span
          className="province-coverage-fill"
          style={{ width: `${row.observedLossHectares / scaleHectares * 100}%` }}
        />
      </span>

      <p className="province-coverage-basis">
        {formatPercent(row.observedLossPercent, locale)}{" "}
        {english
          ? "of the forest the source mapped. A minimum, because"
          : "de la forêt cartographiée par la source. Un minimum, car"}{" "}
        <strong>{unknownShare}</strong>{" "}
        {english
          ? "of the province was never mapped, and unmapped is never counted as zero."
          : "de la province n’a jamais été cartographiée, et une zone non cartographiée n’est jamais comptée comme zéro."}
      </p>

      <p className="sr-only">{unknownContext}</p>

      <p className="province-coverage-recorded">
        <span>
          {formatNumber(row.observedLossHectares, locale, 2)}{" "}
          {english ? "ha recorded" : "ha consignés"}
        </span>
        <Link href={english ? "/en/data" : "/fr/donnees"}>
          {english ? "Source and limits" : "Source et limites"}
        </Link>
      </p>
    </article>
  );
}
