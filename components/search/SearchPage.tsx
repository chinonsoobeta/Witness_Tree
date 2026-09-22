import { CoverageStatement } from "@/components/policy/CoverageStatement";
import { EvidenceLegend } from "@/components/policy/EvidenceLegend";
import type { Locale } from "@/lib/domain";
import { federalRidingComparison } from "@/lib/comparison";
import { FederalDistrictFinder } from "./FederalDistrictFinder";
import { searchAttribution, searchPlaceTypeLabel, searchSite, provinceSearchRows, indexedPlaceForSearch } from "@/lib/search/site-search";
import { NoRecordResult } from "./NoRecordResult";

export type SearchScope = "places" | "districts";

const copy = {
  en: {
    title: "Search",
    scope: "Search scope",
    places: "Places",
    districts: "Federal districts",
    notice: "Search covers provinces, federal and provincial ridings, and communities, with figures for 1984 to 2022.",
    shareNote: "Each share is of the part of the community covered by that riding map, federal or provincial.",
    excluded: "Reserves, settlements, and treaty or agreement lands are not listed yet. They will be once their official boundaries are admitted and a right-of-reply route is live.",
  },
  fr: {
    title: "Recherche",
    scope: "Portée de la recherche",
    places: "Lieux",
    districts: "Circonscriptions fédérales",
    notice: "La recherche couvre les provinces, les circonscriptions fédérales et provinciales ainsi que les collectivités, avec des chiffres de 1984 à 2022.",
    shareNote: "Chaque part porte sur la partie de la collectivité couverte par la carte des circonscriptions concernée, fédérale ou provinciale.",
    excluded: "Les réserves, les établissements et les terres visées par un traité ou une entente ne sont pas encore répertoriés. Ils le seront lorsque leurs limites officielles auront été admises et qu’une voie de droit de réponse sera en place.",
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
          ? "Finding a boundary does not establish that it has a measurement. A missing record does not establish that no event occurred."
          : "Trouver une limite ne signifie pas qu’une mesure y est associée. L’absence de registre ne permet pas de conclure qu’aucun événement n’a eu lieu."}</p>
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
  const results = searchSite(query);
  if (!results.length) return <NoRecordResult locale={locale} reason={locale === "en" ? "No released place, riding, or community record matches this query." : "Aucun registre publié de province, de circonscription ou de collectivité ne correspond à cette recherche."} remedies />;
  const provinces = provinceSearchRows();
  return <>
    <ul className="search-results">{results.map((result) => {
      const place = result.kind === "community" ? indexedPlaceForSearch(result.id) : undefined;
      const row = provinces.find((item) => item.id === result.id);
      return <li className="card card--lift search-result" key={`${result.kind}-${result.id}`}>
        <h3>{result.kind === "community" ? result.nameFr && locale === "fr" ? result.nameFr : result.name : locale === "fr" && result.nameFr ? result.nameFr : result.name}</h3>
        <p>{result.kind === "community" && place ? `${result.province} · ${searchPlaceTypeLabel(place.type, locale)}` : result.kind}</p>
        {row ? <p>{row.unionLossHectares?.toFixed(2)} ha · {row.unionLossPercent?.toFixed(0)}% · {row.unknownHectares?.toFixed(2)} ha Unknown</p> : null}
        {place ? <p>{text.shareNote}</p> : null}
      </li>;
    })}</ul>
    <p className="search-note">{searchAttribution(locale)}</p>
  </>;
}
