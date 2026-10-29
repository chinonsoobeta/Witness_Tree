import { EvidenceChip } from "@/components/policy";
import {
  COVERED_PROVINCE_NAMES,
  MINIMUM_RANKED_FOREST_HECTARES,
  RANKING_COPY,
  RANKING_METRIC,
  rankRidings,
  type CoveredProvince,
  type RankingScope,
  type RankingSort,
  type RankedRiding,
  type RankingContext,
} from "@/lib/comparison";
import { formatHectares, formatPercent, type Locale } from "@/lib/domain";
import { forestedArea, MeasurementCoverage, missingMeasurement } from "./MeasurementCoverage";

/** Why the rest are unranked, naming only the reasons that apply, in the right number. */
function unrankedReasons(noneMapped: number, partial: number, belowFloor: number, locale: Locale) {
  const floor = MINIMUM_RANKED_FOREST_HECTARES;
  const parts = (locale === "en"
    ? [
        [noneMapped, noneMapped === 1 ? "1 was not mapped at all" : `${noneMapped} were not mapped at all`],
        [partial, partial === 1 ? "1 was only partly mapped" : `${partial} were only partly mapped`],
        [belowFloor, belowFloor === 1 ? `1 has less than ${floor} hectares of forest` : `${belowFloor} have less than ${floor} hectares of forest`],
      ]
    : [
        [noneMapped, noneMapped === 1 ? "1 n’a pas du tout été cartographiée" : `${noneMapped} n’ont pas du tout été cartographiées`],
        [partial, partial === 1 ? "1 ne l’a été qu’en partie" : `${partial} ne l’ont été qu’en partie`],
        [belowFloor, belowFloor === 1 ? `1 compte moins de ${floor} hectares de forêt` : `${belowFloor} comptent moins de ${floor} hectares de forêt`],
      ]) as [number, string][];
  const named = parts.filter(([count]) => count > 0).map(([, text]) => text);
  if (named.length === 0) return null;
  const and = locale === "en" ? "and" : "et";
  const list = named.length === 1 ? named[0] : named.length === 2 ? `${named[0]} ${and} ${named[1]}` : `${named[0]}, ${named[1]}, ${and} ${named[2]}`;
  return `${locale === "en" ? "Of the rest" : "Parmi les autres"}, ${list}.`;
}

const UNRANKED_COPY = {
  en: {
    noneMapped: "No mapped coverage, not ranked",
    partial: "Partial mapped coverage, not ranked",
    belowFloor: `Complete mapped coverage below ${MINIMUM_RANKED_FOREST_HECTARES} forested hectares, not ranked`,
    federal: (ranked: number, total: number) => `${ranked} of ${total} federal ridings are ranked.`,
    national: (total: number, national: number) =>
      `These ${total} are the federal ridings in British Columbia, Alberta, Ontario and Québec, the four provinces the record covers; Canada has ${national}.`,
    provincial: (ranked: number, total: number, province: CoveredProvince) =>
      `${ranked} of ${COVERED_PROVINCE_NAMES[province].en}’s ${total} provincial ridings are ranked.`,
    federalHeading: "Federal ridings in the four provinces",
    provincialHeading: (province: CoveredProvince) => `Provincial ridings in ${COVERED_PROVINCE_NAMES[province].en}`,
    shown: (limit: number, ranked: number) => ranked > limit
      ? `Showing the first ${limit} of ${ranked} ranked ridings.`
      : `Showing all ${ranked} ranked ridings.`,
    hidden: (unranked: number) => unranked === 1 ? " The 1 not ranked is listed with the whole ranking." : ` The ${unranked} not ranked are listed with the whole ranking.`,
    showAllFederal: (total: number) => `Show all ${total} federal ridings`,
    showAllProvincial: (total: number, province: CoveredProvince) => `Show all ${total} provincial ridings in ${COVERED_PROVINCE_NAMES[province].en}`,
    order: "Ranking order",
  },
  fr: {
    noneMapped: "Aucune couverture cartographiée, non classée",
    partial: "Couverture cartographiée partielle, non classée",
    belowFloor: `Couverture cartographiée complète sous le seuil de ${MINIMUM_RANKED_FOREST_HECTARES} hectares forestiers, non classée`,
    federal: (ranked: number, total: number) => `${ranked} des ${total} circonscriptions fédérales sont classées.`,
    national: (total: number, national: number) =>
      `Ces ${total} circonscriptions sont celles de la Colombie-Britannique, de l’Alberta, de l’Ontario et du Québec, les quatre provinces que couvre le registre\u202F; le Canada en compte ${national}.`,
    provincial: (ranked: number, total: number, province: CoveredProvince) =>
      `${ranked} des ${total} circonscriptions provinciales ${COVERED_PROVINCE_NAMES[province].frOf} sont classées.`,
    federalHeading: "Circonscriptions fédérales des quatre provinces",
    provincialHeading: (province: CoveredProvince) => `Circonscriptions provinciales ${COVERED_PROVINCE_NAMES[province].frOf}`,
    shown: (limit: number, ranked: number) => ranked > limit
      ? `Les ${limit} premières des ${ranked} circonscriptions classées sont affichées.`
      : `Les ${ranked} circonscriptions classées sont affichées.`,
    hidden: (unranked: number) => unranked === 1 ? " La circonscription non classée figure dans la liste complète." : ` Les ${unranked} circonscriptions non classées figurent dans la liste complète.`,
    showAllFederal: (total: number) => `Afficher les ${total} circonscriptions fédérales`,
    showAllProvincial: (total: number, province: CoveredProvince) => `Afficher les ${total} circonscriptions provinciales ${COVERED_PROVINCE_NAMES[province].frOf}`,
    order: "Ordre du classement",
  },
} as const;

