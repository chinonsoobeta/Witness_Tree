import { CoverageStatement } from "@/components/policy/CoverageStatement";
import { EvidenceLegend } from "@/components/policy/EvidenceLegend";
import { formatHectares, formatPercent, type Locale } from "@/lib/domain";
import { federalRidingComparison } from "@/lib/comparison";
import { FederalDistrictFinder } from "./FederalDistrictFinder";
import { AddressFinderClient } from "./AddressFinderClient";
import { formatUnknownSharePercent } from "@/lib/explore/map-style";
import { formatSearchShare, searchAttribution, searchPlaceTypeLabel, searchSite, ridingSearchRow, type SearchRidingReference, type SiteSearchResult } from "@/lib/search/site-search";
import { NoRecordResult } from "./NoRecordResult";

export type SearchScope = "places" | "districts";

const copy = {
  en: {
    title: "Search",
    scope: "Search scope",
    places: "Places",
    districts: "Federal districts",
    notice: "Search provinces, ridings and communities. Figures cover 1984 to 2022.",
    shareNote: "Each share is for the part of the community inside that riding.",
    excluded: "Reserves, settlements and treaty or agreement lands aren’t listed yet. They will be once their official boundaries are approved and communities have a way to reply.",
  },
  fr: {
    title: "Recherche",
    scope: "Portée de la recherche",
    places: "Lieux",
    districts: "Circonscriptions fédérales",
    notice: "Recherchez une province, une circonscription ou une collectivité. Les chiffres couvrent 1984 à 2022.",
    shareNote: "Chaque part porte sur la partie de la collectivité située dans cette circonscription.",
    excluded: "Les réserves, les établissements et les terres visées par un traité ou une entente ne sont pas encore répertoriés. Ils le seront lorsque leurs limites officielles auront été approuvées et que les communautés auront un moyen de répondre.",
  },
} as const;

export function SearchPage({
  locale,
  query,
  scope = "places",
  addressLookup = false,
}: Readonly<{
  locale: Locale;
  query: string;
  scope?: SearchScope;
  /**
   * Whether the address field can actually work. Decided by the route from the
   * worker's stamped headers, never by this component and never by the caller,
   * so a field that cannot answer is not offered.
   */
  addressLookup?: boolean;
}>) {
  const text = copy[locale];
  return (
    <section className="page-wrap search-page">
      <header className="masthead">
        <h1>{text.title}</h1>
      </header>

      <CoverageStatement locale={locale}>
        <p>{text.notice}</p>
        <p>{locale === "en"
          ? "Finding a place doesn’t mean we have figures for it. And a missing record doesn’t mean nothing happened."
          : "Trouver un lieu ne veut pas dire que nous avons des chiffres pour celui-ci. Et l’absence de registre ne veut pas dire que rien ne s’est produit."}</p>
      </CoverageStatement>
      <EvidenceLegend locale={locale} />
      <nav className="segment" aria-label={text.scope}>
        <a
          className="segment-option"
          href="?scope=places"
          aria-current={scope === "places" ? "page" : undefined}
        >
          {text.places}
        </a>
        <a
          className="segment-option"
          href="?scope=districts"
          aria-current={scope === "districts" ? "page" : undefined}
        >
          {text.districts}
        </a>
      </nav>

      {scope === "places" ? (
        <section>
          <h2>{text.places}</h2>
          <form className="search-form" method="get"><label className="field-label sr-only" htmlFor="search-q">{text.places}</label><input className="input" id="search-q" name="q" defaultValue={query} /><button className="btn btn--primary" type="submit">{locale === "en" ? "Find" : "Trouver"}</button></form>
          {!query ? <p className="search-note">{locale === "en" ? "Enter a province, riding, or community." : "Entrez une province, une circonscription ou une collectivité."}</p> : <SearchResults locale={locale} query={query} />}
          <p className="search-note">{text.excluded}</p>
        </section>
      ) : (
        <>
          {addressLookup ? <AddressFinderClient
            locale={locale}
            measuredDistrictIds={federalRidingComparison.places
              .filter((place) => place.detectedChangeHectares !== null)
              .map((place) => place.id)}
          /> : null}
          <FederalDistrictFinder
            locale={locale}
            query={query}
            rows={federalRidingComparison.places}
          />
        </>
      )}
    </section>
  );
}

function SearchResults({ locale, query }: { locale: Locale; query: string }) {
  const text = copy[locale];
  const page = searchSite(query);
  if (!page.results.length) return <NoRecordResult locale={locale} reason={locale === "en" ? "No released place, riding, or community record matches this query." : "Aucun registre publié de province, de circonscription ou de collectivité ne correspond à cette recherche."} remedies />;
  const groups = (["province", "riding", "community"] as const).map((kind) => [kind, page.results.filter((result) => result.kind === kind)] as const);
  const groupTitle = {
    en: { province: "Provinces", riding: "Ridings", community: "Communities" },
    fr: { province: "Provinces", riding: "Circonscriptions", community: "Collectivités" },
  }[locale];
  return <>
    {groups.map(([kind, results]) => results.length ? (
      <section key={kind} aria-label={groupTitle[kind]}>
        <h3>{groupTitle[kind]}</h3>
        <ul className="search-results">{results.map((result) => <SearchResultCard key={`${result.kind}-${result.id}`} locale={locale} result={result} />)}</ul>
        {page.more[kind] > 0 ? <p className="search-note">{locale === "en" ? `${page.more[kind]} more ${kind} results.` : `${page.more[kind]} autres résultats de ${kind === "riding" ? "circonscription" : kind === "community" ? "collectivité" : "province"}.`}</p> : null}
      </section>
    ) : null)}
    {page.results.some((result) => result.kind === "community") ? <>
      <p className="search-note">{text.shareNote}</p>
      <p className="search-note">{searchAttribution(locale)}</p>
    </> : null}
  </>;
}

