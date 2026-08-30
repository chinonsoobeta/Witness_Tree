import { formatNumber, type Locale } from "@/lib/domain";
import type { AnnualSummary } from "@/lib/places";

const CHART_WIDTH = 300;
const CHART_HEIGHT = 140;
const BASELINE_Y = 120;
const PLOT_HEIGHT = 90;

export function AnnualChangeChart({
  annual,
  locale,
  view,
}: Readonly<{
  annual: readonly AnnualSummary[];
  locale: Locale;
  view: "chart" | "table";
}>) {
  const rows = [...annual].sort((a, b) => a.year - b.year);
  const max = Math.max(...rows.map((row) => row.hectares), 1);
  const title = locale === "en" ? "Annual change" : "Changement annuel";
  const step = CHART_WIDTH / Math.max(rows.length, 1);
  const barWidth = Math.min(48, step * 0.5);

  if (view === "table") {
    return (
      <section className="annual-change">
        <h2>{title}</h2>
        <div className="table-scroll">
          <table>
            <caption>{title}</caption>
            <thead>
              <tr>
                <th scope="col">{locale === "en" ? "Year" : "Année"}</th>
                <th scope="col">{locale === "en" ? "Hectares" : "Hectares"}</th>
                <th scope="col">
                  {locale === "en" ? "Event IDs" : "Identifiants d’événement"}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.year}>
                  <td>{row.year}</td>
                  <td>{formatNumber(row.hectares, locale)}</td>
                  <td>{row.eventIds.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  return (
    <section className="annual-change">
      <h2>{title}</h2>
      {/* The bars used to be unfilled outlines, which read as empty on the
          page. Fill and label come from the stylesheet so the palette stays in
          one place; rx gives the rounded cap. */}
      <svg
        className="annual-chart"
        role="img"
        aria-label={title}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        width="100%"
      >
        <title>{title}</title>
        <line
          className="annual-axis"
          x1="0"
          y1={BASELINE_Y}
          x2={CHART_WIDTH}
          y2={BASELINE_Y}
        />
        {rows.map((row, index) => {
          const height = (row.hectares / max) * PLOT_HEIGHT;
          const x = index * step + (step - barWidth) / 2;
          return (
            <g key={row.year}>
              <rect
                className="annual-bar"
                x={x}
                y={BASELINE_Y - height}
                width={barWidth}
                height={height}
                rx="4"
              />
              <text
                className="annual-label"
                x={x + barWidth / 2}
                y={BASELINE_Y + 15}
                textAnchor="middle"
              >
                {row.year}
              </text>
              <text
                className="annual-value"
                x={x + barWidth / 2}
                y={BASELINE_Y - height - 6}
                textAnchor="middle"
              >
                {formatNumber(row.hectares, locale)}
              </text>
            </g>
          );
        })}
      </svg>
      <p>
        <a className="btn btn--ghost" href="?view=table">
          {locale === "en"
            ? "View table equivalent"
            : "Voir l’équivalent sous forme de tableau"}
        </a>
      </p>
    </section>
  );
}
