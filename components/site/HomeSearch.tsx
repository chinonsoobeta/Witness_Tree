import type { Locale } from "@/lib/domain";

/**
 * The homepage asks "What happened to the forest here?" and, until now,
 * offered no way to ask it: Search was the fifth item in the global nav, a
 * destination rather than a control. This puts the field directly under the
 * question it answers.
 *
 * It is a plain GET form with no JavaScript, so it works as a server
 * component and submits straight to the search route the nav used to point
 * at. The label is visible rather than hidden, because a bare field under a
 * headline reads as decoration.
 */

const COPY = {
  en: {
    action: "/en/search",
    label: "Search a place",
    placeholder: "Prince George, British Columbia",
    submit: "Open the record",
    note: "Search provinces, ridings and communities. Figures cover 1984 to 2022.",
  },
  fr: {
    action: "/fr/recherche",
    label: "Rechercher un lieu",
    placeholder: "Prince George, Colombie-Britannique",
    submit: "Ouvrir le relevé",
    note: "Recherchez une province, une circonscription ou une collectivité. Les chiffres couvrent 1984 à 2022.",
  },
} as const;

export function HomeSearch({ locale }: { locale: Locale }) {
  const text = COPY[locale];
  return (
    <form className="home-search" method="get" action={text.action} role="search">
      <div className="home-search-field">
        <label className="home-search-label" htmlFor="home-search-q">{text.label}</label>
        <input
          className="input"
          id="home-search-q"
          name="q"
          type="search"
          autoComplete="off"
          placeholder={text.placeholder}
        />
      </div>
      <button className="btn btn--primary" type="submit">{text.submit}</button>
      <p className="home-search-note">{text.note}</p>
    </form>
  );
}
