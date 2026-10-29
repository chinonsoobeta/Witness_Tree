import { EvidenceChip } from "@/components/policy";
import {
  comparePlaces,
  COVERED_PROVINCE_NAMES,
  type ComparisonPlace,
  type CoveredProvince,
} from "@/lib/comparison";
import { ridingLevel, ridingProvinceCode } from "@/lib/comparison/riding-typeahead";
import { colon, formatHectares, formatPercent, type Locale } from "@/lib/domain";
import { forestedArea, MeasurementCoverage, missingMeasurement } from "./MeasurementCoverage";

/**
 * A riding's level and province, such as "Provincial riding · British
 * Columbia", so a federal and a provincial riding of the same name are told
 * apart. Places that are not ridings carry no label.
 */
export function ridingLevelLabel(place: Pick<ComparisonPlace, "id" | "placeType">, locale: Locale): string | null {
  if (place.placeType !== "federal-riding" && place.placeType !== "provincial-riding") return null;
  const provincial = place.placeType === "provincial-riding" || ridingLevel(place.id) === "provincial";
  const level = locale === "en"
    ? provincial ? "Provincial riding" : "Federal riding"
    : provincial ? "Circonscription provinciale" : "Circonscription fédérale";
  const code = ridingProvinceCode(place.id) as CoveredProvince | null;
  return code ? `${level} · ${COVERED_PROVINCE_NAMES[code][locale]}` : level;
}

export function SideBySideComparison({
  places,
  locale,
  view = "cards",
  leftId,
  rightId,
  sort,
  allRankings = false,
}: {
  /** The left and right places; a side the reader has not chosen, or that could not be found, is null. */
  places: readonly (ComparisonPlace | null)[];
  locale: Locale;
  view?: "cards" | "table";
  leftId?: string;
  rightId?: string;
  sort?: string;
  allRankings?: boolean;
}) {
  if (places.length !== 2) throw new Error("Side-by-side comparison requires exactly two sides.");
  const [left, right] = places[0] && places[1] ? comparePlaces([places[0], places[1]]) : [places[0] ?? null, places[1] ?? null];
  const labels =
    locale === "en"
      ? {
          title: "Side-by-side comparison",
          table: "View as table",
          cards: "View as cards",
          measure: "Measure",
          share: "Detected loss share",
          change: "Detected loss",
          forest: "Forested area",
          coverage: "Coverage",
          evidence: "Evidence",
          empty: "No riding chosen",
          choose: "Choose a riding in the fields above to compare it.",
        }
      : {
          title: "Comparaison côte à côte",
          table: "Afficher en tableau",
          cards: "Afficher en fiches",
          measure: "Mesure",
          share: "Part de perte détectée",
          change: "Perte détectée",
          forest: "Superficie forestière",
          coverage: "Couverture",
          evidence: "Type de preuve",
          empty: "Aucune circonscription choisie",
          choose: "Choisissez une circonscription dans les champs ci-dessus pour la comparer.",
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
    if (allRankings) query.set("rankings", "all");
    return `?${query.toString()}`;
  };

  if (view === "table") {
    const chosen = [left, right].filter((place): place is ComparisonPlace => place !== null);
    return (
      <section className="comparison-side-by-side">
        <a className="btn btn--ghost" href={viewHref("cards")}>
          {labels.cards}
        </a>
        {provenance}
        {chosen.length === 0 ? <p className="comparison-empty">{labels.choose}</p> : (
          <div className="table-scroll" tabIndex={0} role="region" aria-label={labels.title}>
            <table aria-label={labels.title}>
              <caption>{labels.title}</caption>
              <thead>
                <tr>
                  <th scope="col">{labels.measure}</th>
                  {chosen.map((place) => {
                    const level = ridingLevelLabel(place, locale);
                    return (
                      <th scope="col" key={place.id}>
                        {place.name[locale]}
                        {level ? <div className="comparison-level">{level}</div> : null}
                        <div className="comparison-heading-coverage">{labels.coverage}{colon(locale)} <MeasurementCoverage place={place} locale={locale} /></div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">{labels.share}</th>
                  {chosen.map((place) => <td key={place.id}>{percent(place)}</td>)}
                </tr>
                <tr>
                  <th scope="row">{labels.change}</th>
                  {chosen.map((place) => <td key={place.id}>{hectares(place)}</td>)}
                </tr>
                <tr>
                  <th scope="row">{labels.forest}</th>
                  {chosen.map((place) => <td key={place.id}>{forestedArea(place, locale)}</td>)}
                </tr>
                <tr>
                  <th scope="row">{labels.evidence}</th>
                  {chosen.map((place) => (
                    <td key={place.id}>
                      <EvidenceChip evidence={place.evidence} locale={locale} />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {chosen.length === 1 ? <p className="comparison-empty">{labels.choose}</p> : null}
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
        {[left, right].map((place, index) => place
          ? <Place key={place.id} place={place} locale={locale} />
          : (
            <article key={`empty-${index}`} className="card comparison-card comparison-card--empty">
              <h2>{labels.empty}</h2>
              <p>{labels.choose}</p>
            </article>
          ))}
      </div>
    </section>
  );
}

function Place({ place, locale }: { place: ComparisonPlace; locale: Locale }) {
  const percent = place.detectedChangePercent === null ? missingMeasurement(place, locale) : formatPercent(place.detectedChangePercent, locale);
  const hectares = place.detectedChangeHectares === null ? missingMeasurement(place, locale) : formatHectares(place.detectedChangeHectares, locale);
  const level = ridingLevelLabel(place, locale);
  return (
    <article className="card card--lift comparison-card">
      <header>
        <h2>{place.name[locale]}</h2>
        {level ? <p className="comparison-level">{level}</p> : null}
        <div className="comparison-heading-coverage">{locale === "en" ? "Coverage" : "Couverture"}{colon(locale)} <MeasurementCoverage place={place} locale={locale} /></div>
      </header>
      <dl className="comparison-figures">
        <dt>{locale === "en" ? "Detected loss share" : "Part de perte détectée"}</dt><dd>{percent}</dd>
        <dt>{locale === "en" ? "Detected loss" : "Perte détectée"}</dt><dd>{hectares}</dd>
        <dt>{locale === "en" ? "Forested area" : "Superficie forestière"}</dt><dd>{forestedArea(place, locale)}</dd>
      </dl>
      <EvidenceChip evidence={place.evidence} locale={locale} />
    </article>
  );
}
