import type { Locale } from "../domain";
import { formatNumber } from "../domain/number";
import { binLabel, type HarvestFireChartModel } from "./index";

/*
 * The one geometry both drawings use: the SVG on the page and the PNG a reader
 * downloads. Keeping it here means the two cannot disagree about where a bar
 * sits or which years carry a label.
 */

export type ChartGeometry = Readonly<{
  width: number;
  height: number;
  plot: Readonly<{ left: number; top: number; right: number; bottom: number }>;
  ticks: readonly Readonly<{ value: number; y: number; label: string }>[];
  bins: readonly Readonly<{
    label: string;
    showLabel: boolean;
    short: boolean;
    centre: number;
    harvest: Readonly<{ x: number; y: number; width: number; height: number; value: number; text: string; labelY: number }>;
    fire: Readonly<{ x: number; y: number; width: number; height: number; value: number; text: string; labelY: number }>;
  }>[];
  /** Values are written on the bars only when there is room for them. */
  showValues: boolean;
}>;

export function compactHectares(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA", { notation: "compact", maximumSignificantDigits: 3 }).format(value);
}

export function chartGeometry(
  chart: HarvestFireChartModel,
  locale: Locale,
  size: Readonly<{ width: number; height: number; left: number; top: number; right: number; bottom: number }>,
): ChartGeometry {
  const plot = { left: size.left, top: size.top, right: size.width - size.right, bottom: size.height - size.bottom };
  const plotHeight = plot.bottom - plot.top;
  const slot = (plot.right - plot.left) / Math.max(chart.bins.length, 1);
  const gap = 2;
  const barWidth = Math.min(44, Math.max(2, slot * 0.38));
  const y = (value: number) => plot.bottom - (value / chart.top) * plotHeight;
  const showValues = chart.bins.length <= 10;
  // Single years label every fifth year so the labels never collide.
  const labelEvery = chart.bins.length > 12 ? 5 : 1;
  const bar = (x: number, value: number) => ({
    x,
    y: y(value),
    width: barWidth,
    height: plot.bottom - y(value),
    value,
    text: compactHectares(value, locale),
    labelY: y(value) - 5,
  });
  // Two bars of nearly the same height put their values on one line, and the
  // pair is narrower than the two texts: lift the taller bar's value a line so
  // the two stay apart. Each still sits over its own bar.
  const LABEL_LINE = 13;
  const apart = (harvest: ReturnType<typeof bar>, fire: ReturnType<typeof bar>) => {
    if (Math.abs(harvest.y - fire.y) >= LABEL_LINE) return [harvest, fire] as const;
    const taller = harvest.y <= fire.y ? harvest : fire;
    const lifted = { ...taller, labelY: Math.min(harvest.y, fire.y) - 5 - LABEL_LINE };
    return taller === harvest ? ([lifted, fire] as const) : ([harvest, lifted] as const);
  };
  return {
    width: size.width,
    height: size.height,
    plot,
    ticks: chart.ticks.map((value) => ({ value, y: y(value), label: formatNumber(value, locale, 0) })),
    bins: chart.bins.map((bin, i) => {
      const centre = plot.left + slot * (i + 0.5);
      const [harvest, fire] = apart(bar(centre - gap / 2 - barWidth, bin.harvestHectares), bar(centre + gap / 2, bin.fireHectares));
      return {
        label: `${binLabel(bin, locale)}${bin.short ? "*" : ""}`,
        showLabel: labelEvery === 1 || bin.firstYear % labelEvery === 0,
        short: bin.short,
        centre,
        harvest,
        fire,
      };
    }),
    showValues,
  };
}

export const SVG_SIZE = { width: 760, height: 340, left: 86, top: 20, right: 8, bottom: 52 } as const;
