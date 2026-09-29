import type { ComparisonPlace } from "@/lib/comparison";
import type { Locale } from "@/lib/domain";
import { provinceSpanDisplayRows } from "@/lib/explore/province-spans";

type SelectedFederalRidings = Readonly<{
  left: ComparisonPlace;
  right: ComparisonPlace;
}>;

function federalRidings(rows: readonly ComparisonPlace[]) {
  return rows.filter((row) => row.placeType === "federal-riding");
}

/**
 * Resolves a URL pair without ever silently comparing a district with itself.
 * The source order is the deterministic fallback order supplied by the caller.
 */
export function selectFederalRidings(
  rows: readonly ComparisonPlace[],
  leftId?: string,
  rightId?: string,
  fallback?: readonly ComparisonPlace[],
): SelectedFederalRidings {
  const candidates = federalRidings(rows);
  if (candidates.length < 2) {
    throw new Error("A federal-riding comparison requires at least two rows.");
  }
  const preferred = fallback && fallback.length > 0
    ? [...federalRidings(fallback), ...candidates]
    : candidates;

  const requestedLeft = candidates.find((row) => row.id === leftId);
  const requestedRight = candidates.find((row) => row.id === rightId);
  const left = requestedLeft ?? preferred.find((row) => row.id !== requestedRight?.id) ?? candidates[0]!;
  const right = requestedRight && requestedRight.id !== left.id
    ? requestedRight
    : preferred.find((row) => row.id !== left.id);
  if (!right) throw new Error("A federal-riding comparison requires two distinct rows.");
  return { left, right };
}

/** Province names by federal district prefix, west to east, spelled as the rest of the site spells them. */
const PROVINCES = provinceSpanDisplayRows({ fromYear: 1984, toYear: 2022 }).map((row) => ({ prefix: row.id, name: row.name }));

/**
 * The ridings under one heading per province, alphabetical within it, so a
 * reader finds a riding among the four provinces’ by where it is. Rows whose id carries
 * no province are listed as they came.
 */
function RidingOptions({ rows, locale }: { rows: readonly ComparisonPlace[]; locale: Locale }) {
  const groups = PROVINCES.map((province) => ({
    ...province,
    rows: rows
      .filter((row) => row.id.startsWith(`federal-${province.prefix}`))
      .sort((a, b) => a.name[locale].localeCompare(b.name[locale], locale)),
  }));
  if (groups.reduce((total, group) => total + group.rows.length, 0) !== rows.length) {
    return <>{rows.map((row) => <option key={row.id} value={row.id}>{row.name[locale]}</option>)}</>;
  }
  return (
    <>
      {groups.filter((group) => group.rows.length > 0).map((group) => (
        <optgroup key={group.prefix} label={group.name[locale]}>
          {group.rows.map((row) => <option key={row.id} value={row.id}>{row.name[locale]}</option>)}
        </optgroup>
      ))}
    </>
  );
}

export function FederalRidingPicker({
  rows,
  locale,
  leftId,
  rightId,
  view,
  sort,
  fallback,
}: {
  rows: readonly ComparisonPlace[];
  locale: Locale;
  leftId?: string;
  rightId?: string;
  view?: string;
  sort?: string;
  fallback?: readonly ComparisonPlace[];
}) {
  const selected = selectFederalRidings(rows, leftId, rightId, fallback);
  const candidates = federalRidings(rows);
  const labels = locale === "en"
    ? {
        title: "Choose ridings to compare",
        left: "Left riding",
        right: "Right riding",
        submit: "Compare",
        fallback: (side: string, requested: string, shown: string) =>
          `The ${side} riding “${requested}” isn’t available here, since this comparison covers four provinces only. Showing ${shown} instead.`,
      }
    : {
        title: "Choisir les circonscriptions à comparer",
        left: "Circonscription de gauche",
        right: "Circonscription de droite",
        submit: "Comparer",
        fallback: (side: string, requested: string, shown: string) =>
          `La circonscription de ${side} «\u00A0${requested}\u00A0» n’est pas offerte ici, car cette comparaison ne couvre que quatre provinces. ${shown} est affichée à la place.`,
      };
  const missing = [
    leftId && !candidates.some((row) => row.id === leftId)
      ? labels.fallback(locale === "en" ? "left" : "gauche", leftId, selected.left.name[locale])
      : null,
    rightId && !candidates.some((row) => row.id === rightId)
      ? labels.fallback(locale === "en" ? "right" : "droite", rightId, selected.right.name[locale])
      : null,
  ].filter((message): message is string => message !== null);

  return (
    <>
      <form className="comparison-picker" method="get" aria-label={labels.title}>
        {view && <input type="hidden" name="view" value={view} />}
        {sort && <input type="hidden" name="sort" value={sort} />}
        <label>
          {labels.left}
          <select name="left" defaultValue={selected.left.id}>
            <RidingOptions rows={candidates} locale={locale} />
          </select>
        </label>
        <label>
          {labels.right}
          <select name="right" defaultValue={selected.right.id}>
            <RidingOptions rows={candidates} locale={locale} />
          </select>
        </label>
        <button className="btn btn--primary" type="submit">{labels.submit}</button>
      </form>
      {missing.length > 0 ? (
        <aside className="notice comparison-selection-notice" role="status">
          {missing.map((message) => <p key={message}>{message}</p>)}
        </aside>
      ) : null}
    </>
  );
}
