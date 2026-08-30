import { EvidenceChip } from "@/components/policy";
import {
  comparePlaces,
  type ComparisonPlace,
  type RankingContext,
} from "@/lib/comparison";
import type { Locale } from "@/lib/domain";
import { MeasurementCoverage } from "./MeasurementCoverage";

export function SideBySideComparison({
  places,
  context,
  locale,
  view = "cards",
  leftId,
  rightId,
  sort,
}: {
  places: readonly ComparisonPlace[];
  context: RankingContext;
  locale: Locale;
  view?: "cards" | "table";
  leftId?: string;
  rightId?: string;
  sort?: string;
}) {
  const [left, right] = comparePlaces(places);
  const labels =
    locale === "en"
      ? {
          title: "Side-by-side comparison",
          table: "View as table",
          cards: "View as cards",
          measure: "Measure",
          share: "Detected change share",
          change: "Detected change",
          forest: "Forested area",
          coverage: "Coverage",
          evidence: "Evidence",
          method: "Method",
        }
      : {
          title: "Comparaison côte à côte",
          table: "Afficher en tableau",
          cards: "Afficher en cartes",
          measure: "Mesure",
          share: "Part du changement détecté",
          change: "Changement détecté",
          forest: "Superficie forestière",
          coverage: "Couverture",
          evidence: "Élément de preuve",
          method: "Méthode",
        };
  const methodNote = (
    <p className="comparison-method">
      {labels.method}: {context.method[locale]}
    </p>
  );
  const unknown = locale === "en" ? "Unknown" : "Inconnu";
  const percent = (value: number | null) => value === null ? unknown : `${value}%`;
  const hectares = (value: number | null) => value === null ? unknown : `${value} ha`;
  const viewHref = (nextView: "cards" | "table") => {
    const query = new URLSearchParams();
    query.set("view", nextView);
    if (leftId) query.set("left", leftId);
    if (rightId) query.set("right", rightId);
    if (sort) query.set("sort", sort);
    return `?${query.toString()}`;
  };

  if (view === "table") {
    return (
      <section className="comparison-side-by-side">
        <a className="btn btn--ghost" href={viewHref("cards")}>
          {labels.cards}
        </a>
        <div className="table-scroll">
          <table aria-label={labels.title}>
            <caption>{labels.title}</caption>
            <thead>
              <tr>
                <th scope="col">{labels.measure}</th>
                <th scope="col">{left.name[locale]}</th>
                <th scope="col">{right.name[locale]}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">{labels.share}</th>
                <td>{percent(left.detectedChangePercent)}</td>
                <td>{percent(right.detectedChangePercent)}</td>
              </tr>
              <tr>
                <th scope="row">{labels.change}</th>
                <td>{hectares(left.detectedChangeHectares)}</td>
                <td>{hectares(right.detectedChangeHectares)}</td>
              </tr>
              <tr>
                <th scope="row">{labels.forest}</th>
                <td>{left.forestedHectares} ha</td>
                <td>{right.forestedHectares} ha</td>
              </tr>
              <tr>
                <th scope="row">{labels.coverage}</th>
                <td>
                  <MeasurementCoverage place={left} locale={locale} />
                </td>
                <td>
                  <MeasurementCoverage place={right} locale={locale} />
                </td>
              </tr>
              <tr>
                <th scope="row">{labels.evidence}</th>
                <td>
                  <EvidenceChip evidence={left.evidence} locale={locale} />
                </td>
                <td>
                  <EvidenceChip evidence={right.evidence} locale={locale} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {methodNote}
      </section>
    );
  }

  return (
    <section className="comparison-side-by-side" aria-label={labels.title}>
      <a className="btn btn--ghost" href={viewHref("table")}>
        {labels.table}
      </a>
      <div className="comparison-pair">
        <Place place={left} locale={locale} unknown={unknown} />
        <Place place={right} locale={locale} unknown={unknown} />
      </div>
      {methodNote}
    </section>
  );
}

function Place({ place, locale, unknown }: { place: ComparisonPlace; locale: Locale; unknown: string }) {
  const percent = place.detectedChangePercent === null ? unknown : `${place.detectedChangePercent}%`;
  const hectares = place.detectedChangeHectares === null ? unknown : `${place.detectedChangeHectares} ha`;
  return (
    <article className="card card--lift comparison-card">
      <h2>{place.name[locale]}</h2>
      <p className="comparison-figures">
        {percent} · {hectares} ·{" "}
        {place.forestedHectares} ha
      </p>
      <MeasurementCoverage place={place} locale={locale} />
      <EvidenceChip evidence={place.evidence} locale={locale} />
    </article>
  );
}
