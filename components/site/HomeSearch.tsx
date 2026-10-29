import type { Locale } from "@/lib/domain";
import { SearchSuggest } from "@/components/search/SearchSuggest";
import { drawPagePath } from "@/lib/shapes/circle";

/**
 * The homepage asks "What happened to the forest here?" and, until now,
 * offered no way to ask it: Search was the fifth item in the global nav, a
 * destination rather than a control. This puts the field directly under the
 * question it answers.
 *
 * It is still a plain GET form that submits straight to the search route, so
 * it works without JavaScript. With it, the field suggests matching places as
 * the reader types, and an empty or blank field is not submitted: the reader
 * stays here with a hint under the field, rather than landing on a page that
 * only asks again. The label is visible rather than hidden, because a bare
 * field under a headline reads as decoration.
 */

const COPY = {
  en: {
    action: "/en/search",
    label: "Search a place",
    placeholder: "Prince George, British Columbia",
    submit: "Open the record",
    note: "Search provinces, ridings and communities. Figures cover 1984 to 2022.",
    nearby: "What happened within 10 km of me?",
    empty: "Enter a place first: a province, riding or community.",
  },
  fr: {
    action: "/fr/recherche",
    label: "Rechercher un lieu",
    placeholder: "Prince George, Colombie-Britannique",
    submit: "Ouvrir le registre",
    note: "Recherchez une province, une circonscription ou une collectivité. Les chiffres couvrent la période de 1984 à 2022.",
    nearby: "Qu’est-il arrivé dans un rayon de 10\u00a0km autour de moi\u202F?",
    empty: "Entrez d’abord un lieu\u202F: une province, une circonscription ou une collectivité.",
  },
} as const;

export function HomeSearch({ locale }: { locale: Locale }) {
  const text = COPY[locale];
  return (
    <SearchSuggest
      className="home-search"
      locale={locale}
      action={text.action}
      label={text.label}
      placeholder={text.placeholder}
      submitLabel={text.submit}
      emptyHint={text.empty}
      note={
        <>
          <p className="home-search-note">{text.note}</p>
          {/* Opens the Draw page on the circle with its place field focused. No address travels in this link. */}
          <p className="home-search-nearby">
            <a href={`${drawPagePath(locale)}?shape=circle`}>{text.nearby}</a>
          </p>
        </>
      }
    />
  );
}
