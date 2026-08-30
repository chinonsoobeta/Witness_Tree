import type { Locale } from "@/lib/domain";
import { searchPlaces } from "@/lib/search";

const copy = {
  en: {
    title: "Search places",
    submit: "Find",
    guide: "Enter a place name or alias.",
    none: "No illustrative place record matches this query.",
  },
  fr: {
    title: "Rechercher des lieux",
    submit: "Trouver",
    guide: "Entrez un nom de lieu ou un alias.",
    none: "Aucun dossier de lieu illustratif ne correspond à cette recherche.",
  },
} as const;

export function PlaceFinder({
  locale,
  query,
}: Readonly<{
  locale: Locale;
  query: string;
}>) {
  const results = searchPlaces(query);
  const text = copy[locale];

  return (
    <section>
      <h2>{text.title}</h2>
      <form className="search-form" method="get">
        <div className="field">
          <label className="field-label sr-only" id="search-label" htmlFor="search-q">
            {text.title}
          </label>
          <input
            className="input"
            id="search-q"
            name="q"
            defaultValue={query}
            aria-labelledby="search-label"
          />
        </div>
        <button className="btn btn--primary" type="submit">
          {text.submit}
        </button>
      </form>
      {!query ? (
        <p className="search-note">{text.guide}</p>
      ) : results.length ? (
        <ul className="search-results">
          {results.map((place) => (
            <li className="card card--lift search-result" key={place.id}>
              <a
                href={
                  locale === "en"
                    ? `/en/places/${place.id}`
                    : `/fr/lieux/${place.id}`
                }
              >
                {place.name[locale]}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="search-note">{text.none}</p>
      )}
    </section>
  );
}
