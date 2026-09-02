import { colon, type Locale } from "@/lib/domain";
import { SourceCurrency } from "./SourceCurrency";
import {
  provinceBulkManifestUrl,
  provinceBulkRelease,
} from "@/lib/downloads/releases";

const COPY = {
  en: {
    title: "Data and transparency",
    accessTitle: "What you can download",
    accessSummary:
      "A bounded four-province technical preview for 2020 to 2022 is available as a CSV table and a GeoPackage. Both files contain the same province-level values for British Columbia, Alberta, Ontario and Quebec.",
    notice:
      "These are province summaries for reading and analysis. They are not per-cell geometry or a live data service.",
    csv: "Download province values (CSV)",
    geopackage: "Download province values (GeoPackage)",
    comparison: "Compare the values with official harvest statistics",
    releases: "Read the release notes and citation format",
    limitsTitle: "Limits to understand first",
    limits:
      "All four provinces include some area where a required mapped input is unknown, so every detected-loss figure is a minimum for the known mapped area. The files do not establish cause, responsibility, legality, compliance, merchantable timber or conditions on the ground.",
    previewLimits:
      "This technical preview does not complete the formal Phase 2 production gate. Use the evidence class, coverage state and confidence reason shown with a public claim; do not extend a result beyond its stated boundary edition and period.",
    recordsTitle: "Source records and documentation",
    description:
      "The source ledger records dataset name, publisher, licence, version, retrieval date, coverage limits and provenance. Its examples remain illustrative and must be replaced by verified source metadata and immutable archive checksums before production ingestion.",
    ledger: "Open the illustrative source ledger",
    docs: "Read the source-ledger documentation",
    technicalTitle: "Technical release details",
    gate:
      "Release identifiers, checksums and gate language are provided here for verification. They do not change the reader-facing limits above.",
    release: "Release identifier",
    csvArtifact: "CSV artifact",
    geopackageArtifact: "GeoPackage artifact",
    checksum: "SHA-256",
    manifest: "Open the machine-readable release manifest",
    licence: "Licence and attribution",
    attribution:
      "Contains information licensed under the Open Government Licence - Canada. Adapted from Natural Resources Canada, Annual High-resolution forest land cover for Canada (1984-2022). Adapted from Statistics Canada, 2021 Census Province/Territory Cartographic Boundary File, reference date January 1, 2021. These adaptations do not constitute endorsement by Natural Resources Canada or Statistics Canada.",
    stagingTitle: "Technical staging evidence",
    staging:
      "Two source archives have verified byte lengths, ZIP integrity and SHA-256 checksums in a separate local staging area. Quebec attribution is verified from official metadata. A lossless local copy of the two clean Quebec layers is checksum-bound and validated; it is not ingested, immutable, or production data. Profiling found 608 self-intersections in Alberta, so Alberta remains blocked.",
    stagingEvidence: "Review the staged-acquisition evidence",
    profileEvidence: "Review the geospatial profile",
    transformationEvidence: "Review the Quebec transformation evidence",
  },
  fr: {
    title: "Données et transparence",
    accessTitle: "Ce que vous pouvez télécharger",
    accessSummary:
      "Un aperçu technique limité à quatre provinces pour 2020 à 2022 est offert sous forme de tableau CSV et de GeoPackage. Les deux fichiers contiennent les mêmes valeurs au niveau provincial pour la Colombie-Britannique, l’Alberta, l’Ontario et le Québec.",
    notice:
      "Il s’agit de résumés provinciaux destinés à la lecture et à l’analyse. Ils ne constituent ni une géométrie par cellule ni un service de données en direct.",
    csv: "Télécharger les valeurs provinciales (CSV)",
    geopackage: "Télécharger les valeurs provinciales (GeoPackage)",
    comparison: "Comparer les valeurs aux statistiques officielles sur la récolte",
    releases: "Lire les notes de version et le format de citation",
    limitsTitle: "Limites à comprendre d’abord",
    limits:
      "Les quatre provinces comprennent une superficie où un intrant cartographié requis est inconnu; chaque valeur de perte détectée est donc un minimum pour la zone cartographiée connue. Les fichiers n’établissent ni cause, ni responsabilité, ni légalité, ni conformité, ni volume de bois marchand, ni conditions sur le terrain.",
    previewLimits:
      "Cet aperçu technique ne satisfait pas au critère formel de production de la phase 2. Utilisez la catégorie de preuves, l’état de couverture et la raison de confiance affichés avec une affirmation publique; ne prolongez pas un résultat au-delà de l’édition de limite et de la période indiquées.",
    recordsTitle: "Registres des sources et documentation",
    description:
      "Le registre des sources consigne le nom du jeu de données, l’éditeur, la licence, la version, la date de récupération, les limites de couverture et la provenance. Ses exemples demeurent illustratifs et doivent être remplacés par des métadonnées de source vérifiées et des sommes de contrôle d’archives immuables avant toute ingestion de production.",
    ledger: "Ouvrir le registre illustratif des sources",
    docs: "Lire la documentation du registre des sources",
    technicalTitle: "Détails techniques de la version",
    gate:
      "Les identifiants de version, les sommes de contrôle et le libellé du critère sont fournis ici aux fins de vérification. Ils ne modifient pas les limites destinées aux lecteurs ci-dessus.",
    release: "Identifiant de version",
    csvArtifact: "Artefact CSV",
    geopackageArtifact: "Artefact GeoPackage",
    checksum: "SHA-256",
    manifest: "Ouvrir le manifeste de version lisible par machine",
    licence: "Licence et attribution",
    attribution:
      "Contient des informations octroyées sous licence en vertu de la Licence du gouvernement ouvert - Canada. Adapté de Ressources naturelles Canada, Couverture terrestre annuelle à haute résolution des forêts du Canada (1984-2022). Adapté de Statistique Canada, Fichier des limites cartographiques des provinces et territoires du Recensement de 2021, date de référence le 1er janvier 2021. Ces adaptations ne constituent pas une approbation de Ressources naturelles Canada ni de Statistique Canada.",
    stagingTitle: "Preuves techniques de mise en attente",
    staging:
      "Deux archives sources ont une taille en octets, une intégrité ZIP et une somme de contrôle SHA-256 vérifiées dans une zone locale distincte. L’attribution du Québec est vérifiée à partir des métadonnées officielles. Une copie locale sans perte des deux couches québécoises propres est liée par somme de contrôle et validée; elle n’est ni ingérée, ni immuable, ni une donnée de production. Le profilage a relevé 608 auto-intersections en Alberta; l’Alberta demeure donc bloquée.",
    stagingEvidence: "Consulter les preuves de mise en attente",
    profileEvidence: "Consulter le profil géospatial",
    transformationEvidence: "Consulter les preuves de transformation du Québec",
  },
} as const;

