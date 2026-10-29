import placeRecord from "@/data/place-whole-record-measurements.json";
import placeRegionRecord from "@/data/place-economic-regions.json";
import regionRecord from "@/data/phase3-economic-region-interval-measurements.json";
import ridingRecord from "@/data/phase3-riding-interval-measurements.json";
import ledgerFacts from "@/data/phase1-ledger-facts-2026-09-26.json";
import { localized, type LocalizedString } from "@/lib/domain/localized";
import type { BoundaryOverlayId } from "@/lib/explore/boundaries";
import { intervalWindowIndex } from "@/lib/explore/interval";
import { parseRegionIntervalRelease, REGION_UNKNOWN_TOLERANCE_PERCENT } from "@/lib/explore/region-intervals";
import { parseRidingIntervalRelease } from "@/lib/explore/riding-intervals";
import { COVERED_FEDERAL_DISTRICT_PREFIXES } from "@/lib/comparison/real-adapter";
import type { PlaceProvince } from "@/lib/places/types";
import { displayPlaceName, PLACE_NAME_INDEX, placeTypeLabel } from "@/lib/search/place-names";
import { ridingSearchRow } from "@/lib/search/site-search";
import type { WholeRecordCells } from "./figures";
import { PLACE_DATA_VERSION, PLACE_METHOD_VERSION, type PlaceGeography } from "./paths";

/**
 * Every real place page, built from the checked-in records only.
 *
 * Server-only: it holds the place-name index and the interval tables, so no
 * client module may import it (scripts/check-interval-release.mjs guards the
 * interval tables). A page reads one record from here; search links to pages
 * through ./paths, which holds no data.
 *
 * Federal ridings outside the four provinces are measured in the release but
 * are outside the record's scope, so they get no page, as on Compare and in
 * search.
 */

export { PLACE_DATA_VERSION, PLACE_GEOGRAPHIES, type PlaceGeography } from "./paths";
export { placePagePath, ridingPagePath, communityPagePath, isRidingGeography, ridingSheetPath, RIDING_GEOGRAPHIES } from "./paths";
export { wholeRecordFigures, landCoverProvenance, type WholeRecordCells, type WholeRecordFigures } from "./figures";

export type PlacePageKind = "community" | "federal-riding" | "provincial-riding" | "economic-region";

/** A linked geography: one that holds this page's area, or one this area holds. */
export type PlaceReference = Readonly<{
  geography: PlaceGeography;
  code: string;
  name: LocalizedString;
  /** For a community: what it is, such as "City", since two communities can share a name. */
  typeLabel?: LocalizedString;
  /** For a riding and a community: the share of the community's area inside the riding. */
  share?: number;
}>;

export type PlaceBoundarySource = Readonly<{
  edition: string;
  /** The publisher and product, as the publisher names them. */
  title: LocalizedString;
}>;

export type PlacePageRecord = Readonly<{
  geography: PlaceGeography;
  code: string;
  kind: PlacePageKind;
  name: LocalizedString;
  province: PlaceProvince;
  /** What the area is, such as "City" or "Federal riding". */
  typeLabel: LocalizedString;
  boundary: PlaceBoundarySource;
  /** The checked-in record the figures come from, as a repository path. */
  record: string;
  cells: WholeRecordCells;
  /** Ridings and regions admit an unknown share below 1% (owner decision, 2026-10-03); communities admit none. */
  unknownTolerancePercent: number;
  /** For a community: its economic region and the ridings that hold part of it, largest share first. */
  region: PlaceReference | null;
  federal: readonly PlaceReference[];
  provincial: readonly PlaceReference[];
  /** For a riding or a region: the communities in it. */
  communities: readonly PlaceReference[];
  /** The Explore overlay that draws this kind of area. */
  exploreOverlay: BoundaryOverlayId;
  /** For a federal riding: its Compare selection id. */
  compareId: string | null;
}>;

