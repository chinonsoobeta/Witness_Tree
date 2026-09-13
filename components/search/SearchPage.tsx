import { CoverageStatement } from "@/components/policy/CoverageStatement";
import { EvidenceLegend } from "@/components/policy/EvidenceLegend";
import type { Locale } from "@/lib/domain";
import { federalRidingComparison } from "@/lib/comparison";
import { FederalDistrictFinder } from "./FederalDistrictFinder";
import { AddressFinderClient } from "./AddressFinderClient";
import { PlaceFinder } from "./PlaceFinder";

export type SearchScope = "places" | "districts";

const copy = {
  en: {
    title: "Search",
    scope: "Search scope",
    places: "Places",
    districts: "Federal districts",
    notice:
      "Place results are illustrative fixtures. District results are measured from the source grid.",
  },
  fr: {
    title: "Recherche",
    scope: "Portée de la recherche",
    places: "Lieux",
    districts: "Circonscriptions fédérales",
    notice:
      "Les résultats de lieux sont des exemples illustratifs. Les résultats de circonscriptions sont mesurés à partir de la grille source.",
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
        <PlaceFinder locale={locale} query={query} />
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
