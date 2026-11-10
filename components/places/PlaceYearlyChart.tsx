import { formatHectares, formatNumber, type Locale } from "@/lib/domain";
import type { YearlyRow } from "@/lib/place-pages/yearly";

/**
 * Detected loss for each year, 1985 to 2022, on a place page: a server-rendered
 * bar chart and the same rows as a table. A year with no figure is a dashed
 * gap, never a zero bar; a minimum is hatched and says "at least" in the table.
 * The years are not added up anywhere, because a place lost twice counts in
 * both years.
 */

const COPY = {
  en: {
    heading: "Detected loss, year by year",
    note: "Each bar is that year’s own detected forest loss, in hectares (ha). 1985 means the change from 1984 to 1985. Forest lost in two different years counts in both, so the bars don’t add up to the figure above.",
    base: "Each year is measured against the forest mapped at that year’s start, which is not always the forest mapped in 1984.",
    larger: "Here at least one year is larger than the 1984–2022 figure above: that year’s forest includes land that was not mapped as forest in 1984, and the figure above counts only forest mapped in 1984.",
    minimum: "Hatched bars are minimums: part of the forest had no satellite data that year, so the true loss may be larger.",
    gap: "A dashed gap is a year with no figure: no forest was mapped, or nothing was detected where only part was mapped. It is Unknown, not zero.",
    causes: "Harvest and fire are recorded by province only for now, not for each place.",
    causesLink: "See harvest and fire by province",
    axis: "Hectares",
    table: "Show the years as a table",
    year: "Year",
    loss: "Detected loss (ha)",
    atLeast: (value: string) => `at least ${value}`,
    unknown: "Unknown",
    reasons: {
      "no-forest-mapped": "No forest was mapped at the start of this year",
      "nothing-detected-where-mapped": "Nothing detected where mapped; part of the forest has no satellite data",
    },
    summary: (max: string, year: number) => `Bar chart of detected forest loss in hectares for each year from 1985 to 2022. The largest is ${max} in ${year}. The table that follows gives every year.`,
    empty: "Bar chart of detected forest loss for each year from 1985 to 2022. No year has a figure above zero. The table that follows gives every year.",
  },
  // Draft French for the owner's review (2026-11-10).
  fr: {
    heading: "Perte détectée, année par année",
    note: "Chaque barre est la perte de forêt détectée de l’année elle-même, en hectares (ha). 1985 désigne le changement de 1984 à 1985. Une forêt perdue au cours de deux années différentes compte dans les deux\u202F; les barres ne s’additionnent donc pas pour donner le chiffre ci-dessus.",
    base: "Chaque année est mesurée par rapport à la forêt cartographiée au début de cette année, qui n’est pas toujours la forêt cartographiée en 1984.",
    larger: "Ici, au moins une année dépasse le chiffre de 1984 à 2022 ci-dessus\u202F: la forêt de cette année comprend des terres qui n’étaient pas cartographiées comme forêt en 1984, alors que le chiffre ci-dessus ne compte que la forêt cartographiée en 1984.",
    minimum: "Les barres hachurées sont des minimums\u202F: une partie de la forêt n’avait pas de données satellitaires cette année-là, et la perte réelle peut être plus grande.",
    gap: "Un espace en pointillé est une année sans chiffre\u202F: aucune forêt n’était cartographiée, ou rien n’a été détecté là où seule une partie était cartographiée. C’est inconnu, et non zéro.",
    causes: "La récolte et les incendies ne sont consignés que par province pour l’instant, et non pour chaque lieu.",
    causesLink: "Voir la récolte et les incendies par province",
    axis: "Hectares",
    table: "Afficher les années sous forme de tableau",
    year: "Année",
    loss: "Perte détectée (ha)",
    atLeast: (value: string) => `au moins ${value}`,
    unknown: "Inconnu",
    reasons: {
      "no-forest-mapped": "Aucune forêt n’était cartographiée au début de cette année",
      "nothing-detected-where-mapped": "Rien de détecté là où c’était cartographié\u202F; une partie de la forêt n’a pas de données satellitaires",
    },
    summary: (max: string, year: number) => `Diagramme à barres de la perte de forêt détectée, en hectares, pour chaque année de 1985 à 2022. La plus grande est de ${max} en ${year}. Le tableau qui suit donne chaque année.`,
    empty: "Diagramme à barres de la perte de forêt détectée pour chaque année de 1985 à 2022. Aucune année n’a de chiffre au-dessus de zéro. Le tableau qui suit donne chaque année.",
  },
} as const;

const WIDTH = 760;
const HEIGHT = 250;
const LEFT = 64;
const RIGHT = 8;
const TOP = 28;
const BASELINE = HEIGHT - 30;

/** The smallest 1, 2 or 5 times a power of ten at or above the value. */
function niceCeiling(value: number) {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 5, 10]) if (step * power >= value) return step * power;
  return 10 * power;
}

