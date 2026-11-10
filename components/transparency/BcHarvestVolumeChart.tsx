import { formatNumber, type Locale } from "@/lib/domain";

/*
 * The BC harvest volume page leads with this chart (audit 2026-11-10, J1).
 * It is drawn on the server as plain SVG, so it prints as it renders and needs
 * no script. It draws only the three columns of the table under it, from the
 * same rows: total harvest, the harvest the allowable cut applies to, and the
 * allowable cut. A year without a value breaks the line; it is never drawn as
 * zero. No per-hectare figure and no stumpage are drawn, as on the table.
 */

export type BcHarvestVolumeChartRow = Readonly<{
  year: number;
  totalHarvestMillionCubicMetres: number | null;
  harvestRegulatedByAacMillionCubicMetres: number | null;
  allowableAnnualCutMillionCubicMetres: number | null;
}>;

type SeriesKey = "total" | "regulated" | "allowable";

const FIELD = {
  total: "totalHarvestMillionCubicMetres",
  regulated: "harvestRegulatedByAacMillionCubicMetres",
  allowable: "allowableAnnualCutMillionCubicMetres",
} as const satisfies Record<SeriesKey, keyof BcHarvestVolumeChartRow>;

const SERIES: readonly SeriesKey[] = ["total", "regulated", "allowable"];

const COPY = {
  en: {
    title: (from: number, to: number) => `Harvest volume and allowable annual cut, British Columbia, ${from}–${to}`,
    yAxis: "Million cubic metres (m³)",
    xAxis: "Year",
    series: {
      total: "Total harvest",
      regulated: "Harvest covered by the allowable cut",
      allowable: "Allowable annual cut (a policy limit)",
    },
    noValue: (from: number, to: number) => `No allowable-cut values, ${from}–${to}`,
    units: "Million cubic metres a year.",
    caveats: (first: number | null) => `Harvest volume is wood already cut and measured, not standing timber. The allowable annual cut is a limit set by BC’s Chief Forester: a policy number, not a measurement of wood. A year without a value is a gap in its line, never zero${first === null ? "" : `; there are no allowable-cut values before ${first}`}. No cubic-metres-per-hectare figure is shown.`,
    source: "Source: Environmental Reporting BC, Trends in Timber Harvesting indicator, summary data. Open Government Licence – British Columbia.",
    summary: (s: Summary) => [
      `In short: total harvest peaked at ${s.peakTotal} million m³ in ${s.peakTotalYear} and was ${s.lastTotal} million m³ in ${s.lastYear}.`,
      `The allowable annual cut has values from ${s.firstAllowableYear}; it peaked at ${s.peakAllowable} million m³ in ${s.peakAllowableYear} and was ${s.lastAllowable} million m³ in ${s.lastYear}.`,
      s.lastShare ? `In ${s.lastYear} the harvest covered by the allowable cut was ${s.lastShare} of it.` : "",
      "Every value is in the table below.",
    ].filter(Boolean).join(" "),
    unknown: "Unknown",
  },
  fr: {
    title: (from: number, to: number) => `Volume récolté et possibilité annuelle de coupe, Colombie-Britannique, ${from}–${to}`,
    yAxis: "Millions de mètres cubes (m³)",
    xAxis: "Année",
    series: {
      total: "Récolte totale",
      regulated: "Récolte visée par la possibilité de coupe",
      allowable: "Possibilité annuelle de coupe (une limite de politique publique)",
    },
    noValue: (from: number, to: number) => `Aucune valeur de possibilité de coupe, ${from}–${to}`,
    units: "Millions de mètres cubes par année.",
    caveats: (first: number | null) => `Le volume récolté est du bois déjà coupé et mesuré, et non du bois sur pied. La possibilité annuelle de coupe est une limite fixée par le forestier en chef de la C.-B. C’est une valeur de politique publique, et non une mesure du bois. Une année sans valeur est une interruption de sa ligne, jamais zéro${first === null ? "" : `\u202F; aucune valeur de possibilité de coupe n’existe avant ${first}`}. Aucun chiffre en mètres cubes par hectare n’est présenté.`,
    source: "Source\u202F: Environmental Reporting BC, indicateur Trends in Timber Harvesting, données sommaires. Licence du gouvernement ouvert – Colombie-Britannique.",
    summary: (s: Summary) => [
      `En bref\u202F: la récolte totale a culminé à ${s.peakTotal}\u00a0millions de m³ en ${s.peakTotalYear} et était de ${s.lastTotal}\u00a0millions de m³ en ${s.lastYear}.`,
      `La possibilité annuelle de coupe a des valeurs à partir de ${s.firstAllowableYear}\u202F; elle a culminé à ${s.peakAllowable}\u00a0millions de m³ en ${s.peakAllowableYear} et était de ${s.lastAllowable}\u00a0millions de m³ en ${s.lastYear}.`,
      s.lastShare ? `En ${s.lastYear}, la récolte visée par la possibilité de coupe représentait ${s.lastShare} de celle-ci.` : "",
      "Toutes les valeurs figurent dans le tableau ci-dessous.",
    ].filter(Boolean).join(" "),
    unknown: "Inconnu",
  },
} as const;

