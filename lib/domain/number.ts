import type { Locale } from "./localized";

/** Formats public measurements with locale separators and no more than two decimals by default. */
export function formatNumber(
  value: number,
  locale: Locale,
  maximumFractionDigits: 0 | 1 | 2 = 2,
): string {
  return new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    maximumFractionDigits,
  }).format(value);
}

export function formatPercent(value: number, locale: Locale): string {
  const suffix = locale === "fr" ? " %" : "%";
  return `${formatNumber(value, locale)}${suffix}`;
}

export function formatHectares(
  value: number,
  locale: Locale,
  maximumFractionDigits: 0 | 1 | 2 = 2,
): string {
  return `${formatNumber(value, locale, maximumFractionDigits)} ha`;
}
