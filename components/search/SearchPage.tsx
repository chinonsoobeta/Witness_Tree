import type { Locale } from "@/lib/domain";
import { searchPlaces } from "@/lib/search";

export function SearchPage({
  locale,
  query,
}: Readonly<{ locale: Locale; query: string }>) {
  const results = searchPlaces(query);
  const text =
    locale === "en"
      ? {
          title: "Search places",
          guide: "Enter a place name or alias.",
          none: "– No illustrative place record matches this query.",
          fixture: "Illustrative fixtures only",
          input: "Place name or alias",
        }
      : {
          title: "Rechercher des lieux",
          guide: "Entrez un nom de lieu ou un alias.",
          none: "– Aucun dossier de lieu illustratif ne correspond à cette recherche.",
          fixture: "Exemples illustratifs seulement",
          input: "Nom de lieu ou alias",
        };

  return (
    <section className="page-wrap search-page">
      <header className="masthead">
        <h1>{text.title}</h1>
        <p className="masthead-note">{text.fixture}</p>
      </header>

      <form className="search-form" method="get">
        <div className="field">
          <label className="field-label" htmlFor="q">
            {text.title}
          </label>
          <input
            className="input"
            id="q"
            name="q"
            defaultValue={query}
            aria-label={text.input}
          />
        </div>
        <button className="btn btn--primary" type="submit">
          {text.title}
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
