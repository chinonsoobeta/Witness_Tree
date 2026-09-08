import { colon, COVERAGE_LABELS, formatHectares, formatPercent, semicolon, type Locale } from "@/lib/domain";
import type { Place } from "@/lib/places";
import { ReportedValue } from "@/components/policy";
import { CoverageStatement } from "@/components/policy/CoverageStatement";
import { EvidenceLegend } from "@/components/policy/EvidenceLegend";
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
    <main id="main" className="page-wrap record-page place-record">
      <header className="place-identity">
        {place.status === "example" ? (
          <p className="eyebrow">
            {locale === "en" ? "Illustrative fixture" : "Exemple illustratif"}
          </p>
        ) : null}
        <h1>{place.name[locale]}</h1>
      </header>

      <CoverageStatement locale={locale}>
        <p>{locale === "en"
          ? "This place record is an illustrative fixture. Its coverage shares describe the example, not a measured record for this place. A missing public record does not establish that no event occurred."
          : "Ce dossier de lieu est un exemple illustratif. Ses parts de couverture décrivent l’exemple, et non un registre mesuré pour ce lieu. L’absence de registre public ne permet pas de conclure qu’aucun événement n’a eu lieu."}</p>
        <h3>{text.coverage}</h3>
        <ul className="coverage-list">
          {place.coverage.map((item) => (
            <li key={item.grade}>
              <span className="coverage-band">
                {COVERAGE_LABELS[item.grade][locale]}{colon(locale)} {formatPercent(item.share * 100, locale)}
              </span>
              <svg className="place-coverage-bar" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true">
                <title>{`${COVERAGE_LABELS[item.grade][locale]}${colon(locale)} ${formatPercent(item.share * 100, locale)}`}</title>
                <rect className="place-coverage-track" width="100" height="6" />
                <rect className="place-coverage-share" width={item.share * 100} height="6" />
              </svg>
            </li>
          ))}
        </ul>
      </CoverageStatement>

      <EvidenceLegend locale={locale} />
      <p>{place.aliases[locale]}</p>
      <dl className="stat-row">
        <div className="stat">
          <dt>{text.boundary}</dt>
          <dd>
            {place.boundaryEdition} ({place.boundaryVersion})
          </dd>
        </div>
        <div className="stat">
          <dt>{text.denominator}</dt>
          <dd>{formatHectares(place.forestHectares, locale)}</dd>
        </div>
      </dl>

      <div className="place-evidence-layout">
        <section className="record-block place-headline">
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

        <aside className="place-provenance">
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

          <section className="record-citation">
            <h2>{text.citation}</h2>
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
      </div>

      <AnnualChangeChart annual={place.annual} locale={locale} view={view} />

      {place.safeguard ? (
        <aside className="notice card--sand record-safeguard">
          <p>{place.safeguard[locale]}</p>
        </aside>
      ) : null}

    </main>
  );
}