/** The anchor of a ranking section, so links can return the reader to it. */
export function rankingSectionId(scope: RankingScope) {
  return scope.level === "federal" ? "rankings-federal" : `rankings-${scope.province}`;
}

function TableHeaders({
  locale,
  copy,
}: {
  locale: Locale;
  copy: (typeof RANKING_COPY)[Locale];
}) {
  return (
    <tr>
      <th scope="col">{locale === "en" ? "Riding" : "Circonscription"}</th>
      <th scope="col">{copy.metric}</th>
      <th scope="col">{copy.hectares}</th>
      <th scope="col">{copy.forested}</th>
      <th scope="col">{locale === "en" ? "Coverage" : "Couverture"}</th>
      <th scope="col">{locale === "en" ? "Evidence" : "Type de preuve"}</th>
    </tr>
  );
}

/** Each measurement keeps a scoped column, and unavailable values remain textual. */
function RidingRow({ row, locale }: { row: RankedRiding; locale: Locale }) {
  const percent = row.detectedChangePercent === null ? missingMeasurement(row, locale) : formatPercent(row.detectedChangePercent, locale);
  const hectares = row.detectedChangeHectares === null ? missingMeasurement(row, locale) : formatHectares(row.detectedChangeHectares, locale);
  return (
    <tr>
      <th scope="row">{row.name[locale]}</th>
      <td>{percent}</td>
      <td>{hectares}</td>
      <td>{forestedArea(row, locale)}</td>
      <td>
        <MeasurementCoverage place={row} locale={locale} />
      </td>
      <td>
        <EvidenceChip evidence={row.evidence} locale={locale} />
      </td>
    </tr>
  );
}

