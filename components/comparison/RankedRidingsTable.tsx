import { EvidenceChip } from "@/components/policy";
import {
  RANKING_COPY,
  RANKING_METRIC,
  rankRidings,
  type RankingSort,
  type RankedRiding,
  type RankingContext,
} from "@/lib/comparison";
import { formatHectares, formatPercent, type Locale } from "@/lib/domain";
import { MeasurementCoverage } from "./MeasurementCoverage";

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
      {result.insufficientCoverage.length > 0 && (
        <section aria-label={copy.insufficient}>
          <h3>{copy.insufficient}</h3>
          <div className="table-scroll">
            <table>
              {/* The heading above already states this; the caption stays for
                  the table's accessible name without repeating it on screen. */}
              <caption className="sr-only">{copy.insufficient}</caption>
              <thead>
                <TableHeaders locale={locale} copy={copy} />
              </thead>
              <tbody>
                {result.insufficientCoverage.map((row) => (
                  <RidingRow key={row.id} row={row} locale={locale} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <data value={RANKING_METRIC} />
    </section>
  );
}
