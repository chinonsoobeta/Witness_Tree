import type { ComparisonPlace } from "@/lib/comparison";
import type { Locale } from "@/lib/domain";
import { provinceSpanDisplayRows } from "@/lib/explore/province-spans";
import { ridingLevel, ridingProvincePrefix, type RidingChoice } from "@/lib/comparison/riding-typeahead";
import { FederalRidingFields } from "./FederalRidingFields";

/** Why a side of the address could not be shown as asked. */
export type SelectionNotice = Readonly<{
  side: "left" | "right";
  kind: "unknown" | "outside" | "same";
  /** The id as the address gave it, cut short so a long one cannot flood the page. */
  id: string;
  name?: Readonly<Record<Locale, string>>;
}>;

export type ComparedRidings = Readonly<{
  left: ComparisonPlace | null;
  right: ComparisonPlace | null;
  notices: readonly SelectionNotice[];
}>;

/**
 * Resolves the address's pair. An id that names no riding, or a riding the
 * page cannot compare, leaves its side empty with a notice saying so; the same
 * riding on both sides is shown once. Nothing is silently put in its place.
 *
 * A side the address leaves out altogether (the page's own first visit, or a
 * search link that names one riding) takes the next of the caller's measured
 * defaults, distinct from the other side.
 */
export function selectComparedRidings(
  rows: readonly ComparisonPlace[],
  leftId?: string,
  rightId?: string,
  {
    fallback = [],
    outside = [],
  }: Readonly<{
    /** The measured pair the page opens with. */
    fallback?: readonly ComparisonPlace[];
    /** Ridings that exist but that this page does not compare, named rather than called unknown. */
    outside?: readonly ComparisonPlace[];
  }> = {},
): ComparedRidings {
  const notices: SelectionNotice[] = [];
  const resolve = (side: "left" | "right", id: string | undefined) => {
    if (!id) return null;
    const place = rows.find((row) => row.id === id);
    if (place) return place;
    const away = outside.find((row) => row.id === id);
    notices.push(away ? { side, kind: "outside", id, name: away.name } : { side, kind: "unknown", id: id.slice(0, 80) });
    return null;
  };
  let left = resolve("left", leftId);
  let right = resolve("right", rightId);
  if (left && right && left.id === right.id) {
    notices.push({ side: "right", kind: "same", id: right.id, name: right.name });
    right = null;
  }
  const preferred = [...fallback, ...rows];
  if (leftId === undefined) left = preferred.find((row) => row.id !== right?.id) ?? null;
  if (rightId === undefined) right = preferred.find((row) => row.id !== left?.id) ?? null;
  return { left, right, notices };
}

/** Province names by federal district prefix, west to east, spelled as the rest of the site spells them. */
const PROVINCES = provinceSpanDisplayRows({ fromYear: 1984, toYear: 2022 }).map((row) => ({ prefix: row.id, name: row.name }));

/**
 * The ridings in the page’s language: federal first, then provincial, each
 * under one heading per province, west to east and alphabetical within it, so
 * a reader finds a riding by where it is. Rows whose id carries no province
 * are listed as they came, with no province.
 */
export function ridingChoices(rows: readonly ComparisonPlace[], locale: Locale): RidingChoice[] {
  const choice = (row: ComparisonPlace, province: string | null): RidingChoice => ({
    id: row.id,
    name: row.name[locale],
    province,
    level: row.placeType === "provincial-riding" ? "provincial" : ridingLevel(row.id),
  });
  const groups = (["federal", "provincial"] as const).flatMap((level) => PROVINCES.map((province) => ({
    ...province,
    rows: rows
      .filter((row) => ridingProvincePrefix(row.id) === province.prefix && choice(row, null).level === level)
      .sort((a, b) => a.name[locale].localeCompare(b.name[locale], locale)),
  })));
  if (groups.reduce((total, group) => total + group.rows.length, 0) !== rows.length) {
    return rows.map((row) => {
      const prefix = ridingProvincePrefix(row.id);
      return choice(row, PROVINCES.find((province) => province.prefix === prefix)?.name[locale] ?? null);
    });
  }
  return groups.flatMap((group) => group.rows.map((row) => choice(row, group.name[locale])));
}

const NOTICE_COPY = {
  en: {
    side: { left: "Left side", right: "Right side" },
    unknown: (side: string, id: string) => `${side}: no riding has the id “${id}”. Choose a riding below.`,
    outside: (side: string, name: string) =>
      `${side}: ${name} is a federal riding outside the four provinces the record covers, so it can’t be compared here. Choose a riding below.`,
    same: (name: string) => `Both sides asked for ${name}, so it is shown once. Choose a different riding for the other side.`,
  },
  fr: {
    side: { left: "Côté gauche", right: "Côté droit" },
    unknown: (side: string, id: string) =>
      `${side}\u202F: aucune circonscription ne porte l’identifiant «\u00A0${id}\u00A0». Choisissez une circonscription ci-dessous.`,
    outside: (side: string, name: string) =>
      `${side}\u202F: ${name} est une circonscription fédérale située hors des quatre provinces que couvre le registre\u202F; elle ne peut donc pas être comparée ici. Choisissez une circonscription ci-dessous.`,
    same: (name: string) =>
      `Les deux côtés demandaient ${name}\u202F; elle n’est donc affichée qu’une fois. Choisissez une autre circonscription pour l’autre côté.`,
  },
} as const;

export function selectionNoticeText(notice: SelectionNotice, locale: Locale): string {
  const copy = NOTICE_COPY[locale];
  const side = copy.side[notice.side];
  if (notice.kind === "same") return copy.same(notice.name?.[locale] ?? notice.id);
  if (notice.kind === "outside") return copy.outside(side, notice.name?.[locale] ?? notice.id);
  return copy.unknown(side, notice.id);
}

export function FederalRidingPicker({
  rows,
  locale,
  leftId,
  rightId,
  view,
  sort,
  allRankings = false,
  notices = [],
}: {
  rows: readonly ComparisonPlace[];
  locale: Locale;
  /** The resolved sides; null leaves that field empty for the reader to fill. */
  leftId: string | null;
  rightId: string | null;
  view?: string;
  sort?: string;
  allRankings?: boolean;
  notices?: readonly SelectionNotice[];
}) {
  const labels = locale === "en"
    ? {
        title: "Choose ridings to compare",
        left: "Left riding",
        right: "Right riding",
        submit: "Compare",
      }
    : {
        title: "Choisir les circonscriptions à comparer",
        left: "Circonscription de gauche",
        right: "Circonscription de droite",
        submit: "Comparer",
      };

  return (
    <>
      {notices.length > 0 ? (
        <aside className="notice comparison-selection-notice" role="status">
          {notices.map((notice) => <p key={`${notice.side}-${notice.kind}`}>{selectionNoticeText(notice, locale)}</p>)}
        </aside>
      ) : null}
      <form className="comparison-picker" method="get" aria-label={labels.title}>
        {view && <input type="hidden" name="view" value={view} />}
        {sort && <input type="hidden" name="sort" value={sort} />}
        {allRankings && <input type="hidden" name="rankings" value="all" />}
        <FederalRidingFields
          locale={locale}
          choices={ridingChoices(rows, locale)}
          leftId={leftId}
          rightId={rightId}
          leftLabel={labels.left}
          rightLabel={labels.right}
        />
        <button className="btn btn--primary" type="submit">{labels.submit}</button>
      </form>
    </>
  );
}
