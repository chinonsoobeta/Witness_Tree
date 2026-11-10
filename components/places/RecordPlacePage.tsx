import type { Metadata } from "next";
import { ConfidenceBadge, ProvenanceBlock, ReportedValue } from "@/components/policy";
import { CoverageStatement } from "@/components/policy/CoverageStatement";
import { EvidenceKey } from "@/components/policy/EvidenceKey";
import { CopyCitation } from "./CopyCitation";
import { EmbedSnippet } from "./EmbedSnippet";
import { colon, formatHectares, formatPercent, type Locale } from "@/lib/domain";
import {
  PLACE_DATA_VERSION,
  placePagePath,
  placeSheetPath,
  placeProvinceName,
  placeReferenceFigures,
  landCoverProvenance,
  type PlacePageRecord,
  type PlaceReference,
} from "@/lib/place-pages";
import { BOUNDARY_OVERLAYS } from "@/lib/explore/boundaries";
import { EXPLORE_MAP_COLOURS, formatUnknownSharePercent } from "@/lib/explore/map-style";
import { EXPLORE_PER_CELL_LAYER, EXPLORE_PER_CELL_SPAN_LAYER } from "@/lib/explore/per-cell";
import { provinceSpanDisplayRows } from "@/lib/explore/province-spans";
import { PLACE_METHOD_VERSION } from "@/lib/place-pages/paths";
import { placeSummary } from "@/lib/place-pages/summary";
import { placeLeadSentence } from "@/lib/place-pages/sentence";
import { yearlyRows } from "@/lib/place-pages/yearly";
import { PlaceYearlyChart } from "./PlaceYearlyChart";
import { PlaceMap } from "./PlaceMap";
import { mapHash, placeMapView } from "@/lib/place-pages/map-view";
import { RECEIPT_SIZE, receiptAlt, receiptPath } from "@/lib/share/meta";
import { localizedAlternates } from "@/lib/site-metadata";
import { embedTitle, oembedDiscoveryPath } from "@/lib/embed/paths";

/**
 * A real place's page: one census subdivision, riding or economic region, and
 * what the 1984 to 2022 record says about its forest.
 *
 * It keeps the illustrative place template's order (identity and coverage
 * first, then the figures, then where they come from and what they cannot
 * say), but every number here comes from a checked-in measurement record, and
 * a share the record cannot support is shown as Unknown with its reason.
 */

