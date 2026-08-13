import type { Locale } from "@/lib/domain";
import type { Place } from "@/lib/places";
import { ReportedValue } from "@/components/policy";
import { AnnualChangeChart } from "./AnnualChangeChart";

export function PlacePage({ locale, place, view }: Readonly<{ locale: Locale; place: Place; view: "chart" | "table" }>) {
  const text = locale === "en" ? { coverage: "Coverage", sources: "Illustrative source-ledger entries", download: "Download illustrative data", citation: "Citation", stats: "Reported values", boundary: "Boundary edition", denominator: "Forested hectares", smallArea: "Small-area disclosure" } : { coverage: "Couverture", sources: "Entrées illustratives du registre des sources", download: "Télécharger les données illustratives", citation: "Citation", stats: "Valeurs déclarées", boundary: "Édition de limite", denominator: "Hectares forestiers", smallArea: "Divulgation pour petite superficie" };
  return <main id="main" className="page-wrap"><header><p>{place.status === "example" ? (locale === "en" ? "Illustrative fixture" : "Exemple illustratif") : null}</p><h1>{place.name[locale]}</h1><p>{place.aliases[locale]}</p></header>
    <dl><div><dt>{text.boundary}</dt><dd>{place.boundaryEdition} ({place.boundaryVersion})</dd></div><div><dt>{text.denominator}</dt><dd>{place.forestHectares}</dd></div></dl>
    <section><h2>{text.coverage}</h2><ul>{place.coverage.map((item) => <li key={item.grade}>{item.grade}: {item.share * 100}%</li>)}</ul></section>
    <section><h2>{text.stats}</h2>{place.stats.map((reported, index) => <ReportedValue key={index} reported={reported} coverageGrade={place.coverage[0].grade} locale={locale} />)}</section>
    <AnnualChangeChart annual={place.annual} locale={locale} view={view} />
    {place.safeguard ? <aside><p>{place.safeguard[locale]}</p></aside> : null}
    {place.smallArea ? <aside data-testid="small-area-raw-record"><h2>{text.smallArea}</h2><p>{place.smallArea.rawRecord[locale]}</p></aside> : null}
    <section><h2>{text.sources}</h2><ul>{place.sources.map((source) => <li key={source}><a href="https://github.com/chinonsoobeta/Witness_Tree/blob/main/data/source-ledger.json">{source}</a></li>)}</ul></section>
    <p><a href={`data:text/csv;charset=utf-8,placeId%2Cyear%0A${place.id}%2C2024`}>{text.download}</a></p>
    <footer><h2>{text.citation}</h2><p>{place.citation.timeRange}; {place.boundaryEdition}; {place.citation.dataVersion}; {text.denominator}: {place.forestHectares}; {place.citation.method}.</p></footer>
  </main>;
}
