import type { Locale } from "@/lib/domain";
import { federalRidingComparison } from "@/lib/comparison";
import { FederalDistrictFinder } from "./FederalDistrictFinder";
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
}: Readonly<{ locale: Locale; query: string; scope?: SearchScope }>) {
  const text = copy[locale];
  return (
    <section className="page-wrap search-page">
      <header className="masthead">
        <h1>{text.title}</h1>
      </header>

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
      <p className="masthead-note">{text.notice}</p>

      {scope === "places" ? (
        <PlaceFinder locale={locale} query={query} />
      ) : (
        <FederalDistrictFinder
          locale={locale}
          query={query}
          rows={federalRidingComparison.places}
        />
      )}
    </section>
  );
}