export function PlaceYearlyChart({ rows, locale, wholeRecordHectares }: Readonly<{
  rows: readonly YearlyRow[];
  locale: Locale;
  /** The page's 1984–2022 forest lost at least once, when it is a figure; a year above it is explained. */
  wholeRecordHectares: number | null;
}>) {
  const text = COPY[locale];
  const valued = rows.filter((row) => row.kind !== "unknown") as readonly Extract<YearlyRow, { hectares: number }>[];
  const largest = valued.reduce<(typeof valued)[number] | null>((best, row) => (best === null || row.hectares > best.hectares ? row : best), null);
  const top = niceCeiling(largest?.hectares ?? 0);
  const step = (WIDTH - LEFT - RIGHT) / rows.length;
  const barWidth = Math.max(4, step * 0.66);
  const plot = BASELINE - TOP;
  const exceeds = wholeRecordHectares !== null && valued.some((row) => row.hectares > wholeRecordHectares);
  const hasMinimum = rows.some((row) => row.kind === "minimum");
  const hasGap = rows.some((row) => row.kind === "unknown");
  const described = largest && largest.hectares > 0 ? text.summary(formatHectares(largest.hectares, locale), largest.year) : text.empty;
  const value = (row: YearlyRow) =>
    row.kind === "figure" ? formatHectares(row.hectares, locale)
      : row.kind === "minimum" ? text.atLeast(formatHectares(row.hectares, locale))
        : text.unknown;

  return (
    <section className="place-yearly" aria-labelledby="place-yearly-heading">
      <h2 className="eyebrow" id="place-yearly-heading">{text.heading}</h2>
      <p className="place-yearly-note">{text.note} {text.base}{exceeds ? ` ${text.larger}` : ""}</p>
      <figure className="place-yearly-figure">
        <div className="place-yearly-scroll" tabIndex={0} role="region" aria-label={text.heading}>
        <svg className="place-yearly-chart" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-labelledby="place-yearly-title place-yearly-desc">
          <title id="place-yearly-title">{text.heading}</title>
          <desc id="place-yearly-desc">{described}</desc>
          <defs>
            <pattern id="place-yearly-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect className="place-yearly-hatch-ground" width="6" height="6" />
              <line className="place-yearly-hatch-line" x1="0" y1="0" x2="0" y2="6" />
            </pattern>
          </defs>
          {[0, 0.5, 1].map((fraction) => {
            const y = BASELINE - fraction * plot;
            return (
              <g key={fraction} aria-hidden="true">
                <line className={fraction === 0 ? "place-yearly-axis" : "place-yearly-grid"} x1={LEFT} x2={WIDTH - RIGHT} y1={y} y2={y} />
                <text className="place-yearly-tick" x={LEFT - 8} y={y + 4} textAnchor="end">{formatNumber(top * fraction, locale, 0)}</text>
              </g>
            );
          })}
          <text className="place-yearly-tick" x={4} y={12} aria-hidden="true">{text.axis}</text>
          {rows.map((row, index) => {
            const x = LEFT + index * step + (step - barWidth) / 2;
            const label = `${row.year}: ${value(row)}`;
            if (row.kind === "unknown") {
              return (
                <rect key={row.year} className="place-yearly-gap" x={x} y={TOP} width={barWidth} height={plot}>
                  <title>{`${label}. ${text.reasons[row.reason]}`}</title>
                </rect>
              );
            }
            const height = (row.hectares / top) * plot;
            return (
              <rect key={row.year} className={`place-yearly-bar place-yearly-bar--${row.kind}`} x={x} y={BASELINE - height} width={barWidth} height={height}>
                <title>{label}</title>
              </rect>
            );
          })}
          {rows.map((row, index) => (row.year % 5 === 0 || row.year === 2022 ? (
            <text key={row.year} className="place-yearly-tick" x={LEFT + index * step + step / 2} y={BASELINE + 18} textAnchor="middle" aria-hidden="true">{row.year}</text>
          ) : null))}
        </svg>
        </div>
        {hasMinimum || hasGap ? (
          <figcaption className="place-yearly-key">
            {hasMinimum ? <span><span className="place-yearly-swatch place-yearly-swatch--minimum" aria-hidden="true" /> {text.minimum}</span> : null}
            {hasGap ? <span><span className="place-yearly-swatch place-yearly-swatch--gap" aria-hidden="true" /> {text.gap}</span> : null}
          </figcaption>
        ) : null}
      </figure>
      <details className="place-yearly-table">
        <summary>{text.table}</summary>
        <div className="table-scroll" tabIndex={0} role="region" aria-label={text.heading}>
          <table>
            <caption className="sr-only">{text.heading}</caption>
            <thead>
              <tr><th scope="col">{text.year}</th><th scope="col">{text.loss}</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.year} className={`place-yearly-row--${row.kind}`}>
                  <th scope="row">{row.year}</th>
                  <td>{value(row)}{row.kind === "unknown" ? <span className="place-yearly-reason">{` – ${text.reasons[row.reason]}`}</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p className="place-yearly-causes">
        {text.causes} <a href={locale === "en" ? "/en/data/harvest-and-fire" : "/fr/donnees/recolte-et-incendies"}>{text.causesLink}</a>
      </p>
    </section>
  );
}
