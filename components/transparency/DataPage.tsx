import { CoverageStatement } from "@/components/policy/CoverageStatement";
import { colon, formatYearRangeKey, type Locale } from "@/lib/domain";
import { SourceCurrency } from "./SourceCurrency";
import {
  PROVINCE_BULK_TIME_RANGE,
  PROVINCE_SPAN_TIME_RANGE,
  provinceBulkManifestUrl,
  provinceBulkRelease,
  provinceSpanRelease,
} from "@/lib/downloads/releases";

const COPY = {
  en: {
    title: "Data and transparency",
    accessTitle: "What you can download",
    accessSummary:
      `An early preview of the province figures for ${formatYearRangeKey(PROVINCE_BULK_TIME_RANGE, "en", "span")} is available as a spreadsheet (CSV) and a map file (GeoPackage). Both hold the same figures for British Columbia, Alberta, Ontario and Quebec.`,
    notice:
      "These are province-level summaries, not detailed map shapes or a live data feed.",
    csv: "Download province values (CSV)",
    geopackage: "Download province values (GeoPackage)",
    spanTitle: "Every span, 1984 to 2022",
    spanSummary:
      `Detected forest loss for every span of years ${formatYearRangeKey(PROVINCE_SPAN_TIME_RANGE, "en", "from")} (741 in all), one row per province per span, matching the Explore page. Each row shows the forest at the start, the forest lost at least once and its share, the yearly losses added together, and the land with no data at the start.`,
    spanLimits:
      "Every figure is a minimum, because each province has land with no data in the start year; that land counts as Unknown, never as no loss. The yearly losses added together count a place lost twice as two, so they are in hectares with no percentage. No expert has reviewed these figures, and they don’t say whether harvest or wildfire caused the loss.",
    spanCsv: "Download every span (CSV)",
    spanJson: "Download every span (JSON)",
    spanManifest: "Open the span download manifest",
    comparison: "Compare the values with official harvest statistics",
    harvestVolume: "BC harvest volume and allowable annual cut",
    releases: "Read the release notes and citation format",
    limitsTitle: "Limits to understand first",
    limits:
      "Every province has some land with no data, so every loss figure is a minimum for the mapped area. These files don’t show cause, responsibility, legality, sellable timber or conditions on the ground.",
    previewLimits:
      "This is an early preview, not the formal Phase 2 release. Always read a figure with its evidence label, coverage and confidence, and don’t apply it beyond the boundaries and years it covers.",
    recordsTitle: "Source records and documentation",
    description:
      "The source ledger lists each dataset’s name, publisher, licence, version, download date, coverage and origin. Its entries are still examples, and will be replaced with verified details before real data is loaded.",
    ledger: "Open the example source ledger",
    docs: "Read the source-ledger documentation",
    technicalTitle: "Technical release details",
    gate:
      "Release IDs and checksums, so you can verify the files. They don’t change the limits above.",
    release: "Release identifier",
    csvArtifact: "CSV artifact",
    geopackageArtifact: "GeoPackage artifact",
    checksum: "SHA-256",
    manifest: "Open the machine-readable release manifest",
    licence: "Licence and attribution",
    attribution:
      "Contains information licensed under the Open Government Licence - Canada. Adapted from Natural Resources Canada, Annual High-resolution forest land cover for Canada (1984-2022). Adapted from Statistics Canada, 2021 Census Province/Territory Cartographic Boundary File, reference date January 1, 2021. These adaptations do not constitute endorsement by Natural Resources Canada or Statistics Canada.",
    stagingTitle: "Data being prepared",
    staging:
      "Two source archives have been checked in a separate test area, and Quebec’s attribution was confirmed from official metadata. A verified copy of two Quebec layers exists but is not yet used on the site. Alberta is on hold because checks found 608 self-intersections in Alberta (shapes that cross over themselves).",
    stagingEvidence: "See the archive checks",
    profileEvidence: "See the shape checks",
    transformationEvidence: "See the Quebec conversion record",
  },
  fr: {
    title: "Données et transparence",
    accessTitle: "Ce que vous pouvez télécharger",
    accessSummary:
      `Un aperçu préliminaire des chiffres provinciaux pour ${formatYearRangeKey(PROVINCE_BULK_TIME_RANGE, "fr", "span")} est offert en tableur (CSV) et en fichier cartographique (GeoPackage). Les deux contiennent les mêmes chiffres pour la Colombie-Britannique, l’Alberta, l’Ontario et le Québec.`,
    notice:
      "Il s’agit de résumés provinciaux, et non de formes cartographiques détaillées ni d’un flux de données en direct.",
    csv: "Télécharger les valeurs provinciales (CSV)",
    geopackage: "Télécharger les valeurs provinciales (GeoPackage)",
    spanTitle: "Toutes les périodes, de 1984 à 2022",
    spanSummary:
      `La perte forestière détectée pour chaque période ${formatYearRangeKey(PROVINCE_SPAN_TIME_RANGE, "fr", "from")} (741 au total), une ligne par province et par période, comme sur la page Explorer. Chaque ligne donne la forêt au départ, la forêt perdue au moins une fois et sa part, les pertes annuelles additionnées et le territoire sans données au départ.`,
    spanLimits:
      "Chaque valeur est un minimum, car chaque province compte un territoire sans données l’année de départ; ce territoire est Inconnu, jamais une absence de perte. Les pertes annuelles additionnées comptent deux fois un lieu perdu deux fois : elles sont donc en hectares, sans pourcentage. Aucun spécialiste n’a examiné ces chiffres, et ils n’indiquent pas si la récolte ou un incendie a causé la perte.",
    spanCsv: "Télécharger toutes les périodes (CSV)",
    spanJson: "Télécharger toutes les périodes (JSON)",
    spanManifest: "Ouvrir le manifeste du téléchargement par période",
    comparison: "Comparer les valeurs aux statistiques officielles sur la récolte",
    harvestVolume: "Volume récolté et possibilité annuelle de coupe en C.-B.",
    releases: "Lire les notes de version et le format de citation",
    limitsTitle: "Limites à comprendre d’abord",
    limits:
      "Chaque province compte un territoire sans données; chaque valeur de perte est donc un minimum pour la zone cartographiée. Ces fichiers n’indiquent ni la cause, ni la responsabilité, ni la légalité, ni le bois vendable, ni les conditions sur le terrain.",
    previewLimits:
      "Il s’agit d’un aperçu préliminaire, et non de la version officielle de la phase 2. Lisez toujours un chiffre avec sa catégorie de preuve, sa couverture et sa confiance, et ne l’appliquez pas au-delà des limites et des années qu’il couvre.",
    recordsTitle: "Registres des sources et documentation",
    description:
      "Le registre des sources indique, pour chaque jeu de données, le nom, l’éditeur, la licence, la version, la date de téléchargement, la couverture et l’origine. Ses entrées sont encore des exemples, qui seront remplacés par des détails vérifiés avant le chargement de vraies données.",
    ledger: "Ouvrir le registre d’exemple des sources",
    docs: "Lire la documentation du registre des sources",
    technicalTitle: "Détails techniques de la version",
    gate:
      "Identifiants de version et sommes de contrôle, pour vérifier les fichiers. Ils ne modifient pas les limites ci-dessus.",
    release: "Identifiant de version",
    csvArtifact: "Artefact CSV",
    geopackageArtifact: "Artefact GeoPackage",
    checksum: "SHA-256",
    manifest: "Ouvrir le manifeste de version lisible par machine",
    licence: "Licence et attribution",
    attribution:
      "Contient des informations octroyées sous licence en vertu de la Licence du gouvernement ouvert - Canada. Adapté de Ressources naturelles Canada, Couverture terrestre annuelle à haute résolution des forêts du Canada (1984-2022). Adapté de Statistique Canada, Fichier des limites cartographiques des provinces et territoires du Recensement de 2021, date de référence le 1er janvier 2021. Ces adaptations ne constituent pas une approbation de Ressources naturelles Canada ni de Statistique Canada.",
    stagingTitle: "Données en préparation",
    staging:
      "Deux archives sources ont été vérifiées dans une zone d’essai distincte, et l’attribution du Québec a été confirmée à partir des métadonnées officielles. Une copie vérifiée de deux couches québécoises existe, mais n’est pas encore utilisée sur le site. L’Alberta est en attente, car les vérifications ont relevé 608 auto-intersections (des formes qui se croisent elles-mêmes).",
    stagingEvidence: "Voir les vérifications des archives",
    profileEvidence: "Voir les vérifications des formes",
    transformationEvidence: "Voir le registre de conversion du Québec",
  },
} as const;

