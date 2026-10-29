import bulkManifest from "@/data/phase8-bulk-download-public-manifest.json";
import bulkPublication from "@/data/bulk-download-publication.json";
import spanRecord from "@/data/phase3-province-span-downloads-release.json";
import { formatNumber, formatYearRangeKey, PRODUCT_NAME, type Locale } from "@/lib/domain";
import {
  PROVINCE_BULK_TIME_RANGE,
  PROVINCE_SPAN_TIME_RANGE,
  provinceBulkRelease,
  provinceSpanRelease,
} from "@/lib/downloads/releases";
import { HARVEST_FIRE_RECORD_RAW_URL, HARVEST_FIRE_ROUTES, type HarvestFireSeries } from "@/lib/harvest-fire";
import { SITE_ORIGIN } from "@/lib/site-metadata";

/*
 * schema.org Dataset records, so dataset search engines can find the downloads.
 *
 * Every URL, checksum and release identifier comes from the same release
 * objects the pages render, and every byte length, licence and source from the
 * release records behind them; tests/structured-data.test.tsx holds the two
 * together. The descriptions carry the preview's limits, because a search
 * result may be the only part of the page a reader sees.
 */

type JsonLd = Readonly<Record<string, unknown>>;

const DATA_ROUTES = { en: "/en/data", fr: "/fr/donnees" } as const;

const PROVINCES = {
  en: ["British Columbia", "Alberta", "Ontario", "Québec"],
  fr: ["Colombie-Britannique", "Alberta", "Ontario", "Québec"],
} as const;

const temporalCoverage = (range: string) => range.replace("-", "/");

/** A media type without parameters, as `encodingFormat` expects. */
const mediaType = (contentType: string) => contentType.split(";")[0].trim();

function download(url: string, contentType: string, sha256: string, byteLength: number): JsonLd {
  return {
    "@type": "DataDownload",
    encodingFormat: mediaType(contentType),
    contentUrl: url,
    contentSize: `${byteLength} B`,
    sha256,
    identifier: `sha256:${sha256}`,
  };
}

const creator = (locale: Locale): JsonLd => ({ "@type": "Organization", name: PRODUCT_NAME[locale], url: SITE_ORIGIN });

const places = (locale: Locale) => PROVINCES[locale].map((name) => ({ "@type": "Place", name }));

/** The two licences the province releases carry, as their publishers' URLs. */
const provinceLicences = () => bulkManifest.licences.map((licence) => licence.url);

const sourceRecord = (source: (typeof bulkManifest.sources)[number]): JsonLd => ({
  "@type": "Dataset",
  name: source.datasetTitle,
  url: source.catalogueUrl,
  creator: { "@type": "Organization", name: source.publisher },
});
/** The NRCan land-cover product and the Statistics Canada boundary file, at their catalogue pages. */
const provinceSources = () => bulkManifest.sources.map(sourceRecord);

const COPY = {
  en: {
    bulkName: `Forest loss by province, ${formatYearRangeKey(PROVINCE_BULK_TIME_RANGE, "en", "span")} (technical preview)`,
    bulkDescription: `A bounded technical preview, not a final release: forest loss detected by satellite in British Columbia, Alberta, Ontario and Québec ${formatYearRangeKey(PROVINCE_BULK_TIME_RANGE, "en", "from")}, one row per province, as CSV and GeoPackage. Every figure is a minimum, because each province has land with no data; that land is Unknown and never counted as zero. The values are province totals, not per-cell geometry, and no expert has reviewed them. They do not show what caused a loss.`,
    spanName: `Forest loss by province for every span of years, ${formatYearRangeKey(PROVINCE_SPAN_TIME_RANGE, "en", "span")} (technical preview)`,
    spanDescription: `A technical preview, not a final release: forest loss detected by satellite in British Columbia, Alberta, Ontario and Québec for every span of years ${formatYearRangeKey(PROVINCE_SPAN_TIME_RANGE, "en", "from")} (${formatNumber(provinceSpanRelease.spanCount, "en")} spans, ${formatNumber(provinceSpanRelease.rowCount, "en")} rows), one row per province per span, as CSV and JSON. Every figure is a minimum, because each province has land with no data in the start year; that land is Unknown and never counted as zero. Yearly losses added together count a place lost twice as two, so they carry no percentage. No expert has reviewed these figures, and they do not show what caused a loss.`,
    harvestName: (range: string) => `Forest cleared by harvest and by fire, by province and year, ${range} (technical preview)`,
    harvestDescription: (range: string) => `A technical preview, not expert reviewed: hectares of forest cleared by harvest and by fire in British Columbia, Alberta, Ontario and Québec each year ${range}, tabulated from Natural Resources Canada's national harvest and wildfire change-year maps, as JSON. A CSV of any selection can be made on the page. Land the land-cover product leaves unmapped is Unknown for every year and never counted as zero, and 1984 has no datable change. Harvest and fire are never added together.`,
  },
  fr: {
    bulkName: `Perte forestière par province, ${formatYearRangeKey(PROVINCE_BULK_TIME_RANGE, "fr", "span")} (aperçu technique)`,
    bulkDescription: `Un aperçu technique limité, et non une version définitive\u202F: la perte forestière détectée par satellite en Colombie-Britannique, en Alberta, en Ontario et au Québec ${formatYearRangeKey(PROVINCE_BULK_TIME_RANGE, "fr", "from")}, une ligne par province, en CSV et en GeoPackage. Chaque chiffre est un minimum, car chaque province compte un territoire sans données\u202F; ce territoire est inconnu et jamais compté comme zéro. Les valeurs sont des totaux provinciaux, et non une géométrie par cellule, et aucun spécialiste ne les a examinées. Elles n’indiquent pas la cause d’une perte.`,
    spanName: `Perte forestière par province pour chaque période, ${formatYearRangeKey(PROVINCE_SPAN_TIME_RANGE, "fr", "span")} (aperçu technique)`,
    spanDescription: `Un aperçu technique, et non une version définitive\u202F: la perte forestière détectée par satellite en Colombie-Britannique, en Alberta, en Ontario et au Québec pour chaque période ${formatYearRangeKey(PROVINCE_SPAN_TIME_RANGE, "fr", "from")} (${formatNumber(provinceSpanRelease.spanCount, "fr")} périodes, ${formatNumber(provinceSpanRelease.rowCount, "fr")} lignes), une ligne par province et par période, en CSV et en JSON. Chaque chiffre est un minimum, car chaque province compte un territoire sans données l’année de départ\u202F; ce territoire est inconnu et jamais compté comme zéro. Les pertes annuelles additionnées comptent deux fois un lieu perdu deux fois\u202F: elles n’ont donc pas de pourcentage. Aucun spécialiste n’a examiné ces chiffres, et ils n’indiquent pas la cause d’une perte.`,
    harvestName: (range: string) => `Forêt récoltée et forêt brûlée, par province et par année, ${range} (aperçu technique)`,
    harvestDescription: (range: string) => `Un aperçu technique, non examiné par des spécialistes\u202F: les hectares de forêt récoltée et de forêt brûlée en Colombie-Britannique, en Alberta, en Ontario et au Québec chaque année ${range}, compilés à partir des cartes nationales des années de récolte et de feu de Ressources naturelles Canada, en JSON. Un CSV de toute sélection peut être créé sur la page. Le territoire que le produit de couverture terrestre ne cartographie pas est inconnu chaque année et jamais compté comme zéro, et 1984 n’a aucun changement datable. La récolte et le feu ne sont jamais additionnés.`,
  },
} as const;

