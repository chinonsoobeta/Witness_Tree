import type { Locale } from "@/lib/domain";
import { SOURCE_RECORDS, type RegistryEntry } from "@/lib/places";
import { AnnualChangeChart } from "./AnnualChangeChart";
import { PublicNumberValue } from "./PublicNumberValue";

export function PlacePage({ locale, entry, view }: Readonly<{ locale: Locale; entry: RegistryEntry; view: "chart" | "table" }>) {
  const { place, source, citation, download } = entry;
  const text = locale === "en" ? { coverage: "Coverage", sources: "Illustrative source-ledger entries", citation: "Synthetic citation", citedSources: "Registered citation sources", stats: "Reported values", boundary: "Boundary edition", denominator: "Forested hectares", checksum: "SHA-256", status: "Illustrative fixture · unapproved · nonproduction" } : { coverage: "Couverture", sources: "Entrées illustratives du registre des sources", citation: "Citation synthétique", citedSources: "Sources de citation enregistrées", stats: "Valeurs déclarées", boundary: "Édition de limite", denominator: "Hectares forestiers", checksum: "SHA-256", status: "Exemple illustratif · non approuvé · hors production" };
  const citedSources = citation.sourceIds.map((id) => SOURCE_RECORDS.find((candidate) => candidate.id === id)).filter((record) => record !== undefined);
  return <main id="main" tabIndex={-1} className="page-wrap generated-record"><header><p>{text.status}</p><h1>{place.name[locale]}</h1><p>{place.aliases[locale]}</p></header>
    <dl><div><dt>{text.boundary}</dt><dd>{place.boundaryEdition} ({place.boundaryVersion})</dd></div><div><dt>{text.denominator}</dt><dd><PublicNumberValue value={place.forestHectares} locale={locale} /></dd></div></dl>
    <section><h2>{text.coverage}</h2><ul>{place.coverage.map((item, index) => <li key={`${item.grade}-${index}`}>{item.grade}<PublicNumberValue value={item.share} locale={locale} /></li>)}</ul></section>
    <section><h2>{text.stats}</h2>{place.stats.map((reported, index) => <PublicNumberValue key={index} value={reported} locale={locale} />)}</section>
    <AnnualChangeChart annual={place.annual} locale={locale} view={view} />
    {place.safeguard ? <aside><p>{place.safeguard[locale]}</p></aside> : null}
    <section><h2>{text.sources}</h2><p>{source.title[locale]}</p><p>{source.provenance.dataset}; {source.provenance.version}; {source.provenance.retrievedDate}.</p></section>
    <p><a href={download.href} download={`${place.id}.csv`}>{download.label[locale]}</a> · {download.bytes} bytes · {text.checksum}: <code>{download.sha256}</code></p>
    <footer><h2>{text.citation}</h2><p>{place.name[locale]}; {place.boundaryEdition}; {citation.dataVersion}; {citation.method}.</p><h3>{text.citedSources}</h3><ul>{citedSources.map((record) => <li key={record.id}><a href={`${locale === "en" ? "/en/data" : "/fr/donnees"}#source-${record.id}`}>{record.title[locale]} ({record.id})</a></li>)}</ul><div><PublicNumberValue value={citation.timeRange.from} locale={locale} /><PublicNumberValue value={citation.timeRange.to} locale={locale} /></div></footer>
  </main>;
}