type Summary = Readonly<{
  lastYear: number;
  peakTotal: string;
  peakTotalYear: number;
  lastTotal: string;
  firstAllowableYear: number;
  peakAllowable: string;
  peakAllowableYear: number;
  lastAllowable: string;
  lastShare: string | null;
}>;

/** A volume as the table prints it; null stays null so the caller says Unknown. */
export function formatVolume(value: number | null, locale: Locale) {
  return value === null ? null : formatNumber(value, locale, 2);
}

/** The covered harvest as a share of the allowable cut, only where both are published. */
export function formatCoveredShare(row: BcHarvestVolumeChartRow, locale: Locale) {
  const regulated = row.harvestRegulatedByAacMillionCubicMetres;
  const allowable = row.allowableAnnualCutMillionCubicMetres;
  if (regulated === null || allowable === null || allowable === 0) return null;
  return new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA", { style: "percent", maximumFractionDigits: 1 }).format(regulated / allowable);
}

const WIDTH = 960;
const HEIGHT = 380;
const PLOT = { left: 64, right: 944, top: 20, bottom: 322 } as const;

/** Runs of consecutive years with a value. A null or a missing year ends a run. */
export function seriesRuns(rows: readonly BcHarvestVolumeChartRow[], key: SeriesKey) {
  const runs: { year: number; value: number }[][] = [];
  let run: { year: number; value: number }[] = [];
  let previous: number | null = null;
  for (const row of rows) {
    const value = row[FIELD[key]];
    if (value === null || (previous !== null && row.year !== previous + 1)) {
      if (run.length) runs.push(run);
      run = [];
    }
    if (value !== null) run.push({ year: row.year, value });
    previous = row.year;
  }
  if (run.length) runs.push(run);
  return runs;
}

function peak(rows: readonly BcHarvestVolumeChartRow[], key: SeriesKey) {
  let best: { year: number; value: number } | null = null;
  for (const row of rows) {
    const value = row[FIELD[key]];
    if (value !== null && (best === null || value > best.value)) best = { year: row.year, value };
  }
  return best;
}

