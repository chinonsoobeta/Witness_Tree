import type { Locale } from "@/lib/domain";
import type { Place } from "@/lib/places";
import { ReportedValue } from "@/components/policy";
import { AnnualChangeChart } from "./AnnualChangeChart";

export function PlacePage({
  locale,
  place,
  view,
}: Readonly<{ locale: Locale; place: Place; view: "chart" | "table" }>) {
  const text =
    locale === "en"
      ? {
          coverage: "Coverage",
          sources: "Illustrative source-ledger entries",
          download: "Download illustrative data",
          citation: "Citation",
          stats: "Reported values",
          boundary: "Boundary edition",
          denominator: "Forested hectares",
        }
      : {
          coverage: "Couverture",
          sources: "Entrées illustratives du registre des sources",
          download: "Télécharger les données illustratives",
          citation: "Citation",
          stats: "Valeurs déclarées",
          boundary: "Édition de limite",
          denominator: "Hectares forestiers",
        };
  return (
    <main id="main" className="page-wrap record-page">
      <header className="masthead">
        {place.status === "example" ? (
          <p className="eyebrow">
            {locale === "en" ? "Illustrative fixture" : "Exemple illustratif"}
          </p>
        ) : null}
        <h1>{place.name[locale]}</h1>
        <p className="dek">{place.aliases[locale]}</p>
      </header>

      <dl className="stat-row">
        <div className="stat">
          <dt>{text.boundary}</dt>
          <dd>
            {place.boundaryEdition} ({place.boundaryVersion})
          </dd>
        </div>
        <div className="stat">
          <dt>{text.denominator}</dt>
          <dd>{place.forestHectares}</dd>
        </div>
      </dl>

      <section className="record-block">
        <h2>{text.coverage}</h2>
        <ul className="coverage-list">
          {place.coverage.map((item) => (
            <li key={item.grade}>
              <span className="coverage-band">
                {item.grade}: {item.share * 100}%
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="record-block">
        <h2>{text.stats}</h2>
        <div className="reported-stack">
          {place.stats.map((reported, index) => (
            <ReportedValue
              key={index}
              reported={reported}
              coverageGrade={place.coverage[0].grade}
              locale={locale}
            />
          ))}
        </div>
      </section>

      <AnnualChangeChart annual={place.annual} locale={locale} view={view} />

      {place.safeguard ? (
        <aside className="notice card--sand record-safeguard">
          <p>{place.safeguard[locale]}</p>
        </aside>
      ) : null}

      <section className="record-block">
        <h2>{text.sources}</h2>
        <ul className="source-list">
          {place.sources.map((source) => (
            <li className="card" key={source}>
              <a href="https://github.com/chinonsoobeta/Witness_Tree/blob/main/data/source-ledger.json">
                {source}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <p>
        <a
          className="btn btn--outline"
          href={`data:text/csv;charset=utf-8,placeId%2Cyear%0A${place.id}%2C2024`}
        >
          {text.download}
        </a>
      </p>

      <footer className="record-citation">
        <h2>{text.citation}</h2>
        <p>
          {place.citation.timeRange}; {place.boundaryEdition};{" "}
          {place.citation.dataVersion}; {text.denominator}:{" "}
          {place.forestHectares}; {place.citation.method}.
        </p>
      </footer>
    </main>
  );
}
