import { formatHectares, type Locale } from "@/lib/domain";
import { ConfidenceBadge, EvidenceChip } from "@/components/policy";
import type { Place, PlaceEvent } from "@/lib/places";

/**
 * The year-by-year rows under a place record.
 *
 * A year the record does not cover is a row of its own, not a gap in a chart
 * and not a zero.  Consecutive uncovered years collapse into one row so a long
 * silence reads as one fact rather than as a wall of repeated rows, and the row
 * says how many years it stands for.  The window is the span the record itself
 * covers, so nothing here asserts a period the data does not reach.
 */
export type YearRow =
  | Readonly<{ kind: "recorded"; year: number; hectares: number; event: PlaceEvent | undefined }>
  | Readonly<{ kind: "absent"; from: number; to: number }>;

export function yearRows(place: Place): readonly YearRow[] {
  const covered = new Map(place.annual.map((entry) => [entry.year, entry]));
  const years = [...covered.keys()];
  if (years.length === 0) return [];
  const eventById = new Map(place.events.map((event) => [event.id, event]));
  const rows: YearRow[] = [];
  let runStart: number | null = null;
  const closeRun = (end: number) => {
    if (runStart !== null) { rows.push({ kind: "absent", from: runStart, to: end }); runStart = null; }
  };
  for (let year = Math.min(...years); year <= Math.max(...years); year += 1) {
    const entry = covered.get(year);
    if (!entry) { runStart ??= year; continue; }
    closeRun(year - 1);
    rows.push({ kind: "recorded", year, hectares: entry.hectares, event: eventById.get(entry.eventIds[0] ?? "") });
  }
  closeRun(Math.max(...years));
  // Newest first, matching how the rest of the product orders a record.
  return rows.reverse();
}

export function absentYearCount(rows: readonly YearRow[]): number {
  return rows.reduce((total, row) => row.kind === "absent" ? total + (row.to - row.from + 1) : total, 0);
}

export function PlaceYearRows({ place, locale }: Readonly<{ place: Place; locale: Locale }>) {
  const rows = yearRows(place);
  const notPublished = locale === "en"
    ? (count: number) => count === 1 ? "Not published for this boundary and year" : `${count} years, not published for this boundary`
    : (count: number) => count === 1 ? "Non publié pour cette limite et cette année" : `${count} années, non publiées pour cette limite`;
  return (
    <ol className="place-years">
      {rows.map((row) => row.kind === "recorded" ? (
        <li className={`place-year place-year--${row.event?.evidence ?? "unknown"}`} key={row.year}>
          <span className="place-year-label">{row.year}</span>
          <span className="place-year-body">
            <span className="place-year-title">{row.event?.title[locale]}</span>
            {row.event ? (
              <span className="place-year-evidence">
                <EvidenceChip evidence={row.event.evidence} locale={locale} />
                <ConfidenceBadge confidence={row.event.confidence} locale={locale} />
              </span>
            ) : null}
          </span>
          <span className="place-year-value">{formatHectares(row.hectares, locale)}</span>
        </li>
      ) : (
        <li className="place-year place-year--absent" key={`absent-${row.from}`}>
          <span className="place-year-label">
            {row.from === row.to ? row.from : `${row.from}–${String(row.to).slice(-2)}`}
          </span>
          <span className="place-year-body">
            <span className="place-year-title">{notPublished(row.to - row.from + 1)}</span>
          </span>
          <span className="place-year-value" aria-label={locale === "en" ? "No value" : "Aucune valeur"}>{"–"}</span>
        </li>
      ))}
    </ol>
  );
}