const PROVINCE_FOR_NUMBER: Readonly<Record<string, PlaceProvince>> = { "59": "BC", "48": "AB", "35": "ON", "24": "QC" };
const PROVINCE_NAMES: Readonly<Record<PlaceProvince, LocalizedString>> = {
  BC: localized("British Columbia", "Colombie-Britannique"),
  AB: localized("Alberta", "Alberta"),
  ON: localized("Ontario", "Ontario"),
  QC: localized("Québec", "Québec"),
};
export const placeProvinceName = (province: PlaceProvince) => PROVINCE_NAMES[province];

const PROVINCIAL_GEOGRAPHY: Readonly<Record<PlaceProvince, PlaceGeography>> = { BC: "bc-2023", AB: "ab-2019", ON: "on-2022", QC: "qc-2026" };
const PROVINCE_OF_GEOGRAPHY = Object.fromEntries(Object.entries(PROVINCIAL_GEOGRAPHY).map(([province, geography]) => [geography, province])) as Record<string, PlaceProvince>;

const WHOLE_RECORD = intervalWindowIndex({ fromYear: 1984, toYear: 2022 });
const EN_DASH = String.fromCharCode(0x2013);

/** Every record a page reads must be measured by the method its address names. */
function assertMethod(value: unknown, label: string) {
  if (value !== PLACE_METHOD_VERSION) throw new Error(`${label} is not measured by ${PLACE_METHOD_VERSION}; its pages would carry the wrong data version.`);
}
assertMethod(placeRecord.methodVersion, "The place record");
assertMethod(regionRecord.methodVersion, "The economic-region record");
for (const jurisdiction of ridingRecord.jurisdictions) assertMethod(jurisdiction.methodVersion, `The ${jurisdiction.jurisdiction} riding record`);
if (placeRegionRecord.builtFrom.sha256 !== regionRecord.regionMapping.sha256) {
  throw new Error("The place-to-region record was not built from the mapping the region figures use.");
}

const boundaryFacts = ledgerFacts.rows["provincial-electoral-boundaries"] as unknown as Readonly<{
  publisher: Readonly<Record<PlaceProvince, string>>;
  datasetTitle: Readonly<Record<PlaceProvince, string>>;
}>;

const BOUNDARIES: Readonly<Record<PlaceGeography, PlaceBoundarySource>> = {
  "csd-2021": {
    edition: placeRecord.boundaryEdition,
    title: localized(
      "Statistics Canada, Census Subdivision Cartographic Boundary File, 2021 Census",
      "Statistique Canada, Fichier des limites cartographiques des subdivisions de recensement du Recensement de 2021",
    ),
  },
  "er-2021": {
    edition: regionRecord.boundaryEdition,
    title: localized(
      "Statistics Canada, Economic Region Digital Boundary File, 2021 Census",
      "Statistique Canada, Fichier des limites numériques des régions économiques du Recensement de 2021",
    ),
  },
  "federal-2023": {
    edition: "fed-2023-representation-order",
    title: localized(
      "Elections Canada, Federal Electoral Districts, 2023 Representation Order",
      "Élections Canada, Circonscriptions électorales fédérales, Décret de représentation de 2023",
    ),
  },
  ...Object.fromEntries((["BC", "AB", "ON", "QC"] as const).map((province) => {
    // An official title is kept as the authority writes it, in both languages.
    const title = `${boundaryFacts.publisher[province]}, ${boundaryFacts.datasetTitle[province]}`;
    const edition = ridingRecord.jurisdictions.find((entry) => entry.jurisdiction === province)!.boundaryEdition;
    return [PROVINCIAL_GEOGRAPHY[province], { edition, title: localized(title, title) }];
  })),
} as Record<PlaceGeography, PlaceBoundarySource>;

const RECORD_PATHS = {
  community: "data/place-whole-record-measurements.json",
  riding: "data/phase3-riding-interval-measurements.json",
  region: "data/phase3-economic-region-interval-measurements.json",
} as const;

const TYPE_LABELS = {
  "federal-riding": localized("Federal riding", "Circonscription fédérale"),
  "provincial-riding": localized("Provincial riding", "Circonscription provinciale"),
  "economic-region": localized("Economic region", "Région économique"),
} as const;