export function DataPage({ locale }: Readonly<{ locale: Locale }>) {
  const copy = COPY[locale];
  const [csv, geopackage] = provinceBulkRelease.artifacts;
  return (
    <main id="main" className="page-wrap data-page">
      <header className="masthead">
        <h1>{copy.title}</h1>
      </header>
      <CoverageStatement locale={locale}><p>{copy.limits}</p></CoverageStatement>
      <div className="data-layout">
      <div className="data-reader">

      <section className="content-section prose-measure">
        <h2>{copy.accessTitle}</h2>
        <p>{copy.accessSummary}</p>
        <p className="notice card--sand"><strong>{copy.notice}</strong></p>
        <ul className="link-list">
          <li className="card card--lift file-tile">
            <span className="file-tile-format" aria-hidden="true">CSV</span>
            <span className="file-tile-body">
              <a href={csv.url}>{copy.csv}</a>
            </span>
          </li>
          <li className="card card--lift file-tile">
            <span className="file-tile-format" aria-hidden="true">GPKG</span>
            <span className="file-tile-body">
              <a href={geopackage.url}>{copy.geopackage}</a>
            </span>
          </li>
          <li className="card card--lift">
            <a href={locale === "en" ? "/en/data/official-harvest-comparison" : "/fr/donnees/comparaison-recolte-officielle"}>
              {copy.comparison}
            </a>
          </li>
          <li className="card card--lift">
            <a href={locale === "en" ? "/en/data/bc-harvest-volume" : "/fr/donnees/volume-recolte-bc"}>{copy.harvestVolume}</a>
          </li>
          <li className="card card--lift">
            <a href={locale === "en" ? "/en/releases" : "/fr/versions"}>{copy.releases}</a>
          </li>
        </ul>
      </section>

      <section className="content-section prose-measure">
        <h2>{copy.spanTitle}</h2>
        <p>{copy.spanSummary}</p>
        <p className="notice card--sand">{copy.spanLimits}</p>
        <ul className="link-list">
          <li className="card card--lift file-tile">
            <span className="file-tile-format" aria-hidden="true">CSV</span>
            <span className="file-tile-body">
              <a href={provinceSpanRelease.csv.url}>{copy.spanCsv}</a>
              <small>{copy.checksum}{colon(locale)} <code>{provinceSpanRelease.csv.sha256}</code></small>
            </span>
          </li>
          <li className="card card--lift file-tile">
            <span className="file-tile-format" aria-hidden="true">JSON</span>
            <span className="file-tile-body">
              <a href={provinceSpanRelease.json.url}>{copy.spanJson}</a>
              <small>{copy.checksum}{colon(locale)} <code>{provinceSpanRelease.json.sha256}</code></small>
            </span>
          </li>
          <li className="card card--lift">
            <a href={provinceSpanRelease.manifestUrl}>{copy.spanManifest}</a>
          </li>
        </ul>
      </section>

      <aside className="card card--sand prose-measure">
        <h2>{copy.limitsTitle}</h2>
        <p>{copy.previewLimits}</p>
      </aside>

      <SourceCurrency locale={locale} />
      </div>
      <aside className="data-provenance" aria-label={copy.recordsTitle}>

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
      </aside>
      </div>
    </main>
  );
}
