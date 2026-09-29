import source from "@/data/place-name-index.json";
import type { Locale, LocalizedString } from "@/lib/domain";
import { PLACE_PROVINCES, type PlaceProvince } from "@/lib/places/types";

/**
 * Reads the checked-in place-name index: every community in British Columbia,
 * Alberta, Ontario and Quebec, with the ridings that hold it.
 *
 * The index names thousands of places, far more than any one search returns, so
 * it stays on the server the way the interval table does: a route searches it
 * and hands the client only the matches. Keeping it out of `lib/search/index.ts`
 * is what keeps it out of the browser bundle, and tests/place-name-index.test.ts
 * fails if either changes.
 *
 * scripts/place_name_index.py builds it on the data drive from the 2021 census
 * subdivisions, the unit the owner accepted for municipalities, cut against the
 * same riding boundaries the released riding figures were measured on. Places
 * are the census subdivisions; reserves, settlements, and treaty or agreement
 * lands are left out (D5 in the plan), and the index records why.
 */

const SCHEMA = "witness-tree/place-name-index/1";
const EDITION_ID = "statcan-2021-census-subdivisions-cbf";
const EXPECTED_PLACES = 2291;
const CLAIMS = {
  admitted: false,
  released: false,
  productionEligible: false,
  externalAction: false,
} as const;
const PROVINCE_FOR_CODE: Readonly<Record<string, PlaceProvince>> = { "59": "BC", "48": "AB", "35": "ON", "24": "QC" };
const EN_DASH = String.fromCharCode(0x2013);
const EM_DASH = String.fromCharCode(0x2014);

/** A riding that holds part of a place, with its share of the place's area in that layer. */
export type PlaceRiding = Readonly<{ id: string; share: number }>;

export type IndexedPlace = Readonly<{
  /** The census subdivision code. */
  id: string;
  /** The name as Statistics Canada writes it. */
  name: string;
  /** The French form, only for the official bilingual names. */
  nameFr: string | null;
  /** The Standard Geographical Classification type code; `placeTypeLabel` names it. */
  type: string;
  province: PlaceProvince;
  /** Largest share first. Empty only where the index records a gap. */
  federal: readonly PlaceRiding[];
  provincial: readonly PlaceRiding[];
}>;

export type PlaceNameIndex = Readonly<{
  places: readonly IndexedPlace[];
  typeLabels: Readonly<Record<string, LocalizedString>>;
  /** The attribution the census boundary licence requires, in both languages. */
  attribution: LocalizedString;
  referenceDate: string;
  /** Type codes the index leaves out, so a search can say why a place is missing. */
  excludedTypes: readonly string[];
  gaps: readonly Readonly<{ id: string; jurisdiction: string }>[];
}>;

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const text = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "" && value === value.trim() && !value.includes(EM_DASH);

const exactClaims = (value: unknown) =>
  object(value) &&
  Object.keys(value).length === 4 &&
  Object.entries(CLAIMS).every(([key, expected]) => value[key] === expected);

const bilingual = (value: unknown): value is LocalizedString =>
  object(value) && text(value.en) && text(value.fr);

function ridings(value: unknown, prefix: string, place: string): readonly PlaceRiding[] {
  if (!Array.isArray(value)) throw new Error(`Place ${place} has an invalid riding list.`);
  const seen = new Set<string>();
  let previous = 1;
  return Object.freeze(
    value.map((entry) => {
      if (
        !Array.isArray(entry) ||
        entry.length !== 2 ||
        typeof entry[0] !== "string" ||
        !entry[0].startsWith(prefix) ||
        entry[0].length === prefix.length ||
        typeof entry[1] !== "number" ||
        !(entry[1] > 0 && entry[1] <= previous) ||
        seen.has(entry[0])
      ) {
        throw new Error(`Place ${place} lists a riding out of order, out of place or out of range.`);
      }
      seen.add(entry[0]);
      previous = entry[1];
      return Object.freeze({ id: entry[0], share: entry[1] });
    }),
  );
}

/**
 * Fails closed before any place reaches a search result.
 *
 * The build step checked all of this against the geometry it measured. Checking
 * again here runs against the bytes that are actually committed, so a truncated
 * or hand-edited file is caught by the code that reads it.
 */