// Statistics Canada writes an economic region with a French form as "English / French",
// and a long dash as two hyphens.
function regionName(boundaryName: string): LocalizedString {
  const [en, fr = en] = boundaryName.split(" / ");
  return localized(en.split("--").join(EN_DASH), fr.split("--").join(EN_DASH));
}

const communityName = (place: (typeof PLACE_NAME_INDEX.places)[number]) =>
  localized(displayPlaceName(place, "en"), displayPlaceName(place, "fr"));

// Communities.
const placeCells = placeRecord.places as unknown as Readonly<Record<string, readonly number[]>>;
const regionOfPlace = new Map<string, string>();
for (const [code, ids] of Object.entries(placeRegionRecord.regions as Readonly<Record<string, readonly string[]>>)) {
  for (const id of ids) {
    if (regionOfPlace.has(id)) throw new Error(`Place ${id} is in two economic regions.`);
    regionOfPlace.set(id, code);
  }
}

// Ridings, in scope only.
const ridings = parseRidingIntervalRelease(ridingRecord).filter((district) =>
  district.jurisdiction !== "CA" || COVERED_FEDERAL_DISTRICT_PREFIXES.some((prefix) => district.boundaryId.startsWith(`CA-${prefix}`)),
);
const ridingGeography = (jurisdiction: string): PlaceGeography =>
  jurisdiction === "CA" ? "federal-2023" : PROVINCIAL_GEOGRAPHY[jurisdiction as PlaceProvince];
const ridingReference = (id: string, share?: number): PlaceReference => {
  const row = ridingSearchRow(id);
  if (!row) throw new Error(`Riding ${id} has no released figure.`);
  const separator = id.indexOf("-");
  return { geography: ridingGeography(id.slice(0, separator)), code: id.slice(separator + 1), name: localized(row.name.en, row.name.fr), ...(share === undefined ? {} : { share }) };
};

// Economic regions.
const regionNames = new Map(regionRecord.regions.map((region) => [region.boundaryId.slice(-4), regionName(region.boundaryName)]));
const regions = parseRegionIntervalRelease(regionRecord);
const regionReference = (code: string): PlaceReference => ({ geography: "er-2021", code, name: regionNames.get(code)! });

const communityType = (place: (typeof PLACE_NAME_INDEX.places)[number]) =>
  localized(placeTypeLabel(place.type, "en"), placeTypeLabel(place.type, "fr"));

// Who holds whom, once.
const communitiesByRiding = new Map<string, PlaceReference[]>();
const communitiesByRegion = new Map<string, PlaceReference[]>();
for (const place of PLACE_NAME_INDEX.places) {
  for (const { id, share } of [...place.federal, ...place.provincial]) {
    const list = communitiesByRiding.get(id) ?? [];
    list.push({ geography: "csd-2021", code: place.id, name: communityName(place), typeLabel: communityType(place), share });
    communitiesByRiding.set(id, list);
  }
  const region = regionOfPlace.get(place.id);
  if (region === undefined) throw new Error(`Place ${place.id} has no economic region.`);
  const list = communitiesByRegion.get(region) ?? [];
  list.push({ geography: "csd-2021", code: place.id, name: communityName(place), typeLabel: communityType(place) });
  communitiesByRegion.set(region, list);
}
const byName = (left: PlaceReference, right: PlaceReference) => left.name.en.localeCompare(right.name.en, "en-CA") || left.code.localeCompare(right.code);
for (const list of [...communitiesByRiding.values(), ...communitiesByRegion.values()]) list.sort(byName);