export function BcHarvestVolumeChart({ rows, locale }: Readonly<{ rows: readonly BcHarvestVolumeChartRow[]; locale: Locale }>) {
  const text = COPY[locale];
  const ordered = [...rows].sort((left, right) => left.year - right.year);
  if (ordered.length < 2) return null;
  const firstYear = ordered[0].year;
  const lastYear = ordered[ordered.length - 1].year;
  const values = ordered.flatMap((row) => SERIES.map((key) => row[FIELD[key]]).filter((value): value is number => value !== null));
  const yMax = Math.max(20, Math.ceil(Math.max(...values) / 20) * 20);
  const x = (year: number) => PLOT.left + ((year - firstYear) / (lastYear - firstYear)) * (PLOT.right - PLOT.left);
  const y = (value: number) => PLOT.bottom - (value / yMax) * (PLOT.bottom - PLOT.top);
  const yTicks = Array.from({ length: yMax / 20 + 1 }, (_, index) => index * 20);
  const xTicks = ordered.map((row) => row.year).filter((year) => year % 10 === 0);
  const runs = Object.fromEntries(SERIES.map((key) => [key, seriesRuns(ordered, key)])) as Record<SeriesKey, ReturnType<typeof seriesRuns>>;

  // The years before the first allowable-cut value, named on the chart itself.
  const firstAllowable = ordered.find((row) => row.allowableAnnualCutMillionCubicMetres !== null);
  const allowableGap = firstAllowable && firstAllowable.year > firstYear ? { from: firstYear, to: firstAllowable.year - 1 } : null;

  const last = ordered[ordered.length - 1];
  const peakTotal = peak(ordered, "total");
  const peakAllowable = peak(ordered, "allowable");
  const show = (value: number | null) => formatVolume(value, locale) ?? text.unknown;
  const summary = peakTotal && peakAllowable && firstAllowable
    ? text.summary({
      lastYear,
      peakTotal: show(peakTotal.value),
      peakTotalYear: peakTotal.year,
      lastTotal: show(last.totalHarvestMillionCubicMetres),
      firstAllowableYear: firstAllowable.year,
      peakAllowable: show(peakAllowable.value),
      peakAllowableYear: peakAllowable.year,
      lastAllowable: show(last.allowableAnnualCutMillionCubicMetres),
      lastShare: formatCoveredShare(last, locale),
    })
    : null;
  const title = text.title(firstYear, lastYear);

  return (
    <figure className="content-section bc-volume-figure" aria-labelledby="bc-volume-chart-title">
      <h2 id="bc-volume-chart-title">{title}</h2>
      <ul className="bc-volume-legend">
        {SERIES.map((key) => (
          <li key={key}>
            <span className={`bc-volume-swatch bc-volume-swatch--${key}`} aria-hidden="true" />
            {text.series[key]}
          </li>
        ))}
      </ul>
      {/* Wider than a phone, so it scrolls inside its own region; a keyboard reaches it. */}
      <div className="bc-volume-scroll" tabIndex={0} role="region" aria-label={title}>
        <svg
          className="bc-volume-chart"
          role="img"
          aria-labelledby="bc-volume-chart-title"
          aria-describedby={summary ? "bc-volume-chart-summary" : undefined}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          width="100%"
        >
          <title>{title}</title>
          {yTicks.map((tick) => (
            <g key={tick}>
              <line className={tick === 0 ? "bc-volume-axis" : "bc-volume-grid"} x1={PLOT.left} x2={PLOT.right} y1={y(tick)} y2={y(tick)} />
              <text className="bc-volume-tick" x={PLOT.left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle">{formatNumber(tick, locale, 0)}</text>
            </g>
          ))}
          {xTicks.map((year) => (
            <text key={year} className="bc-volume-tick" x={x(year)} y={PLOT.bottom + 20} textAnchor="middle">{year}</text>
          ))}
          {allowableGap ? (
            <text className="bc-volume-note" x={x(allowableGap.from) + 8} y={y(yMax * 0.62)} textAnchor="start">
              {text.noValue(allowableGap.from, allowableGap.to)}
            </text>
          ) : null}
          {SERIES.map((key) => runs[key].map((run) => run.length === 1 ? (
            <circle key={`${key}-${run[0].year}`} className={`bc-volume-dot bc-volume-dot--${key}`} cx={x(run[0].year)} cy={y(run[0].value)} r="2.5" />
          ) : (
            <polyline
              key={`${key}-${run[0].year}`}
              className={`bc-volume-line bc-volume-line--${key}`}
              points={run.map((point) => `${x(point.year).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ")}
            />
          )))}
          <text className="bc-volume-axis-title" x={(PLOT.left + PLOT.right) / 2} y={HEIGHT - 6} textAnchor="middle">{text.xAxis}</text>
          <text className="bc-volume-axis-title" transform={`translate(14 ${(PLOT.top + PLOT.bottom) / 2}) rotate(-90)`} textAnchor="middle">{text.yAxis}</text>
        </svg>
      </div>
      {summary ? <p id="bc-volume-chart-summary" className="bc-volume-summary">{summary}</p> : null}
      <figcaption className="bc-volume-caption">
        <p>{text.units} {text.caveats(allowableGap ? allowableGap.to + 1 : null)}</p>
        <p>{text.source}</p>
      </figcaption>
    </figure>
  );
}