export const COPY = {
  en: {
    panel: "What this page can tell you",
    coverage: "Coverage",
    unmapped: "Unmapped share",
    mappedForest: "Forest mapped in 1984",
    note: "Every figure shows its evidence, confidence and source. Unknown is shown as –, never as zero.",
    lead: "Forest lost at least once from 1984 to 2022, as satellites observed it, inside this boundary.",
    minimum: "A minimum: it counts only the part of the forest with satellite data.",
    share: "Share of the forest mapped in 1984",
    evidence: "Evidence",
    confidence: "Confidence",
    boundary: "Boundary",
    edition: "Boundary edition",
    dataVersion: "Data version",
    method: "Method",
    recordFile: "Record",
    provenance: "Where these numbers come from",
    boundarySource: "Boundary source",
    limits: "What these figures can’t tell you",
    limitations: [
      "These are satellite observations, not official records. A 30 m cell counts once if it stopped being forest in any year from 1984 to 2022. This is not net change and says nothing about regrowth.",
      "No cause is attached. Harvest, fire, insects, wind and land clearing all count, and none is implied.",
      "The accuracy of detected loss is Unknown. The publisher’s 70.3% accuracy figure is for the earlier 2005 land-cover map, not for these detections.",
      "Where the source has no satellite data, loss is Unknown, not zero. No data doesn’t mean no forest.",
      "These are preview figures from local records: not expert reviewed, not admitted for production and not a formal release.",
    ],
    readMethod: "Read the method",
    citation: "Cite this page",
    download: "Download this card (PNG, 1200 × 630)",
    sheet: { riding: "Print a one-page sheet for this riding", community: "Print a one-page sheet for this place", region: "Print a one-page sheet for this region" },
    copy: "Copy the citation",
    copied: "Citation copied.",
    copyFailed: "The citation could not be copied. Select it above instead.",
    related: "Related places",
    more: "Sources, limits and how to cite",
    embed: "Embed this figure",
    region: "Economic region",
    federal: "Federal ridings",
    provincial: "Provincial ridings",
    communitiesInRiding: "Communities in this riding",
    communitiesInRegion: "Communities in this region",
    noRiding: "None is recorded.",
    noCommunity: "No published community lies in it.",
    placeShare: (share: string) => `${share} of this place`,
    communityShare: (share: string) => `${share} of the community lies here`,
    compare: "Compare it with another riding (2021–2022 figures)",
    map: "On the map",
    mapLabel: (name: string) => `Map of ${name}: its boundary, with the forest patches satellites detected as lost from 1984 to 2022.`,
    mapOpen: "Open this place on the Explore map",
    mapKey: "Forest detected as lost at least once, 1984–2022, from any cause",
    mapZoomedOut: "This place is too large for its loss patches to show at this size. Open it on the Explore map and zoom in to see them.",
    mapFailed: "The map could not load. The link opens this place on the Explore map.",
    provinceContext: (province: string, share: string, gap: string) => `For comparison, ${province}: ${share} of the forest mapped there in 1984 was lost at least once. ${gap} of the province has no satellite data and is left out of that share.`,
    referenceShare: (share: string) => `${share} of its forest mapped in 1984 lost at least once`,
    referenceAdmitted: (gap: string) => ` (${gap} with no satellite data left out)`,
    referenceMinimum: (lost: string, gap: string) => `At least ${lost} lost. The share is Unknown: ${gap} of its forest has no satellite data.`,
    referenceUnknown: (reason: string) => `Share lost: Unknown. ${reason}`,
    over: "over",
    under: "under",
    code: { "csd-2021": "Census subdivision code", "er-2021": "Economic region code", federal: "Federal electoral district number", provincial: "Electoral district number" },
  },
  fr: {
    panel: "Ce que cette page permet de savoir",
    coverage: "Couverture",
    unmapped: "Part non cartographiée",
    mappedForest: "Forêt cartographiée en 1984",
    note: "Chaque chiffre indique sa preuve, son niveau de confiance et sa source. L’inconnu est indiqué par –, jamais par zéro.",
    lead: "La forêt perdue au moins une fois de 1984 à 2022, telle que les satellites l’ont observée, à l’intérieur de cette limite.",
    minimum: "Un minimum : seule la partie de la forêt couverte par des données satellitaires est comptée.",
    share: "Part de la forêt cartographiée en 1984",
    evidence: "Preuve",
    confidence: "Confiance",
    boundary: "Limite",
    edition: "Édition de la limite",
    dataVersion: "Version des données",
    method: "Méthode",
    recordFile: "Registre",
    provenance: "D’où viennent ces chiffres",
    boundarySource: "Source de la limite",
    limits: "Ce que ces chiffres ne disent pas",
    limitations: [
      "Ce sont des observations satellitaires, et non des registres officiels. Une cellule de 30 m est comptée une fois si elle a cessé d’être de la forêt au cours d’une année de 1984 à 2022. Il ne s’agit pas d’un changement net, et cela ne dit rien de la repousse.",
      "Aucune cause n’est attribuée. La récolte, le feu, les insectes, le vent et le défrichement comptent tous, et aucun n’est sous-entendu.",
      "L’exactitude de la perte détectée est inconnue. Le taux d’exactitude de 70,3 % cité par l’éditeur porte sur la carte de couverture terrestre antérieure de 2005, et non sur ces détections.",
      "Là où la source n’a pas de données satellitaires, la perte est inconnue, et non nulle. L’absence de données ne veut pas dire l’absence de forêt.",
      "Ce sont des chiffres préliminaires tirés de registres locaux : ils n’ont pas été examinés par des experts, ne sont pas admis en production et ne constituent pas une publication officielle.",
    ],
    readMethod: "Lire la méthode",
    citation: "Citer cette page",
    // Draft French for the owner's review (2026-10-29).
    download: "Télécharger cette carte (PNG, 1200 × 630)",
    // Draft French for the owner's review (2026-10-29).
    // The community and region wording is draft French for the owner's review (2026-11-10).
    sheet: { riding: "Imprimer une fiche d’une page pour cette circonscription", community: "Imprimer une fiche d’une page pour ce lieu", region: "Imprimer une fiche d’une page pour cette région" },
    copy: "Copier la citation",
    copied: "Citation copiée.",
    copyFailed: "La citation n’a pas pu être copiée. Sélectionnez-la ci-dessus.",
    related: "Lieux liés",
    // Draft French for the owner's review (2026-11-10).
    more: "Sources, limites et citation",
    embed: "Intégrer ce chiffre",
    region: "Région économique",
    federal: "Circonscriptions fédérales",
    provincial: "Circonscriptions provinciales",
    communitiesInRiding: "Collectivités dans cette circonscription",
    communitiesInRegion: "Collectivités dans cette région",
    noRiding: "Aucune n’est enregistrée.",
    noCommunity: "Aucune collectivité publiée ne s’y trouve.",
    placeShare: (share: string) => `${share} de ce lieu`,
    communityShare: (share: string) => `${share} de la collectivité se trouve ici`,
    compare: "Comparer avec une autre circonscription (chiffres de 2021–2022)",
    // Draft French for the owner's review (2026-11-10).
    map: "Sur la carte",
    mapLabel: (name: string) => `Carte de ${name}\u202F: sa limite, avec les parcelles de forêt que les satellites ont détectées comme perdues de 1984 à 2022.`,
    mapOpen: "Ouvrir ce lieu sur la carte Explorer",
    mapKey: "Forêt détectée comme perdue au moins une fois, 1984–2022, toutes causes confondues",
    mapZoomedOut: "Ce lieu est trop grand pour que ses parcelles perdues s’affichent à cette taille. Ouvrez-le sur la carte Explorer et zoomez pour les voir.",
    mapFailed: "La carte n’a pas pu se charger. Le lien ouvre ce lieu sur la carte Explorer.",
    // Draft French for the owner's review (2026-11-10).
    provinceContext: (province: string, share: string, gap: string) => `À titre de comparaison, ${province}\u202F: ${share} de la forêt cartographiée en 1984 y a été perdue au moins une fois. ${gap} de la province n’a pas de données satellitaires et est exclu de cette part.`,
    referenceShare: (share: string) => `${share} de sa forêt cartographiée en 1984 perdue au moins une fois`,
    referenceAdmitted: (gap: string) => ` (${gap} sans données satellitaires exclu)`,
    referenceMinimum: (lost: string, gap: string) => `Au moins ${lost} perdus. La part est inconnue\u202F: ${gap} de sa forêt n’a pas de données satellitaires.`,
    referenceUnknown: (reason: string) => `Part perdue\u202F: inconnue. ${reason}`,
    over: "plus de",
    under: "moins de",
    code: { "csd-2021": "Code de subdivision de recensement", "er-2021": "Code de région économique", federal: "Numéro de circonscription électorale fédérale", provincial: "Numéro de circonscription électorale" },
  },
} as const;

