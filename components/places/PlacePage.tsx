import { colon, COVERAGE_LABELS, formatHectares, formatPercent, semicolon, type Locale } from "@/lib/domain";
import type { Place } from "@/lib/places";
import { ProvenanceBlock, ReportedValue } from "@/components/policy";
import { CoverageStatement } from "@/components/policy/CoverageStatement";
import { EvidenceLegend } from "@/components/policy/EvidenceLegend";
import { AnnualChangeChart } from "./AnnualChangeChart";
import { absentYearCount, PlaceYearRows, yearRows } from "./PlaceYearRows";

/**
 * The place record, arranged so the page states what it can and cannot tell you
 * before it shows a number.
 *
 * The identity band and the coverage panel are one unit at the top: the reader
 * meets the boundary, the denominator, and the shape of what is missing in the
 * same glance.  The uncovered-years line sits in that panel beside the coverage
 * shares deliberately, because a share of area and a count of silent years are
 * two different ways of being incomplete and neither one implies the other.
 *
 * Provenance is beside the figures rather than under them, and the caution
 * about citing a partial record sits with the download rather than at the foot
 * of the page, because the reader who is about to quote a number is the reader
 * who most needs it.
 */
export function PlacePage({
  locale,
  place,
  view,
}: Readonly<{ locale: Locale; place: Place; view: "chart" | "table" }>) {
  const rows = yearRows(place);
  const absent = absentYearCount(rows);
  const observedYears = place.annual.map((entry) => entry.year);
  const window = observedYears.length > 0
    ? { first: Math.min(...observedYears), last: Math.max(...observedYears) }
    : null;
  const windowYears = window ? window.last - window.first + 1 : 0;

  const text =
    locale === "en"
      ? {
          panel: "What this page can tell you",
          evidenceClasses: "Evidence classes",
          observed: "What was observed, year by year",
          provenance: "Where these numbers come from",
          caution: "Before you cite this",
          cautionBody: "The years with a record are not a total for the period. Absence of a record is not absence of change.",
          method: "Read the method",
          sources: "Illustrative source-ledger entries",
          download: "Download illustrative data",
          citation: "Citation",
          recorded: "Recorded change",
          share: "Share of forested area affected",
          boundary: "Boundary edition",
          denominator: "Forested hectares",
          eyebrow: "An illustrative record",
          note: "Every figure below carries its evidence class, confidence and source. Unknown is shown as –, never as zero.",
          absent: (count: number, total: number) =>
            `${count} of ${total} years in ${window?.first}–${window?.last} have no integrated record`,
          lead: (boundary: string, hectares: string) =>
            `This page reports what has been recorded or observed inside boundary ${boundary}, across ${hectares}. It does not report what has not been recorded.`,
        }
      : {
          panel: "Ce que cette page permet de savoir",
          evidenceClasses: "Catégories de preuves",
          observed: "Ce qui a été observé, année par année",
          provenance: "D’où viennent ces chiffres",
          caution: "Avant de citer ces données",
          cautionBody: "Les années dotées d’un registre ne constituent pas un total pour la période. L’absence de registre n’est pas l’absence de changement.",
          method: "Lire la méthode",
          sources: "Entrées illustratives du registre des sources",
          download: "Télécharger les données illustratives",
          citation: "Citation",
          recorded: "Changement consigné",
          share: "Part de la superficie forestière touchée",
          boundary: "Édition de limite",
          denominator: "Hectares forestiers",
          eyebrow: "Un dossier illustratif",
          note: "Chaque chiffre ci-dessous porte sa catégorie de preuve, sa confiance et sa source. L’inconnu est indiqué par –, jamais par zéro.",
          absent: (count: number, total: number) =>
            `${count} des ${total} années de ${window?.first}–${window?.last} n’ont aucun registre intégré`,
          lead: (boundary: string, hectares: string) =>
            `Cette page rend compte de ce qui a été consigné ou observé à l’intérieur de la limite ${boundary}, sur ${hectares}. Elle ne rend pas compte de ce qui n’a pas été consigné.`,
        };

  const statLabels = [text.recorded, text.share];

  return (
    <main id="main" className="page-wrap place-record">
      <div className="place-hero">
        <header className="place-identity">
          {place.status === "example" ? <p className="eyebrow">{text.eyebrow}</p> : null}
          <h1>{place.name[locale]}</h1>
          <p className="place-hero-lead">
            {text.lead(place.boundaryEdition, formatHectares(place.forestHectares, locale))}
          </p>
          <p className="place-hero-alias">{place.aliases[locale]}</p>
        </header>

        <CoverageStatement locale={locale} title={text.panel} className="place-hero-panel">
          <ul className="place-coverage-keys">
            {place.coverage.map((item) => (
              <li key={item.grade}>
                <span className={`place-key-swatch place-key-swatch--${item.grade}`} aria-hidden="true" />
                <strong>
                  {COVERAGE_LABELS[item.grade][locale]}{colon(locale)} {formatPercent(item.share * 100, locale)}
                </strong>
              </li>
            ))}
            {window && absent > 0 ? (
              <li className="place-coverage-keys-absent">
                <span className="place-key-swatch place-key-swatch--absent" aria-hidden="true" />
                <span>{text.absent(absent, windowYears)}</span>
              </li>
            ) : null}
          </ul>
          <p className="place-hero-note">{text.note}</p>
        </CoverageStatement>
      </div>

      <div className="place-evidence-strip">
        <h2 className="eyebrow">{text.evidenceClasses}</h2>
        <EvidenceLegend locale={locale} />
      </div>

      <div className="place-body">
        <div className="place-stat-cards">
          {place.stats.map((reported, index) => (
            <section className={`place-stat-card place-stat-card--${reported.kind}`} key={index}>
              <h2 className="eyebrow">{statLabels[index] ?? text.recorded}</h2>
              <ReportedValue reported={reported} coverageGrade={place.coverage[0].grade} locale={locale} />
            </section>
          ))}
        </div>

        <dl className="stat-row">
          <div className="stat">
            <dt>{text.boundary}</dt>
            <dd>{place.boundaryEdition} ({place.boundaryVersion})</dd>
          </div>
          <div className="stat">
            <dt>{text.denominator}</dt>
            <dd>{formatHectares(place.forestHectares, locale)}</dd>
          </div>
        </dl>

        <div className="place-detail">
          <aside className="place-provenance">
            <section className="card place-provenance-card">
              <h2 className="eyebrow">{text.provenance}</h2>
              {place.events[0] ? (
                <ProvenanceBlock provenance={place.events[0].provenance} locale={locale} />
              ) : null}
              <h3 className="place-source-heading">{text.sources}</h3>
              <ul className="source-list">
                {place.sources.map((source) => (
                  <li key={source}>
                    <a href="https://github.com/chinonsoobeta/Witness_Tree/blob/main/data/source-ledger.json">
                      {source}
                    </a>
                  </li>
                ))}
              </ul>
            </section>

            <section className="card place-caution">
              <h2 className="eyebrow">{text.caution}</h2>
              <p>{text.cautionBody}</p>
              <a href={locale === "en" ? "/en/methods" : "/fr/methodes"}>{text.method}</a>
            </section>

            <a
              className="btn btn--primary place-download"
              href={`data:text/csv;charset=utf-8,placeId%2Cyear%0A${place.id}%2C2024`}
            >
              {text.download}
            </a>

            <section className="record-citation">
              <h2 className="eyebrow">{text.citation}</h2>
              <p>
                {place.citation.timeRange}
                {semicolon(locale)} {place.boundaryEdition}
                {semicolon(locale)} {place.citation.dataVersion}
                {semicolon(locale)} {text.denominator}
                {colon(locale)} {formatHectares(place.forestHectares, locale)}
                {semicolon(locale)} {place.citation.method}.
              </p>
            </section>
          </aside>
          <section className="place-observed">
            <h2 className="eyebrow">{text.observed}</h2>
            <PlaceYearRows place={place} locale={locale} />
            <AnnualChangeChart annual={place.annual} locale={locale} view={view} />
          </section>

        </div>

        {place.safeguard ? (
          <aside className="notice card--sand record-safeguard">
            <p>{place.safeguard[locale]}</p>
          </aside>
        ) : null}
      </div>
    </main>
  );
}
