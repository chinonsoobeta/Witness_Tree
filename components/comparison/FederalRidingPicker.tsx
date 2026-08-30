import type { ComparisonPlace } from "@/lib/comparison";
import type { Locale } from "@/lib/domain";

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
): SelectedFederalRidings {
  const candidates = federalRidings(rows);
  if (candidates.length < 2) {
    throw new Error("A federal-riding comparison requires at least two rows.");
  }

  const requestedLeft = candidates.find((row) => row.id === leftId);
  const requestedRight = candidates.find((row) => row.id === rightId);
  const left = requestedLeft ?? candidates.find((row) => row.id !== requestedRight?.id) ?? candidates[0]!;
  const right = requestedRight && requestedRight.id !== left.id
    ? requestedRight
    : candidates.find((row) => row.id !== left.id);
  if (!right) throw new Error("A federal-riding comparison requires two distinct rows.");
  return { left, right };
}

export function FederalRidingPicker({
  rows,
  locale,
  leftId,
  rightId,
  view,
  sort,
}: {
  rows: readonly ComparisonPlace[];
  locale: Locale;
  leftId?: string;
  rightId?: string;
  view?: string;
  sort?: string;
}) {
  const selected = selectFederalRidings(rows, leftId, rightId);
  const candidates = federalRidings(rows);
  const labels = locale === "en"
    ? {
        title: "Choose ridings to compare",
        left: "Left riding",
        right: "Right riding",
        submit: "Compare",
        fallback: (side: string, requested: string, shown: string) =>
          `Requested ${side} riding “${requested}” was not found. Showing ${shown} instead.`,
      }
    : {
        title: "Choisir les circonscriptions à comparer",
        left: "Circonscription de gauche",
        right: "Circonscription de droite",
        submit: "Comparer",
        fallback: (side: string, requested: string, shown: string) =>
          `La circonscription de ${side} demandée « ${requested} » est introuvable. ${shown} est affichée à la place.`,
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
            {candidates.map((row) => <option key={row.id} value={row.id}>{row.name[locale]}</option>)}
          </select>
        </label>
        <label>
          {labels.right}
          <select name="right" defaultValue={selected.right.id}>
            {candidates.map((row) => <option key={row.id} value={row.id}>{row.name[locale]}</option>)}
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
