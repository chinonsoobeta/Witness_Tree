import type { Locale } from "@/lib/domain";
import { PUBLIC_INFORMATION_REGISTRY, publicContent, type PublicContentKind } from "@/lib/content";

export function PublicContentPage({ kind, locale }: Readonly<{ kind: PublicContentKind; locale: Locale }>) {
  const page = publicContent(kind);
  return <main id="main" className="page-wrap"><header className="masthead"><p>{locale === "en" ? "Illustrative content · unapproved · nonproduction" : "Contenu illustratif · non approuvé · hors production"}</p><h1>{page.title[locale]}</h1><p className="dek">{page.status[locale]}</p></header><div className="content-section prose-measure">
    {page.sections.map((section) => <section key={section.id}><h2>{section.heading[locale]}</h2>{section.paragraphs.map((paragraph) => <p key={paragraph.en}>{paragraph[locale]}</p>)}{section.links?.length ? <ul>{section.links.map((link) => <li key={link.href}><a href={link.href}>{link.label[locale]}</a></li>)}</ul> : null}</section>)}
    {page.sourceLedger ? <section aria-label={locale === "en" ? "Registered illustrative sources" : "Sources illustratives enregistrées"}><h2>{locale === "en" ? "Registered illustrative sources" : "Sources illustratives enregistrées"}</h2><ul>{PUBLIC_INFORMATION_REGISTRY.sources.map((source) => <li id={`source-${source.id}`} key={source.id}><strong>{source.title[locale]}</strong><dl><div><dt>{locale === "en" ? "Source ID" : "Identifiant de source"}</dt><dd>{source.id}</dd></div><div><dt>{locale === "en" ? "Dataset" : "Jeu de données"}</dt><dd>{source.provenance.dataset}</dd></div><div><dt>Version</dt><dd>{source.provenance.version}</dd></div><div><dt>{locale === "en" ? "Retrieved" : "Récupéré"}</dt><dd>{source.provenance.retrievedDate}</dd></div><div><dt>Licence</dt><dd>{source.provenance.licence}</dd></div></dl></li>)}</ul></section> : null}
  </div></main>;
}
