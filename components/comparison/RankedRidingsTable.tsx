import { EvidenceChip } from "@/components/policy";
import {
  MINIMUM_RANKED_FOREST_HECTARES,
  RANKING_COPY,
  RANKING_METRIC,
  rankRidings,
  type RankingSort,
  type RankedRiding,
  type RankingContext,
} from "@/lib/comparison";
import { formatHectares, formatPercent, type Locale } from "@/lib/domain";
import { MeasurementCoverage } from "./MeasurementCoverage";

const UNRANKED_COPY = {
  en: {
    noneMapped: "No mapped coverage, not ranked",
    partial: "Partial mapped coverage, not ranked",
    belowFloor: `Complete mapped coverage below ${MINIMUM_RANKED_FOREST_HECTARES} forested hectares, not ranked`,
    summary: (ranked: number, total: number, noneMapped: number, partial: number, belowFloor: number) =>
      `${ranked} of ${total} federal districts are ranked. ${noneMapped} have no mapped coverage; ${partial} have partial mapped coverage; ${belowFloor} have complete mapped coverage but less than ${MINIMUM_RANKED_FOREST_HECTARES} forested hectares.`,
  },
  fr: {
    noneMapped: "Aucune couverture cartographiée, non classée",
    partial: "Couverture cartographiée partielle, non classée",
    belowFloor: `Couverture cartographiée complète sous le seuil de ${MINIMUM_RANKED_FOREST_HECTARES} hectares forestiers, non classée`,
    summary: (ranked: number, total: number, noneMapped: number, partial: number, belowFloor: number) =>
      `${ranked} des ${total} circonscriptions fédérales sont classées. ${noneMapped} n’ont aucune couverture cartographiée; ${partial} ont une couverture cartographiée partielle; ${belowFloor} ont une couverture cartographiée complète, mais moins de ${MINIMUM_RANKED_FOREST_HECTARES} hectares forestiers.`,
  },
} as const;

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
      <th scope="col">{locale === "en" ? "Evidence" : "Élément de preuve"}</th>
    </tr>
  );
}

/** Each measurement keeps a scoped column, and unavailable values remain textual. */
function RidingRow({ row, locale }: { row: RankedRiding; locale: Locale }) {
  const copy = RANKING_COPY[locale];
  const percent = row.detectedChangePercent === null ? copy.unknown : formatPercent(row.detectedChangePercent, locale);
  const hectares = row.detectedChangeHectares === null ? copy.unknown : formatHectares(row.detectedChangeHectares, locale);
  return (
    <tr>
      <th scope="row">{row.name[locale]}</th>
      <td>{percent}</td>
      <td>{hectares}</td>
      <td>{formatHectares(row.forestedHectares, locale)}</td>
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
  return (
    <section aria-label={accessibleLabel}>
      <h3>{accessibleLabel}</h3>
      <div className="table-scroll">
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
    </section>
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
}: {
  rows: readonly RankedRiding[];
  context: RankingContext;
  locale: Locale;
  sort?: RankingSort;
  leftId?: string;
  rightId?: string;
  view?: "cards" | "table";
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
  const sortHref = (nextSort: RankingSort) => {
    const query = new URLSearchParams();
    query.set("sort", nextSort);
    if (leftId) query.set("left", leftId);
    if (rightId) query.set("right", rightId);
    if (view) query.set("view", view);
    return `?${query.toString()}`;
  };
  return (
    <section className="comparison-table" aria-label={copy.metric}>
      <header className="card card--sand comparison-context">
        <p className="comparison-context-meta">
          {context.timeRange} · {context.boundaryEdition} ·{" "}
          {context.dataVersion}
        </p>
        <p>{context.denominatorDefinition[locale]}</p>
        <p>{context.method[locale]}</p>
        <p>{unrankedCopy.summary(result.ranked.length, rows.length, noneMapped.length, partial.length, belowFloor.length)}</p>
        <p>{copy.officialMatching}</p>
        <EvidenceChip evidence={context.evidence} locale={locale} />
      </header>
      <nav className="segment" aria-label={locale === "en" ? "Ranking order" : "Ordre du classement"}>
        <a className="segment-option" href={sortHref("share-desc")} aria-current={sort === "share-desc" ? "page" : undefined}>
          {locale === "en" ? "Highest share first" : "Part la plus élevée en premier"}
        </a>
        <a className="segment-option" href={sortHref("share-asc")} aria-current={sort === "share-asc" ? "page" : undefined}>
          {locale === "en" ? "Lowest share first" : "Part la plus faible en premier"}
        </a>
      </nav>
      <div className="table-scroll">
        <table>
          <caption>{copy.metric}</caption>
          <thead>
            <TableHeaders locale={locale} copy={copy} />
          </thead>
          <tbody>
            {result.ranked.map((row) => (
              <RidingRow key={row.id} row={row} locale={locale} />
            ))}
          </tbody>
        </table>
      </div>
      <UnrankedTable rows={noneMapped} label={unrankedCopy.noneMapped} locale={locale} copy={copy} />
      <UnrankedTable rows={partial} label={unrankedCopy.partial} locale={locale} copy={copy} />
      <UnrankedTable rows={belowFloor} label={unrankedCopy.belowFloor} locale={locale} copy={copy} />
      <data value={RANKING_METRIC} />
    </section>
  );
}
