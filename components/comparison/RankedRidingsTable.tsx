import { CoverageBand, EvidenceChip } from "@/components/policy";
import {
  RANKING_COPY,
  RANKING_METRIC,
  rankRidings,
  type RankedRiding,
  type RankingContext,
} from "@/lib/comparison";
import type { Locale } from "@/lib/domain";

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

/** The rank basis and its denominator share the one cell, so a cropped screenshot cannot separate them. */
function RidingRow({ row, locale }: { row: RankedRiding; locale: Locale }) {
  const copy = RANKING_COPY[locale];
  return (
    <tr>
      <th scope="row">{row.name[locale]}</th>
      <td>
        {row.detectedChangePercent}%
        <span className="rank-unmatched-share">
          {" "}
          · {copy.unmatched}: {row.unmatchedSharePercent}%
        </span>
      </td>
      <td>{row.detectedChangeHectares} ha</td>
      <td>{row.forestedHectares} ha</td>
      <td>
        <CoverageBand coverageGrade={row.coverageGrade} locale={locale} />
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
}: {
  rows: readonly RankedRiding[];
  context: RankingContext;
  locale: Locale;
}) {
  const result = rankRidings(rows);
  const copy = RANKING_COPY[locale];
  return (
    <section className="comparison-table" aria-label={copy.metric}>
      <header className="card card--sand comparison-context">
        <p className="comparison-context-meta">
          {context.timeRange} · {context.boundaryEdition} ·{" "}
          {context.dataVersion}
        </p>
        <p>{context.denominatorDefinition[locale]}</p>
        <p>{context.method[locale]}</p>
        <EvidenceChip evidence={context.evidence} locale={locale} />
      </header>
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