export function DataPage({ locale }: Readonly<{ locale: Locale }>) {
  const copy = COPY[locale];
  const [csv, geopackage] = provinceBulkRelease.artifacts;
  return (
    <main id="main" className="page-wrap">
      <header className="masthead">
        <h1>{copy.title}</h1>
      </header>

      <section className="content-section prose-measure">
        <h2>{copy.accessTitle}</h2>
        <p>{copy.accessSummary}</p>
        <p className="notice card--sand"><strong>{copy.notice}</strong></p>
        <ul className="link-list">
          <li className="card card--lift">
            <a className="btn btn--primary" href={csv.url}>{copy.csv}</a>
          </li>
          <li className="card card--lift">
            <a className="btn btn--primary" href={geopackage.url}>{copy.geopackage}</a>
          </li>
          <li className="card card--lift">
            <a href={locale === "en" ? "/en/data/official-harvest-comparison" : "/fr/donnees/comparaison-recolte-officielle"}>
              {copy.comparison}
            </a>
          </li>
          <li className="card card--lift">
            <a href={locale === "en" ? "/en/releases" : "/fr/versions"}>{copy.releases}</a>
          </li>
        </ul>
      </section>

      <aside className="card card--sand prose-measure">
        <h2>{copy.limitsTitle}</h2>
        <p>{copy.limits}</p>
        <p>{copy.previewLimits}</p>
      </aside>

      <SourceCurrency locale={locale} />

      <section className="content-section prose-measure">
        <h2>{copy.recordsTitle}</h2>
        <p>{copy.description}</p>
        <ul className="link-list">
          <li className="card card--lift">
            <a href="https://github.com/chinonsoobeta/Witness_Tree/blob/main/data/source-ledger.json">{copy.ledger}</a>
          </li>
          <li className="card card--lift">
            <a href="https://github.com/chinonsoobeta/Witness_Tree/blob/main/docs/SOURCE_LEDGER.md">{copy.docs}</a>
          </li>
        </ul>
      </section>

      <section className="content-section prose-measure">
        <h2>{copy.technicalTitle}</h2>
        <p>{copy.gate}</p>
        <p>
          <strong>{copy.release}{colon(locale)}</strong>{" "}
          <code>{provinceBulkRelease.id}</code>
        </p>
        <ul className="link-list">
          <li className="card">
            <strong>{copy.csvArtifact}</strong><br />
            <small>{copy.checksum}{colon(locale)} <code>{csv.sha256}</code></small>
          </li>
          <li className="card">
            <strong>{copy.geopackageArtifact}</strong><br />
            <small>{copy.checksum}{colon(locale)} <code>{geopackage.sha256}</code></small>
          </li>
          <li className="card card--lift">
            <a href={provinceBulkManifestUrl}>{copy.manifest}</a>
          </li>
        </ul>
        <h3>{copy.licence}</h3>
        <p>{copy.attribution}</p>
      </section>

      <section className="content-section prose-measure">
        <h2>{copy.stagingTitle}</h2>
        <p>{copy.staging}</p>
        <ul className="link-list">
          <li className="card card--lift">
            <a href="https://github.com/chinonsoobeta/Witness_Tree/blob/main/data/staged-acquisitions.json">{copy.stagingEvidence}</a>
          </li>
          <li className="card card--lift">
            <a href="https://github.com/chinonsoobeta/Witness_Tree/blob/main/data/staged-geospatial-profile.json">{copy.profileEvidence}</a>
          </li>
          <li className="card card--lift">
            <a href="https://github.com/chinonsoobeta/Witness_Tree/blob/main/data/transformation-runs/qc-historic-wildfire-v1-2026-08-12.json">{copy.transformationEvidence}</a>
          </li>
        </ul>
      </section>
    </main>
  );
}