/** The bounded 2020 to 2022 province release, as CSV and GeoPackage. */
export function provinceBulkDataset(locale: Locale): JsonLd {
  const copy = COPY[locale];
  const recorded = bulkPublication.artifacts;
  const [csv, geopackage] = provinceBulkRelease.artifacts;
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: copy.bulkName,
    description: copy.bulkDescription,
    url: `${SITE_ORIGIN}${DATA_ROUTES[locale]}`,
    version: provinceBulkRelease.id,
    datePublished: bulkManifest.releasedDate,
    isAccessibleForFree: true,
    license: provinceLicences(),
    creator: creator(locale),
    spatialCoverage: places(locale),
    temporalCoverage: temporalCoverage(PROVINCE_BULK_TIME_RANGE),
    isBasedOn: provinceSources(),
    distribution: [
      download(csv.url, csv.contentType, csv.sha256, recorded.csv.byteLength),
      download(geopackage.url, geopackage.contentType, geopackage.sha256, recorded.geopackage.byteLength),
    ],
  };
}

/** Every span from 1984 to 2022, as CSV and JSON. */
export function provinceSpanDataset(locale: Locale): JsonLd {
  const copy = COPY[locale];
  const file = (url: string) => spanRecord.files.find((entry) => entry.url === url);
  const distribution = [provinceSpanRelease.csv, provinceSpanRelease.json].flatMap(({ url, sha256 }) => {
    const recorded = file(url);
    return recorded ? [download(url, recorded.contentType, sha256, recorded.byteLength)] : [];
  });
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: copy.spanName,
    description: copy.spanDescription,
    url: `${SITE_ORIGIN}${DATA_ROUTES[locale]}`,
    version: provinceSpanRelease.id,
    datePublished: spanRecord.recordedAt.slice(0, 10),
    isAccessibleForFree: true,
    license: provinceLicences(),
    creator: creator(locale),
    spatialCoverage: places(locale),
    temporalCoverage: temporalCoverage(PROVINCE_SPAN_TIME_RANGE),
    isBasedOn: provinceSources(),
    distribution,
  };
}

/** The provincial annual harvest and fire series, 1985 to 2022. */
export function harvestFireDataset(series: HarvestFireSeries, locale: Locale): JsonLd {
  const copy = COPY[locale];
  const key = `${series.firstYear}-${series.lastYear}`;
  const { harvest, fire } = series.sources;
  // The same 2021 province boundary file the province releases use, under its own licence.
  const boundaries = bulkManifest.sources.filter((source) => series.sources.boundary.includes(source.datasetTitle));
  const boundaryLicences = bulkManifest.licences.filter((licence) => licence.id === "statcan-open-licence" && boundaries.length > 0);
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: copy.harvestName(formatYearRangeKey(key, locale, "span")),
    description: copy.harvestDescription(formatYearRangeKey(key, locale, "from")),
    url: `${SITE_ORIGIN}${HARVEST_FIRE_ROUTES[locale]}`,
    isAccessibleForFree: true,
    license: [series.sources.licenceUrl, ...boundaryLicences.map((licence) => licence.url)],
    creator: creator(locale),
    spatialCoverage: places(locale),
    temporalCoverage: temporalCoverage(key),
    isBasedOn: [
      ...[harvest, fire].map((source) => ({ "@type": "Dataset", name: source.title, url: source.url })),
      ...boundaries.map(sourceRecord),
    ],
    distribution: [{ "@type": "DataDownload", encodingFormat: "application/json", contentUrl: HARVEST_FIRE_RECORD_RAW_URL }],
  };
}

/**
 * The record as a JSON-LD data block. A `<` is escaped so no string in it can
 * close the element; the browser never executes this type, so the page's
 * script policy does not apply to it.
 */
export function StructuredData({ data }: Readonly<{ data: JsonLd | readonly JsonLd[] }>) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
