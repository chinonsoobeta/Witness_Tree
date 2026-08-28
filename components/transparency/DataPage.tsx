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
    stagingTitle: "Verified local staging",
    staging: "Two source archives have verified byte lengths, ZIP integrity and SHA-256 checksums in a separate local staging area. Québec attribution is verified from official metadata. A lossless local copy of the two clean Québec layers is checksum-bound and validated; it is not ingested, immutable, or production data. Profiling found 608 self-intersections in Alberta, so Alberta remains blocked.",
    stagingEvidence: "Review the staged-acquisition evidence",
    profileEvidence: "Review the geospatial profile",
    transformationEvidence: "Review the Québec transformation evidence",
    comparison: "Open the official-source harvest comparison",
  },
  fr: {
    title: "Données et transparence",
    notice: "Les entrées actuelles du registre des sources sont des exemples illustratifs, et non des registres de sources de production.",
    ledger: "Ouvrir le registre illustratif des sources",
    docs: "Lire la documentation du registre des sources",
    description: "Le registre consigne le nom du jeu de données, l’éditeur, la licence, la version, la date de récupération, les limites de couverture et la provenance exigée avant la publication d’une affirmation publique. L’ingestion de production doit remplacer les entrées illustratives par des métadonnées de source vérifiées et des sommes de contrôle d’archives immuables.",
    limitsTitle: "Comment lire ce contenu",
    limits: "Le registre des sources décrit ce que détient ce produit. Il n’établit ni cause, ni responsabilité, ni conclusion de conformité, ni conclusion allant au-delà de la catégorie de preuves et de la raison de confiance affichées avec une affirmation.",
    stagingTitle: "Mise en attente locale vérifiée",
    staging: "Deux archives sources ont une taille en octets, une intégrité ZIP et une somme de contrôle SHA-256 vérifiées dans une zone locale distincte. L’attribution du Québec est vérifiée à partir des métadonnées officielles. Une copie locale sans perte des deux couches québécoises propres est liée par somme de contrôle et validée; elle n’est ni ingérée, ni immuable, ni une donnée de production. Le profilage a relevé 608 auto-intersections en Alberta; l’Alberta demeure donc bloquée.",
    stagingEvidence: "Consulter les preuves de mise en attente",
    profileEvidence: "Consulter le profil géospatial",
    transformationEvidence: "Consulter les preuves de transformation du Québec",
    comparison: "Ouvrir la comparaison avec une source officielle sur la récolte",
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
      <li><a href={locale === "en" ? "/en/data/official-harvest-comparison" : "/fr/donnees/comparaison-recolte-officielle"}>{copy.comparison}</a></li>
    </ul></nav>
  </section><section className="content-section prose-measure"><h2>{copy.stagingTitle}</h2><p>{copy.staging}</p><nav aria-label={copy.stagingTitle}><ul>
    <li><a href="https://github.com/chinonsoobeta/Witness_Tree/blob/main/data/staged-acquisitions.json">{copy.stagingEvidence}</a></li>
    <li><a href="https://github.com/chinonsoobeta/Witness_Tree/blob/main/data/staged-geospatial-profile.json">{copy.profileEvidence}</a></li>
    <li><a href="https://github.com/chinonsoobeta/Witness_Tree/blob/main/data/transformation-runs/qc-historic-wildfire-v1-2026-08-12.json">{copy.transformationEvidence}</a></li>
  </ul></nav></section><aside><h2>{copy.limitsTitle}</h2><p>{copy.limits}</p></aside></main>;
}