/** How much of a community lies in a riding, without claiming more precision than the overlay has. */
function shareAmount(share: number, locale: Locale) {
  const text = COPY[locale];
  if (share >= 1) return formatPercent(100, locale);
  if (share > 0.99) return `${text.over} ${formatPercent(99, locale)}`;
  if (share < 0.01) return `${text.under} ${formatPercent(1, locale)}`;
  return formatPercent(Math.max(1, Math.round(share * 100)), locale);
}

/** What the print sheet and its link call this kind of place. */
export function sheetGroup(record: PlacePageRecord): "riding" | "community" | "region" {
  if (record.kind === "community") return "community";
  return record.kind === "economic-region" ? "region" : "riding";
}

export function codeLabel(record: PlacePageRecord, locale: Locale) {
  const labels = COPY[locale].code;
  if (record.geography === "csd-2021" || record.geography === "er-2021") return labels[record.geography];
  return record.kind === "federal-riding" ? labels.federal : labels.provincial;
}

/** The province's own 1984–2022 share, as the home page reports it: of the forest mapped there, with the unmapped share beside it. */
const PROVINCE_ROWS = provinceSpanDisplayRows({ fromYear: 1984, toYear: 2022 });

function provinceContext(record: PlacePageRecord, locale: Locale) {
  const row = PROVINCE_ROWS.find((entry) => entry.code === record.province);
  if (!row || row.unionLossPercent === null) return null;
  return COPY[locale].provinceContext(placeProvinceName(record.province)[locale], formatPercent(row.unionLossPercent, locale), formatUnknownSharePercent(row.unknownSharePercent, locale));
}

