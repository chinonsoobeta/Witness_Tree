import type { Locale } from "@/lib/domain";
import { searchPlaces } from "@/lib/search";

type FinderContext = "search" | "explore";

const copy = {
  en: {
    search: {
      title: "Search places",
      guide: "Enter a place name or alias.",
      none: "No illustrative place record matches this query.",
      fixture: "Illustrative fixtures only",
      input: "Place name or alias",
    },
    explore: {
      title: "Find a district or place",
      guide: "Enter a district or place name, or an alias.",
      none: "No illustrative district or place record matches this query.",
      fixture:
        "Illustrative directory only. These results are not admitted measurements.",
      input: "District or place name or alias",
    },
  },
  fr: {
    search: {
      title: "Rechercher des lieux",
      guide: "Entrez un nom de lieu ou un alias.",
      none: "Aucun dossier de lieu illustratif ne correspond à cette recherche.",
      fixture: "Exemples illustratifs seulement",
      input: "Nom de lieu ou alias",
    },
    explore: {
      title: "Trouver une circonscription ou un lieu",
      guide: "Entrez le nom ou l’alias d’une circonscription ou d’un lieu.",
      none: "Aucun dossier illustratif de circonscription ou de lieu ne correspond à cette recherche.",
      fixture:
        "Répertoire illustratif seulement. Ces résultats ne sont pas des mesures admises.",
      input: "Nom ou alias d’une circonscription ou d’un lieu",
    },
  },
} as const;

export function PlaceFinder({
  locale,
  query,
  context = "search",
  parameters = [],
}: Readonly<{
  locale: Locale;
  query: string;
  context?: FinderContext;
  parameters?: readonly Readonly<{ name: string; value: string }>[];
}>) {
  const results = searchPlaces(query);
  const text = copy[locale][context];

  return (
    <section className={context === "explore" ? "explore-finder" : undefined}>
      {context === "explore" ? <h2>{text.title}</h2> : null}
      <p className="masthead-note">{text.fixture}</p>
      <form className="search-form" method="get">
        {parameters.map((parameter) => (
          <input
            key={parameter.name}
            type="hidden"
            name={parameter.name}
            value={parameter.value}
          />
        ))}
        <div className="field">
          <label className="field-label" htmlFor={`${context}-q`}>
            {text.title}
          </label>
          <input
            className="input"
            id={`${context}-q`}
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