function buildRecords(): ReadonlyMap<string, PlacePageRecord> {
  const records = new Map<string, PlacePageRecord>();
  const add = (record: PlacePageRecord) => {
    const key = `${record.geography}/${record.code}`;
    if (records.has(key)) throw new Error(`Two place pages share ${key}.`);
    records.set(key, record);
  };

  for (const place of PLACE_NAME_INDEX.places) {
    const row = placeCells[place.id];
    if (!row) throw new Error(`Place ${place.id} has no whole-record figure.`);
    const [union, known, unknownCells, , unmapped] = row;
    add({
      geography: "csd-2021",
      code: place.id,
      kind: "community",
      name: communityName(place),
      province: place.province,
      typeLabel: communityType(place),
      boundary: BOUNDARIES["csd-2021"],
      record: RECORD_PATHS.community,
      cells: { union, known, unknown: Math.max(unknownCells, unmapped) },
      unknownTolerancePercent: 0,
      region: regionReference(regionOfPlace.get(place.id)!),
      federal: place.federal.map(({ id, share }) => ridingReference(id, share)),
      provincial: place.provincial.map(({ id, share }) => ridingReference(id, share)),
      communities: [],
      exploreOverlay: "census-subdivisions",
      compareId: null,
    });
  }

  for (const district of ridings) {
    const federal = district.jurisdiction === "CA";
    const geography = ridingGeography(district.jurisdiction);
    const code = district.boundaryId.slice(district.jurisdiction.length + 1);
    add({
      geography,
      code,
      kind: federal ? "federal-riding" : "provincial-riding",
      name: ridingReference(district.boundaryId).name,
      province: federal ? PROVINCE_FOR_NUMBER[code.slice(0, 2)]! : PROVINCE_OF_GEOGRAPHY[geography]!,
      typeLabel: TYPE_LABELS[federal ? "federal-riding" : "provincial-riding"],
      boundary: BOUNDARIES[geography],
      record: RECORD_PATHS.riding,
      cells: {
        union: district.unionLossCells[WHOLE_RECORD]!,
        known: district.knownForestCellsByStartYear[0]!,
        unknown: Math.max(district.unknownCellsByStartYear[0]!, district.unmappedCells),
      },
      unknownTolerancePercent: REGION_UNKNOWN_TOLERANCE_PERCENT,
      region: null,
      federal: [],
      provincial: [],
      communities: communitiesByRiding.get(district.boundaryId) ?? [],
      exploreOverlay: federal ? "federal-ridings" : "provincial-ridings",
      compareId: federal ? `federal-${code}` : null,
    });
  }

  for (const region of regions) {
    const code = region.boundaryId.slice(-4);
    add({
      geography: "er-2021",
      code,
      kind: "economic-region",
      name: regionNames.get(code)!,
      province: PROVINCE_FOR_NUMBER[code.slice(0, 2)]!,
      typeLabel: TYPE_LABELS["economic-region"],
      boundary: BOUNDARIES["er-2021"],
      record: RECORD_PATHS.region,
      cells: {
        union: region.unionLossCells[WHOLE_RECORD]!,
        known: region.knownForestCellsByStartYear[0]!,
        unknown: Math.max(region.unknownCellsByStartYear[0]!, region.unmappedCells),
      },
      unknownTolerancePercent: REGION_UNKNOWN_TOLERANCE_PERCENT,
      region: null,
      federal: [],
      provincial: [],
      communities: communitiesByRegion.get(code) ?? [],
      exploreOverlay: "economic-regions",
      compareId: null,
    });
  }
  return records;
}

const RECORDS = buildRecords();

export function placePageRecord(dataVersion: string, geography: string, code: string): PlacePageRecord | undefined {
  if (dataVersion !== PLACE_DATA_VERSION) return undefined;
  return RECORDS.get(`${geography}/${code}`);
}

/** Every page, for static generation and the sitemap. */
export function placePageParams(): readonly Readonly<{ dataVersion: string; geography: PlaceGeography; code: string }>[] {
  return [...RECORDS.values()].map(({ geography, code }) => ({ dataVersion: PLACE_DATA_VERSION, geography, code }));
}

export function placePageCounts(): Readonly<Record<PlacePageKind, number>> {
  const counts = { community: 0, "federal-riding": 0, "provincial-riding": 0, "economic-region": 0 };
  for (const record of RECORDS.values()) counts[record.kind] += 1;
  return counts;
}