/** A linked area's own figure, under the minimum and Unknown rules its own page uses. */
function referenceFigure(item: PlaceReference, locale: Locale) {
  const text = COPY[locale];
  const figures = placeReferenceFigures(item, locale);
  if (!figures) return null;
  if (figures.share.kind === "figure") {
    const admitted = figures.admittedUnknownPercent === undefined ? "" : text.referenceAdmitted(formatUnknownSharePercent(figures.admittedUnknownPercent, locale));
    return `${text.referenceShare(formatPercent(figures.share.value, locale))}${admitted}`;
  }
  if (figures.lostIsMinimum && figures.lost.kind === "figure" && figures.unknownSharePercent !== null) {
    return text.referenceMinimum(formatHectares(figures.lost.value, locale), formatUnknownSharePercent(figures.unknownSharePercent, locale));
  }
  return text.referenceUnknown(figures.share.reason[locale]);
}

function ReferenceList({ items, locale, empty, note, figures = false }: Readonly<{
  items: readonly PlaceReference[];
  locale: Locale;
  empty: string;
  note?: (share: string) => string;
  /** Show each linked area's own figure, for the areas a community sits in. */
  figures?: boolean;
}>) {
  if (items.length === 0) return <p>{empty}</p>;
  return (
    <ul className="place-related">
      {items.map((item) => (
        <li key={`${item.geography}-${item.code}`}>
          <a href={placePagePath(locale, item.geography, item.code)}>{item.name[locale]}</a>
          {item.typeLabel ? <span className="place-related-share">{item.typeLabel[locale]}</span> : null}
          {note && item.share !== undefined ? <span className="place-related-share">{note(shareAmount(item.share, locale))}</span> : null}
          {figures ? <span className="place-related-figure">{referenceFigure(item, locale)}</span> : null}
        </li>
      ))}
    </ul>
  );
}

