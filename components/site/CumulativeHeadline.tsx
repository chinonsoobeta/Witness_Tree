import { colon, formatHectares, formatPercent, formatYearRange, SUM_TERM, yearRange, type Locale } from "@/lib/domain";
import { EXPLORE_INTERVAL_FIRST_YEAR, EXPLORE_INTERVAL_LAST_YEAR } from "@/lib/explore/interval";
import { fourProvinceSpanMeasurement } from "@/lib/explore/province-spans";

/** The whole record, as one span. Item C of the 2026-09-18 admission released it. */
const WHOLE_RECORD = { fromYear: EXPLORE_INTERVAL_FIRST_YEAR, toYear: EXPLORE_INTERVAL_LAST_YEAR };

const COPY = {
  en: {
    eyebrow: "Four provinces",
    heading: "Forest detected as lost",
    claim: "of the forest mapped in 1984 was detected as lost at least once.",
    minimumLead: "This is a minimum.",
    minimumBody: "Satellites mapped only part of each province, and the rest counts as unknown, never as zero. If something isn’t shown here, that doesn’t mean it didn’t happen.",
    shareLabel: "Share of the mapped forest",
    shareBasis: (share: string, known: string) => `${share} of the ${known} of forest mapped in 1984`,
    gradeLabel: "Coverage of this figure",
    gradeName: "Partial, with unknown",
    gradeBasis: (unknown: string) => `${unknown} were never mapped`,
    sumBasis: (summed: string) => `${summed}. That is a different measure, not a correction: a place lost in two different years counts twice here, but once in the figure above.`,
  },
  fr: {
    eyebrow: "Quatre provinces",
    heading: "Forêt détectée comme perdue",
    claim: "de la forêt cartographiée en 1984 a été détectée comme perdue au moins une fois.",
    minimumLead: "C’est un minimum.",
    minimumBody: "Les satellites n’ont cartographié qu’une partie de chaque province, et le reste compte comme inconnu, jamais comme zéro. Si quelque chose n’apparaît pas ici, cela ne veut pas dire que cela ne s’est pas produit.",
    shareLabel: "Part de la forêt cartographiée",
    shareBasis: (share: string, known: string) => `${share} des ${known} de forêt cartographiés en 1984`,
    gradeLabel: "Couverture de ce chiffre",
    gradeName: "Partielle, avec inconnu",
    gradeBasis: (unknown: string) => `${unknown} n’ont jamais été cartographiés`,
    sumBasis: (summed: string) => `${summed}. Il s’agit d’une autre mesure, et non d’une correction : un lieu perdu au cours de deux années différentes compte deux fois ici, mais une seule fois dans le chiffre ci-dessus.`,
  },
} as const;

/**
 * The record's largest figure, with everything that bounds it in the same block.
 *
 * The number and its limits are one visual unit because they are one claim.
 * The span, the denominator, the unmapped share and the reason the annual rows
 * do not add up to this are not footnotes to the figure: each of them changes
 * what the figure means, and a reader who takes the number without them has
 * taken a total from a product that does not publish one.
 *
 * It renders nothing at all if the span cannot be measured for all four
 * provinces. A partial headline would be a fifth kind of number on a page whose
 * whole argument is that every figure carries its basis.
 */
export function CumulativeHeadline({ locale }: Readonly<{ locale: Locale }>) {
  const measurement = fourProvinceSpanMeasurement(WHOLE_RECORD);
  const { unionLossHectares, knownForestedHectares, unionLossPercent, summedLossHectares, unknownHectares } = measurement ?? {};
  if (
    unionLossHectares == null || knownForestedHectares == null || unionLossPercent == null ||
    summedLossHectares == null || unknownHectares == null
  ) return null;

  const copy = COPY[locale];
  const span = formatYearRange(yearRange(WHOLE_RECORD.fromYear, WHOLE_RECORD.toYear), locale, "compact");

  return (
    <section className="content-section cumulative-headline" aria-labelledby="cumulative-headline-heading">
      {/* The span rides on the heading, not on the eyebrow: a heading read on
          its own, out of the page, still has to say which years it covers. */}
      <p className="eyebrow">{copy.eyebrow}</p>
      <h2 id="cumulative-headline-heading">{`${copy.heading}, ${span}`}</h2>
      {/*
        The figure is exact to the hectare. Rounding it to a readable headline
        would put a number on the page that appears nowhere in the record, and
        the record is the thing being published.
      */}
      <p className="cumulative-figure">{formatHectares(unionLossHectares, locale)}</p>
      <p className="cumulative-claim">{copy.claim}</p>
      {/* The minimum is said inside the unit, next to the number it bounds.
          It used to be a separate banner under this panel. */}
      <p className="cumulative-minimum">
        <span className="mark-glyph mark-glyph--unknown" aria-hidden="true" />
        <span><strong>{copy.minimumLead}</strong> {copy.minimumBody}</span>
      </p>
      <dl className="cumulative-basis">
        <div>
          <dt>{copy.shareLabel}</dt>
          <dd>{copy.shareBasis(formatPercent(unionLossPercent, locale), formatHectares(knownForestedHectares, locale))}</dd>
        </div>
        <div className="cumulative-basis-grade">
          <dt>{copy.gradeLabel}</dt>
          <dd><strong>{copy.gradeName}{colon(locale)}</strong> {copy.gradeBasis(formatHectares(unknownHectares, locale))}</dd>
        </div>
        <div>
          <dt>{SUM_TERM[locale]}</dt>
          <dd>{copy.sumBasis(formatHectares(summedLossHectares, locale))}</dd>
        </div>
      </dl>
    </section>
  );
}
