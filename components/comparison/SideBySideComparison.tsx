import { EvidenceChip } from "@/components/policy";
import {
  comparePlaces,
  type ComparisonPlace,
} from "@/lib/comparison";
import { formatHectares, formatPercent, type Locale } from "@/lib/domain";
import { MeasurementCoverage, missingMeasurement } from "./MeasurementCoverage";

export function SideBySideComparison({
  places,
  locale,
  view = "cards",
  leftId,
  rightId,
  sort,
}: {
  places: readonly ComparisonPlace[];
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
        };
  const percent = (place: ComparisonPlace) => place.detectedChangePercent === null ? missingMeasurement(place, locale) : formatPercent(place.detectedChangePercent, locale);
  const hectares = (place: ComparisonPlace) => place.detectedChangeHectares === null ? missingMeasurement(place, locale) : formatHectares(place.detectedChangeHectares, locale);
  const provenance = <p className="comparison-provenance"><a href={locale === "en" ? "/en/data" : "/fr/donnees"}>{locale === "en" ? "Sources for these measurements" : "Sources de ces mesures"}</a>{" · "}<a href={locale === "en" ? "/en/methods" : "/fr/methodes"}>{locale === "en" ? "Measurement method" : "Méthode de mesure"}</a></p>;
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
        {provenance}
        <div className="table-scroll">
          <table aria-label={labels.title}>
            <caption>{labels.title}</caption>
            <thead>
              <tr>
                <th scope="col">{labels.measure}</th>
                <th scope="col">{left.name[locale]}<div className="comparison-heading-coverage">{labels.coverage}: <MeasurementCoverage place={left} locale={locale} /></div></th>
                <th scope="col">{right.name[locale]}<div className="comparison-heading-coverage">{labels.coverage}: <MeasurementCoverage place={right} locale={locale} /></div></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">{labels.share}</th>
                <td>{percent(left)}</td>
                <td>{percent(right)}</td>
              </tr>
              <tr>
                <th scope="row">{labels.change}</th>
                <td>{hectares(left)}</td>
                <td>{hectares(right)}</td>
              </tr>
              <tr>
                <th scope="row">{labels.forest}</th>
                <td>{formatHectares(left.forestedHectares, locale)}</td>
                <td>{formatHectares(right.forestedHectares, locale)}</td>
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
      </section>
    );
  }

  return (
    <section className="comparison-side-by-side" aria-label={labels.title}>
      <a className="btn btn--ghost" href={viewHref("table")}>
        {labels.table}
      </a>
      {provenance}
      <div className="comparison-pair">
        <Place place={left} locale={locale} />
        <Place place={right} locale={locale} />
      </div>
    </section>
  );
}

function Place({ place, locale }: { place: ComparisonPlace; locale: Locale }) {
  const percent = place.detectedChangePercent === null ? missingMeasurement(place, locale) : formatPercent(place.detectedChangePercent, locale);
  const hectares = place.detectedChangeHectares === null ? missingMeasurement(place, locale) : formatHectares(place.detectedChangeHectares, locale);
  return (
    <article className="card card--lift comparison-card">
      <header>
        <h2>{place.name[locale]}</h2>
        <div className="comparison-heading-coverage">{locale === "en" ? "Coverage" : "Couverture"}: <MeasurementCoverage place={place} locale={locale} /></div>
      </header>
      <dl className="comparison-figures">
        <dt>{locale === "en" ? "Detected change share" : "Part du changement détecté"}</dt><dd>{percent}</dd>
        <dt>{locale === "en" ? "Detected change" : "Changement détecté"}</dt><dd>{hectares}</dd>
        <dt>{locale === "en" ? "Forested area" : "Superficie forestière"}</dt><dd>{formatHectares(place.forestedHectares, locale)}</dd>
      </dl>
      <EvidenceChip evidence={place.evidence} locale={locale} />
    </article>
  );
}
