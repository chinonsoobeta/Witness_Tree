import Link from "next/link";
import { formatHectares, formatPercent, type Locale } from "@/lib/domain";
import { EXPLORE_PRODUCTION_LAYER } from "@/lib/explore";

// One hectare scale across both measures and all provinces. Percentages below
// retain their separate forest and province denominators.
const scaleHectares = Math.max(...EXPLORE_PRODUCTION_LAYER.rows.flatMap((row) => [row.observedLossHectares, row.unknownRequiredInputHectares]));

export function ProvinceCoverageCard({ row, locale, unknownContext }: Readonly<{
  row: (typeof EXPLORE_PRODUCTION_LAYER.rows)[number];
  locale: Locale;
  unknownContext: string;
}>) {
  const english = locale === "en";
  return (
    <article className="province-coverage-card" aria-labelledby={`province-${row.id}`}>
      <h3 id={`province-${row.id}`}>{row.name[locale]}</h3>
      <dl className="province-coverage-pair">
        <div className="province-coverage-measure">
          <dt>{english ? "Detected loss" : "Perte détectée"}</dt>
          <dd>
            <strong className="province-coverage-value">{formatHectares(row.observedLossHectares, locale)}</strong>
            <span className="province-coverage-track" aria-hidden="true"><span className="province-coverage-fill" style={{ width: `${row.observedLossHectares / scaleHectares * 100}%` }} /></span>
            <p>{formatPercent(row.observedLossPercent, locale)} {english ? "of known mapped forest. Minimum from the mapped area." : "de la forêt connue cartographiée. Minimum de la zone cartographiée."}</p>
          </dd>
        </div>
        <div className="province-coverage-measure province-coverage-unknown">
          <dt>{english ? "Not mapped by source" : "Non cartographié par la source"}</dt>
          <dd>
            <strong className="province-coverage-value">{formatHectares(row.unknownRequiredInputHectares, locale)}</strong>
            <span className="province-coverage-track" aria-hidden="true"><span className="province-coverage-fill" style={{ width: `${row.unknownRequiredInputHectares / scaleHectares * 100}%` }} /></span>
            <p>{unknownContext}</p>
          </dd>
        </div>
      </dl>
      <Link href={english ? "/en/data" : "/fr/donnees"}>{english ? "Source, coverage and limits" : "Source, couverture et limites"}</Link>
    </article>
  );
}