export function RecordPlacePage({ locale, record }: Readonly<{ locale: Locale; record: PlacePageRecord }>) {
  const text = COPY[locale];
  const summary = placeSummary(record, locale);
  const { figures, name, province, coverage, unmapped, citation } = summary;
  const provenance = landCoverProvenance(locale);
  const exploreHref = `${locale === "en" ? "/en/explore" : "/fr/explorer"}?overlays=${record.exploreOverlay}&from=1984&year=2022${mapHash(placeMapView(record.extent))}`;
  const overlay = BOUNDARY_OVERLAYS[record.exploreOverlay];
  const provinceSentence = provinceContext(record, locale);
  const compareHref = record.compareId ? `${locale === "en" ? "/en/compare" : "/fr/comparer"}?left=${encodeURIComponent(record.compareId)}` : null;

  return (
    <main id="main" className="page-wrap place-record">
      <div className="place-hero">
        <header className="place-identity">
          <p className="eyebrow">{record.typeLabel[locale]} · {province}</p>
          <h1>{name}</h1>
          <p className="place-hero-sentence">{placeLeadSentence(figures, name, locale)}</p>
          <p className="place-hero-lead">{text.lead}</p>
          <p className="place-hero-alias">{codeLabel(record, locale)}{colon(locale)} {record.code}</p>
        </header>

        <CoverageStatement locale={locale} title={text.panel} className="place-hero-panel" variant="panel">
          <ul className="place-coverage-keys">
            <li>
              <span className="place-key-swatch place-key-swatch--national-baseline" aria-hidden="true" />
              <span><strong>{text.coverage}{colon(locale)}</strong> {coverage}</span>
            </li>
            <li className="place-coverage-keys-absent">
              <span className="place-key-swatch place-key-swatch--absent" aria-hidden="true" />
              <span>{text.unmapped}{colon(locale)} {unmapped}</span>
            </li>
            <li>
              <span className="place-key-swatch place-key-swatch--national-baseline" aria-hidden="true" />
              <span>{text.mappedForest}{colon(locale)} {formatHectares(figures.knownForestHectares, locale)}</span>
            </li>
          </ul>
          <p className="place-hero-note">{text.note}</p>
        </CoverageStatement>
      </div>

      <div className="place-evidence-strip">
        <EvidenceKey locale={locale} classes={[figures.lost.evidence, figures.share.evidence]} />
      </div>

      <div className="place-body">
        <div className="place-stat-cards">
          <section className={`place-stat-card place-stat-card--${figures.lost.kind}`}>
            <h2 className="eyebrow">{summary.lostLabel}</h2>
            <ReportedValue reported={figures.lost} coverageGrade="national-baseline" locale={locale} />
            {figures.lostIsMinimum ? <p className="place-stat-minimum">{text.minimum}</p> : null}
          </section>
          <section className={`place-stat-card place-stat-card--${figures.share.kind}`}>
            <h2 className="eyebrow">{text.share}</h2>
            <ReportedValue reported={figures.share} coverageGrade="national-baseline" locale={locale} />
            {provinceSentence ? <p className="place-stat-context">{provinceSentence}</p> : null}
          </section>
        </div>

        <dl className="stat-row">
          <div className="stat">
            <dt>{text.confidence}</dt>
            <dd><ConfidenceBadge confidence={figures.confidence} locale={locale} /> {figures.confidence.reason[locale]}</dd>
          </div>
          <div className="stat">
            <dt>{text.edition}</dt>
            <dd>{record.boundary.edition}</dd>
          </div>
          <div className="stat">
            <dt>{text.dataVersion}</dt>
            <dd>{PLACE_DATA_VERSION}</dd>
          </div>
        </dl>

        {overlay.url && overlay.sourceLayer ? (
          <section className="place-map-section" aria-labelledby="place-map-heading">
            <h2 className="eyebrow" id="place-map-heading">{text.map}</h2>
            <PlaceMap
              extent={record.extent}
              boundary={{ url: overlay.url, sourceLayer: overlay.sourceLayer, featureId: record.mapFeatureId }}
              patches={{
                url: EXPLORE_PER_CELL_SPAN_LAYER.url,
                sourceLayer: EXPLORE_PER_CELL_SPAN_LAYER.sourceLayer,
                yearProperty: EXPLORE_PER_CELL_SPAN_LAYER.yearProperty,
                minZoom: EXPLORE_PER_CELL_SPAN_LAYER.minZoom,
                maxZoom: EXPLORE_PER_CELL_SPAN_LAYER.maxZoom,
              }}
              colours={{ ground: EXPLORE_MAP_COLOURS.ground, outline: EXPLORE_MAP_COLOURS.ink, neighbour: EXPLORE_MAP_COLOURS.observation, patch: EXPLORE_MAP_COLOURS.neither }}
              exploreHref={exploreHref}
              text={{
                label: text.mapLabel(name),
                open: text.mapOpen,
                key: text.mapKey,
                zoomedOut: text.mapZoomedOut,
                failed: text.mapFailed,
                attribution: [overlay.attribution?.[locale], EXPLORE_PER_CELL_LAYER.attribution[locale]].filter(Boolean).join(" "),
              }}
            />
          </section>
        ) : (
          <p className="place-related-links"><a href={exploreHref}>{text.mapOpen}</a></p>
        )}

        {record.yearly ? <PlaceYearlyChart rows={yearlyRows(record.yearly, record.unknownTolerancePercent)} locale={locale} wholeRecordHectares={figures.lost.kind === "figure" ? figures.lost.value : null} /> : null}

        <section className="place-observed place-related-section" aria-labelledby="place-related-heading">
          <h2 className="eyebrow" id="place-related-heading">{text.related}</h2>
          {record.kind === "community" ? (
            <>
              <h3>{text.region}</h3>
              <ReferenceList items={record.region ? [record.region] : []} locale={locale} empty={text.noRiding} figures />
              <h3>{text.federal}</h3>
              <ReferenceList items={record.federal} locale={locale} empty={text.noRiding} note={text.placeShare} figures />
              <h3>{text.provincial}</h3>
              <ReferenceList items={record.provincial} locale={locale} empty={text.noRiding} note={text.placeShare} figures />
            </>
          ) : (
            <>
              <h3>{record.kind === "economic-region" ? text.communitiesInRegion : text.communitiesInRiding}</h3>
              <ReferenceList items={record.communities} locale={locale} empty={text.noCommunity} note={record.kind === "economic-region" ? undefined : text.communityShare} />
            </>
          )}
          {compareHref ? <p className="place-related-links"><a href={compareHref}>{text.compare}</a></p> : null}
        </section>

        {/* Sources, limits, citation and embed code, full width at the foot of
            the page. Each is a closed <details>, so every limitation is one
            click away; without script they open natively, and the print rules
            open them all on paper. */}
        <section className="place-more" aria-labelledby="place-more-heading">
          <h2 className="eyebrow" id="place-more-heading">{text.more}</h2>
          <details className="place-more-item">
            <summary><h3>{text.provenance}</h3></summary>
            <ProvenanceBlock provenance={provenance} locale={locale} />
            <h4 className="place-source-heading">{text.boundarySource}</h4>
            <dl className="provenance">
              <div className="provenance-row"><dt>{text.boundary}</dt><dd>{record.boundary.title[locale]}</dd></div>
              <div className="provenance-row"><dt>{text.edition}</dt><dd>{record.boundary.edition}</dd></div>
              <div className="provenance-row"><dt>{text.dataVersion}</dt><dd>{PLACE_DATA_VERSION}</dd></div>
              <div className="provenance-row"><dt>{text.method}</dt><dd>{PLACE_METHOD_VERSION}</dd></div>
              <div className="provenance-row">
                <dt>{text.recordFile}</dt>
                <dd><a href={`https://github.com/chinonsoobeta/Witness_Tree/blob/main/${record.record}`}>{record.record}</a></dd>
              </div>
            </dl>
          </details>

          <details className="place-more-item place-more-item--caution">
            <summary><h3>{text.limits}</h3></summary>
            <ul className="place-limitations">
              {text.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
            </ul>
            <a href={locale === "en" ? "/en/methods" : "/fr/methodes"}>{text.readMethod}</a>
          </details>

          <details className="place-more-item place-more-cite">
            <summary><h3>{text.citation}</h3></summary>
            <p id="place-citation">{citation}</p>
            <p className="place-share">
              <a href={receiptPath(locale, record)} download={`${PLACE_DATA_VERSION}-${record.geography}-${record.code}-${locale}.png`}>{text.download}</a>
              <a href={placeSheetPath(locale, record.geography, record.code)}>{text.sheet[sheetGroup(record)]}</a>
              <CopyCitation targetId="place-citation" label={text.copy} copied={text.copied} failed={text.copyFailed} />
            </p>
          </details>

          <details className="place-more-item">
            <summary><h3 id="place-embed-heading">{text.embed}</h3></summary>
            <EmbedSnippet locale={locale} place={{ geography: record.geography, code: record.code, name }} />
          </details>
        </section>
      </div>
    </main>
  );
}

/** The page title, description and language pair; indexable, unlike the illustrative examples. */
export function recordPlaceMetadata(locale: Locale, record: PlacePageRecord): Metadata {
  const name = record.name[locale];
  const type = record.typeLabel[locale].toLowerCase();
  const province = placeProvinceName(record.province)[locale];
  const description = locale === "en"
    ? `Forest lost at least once from 1984 to 2022 in ${name}, ${type}, ${province}, as satellites observed it, with its coverage, confidence, source and limitations.`
    : `Forêt perdue au moins une fois de 1984 à 2022 dans ${name}, ${type}, ${province}, selon l’observation satellitaire, avec sa couverture, sa confiance, sa source et ses limites.`;
  const title = `${name} (${record.typeLabel[locale]})`;
  return {
    title,
    description,
    alternates: {
      ...localizedAlternates(locale, {
        en: placePagePath("en", record.geography, record.code),
        fr: placePagePath("fr", record.geography, record.code),
      }),
      // oEmbed discovery, so a CMS given this page's address frames its figure.
      types: { "application/json+oembed": [{ url: oembedDiscoveryPath(locale, record.geography, record.code), title: embedTitle(locale, name) }] },
    },
    // og:image comes from the route's opengraph-image file. The X card names
    // the same image rather than a twitter-image copy of it, which would
    // double the build's 6,092 generated cards for identical bytes.
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: receiptPath(locale, record), alt: receiptAlt(locale), ...RECEIPT_SIZE }],
    },
  };
}