function UnrankedTable({
  rows,
  label,
  locale,
  copy,
}: {
  rows: readonly RankedRiding[];
  label: string;
  locale: Locale;
  copy: (typeof RANKING_COPY)[Locale];
}) {
  if (rows.length === 0) return null;
  const accessibleLabel = `${label} (${rows.length})`;
  // Closed by default: these rows are listed so no riding goes missing, not
  // ranked, and open they made the page several screens long.
  return (
    <details className="comparison-unranked">
      <summary><h3>{accessibleLabel}</h3></summary>
      <div className="table-scroll" tabIndex={0} role="region" aria-label={accessibleLabel}>
        <table>
          <caption className="sr-only">{accessibleLabel}</caption>
          <thead>
            <TableHeaders locale={locale} copy={copy} />
          </thead>
          <tbody>
            {rows.map((row) => (
              <RidingRow key={row.id} row={row} locale={locale} />
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function RankedRidingsTable({
  rows,
  context,
  locale,
  sort = "share-desc",
  leftId,
  rightId,
  view,
  scope,
  limit,
  allRankings = false,
}: {
  rows: readonly RankedRiding[];
  context: RankingContext;
  locale: Locale;
  sort?: RankingSort;
  leftId?: string;
  rightId?: string;
  view?: "cards" | "table";
  /** Names the ridings ranked and gives the table its heading. Without it the table is federal and unheaded. */
  scope?: RankingScope;
  /**
   * Shows only the first ranked rows and holds back the unranked lists, with a
   * link that loads the whole ranking. The full page is several hundred rows,
   * nearly all of them unranked, so a reader who wants them asks for them.
   */
  limit?: number;
  /** Whether the reader asked for every ranking in full; carried in the links. */
  allRankings?: boolean;
}) {
  const result = rankRidings(rows, sort);
  const copy = RANKING_COPY[locale];
  const unrankedCopy = UNRANKED_COPY[locale];
  const noneMapped = result.unranked.filter((row) => row.measurementCoverage === "none-mapped");
  const partial = result.unranked.filter((row) => row.measurementCoverage === "partial-with-unknown");
  const belowFloor = result.unranked.filter((row) =>
    row.measurementCoverage === "complete" && row.forestedHectares < MINIMUM_RANKED_FOREST_HECTARES,
  );
  if (noneMapped.length + partial.length + belowFloor.length !== result.unranked.length) {
    throw new Error("Every unranked riding must have an explicit, truthful reason.");
  }
  const level = scope ?? { level: "federal" as const };
  const heading = scope
    ? scope.level === "federal" ? unrankedCopy.federalHeading : unrankedCopy.provincialHeading(scope.province)
    : null;
  const sectionId = scope ? rankingSectionId(scope) : undefined;
  const summary = [
    level.level === "federal"
      ? unrankedCopy.federal(result.ranked.length, rows.length)
      : unrankedCopy.provincial(result.ranked.length, rows.length, level.province),
    unrankedReasons(noneMapped.length, partial.length, belowFloor.length, locale),
    level.level === "federal" && level.nationalTotal !== undefined ? unrankedCopy.national(rows.length, level.nationalTotal) : null,
  ].filter(Boolean).join(" ");
  const href = (next: { sort: RankingSort; all: boolean }) => {
    const query = new URLSearchParams();
    query.set("sort", next.sort);
    if (leftId) query.set("left", leftId);
    if (rightId) query.set("right", rightId);
    if (view) query.set("view", view);
    if (next.all) query.set("rankings", "all");
    return `?${query.toString()}${sectionId ? `#${sectionId}` : ""}`;
  };
  const truncated = limit !== undefined && (result.ranked.length > limit || result.unranked.length > 0);
  const ranked = truncated ? result.ranked.slice(0, limit) : result.ranked;
  const labelled = (label: string) => (heading ? `${heading}: ${label}` : label);
  return (
    <section className="comparison-table" id={sectionId} aria-labelledby={sectionId ? `${sectionId}-heading` : undefined}>
      {heading ? <h2 id={`${sectionId}-heading`}>{heading}</h2> : null}
      <p className="comparison-ranking-summary">{summary}</p>
      <details className="card card--sand comparison-context">
        <summary>{locale === "en" ? "How this ranking works" : "Comment fonctionne ce classement"}</summary>
        <div className="comparison-context-body">
          <p className="comparison-context-meta">
            {context.timeRange} · {context.boundaryEdition} ·{" "}
            {context.dataVersion}
          </p>
          <p>{context.denominatorDefinition[locale]}</p>
          <p>{context.method[locale]}</p>
          <p>{copy.officialMatching}</p>
          <EvidenceChip evidence={context.evidence} locale={locale} />
        </div>
      </details>
      <nav className="segment" aria-label={labelled(unrankedCopy.order)}>
        <a className="segment-option" href={href({ sort: "share-desc", all: allRankings })} aria-current={sort === "share-desc" ? "page" : undefined}>
          {locale === "en" ? "Highest share first" : "Part la plus élevée en premier"}
        </a>
        <a className="segment-option" href={href({ sort: "share-asc", all: allRankings })} aria-current={sort === "share-asc" ? "page" : undefined}>
          {locale === "en" ? "Lowest share first" : "Part la plus faible en premier"}
        </a>
      </nav>
      <div className="table-scroll" tabIndex={0} role="region" aria-label={labelled(copy.metric)}>
        <table>
          <caption>{copy.metric}</caption>
          <thead>
            <TableHeaders locale={locale} copy={copy} />
          </thead>
          <tbody>
            {ranked.map((row) => (
              <RidingRow key={row.id} row={row} locale={locale} />
            ))}
          </tbody>
        </table>
      </div>
      {truncated ? (
        <p className="comparison-ranking-more">
          {unrankedCopy.shown(limit, result.ranked.length)}
          {result.unranked.length > 0 ? unrankedCopy.hidden(result.unranked.length) : null}{" "}
          <a href={href({ sort, all: true })}>
            {level.level === "federal" ? unrankedCopy.showAllFederal(rows.length) : unrankedCopy.showAllProvincial(rows.length, level.province)}
          </a>
        </p>
      ) : (
        <>
          <UnrankedTable rows={noneMapped} label={labelled(unrankedCopy.noneMapped)} locale={locale} copy={copy} />
          <UnrankedTable rows={partial} label={labelled(unrankedCopy.partial)} locale={locale} copy={copy} />
          <UnrankedTable rows={belowFloor} label={labelled(unrankedCopy.belowFloor)} locale={locale} copy={copy} />
        </>
      )}
      <data value={RANKING_METRIC} />
    </section>
  );
}
