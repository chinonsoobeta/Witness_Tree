import { formatNumber, type Locale } from "@/lib/domain";
import type { HarvestFireChartModel } from "@/lib/harvest-fire";
import { chartGeometry, SVG_SIZE } from "@/lib/harvest-fire/chart";

/**
 * One province's harvest and fire bars as an SVG drawn on the server. The Data
 * page and the riding print sheet both draw it from the same geometry
 * (lib/harvest-fire/chart.ts), so a printed chart and the page chart cannot
 * disagree about a bar. No script and no canvas: it prints as it renders.
 */

export type HarvestFireChartWords = Readonly<{
  harvest: string;
  fire: string;
  xAxis: string;
  yAxis: string;
  tooltip: (name: string, label: string, kind: string, value: string) => string;
}>;

export function HarvestFireChartSvg({ chart, locale, label, words, size = SVG_SIZE }: Readonly<{
  chart: HarvestFireChartModel;
  locale: Locale;
  /** The chart's accessible name. */
  label: string;
  words: HarvestFireChartWords;
  size?: Parameters<typeof chartGeometry>[2];
}>) {
  const geometry = chartGeometry(chart, locale, size);
  const name = chart.province.name[locale];
  const { plot } = geometry;
  return (
    <svg className="hf-chart-svg" role="img" aria-label={label} viewBox={`0 0 ${geometry.width} ${geometry.height}`} width="100%">
      <title>{label}</title>
      {geometry.ticks.map((tick) => (
        <g key={tick.value}>
          <line className={tick.value === 0 ? "hf-axis" : "hf-grid"} x1={plot.left} x2={plot.right} y1={tick.y} y2={tick.y} />
          <text className="hf-tick" x={plot.left - 8} y={tick.y} textAnchor="end" dominantBaseline="middle">{tick.label}</text>
        </g>
      ))}
      {geometry.bins.map((bin) => (
        <g key={bin.label}>
          {([["harvest", bin.harvest, words.harvest], ["fire", bin.fire, words.fire]] as const).map(([kind, bar, kindLabel]) => (
            <g key={kind}>
              <rect className={`hf-bar hf-bar--${kind}`} x={bar.x} y={bar.y} width={bar.width} height={bar.height} rx={Math.min(4, bar.width / 2)}>
                <title>{words.tooltip(name, bin.label, kindLabel, formatNumber(bar.value, locale, 0))}</title>
              </rect>
              {geometry.showValues ? (
                <text className="hf-value" x={bar.x + bar.width / 2} y={bar.labelY} textAnchor="middle">{bar.text}</text>
              ) : null}
            </g>
          ))}
          {bin.showLabel ? <text className="hf-label" x={bin.centre} y={plot.bottom + 20} textAnchor="middle">{bin.label}</text> : null}
        </g>
      ))}
      <text className="hf-axis-title" x={(plot.left + plot.right) / 2} y={geometry.height - 6} textAnchor="middle">{words.xAxis}</text>
      <text className="hf-axis-title" transform={`translate(14 ${(plot.top + plot.bottom) / 2}) rotate(-90)`} textAnchor="middle">{words.yAxis}</text>
    </svg>
  );
}