export function parsePlaceNameIndex(value: unknown): PlaceNameIndex {
  if (
    !object(value) ||
    value.schema !== SCHEMA ||
    !exactClaims(value.claims) ||
    !object(value.source) ||
    value.source.editionId !== EDITION_ID ||
    !bilingual(value.source.attribution) ||
    !text(value.source.referenceDate) ||
    !object(value.counts) ||
    value.counts.places !== EXPECTED_PLACES ||
    !Array.isArray(value.places) ||
    value.places.length !== EXPECTED_PLACES ||
    !object(value.typeLabels) ||
    !object(value.exclusions) ||
    !Array.isArray(value.exclusions.types) ||
    !value.exclusions.types.every(text) ||
    !Array.isArray(value.ridingLayers) ||
    !Array.isArray(value.gaps)
  ) {
    throw new Error("The place-name index has an invalid envelope.");
  }

  const typeLabels: Record<string, LocalizedString> = {};
  for (const [code, label] of Object.entries(value.typeLabels)) {
    if (!bilingual(label)) throw new Error(`Place type ${code} has no label in both languages.`);
    typeLabels[code] = Object.freeze({ en: label.en, fr: label.fr });
  }
  const excludedTypes = Object.freeze([...(value.exclusions.types as string[])]);

  const jurisdictionOf = new Map<string, string>();
  for (const layer of value.ridingLayers) {
    if (!object(layer) || !text(layer.id) || !text(layer.jurisdiction)) {
      throw new Error("The place-name index names an invalid riding layer.");
    }
    jurisdictionOf.set(layer.id, layer.jurisdiction);
  }
  const gaps = value.gaps.map((gap) => {
    const jurisdiction = object(gap) && typeof gap.layer === "string" ? jurisdictionOf.get(gap.layer) : undefined;
    if (!object(gap) || !text(gap.id) || jurisdiction === undefined) {
      throw new Error("The place-name index records an invalid gap.");
    }
    return Object.freeze({ id: gap.id, jurisdiction });
  });
  const gapKeys = new Set(gaps.map((gap) => `${gap.id}:${gap.jurisdiction}`));

  const seen = new Set<string>();
  const places = value.places.map((entry): IndexedPlace => {
    if (!object(entry) || typeof entry.id !== "string" || !/^\d{7}$/.test(entry.id) || seen.has(entry.id)) {
      throw new Error("The place-name index lists a place with an invalid or repeated code.");
    }
    const id = entry.id;
    seen.add(id);
    const province = PROVINCE_FOR_CODE[id.slice(0, 2)];
    if (
      province === undefined ||
      entry.province !== province ||
      !(PLACE_PROVINCES as readonly string[]).includes(province) ||
      !text(entry.name) ||
      (entry.nameFr !== undefined && (!text(entry.nameFr) || entry.nameFr === entry.name)) ||
      typeof entry.type !== "string" ||
      !(entry.type in typeLabels) ||
      excludedTypes.includes(entry.type)
    ) {
      throw new Error(`Place ${id} has an invalid name, type or province.`);
    }
    const federal = ridings(entry.federal, `CA-${id.slice(0, 2)}`, id);
    const provincial = ridings(entry.provincial, `${province}-`, id);
    if ((federal.length === 0 && !gapKeys.has(`${id}:CA`)) || (provincial.length === 0 && !gapKeys.has(`${id}:${province}`))) {
      throw new Error(`Place ${id} names no riding in a layer, and the index records no gap for it.`);
    }
    return Object.freeze({
      id,
      name: entry.name,
      nameFr: typeof entry.nameFr === "string" ? entry.nameFr : null,
      type: entry.type,
      province,
      federal,
      provincial,
    });
  });

  return Object.freeze({
    places: Object.freeze(places),
    typeLabels: Object.freeze(typeLabels),
    attribution: Object.freeze({ en: value.source.attribution.en, fr: value.source.attribution.fr }),
    referenceDate: value.source.referenceDate,
    excludedTypes,
    gaps: Object.freeze(gaps),
  });
}

export const PLACE_NAME_INDEX: PlaceNameIndex = parsePlaceNameIndex(source);

const byId = new Map(PLACE_NAME_INDEX.places.map((place) => [place.id, place]));

export function indexedPlace(id: string): IndexedPlace | undefined {
  return byId.get(id);
}

/**
 * The name to show. The French form of an official bilingual name is used in
 * French; Statistics Canada writes the long dash in six Quebec names as two
 * hyphens, and it is shown as an en dash.
 */
export function displayPlaceName(place: Pick<IndexedPlace, "name" | "nameFr">, locale: Locale): string {
  const name = locale === "fr" && place.nameFr !== null ? place.nameFr : place.name;
  return name.split("--").join(EN_DASH);
}

/** The place's type, in the words Statistics Canada uses for it in each language. */
export function placeTypeLabel(type: string, locale: Locale): string {
  const label = PLACE_NAME_INDEX.typeLabels[type];
  if (label === undefined) throw new Error(`Unknown place type ${type}.`);
  return label[locale];
}
