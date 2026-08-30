import type { Locale } from "@/lib/domain";
import { federalRidingComparison } from "@/lib/comparison";
import { FederalDistrictFinder } from "./FederalDistrictFinder";
import { PlaceFinder } from "./PlaceFinder";

export function SearchPage({
  locale,
  query,
  districtQuery = "",
}: Readonly<{ locale: Locale; query: string; districtQuery?: string }>) {
  const title = locale === "en" ? "Search places" : "Rechercher des lieux";
  return (
    <section className="page-wrap search-page">
      <header className="masthead">
        <h1>{title}</h1>
      </header>

      <PlaceFinder locale={locale} query={query} />
      <FederalDistrictFinder locale={locale} query={districtQuery} rows={federalRidingComparison.places} />
    </section>
  );
}
