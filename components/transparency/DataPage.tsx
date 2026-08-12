import type { Locale } from "@/lib/domain";

const COPY = {
  en: {
    title: "Data and transparency",
    notice: "The current source-ledger entries are illustrative examples, not production source records.",
    ledger: "Open the illustrative source ledger",
    docs: "Read the source-ledger documentation",
    description: "The ledger records the dataset name, publisher, licence, version, retrieval date, coverage limits and provenance required before a public claim is published. Production ingestion must replace illustrative entries with verified source metadata and immutable archive checksums.",
    limitsTitle: "How to read this material",
    limits: "The source ledger describes what this product holds. It does not establish a cause, responsibility, compliance conclusion or a conclusion beyond the evidence class and confidence reason shown with a claim.",
  },
  fr: {
    title: "Données et transparence",
    notice: "Les entrées actuelles du registre des sources sont des exemples illustratifs, et non des registres de sources de production.",
    ledger: "Ouvrir le registre illustratif des sources",
    docs: "Lire la documentation du registre des sources",
    description: "Le registre consigne le nom du jeu de données, l’éditeur, la licence, la version, la date de récupération, les limites de couverture et la provenance exigée avant la publication d’une affirmation publique. L’ingestion de production doit remplacer les entrées illustratives par des métadonnées de source vérifiées et des sommes de contrôle d’archives immuables.",
    limitsTitle: "Comment lire ce contenu",
    limits: "Le registre des sources décrit ce que détient ce produit. Il n’établit ni cause, ni responsabilité, ni conclusion de conformité, ni conclusion allant au-delà de la catégorie de preuves et de la raison de confiance affichées avec une affirmation.",
  },
} as const;

export function DataPage({ locale }: Readonly<{ locale: Locale }>) {
  const copy = COPY[locale];
  return <main id="main" className="page-wrap"><header className="masthead"><h1>{copy.title}</h1></header><section className="content-section prose-measure">
    <p><strong>{copy.notice}</strong></p>
    <p>{copy.description}</p>
    <nav aria-label={copy.title}><ul>
      <li><a href="https://github.com/chinonsoobeta/Witness_Tree/blob/main/data/source-ledger.json">{copy.ledger}</a></li>
      <li><a href="https://github.com/chinonsoobeta/Witness_Tree/blob/main/docs/SOURCE_LEDGER.md">{copy.docs}</a></li>
    </ul></nav>
  </section><aside><h2>{copy.limitsTitle}</h2><p>{copy.limits}</p></aside></main>;
}
