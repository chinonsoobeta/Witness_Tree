import type { Locale } from "./localized";

/*
 * A year range appeared in three incompatible shapes on the same page: the
 * table caption took the machine field verbatim and printed "2020-2022" with a
 * hyphen, the body copy spelled out "2020 to 2022", and the boundary readouts
 * used the en dash form. All three are the same span. A reader comparing two
 * figures had to decide whether three spellings meant three periods.
 *
 * The machine fields stay as they are. They name published artifacts, and a
 * tile layer called phase2_province_loss_2020_2022 must keep that name however
 * its label is set. What changes is that no prose reads those fields directly:
 * prose asks for a form, and this module is the only place that knows how each
 * form is spelled.
 */

/*
 * U+2013 EN DASH. A range between two numbers takes an en dash. A hyphen is a
 * word joiner and reads as one compound token; U+2014 EM DASH is a clause
 * break and is banned outright in this repository. The gate in
 * scripts/check-year-range-format.mjs enforces both halves of that.
 */
const EN_DASH = "–";

export type YearRange = Readonly<{
  fromYear: number;
  toYear: number;
}>;

/**
 * How a range is spelled at one site.
 *
 * - `compact` sets it as a numeric range: `2020–2022`. Labels, table cells,
 *   captions, anywhere the range is a value rather than part of a sentence.
 * - `span` sets it as words inside a sentence that already supplies its own
 *   preposition: `covers 2020 to 2022`, `couvre 2020 à 2022`.
 * - `from` supplies the preposition itself: `from 2020 to 2022`,
 *   `de 2020 à 2022`. French needs this far more often than English, because
 *   an apposition like "Agrégat provisoire, de 2020 à 2022" takes the `de`
 *   where the English apposition takes nothing.
 * - `between` sets it as bounds rather than as a course: `between 1984 and
 *   2022`, `entre 1984 et 2022`. This is the form a validation message wants,
 *   because it is stating limits, not describing a period that elapsed.
 */
export type YearRangeForm = "compact" | "span" | "from" | "between";

/*
 * The product's own evidence horizon. A range outside it is a typo or a unit
 * error, not a period, and printing it would put a false span in front of a
 * reader. 1972 is the first Landsat year; the upper bound leaves room for
 * future acquisitions without admitting a four-digit slip.
 */
const EARLIEST_PLAUSIBLE_YEAR = 1972;
const LATEST_PLAUSIBLE_YEAR = 2100;

function assertPlausibleYear(value: number, role: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(`A year range needs an integer ${role}, received ${String(value)}.`);
  }
  if (value < EARLIEST_PLAUSIBLE_YEAR || value > LATEST_PLAUSIBLE_YEAR) {
    throw new Error(
      `A year range ${role} of ${value} is outside ${EARLIEST_PLAUSIBLE_YEAR}-${LATEST_PLAUSIBLE_YEAR} and is not a period.`,
    );
  }
}

export function yearRange(fromYear: number, toYear: number): YearRange {
  assertPlausibleYear(fromYear, "start year");
  assertPlausibleYear(toYear, "end year");
  if (toYear < fromYear) {
    throw new Error(`A year range cannot end (${toYear}) before it starts (${fromYear}).`);
  }
  return Object.freeze({ fromYear, toYear });
}

/*
 * Machine fields are written with a hyphen, because they are also embedded in
 * layer names, artifact ids and file names where an en dash would be wrong.
 * This reads that form, and the en dash form too, so a caller never has to
 * care which convention the field it holds was written in.
 */
export function parseYearRange(raw: string): YearRange {
  const match = /^(\d{4})[-–](\d{4})$/u.exec(raw.trim());
  if (!match) {
    throw new Error(`Cannot read "${raw}" as a year range; expected the form 2020-2022.`);
  }
  return yearRange(Number(match[1]), Number(match[2]));
}

/** The machine form, for artifact ids, layer names and file names. */
export function yearRangeKey(range: YearRange): string {
  return `${range.fromYear}-${range.toYear}`;
}

export function formatYearRange(
  range: YearRange,
  locale: Locale,
  form: YearRangeForm = "compact",
): string {
  /*
   * A single-year span is a real case once the aggregate widens to annual
   * intervals, and "2020 to 2020" reads as a mistake the reader then has to
   * rule out. One year is printed as one year.
   */
  if (range.fromYear === range.toYear) {
    const year = String(range.fromYear);
    if (form === "from") return locale === "fr" ? `de ${year}` : `in ${year}`;
    if (form === "between") return locale === "fr" ? `en ${year}` : `in ${year}`;
    return year;
  }

  const start = String(range.fromYear);
  const end = String(range.toYear);

  if (form === "compact") return `${start}${EN_DASH}${end}`;
  if (locale === "fr") {
    if (form === "between") return `entre ${start} et ${end}`;
    return form === "from" ? `de ${start} à ${end}` : `${start} à ${end}`;
  }
  if (form === "between") return `between ${start} and ${end}`;
  return form === "from" ? `from ${start} to ${end}` : `${start} to ${end}`;
}

/** Reads a machine field and sets it for a reader in one step. */
export function formatYearRangeKey(
  key: string,
  locale: Locale,
  form: YearRangeForm = "compact",
): string {
  return formatYearRange(parseYearRange(key), locale, form);
}
