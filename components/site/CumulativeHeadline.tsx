import { formatHectares, formatPercent, formatYearRange, yearRange, type Locale } from "@/lib/domain";
import { EXPLORE_INTERVAL_FIRST_YEAR, EXPLORE_INTERVAL_LAST_YEAR } from "@/lib/explore/interval";
import { fourProvinceSpanMeasurement } from "@/lib/explore/province-spans";

/** The whole record, as one span. Item C of the 2026-09-18 admission released it. */
const WHOLE_RECORD = { fromYear: EXPLORE_INTERVAL_FIRST_YEAR, toYear: EXPLORE_INTERVAL_LAST_YEAR };

const COPY = {
  en: {
    eyebrow: "Four provinces",
    heading: "Forest detected as lost",
    claim: "of forest known in 1984 was detected as lost at least once.",
    shareLabel: "Share of the forest this record could see",
    shareBasis: (share: string, known: string) => `${share} of the ${known} of forest the sources mapped in 1984.`,
    gradeLabel: "Coverage of this figure",
    gradeName: "Partial, with unknown",
    gradeBasis: (unknown: string) => `${unknown} of these four provinces were never mapped, so nothing in them was checked. The figure above is a minimum, not a total, and unmapped is never counted as zero.`,
    sumLabel: "Why the yearly figures do not add up to this",
    sumBasis: (summed: string, counts: number) => `Adding the ${counts} yearly figures gives ${summed}. That is a different measure, not a correction to this one: a place cleared twice is counted once here and once in each year there.`,
  },
  fr: {
    eyebrow: "Quatre provinces",
    heading: "Forêt détectée comme perdue",
    claim: "de forêt connue en 1984 a été détectée comme perdue au moins une fois.",
    shareLabel: "Part de la forêt que ce registre pouvait voir",
    shareBasis: (share: string, known: string) => `${share} des ${known} de forêt cartographiés par les sources en 1984.`,
    gradeLabel: "Couverture de ce chiffre",
    gradeName: "Partielle, avec inconnu",
    gradeBasis: (unknown: string) => `${unknown} de ces quatre provinces n’ont jamais été cartographiés, donc rien n’y a été vérifié. Le chiffre ci-dessus est un minimum, et non un total, et une zone non cartographiée n’est jamais comptée comme zéro.`,
    sumLabel: "Pourquoi l’addition des chiffres annuels ne donne pas ce résultat",
    sumBasis: (summed: string, counts: number) => `L’addition des ${counts} chiffres annuels donne ${summed}. Il s’agit d’une autre mesure, et non d’une correction de celle-ci : un lieu coupé deux fois est compté une seule fois ici et une fois par année là.`,
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
  const steps = WHOLE_RECORD.toYear - WHOLE_RECORD.fromYear;

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
      <dl className="cumulative-basis">
        <div>
          <dt>{copy.shareLabel}</dt>
          <dd>{copy.shareBasis(formatPercent(unionLossPercent, locale), formatHectares(knownForestedHectares, locale))}</dd>
        </div>
        <div className="cumulative-basis-grade">
          <dt>{copy.gradeLabel}</dt>
          <dd><strong>{copy.gradeName}.</strong> {copy.gradeBasis(formatHectares(unknownHectares, locale))}</dd>
        </div>
        <div>
          <dt>{copy.sumLabel}</dt>
          <dd>{copy.sumBasis(formatHectares(summedLossHectares, locale), steps)}</dd>
        </div>
      </dl>
    </section>
  );
}
