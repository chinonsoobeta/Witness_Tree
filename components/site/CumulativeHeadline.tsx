import { formatHectares, formatPercent, formatYearRange, SUM_TERM, yearRange, type Locale } from "@/lib/domain";
import { EXPLORE_INTERVAL_FIRST_YEAR, EXPLORE_INTERVAL_LAST_YEAR } from "@/lib/explore/interval";
import { fourProvinceSpanMeasurement } from "@/lib/explore/province-spans";

/** The whole record, as one span. Item C of the 2026-09-18 admission released it. */
const WHOLE_RECORD = { fromYear: EXPLORE_INTERVAL_FIRST_YEAR, toYear: EXPLORE_INTERVAL_LAST_YEAR };

const COPY = {
  en: {
    eyebrow: "Four provinces",
    heading: "Forest detected as lost",
    unionLabel: "Lost at least once",
    unionBasis: (share: string, known: string) =>
      `${share} of the ${known} of forest mapped in 1984. A place counts once, however many times it was cleared.`,
    sumBasis: "A place cleared in two different years counts twice, so this is larger. It has no percentage, because it can count the same forest more than once.",
    minimumLead: "Both are minimums.",
    minimumBody: (unknown: string) =>
      `The satellite source covers only Canada’s forest regions, so ${unknown} of these provinces have no data. Loss there counts as unknown, not zero.`,
  },
  fr: {
    eyebrow: "Quatre provinces",
    heading: "Forêt détectée comme perdue",
    unionLabel: "Perdue au moins une fois",
    unionBasis: (share: string, known: string) =>
      `${share} des ${known} de forêt cartographiés en 1984. Un lieu compte une seule fois, peu importe le nombre de coupes.`,
    sumBasis: "Un lieu coupé au cours de deux années différentes compte deux fois\u202F; ce chiffre est donc plus élevé. Il n’a pas de pourcentage, car il peut compter la même forêt plus d’une fois.",
    minimumLead: "Ce sont deux minimums.",
    minimumBody: (unknown: string) =>
      `La source satellitaire ne couvre que les régions forestières du Canada\u202F: ${unknown} de ces provinces n’ont donc pas de données. Les pertes à cet endroit comptent comme inconnues, pas comme nulles.`,
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
        Two measures of the same loss, set as equals. The union counts a place
        once and carries a share; the yearly sum counts a place each time it
        was lost and carries none. Neither corrects the other. The figures are
        exact to the hectare, because rounding would put a number on the page
        that appears nowhere in the record.
      */}
      <div className="cumulative-pair">
        <div className="cumulative-measure">
          <p className="cumulative-label">{copy.unionLabel}</p>
          <p className="cumulative-figure">{formatHectares(unionLossHectares, locale)}</p>
          <p className="cumulative-claim">{copy.unionBasis(formatPercent(unionLossPercent, locale), formatHectares(knownForestedHectares, locale))}</p>
        </div>
        <div className="cumulative-measure">
          <p className="cumulative-label">{SUM_TERM[locale]}</p>
          <p className="cumulative-figure">{formatHectares(summedLossHectares, locale)}</p>
          <p className="cumulative-claim">{copy.sumBasis}</p>
        </div>
      </div>
      <p className="cumulative-minimum">
        <span className="mark-glyph mark-glyph--unknown" aria-hidden="true" />
        <span><strong>{copy.minimumLead}</strong> {copy.minimumBody(formatHectares(unknownHectares, locale))}</span>
      </p>
    </section>
  );
}
