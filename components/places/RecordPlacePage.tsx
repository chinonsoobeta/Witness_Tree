import type { Metadata } from "next";
import { ConfidenceBadge, ProvenanceBlock, ReportedValue } from "@/components/policy";
import { CoverageStatement } from "@/components/policy/CoverageStatement";
import { EvidenceKey } from "@/components/policy/EvidenceKey";
import { CopyCitation } from "./CopyCitation";
import { colon, formatHectares, formatPercent, type Locale } from "@/lib/domain";
import {
  PLACE_DATA_VERSION,
  placePagePath,
  placeProvinceName,
  landCoverProvenance,
  type PlacePageRecord,
  type PlaceReference,
} from "@/lib/place-pages";
import { PLACE_METHOD_VERSION } from "@/lib/place-pages/paths";
import { placeSummary } from "@/lib/place-pages/summary";
import { RECEIPT_SIZE, receiptAlt, receiptPath } from "@/lib/share/meta";
import { localizedAlternates } from "@/lib/site-metadata";

/**
 * A real place's page: one census subdivision, riding or economic region, and
 * what the 1984 to 2022 record says about its forest.
 *
 * It keeps the illustrative place template's order (identity and coverage
 * first, then the figures, then where they come from and what they cannot
 * say), but every number here comes from a checked-in measurement record, and
 * a share the record cannot support is shown as Unknown with its reason.
 */

const COPY = {
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
    copy: "Copy the citation",
    copied: "Citation copied.",
    copyFailed: "The citation could not be copied. Select it above instead.",
    related: "Related places",
    region: "Economic region",
    federal: "Federal ridings",
    provincial: "Provincial ridings",
    communitiesInRiding: "Communities in this riding",
    communitiesInRegion: "Communities in this region",
    noRiding: "None is recorded.",
    noCommunity: "No published community lies in it.",
    placeShare: (share: string) => `${share} of this place`,
    communityShare: (share: string) => `${share} of the community lies here`,
    explore: "See it on the Explore map",
    compare: "Compare it with another riding (2021–2022 figures)",
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
    copy: "Copier la citation",
    copied: "Citation copiée.",
    copyFailed: "La citation n’a pas pu être copiée. Sélectionnez-la ci-dessus.",
    related: "Lieux liés",
    region: "Région économique",
    federal: "Circonscriptions fédérales",
    provincial: "Circonscriptions provinciales",
    communitiesInRiding: "Collectivités dans cette circonscription",
    communitiesInRegion: "Collectivités dans cette région",
    noRiding: "Aucune n’est enregistrée.",
    noCommunity: "Aucune collectivité publiée ne s’y trouve.",
    placeShare: (share: string) => `${share} de ce lieu`,
    communityShare: (share: string) => `${share} de la collectivité se trouve ici`,
    explore: "Voir sur la carte Explorer",
    compare: "Comparer avec une autre circonscription (chiffres de 2021–2022)",
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

function codeLabel(record: PlacePageRecord, locale: Locale) {
  const labels = COPY[locale].code;
  if (record.geography === "csd-2021" || record.geography === "er-2021") return labels[record.geography];
  return record.kind === "federal-riding" ? labels.federal : labels.provincial;
}

function ReferenceList({ items, locale, empty, note }: Readonly<{
  items: readonly PlaceReference[];
  locale: Locale;
  empty: string;
  note?: (share: string) => string;
}>) {
  if (items.length === 0) return <p>{empty}</p>;
  return (
    <ul className="place-related">
      {items.map((item) => (
        <li key={`${item.geography}-${item.code}`}>
          <a href={placePagePath(locale, item.geography, item.code)}>{item.name[locale]}</a>
          {item.typeLabel ? <span className="place-related-share">{item.typeLabel[locale]}</span> : null}
          {note && item.share !== undefined ? <span className="place-related-share">{note(shareAmount(item.share, locale))}</span> : null}
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
  const exploreHref = `${locale === "en" ? "/en/explore" : "/fr/explorer"}?overlays=${record.exploreOverlay}&from=1984&year=2022`;
  const compareHref = record.compareId ? `${locale === "en" ? "/en/compare" : "/fr/comparer"}?left=${encodeURIComponent(record.compareId)}` : null;

  return (
    <main id="main" className="page-wrap place-record">
      <div className="place-hero">
        <header className="place-identity">
          <p className="eyebrow">{record.typeLabel[locale]} · {province}</p>
          <h1>{name}</h1>
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

        <div className="place-detail">
          <aside className="place-provenance">
            <section className="card place-provenance-card">
              <h2 className="eyebrow">{text.provenance}</h2>
              <ProvenanceBlock provenance={provenance} locale={locale} />
              <h3 className="place-source-heading">{text.boundarySource}</h3>
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
            </section>

            <section className="card place-caution">
              <h2 className="eyebrow">{text.limits}</h2>
              <ul className="place-limitations">
                {text.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
              </ul>
              <a href={locale === "en" ? "/en/methods" : "/fr/methodes"}>{text.readMethod}</a>
            </section>

            <section className="record-citation">
              <h2 className="eyebrow">{text.citation}</h2>
              <p id="place-citation">{citation}</p>
              <p className="place-share">
                <a href={receiptPath(locale, record)} download={`${PLACE_DATA_VERSION}-${record.geography}-${record.code}-${locale}.png`}>{text.download}</a>
                <CopyCitation targetId="place-citation" label={text.copy} copied={text.copied} failed={text.copyFailed} />
              </p>
            </section>
          </aside>

          <section className="place-observed" aria-labelledby="place-related-heading">
            <h2 className="eyebrow" id="place-related-heading">{text.related}</h2>
            {record.kind === "community" ? (
              <>
                <h3>{text.region}</h3>
                <ReferenceList items={record.region ? [record.region] : []} locale={locale} empty={text.noRiding} />
                <h3>{text.federal}</h3>
                <ReferenceList items={record.federal} locale={locale} empty={text.noRiding} note={text.placeShare} />
                <h3>{text.provincial}</h3>
                <ReferenceList items={record.provincial} locale={locale} empty={text.noRiding} note={text.placeShare} />
              </>
            ) : (
              <>
                <h3>{record.kind === "economic-region" ? text.communitiesInRegion : text.communitiesInRiding}</h3>
                <ReferenceList items={record.communities} locale={locale} empty={text.noCommunity} note={record.kind === "economic-region" ? undefined : text.communityShare} />
              </>
            )}
            <p className="place-related-links">
              <a href={exploreHref}>{text.explore}</a>
              {compareHref ? <a href={compareHref}>{text.compare}</a> : null}
            </p>
          </section>
        </div>
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
    alternates: localizedAlternates(locale, {
      en: placePagePath("en", record.geography, record.code),
      fr: placePagePath("fr", record.geography, record.code),
    }),
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
