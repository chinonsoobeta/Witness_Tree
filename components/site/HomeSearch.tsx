import type { Locale } from "@/lib/domain";
import { SearchSuggest } from "@/components/search/SearchSuggest";

/**
 * The homepage asks "What happened to the forest here?" and, until now,
 * offered no way to ask it: Search was the fifth item in the global nav, a
 * destination rather than a control. This puts the field directly under the
 * question it answers.
 *
 * It is still a plain GET form that submits straight to the search route, so
 * it works without JavaScript. With it, the field suggests matching places as
 * the reader types. The label is visible rather than hidden, because a bare
 * field under a headline reads as decoration.
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
    <SearchSuggest
      className="home-search"
      locale={locale}
      action={text.action}
      label={text.label}
      placeholder={text.placeholder}
      submitLabel={text.submit}
      note={<p className="home-search-note">{text.note}</p>}
    />
  );
}