function resultName(result: SiteSearchResult, locale: Locale) {
  return locale === "fr" && result.nameFr ? result.nameFr : result.name;
}

function ridingFigure(row: ReturnType<typeof ridingSearchRow>, locale: Locale) {
  if (!row) return null;
  const text = locale === "en"
    ? { unknown: "Unknown", atLeast: "At least", loss: "detected loss", unknownShare: "unknown share" }
    : { unknown: "Inconnu", atLeast: "Au moins", loss: "perte détectée", unknownShare: "part inconnue" };
  if (row.coverage === "complete" && row.observedLossHectares !== null && row.observedLossPercent !== null) {
    return `${formatHectares(row.observedLossHectares, locale)} · ${formatPercent(row.observedLossPercent, locale)} ${text.loss}`;
  }
  const unknown = row.unknownSharePercent === null ? text.unknown : formatUnknownSharePercent(row.unknownSharePercent, locale);
  if (row.coverage === "partial-with-unknown" && row.knownObservedSubtotalHectares !== null && row.knownObservedSubtotalHectares !== undefined && row.knownObservedSubtotalHectares > 0) {
    return `${text.atLeast} ${formatHectares(row.knownObservedSubtotalHectares, locale)} ${text.loss}; ${unknown} ${text.unknownShare}`;
  }
  return `${text.unknown}; ${unknown} ${text.unknownShare}`;
}

function ridingReferenceMarkup(reference: SearchRidingReference, locale: Locale, federal: boolean) {
  const row = ridingSearchRow(reference.id);
  const name = locale === "fr" ? reference.nameFr : reference.name;
  const label = federal ? (
    <a href={`${locale === "en" ? "/en/compare" : "/fr/comparer"}?left=${encodeURIComponent(`federal-${reference.id.slice(3)}`)}`}>{name}</a>
  ) : name;
  return <li key={reference.id}>{label}: {formatSearchShare(reference.share, locale)}{row ? <>; {ridingFigure(row, locale)}</> : null}</li>;
}

function SearchResultCard({ locale, result }: { locale: Locale; result: SiteSearchResult }) {
  if (result.kind === "province") {
    const unknown = locale === "en" ? "Unknown" : "Inconnu";
    return <li className="card card--lift search-result">
      <h4>{resultName(result, locale)}</h4>
      <p>{result.unionLossHectares === null || result.unionLossHectares === undefined ? unknown : formatHectares(result.unionLossHectares, locale)} · {result.unionLossPercent === null || result.unionLossPercent === undefined ? unknown : formatPercent(result.unionLossPercent, locale)}</p>
      <p>{result.unknownHectares === null || result.unknownHectares === undefined ? unknown : formatHectares(result.unknownHectares, locale)} {locale === "en" ? "Unknown area" : "zone inconnue"}; {result.unknownSharePercent === null || result.unknownSharePercent === undefined ? unknown : formatUnknownSharePercent(result.unknownSharePercent, locale)}</p>
      {result.unmappedCharacter ? <p>{locale === "en" ? "Here that gap is" : "Ici, il s’agit d’un"} {result.unmappedCharacter[locale]}.</p> : null}
    </li>;
  }
  if (result.kind === "riding") {
    return <li className="card card--lift search-result">
      <h4>{resultName(result, locale)}</h4>
      <p>{result.province} · {locale === "en" ? "Riding" : "Circonscription"}</p>
      <p>{ridingFigure(ridingSearchRow(result.id), locale)}</p>
    </li>;
  }
  return <li className="card card--lift search-result">
    <h4>{resultName(result, locale)}</h4>
    <p>{result.province} · {searchPlaceTypeLabel(result.type!, locale)}</p>
    <p>{locale === "en" ? "Federal ridings" : "Circonscriptions fédérales"}</p>
    <ul>{result.federal?.length ? result.federal.map((reference) => ridingReferenceMarkup(reference, locale, true)) : <li>{locale === "en" ? "No federal riding is recorded for this community." : "Aucune circonscription fédérale n’est enregistrée pour cette collectivité."}</li>}</ul>
    <p>{locale === "en" ? "Provincial ridings" : "Circonscriptions provinciales"}</p>
    <ul>{result.provincial?.length ? result.provincial.map((reference) => ridingReferenceMarkup(reference, locale, false)) : <li>{locale === "en" ? "No provincial riding is recorded for this community." : "Aucune circonscription provinciale n’est enregistrée pour cette collectivité."}</li>}</ul>
  </li>;
}
