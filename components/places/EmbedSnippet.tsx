import type { Locale } from "@/lib/domain";
import { embedPath, embedSnippet } from "@/lib/embed/paths";
import type { PlaceGeography } from "@/lib/place-pages/paths";

/**
 * "Embed this figure" on a place page: the iframe another site pastes, and the
 * terms it comes with. Server-rendered, with no client code; the code sits in a
 * read-only text box a reader can select.
 */

const COPY = {
  en: {
    heading: "Embed this figure",
    lead: "Paste this code into a web page to show this place’s figure with its coverage, evidence class, data version, attribution and licence.",
    label: "Embed code (HTML)",
    terms: "Don’t crop or cover the frame to hide its attribution, its licence line or an Unknown statement. The embed carries the licence line of its sources, and it must stay visible.",
    termsLink: "Embedding terms (draft)",
    preview: "Preview the embed",
  },
  // Draft French for the owner's review (2026-10-29).
  fr: {
    heading: "Intégrer ce chiffre",
    lead: "Collez ce code dans une page Web pour y afficher le chiffre de ce lieu avec sa couverture, sa catégorie de preuve, la version des données, l’attribution et la licence.",
    label: "Code d’intégration (HTML)",
    terms: "Ne recadrez pas et ne masquez pas le cadre pour cacher l’attribution, la ligne de licence ou une mention Inconnu. L’intégration porte la ligne de licence de ses sources, qui doit rester visible.",
    termsLink: "Conditions d’intégration (ébauche)",
    preview: "Aperçu de l’intégration",
  },
} as const;

export function EmbedSnippet({ locale, place }: Readonly<{ locale: Locale; place: Readonly<{ geography: PlaceGeography; code: string; name: string }> }>) {
  const text = COPY[locale];
  return (
    <section className="place-embed" aria-labelledby="place-embed-heading">
      <h2 className="eyebrow" id="place-embed-heading">{text.heading}</h2>
      <p>{text.lead}</p>
      <label htmlFor="place-embed-code">{text.label}</label>
      <textarea id="place-embed-code" className="place-embed-code" readOnly rows={4} spellCheck={false} value={embedSnippet(locale, place)} />
      <p className="place-embed-terms">{text.terms}</p>
      <p className="place-embed-links">
        <a href={`${locale === "en" ? "/en/terms" : "/fr/conditions"}#embedding`}>{text.termsLink}</a>
        <a href={embedPath(locale, place.geography, place.code)}>{text.preview}</a>
      </p>
    </section>
  );
}
