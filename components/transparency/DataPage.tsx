import type { Locale } from "@/lib/domain";
import { provinceBulkManifestUrl, provinceBulkRelease } from "@/lib/downloads/releases";

const COPY = {
  en: {
    title: "Data and transparency",
    notice: "The source-ledger examples remain illustrative. A separate, bounded four-province 2020-2022 technical-preview release is available below.",
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
    bulkTitle: "Province bulk download",
    bulkSummary: "This deterministic release contains the same four province-level technical-preview values in CSV and GeoPackage formats. It is not per-cell geometry and does not complete the formal Phase 2 gate.",
    csv: "Download CSV",
    geopackage: "Download GeoPackage",
    manifest: "Open machine-readable manifest",
    release: "Release identifier",
    checksum: "SHA-256",
    licence: "Licence and attribution",
    attribution: "Contains information licensed under the Open Government Licence - Canada. Adapted from Natural Resources Canada, Annual High-resolution forest land cover for Canada (1984-2022). Adapted from Statistics Canada, 2021 Census Province/Territory Cartographic Boundary File, reference date January 1, 2021. These adaptations do not constitute endorsement by Natural Resources Canada or Statistics Canada.",
  },
  fr: {
    title: "Données et transparence",
    notice: "Les exemples du registre des sources demeurent illustratifs. Une version d’aperçu technique distincte et limitée à quatre provinces pour 2020 à 2022 est offerte ci-dessous.",
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
    bulkTitle: "Téléchargement en bloc par province",
    bulkSummary: "Cette version déterministe contient les mêmes valeurs d’aperçu technique au niveau provincial pour quatre provinces, en formats CSV et GeoPackage. Elle ne fournit pas une géométrie par cellule et ne satisfait pas au critère formel de la phase 2.",
    csv: "Télécharger le CSV",
    geopackage: "Télécharger le GeoPackage",
    manifest: "Ouvrir le manifeste lisible par machine",
    release: "Identifiant de version",
    checksum: "SHA-256",
    licence: "Licence et attribution",
    attribution: "Contient des informations octroyées sous licence en vertu de la Licence du gouvernement ouvert - Canada. Adapté de Ressources naturelles Canada, Couverture terrestre annuelle à haute résolution des forêts du Canada (1984-2022). Adapté de Statistique Canada, Fichier des limites cartographiques des provinces et territoires du Recensement de 2021, date de référence le 1er janvier 2021. Ces adaptations ne constituent pas une approbation de Ressources naturelles Canada ni de Statistique Canada.",
  },
} as const;

export function DataPage({ locale }: Readonly<{ locale: Locale }>) {
  const copy = COPY[locale];
  const [csv, geopackage] = provinceBulkRelease.artifacts;
  return <main id="main" className="page-wrap"><header className="masthead"><h1>{copy.title}</h1></header><section className="content-section prose-measure">
    <p><strong>{copy.notice}</strong></p>
    <p>{copy.description}</p>
    <nav aria-label={copy.title}><ul>
      <li><a href="https://github.com/chinonsoobeta/Witness_Tree/blob/main/data/source-ledger.json">{copy.ledger}</a></li>
      <li><a href="https://github.com/chinonsoobeta/Witness_Tree/blob/main/docs/SOURCE_LEDGER.md">{copy.docs}</a></li>
      <li><a href={locale === "en" ? "/en/data/official-harvest-comparison" : "/fr/donnees/comparaison-recolte-officielle"}>{copy.comparison}</a></li>
    </ul></nav>
  </section><section className="content-section prose-measure"><h2>{copy.bulkTitle}</h2><p>{copy.bulkSummary}</p><p><strong>{copy.release}:</strong> <code>{provinceBulkRelease.id}</code></p><ul>
    <li><a href={csv.url}>{copy.csv}</a><br /><small>{copy.checksum}: <code>{csv.sha256}</code></small></li>
    <li><a href={geopackage.url}>{copy.geopackage}</a><br /><small>{copy.checksum}: <code>{geopackage.sha256}</code></small></li>
    <li><a href={provinceBulkManifestUrl}>{copy.manifest}</a></li>
  </ul><h3>{copy.licence}</h3><p>{copy.attribution}</p></section><section className="content-section prose-measure"><h2>{copy.stagingTitle}</h2><p>{copy.staging}</p><nav aria-label={copy.stagingTitle}><ul>
    <li><a href="https://github.com/chinonsoobeta/Witness_Tree/blob/main/data/staged-acquisitions.json">{copy.stagingEvidence}</a></li>
    <li><a href="https://github.com/chinonsoobeta/Witness_Tree/blob/main/data/staged-geospatial-profile.json">{copy.profileEvidence}</a></li>
    <li><a href="https://github.com/chinonsoobeta/Witness_Tree/blob/main/data/transformation-runs/qc-historic-wildfire-v1-2026-08-12.json">{copy.transformationEvidence}</a></li>
  </ul></nav></section><aside><h2>{copy.limitsTitle}</h2><p>{copy.limits}</p></aside></main>;
}
